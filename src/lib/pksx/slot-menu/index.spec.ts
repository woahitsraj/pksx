import { describe, expect, it } from 'vitest';
import type { SlotView } from '$lib/components/pksx/types';
import { createSlotMenuCommands } from '.';

const empty: SlotView = {
	slot: 0,
	label: 'Empty',
	detail: '',
	level: null,
	experience: null,
	experienceProjection: null,
	speciesId: null,
	form: null,
	isEgg: false,
	spriteIdentity: null,
	kind: 'empty'
};

const occupied = { ...empty, label: 'Pikachu', speciesId: 25, kind: 'pokemon' } satisfies SlotView;
const noDynamicActions = { edit: true, legality: true, evolve: false };

describe('Slot Menu commands', () => {
	it('shows only Create Pokemon for a supported empty Slot', () => {
		expect(createSlotMenuCommands(empty, null, noDynamicActions).map(({ label }) => label)).toEqual(
			['Create Pokemon']
		);
	});

	it('hides every unavailable command', () => {
		expect(
			createSlotMenuCommands(empty, 'Pokemon Storage is unsupported.', noDynamicActions)
		).toEqual([]);
		expect(
			createSlotMenuCommands(occupied, null, { edit: false, legality: false, evolve: false }).map(
				({ label }) => label
			)
		).toEqual(['Move', 'Copy', 'Clear Slot']);
	});

	it('adds Evolve only after the engine reports a direct evolution', () => {
		expect(
			createSlotMenuCommands(occupied, null, { ...noDynamicActions, evolve: true }).map(
				({ label }) => label
			)
		).toContain('Evolve');
	});
});
