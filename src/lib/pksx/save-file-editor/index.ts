import type {
	InventoryEditOperation,
	InventoryItemOption,
	SaveFileEditableProjection,
	SaveFileEditOperation,
	SaveSummary,
	SaveWorkspace,
	TrainerGender
} from '$lib/engine';

export type { SaveFileEditableProjection } from '$lib/engine';

export type SaveFileEditorSourceIdentity = {
	key: string;
};

export type SaveFileEditorSource = {
	saveFileId: string | null;
	fileName: string | null;
	identity: SaveFileEditorSourceIdentity;
};

export type SaveFileEditorSourceInput = Omit<SaveFileEditorSource, 'identity'> & {
	identity?: SaveFileEditorSourceIdentity;
};

export type SaveFileCommittedWorkspaceState = {
	dirty: boolean;
	automaticBackupCreated: boolean;
};

export type StagedSaveFileEdit = {
	id: string;
	field: 'trainer-profile' | 'money' | 'inventory';
	label: string;
	payload?: unknown;
};

export type SaveFileEditorApplyOutcome =
	| {
			status: 'idle';
			message: string | null;
	  }
	| {
			status: 'noop';
			message: string;
	  }
	| {
			status: 'success';
			message: string;
	  }
	| {
			status: 'rejected' | 'unsupported' | 'failed';
			message: string;
			reason?: string;
	  };

export type SaveFileEditorState = {
	source: SaveFileEditorSource;
	projection: SaveFileEditableProjection;
	stagedEdits: StagedSaveFileEdit[];
	staged: boolean;
	committedWorkspace: SaveFileCommittedWorkspaceState;
	applyOutcome: SaveFileEditorApplyOutcome;
	unsupportedReason: string | null;
};

export type SaveFileEditorEntryResult =
	| {
			ok: true;
			state: SaveFileEditorState;
	  }
	| {
			ok: false;
			reason: string;
	  };

export type SaveFileEditValidationResult =
	| {
			ok: true;
	  }
	| {
			ok: false;
			status: 'rejected' | 'unsupported' | 'failed';
			message: string;
			reason?: string;
	  };

export type SaveFileEditOperationBuildResult =
	| {
			ok: true;
			operation: SaveFileEditOperation;
	  }
	| Extract<SaveFileEditValidationResult, { ok: false }>;

export type SaveFileEditorMutationResult =
	| {
			ok: true;
			bytes: Uint8Array;
			workspace: SaveWorkspace;
			mutated: boolean;
			projection?: SaveFileEditableProjection;
			committedWorkspace?: SaveFileCommittedWorkspaceState;
			message?: string;
	  }
	| {
			ok: false;
			status: 'rejected' | 'unsupported' | 'failed';
			message: string;
			reason?: string;
	  };

export type SaveFileEditorSourceVerification =
	| {
			ok: true;
	  }
	| {
			ok: false;
			message?: string;
	  };

export type SaveFileEditorApplyServices = {
	verifySource?: (state: SaveFileEditorState) => Promise<SaveFileEditorSourceVerification>;
	validate: (state: SaveFileEditorState) => Promise<SaveFileEditValidationResult>;
	ensureBackup: (state: SaveFileEditorState) => Promise<
		SaveFileEditValidationResult & {
			committedWorkspace?: SaveFileCommittedWorkspaceState;
		}
	>;
	mutateSaveFile: (state: SaveFileEditorState) => Promise<SaveFileEditorMutationResult>;
};

export type SaveFileEditorApplyResult = {
	state: SaveFileEditorState;
	outcome: SaveFileEditorApplyOutcome;
};

export function createSaveFileEditorSourceIdentity(
	summary: SaveSummary
): SaveFileEditorSourceIdentity {
	return {
		key: [
			summary.saveType,
			summary.gameVersion,
			summary.gameVersionId,
			summary.generation,
			summary.trainerName ?? '',
			summary.trainerId,
			summary.partyCount,
			summary.boxCount,
			summary.boxSlotCount
		].join('|')
	};
}

export function createSaveFileProjection(
	summary: SaveSummary,
	projection?: SaveFileEditableProjection
): SaveFileEditableProjection {
	if (projection) return projection;

	return {
		trainerProfile: {
			trainerName: summary.trainerName ?? null,
			trainerNameSupported: false,
			trainerNameMaxLength: 0,
			trainerNameUnsupportedReason: 'Trainer name editing is not available for this Save File.',
			gender: null,
			genderSupported: false,
			genderUnsupportedReason: 'Trainer gender editing is not available for this Save File.',
			trainerId: summary.trainerId,
			gameVersion: summary.gameVersion,
			generation: summary.generation
		},
		money: {
			value: null,
			min: 0,
			max: 0,
			supported: false,
			unsupportedReason: 'Money editing is not available for this Save File.'
		},
		inventory: {
			supported: false,
			unsupportedReason: 'Inventory editing is not available for this Save File.',
			pockets: []
		}
	};
}

export function createSaveFileEditorState(
	source: SaveFileEditorSourceInput,
	summary: SaveSummary,
	committedWorkspace: SaveFileCommittedWorkspaceState,
	projection?: SaveFileEditableProjection
): SaveFileEditorEntryResult {
	return {
		ok: true,
		state: withStagedEdits({
			source: {
				...source,
				identity: source.identity ?? createSaveFileEditorSourceIdentity(summary)
			},
			projection: createSaveFileProjection(summary, projection),
			stagedEdits: [],
			staged: false,
			committedWorkspace,
			applyOutcome: { status: 'idle', message: null },
			unsupportedReason: null
		})
	};
}

export function stageSaveFileEditorEdit(
	state: SaveFileEditorState,
	edit: StagedSaveFileEdit
): SaveFileEditorState {
	const stagedEdits = [...state.stagedEdits.filter((existing) => existing.id !== edit.id), edit];
	return withStagedEdits({
		...state,
		stagedEdits,
		applyOutcome: { status: 'idle', message: null },
		unsupportedReason: null
	});
}

export function stageTrainerNameEdit(
	state: SaveFileEditorState,
	trainerName: string
): SaveFileEditorState {
	const profile = state.projection.trainerProfile;
	if (!profile.trainerNameSupported) {
		return rejectEdit(
			state,
			'trainer-name',
			profile.trainerNameUnsupportedReason ?? 'Trainer name editing is unavailable.',
			'unsupported'
		);
	}

	const normalized = trainerName.trim();
	if (normalized === (profile.trainerName ?? '')) {
		return removeSaveFileEditorEdit(state, 'trainer-name');
	}

	if (normalized.length === 0 || normalized.length > profile.trainerNameMaxLength) {
		return rejectEdit(
			state,
			'trainer-name',
			`Trainer name must be between 1 and ${profile.trainerNameMaxLength} characters.`
		);
	}

	return stageSaveFileEditorEdit(state, {
		id: 'trainer-name',
		field: 'trainer-profile',
		label: 'Set trainer name',
		payload: { trainerName: normalized }
	});
}

export function stageTrainerGenderEdit(
	state: SaveFileEditorState,
	gender: TrainerGender
): SaveFileEditorState {
	const profile = state.projection.trainerProfile;
	if (!profile.genderSupported) {
		return rejectEdit(
			state,
			'trainer-gender',
			profile.genderUnsupportedReason ?? 'Trainer gender editing is unavailable.',
			'unsupported'
		);
	}
	if (gender === profile.gender) return removeSaveFileEditorEdit(state, 'trainer-gender');

	return stageSaveFileEditorEdit(state, {
		id: 'trainer-gender',
		field: 'trainer-profile',
		label: 'Set trainer gender',
		payload: { gender }
	});
}

export function stageMoneyEdit(state: SaveFileEditorState, money: number): SaveFileEditorState {
	const projection = state.projection.money;
	if (!projection.supported) {
		return rejectEdit(
			state,
			'money',
			projection.unsupportedReason ?? 'Money editing is unavailable.',
			'unsupported'
		);
	}
	if (!Number.isInteger(money) || money < projection.min || money > projection.max) {
		return rejectEdit(
			state,
			'money',
			`Money must be between ${projection.min.toLocaleString()} and ${projection.max.toLocaleString()}.`
		);
	}
	if (money === projection.value) return removeSaveFileEditorEdit(state, 'money');

	return stageSaveFileEditorEdit(state, {
		id: 'money',
		field: 'money',
		label: 'Set money',
		payload: { money }
	});
}

export function stageInventoryQuantityEdit(
	state: SaveFileEditorState,
	pocket: string,
	itemId: number,
	quantity: number
): SaveFileEditorState {
	const item = findInventoryItem(state, pocket, itemId);
	const id = inventoryEditId(pocket, itemId);
	if (!item) return rejectEdit(state, id, 'That item is no longer available in this pocket.');
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.maxQuantity) {
		return rejectEdit(
			state,
			id,
			`Quantity for ${item.name} must be between 1 and ${item.maxQuantity}.`
		);
	}
	if (quantity === item.quantity) return removeSaveFileEditorEdit(state, id);

	return stageInventoryEdit(state, pocket, itemId, item.name, { kind: 'set', quantity });
}

export function stageInventoryAddEdit(
	state: SaveFileEditorState,
	pocket: string,
	option: InventoryItemOption,
	quantity = 1
): SaveFileEditorState {
	const projection = findInventoryPocket(state, pocket);
	const itemId = option.id;
	const id = inventoryEditId(pocket, itemId);
	if (!projection) {
		return rejectEdit(state, id, 'That item is not valid for this pocket.');
	}
	if (projection.full) return rejectEdit(state, id, `${projection.label} is full.`, 'unsupported');
	if (projection.items.some((item) => item.id === itemId)) {
		return rejectEdit(state, id, `${option.name} is already in ${projection.label}.`);
	}
	if (!Number.isInteger(quantity) || quantity < 1 || quantity > option.maxQuantity) {
		return rejectEdit(
			state,
			id,
			`Quantity for ${option.name} must be between 1 and ${option.maxQuantity}.`
		);
	}

	return stageInventoryEdit(state, pocket, itemId, option.name, { kind: 'add', quantity });
}

export function stageInventoryRemoveEdit(
	state: SaveFileEditorState,
	pocket: string,
	itemId: number
): SaveFileEditorState {
	const item = findInventoryItem(state, pocket, itemId);
	const id = inventoryEditId(pocket, itemId);
	if (!item) return rejectEdit(state, id, 'That item is no longer available in this pocket.');
	return stageInventoryEdit(state, pocket, itemId, item.name, { kind: 'remove' });
}

export function cancelSaveFileEditor(state: SaveFileEditorState): SaveFileEditorState {
	return withStagedEdits({
		...state,
		stagedEdits: [],
		applyOutcome: { status: 'idle', message: null },
		unsupportedReason: null
	});
}

export function discardSaveFileEditorEdit(
	state: SaveFileEditorState,
	editId: string
): SaveFileEditorState {
	return removeSaveFileEditorEdit(state, editId);
}

export function getStagedInventoryEdits(
	state: SaveFileEditorState,
	pocket?: string
): InventoryEditOperation[] {
	return state.stagedEdits.flatMap((edit) => {
		if (edit.field !== 'inventory' || !isInventoryPayload(edit.payload)) return [];
		return pocket && edit.payload.pocket !== pocket ? [] : [edit.payload];
	});
}

export function createSaveFileEditOperation(
	state: SaveFileEditorState
): SaveFileEditOperationBuildResult {
	if (state.stagedEdits.length === 0) {
		return {
			ok: false,
			status: 'unsupported',
			message: 'No supported Save File edits are staged.',
			reason: 'unsupported-save-file-edit'
		};
	}

	const operation: SaveFileEditOperation = {};
	const inventory: InventoryEditOperation[] = [];

	for (const edit of state.stagedEdits) {
		if (edit.id === 'trainer-name') {
			if (!isTrainerNamePayload(edit.payload)) {
				return {
					ok: false,
					status: 'rejected',
					message: 'Trainer name edit payload is invalid.',
					reason: 'invalid-save-file-edit'
				};
			}

			operation.trainerProfile = {
				...operation.trainerProfile,
				trainerName: edit.payload.trainerName
			};
			continue;
		}

		if (edit.id === 'trainer-gender') {
			if (!isTrainerGenderPayload(edit.payload)) {
				return invalidPayload('Trainer gender');
			}
			operation.trainerProfile = {
				...operation.trainerProfile,
				gender: edit.payload.gender
			};
			continue;
		}

		if (edit.id === 'money') {
			if (!isMoneyPayload(edit.payload)) {
				return {
					ok: false,
					status: 'rejected',
					message: 'Money edit payload is invalid.',
					reason: 'invalid-save-file-edit'
				};
			}

			operation.money = edit.payload.money;
			continue;
		}

		if (edit.field === 'inventory') {
			if (!isInventoryPayload(edit.payload)) {
				return invalidPayload('Inventory');
			}
			inventory.push({ ...edit.payload });
			continue;
		}

		return {
			ok: false,
			status: 'unsupported',
			message: `${edit.label} is not supported by the Save File edit contract yet.`,
			reason: 'unsupported-save-file-edit'
		};
	}

	if (inventory.length > 0) operation.inventory = inventory;

	return {
		ok: true,
		operation
	};
}

export function isSameSaveFileEditorSourceIdentity(
	state: SaveFileEditorState,
	summary: SaveSummary | null
): boolean {
	return (
		summary !== null &&
		state.source.identity.key === createSaveFileEditorSourceIdentity(summary).key
	);
}

export async function applySaveFileEditorEdits(
	state: SaveFileEditorState,
	services: SaveFileEditorApplyServices
): Promise<SaveFileEditorApplyResult> {
	if (state.stagedEdits.length === 0) {
		return completeApply(state, {
			status: 'noop',
			message: 'No Save File edits are staged.'
		});
	}

	const sourceVerification = await services.verifySource?.(state);
	if (sourceVerification && !sourceVerification.ok) {
		return completeApply(state, {
			status: 'failed',
			message: sourceVerification.message ?? 'Save File Editor source changed before Apply.',
			reason: 'stale-source'
		});
	}

	const validation = await services.validate(state);
	if (!validation.ok) {
		return completeApply(state, outcomeFromValidation(validation));
	}

	const backup = await services.ensureBackup(state);
	if (!backup.ok) {
		return completeApply(state, outcomeFromValidation(backup));
	}

	const backedUpState = backup.committedWorkspace
		? { ...state, committedWorkspace: backup.committedWorkspace }
		: state;
	const mutation = await services.mutateSaveFile(backedUpState);
	return completeMutation(backedUpState, mutation);
}

function stageInventoryEdit(
	state: SaveFileEditorState,
	pocket: string,
	itemId: number,
	itemName: string,
	edit: { kind: InventoryEditOperation['kind']; quantity?: number }
) {
	return stageSaveFileEditorEdit(state, {
		id: inventoryEditId(pocket, itemId),
		field: 'inventory',
		label: `${edit.kind === 'remove' ? 'Remove' : edit.kind === 'add' ? 'Add' : 'Update'} ${itemName}`,
		payload: { ...edit, pocket, itemId }
	});
}

function findInventoryPocket(state: SaveFileEditorState, pocket: string) {
	return state.projection.inventory.pockets.find((candidate) => candidate.key === pocket);
}

function findInventoryItem(state: SaveFileEditorState, pocket: string, itemId: number) {
	return findInventoryPocket(state, pocket)?.items.find((item) => item.id === itemId);
}

function inventoryEditId(pocket: string, itemId: number) {
	return `inventory:${pocket}:${itemId}`;
}

function rejectEdit(
	state: SaveFileEditorState,
	editId: string,
	message: string,
	status: 'rejected' | 'unsupported' = 'rejected'
) {
	return withApplyOutcome(removeSaveFileEditorEdit(state, editId), {
		status,
		message,
		reason: status === 'unsupported' ? 'unsupported-save-file-edit' : 'invalid-save-file-edit'
	});
}

function invalidPayload(label: string): Extract<SaveFileEditValidationResult, { ok: false }> {
	return {
		ok: false,
		status: 'rejected',
		message: `${label} edit payload is invalid.`,
		reason: 'invalid-save-file-edit'
	};
}

function removeSaveFileEditorEdit(state: SaveFileEditorState, editId: string): SaveFileEditorState {
	return withStagedEdits({
		...state,
		stagedEdits: state.stagedEdits.filter((existing) => existing.id !== editId),
		applyOutcome: { status: 'idle', message: null },
		unsupportedReason: null
	});
}

function completeMutation(
	state: SaveFileEditorState,
	mutation: SaveFileEditorMutationResult
): SaveFileEditorApplyResult {
	if (!mutation.ok) {
		return completeApply(state, outcomeFromMutation(mutation));
	}

	return completeApply(
		withStagedEdits({
			...state,
			projection:
				mutation.projection ??
				createSaveFileProjection(mutation.workspace.summary, mutation.workspace.saveFile),
			source: {
				...state.source,
				identity: createSaveFileEditorSourceIdentity(mutation.workspace.summary)
			},
			stagedEdits: [],
			committedWorkspace: mutation.committedWorkspace ?? {
				...state.committedWorkspace,
				dirty: state.committedWorkspace.dirty || mutation.mutated
			}
		}),
		{
			status: 'success',
			message: mutation.message ?? 'Save File edits applied.'
		}
	);
}

function outcomeFromValidation(
	validation: Extract<SaveFileEditValidationResult, { ok: false }>
): Exclude<SaveFileEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> {
	const outcome: Exclude<SaveFileEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> = {
		status: validation.status,
		message: validation.message
	};
	if (validation.reason) outcome.reason = validation.reason;
	return outcome;
}

function outcomeFromMutation(
	mutation: Extract<SaveFileEditorMutationResult, { ok: false }>
): Exclude<SaveFileEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> {
	const outcome: Exclude<SaveFileEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> = {
		status: mutation.status,
		message: mutation.message
	};
	if (mutation.reason) outcome.reason = mutation.reason;
	return outcome;
}

function completeApply(
	state: SaveFileEditorState,
	outcome: Exclude<SaveFileEditorApplyOutcome, { status: 'idle' }>
): SaveFileEditorApplyResult {
	const nextState = withApplyOutcome(state, outcome);
	return {
		state: nextState,
		outcome: nextState.applyOutcome
	};
}

function withApplyOutcome(
	state: SaveFileEditorState,
	outcome: SaveFileEditorApplyOutcome
): SaveFileEditorState {
	return {
		...withStagedEdits(state),
		applyOutcome: outcome,
		unsupportedReason: outcome.status === 'unsupported' ? outcome.message : null
	};
}

function withStagedEdits(state: SaveFileEditorState): SaveFileEditorState {
	return {
		...state,
		staged: state.stagedEdits.length > 0
	};
}

function isTrainerNamePayload(value: unknown): value is { trainerName: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'trainerName' in value &&
		typeof value.trainerName === 'string'
	);
}

function isMoneyPayload(value: unknown): value is { money: number } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'money' in value &&
		typeof value.money === 'number' &&
		Number.isFinite(value.money)
	);
}

function isTrainerGenderPayload(value: unknown): value is { gender: TrainerGender } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'gender' in value &&
		(value.gender === 'male' || value.gender === 'female')
	);
}

function isInventoryPayload(value: unknown): value is InventoryEditOperation {
	return (
		typeof value === 'object' &&
		value !== null &&
		'kind' in value &&
		(value.kind === 'set' || value.kind === 'add' || value.kind === 'remove') &&
		'pocket' in value &&
		typeof value.pocket === 'string' &&
		'itemId' in value &&
		typeof value.itemId === 'number' &&
		(!('quantity' in value) || value.quantity === undefined || typeof value.quantity === 'number')
	);
}
