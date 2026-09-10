import type { PokemonCreationOperation, SaveSlotRef } from '$lib/engine';
import type { SlotView } from '$lib/components/pksx/types';

export type PokemonCreationDraft = {
	speciesId?: number;
	level: number;
};

export type PokemonCreationAvailability =
	| { available: true; reason: null }
	| { available: false; reason: string };

export type PokemonCreationOperationResult =
	| { ok: true; operation: PokemonCreationOperation }
	| { ok: false; reason: string };

export function pokemonCreationAvailability(
	owner: 'save-file' | 'pokemon-storage',
	slot: SlotView,
	saveAvailable: boolean
): PokemonCreationAvailability {
	if (slot.kind !== 'empty') {
		return { available: false, reason: 'Create Pokemon needs an empty Slot.' };
	}

	if (owner !== 'save-file') {
		return {
			available: false,
			reason: 'Create Pokemon is not available for Pokemon Storage yet.'
		};
	}

	if (!saveAvailable) {
		return { available: false, reason: 'Load a Save File before creating Pokemon.' };
	}

	return { available: true, reason: null };
}

export function createPokemonCreationOperation(
	destination: SaveSlotRef,
	draft: PokemonCreationDraft
): PokemonCreationOperationResult {
	if (
		draft.speciesId !== undefined &&
		(!Number.isInteger(draft.speciesId) || draft.speciesId <= 0)
	) {
		return { ok: false, reason: 'Choose a supported species.' };
	}

	if (!Number.isInteger(draft.level) || draft.level < 1 || draft.level > 100) {
		return { ok: false, reason: 'Level must be a whole number between 1 and 100.' };
	}

	return {
		ok: true,
		operation: {
			destination,
			...(draft.speciesId === undefined ? {} : { speciesId: draft.speciesId }),
			level: draft.level
		}
	};
}
