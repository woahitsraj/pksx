import type { EngineApi, InventoryItemProjection, SaveFileEditOperation } from '$lib/engine';
import type {
	SaveFileLedgerCatalogue,
	SaveFileLedgerCommand,
	SaveFileLedgerProps
} from '$lib/components/pksx/save-file-ledger/types';
import type { WorkspaceState } from '$lib/pksx/backup-workflow';
import type {
	SaveFileEditCoordinator,
	SaveFileEditOrigin,
	SaveFileEditResult
} from '$lib/pksx/save-file-edit-coordinator';
import type { ToastHost } from '$lib/pksx/toast/host.svelte';

export const bagPendingKeys = {
	quantity: (pocketKey: string, itemId: number) => `item-${pocketKey}-${itemId}-quantity`,
	add: (pocketKey: string) => `pocket-${pocketKey}-add-confirm`,
	remove: (pocketKey: string, itemId: number) => `item-${pocketKey}-${itemId}-confirm-remove`
} as const;

export type SaveFileBagCoordinator = Pick<
	SaveFileEditCoordinator,
	'enqueueEdit' | 'isPending' | 'isCurrent'
>;

export type SaveFileBagControllerOptions = {
	getWorkspace: () => WorkspaceState;
	getOrigin: () => SaveFileEditOrigin;
	subscribeOrigin: (listener: (origin: SaveFileEditOrigin) => void) => () => void;
	coordinator: SaveFileBagCoordinator;
	engine: Pick<EngineApi, 'getSaveFileInventoryCatalogue'>;
	toast: Pick<ToastHost, 'error'>;
	acceptWorkspace: (workspace: WorkspaceState) => void;
	getEditingUnavailable: () => { message: string; retrying?: boolean } | null;
	rejectEditing: (message: string) => void;
};

export type SaveFileBagLedgerProps = Pick<
	SaveFileLedgerProps,
	| 'command'
	| 'catalogues'
	| 'drafts'
	| 'errors'
	| 'onRetryCatalogue'
	| 'onItemQuantityInput'
	| 'onItemQuantityCommit'
	| 'onItemQuantityAbandon'
	| 'onItemQuantityStep'
	| 'onCommandChange'
	| 'onAddItem'
	| 'onRemoveItem'
>;

type QuantityDraft = {
	value: string;
	error: string | null;
	version: number;
};
type CommitContext =
	| {
			kind: 'quantity';
			pocketKey: string;
			itemId: number;
			mode: 'enter' | 'blur' | 'operator';
			submitted: string;
			version: number;
			label: string;
	  }
	| {
			kind: 'add' | 'remove';
			pocketKey: string;
			itemId: number;
			commandVersion: number;
			label: string;
	  };

export type SaveFileBagController = ReturnType<typeof createSaveFileBagController>;

export function createSaveFileBagController(options: SaveFileBagControllerOptions) {
	let command = $state.raw<SaveFileLedgerCommand | null>(null);
	let commandVersion = 0;
	let quantityDrafts = $state.raw<Record<string, QuantityDraft>>({});
	let commandErrors = $state.raw<Record<string, string>>({});
	let catalogues = $state.raw<Record<string, SaveFileLedgerCatalogue>>({});
	let catalogueGeneration = 0;
	let catalogueRequest: Promise<void> | null = null;
	let disposed = false;
	let currentOrigin: SaveFileEditOrigin | null = null;

	const unsubscribeOrigin = options.subscribeOrigin((origin) => {
		if (currentOrigin && sameOrigin(currentOrigin, origin)) return;
		currentOrigin = origin;
		command = null;
		commandVersion += 1;
		quantityDrafts = {};
		commandErrors = {};
		catalogues = loadingCatalogues(options.getWorkspace());
		catalogueGeneration += 1;
		catalogueRequest = null;
		void loadCatalogues();
	});

	function onCommandChange(next: SaveFileLedgerCommand | null) {
		if (!sameCommandState(command, next)) {
			commandVersion += 1;
			commandErrors = {};
		}
		const clearAddError =
			next?.kind === 'add-item' &&
			command?.kind === 'add-item' &&
			(next.itemId !== command.itemId || next.quantity !== command.quantity);
		command = clearAddError ? { ...next, quantityError: null } : next;
	}

	function onItemQuantityInput(pocketKey: string, itemId: number, value: string) {
		if (options.getEditingUnavailable()) return;
		const key = quantityDraftKey(pocketKey, itemId);
		quantityDrafts = {
			...quantityDrafts,
			[key]: { value, error: null, version: (quantityDrafts[key]?.version ?? 0) + 1 }
		};
	}

	function onItemQuantityCommit(pocketKey: string, itemId: number, reason: 'enter' | 'blur') {
		if (options.getEditingUnavailable()) return;
		const item = findItem(options.getWorkspace(), pocketKey, itemId);
		if (!item) {
			clearQuantityDraft(pocketKey, itemId);
			return;
		}
		const key = quantityDraftKey(pocketKey, itemId);
		const draft = quantityDrafts[key] ?? {
			value: String(item.quantity),
			error: null,
			version: 0
		};
		if (reason === 'blur' && draft.error) {
			setQuantityDraft(pocketKey, itemId, String(item.quantity), draft.error, draft.version);
			return;
		}
		const parsed = parseQuantity(draft.value, item.maxQuantity);
		if (!parsed.ok) {
			setQuantityDraft(
				pocketKey,
				itemId,
				reason === 'blur' ? String(item.quantity) : draft.value,
				parsed.message,
				draft.version
			);
			return;
		}
		commitQuantity(pocketKey, item, parsed.value, reason, draft.value, draft.version);
	}

	function onItemQuantityAbandon(pocketKey: string, itemId: number) {
		const item = findItem(options.getWorkspace(), pocketKey, itemId);
		const draft = quantityDrafts[quantityDraftKey(pocketKey, itemId)];
		if (!item || !draft) return;
		setQuantityDraft(pocketKey, itemId, String(item.quantity), draft.error, draft.version);
	}

	function onItemQuantityStep(pocketKey: string, itemId: number, step: -1 | 1, draftValue: string) {
		if (options.getEditingUnavailable()) return false;
		const item = findItem(options.getWorkspace(), pocketKey, itemId);
		if (!item) return false;
		const key = quantityDraftKey(pocketKey, itemId);
		const version = quantityDrafts[key]?.version ?? 0;
		const parsed = parseQuantity(draftValue, item.maxQuantity);
		if (!parsed.ok) {
			setQuantityDraft(pocketKey, itemId, draftValue, parsed.message, version + 1);
			return false;
		}
		const next = Math.max(1, Math.min(item.maxQuantity, parsed.value + step));
		return commitQuantity(pocketKey, item, next, 'operator', draftValue, version);
	}

	function commitQuantity(
		pocketKey: string,
		item: InventoryItemProjection,
		value: number,
		mode: 'enter' | 'blur' | 'operator',
		submitted: string,
		version: number
	) {
		if (value === item.quantity) {
			clearQuantityDraft(pocketKey, item.id);
			return true;
		}
		return enqueue(
			{
				kind: 'quantity',
				pocketKey,
				itemId: item.id,
				mode,
				submitted,
				version,
				label: item.name
			},
			bagPendingKeys.quantity(pocketKey, item.id),
			{ inventory: [{ kind: 'set', pocket: pocketKey, itemId: item.id, quantity: value }] }
		);
	}

	function onAddItem(next: Extract<SaveFileLedgerCommand, { kind: 'add-item' }>) {
		if (options.getEditingUnavailable() || !sameCommandState(command, next)) return;
		const pocket = findPocket(options.getWorkspace(), next.pocketKey);
		const catalogue = catalogues[next.pocketKey];
		const option =
			catalogue?.status === 'ready'
				? catalogue.availableItems.find((item) => item.id === next.itemId)
				: undefined;
		if (!pocket || pocket.full) {
			setCommandError(
				bagPendingKeys.add(next.pocketKey),
				'This pocket has no room for another item.'
			);
			return;
		}
		if (!option || pocket.items.some((item) => item.id === next.itemId)) {
			setCommandError(bagPendingKeys.add(next.pocketKey), 'Choose an available item.');
			return;
		}
		const parsed = parseQuantity(next.quantity, option.maxQuantity);
		if (!parsed.ok) {
			command = { ...next, quantityError: parsed.message };
			return;
		}
		enqueue(
			{
				kind: 'add',
				pocketKey: next.pocketKey,
				itemId: option.id,
				commandVersion,
				label: option.name
			},
			bagPendingKeys.add(next.pocketKey),
			{
				inventory: [
					{
						kind: 'add',
						pocket: next.pocketKey,
						itemId: option.id,
						quantity: parsed.value
					}
				]
			}
		);
	}

	function onRemoveItem(next: Extract<SaveFileLedgerCommand, { kind: 'remove-item' }>) {
		if (options.getEditingUnavailable() || !sameCommandState(command, next)) return;
		const item = findItem(options.getWorkspace(), next.pocketKey, next.itemId);
		if (!item) {
			onCommandChange(null);
			return;
		}
		enqueue(
			{
				kind: 'remove',
				pocketKey: next.pocketKey,
				itemId: next.itemId,
				commandVersion,
				label: item.name
			},
			bagPendingKeys.remove(next.pocketKey, next.itemId),
			{
				inventory: [{ kind: 'remove', pocket: next.pocketKey, itemId: next.itemId }]
			}
		);
	}

	function enqueue(context: CommitContext, key: string, operation: SaveFileEditOperation) {
		if (options.getEditingUnavailable()) return false;
		const requestOrigin = options.getOrigin();
		if (options.coordinator.isPending(requestOrigin, key)) return false;
		void options.coordinator
			.enqueueEdit(requestOrigin, { key, operation })
			.then((result) => settle(requestOrigin, context, result))
			.catch((error: unknown) => {
				if (!disposed && sameOrigin(requestOrigin, options.getOrigin())) {
					options.rejectEditing(errorMessage(error));
				}
			});
		return true;
	}

	function settle(
		requestOrigin: SaveFileEditOrigin,
		context: CommitContext,
		result: SaveFileEditResult
	) {
		if (disposed) {
			if (
				!result.ok &&
				result.status === 'failed' &&
				result.workspace &&
				sameOrigin(requestOrigin, result.origin) &&
				options.coordinator.isCurrent(requestOrigin)
			) {
				options.toast.error(`${operationLabel(context)} could not be saved. ${result.message}`);
			}
			return;
		}
		if (!sameOrigin(requestOrigin, options.getOrigin())) return;
		if (result.ok) {
			options.acceptWorkspace(result.workspace);
			clearSettledState(context);
			return;
		}
		if (result.code === 'stale-workspace' || result.code === 'save-file-deleted') {
			options.rejectEditing(result.message);
			return;
		}
		if (result.workspace) options.acceptWorkspace(result.workspace);
		else {
			options.rejectEditing(result.message);
			return;
		}
		if (result.code === 'invalid-save-file-edit') {
			retainValidationFailure(context, result.message);
			return;
		}
		if (context.kind === 'quantity') clearQuantityIfCurrent(context);
		if (result.code !== 'queued-operation-cancelled') {
			options.toast.error(`${operationLabel(context)} could not be saved. ${result.message}`);
		}
	}

	function clearSettledState(context: CommitContext) {
		if (context.kind === 'quantity') {
			clearQuantityIfCurrent(context);
			return;
		}
		if (context.kind === 'remove') clearQuantityDraft(context.pocketKey, context.itemId);
		if (context.commandVersion === commandVersion) onCommandChange(null);
	}

	function retainValidationFailure(context: CommitContext, message: string) {
		if (context.kind === 'quantity') {
			const draft = quantityDrafts[quantityDraftKey(context.pocketKey, context.itemId)];
			if ((draft?.version ?? 0) !== context.version) return;
			const item = findItem(options.getWorkspace(), context.pocketKey, context.itemId);
			setQuantityDraft(
				context.pocketKey,
				context.itemId,
				context.mode === 'enter' ? context.submitted : String(item?.quantity ?? ''),
				message,
				context.version
			);
		} else if (context.commandVersion === commandVersion) {
			setCommandError(
				context.kind === 'add'
					? bagPendingKeys.add(context.pocketKey)
					: bagPendingKeys.remove(context.pocketKey, context.itemId),
				message
			);
		}
	}

	function setCommandError(identity: string, message: string) {
		commandErrors = { [identity]: message };
	}

	function clearQuantityIfCurrent(context: Extract<CommitContext, { kind: 'quantity' }>) {
		const key = quantityDraftKey(context.pocketKey, context.itemId);
		if (quantityDrafts[key]?.version === context.version)
			clearQuantityDraft(context.pocketKey, context.itemId);
	}

	function operationLabel(context: CommitContext) {
		return context.label;
	}

	function setQuantityDraft(
		pocketKey: string,
		itemId: number,
		value: string,
		error: string | null,
		version: number
	) {
		quantityDrafts = {
			...quantityDrafts,
			[quantityDraftKey(pocketKey, itemId)]: { value, error, version }
		};
	}

	function clearQuantityDraft(pocketKey: string, itemId: number) {
		const key = quantityDraftKey(pocketKey, itemId);
		if (!(key in quantityDrafts)) return;
		const next = { ...quantityDrafts };
		delete next[key];
		quantityDrafts = next;
	}

	function onRetryCatalogue(pocketKey: string) {
		if (catalogueRequest || options.getEditingUnavailable() || !catalogues[pocketKey]) return;
		const retryPockets = Object.entries(catalogues)
			.filter(([, catalogue]) => catalogue.status === 'failed')
			.map(([key]) => key);
		catalogues = Object.fromEntries(
			Object.entries(catalogues).map(([key, catalogue]) => [
				key,
				retryPockets.includes(key) ? { status: 'loading' as const, retrying: true } : catalogue
			])
		);
		void loadCatalogues(retryPockets);
	}

	async function loadCatalogues(retryPockets?: readonly string[]) {
		if (catalogueRequest || disposed) return catalogueRequest;
		const generation = catalogueGeneration;
		const origin = options.getOrigin();
		const workspace = options.getWorkspace();
		const request = (async () => {
			try {
				const result = await options.engine.getSaveFileInventoryCatalogue(
					workspace.bytes,
					workspace.file.originalFileName ?? undefined
				);
				if (
					disposed ||
					generation !== catalogueGeneration ||
					!sameOrigin(origin, options.getOrigin())
				)
					return;
				if (!result.ok || !result.value.supported) {
					setCatalogueFailures(
						retryPockets,
						result.ok ? result.value.unsupportedReason : result.error.message
					);
					return;
				}
				catalogues = Object.fromEntries(
					projection(workspace).inventory.pockets.map((pocket) => {
						const found = result.value.pockets.find((entry) => entry.key === pocket.key);
						return [
							pocket.key,
							found
								? { status: 'ready' as const, availableItems: found.availableItems }
								: {
										status: 'failed' as const,
										message: `${pocket.label} items are unavailable.`
									}
						];
					})
				);
			} catch (error) {
				if (
					!disposed &&
					generation === catalogueGeneration &&
					sameOrigin(origin, options.getOrigin())
				) {
					setCatalogueFailures(retryPockets, errorMessage(error));
				}
			} finally {
				if (generation === catalogueGeneration) catalogueRequest = null;
			}
		})();
		catalogueRequest = request;
		return request;
	}

	function setCatalogueFailures(
		retryPockets: readonly string[] | undefined,
		message: string | null
	) {
		const failure = message || 'The item catalogue is unavailable.';
		if (retryPockets) {
			catalogues = Object.fromEntries(
				Object.entries(catalogues).map(([key, catalogue]) => [
					key,
					retryPockets.includes(key) ? { status: 'failed' as const, message: failure } : catalogue
				])
			);
			return;
		}
		catalogues = Object.fromEntries(
			projection(options.getWorkspace()).inventory.pockets.map((pocket) => [
				pocket.key,
				{ status: 'failed' as const, message: failure }
			])
		);
	}

	function dispose() {
		disposed = true;
		catalogueGeneration += 1;
		command = null;
		quantityDrafts = {};
		commandErrors = {};
		unsubscribeOrigin();
	}

	return {
		get ledgerProps(): SaveFileBagLedgerProps {
			projection(options.getWorkspace());
			const editingUnavailable = options.getEditingUnavailable() !== null;
			return {
				command: editingUnavailable ? null : command,
				catalogues,
				errors: editingUnavailable ? {} : commandErrors,
				drafts: {
					itemQuantities: editingUnavailable
						? {}
						: Object.fromEntries(
								Object.entries(quantityDrafts).map(([key, draft]) => [
									key,
									{ value: draft.value, error: draft.error }
								])
							)
				},
				onRetryCatalogue,
				onItemQuantityInput,
				onItemQuantityCommit,
				onItemQuantityAbandon,
				onItemQuantityStep,
				onCommandChange,
				onAddItem,
				onRemoveItem
			};
		},
		dispose
	};
}

function loadingCatalogues(workspace: WorkspaceState) {
	return Object.fromEntries(
		projection(workspace).inventory.pockets.map((pocket) => [
			pocket.key,
			{ status: 'loading' as const }
		])
	);
}

function projection(workspace: WorkspaceState) {
	const value = workspace.workspace.saveFile;
	if (!value) throw new Error('The Save File has no editable projection.');
	return value;
}

function findPocket(workspace: WorkspaceState, pocketKey: string) {
	return projection(workspace).inventory.pockets.find((pocket) => pocket.key === pocketKey);
}

function findItem(workspace: WorkspaceState, pocketKey: string, itemId: number) {
	return findPocket(workspace, pocketKey)?.items.find((item) => item.id === itemId);
}

function parseQuantity(
	value: string,
	max: number
): { ok: true; value: number } | { ok: false; message: string } {
	const quantity = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= max
		? { ok: true, value: quantity }
		: { ok: false, message: `Quantity must be a whole number between 1 and ${max}.` };
}

function quantityDraftKey(pocketKey: string, itemId: number) {
	return `${pocketKey}:${itemId}`;
}

function sameCommandState(left: SaveFileLedgerCommand | null, right: SaveFileLedgerCommand | null) {
	if (!left || !right || left.kind !== right.kind || left.pocketKey !== right.pocketKey) {
		return left === right;
	}
	return left.kind === 'remove-item' && right.kind === 'remove-item'
		? left.itemId === right.itemId
		: left.kind === 'add-item' &&
				right.kind === 'add-item' &&
				left.itemId === right.itemId &&
				left.quantity === right.quantity &&
				left.quantityError === right.quantityError;
}

function sameOrigin(left: SaveFileEditOrigin, right: SaveFileEditOrigin) {
	return left.saveFileId === right.saveFileId && left.workspaceId === right.workspaceId;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
