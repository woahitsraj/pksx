import { describe, expect, it } from 'vitest';

import {
	applyNavigationAction,
	createInitialNavigationState,
	focusBoxSlot,
	focusPaneBoundarySlot,
	focusPaneControl,
	focusPartySlot,
	focusPartyToggle,
	getFocusId,
	selectActiveBox,
	type BoxNavigationState
} from './index';

describe('box navigation', () => {
	it('starts on the first box slot', () => {
		expect.assertions(1);

		expect(createInitialNavigationState(3)).toEqual({
			focus: { zone: 'box', slot: 0 },
			activeBox: 0,
			boxCount: 3
		});
	});

	it('clamps horizontal movement at party and box edges', () => {
		expect.assertions(4);

		expect(move({ focus: focusPartySlot(0) }, 'left').focus).toEqual(focusPartySlot(0));
		expect(move({ focus: focusPartySlot(5) }, 'right').focus).toEqual(focusPartySlot(5));
		expect(move({ focus: focusBoxSlot(0) }, 'left').focus).toEqual(focusBoxSlot(0));
		expect(move({ focus: focusBoxSlot(5) }, 'right').focus).toEqual(focusBoxSlot(5));
	});

	it('transitions vertically within the Boxes workspace', () => {
		expect.assertions(8);

		expect(move({ focus: focusPartyToggle() }, 'down').focus).toEqual(focusPartySlot(0));
		expect(move({ focus: focusPartyToggle() }, 'up').focus).toEqual(focusPartyToggle());
		expect(move({ focus: focusPartySlot(2) }, 'down').focus).toEqual(focusBoxSlot(2));
		expect(move({ focus: focusBoxSlot(2) }, 'up').focus).toEqual(focusPartySlot(2));
		expect(move({ focus: focusBoxSlot(28) }, 'down').focus).toEqual(focusBoxSlot(28));
		expect(move({ focus: focusPartySlot(5) }, 'down', { paneControlCount: 2 }).focus).toEqual(
			focusPaneControl(1, 2)
		);
		expect(move({ focus: focusPaneControl(1, 2) }, 'down', { paneControlCount: 2 }).focus).toEqual(
			focusBoxSlot(1)
		);
		expect(move({ focus: focusBoxSlot(0) }, 'up', { paneControlCount: 2 }).focus).toEqual(
			focusPaneControl(0, 2)
		);
	});

	it('moves between pane controls', () => {
		expect.assertions(1);

		expect(move({ focus: focusPaneControl(0, 2) }, 'right', { paneControlCount: 2 }).focus).toEqual(
			focusPaneControl(1, 2)
		);
	});

	it('moves up from party slots to the party toggle', () => {
		expect.assertions(6);

		for (let slot = 0; slot < 6; slot += 1) {
			expect(move({ focus: focusPartySlot(slot) }, 'up').focus).toEqual(focusPartyToggle());
		}
	});

	it('skips hidden party slots while the party is collapsed', () => {
		expect.assertions(4);

		const options = { partyCollapsed: true };

		expect(move({ focus: focusPartyToggle() }, 'down', options).focus).toEqual(focusBoxSlot(0));
		expect(move({ focus: focusBoxSlot(3) }, 'up', options).focus).toEqual(focusPartyToggle());
		expect(
			move({ focus: focusPartyToggle() }, 'down', { ...options, paneControlCount: 1 }).focus
		).toEqual(focusPaneControl(0, 1));
		expect(
			move({ focus: focusPaneControl(0, 1) }, 'up', { ...options, paneControlCount: 1 }).focus
		).toEqual(focusPartyToggle());
	});

	it('can reach a single pane source selector from party and box focus', () => {
		expect.assertions(3);

		expect(move({ focus: focusPartySlot(0) }, 'down', { paneControlCount: 1 }).focus).toEqual(
			focusPaneControl(0, 1)
		);
		expect(move({ focus: focusBoxSlot(0) }, 'up', { paneControlCount: 1 }).focus).toEqual(
			focusPaneControl(0, 1)
		);
		expect(move({ focus: focusPaneControl(0, 1) }, 'down', { paneControlCount: 1 }).focus).toEqual(
			focusBoxSlot(0)
		);
	});

	it('clamps upward focus within box-only sources', () => {
		expect.assertions(2);

		const options = { paneControlCount: 0, partyAvailable: false };

		expect(move({ focus: focusBoxSlot(5) }, 'up', options).focus).toEqual(focusBoxSlot(5));
		expect(
			move({ focus: focusPaneControl(0, 1) }, 'up', {
				partyAvailable: false,
				paneControlCount: 1
			}).focus
		).toEqual(focusPaneControl(0, 1));
	});

	it('projects pane crossing to the opposite pane edge in the same row', () => {
		expect.assertions(4);

		expect(focusPaneBoundarySlot(5, 'right')).toEqual(focusBoxSlot(0));
		expect(focusPaneBoundarySlot(11, 'right')).toEqual(focusBoxSlot(6));
		expect(focusPaneBoundarySlot(0, 'left')).toEqual(focusBoxSlot(5));
		expect(focusPaneBoundarySlot(24, 'left')).toEqual(focusBoxSlot(29));
	});

	it('keeps focus on the last box row', () => {
		expect.assertions(1);

		const state = applyNavigationAction(
			{ ...createInitialNavigationState(3), focus: focusBoxSlot(28) },
			'down'
		);

		expect(state.focus).toEqual(focusBoxSlot(28));
	});

	it('reserves Search as a Navigation Action without changing Boxes', () => {
		const state = { ...createInitialNavigationState(3), focus: focusBoxSlot(12) };

		expect(applyNavigationAction(state, 'search')).toEqual(state);
	});

	it('moves focus to the first row when changing boxes and wraps at edges', () => {
		expect.assertions(5);

		let state = move({ focus: focusBoxSlot(17), activeBox: 1 }, 'nextBox');
		expect(state).toMatchObject({ activeBox: 2, focus: focusBoxSlot(5) });

		state = move(state, 'nextBox');
		expect(state).toMatchObject({ activeBox: 0, focus: focusBoxSlot(5) });

		state = move(state, 'previousBox');
		expect(state).toMatchObject({ activeBox: 2, focus: focusBoxSlot(5) });

		state = move(state, 'previousBox');
		expect(state).toMatchObject({ activeBox: 1, focus: focusBoxSlot(5) });

		expect(move({ focus: focusPartySlot(3), activeBox: 1 }, 'nextBox')).toMatchObject({
			activeBox: 2,
			focus: focusBoxSlot(0)
		});
	});

	it('selects a specific box in one state transition', () => {
		expect.assertions(3);

		const state = selectActiveBox(
			{ ...createInitialNavigationState(30), activeBox: 0, focus: focusBoxSlot(17) },
			29
		);

		expect(state).toMatchObject({ activeBox: 29, focus: focusBoxSlot(17) });
		expect(selectActiveBox(state, -1)).toMatchObject({ activeBox: 0 });
		expect(selectActiveBox(state, 40)).toMatchObject({ activeBox: 29 });
	});

	it('exposes stable active descendant ids', () => {
		expect.assertions(4);

		expect(getFocusId(focusPartyToggle(), 1)).toBe('party-toggle');
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
