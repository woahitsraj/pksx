export const PARTY_SLOT_COUNT = 6;
export const BOX_COLUMNS = 6;
export const BOX_ROWS = 5;
export const BOX_SLOT_COUNT = BOX_COLUMNS * BOX_ROWS;
export type FocusZone = 'partyToggle' | 'party' | 'paneControls' | 'box' | 'actions';

export type SlotFocus =
	| {
			zone: 'party';
			slot: number;
	  }
	| {
			zone: 'box';
			slot: number;
	  };

export type ControllerFocus =
	| {
			zone: 'partyToggle';
	  }
	| {
			zone: 'paneControls';
			index: number;
	  }
	| SlotFocus
	| {
			zone: 'actions';
			index: number;
	  };

export type NavigationAction =
	| 'up'
	| 'down'
	| 'left'
	| 'right'
	| 'confirm'
	| 'back'
	| 'previousBox'
	| 'nextBox'
	| 'sourceAction'
	| 'carryMode'
	| 'search';

export type BoxNavigationState = {
	focus: ControllerFocus;
	activeBox: number;
	boxCount: number;
};

export type NavigationOptions = {
	paneControlCount?: number;
	partyAvailable?: boolean;
	partyCollapsed?: boolean;
};

type ResolvedNavigationOptions = Required<NavigationOptions>;
type NavigationCommand = Exclude<NavigationAction, 'up' | 'down' | 'left' | 'right' | 'confirm'>;
type FocusMovement = (
	focus: ControllerFocus,
	options: ResolvedNavigationOptions
) => ControllerFocus;

const focusMovements: Partial<Record<NavigationAction, FocusMovement>> = {
	up: moveUp,
	down: moveDown,
	left: moveLeft,
	right: moveRight
};

export function createInitialNavigationState(boxCount: number): BoxNavigationState {
	return {
		focus: { zone: 'box', slot: 0 },
		activeBox: 0,
		boxCount: Math.max(1, boxCount)
	};
}

export function applyNavigationAction(
	state: BoxNavigationState,
	action: NavigationAction,
	options: NavigationOptions = {}
): BoxNavigationState {
	const resolvedOptions = resolveNavigationOptions(options);

	const moveFocus = focusMovements[action];
	return moveFocus
		? { ...state, focus: moveFocus(state.focus, resolvedOptions) }
		: action === 'confirm'
			? state
			: applyNavigationCommand(state, action as NavigationCommand);
}

function resolveNavigationOptions(options: NavigationOptions): ResolvedNavigationOptions {
	return {
		paneControlCount: Math.max(0, options.paneControlCount ?? 0),
		partyAvailable: options.partyAvailable ?? true,
		partyCollapsed: options.partyCollapsed ?? false
	};
}

function applyNavigationCommand(
	state: BoxNavigationState,
	action: NavigationCommand
): BoxNavigationState {
	switch (action) {
		case 'previousBox':
			return changeActiveBox(state, -1);
		case 'nextBox':
			return changeActiveBox(state, 1);
		case 'back':
		case 'sourceAction':
		case 'carryMode':
		case 'search':
			return state;
	}
}

function changeActiveBox(state: BoxNavigationState, offset: -1 | 1): BoxNavigationState {
	return {
		...state,
		activeBox: wrapBoxIndex(state.activeBox + offset, state.boxCount),
		focus: focusFirstRowForBoxChange(state.focus)
	};
}

export function focusPartySlot(slot: number): ControllerFocus {
	return { zone: 'party', slot: clamp(slot, 0, PARTY_SLOT_COUNT - 1) };
}

export function focusPartyToggle(): ControllerFocus {
	return { zone: 'partyToggle' };
}

export function focusBoxSlot(slot: number): ControllerFocus {
	return { zone: 'box', slot: clamp(slot, 0, BOX_SLOT_COUNT - 1) };
}

export function focusPaneBoundarySlot(slot: number, direction: 'left' | 'right'): ControllerFocus {
	const { row } = getBoxSlotPosition(slot);
	const column = direction === 'right' ? 0 : BOX_COLUMNS - 1;
	return focusBoxSlot(row * BOX_COLUMNS + column);
}

export function focusPaneControl(index: number, paneControlCount = 1): ControllerFocus {
	return { zone: 'paneControls', index: clamp(index, 0, Math.max(1, paneControlCount) - 1) };
}

export function focusActionCommand(index: number, actionCount = 1): ControllerFocus {
	return { zone: 'actions', index: clamp(index, 0, Math.max(1, actionCount) - 1) };
}

export function selectActiveBox(state: BoxNavigationState, index: number): BoxNavigationState {
	return { ...state, activeBox: clamp(index, 0, state.boxCount - 1) };
}

export function getFocusId(focus: ControllerFocus, activeBox: number): string {
	switch (focus.zone) {
		case 'partyToggle':
			return 'party-toggle';
		case 'paneControls':
			return `pane-control-${focus.index}`;
		case 'party':
			return `party-slot-${focus.slot}`;
		case 'box':
			return `box-${activeBox}-slot-${focus.slot}`;
		case 'actions':
			return `slot-action-${focus.index}`;
	}
}

export function getBoxSlotPosition(slot: number): { row: number; column: number } {
	const clampedSlot = clamp(slot, 0, BOX_SLOT_COUNT - 1);
	return {
		row: Math.floor(clampedSlot / BOX_COLUMNS),
		column: clampedSlot % BOX_COLUMNS
	};
}

function focusFirstRowForBoxChange(focus: ControllerFocus): ControllerFocus {
	if (focus.zone !== 'box') {
		return focusBoxSlot(0);
	}

	return focusBoxSlot(getBoxSlotPosition(focus.slot).column);
}

function moveUp(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	switch (focus.zone) {
		case 'paneControls':
			return moveUpFromPaneControls(focus.index, options);
		case 'party':
			return focusPartyToggle();
		case 'partyToggle':
			return focus;
		case 'box':
			return moveUpFromBox(focus.slot, options);
		case 'actions':
			return focus;
	}
}

function moveUpFromPaneControls(
	index: number,
	options: ResolvedNavigationOptions
): ControllerFocus {
	if (options.partyAvailable) {
		return options.partyCollapsed
			? focusPartyToggle()
			: focusPartySlot(Math.min(index, PARTY_SLOT_COUNT - 1));
	}

	return focusPaneControl(index, options.paneControlCount);
}

function moveUpFromBox(slot: number, options: ResolvedNavigationOptions): ControllerFocus {
	const { row, column } = getBoxSlotPosition(slot);
	if (row > 0) {
		return focusBoxSlot(slot - BOX_COLUMNS);
	}
	if (options.paneControlCount > 0) {
		return focusPaneControl(
			Math.min(column, options.paneControlCount - 1),
			options.paneControlCount
		);
	}
	if (!options.partyAvailable) {
		return focusBoxSlot(slot);
	}
	return options.partyCollapsed ? focusPartyToggle() : focusPartySlot(column);
}

function moveDown(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	switch (focus.zone) {
		case 'partyToggle':
			return moveDownFromPartyToggle(options);
		case 'party':
			return moveDownFromParty(focus.slot, options.paneControlCount);
		case 'paneControls':
			return focusBoxSlot(Math.min(focus.index, BOX_COLUMNS - 1));
		case 'box':
			return moveDownFromBox(focus.slot);
		case 'actions':
			return focus;
	}
}

function moveDownFromPartyToggle(options: ResolvedNavigationOptions): ControllerFocus {
	if (!options.partyCollapsed) {
		return focusPartySlot(0);
	}
	return options.paneControlCount > 0
		? focusPaneControl(0, options.paneControlCount)
		: focusBoxSlot(0);
}

function moveDownFromParty(slot: number, paneControlCount: number): ControllerFocus {
	return paneControlCount > 0
		? focusPaneControl(Math.min(slot, paneControlCount - 1), paneControlCount)
		: focusBoxSlot(Math.min(slot, BOX_COLUMNS - 1));
}

function moveDownFromBox(slot: number): ControllerFocus {
	const { row } = getBoxSlotPosition(slot);
	if (row < BOX_ROWS - 1) {
		return focusBoxSlot(slot + BOX_COLUMNS);
	}
	return focusBoxSlot(slot);
}

function moveLeft(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	switch (focus.zone) {
		case 'partyToggle':
			return focus;
		case 'paneControls':
			return focusPaneControl(focus.index - 1, options.paneControlCount);
		case 'party':
			return focusPartySlot(focus.slot - 1);
		case 'box': {
			const { column } = getBoxSlotPosition(focus.slot);
			return column === 0 ? focus : focusBoxSlot(focus.slot - 1);
		}
		case 'actions':
			return focus;
	}
}

function moveRight(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	switch (focus.zone) {
		case 'partyToggle':
			return focus;
		case 'paneControls':
			return focusPaneControl(focus.index + 1, options.paneControlCount);
		case 'party':
			return focusPartySlot(focus.slot + 1);
		case 'box': {
			const { column } = getBoxSlotPosition(focus.slot);
			return column === BOX_COLUMNS - 1 ? focus : focusBoxSlot(focus.slot + 1);
		}
		case 'actions':
			return focus;
	}
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function wrapBoxIndex(value: number, boxCount: number): number {
	const count = Math.max(1, boxCount);
	return ((value % count) + count) % count;
}
