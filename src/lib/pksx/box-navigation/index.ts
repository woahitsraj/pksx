export const PARTY_SLOT_COUNT = 6;
export const BOX_COLUMNS = 6;
export const BOX_ROWS = 5;
export const BOX_SLOT_COUNT = BOX_COLUMNS * BOX_ROWS;
export const TOP_CONTROL_COUNT = 5;
export const MOBILE_TAB_COUNT = 3;

export type FocusZone =
	| 'topbar'
	| 'partyToggle'
	| 'party'
	| 'paneControls'
	| 'box'
	| 'actions'
	| 'mobileTabs';

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
			zone: 'topbar';
			index: number;
	  }
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
	  }
	| {
			zone: 'mobileTabs';
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
	| 'carryMode';

export type BoxNavigationState = {
	focus: ControllerFocus;
	activeBox: number;
	boxCount: number;
};

export type NavigationOptions = {
	topControlCount?: number;
	paneControlCount?: number;
	mobileTabCount?: number;
	mobileTabsAvailable?: boolean;
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
		topControlCount: Math.max(1, options.topControlCount ?? TOP_CONTROL_COUNT),
		paneControlCount: Math.max(0, options.paneControlCount ?? 0),
		mobileTabCount: Math.max(1, options.mobileTabCount ?? MOBILE_TAB_COUNT),
		mobileTabsAvailable: options.mobileTabsAvailable ?? true,
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

export function focusTopControl(
	index: number,
	topControlCount = TOP_CONTROL_COUNT
): ControllerFocus {
	return { zone: 'topbar', index: clamp(index, 0, Math.max(1, topControlCount) - 1) };
}

export function focusPaneControl(index: number, paneControlCount = 1): ControllerFocus {
	return { zone: 'paneControls', index: clamp(index, 0, Math.max(1, paneControlCount) - 1) };
}

export function focusActionCommand(index: number, actionCount = 1): ControllerFocus {
	return { zone: 'actions', index: clamp(index, 0, Math.max(1, actionCount) - 1) };
}

export function focusMobileTab(index: number): ControllerFocus {
	return { zone: 'mobileTabs', index: clamp(index, 0, MOBILE_TAB_COUNT - 1) };
}

export function selectActiveBox(state: BoxNavigationState, index: number): BoxNavigationState {
	return { ...state, activeBox: clamp(index, 0, state.boxCount - 1) };
}

export function getFocusId(focus: ControllerFocus, activeBox: number): string {
	switch (focus.zone) {
		case 'topbar':
			return `top-control-${focus.index}`;
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
		case 'mobileTabs':
			return `mobile-tab-${focus.index}`;
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
		case 'topbar':
			return moveUpFromTopbar(focus.index, options);
		case 'paneControls':
			return moveUpFromPaneControls(focus.index, options);
		case 'party':
			return focusPartyToggle();
		case 'partyToggle':
			return focusTopbarFromBelow(0, options.topControlCount);
		case 'box':
			return moveUpFromBox(focus.slot, options);
		case 'mobileTabs':
			return focusBoxSlot(BOX_SLOT_COUNT - BOX_COLUMNS + Math.min(focus.index, BOX_COLUMNS - 1));
		case 'actions':
			return focus;
	}
}

function moveUpFromTopbar(index: number, options: ResolvedNavigationOptions): ControllerFocus {
	const sourceControlIndex = getSourceControlIndex(options.topControlCount);
	if (sourceControlIndex === null || index < sourceControlIndex) {
		return focusTopControl(index, options.topControlCount);
	}

	const firstIndex = getFirstTopControlIndex(options.mobileTabsAvailable);
	return focusTopControl(
		index === sourceControlIndex
			? Math.max(firstIndex, sourceControlIndex - 1)
			: sourceControlIndex,
		options.topControlCount
	);
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

	return focusTopbarFromBelow(
		Math.min(index, options.topControlCount - 1),
		options.topControlCount
	);
}

function focusTopbarFromBelow(fallbackIndex: number, topControlCount: number): ControllerFocus {
	const sourceControlIndex = getSourceControlIndex(topControlCount);
	return focusTopControl(sourceControlIndex ?? fallbackIndex, topControlCount);
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
		return focusTopbarFromBelow(
			Math.min(column, options.topControlCount - 1),
			options.topControlCount
		);
	}
	return options.partyCollapsed ? focusPartyToggle() : focusPartySlot(column);
}

function moveDown(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	switch (focus.zone) {
		case 'topbar':
			return moveDownFromTopbar(focus.index, options);
		case 'partyToggle':
			return moveDownFromPartyToggle(options);
		case 'party':
			return moveDownFromParty(focus.slot, options.paneControlCount);
		case 'paneControls':
			return focusBoxSlot(Math.min(focus.index, BOX_COLUMNS - 1));
		case 'box':
			return moveDownFromBox(focus.slot, options.mobileTabsAvailable);
		case 'mobileTabs':
		case 'actions':
			return focus;
	}
}

function moveDownFromTopbar(index: number, options: ResolvedNavigationOptions): ControllerFocus {
	const sourceControlIndex = getSourceControlIndex(options.topControlCount);
	if (sourceControlIndex !== null && index !== sourceControlIndex) {
		return focusTopControl(sourceControlIndex, options.topControlCount);
	}
	if (options.partyAvailable) {
		return focusPartyToggle();
	}
	return options.paneControlCount > 0
		? focusPaneControl(0, options.paneControlCount)
		: focusBoxSlot(Math.min(index, BOX_COLUMNS - 1));
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

function moveDownFromBox(slot: number, mobileTabsAvailable: boolean): ControllerFocus {
	const { row } = getBoxSlotPosition(slot);
	if (row < BOX_ROWS - 1) {
		return focusBoxSlot(slot + BOX_COLUMNS);
	}
	return mobileTabsAvailable ? focusMobileTab(1) : focusBoxSlot(slot);
}

function moveLeft(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	const firstTopControlIndex = getFirstTopControlIndex(options.mobileTabsAvailable);

	switch (focus.zone) {
		case 'topbar':
			return focusOrderedTopControl(focus.index, -1, firstTopControlIndex, options.topControlCount);
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
		case 'mobileTabs':
			return focusMobileTab(clamp(focus.index - 1, 0, options.mobileTabCount - 1));
		case 'actions':
			return focus;
	}
}

function moveRight(focus: ControllerFocus, options: ResolvedNavigationOptions): ControllerFocus {
	const firstTopControlIndex = getFirstTopControlIndex(options.mobileTabsAvailable);

	switch (focus.zone) {
		case 'topbar':
			return focusOrderedTopControl(focus.index, 1, firstTopControlIndex, options.topControlCount);
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
		case 'mobileTabs':
			return focusMobileTab(clamp(focus.index + 1, 0, options.mobileTabCount - 1));
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

function getSourceControlIndex(topControlCount: number): number | null {
	return topControlCount > TOP_CONTROL_COUNT ? TOP_CONTROL_COUNT : null;
}

function getFirstTopControlIndex(mobileTabsAvailable: boolean): number {
	return mobileTabsAvailable ? 3 : 0;
}

function focusOrderedTopControl(
	currentIndex: number,
	direction: -1 | 1,
	firstIndex: number,
	topControlCount: number
): ControllerFocus {
	const order = topControlOrder(firstIndex, topControlCount);
	const currentPosition = order.includes(currentIndex)
		? order.indexOf(currentIndex)
		: nearestTopControlPosition(currentIndex, order);
	const nextPosition = clamp(currentPosition + direction, 0, order.length - 1);
	return focusTopControl(order[nextPosition] ?? firstIndex, topControlCount);
}

function topControlOrder(firstIndex: number, topControlCount: number): number[] {
	const order = Array.from(
		{ length: topControlCount - firstIndex },
		(_, index) => firstIndex + index
	);
	const sourceControlIndex = getSourceControlIndex(topControlCount);
	const themeControlIndex = topControlCount > 6 ? 6 : null;

	if (
		sourceControlIndex !== null &&
		themeControlIndex !== null &&
		order.includes(sourceControlIndex) &&
		order.includes(themeControlIndex)
	) {
		return order.filter((index) => index !== sourceControlIndex).concat(sourceControlIndex);
	}

	return order;
}

function nearestTopControlPosition(index: number, order: number[]): number {
	if (order.length === 0) {
		return 0;
	}

	return order.reduce((nearest, candidate, position) => {
		const current = order[nearest] ?? candidate;
		return Math.abs(candidate - index) < Math.abs(current - index) ? position : nearest;
	}, 0);
}
