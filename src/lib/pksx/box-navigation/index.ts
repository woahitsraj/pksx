export const PARTY_COLUMNS = 3;
export const PARTY_ROWS = 2;
export const PARTY_SLOT_COUNT = PARTY_COLUMNS * PARTY_ROWS;
export const BOX_COLUMNS = 6;
export const BOX_ROWS = 5;
export const BOX_SLOT_COUNT = BOX_COLUMNS * BOX_ROWS;
export type FocusZone = 'party' | 'paneControls' | 'box' | 'actions';

export type SlotFocus = { zone: 'party'; slot: number } | { zone: 'box'; slot: number };

export type ControllerFocus =
	| { zone: 'paneControls'; index: number }
	| SlotFocus
	| { zone: 'actions'; index: number };

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
	locationFocus: SlotFocus;
	activeBox: number;
	boxCount: number;
};

export type NavigationOptions = {
	paneControlCount?: number;
	partyAvailable?: boolean;
	carryActive?: boolean;
};

type ResolvedNavigationOptions = Required<NavigationOptions>;
type NavigationCommand = Exclude<NavigationAction, 'up' | 'down' | 'left' | 'right' | 'confirm'>;

export function createInitialNavigationState(boxCount: number): BoxNavigationState {
	const locationFocus = focusBoxSlot(0);
	return {
		focus: locationFocus,
		locationFocus,
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

	if (action === 'previousBox' || action === 'nextBox') {
		return changeLocation(state, action === 'previousBox' ? -1 : 1, resolvedOptions);
	}
	if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
		return moveFocus(state, action, resolvedOptions);
	}
	return action === 'confirm' ? state : applyNavigationCommand(state, action);
}

function resolveNavigationOptions(options: NavigationOptions): ResolvedNavigationOptions {
	return {
		paneControlCount: Math.max(0, options.paneControlCount ?? 0),
		partyAvailable: options.partyAvailable ?? true,
		carryActive: options.carryActive ?? false
	};
}

function applyNavigationCommand(
	state: BoxNavigationState,
	action: NavigationCommand
): BoxNavigationState {
	switch (action) {
		case 'back':
		case 'sourceAction':
		case 'carryMode':
		case 'search':
		case 'previousBox':
		case 'nextBox':
			return state;
	}
}

function changeLocation(
	state: BoxNavigationState,
	offset: -1 | 1,
	options: ResolvedNavigationOptions
): BoxNavigationState {
	const boxCount = Math.max(1, state.boxCount);
	const partyOffset = options.partyAvailable ? 1 : 0;
	const locationCount = boxCount + partyOffset;
	const current = state.locationFocus.zone === 'party' ? 0 : state.activeBox + partyOffset;
	const next = wrapIndex(current + offset, locationCount);
	const nextLocation = options.partyAvailable && next === 0 ? 'party' : 'box';
	const nextBox = nextLocation === 'box' ? next - partyOffset : state.activeBox;
	const locationFocus = projectSlotCoordinate(state.locationFocus, nextLocation);

	return {
		...state,
		activeBox: nextLocation === 'box' ? nextBox : state.activeBox,
		locationFocus,
		focus: state.focus.zone === 'paneControls' ? state.focus : locationFocus
	};
}

function moveFocus(
	state: BoxNavigationState,
	direction: 'up' | 'down' | 'left' | 'right',
	options: ResolvedNavigationOptions
): BoxNavigationState {
	const focus = state.focus;
	let next = focus;

	if (focus.zone === 'paneControls') {
		if (direction === 'down') next = state.locationFocus;
		else if (direction === 'left' || direction === 'right') {
			next = focusPaneControl(
				focus.index + (direction === 'left' ? -1 : 1),
				options.paneControlCount
			);
		}
	} else if (focus.zone === 'party' || focus.zone === 'box') {
		next = moveSlotFocus(focus, direction, options);
	}

	return {
		...state,
		focus: next,
		locationFocus: next.zone === 'party' || next.zone === 'box' ? next : state.locationFocus
	};
}

function moveSlotFocus(
	focus: SlotFocus,
	direction: 'up' | 'down' | 'left' | 'right',
	options: ResolvedNavigationOptions
): ControllerFocus {
	const columns = focus.zone === 'party' ? PARTY_COLUMNS : BOX_COLUMNS;
	const rows = focus.zone === 'party' ? PARTY_ROWS : BOX_ROWS;
	const row = Math.floor(focus.slot / columns);
	const column = focus.slot % columns;

	if (direction === 'up') {
		if (row === 0) {
			return options.carryActive || options.paneControlCount === 0
				? focus
				: focusPaneControl(0, options.paneControlCount);
		}
		return focusForLocation(focus.zone, focus.slot - columns);
	}
	if (direction === 'down') {
		return row === rows - 1 ? focus : focusForLocation(focus.zone, focus.slot + columns);
	}
	if (direction === 'left') {
		return column === 0 ? focus : focusForLocation(focus.zone, focus.slot - 1);
	}
	return column === columns - 1 ? focus : focusForLocation(focus.zone, focus.slot + 1);
}

export function focusPartySlot(slot: number): SlotFocus {
	return { zone: 'party', slot: clamp(slot, 0, PARTY_SLOT_COUNT - 1) };
}

export function focusBoxSlot(slot: number): SlotFocus {
	return { zone: 'box', slot: clamp(slot, 0, BOX_SLOT_COUNT - 1) };
}

export function focusPaneBoundarySlot(slot: number, direction: 'left' | 'right'): SlotFocus {
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

export function setLocationFocus(
	state: BoxNavigationState,
	locationFocus: SlotFocus,
	options: { retainControlFocus?: boolean } = {}
): BoxNavigationState {
	return {
		...state,
		locationFocus,
		focus:
			options.retainControlFocus && state.focus.zone === 'paneControls'
				? state.focus
				: locationFocus
	};
}

export function getFocusId(focus: ControllerFocus, activeBox: number): string {
	switch (focus.zone) {
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
	return getSlotPosition(slot, BOX_COLUMNS, BOX_SLOT_COUNT);
}

export function getPartySlotPosition(slot: number): { row: number; column: number } {
	return getSlotPosition(slot, PARTY_COLUMNS, PARTY_SLOT_COUNT);
}

export function projectSlotCoordinate(focus: SlotFocus, zone: SlotFocus['zone']): SlotFocus {
	const fromColumns = focus.zone === 'party' ? PARTY_COLUMNS : BOX_COLUMNS;
	const toColumns = zone === 'party' ? PARTY_COLUMNS : BOX_COLUMNS;
	const toRows = zone === 'party' ? PARTY_ROWS : BOX_ROWS;
	const row = Math.min(Math.floor(focus.slot / fromColumns), toRows - 1);
	const column = Math.min(focus.slot % fromColumns, toColumns - 1);
	return focusForLocation(zone, row * toColumns + column);
}

function getSlotPosition(slot: number, columns: number, count: number) {
	const clampedSlot = clamp(slot, 0, count - 1);
	return {
		row: Math.floor(clampedSlot / columns),
		column: clampedSlot % columns
	};
}

function focusForLocation(zone: SlotFocus['zone'], slot: number): SlotFocus {
	return zone === 'party' ? focusPartySlot(slot) : focusBoxSlot(slot);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function wrapIndex(value: number, count: number): number {
	return ((value % count) + count) % count;
}
