import type { EngineApi, SaveFileInventoryCatalogue, SaveFileEditOperation } from '$lib/engine';
import { createPersistedWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import type {
	SaveFileEditOrigin,
	SaveFileEditRequest,
	SaveFileEditResult
} from '$lib/pksx/save-file-edit-coordinator';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	bagPendingKeys,
	createSaveFileBagController,
	type SaveFileBagCoordinator
} from './index.svelte';

const firstOrigin = { saveFileId: 'save-1', workspaceId: 'workspace-1' };

function workspace(
	items = [
		{ id: 1, name: 'Potion', quantity: 2, maxQuantity: 99 },
		{ id: 2, name: 'Antidote', quantity: 3, maxQuantity: 99 }
	]
): WorkspaceState {
	return createPersistedWorkspaceState({
		file: {
			id: 'save-1',
			originalFileName: 'public.sav',
			byteLength: 1,
			importedAt: '2026-09-10T10:00:00.000Z',
			updatedAt: '2026-09-10T10:00:00.000Z'
		},
		bytes: new Uint8Array([items.reduce((total, item) => total + item.quantity, 0)]),
		dirty: true,
		automaticBackupCreated: true,
		workspace: {
			summary: {
				saveType: 'SAV3E',
				gameVersion: 'E',
				gameVersionId: 3,
				generation: 3,
				trainerName: 'PUBLIC',
				trainerId: 1,
				playTime: '1:00',
				playedHours: 1,
				playedMinutes: 0,
				partyCount: 0,
				boxCount: 1,
				boxSlotCount: 30
			},
			partySlots: [],
			boxSlots: [],
			saveFile: {
				trainerProfile: {
					trainerName: 'PUBLIC',
					trainerNameSupported: false,
					trainerNameMaxLength: 7,
					trainerNameUnsupportedReason: 'Outside this harness.',
					gender: null,
					genderSupported: false,
					genderUnsupportedReason: 'Outside this harness.',
					trainerId: 1,
					gameVersion: 'E',
					generation: 3
				},
				money: {
					value: null,
					min: 0,
					max: 999_999,
					supported: false,
					unsupportedReason: 'Outside this harness.'
				},
				inventory: {
					supported: true,
					unsupportedReason: null,
					pockets: [
						{
							key: 'Items',
							label: 'Items',
							capacity: 20,
							full: false,
							unsupportedReason: null,
							items
						}
					]
				}
			}
		}
	});
}

const catalogue: SaveFileInventoryCatalogue = {
	supported: true,
	unsupportedReason: null,
	pockets: [
		{
			key: 'Items',
			availableItems: [
				{ id: 1, name: 'Potion', maxQuantity: 99 },
				{ id: 2, name: 'Antidote', maxQuantity: 99 },
				{ id: 3, name: 'Repel', maxQuantity: 99 }
			]
		}
	]
};

function applyOperation(state: WorkspaceState, operation: SaveFileEditOperation) {
	const inventory = state.workspace.saveFile!.inventory;
	const edit = operation.inventory?.[0];
	if (!edit) return state;
	const pocket = inventory.pockets.find((candidate) => candidate.key === edit.pocket)!;
	let items = pocket.items;
	if (edit.kind === 'add') {
		const option = catalogue.pockets[0].availableItems.find((item) => item.id === edit.itemId)!;
		items = [...items, { ...option, quantity: edit.quantity! }];
	} else if (edit.kind === 'set') {
		items = items.map((item) =>
			item.id === edit.itemId ? { ...item, quantity: edit.quantity! } : item
		);
	} else {
		items = items.filter((item) => item.id !== edit.itemId);
	}
	return workspace(items);
}

function harness(
	options: {
		workspace?: WorkspaceState;
		getCatalogue?: EngineApi['getSaveFileInventoryCatalogue'];
	} = {}
) {
	let accepted = options.workspace ?? workspace();
	let origin = firstOrigin;
	let editingUnavailable: { message: string; retrying?: boolean } | null = null;
	const originListeners = new Set<(origin: SaveFileEditOrigin) => void>();
	const results: Array<SaveFileEditResult | Promise<SaveFileEditResult>> = [];
	const pendingKeys = new Set<string>();
	const enqueueEdit = vi.fn((requestOrigin: SaveFileEditOrigin, request: SaveFileEditRequest) => {
		pendingKeys.add(request.key);
		return Promise.resolve(
			results.shift() ??
				({
					ok: true,
					status: 'committed',
					origin: requestOrigin,
					workspace: applyOperation(accepted, request.operation)
				} satisfies SaveFileEditResult)
		).finally(() => pendingKeys.delete(request.key));
	});
	const isPending = vi.fn(
		(requestOrigin: SaveFileEditOrigin, key?: string) =>
			sameOrigin(requestOrigin, origin) && (key ? pendingKeys.has(key) : pendingKeys.size > 0)
	);
	const coordinator: SaveFileBagCoordinator = { enqueueEdit, isPending };
	const getSaveFileInventoryCatalogue = vi.fn<EngineApi['getSaveFileInventoryCatalogue']>(
		options.getCatalogue ??
			(async () => ({
				ok: true as const,
				value: catalogue,
				error: null
			}))
	);
	const acceptWorkspace = vi.fn((next: WorkspaceState) => {
		accepted = next;
	});
	const rejectEditing = vi.fn((message: string) => {
		editingUnavailable = { message };
	});
	const toast = { error: vi.fn() };
	const controller = createSaveFileBagController({
		getWorkspace: () => accepted,
		getOrigin: () => origin,
		subscribeOrigin: (listener) => {
			originListeners.add(listener);
			listener(origin);
			return () => originListeners.delete(listener);
		},
		coordinator,
		engine: { getSaveFileInventoryCatalogue },
		toast,
		acceptWorkspace,
		getEditingUnavailable: () => editingUnavailable,
		rejectEditing
	});
	return {
		controller,
		enqueueEdit,
		results,
		toast,
		acceptWorkspace,
		rejectEditing,
		get accepted() {
			return accepted;
		},
		setOrigin(next: SaveFileEditOrigin) {
			origin = next;
			for (const listener of originListeners) listener(next);
		},
		setWorkspace(next: WorkspaceState) {
			accepted = next;
		},
		setEditingUnavailable(next: { message: string; retrying?: boolean } | null) {
			editingUnavailable = next;
		}
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => (resolve = next));
	return { promise, resolve };
}

async function settled() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

function sameOrigin(left: SaveFileEditOrigin, right: SaveFileEditOrigin) {
	return left.saveFileId === right.saveFileId && left.workspaceId === right.workspaceId;
}

describe('Save File Bag controller', () => {
	beforeEach(() => vi.restoreAllMocks());

	test('holds Add Item as one command and commits item plus quantity atomically', async () => {
		const { controller, enqueueEdit } = harness();
		await settled();
		const command = {
			kind: 'add-item' as const,
			pocketKey: 'Items',
			itemId: 3,
			quantity: '7'
		};
		controller.ledgerProps.onCommandChange?.(command);
		expect(controller.ledgerProps.command).toEqual(command);

		controller.ledgerProps.onAddItem?.(command);
		expect(enqueueEdit).toHaveBeenCalledOnce();
		expect(enqueueEdit).toHaveBeenCalledWith(firstOrigin, {
			key: bagPendingKeys.add('Items'),
			operation: {
				inventory: [{ kind: 'add', pocket: 'Items', itemId: 3, quantity: 7 }]
			}
		});
		await settled();
		expect(controller.ledgerProps.command).toBeNull();
	});

	test('commits typed quantity and consumes a valid operator draft in one operation', async () => {
		const { controller, enqueueEdit } = harness();
		await settled();

		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '9');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		expect(enqueueEdit).toHaveBeenLastCalledWith(firstOrigin, {
			key: bagPendingKeys.quantity('Items', 1),
			operation: { inventory: [{ kind: 'set', pocket: 'Items', itemId: 1, quantity: 9 }] }
		});
		await settled();

		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '12');
		expect(controller.ledgerProps.onItemQuantityStep?.('Items', 1, 1, '12')).toBe(true);
		expect(enqueueEdit).toHaveBeenCalledTimes(2);
		expect(enqueueEdit).toHaveBeenLastCalledWith(firstOrigin, {
			key: bagPendingKeys.quantity('Items', 1),
			operation: { inventory: [{ kind: 'set', pocket: 'Items', itemId: 1, quantity: 13 }] }
		});
		await settled();
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toBeUndefined();
	});

	test('does not enqueue blur again after Enter starts the same quantity edit', async () => {
		const pending = deferred<SaveFileEditResult>();
		const { controller, enqueueEdit, results, toast } = harness();
		await settled();
		results.push(pending.promise);
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '7');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'blur');
		expect(controller.ledgerProps.onItemQuantityStep?.('Items', 1, 1, '7')).toBe(false);
		expect(enqueueEdit).toHaveBeenCalledOnce();
		expect(toast.error).not.toHaveBeenCalled();

		pending.resolve({
			ok: true,
			status: 'committed',
			origin: firstOrigin,
			workspace: workspace([
				{ id: 1, name: 'Potion', quantity: 7, maxQuantity: 99 },
				{ id: 2, name: 'Antidote', quantity: 3, maxQuantity: 99 }
			])
		});
		await settled();
		expect(toast.error).not.toHaveBeenCalled();
	});

	test('keeps invalid quantity local and restores the accepted value on blur or abandon', async () => {
		const { controller, enqueueEdit } = harness();
		await settled();

		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '1.5');
		expect(controller.ledgerProps.onItemQuantityStep?.('Items', 1, 1, '1.5')).toBe(false);
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toEqual({
			value: '1.5',
			error: 'Quantity must be a whole number between 1 and 99.'
		});
		expect(enqueueEdit).not.toHaveBeenCalled();

		controller.ledgerProps.onItemQuantityAbandon?.('Items', 1);
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toEqual({
			value: '2',
			error: 'Quantity must be a whole number between 1 and 99.'
		});
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '0');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'blur');
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toEqual({
			value: '2',
			error: 'Quantity must be a whole number between 1 and 99.'
		});
		expect(enqueueEdit).not.toHaveBeenCalled();
	});

	test('treats accepted quantity as a local no-op', async () => {
		const { controller, enqueueEdit } = harness();
		await settled();
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '2');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		expect(enqueueEdit).not.toHaveBeenCalled();
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toBeUndefined();
	});

	test('keeps one command open and commits only confirmed removal', async () => {
		const { controller, enqueueEdit } = harness();
		await settled();
		const remove = { kind: 'remove-item' as const, pocketKey: 'Items', itemId: 1 };
		controller.ledgerProps.onCommandChange?.(remove);
		controller.ledgerProps.onCommandChange?.({
			kind: 'add-item',
			pocketKey: 'Items',
			itemId: null,
			quantity: '1'
		});
		expect(controller.ledgerProps.command?.kind).toBe('add-item');
		controller.ledgerProps.onCommandChange?.(null);
		expect(enqueueEdit).not.toHaveBeenCalled();

		controller.ledgerProps.onCommandChange?.(remove);
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, 'invalid');
		controller.ledgerProps.onRemoveItem?.(remove);
		expect(enqueueEdit).toHaveBeenCalledWith(firstOrigin, {
			key: bagPendingKeys.remove('Items', 1),
			operation: { inventory: [{ kind: 'remove', pocket: 'Items', itemId: 1 }] }
		});
		await settled();
		expect(controller.ledgerProps.command).toBeNull();
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toBeUndefined();
	});

	test('retains a failed Add for retry while open and keeps later command edits independent', async () => {
		const { controller, enqueueEdit, results, toast, accepted } = harness();
		await settled();
		const command = {
			kind: 'add-item' as const,
			pocketKey: 'Items',
			itemId: 3,
			quantity: '7'
		};
		results.push({
			ok: false,
			status: 'failed',
			origin: firstOrigin,
			code: 'engine-unavailable',
			message: 'Engine stopped.',
			workspace: accepted
		});
		controller.ledgerProps.onCommandChange?.(command);
		controller.ledgerProps.onAddItem?.(command);
		await settled();
		expect(controller.ledgerProps.command).toEqual(command);
		expect(toast.error).toHaveBeenCalledWith('Repel could not be saved. Engine stopped.');

		controller.ledgerProps.onAddItem?.(command);
		controller.ledgerProps.onCommandChange?.({ ...command, quantity: '8' });
		await settled();
		expect(controller.ledgerProps.command).toEqual({
			...command,
			quantity: '8',
			quantityError: null
		});
		expect(enqueueEdit).toHaveBeenCalledTimes(2);
	});

	test('maps Engine quantity rejection to the local field error without a Toast', async () => {
		const { controller, enqueueEdit, results, toast, accepted } = harness();
		await settled();
		results.push({
			ok: false,
			status: 'rejected',
			origin: firstOrigin,
			code: 'invalid-save-file-edit',
			message: 'The quantity is invalid.',
			workspace: accepted
		});
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '7');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		await settled();
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toEqual({
			value: '7',
			error: 'The quantity is invalid.'
		});
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'blur');
		expect(enqueueEdit).toHaveBeenCalledTimes(1);
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toEqual({
			value: '2',
			error: 'The quantity is invalid.'
		});
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '8');
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toEqual({
			value: '8',
			error: null
		});
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'blur');
		expect(enqueueEdit).toHaveBeenCalledTimes(2);
		await settled();
		expect(controller.ledgerProps.drafts?.itemQuantities?.['Items:1']).toBeUndefined();
		expect(toast.error).not.toHaveBeenCalled();
	});

	test('associates Engine Add and Remove rejection with their confirmation controls', async () => {
		const { controller, results, toast, accepted } = harness();
		await settled();
		const add = {
			kind: 'add-item' as const,
			pocketKey: 'Items',
			itemId: 3,
			quantity: '2'
		};
		const invalidQuantity = { ...add, quantity: '' };
		controller.ledgerProps.onCommandChange?.(invalidQuantity);
		controller.ledgerProps.onAddItem?.(invalidQuantity);
		expect(controller.ledgerProps.command).toEqual({
			...invalidQuantity,
			quantityError: 'Quantity must be a whole number between 1 and 99.'
		});
		expect(controller.ledgerProps.errors).toEqual({});
		controller.ledgerProps.onCommandChange?.(add);
		results.push({
			ok: false,
			status: 'rejected',
			origin: firstOrigin,
			code: 'invalid-save-file-edit',
			message: 'This item cannot be added.',
			workspace: accepted
		});
		const corrected = controller.ledgerProps.command as typeof add;
		controller.ledgerProps.onAddItem?.(corrected);
		await settled();
		expect(controller.ledgerProps.command).toEqual({ ...add, quantityError: null });
		expect(controller.ledgerProps.errors).toEqual({
			[bagPendingKeys.add('Items')]: 'This item cannot be added.'
		});

		const remove = { kind: 'remove-item' as const, pocketKey: 'Items', itemId: 1 };
		controller.ledgerProps.onCommandChange?.(remove);
		expect(controller.ledgerProps.errors).toEqual({});
		results.push({
			ok: false,
			status: 'rejected',
			origin: firstOrigin,
			code: 'invalid-save-file-edit',
			message: 'This item cannot be removed.',
			workspace: accepted
		});
		controller.ledgerProps.onRemoveItem?.(remove);
		await settled();
		expect(controller.ledgerProps.command).toEqual(remove);
		expect(controller.ledgerProps.errors).toEqual({
			[bagPendingKeys.remove('Items', 1)]: 'This item cannot be removed.'
		});
		expect(toast.error).not.toHaveBeenCalled();
	});

	test('discards old-origin drafts and ignores a late result after Retry replaces the origin', async () => {
		const pending = deferred<SaveFileEditResult>();
		const { controller, results, acceptWorkspace, rejectEditing, setOrigin, setWorkspace } =
			harness();
		await settled();
		results.push(pending.promise);
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '8');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		controller.ledgerProps.onCommandChange?.({
			kind: 'remove-item',
			pocketKey: 'Items',
			itemId: 2
		});
		const replacement = workspace([{ id: 3, name: 'Repel', quantity: 4, maxQuantity: 99 }]);
		setWorkspace(replacement);
		setOrigin({ saveFileId: 'save-1', workspaceId: 'workspace-2' });
		expect(controller.ledgerProps.command).toBeNull();
		expect(controller.ledgerProps.drafts?.itemQuantities).toEqual({});

		pending.resolve({
			ok: false,
			status: 'rejected',
			origin: firstOrigin,
			code: 'stale-workspace',
			message: 'Old Workspace.'
		});
		await settled();
		expect(acceptWorkspace).not.toHaveBeenCalled();
		expect(rejectEditing).not.toHaveBeenCalled();
	});

	test('restores the accepted Bag view when the shared session becomes unavailable', async () => {
		const { controller, results, rejectEditing } = harness();
		await settled();
		results.push({
			ok: false,
			status: 'rejected',
			origin: firstOrigin,
			code: 'stale-workspace',
			message: 'Reload the Save File.'
		});
		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '8');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		controller.ledgerProps.onCommandChange?.({
			kind: 'remove-item',
			pocketKey: 'Items',
			itemId: 2
		});
		await settled();

		expect(rejectEditing).toHaveBeenCalledWith('Reload the Save File.');
		expect(controller.ledgerProps.command).toBeNull();
		expect(controller.ledgerProps.drafts?.itemQuantities).toEqual({});
		expect(controller.ledgerProps.errors).toEqual({});
	});

	test('isolates catalogue failure and preserves Retry identity while reloading', async () => {
		const retry = deferred<Awaited<ReturnType<EngineApi['getSaveFileInventoryCatalogue']>>>();
		const getCatalogue = vi
			.fn<EngineApi['getSaveFileInventoryCatalogue']>()
			.mockResolvedValueOnce({
				ok: false,
				value: null,
				error: { code: 'engine-unavailable', message: 'Catalogue unavailable.' }
			})
			.mockImplementationOnce(() => retry.promise);
		const { controller, enqueueEdit } = harness({ getCatalogue });
		await settled();
		expect(controller.ledgerProps.catalogues?.Items).toEqual({
			status: 'failed',
			message: 'Catalogue unavailable.'
		});

		controller.ledgerProps.onItemQuantityInput?.('Items', 1, '5');
		controller.ledgerProps.onItemQuantityCommit?.('Items', 1, 'enter');
		expect(enqueueEdit).toHaveBeenCalledOnce();
		controller.ledgerProps.onRetryCatalogue?.('Items');
		expect(controller.ledgerProps.catalogues?.Items).toEqual({
			status: 'loading',
			retrying: true
		});
		retry.resolve({ ok: true, value: catalogue, error: null });
		await settled();
		expect(controller.ledgerProps.catalogues?.Items).toEqual({
			status: 'ready',
			availableItems: catalogue.pockets[0].availableItems
		});
	});

	test('rejects Add locally for a full pocket and blocks edits during a route outage', async () => {
		const full = workspace();
		full.workspace.saveFile!.inventory.pockets[0].full = true;
		const { controller, enqueueEdit, setEditingUnavailable } = harness({ workspace: full });
		await settled();
		const command = {
			kind: 'add-item' as const,
			pocketKey: 'Items',
			itemId: 3,
			quantity: '1'
		};
		controller.ledgerProps.onCommandChange?.(command);
		controller.ledgerProps.onAddItem?.(command);
		expect(controller.ledgerProps.command).toEqual(command);
		expect(controller.ledgerProps.errors).toEqual({
			[bagPendingKeys.add('Items')]: 'This pocket has no room for another item.'
		});
		expect(enqueueEdit).not.toHaveBeenCalled();

		setEditingUnavailable({ message: 'Editing is unavailable.' });
		expect(controller.ledgerProps.command).toBeNull();
		expect(controller.ledgerProps.errors).toEqual({});
		expect(controller.ledgerProps.drafts?.itemQuantities).toEqual({});
		expect(controller.ledgerProps.onItemQuantityStep?.('Items', 1, 1, '2')).toBe(false);
		controller.ledgerProps.onRemoveItem?.({
			kind: 'remove-item',
			pocketKey: 'Items',
			itemId: 1
		});
		expect(enqueueEdit).not.toHaveBeenCalled();
	});
});
