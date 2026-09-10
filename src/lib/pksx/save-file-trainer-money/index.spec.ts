import type { SaveFileEditOperation } from '$lib/engine';
import { createPersistedWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import type {
	PendingSaveFileEdit,
	SaveFileEditOrigin,
	SaveFileEditRequest,
	SaveFileEditResult
} from '$lib/pksx/save-file-edit-coordinator';
import { describe, expect, test, vi } from 'vitest';
import {
	createSaveFileTrainerMoneyController,
	trainerMoneyPendingKeys,
	type SaveFileTrainerMoneyCoordinator
} from './index.svelte';

function workspace(
	options: {
		name?: string;
		gender?: 'male' | 'female';
		money?: number;
		byte?: number;
	} = {}
): WorkspaceState {
	const name = options.name ?? 'RED';
	const money = options.money ?? 100;
	return createPersistedWorkspaceState({
		file: {
			id: 'save-1',
			originalFileName: 'public.sav',
			byteLength: 1,
			importedAt: '2026-09-10T10:00:00.000Z',
			updatedAt: '2026-09-10T10:00:00.000Z'
		},
		bytes: new Uint8Array([options.byte ?? 1]),
		dirty: options.byte !== undefined,
		automaticBackupCreated: options.byte !== undefined,
		workspace: {
			summary: {
				saveType: 'SAV3E',
				gameVersion: 'E',
				gameVersionId: 3,
				generation: 3,
				trainerName: name,
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
					trainerName: name,
					trainerNameSupported: true,
					trainerNameMaxLength: 7,
					trainerNameUnsupportedReason: null,
					gender: options.gender ?? 'male',
					genderSupported: true,
					genderUnsupportedReason: null,
					trainerId: 1,
					gameVersion: 'E',
					generation: 3
				},
				money: {
					value: money,
					min: 0,
					max: 999_999,
					supported: true,
					unsupportedReason: null
				},
				inventory: { supported: false, unsupportedReason: null, pockets: [] }
			}
		}
	});
}

function createCoordinator() {
	const origin = { saveFileId: 'save-1', workspaceId: 'workspace-1' };
	const pending: PendingSaveFileEdit[] = [];
	const listeners = new Set<(value: readonly PendingSaveFileEdit[]) => void>();
	const results: Array<Promise<SaveFileEditResult> | SaveFileEditResult> = [];
	let sequence = 0;
	const enqueueEdit = vi.fn((requestOrigin: SaveFileEditOrigin, request: SaveFileEditRequest) => {
		const pendingEdit = { key: request.key, sequence: ++sequence };
		pending.push(pendingEdit);
		for (const listener of listeners) listener([...pending]);
		const fallback: SaveFileEditResult = {
			ok: true,
			status: 'committed',
			origin: requestOrigin,
			workspace: applyOperation(workspace(), request.operation)
		};
		const result = Promise.resolve(results.shift() ?? fallback);
		return result.finally(() => {
			pending.splice(pending.indexOf(pendingEdit), 1);
			for (const listener of listeners) listener([...pending]);
		});
	});
	const replaceWorkspace = vi.fn(() => ({ ...origin, workspaceId: `workspace-${++sequence}` }));
	const coordinator: SaveFileTrainerMoneyCoordinator = {
		openWorkspace: vi.fn(() => origin),
		replaceWorkspace,
		listPending: vi.fn(() => [...pending]),
		isPending: vi.fn((_origin, key) =>
			key === undefined ? pending.length > 0 : pending.some((edit) => edit.key === key)
		),
		subscribePending: vi.fn((_origin, listener) => {
			listeners.add(listener);
			listener([...pending]);
			return () => listeners.delete(listener);
		}),
		enqueueEdit
	};
	return { coordinator, enqueueEdit, pending, results, replaceWorkspace };
}

function controller(
	input: {
		state?: WorkspaceState;
		reload?: () => Promise<WorkspaceState | null>;
	} = {}
) {
	const harness = createCoordinator();
	const toast = { error: vi.fn() };
	const value = createSaveFileTrainerMoneyController({
		workspace: input.state ?? workspace(),
		activeBox: 0,
		coordinator: harness.coordinator,
		toast,
		reloadWorkspace: input.reload ?? (async () => workspace())
	});
	return { value, toast, ...harness };
}

async function settled() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

describe('Save File Trainer and Money controller', () => {
	test('keeps invalid Trainer drafts local and restores them on blur or abandon', () => {
		const { value, enqueueEdit } = controller();
		value.ledgerProps.onTrainerNameInput?.('');
		value.ledgerProps.onTrainerNameCommit?.('enter');
		expect(value.ledgerProps.drafts?.trainerName).toEqual({
			value: '',
			error: 'Trainer name must be between 1 and 7 characters.'
		});
		expect(enqueueEdit).not.toHaveBeenCalled();

		value.ledgerProps.onTrainerNameAbandon?.();
		expect(value.ledgerProps.drafts?.trainerName).toEqual({
			value: 'RED',
			error: 'Trainer name must be between 1 and 7 characters.'
		});

		value.ledgerProps.onTrainerNameInput?.('TOO-LONG');
		value.ledgerProps.onTrainerNameCommit?.('blur');
		expect(value.ledgerProps.drafts?.trainerName).toEqual({
			value: 'RED',
			error: 'Trainer name must be between 1 and 7 characters.'
		});
	});

	test('commits normalized name, immediate gender, and strict Money boundaries', async () => {
		const { value, enqueueEdit } = controller();
		value.ledgerProps.onTrainerNameInput?.(' BLUE ');
		value.ledgerProps.onTrainerNameCommit?.('enter');
		expect(enqueueEdit).toHaveBeenLastCalledWith(value.origin, {
			key: trainerMoneyPendingKeys.trainerName,
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});
		await settled();

		value.ledgerProps.onTrainerGenderSelect?.('female');
		expect(enqueueEdit).toHaveBeenLastCalledWith(value.origin, {
			key: trainerMoneyPendingKeys.trainerGenderFemale,
			operation: { trainerProfile: { gender: 'female' } }
		});
		await settled();

		value.ledgerProps.onMoneyInput?.('10.5');
		value.ledgerProps.onMoneyCommit?.('enter');
		expect(value.ledgerProps.drafts?.money?.value).toBe('10.5');
		expect(value.ledgerProps.drafts?.money?.error).toMatch('Money must be a whole number');
		expect(enqueueEdit).toHaveBeenCalledTimes(2);

		value.ledgerProps.onMoneyCommit?.('blur');
		expect(value.ledgerProps.drafts?.money?.value).toBe('100');
		expect(enqueueEdit).toHaveBeenCalledTimes(2);
	});

	test('commits changed Trainer and Money values on valid blur', async () => {
		const name = controller();
		name.value.ledgerProps.onTrainerNameInput?.('BLUE');
		name.value.ledgerProps.onTrainerNameCommit?.('blur');
		expect(name.enqueueEdit).toHaveBeenCalledWith(name.value.origin, {
			key: trainerMoneyPendingKeys.trainerName,
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});
		await settled();

		const money = controller();
		money.value.ledgerProps.onMoneyInput?.('222');
		money.value.ledgerProps.onMoneyCommit?.('blur');
		expect(money.enqueueEdit).toHaveBeenCalledWith(money.value.origin, {
			key: trainerMoneyPendingKeys.money,
			operation: { money: 222 }
		});
	});

	test('blocks duplicate commits and treats Trainer gender as one pending control', async () => {
		let finishName!: (result: SaveFileEditResult) => void;
		const name = controller();
		name.results.push(new Promise((resolve) => (finishName = resolve)));
		name.value.ledgerProps.onTrainerNameInput?.('BLUE');
		name.value.ledgerProps.onTrainerNameCommit?.('enter');
		name.value.ledgerProps.onTrainerNameCommit?.('blur');
		expect(name.enqueueEdit).toHaveBeenCalledOnce();
		finishName({
			ok: true,
			status: 'committed',
			origin: name.value.origin,
			workspace: workspace({ name: 'BLUE' })
		});
		await settled();

		let finishMoney!: (result: SaveFileEditResult) => void;
		const money = controller();
		money.results.push(new Promise((resolve) => (finishMoney = resolve)));
		money.value.ledgerProps.onMoneyInput?.('200');
		money.value.ledgerProps.onMoneyCommit?.('enter');
		money.value.ledgerProps.onMoneyCommit?.('blur');
		expect(money.value.ledgerProps.onMoneyStep?.(1, '200')).toBe(false);
		expect(money.enqueueEdit).toHaveBeenCalledOnce();
		finishMoney({
			ok: true,
			status: 'committed',
			origin: money.value.origin,
			workspace: workspace({ money: 200 })
		});
		await settled();

		let finishGender!: (result: SaveFileEditResult) => void;
		const gender = controller();
		gender.results.push(new Promise((resolve) => (finishGender = resolve)));
		gender.value.ledgerProps.onTrainerGenderSelect?.('female');
		gender.value.ledgerProps.onTrainerGenderSelect?.('male');
		expect(gender.enqueueEdit).toHaveBeenCalledOnce();
		finishGender({
			ok: true,
			status: 'committed',
			origin: gender.value.origin,
			workspace: workspace({ gender: 'female' })
		});
		await settled();
		expect(gender.value.workspace.workspace.saveFile?.trainerProfile.gender).toBe('female');
	});

	test('consumes a valid Money draft into one bounded operator commit', () => {
		const { value, enqueueEdit } = controller();
		value.ledgerProps.onMoneyInput?.('200');
		expect(value.ledgerProps.onMoneyStep?.(1, '200')).toBe(true);
		expect(enqueueEdit).toHaveBeenCalledOnce();
		expect(enqueueEdit).toHaveBeenCalledWith(value.origin, {
			key: trainerMoneyPendingKeys.money,
			operation: { money: 201 }
		});

		const invalid = controller();
		invalid.value.ledgerProps.onMoneyInput?.('oops');
		expect(invalid.value.ledgerProps.onMoneyStep?.('max', 'oops')).toBe(false);
		expect(invalid.enqueueEdit).not.toHaveBeenCalled();
		expect(invalid.value.ledgerProps.drafts?.money?.value).toBe('oops');

		const bounded = controller({ state: workspace({ money: 999_999 }) });
		expect(bounded.value.ledgerProps.onMoneyStep?.(1, '999999')).toBe(true);
		expect(bounded.enqueueEdit).not.toHaveBeenCalled();
	});

	test('settles known no-ops before the coordinator', () => {
		const { value, enqueueEdit } = controller();
		value.ledgerProps.onTrainerNameInput?.(' RED ');
		value.ledgerProps.onTrainerNameCommit?.('enter');
		value.ledgerProps.onMoneyInput?.('0100');
		value.ledgerProps.onMoneyCommit?.('enter');
		value.ledgerProps.onTrainerGenderSelect?.('male');
		expect(enqueueEdit).not.toHaveBeenCalled();
		expect(value.ledgerProps.drafts?.trainerName?.value).toBe('RED');
		expect(value.ledgerProps.drafts?.money?.value).toBe('100');
	});

	test('renders returned projections without resetting another field draft', async () => {
		const { value, results } = controller();
		results.push({
			ok: true,
			status: 'committed',
			origin: value.origin,
			workspace: workspace({ name: 'BLUE', money: 100, byte: 2 })
		});
		value.ledgerProps.onMoneyInput?.('456');
		value.ledgerProps.onTrainerNameInput?.('BLUE');
		value.ledgerProps.onTrainerNameCommit?.('enter');
		await settled();
		expect(value.ledgerProps.view).toMatchObject({
			status: 'ready',
			projection: { trainerProfile: { trainerName: 'BLUE' } }
		});
		expect(value.ledgerProps.drafts?.money?.value).toBe('456');

		value.ledgerProps.onTrainerNameInput?.('LOCAL');
		value.acceptWorkspace(workspace({ name: 'BAGSYNC', money: 700, byte: 3 }));
		expect(value.workspace.workspace.saveFile?.money.value).toBe(700);
		expect(value.ledgerProps.drafts?.trainerName?.value).toBe('LOCAL');
		expect(value.ledgerProps.drafts?.money?.value).toBe('456');
	});

	test('maps validation, isolated, cancelled, and durable failures to their feedback', async () => {
		const invalid = controller();
		invalid.results.push({
			ok: false,
			status: 'rejected',
			origin: invalid.value.origin,
			code: 'invalid-save-file-edit',
			message: 'The engine rejected this name.',
			workspace: workspace()
		});
		invalid.value.ledgerProps.onTrainerNameInput?.('BLUE');
		invalid.value.ledgerProps.onTrainerNameCommit?.('enter');
		await settled();
		expect(invalid.value.ledgerProps.drafts?.trainerName).toEqual({
			value: 'BLUE',
			error: 'The engine rejected this name.'
		});
		expect(invalid.toast.error).not.toHaveBeenCalled();
		invalid.value.ledgerProps.onTrainerNameCommit?.('blur');
		expect(invalid.enqueueEdit).toHaveBeenCalledOnce();
		expect(invalid.value.ledgerProps.drafts?.trainerName).toEqual({
			value: 'RED',
			error: 'The engine rejected this name.'
		});

		const invalidMoney = controller();
		invalidMoney.results.push({
			ok: false,
			status: 'rejected',
			origin: invalidMoney.value.origin,
			code: 'invalid-save-file-edit',
			message: 'The engine rejected this Money value.',
			workspace: workspace()
		});
		invalidMoney.value.ledgerProps.onMoneyInput?.('200');
		invalidMoney.value.ledgerProps.onMoneyCommit?.('enter');
		await settled();
		invalidMoney.value.ledgerProps.onMoneyCommit?.('blur');
		expect(invalidMoney.enqueueEdit).toHaveBeenCalledOnce();
		expect(invalidMoney.value.ledgerProps.drafts?.money).toEqual({
			value: '100',
			error: 'The engine rejected this Money value.'
		});

		const invalidBlur = controller();
		invalidBlur.results.push({
			ok: false,
			status: 'rejected',
			origin: invalidBlur.value.origin,
			code: 'invalid-save-file-edit',
			message: 'The engine rejected this name.',
			workspace: workspace()
		});
		invalidBlur.value.ledgerProps.onTrainerNameInput?.('BLUE');
		invalidBlur.value.ledgerProps.onTrainerNameCommit?.('blur');
		await settled();
		expect(invalidBlur.value.ledgerProps.drafts?.trainerName).toEqual({
			value: 'RED',
			error: 'The engine rejected this name.'
		});

		const invalidGender = controller();
		invalidGender.results.push({
			ok: false,
			status: 'rejected',
			origin: invalidGender.value.origin,
			code: 'invalid-save-file-edit',
			message: 'The engine rejected this gender.',
			workspace: workspace()
		});
		invalidGender.value.ledgerProps.onTrainerGenderSelect?.('female');
		await settled();
		expect(invalidGender.value.ledgerProps.errors).toEqual({
			'trainer-gender': 'The engine rejected this gender.'
		});
		expect(invalidGender.toast.error).not.toHaveBeenCalled();
		invalidGender.value.ledgerProps.onTrainerGenderSelect?.('male');
		expect(invalidGender.value.ledgerProps.errors).toEqual({});

		const isolated = controller();
		isolated.results.push({
			ok: false,
			status: 'failed',
			origin: isolated.value.origin,
			code: 'backup-write-failed',
			message: 'Storage is busy.',
			workspace: workspace()
		});
		isolated.value.ledgerProps.onMoneyInput?.('200');
		isolated.value.ledgerProps.onMoneyCommit?.('enter');
		await settled();
		expect(isolated.value.ledgerProps.drafts?.money?.value).toBe('100');
		expect(isolated.toast.error).toHaveBeenCalledWith('Money could not be saved. Storage is busy.');

		isolated.results.push({
			ok: false,
			status: 'cancelled',
			origin: isolated.value.origin,
			code: 'queued-operation-cancelled',
			message: 'Cancelled.',
			workspace: workspace()
		});
		isolated.value.ledgerProps.onTrainerNameInput?.('GREEN');
		isolated.value.ledgerProps.onTrainerNameCommit?.('enter');
		await settled();
		expect(isolated.toast.error).toHaveBeenCalledOnce();

		const durable = controller();
		durable.results.push({
			ok: false,
			status: 'rejected',
			origin: durable.value.origin,
			code: 'stale-workspace',
			message: 'The Workspace changed.'
		});
		durable.value.ledgerProps.onMoneyInput?.('200');
		durable.value.ledgerProps.onMoneyCommit?.('enter');
		await settled();
		expect(durable.value.ledgerProps.view).toMatchObject({
			status: 'ready',
			editingUnavailable: { message: 'The Workspace changed.' }
		});
	});

	test.each(['engine-unavailable', 'backup-write-failed', 'workspace-persistence-failed'] as const)(
		'restores Money and sends one field Toast for %s',
		async (code) => {
			const failed = controller();
			failed.results.push({
				ok: false,
				status: 'failed',
				origin: failed.value.origin,
				code,
				message: 'Temporary failure.',
				workspace: workspace()
			});
			failed.value.ledgerProps.onMoneyInput?.('200');
			failed.value.ledgerProps.onMoneyCommit?.('enter');
			await settled();
			expect(failed.value.ledgerProps.drafts?.money?.value).toBe('100');
			expect(failed.toast.error).toHaveBeenCalledOnce();
			expect(failed.toast.error).toHaveBeenCalledWith(
				'Money could not be saved. Temporary failure.'
			);
		}
	);

	test('reconstructs pending state and replaces the origin on Retry', async () => {
		const reloaded = workspace({ name: 'BLUE', money: 500, byte: 3 });
		const { value, pending, replaceWorkspace } = controller({ reload: async () => reloaded });
		pending.push(
			{ key: trainerMoneyPendingKeys.money, sequence: 1 },
			{ key: 'inventory:Items:1', sequence: 2 }
		);
		value.dispose();
		let publishPending: (pending: readonly PendingSaveFileEdit[]) => void = () => undefined;

		const remounted = createSaveFileTrainerMoneyController({
			workspace: workspace(),
			activeBox: 0,
			coordinator: {
				...createCoordinator().coordinator,
				openWorkspace: () => value.origin,
				listPending: () => [...pending],
				isPending: (_origin, key) =>
					key === undefined ? pending.length > 0 : pending.some((edit) => edit.key === key),
				subscribePending: (_origin, listener) => {
					publishPending = listener;
					listener([...pending]);
					return () => undefined;
				},
				replaceWorkspace
			},
			toast: { error: vi.fn() },
			reloadWorkspace: async () => reloaded
		});
		expect(remounted.ledgerProps.pendingTargets).toEqual([
			trainerMoneyPendingKeys.money,
			'inventory:Items:1'
		]);
		pending.splice(0);
		publishPending([]);
		remounted.acceptWorkspace(reloaded);
		expect(remounted.ledgerProps.pendingTargets).toEqual([]);
		expect(remounted.ledgerProps.view).toMatchObject({
			status: 'ready',
			projection: { money: { value: 500 } }
		});

		const retryHarness = controller({ reload: async () => reloaded });
		retryHarness.results.push({
			ok: false,
			status: 'rejected',
			origin: retryHarness.value.origin,
			code: 'save-file-deleted',
			message: 'Editing stopped.'
		});
		retryHarness.value.ledgerProps.onMoneyInput?.('200');
		retryHarness.value.ledgerProps.onMoneyCommit?.('enter');
		await settled();
		const originUpdates: Array<{
			origin: SaveFileEditOrigin;
			money: number | null | undefined;
			unavailable: string | undefined;
		}> = [];
		const unsubscribe = retryHarness.value.subscribeOrigin((origin) =>
			originUpdates.push({
				origin,
				money: retryHarness.value.workspace.workspace.saveFile?.money.value,
				unavailable: retryHarness.value.editingUnavailable?.message
			})
		);
		await retryHarness.value.ledgerProps.onRetryEditing?.();
		expect(retryHarness.replaceWorkspace).toHaveBeenCalledWith(reloaded, 0);
		expect(originUpdates).toEqual([
			{
				origin: { saveFileId: 'save-1', workspaceId: 'workspace-1' },
				money: 100,
				unavailable: 'Editing stopped.'
			},
			{
				origin: { saveFileId: 'save-1', workspaceId: 'workspace-2' },
				money: 500,
				unavailable: undefined
			}
		]);
		expect(retryHarness.value.ledgerProps.view).toMatchObject({
			status: 'ready',
			projection: { money: { value: 500 } },
			editingUnavailable: null
		});
		unsubscribe();

		remounted.rejectEditing('Bag editing stopped.');
		expect(remounted.editingUnavailable).toEqual({ message: 'Bag editing stopped.' });
		remounted.ledgerProps.onTrainerNameInput?.('LOCAL');
		remounted.ledgerProps.onMoneyInput?.('999');
		remounted.rejectEditing('Bag editing stopped again.');
		expect(remounted.ledgerProps.drafts).toMatchObject({
			trainerName: { value: 'BLUE', error: null },
			money: { value: '500', error: null }
		});
	});
});

function applyOperation(state: WorkspaceState, operation: SaveFileEditOperation): WorkspaceState {
	const current = state.workspace.saveFile!;
	const name = operation.trainerProfile?.trainerName ?? current.trainerProfile.trainerName;
	return {
		...state,
		workspace: {
			...state.workspace,
			summary: { ...state.workspace.summary, trainerName: name ?? undefined },
			saveFile: {
				...current,
				trainerProfile: {
					...current.trainerProfile,
					trainerName: name,
					gender: operation.trainerProfile?.gender ?? current.trainerProfile.gender
				},
				money: { ...current.money, value: operation.money ?? current.money.value }
			}
		}
	};
}
