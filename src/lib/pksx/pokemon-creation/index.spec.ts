import { describe, expect, it } from 'vitest';
import type { SlotView } from '$lib/components/pksx/types';
import { createPokemonCreationOperation, pokemonCreationAvailability } from '.';

const emptySlot: SlotView = {
	slot: 1,
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

describe('Pokemon creation', () => {
	it('is available only for empty Save File Slots with an active Save File', () => {
		expect(pokemonCreationAvailability('save-file', emptySlot, true)).toEqual({
			available: true,
			reason: null
		});
		expect(
			pokemonCreationAvailability('save-file', { ...emptySlot, kind: 'pokemon' }, true)
		).toMatchObject({ available: false });
		expect(pokemonCreationAvailability('pokemon-storage', emptySlot, true)).toMatchObject({
			available: false
		});
		expect(pokemonCreationAvailability('save-file', emptySlot, false)).toMatchObject({
			available: false
		});
	});

	it('builds default and species-specific engine operations', () => {
		const destination = { zone: 'box' as const, box: 0, slot: 1 };

		expect(createPokemonCreationOperation(destination, { level: 5 })).toEqual({
			ok: true,
			operation: { destination, level: 5 }
		});
		expect(createPokemonCreationOperation(destination, { speciesId: 25, level: 12 })).toEqual({
			ok: true,
			operation: { destination, speciesId: 25, level: 12 }
		});
	});

	it('rejects invalid species and level input before calling the engine', () => {
		const destination = { zone: 'box' as const, box: 0, slot: 1 };

		expect(createPokemonCreationOperation(destination, { speciesId: 0, level: 5 })).toEqual({
			ok: false,
			reason: 'Choose a supported species.'
		});
		expect(createPokemonCreationOperation(destination, { level: 101 })).toEqual({
			ok: false,
			reason: 'Level must be a whole number between 1 and 100.'
		});
	});
});
