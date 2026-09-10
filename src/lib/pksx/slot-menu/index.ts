import type { SlotView } from '$lib/components/pksx/types';

export type SlotMenuCommandKey =
	| 'pokemon-action'
	| 'pokemon-actions'
	| 'create-pokemon'
	| 'move'
	| 'copy'
	| 'clear'
	| 'export'
	| 'legality-check';

export type SlotMenuCommand = {
	key: SlotMenuCommandKey;
	label: string;
	availability: 'available' | 'unsupported' | 'empty-slot' | 'occupied-slot';
	reason: string | null;
};

export function createSlotMenuCommands(
	slot: SlotView,
	createPokemonReason: string | null
): SlotMenuCommand[] {
	if (slot.kind === 'empty') {
		return [
			{
				key: 'create-pokemon',
				label: 'Create Pokemon',
				availability: createPokemonReason ? 'unsupported' : 'available',
				reason: createPokemonReason
			},
			{
				key: 'move',
				label: 'Move',
				availability: 'empty-slot',
				reason: 'Move needs an occupied Slot.'
			},
			{
				key: 'copy',
				label: 'Copy',
				availability: 'empty-slot',
				reason: 'Copy needs an occupied Slot.'
			},
			{
				key: 'export',
				label: 'Export',
				availability: 'empty-slot',
				reason: 'Export needs an occupied Slot.'
			},
			{
				key: 'legality-check',
				label: 'Legality Check',
				availability: 'empty-slot',
				reason: 'Legality Check needs an occupied Slot.'
			}
		];
	}

	return [
		{ key: 'pokemon-action', label: 'Edit', availability: 'available', reason: null },
		{ key: 'move', label: 'Move', availability: 'available', reason: null },
		{ key: 'copy', label: 'Copy', availability: 'available', reason: null },
		{ key: 'clear', label: 'Clear Slot', availability: 'available', reason: null },
		{
			key: 'export',
			label: 'Export',
			availability: 'unsupported',
			reason: 'Export is not available yet.'
		},
		{
			key: 'legality-check',
			label: 'Legality Check',
			availability: 'available',
			reason: null
		},
		{
			key: 'pokemon-actions',
			label: 'Pokemon Actions',
			availability: 'available',
			reason: null
		},
		{
			key: 'create-pokemon',
			label: 'Create Pokemon',
			availability: 'occupied-slot',
			reason: 'Create Pokemon needs an empty Slot.'
		}
	];
}
