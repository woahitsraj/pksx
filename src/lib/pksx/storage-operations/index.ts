import type {
	EngineApi,
	EngineError,
	SaveSlotRef,
	SlotOperation,
	SlotOperationResult
} from '$lib/engine';
import type { PreparedAutomaticBackup, WorkspaceState } from '$lib/pksx/backup-workflow';

export type StorageOperationKind = SlotOperation['kind'];
export type PendingStorageSlotOperation = {
	kind: 'move' | 'copy';
	source: SaveSlotRef;
	sourceLabel: string;
	sourcePokemonLabel: string;
};

export type StorageSlotOccupancy = {
	kind: 'pokemon' | 'empty';
};

export type StorageDestinationState = 'valid' | 'invalid' | 'source' | null;
export type StorageOperationFailureReason =
	| 'workspace-unavailable'
	| 'engine-unavailable'
	| 'empty-source'
	| 'occupied-destination'
	| 'invalid-destination'
	| 'engine-rejected';

export type StorageOperationEffect = 'move' | 'copy' | 'swap' | 'clear';

export type StorageOperationSuccess = {
	ok: true;
	state: WorkspaceState;
	message: string;
	focusRef: SaveSlotRef;
	createdAutomaticBackup: boolean;
	dirtyChanged: boolean;
	mutated: boolean;
	effect: StorageOperationEffect;
};

export type StorageOperationRejected = {
	ok: false;
	reason: StorageOperationFailureReason;
	message: string;
	error?: EngineError;
};

export type StorageOperationNoop = {
	ok: false;
	reason: 'noop';
	message: string;
};

export type StorageOperationResultState =
	| StorageOperationSuccess
	| StorageOperationRejected
	| StorageOperationNoop;

export type StorageOperationApplyServices = {
	engine: EngineApi | null;
	prepareAutomaticBackup: (state: WorkspaceState) => Promise<PreparedAutomaticBackup>;
	persistWorkspace: (state: WorkspaceState, expectedUpdatedAt: string) => Promise<void>;
	locationForSlotRef: (ref: SaveSlotRef) => string;
};

export type StorageOperationApplyInput = {
	state: WorkspaceState | null;
	operation: SlotOperation;
	activeBox: number;
	sourceSlot: StorageSlotOccupancy | null;
	destinationSlot?: StorageSlotOccupancy | null;
	partyCount: number;
	services: StorageOperationApplyServices;
};

export function slotRefKey(ref: SaveSlotRef): string {
	return ref.zone === 'party' ? `party:${ref.slot}` : `box:${ref.box}:${ref.slot}`;
}

export function isSameSlotRef(a: SaveSlotRef, b: SaveSlotRef): boolean {
	return slotRefKey(a) === slotRefKey(b);
}

export function destinationStateForStorageOperation(input: {
	pending: PendingStorageSlotOperation | null;
	destination: SaveSlotRef;
	destinationSlot: StorageSlotOccupancy | null;
	partyCount: number;
}): StorageDestinationState {
	if (!input.pending) {
		return null;
	}

	if (isSameSlotRef(input.pending.source, input.destination)) {
		return 'source';
	}

	const validation = validateStorageOperation({
		operation: {
			kind: input.pending.kind,
			source: input.pending.source,
			destination: input.destination
		},
		sourceSlot: { kind: 'pokemon' },
		destinationSlot: input.destinationSlot,
		partyCount: input.partyCount
	});

	return validation.ok ? 'valid' : 'invalid';
}

export function validateStorageOperation(input: {
	operation: SlotOperation;
	sourceSlot: StorageSlotOccupancy | null;
	destinationSlot?: StorageSlotOccupancy | null;
	partyCount: number;
}): { ok: true } | StorageOperationRejected | StorageOperationNoop {
	const { operation, sourceSlot, destinationSlot, partyCount } = input;

	if (sourceSlot !== null && sourceSlot.kind !== 'pokemon') {
		return {
			ok: false,
			reason: 'empty-source',
			message: 'Move, Copy, and Clear Slot need an occupied source Slot.'
		};
	}

	if (operation.kind !== 'clear' && isSameSlotRef(operation.source, operation.destination)) {
		return {
			ok: false,
			reason: 'noop',
			message: 'No Slot change made.'
		};
	}

	if (
		operation.kind !== 'clear' &&
		isInvalidPartyDestination(operation.destination, destinationSlot, partyCount)
	) {
		return {
			ok: false,
			reason: 'invalid-destination',
			message: 'That Party Slot cannot be used yet.'
		};
	}

	if (operation.kind === 'copy' && destinationSlot?.kind === 'pokemon') {
		return {
			ok: false,
			reason: 'occupied-destination',
			message: 'Copy needs an empty destination Slot.'
		};
	}

	return { ok: true };
}

export function successMessageForStorageOperation(input: {
	operation: SlotOperation;
	effect: StorageOperationEffect;
	locationForSlotRef: (ref: SaveSlotRef) => string;
}): string {
	const { operation, effect, locationForSlotRef } = input;

	if (operation.kind === 'clear') {
		return `Cleared ${locationForSlotRef(operation.source)}.`;
	}

	if (operation.kind === 'copy') {
		return `Copied to ${locationForSlotRef(operation.destination)}.`;
	}

	return effect === 'swap'
		? `Swapped with ${locationForSlotRef(operation.destination)}.`
		: `Moved to ${locationForSlotRef(operation.destination)}.`;
}

export async function applyStorageOperation(
	input: StorageOperationApplyInput
): Promise<StorageOperationResultState> {
	const { state, operation, activeBox, sourceSlot, destinationSlot, partyCount, services } = input;

	if (!state) {
		return {
			ok: false,
			reason: 'workspace-unavailable',
			message: 'Load a Save File before changing Slots.'
		};
	}

	if (!services.engine) {
		return {
			ok: false,
			reason: 'engine-unavailable',
			message: 'Pokemon data is still loading. Try again.'
		};
	}

	const validation = validateStorageOperation({
		operation,
		sourceSlot,
		destinationSlot,
		partyCount
	});
	if (!validation.ok) {
		return validation;
	}

	const prepared = await services.prepareAutomaticBackup(state);
	const workingState = prepared.state;

	const result = await services.engine.applySlotOperation(
		workingState.bytes,
		workingState.file.originalFileName ?? undefined,
		operation,
		activeBox
	);

	if (!result.ok) {
		return {
			ok: false,
			reason: 'engine-rejected',
			message: result.error.message,
			error: result.error
		};
	}

	const nextState = applySlotOperationResult(workingState, result.value);
	if (nextState.dirty) {
		await services.persistWorkspace(nextState, prepared.revision);
	}

	const focusRef = operation.kind === 'clear' ? operation.source : operation.destination;
	const effect = operationEffect(operation, destinationSlot);

	return {
		ok: true,
		state: nextState,
		message: successMessageForStorageOperation({
			operation,
			effect,
			locationForSlotRef: services.locationForSlotRef
		}),
		focusRef,
		createdAutomaticBackup: prepared.established,
		dirtyChanged: nextState.dirty !== state.dirty,
		mutated: result.value.mutated,
		effect
	};
}

function applySlotOperationResult(
	state: WorkspaceState,
	result: SlotOperationResult
): WorkspaceState {
	return {
		...state,
		bytes: result.bytes,
		workspace: result.workspace,
		dirty: state.dirty || result.mutated,
		restoredFromBackup: null
	};
}

function isInvalidPartyDestination(
	ref: SaveSlotRef,
	slot: StorageSlotOccupancy | null | undefined,
	partyCount: number
): boolean {
	return ref.zone === 'party' && slot?.kind === 'empty' && ref.slot > partyCount;
}

function operationEffect(
	operation: SlotOperation,
	destinationSlot: StorageSlotOccupancy | null | undefined
): StorageOperationEffect {
	if (operation.kind === 'clear') {
		return 'clear';
	}

	if (operation.kind === 'copy') {
		return 'copy';
	}

	return destinationSlot?.kind === 'pokemon' ? 'swap' : 'move';
}
