import { describe, expect, it } from 'vitest';

import {
	applyNavigationAction,
	crossPaneSharedEdge,
	createInitialNavigationState,
	focusBoxSlot,
	focusPaneBoundarySlot,
	focusPaneControl,
	focusPartySlot,
	getFocusId,
	projectSlotCoordinate,
	selectActiveBox,
	setLocationFocus,
	type BoxNavigationState
} from './index';

describe('box navigation', () => {
	it('starts on Slot 0 of Box 1', () => {
		const locationFocus = focusBoxSlot(0);
		expect(createInitialNavigationState(3)).toEqual({
			focus: locationFocus,
			locationFocus,
			activeBox: 0,
			boxCount: 3
		});
	});

	it('clamps the 6 by 5 Box and 3 by 2 Party edges', () => {
		expect(
			move({ focus: focusPartySlot(0), locationFocus: focusPartySlot(0) }, 'left').focus
		).toEqual(focusPartySlot(0));
		expect(
			move({ focus: focusPartySlot(2), locationFocus: focusPartySlot(2) }, 'right').focus
		).toEqual(focusPartySlot(2));
		expect(
			move({ focus: focusPartySlot(5), locationFocus: focusPartySlot(5) }, 'down').focus
		).toEqual(focusPartySlot(5));
		expect(
			move({ focus: focusBoxSlot(29), locationFocus: focusBoxSlot(29) }, 'down').focus
		).toEqual(focusBoxSlot(29));
	});

	it('moves from a top-row Slot to the collection control and back to the remembered Slot', () => {
		let state = move({ focus: focusBoxSlot(4), locationFocus: focusBoxSlot(4) }, 'up', {
			paneControlCount: 1
		});
		expect(state.focus).toEqual(focusPaneControl(0));
		expect(state.locationFocus).toEqual(focusBoxSlot(4));

		state = move(state, 'down', { paneControlCount: 1 });
		expect(state.focus).toEqual(focusBoxSlot(4));
	});

	it('keeps Carry on Slots and skips the collection control', () => {
		const state = move({ focus: focusBoxSlot(4), locationFocus: focusBoxSlot(4) }, 'up', {
			paneControlCount: 1,
			carryActive: true
		});
		expect(state.focus).toEqual(focusBoxSlot(4));
	});

	it('cycles Party then Boxes with coordinate projection and wrap', () => {
		let state = move({ focus: focusBoxSlot(29), locationFocus: focusBoxSlot(29) }, 'nextBox');
		expect(state).toMatchObject({ activeBox: 1, focus: focusBoxSlot(29) });

		state = move(state, 'previousBox');
		expect(state).toMatchObject({ activeBox: 0, focus: focusBoxSlot(29) });

		state = move(state, 'previousBox');
		expect(state).toMatchObject({ activeBox: 0, focus: focusPartySlot(5) });

		state = move(state, 'previousBox');
		expect(state).toMatchObject({ activeBox: 2, focus: focusBoxSlot(8) });

		state = move(state, 'nextBox');
		expect(state).toMatchObject({ activeBox: 2, focus: focusPartySlot(5) });
	});

	it('omits Party from Pokemon Storage shoulder navigation', () => {
		let state = move({}, 'previousBox', { partyAvailable: false });
		expect(state).toMatchObject({ activeBox: 2, focus: focusBoxSlot(0) });
		state = move(state, 'nextBox', { partyAvailable: false });
		expect(state).toMatchObject({ activeBox: 0, focus: focusBoxSlot(0) });
	});

	it('changes Location while retaining collection-control focus', () => {
		const state = move(
			{ focus: focusPaneControl(0), locationFocus: focusBoxSlot(17), activeBox: 1 },
			'previousBox',
			{ paneControlCount: 1 }
		);
		expect(state.focus).toEqual(focusPaneControl(0));
		expect(state.locationFocus).toEqual(focusBoxSlot(17));
		expect(state.activeBox).toBe(0);
	});

	it('projects coordinates when a current Location vanishes', () => {
		const state = setLocationFocus(
			{
				...createInitialNavigationState(3),
				focus: focusPaneControl(0),
				locationFocus: focusPartySlot(5)
			},
			projectSlotCoordinate(focusPartySlot(5), 'box'),
			{ retainControlFocus: true }
		);
		expect(state.focus).toEqual(focusPaneControl(0));
		expect(state.locationFocus).toEqual(focusBoxSlot(8));
	});

	it('projects pane crossing to the opposite pane edge in the same row', () => {
		expect(focusPaneBoundarySlot(5, 'right')).toEqual(focusBoxSlot(0));
		expect(focusPaneBoundarySlot(11, 'right')).toEqual(focusBoxSlot(6));
		expect(focusPaneBoundarySlot(0, 'left')).toEqual(focusBoxSlot(5));
		expect(focusPaneBoundarySlot(24, 'left')).toEqual(focusBoxSlot(29));
	});

	it('reserves Search as a Navigation Action without changing Boxes', () => {
		const state = { ...createInitialNavigationState(3), focus: focusBoxSlot(12) };

		expect(applyNavigationAction(state, 'search')).toEqual(state);
	});

	it('crosses the rendered shared edge and clamps rows into Party', () => {
		const panes: Parameters<typeof crossPaneSharedEdge>[0]['panes'] = [
			{
				id: 'leading',
				location: 'box' as const,
				bounds: { top: 0, right: 300, bottom: 300, left: 0 }
			},
			{
				id: 'trailing',
				location: 'party' as const,
				bounds: { top: 0, right: 640, bottom: 300, left: 340 }
			}
		];

		expect(
			crossPaneSharedEdge({
				panes,
				activePaneId: 'leading',
				direction: 'right',
				focus: focusBoxSlot(29)
			})
		).toEqual({ paneId: 'trailing', focus: focusPartySlot(3) });
		expect(
			crossPaneSharedEdge({
				panes,
				activePaneId: 'trailing',
				direction: 'left',
				focus: focusPartySlot(3)
			})
		).toEqual({ paneId: 'leading', focus: focusBoxSlot(11) });
		expect(
			crossPaneSharedEdge({
				panes,
				activePaneId: 'leading',
				direction: 'right',
				focus: focusBoxSlot(28)
			})
		).toBeNull();
	});

	it('crosses a stacked shared edge and clamps columns into Party', () => {
		const panes: Parameters<typeof crossPaneSharedEdge>[0]['panes'] = [
			{
				id: 'upper',
				location: 'box' as const,
				bounds: { top: 0, right: 300, bottom: 220, left: 0 }
			},
			{
				id: 'lower',
				location: 'party' as const,
				bounds: { top: 260, right: 300, bottom: 480, left: 0 }
			}
		];

		expect(
			crossPaneSharedEdge({
				panes,
				activePaneId: 'upper',
				direction: 'down',
				focus: focusBoxSlot(29)
			})
		).toEqual({ paneId: 'lower', focus: focusPartySlot(2) });
		expect(
			crossPaneSharedEdge({
				panes,
				activePaneId: 'lower',
				direction: 'up',
				focus: focusPartySlot(1)
			})
		).toEqual({ paneId: 'upper', focus: focusBoxSlot(25) });
		expect(
			crossPaneSharedEdge({
				panes,
				activePaneId: 'upper',
				direction: 'down',
				focus: focusBoxSlot(23)
			})
		).toBeNull();
	});

	it('selects a specific Box without changing the current coordinate', () => {
		const state = selectActiveBox(
			{
				...createInitialNavigationState(30),
				focus: focusBoxSlot(17),
				locationFocus: focusBoxSlot(17)
			},
			29
		);
		expect(state).toMatchObject({ activeBox: 29, focus: focusBoxSlot(17) });
		expect(selectActiveBox(state, -1)).toMatchObject({ activeBox: 0 });
		expect(selectActiveBox(state, 40)).toMatchObject({ activeBox: 29 });
	});

	it('exposes stable active descendant ids', () => {
		expect(getFocusId(focusPaneControl(1, 2), 1)).toBe('pane-control-1');
		expect(getFocusId(focusPartySlot(4), 1)).toBe('party-slot-4');
		expect(getFocusId(focusBoxSlot(4), 1)).toBe('box-1-slot-4');
	});
});

function move(
	overrides: Partial<BoxNavigationState>,
	action: Parameters<typeof applyNavigationAction>[1],
	options: Parameters<typeof applyNavigationAction>[2] = {}
): BoxNavigationState {
	return applyNavigationAction(
		{ ...createInitialNavigationState(3), ...overrides },
		action,
		options
	);
}
