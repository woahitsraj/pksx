import { BOX_SLOT_COUNT, projectSlotCoordinate, type SlotFocus } from '$lib/pksx/box-navigation';
import type {
	SaveFileId,
	StoredPokemonStorage,
	StoredPokemonStoragePokemon
} from '$lib/pksx/saves';
import type { SlotView } from '$lib/components/pksx/types';

export type BoxSourceType = 'save-file' | 'pokemon-storage';
export type TransferOperationMode = 'move' | 'copy';

export type BoxSourceRef =
	| {
			type: 'save-file';
			id: SaveFileId | null;
			label: string;
			dirty: boolean;
	  }
	| {
			type: 'pokemon-storage';
			id: 'pokemon-storage';
			label: 'Pokemon Storage';
	  };

export type BoxPaneState = {
	id: string;
	source: BoxSourceRef;
	activeBox: number;
	boxCount: number;
	focus: SlotFocus;
};

export type SavePaneWorkspaceState = {
	file: {
		id: SaveFileId;
		originalFileName: string | null;
	};
	workspace: {
		summary: {
			boxCount: number;
		};
	};
	dirty: boolean;
};

export type SavePaneWorkspaceCache<TState extends SavePaneWorkspaceState> = Record<
	string,
	{ state: TState; loadedBox: number }
>;

export type WorkbenchSlotRef = {
	paneId: string;
	zone: SlotFocus['zone'];
	box: number | null;
	slot: number;
};

export type PokemonStorageSlotRef =
	| { zone: 'party'; slot: number }
	| { zone: 'box'; box: number; slot: number };

export type CarryState = {
	mode: TransferOperationMode;
	source: WorkbenchSlotRef;
	sourceOwner: BoxSourceRef;
	pokemonLabel: string;
	spriteUrl: string | null;
	sourceLabel: string;
	origin: PokemonOrigin;
};

export type PokemonOrigin = {
	entryMode: 'moved-in' | 'copied-in' | 'imported';
	originSaveFileName: string | null;
	originGame: string | null;
	originalTrainer: string | null;
	trainerId: string | null;
	enteredAt: string;
};

export type DestinationEvaluation =
	| {
			valid: true;
			state: 'source' | 'empty-drop' | 'occupied-swap';
			label: string;
			consequence: string;
			mutations: WorkbenchMutationPlan[];
	  }
	| {
			valid: false;
			state: 'invalid';
			label: string;
			reason: string;
			consequence: string;
			mutations: [];
	  };

export type WorkbenchMutationPlan =
	| {
			owner: 'save-file';
			paneId: string;
			sourceType: BoxSourceType;
			mutation: 'insert' | 'clear' | 'swap';
			requiresBackup: boolean;
			dirtiesWorkspace: boolean;
	  }
	| {
			owner: 'pokemon-storage';
			paneId: string;
			sourceType: 'pokemon-storage';
			mutation: 'insert' | 'remove' | 'swap';
			autoSaved: true;
	  };

export type SourcePickerCard = {
	id: string;
	type: BoxSourceType;
	label: string;
	metadata: string;
	active: boolean;
	treatment: 'save-file' | 'app-owned';
};

export function createBoxPane(
	id: string,
	source: BoxSourceRef,
	options: { activeBox?: number; boxCount?: number; focus?: SlotFocus } = {}
): BoxPaneState {
	return {
		id,
		source,
		activeBox: clampBox(options.activeBox ?? 0, options.boxCount ?? 1),
		boxCount: Math.max(1, options.boxCount ?? 1),
		focus: options.focus ?? { zone: 'box', slot: 0 }
	};
}

export function addBoxPane(
	panes: BoxPaneState[],
	source: BoxSourceRef,
	options: { id: string; boxCount?: number } = { id: crypto.randomUUID() }
): BoxPaneState[] {
	return [
		...panes,
		createBoxPane(options.id, source, {
			boxCount: options.boxCount ?? inferBoxCountForSource(source)
		})
	];
}

export function closeBoxPane(panes: BoxPaneState[], paneId: string): BoxPaneState[] {
	if (panes.length <= 1) {
		return panes;
	}

	return panes.filter((pane) => pane.id !== paneId);
}

export function focusSurvivingPaneAfterClose(
	closingPane: BoxPaneState,
	survivingPane: BoxPaneState,
	options: { partyAvailable?: boolean } = {}
): SlotFocus {
	const zone =
		survivingPane.focus.zone === 'party' && (options.partyAvailable ?? true) ? 'party' : 'box';
	return projectSlotCoordinate(closingPane.focus, zone);
}

export function switchPaneSource(
	panes: BoxPaneState[],
	paneId: string,
	source: BoxSourceRef,
	boxCount = inferBoxCountForSource(source)
): BoxPaneState[] {
	return panes.map((pane) =>
		pane.id === paneId
			? createBoxPane(pane.id, source, {
					activeBox: pane.activeBox,
					boxCount,
					focus: source.type === 'save-file' ? pane.focus : projectSlotCoordinate(pane.focus, 'box')
				})
			: pane
	);
}

export function setPaneActiveBox(
	panes: BoxPaneState[],
	paneId: string,
	activeBox: number
): BoxPaneState[] {
	return panes.map((pane) =>
		pane.id === paneId ? { ...pane, activeBox: clampBox(activeBox, pane.boxCount) } : pane
	);
}

export function setPaneFocus(
	panes: BoxPaneState[],
	paneId: string,
	focus: SlotFocus
): BoxPaneState[] {
	return panes.map((pane) => (pane.id === paneId ? { ...pane, focus } : pane));
}

export function refreshSaveFilePaneWorkspaces<TState extends SavePaneWorkspaceState>(
	panes: BoxPaneState[],
	workspaces: SavePaneWorkspaceCache<TState>,
	state: TState,
	loadedBox: number | ((pane: BoxPaneState) => { state: TState; loadedBox: number } | null)
): { panes: BoxPaneState[]; workspaces: SavePaneWorkspaceCache<TState> } {
	const matchingPanes = panes.filter(
		(pane) => pane.source.type === 'save-file' && pane.source.id === state.file.id
	);

	return {
		panes: panes.map((pane) =>
			pane.source.type === 'save-file' && pane.source.id === state.file.id
				? {
						...pane,
						boxCount: state.workspace.summary.boxCount,
						source: {
							...pane.source,
							label: state.file.originalFileName ?? pane.source.label,
							dirty: state.dirty
						}
					}
				: pane
		),
		workspaces: matchingPanes.reduce(
			(next, pane) => {
				const projection = typeof loadedBox === 'function' ? loadedBox(pane) : { state, loadedBox };
				if (!projection) return next;
				return {
					...next,
					[pane.id]: projection
				};
			},
			{ ...workspaces }
		)
	};
}

export function getStoragePokemon(
	stored: StoredPokemonStorage,
	ref: PokemonStorageSlotRef
): StoredPokemonStoragePokemon | null {
	if (ref.zone !== 'box') {
		return null;
	}

	return (
		stored.boxes.find((box) => box.index === ref.box)?.slots.find((slot) => slot.slot === ref.slot)
			?.pokemon ?? null
	);
}

export function putStoragePokemon(
	stored: StoredPokemonStorage,
	destination: PokemonStorageSlotRef,
	pokemon: StoredPokemonStoragePokemon
): StoredPokemonStorage {
	if (destination.zone !== 'box') {
		return stored;
	}

	const boxes = stored.boxes.map((box) =>
		box.index === destination.box
			? {
					...box,
					slots: box.slots.map((slot) =>
						slot.slot === destination.slot ? { ...slot, pokemon } : slot
					)
				}
			: box
	);

	return { ...stored, boxes };
}

export function removeStoragePokemon(
	stored: StoredPokemonStorage,
	source: PokemonStorageSlotRef
): StoredPokemonStorage {
	if (source.zone !== 'box') {
		return stored;
	}

	const boxes = stored.boxes.map((box) =>
		box.index === source.box
			? {
					...box,
					slots: box.slots.map((slot) =>
						slot.slot === source.slot ? { ...slot, pokemon: null } : slot
					)
				}
			: box
	);

	return { ...stored, boxes };
}

export function applyPokemonStorageSlotOperation(
	stored: StoredPokemonStorage,
	operation: {
		kind: TransferOperationMode;
		source: PokemonStorageSlotRef;
		destination: PokemonStorageSlotRef;
		pokemon: StoredPokemonStoragePokemon;
	}
): StoredPokemonStorage {
	if (operation.destination.zone !== 'box') {
		return stored;
	}

	if (
		operation.source.zone === 'box' &&
		operation.source.box === operation.destination.box &&
		operation.source.slot === operation.destination.slot
	) {
		return stored;
	}

	const destinationPokemon = getStoragePokemon(stored, operation.destination);
	let next = putStoragePokemon(stored, operation.destination, operation.pokemon);

	if (operation.kind === 'move') {
		next = destinationPokemon
			? putStoragePokemon(next, operation.source, destinationPokemon)
			: removeStoragePokemon(next, operation.source);
	}

	return next;
}

export function movePaneFocus(
	panes: BoxPaneState[],
	activePaneId: string,
	direction: 'previous' | 'next'
): string {
	const index = panes.findIndex((pane) => pane.id === activePaneId);
	if (index < 0 || panes.length === 0) {
		return activePaneId;
	}

	const offset = direction === 'previous' ? -1 : 1;
	return panes[(index + offset + panes.length) % panes.length]?.id ?? activePaneId;
}

export function createCarryState(input: {
	mode?: TransferOperationMode;
	pane: BoxPaneState;
	slot: SlotView;
	source: WorkbenchSlotRef;
	now?: () => string;
	originGame?: string | null;
	trainerId?: string | null;
	spriteUrl?: string | null;
}): CarryState | null {
	if (input.slot.kind !== 'pokemon') {
		return null;
	}

	return {
		mode: input.mode ?? 'move',
		source: input.source,
		sourceOwner: input.pane.source,
		pokemonLabel: input.slot.label,
		spriteUrl: input.spriteUrl ?? null,
		sourceLabel: describeSlotRef(input.source, input.pane.source.label),
		origin: {
			entryMode: input.mode === 'copy' ? 'copied-in' : 'moved-in',
			originSaveFileName:
				input.pane.source.type === 'save-file' ? input.pane.source.label : 'Pokemon Storage',
			originGame: input.originGame ?? null,
			originalTrainer: input.slot.originalTrainer ?? null,
			trainerId: input.trainerId ?? null,
			enteredAt: input.now?.() ?? new Date().toISOString()
		}
	};
}

export function toggleCarryMode(carry: CarryState): CarryState {
	return {
		...carry,
		mode: carry.mode === 'move' ? 'copy' : 'move',
		origin: {
			...carry.origin,
			entryMode: carry.mode === 'move' ? 'copied-in' : 'moved-in'
		}
	};
}

export function evaluateDestination(input: {
	carry: CarryState;
	destinationPane: BoxPaneState;
	destination: WorkbenchSlotRef;
	destinationSlot: SlotView | null;
}): DestinationEvaluation {
	const { carry, destinationPane, destination, destinationSlot } = input;
	const sameSource = isSameWorkbenchSlotRef(carry.source, destination);

	if (sameSource) {
		return {
			valid: true,
			state: 'source',
			label: 'Original Slot',
			consequence: 'Cancel the carry or choose a different destination.',
			mutations: []
		};
	}

	if (destination.zone === 'party' && destination.slot > 5) {
		return invalidDestination('Invalid Party Slot', 'That Party Slot is outside the active party.');
	}

	if (destination.zone === 'box' && destination.slot >= BOX_SLOT_COUNT) {
		return invalidDestination('Invalid Box Slot', 'That Box Slot is outside the visible box.');
	}

	if (!destinationSlot) {
		return invalidDestination('Unavailable Slot', 'That destination is not available yet.');
	}

	if (carry.mode === 'copy' && destinationSlot.kind === 'pokemon') {
		return invalidDestination('Copy needs empty Slot', 'Choose an empty Slot or switch to Move.');
	}

	const occupied = destinationSlot.kind === 'pokemon';
	const sourceType = carry.sourceOwner.type;
	const destinationType = destinationPane.source.type;

	if (sourceType === 'pokemon-storage' && destinationType === 'save-file' && occupied) {
		return invalidDestination(
			'Storage needs empty Slot',
			'Choose an empty Save File Slot before moving from Pokemon Storage.'
		);
	}

	const movementLabel = carry.mode === 'copy' ? 'Copy' : occupied ? 'Swap' : 'Move';
	const destinationLabel = describeSlotRef(destination, destinationPane.source.label);

	return {
		valid: true,
		state: occupied ? 'occupied-swap' : 'empty-drop',
		label: occupied ? 'Swap target' : 'Valid drop',
		consequence: `${movementLabel} ${carry.pokemonLabel} -> ${destinationLabel}`,
		mutations: createMutationPlan({
			mode: carry.mode,
			sourcePaneId: carry.source.paneId,
			sourceType,
			destinationPaneId: destinationPane.id,
			destinationType,
			occupied
		})
	};
}

export function destinationStateForEvaluation(
	evaluation: DestinationEvaluation | null
): 'valid' | 'invalid' | 'source' | null {
	if (!evaluation) {
		return null;
	}

	if (!evaluation.valid) {
		return 'invalid';
	}

	return evaluation.state === 'source' ? 'source' : 'valid';
}

export function createSourcePickerCards(input: {
	saveFiles: Array<{
		id: SaveFileId;
		fileName: string | null;
		gameLabel?: string | null;
		boxCount?: number | null;
		pokemonCount?: number | null;
		active?: boolean;
	}>;
	includePokemonStorage?: boolean;
}): SourcePickerCard[] {
	const saveCards = input.saveFiles.map((saveFile) => ({
		id: saveFile.id,
		type: 'save-file' as const,
		label: saveFile.fileName ?? 'Untitled Save File',
		metadata: [
			saveFile.gameLabel,
			typeof saveFile.boxCount === 'number' ? `${saveFile.boxCount} boxes` : null,
			typeof saveFile.pokemonCount === 'number' ? `${saveFile.pokemonCount} Pokemon` : null,
			saveFile.active ? 'active' : null
		]
			.filter((value): value is string => Boolean(value))
			.join(' · '),
		active: saveFile.active === true,
		treatment: 'save-file' as const
	}));

	return input.includePokemonStorage === false
		? saveCards
		: [
				{
					id: 'pokemon-storage',
					type: 'pokemon-storage',
					label: 'Pokemon Storage',
					metadata: 'Automatically saved by PKSX',
					active: false,
					treatment: 'app-owned'
				},
				...saveCards
			];
}

function createMutationPlan(input: {
	mode: TransferOperationMode;
	sourcePaneId: string;
	sourceType: BoxSourceType;
	destinationPaneId: string;
	destinationType: BoxSourceType;
	occupied: boolean;
}): WorkbenchMutationPlan[] {
	const plans: WorkbenchMutationPlan[] = [];
	const destinationMutation = input.occupied && input.mode === 'move' ? 'swap' : 'insert';

	plans.push(ownerMutation(input.destinationType, input.destinationPaneId, destinationMutation));

	if (input.mode === 'move') {
		plans.push(
			ownerMutation(
				input.sourceType,
				input.sourcePaneId,
				input.occupied ? 'swap' : input.sourceType === 'pokemon-storage' ? 'remove' : 'clear'
			)
		);
	}

	return plans;
}

function ownerMutation(
	sourceType: BoxSourceType,
	paneId: string,
	mutation: 'insert' | 'clear' | 'swap' | 'remove'
): WorkbenchMutationPlan {
	if (sourceType === 'pokemon-storage') {
		return {
			owner: 'pokemon-storage',
			paneId,
			sourceType,
			mutation: mutation === 'clear' ? 'remove' : mutation,
			autoSaved: true
		};
	}

	return {
		owner: 'save-file',
		paneId,
		sourceType,
		mutation: mutation === 'remove' ? 'clear' : mutation,
		requiresBackup: true,
		dirtiesWorkspace: true
	};
}

function invalidDestination(label: string, reason: string): DestinationEvaluation {
	return {
		valid: false,
		state: 'invalid',
		label,
		reason,
		consequence: reason,
		mutations: []
	};
}

function isSameWorkbenchSlotRef(left: WorkbenchSlotRef, right: WorkbenchSlotRef): boolean {
	return (
		left.paneId === right.paneId &&
		left.zone === right.zone &&
		left.box === right.box &&
		left.slot === right.slot
	);
}

function describeSlotRef(ref: WorkbenchSlotRef, sourceLabel: string): string {
	if (ref.zone === 'party') {
		return `${sourceLabel} - Party Slot ${ref.slot + 1}`;
	}

	return `${sourceLabel} - Box ${String((ref.box ?? 0) + 1).padStart(2, '0')} Slot ${String(
		ref.slot + 1
	).padStart(2, '0')}`;
}

function inferBoxCountForSource(source: BoxSourceRef): number {
	return source.type === 'pokemon-storage' ? 8 : 1;
}

function clampBox(box: number, boxCount: number): number {
	return Math.max(0, Math.min(box, Math.max(1, boxCount) - 1));
}
