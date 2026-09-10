import type { BoxSlotSummary, PartySlotSummary, PokemonEditOperation } from '$lib/engine';
import type { SlotView } from '$lib/components/pksx/types';
import { PARTY_SLOT_COUNT, type NavigationAction } from '$lib/pksx/box-navigation';
import {
	cancelPokemonEditor,
	stagePokemonEditorEdit,
	type PokemonEditorDraftEdits,
	type PokemonEditorState
} from '$lib/pksx/pokemon-editor';
import type { BoxSourceType } from '$lib/pksx/storage-workbench';

const toolbarStatusRules: [string[], string][] = [
	[['failed', 'could not'], 'Needs attention'],
	[['checking'], 'Checking'],
	[['creating backup'], 'Backing up'],
	[['applying'], 'Applying'],
	[['serializing'], 'Exporting'],
	[['export ready'], 'Export ready'],
	[['imported'], 'Imported'],
	[['opened in', 'pane switched'], 'Collection updated'],
	[['loaded', 'restored'], 'Ready'],
	[['moved'], 'Moved'],
	[['copied'], 'Copied'],
	[['cancelled', 'canceled'], 'Cancelled'],
	[['not available', 'cannot'], 'Not supported']
];

export function keyboardAction(event: Pick<KeyboardEvent, 'key'>): NavigationAction | null {
	if (event.key === 'x' || event.key === 'X') return 'sourceAction';
	if (event.key === 'y' || event.key === 'Y') return 'carryMode';

	return (
		(
			{
				ArrowUp: 'up',
				ArrowDown: 'down',
				ArrowLeft: 'left',
				ArrowRight: 'right',
				Enter: 'confirm',
				' ': 'confirm',
				Escape: 'back',
				Backspace: 'back',
				'[': 'previousBox',
				PageUp: 'previousBox',
				']': 'nextBox',
				PageDown: 'nextBox'
			} satisfies Record<string, NavigationAction>
		)[event.key] ?? null
	);
}

export function isNativeEditorActivation(
	event: Pick<KeyboardEvent, 'key' | 'target'>,
	action: NavigationAction
): boolean {
	if (!(event.target instanceof Element)) return false;

	const input = event.target.closest(
		'.pokemon-editor input, .pokemon-editor select, .pokemon-editor textarea, .pokemon-creation input, .pokemon-creation select'
	);
	if (!input)
		return (
			action === 'confirm' &&
			event.target.closest('.pokemon-editor button, .pokemon-creation button') !== null
		);
	if (event.key.length === 1) return true;
	if (input instanceof HTMLInputElement && input.dataset.controllerEditing === 'false')
		return false;
	if (event.key === 'Escape') return false;

	const nativeActions: NavigationAction[] =
		input instanceof HTMLInputElement && input.type === 'number'
			? ['up', 'down', 'back']
			: ['back', 'left', 'right'];
	return nativeActions.includes(action) || (action === 'confirm' && event.key === ' ');
}

export function createPartySlotViews(slots: PartySlotSummary[]): SlotView[] {
	const slotViews = slots.map(createSlotView);
	while (slotViews.length < PARTY_SLOT_COUNT) slotViews.push(createEmptySlotView(slotViews.length));
	return slotViews;
}

export function createBoxSlotViews(slots: BoxSlotSummary[]): SlotView[] {
	return slots.map(createSlotView);
}

export function createSlotView(slot: PartySlotSummary | BoxSlotSummary): SlotView {
	const details = {
		gender: slot.gender ?? undefined,
		nature: slot.nature ?? undefined,
		natureEditConstraints: slot.natureEditConstraints,
		heldItemEditConstraints: slot.heldItemEditConstraints,
		abilityEditConstraints: slot.abilityEditConstraints,
		metDataEditConstraints: slot.metDataEditConstraints,
		originalTrainerEditConstraints: slot.originalTrainerEditConstraints,
		ability: slot.ability ?? undefined,
		heldItem: slot.heldItem ?? undefined,
		types: slot.types,
		stats: slot.stats,
		moves: slot.moves,
		statEditConstraints: slot.statEditConstraints,
		moveSetEditConstraints: slot.moveSetEditConstraints,
		friendshipEditConstraints: slot.friendshipEditConstraints,
		battleFields: slot.battleFields ?? [],
		originalTrainer: slot.originalTrainer ?? undefined,
		metLabel: slot.metLabel ?? undefined,
		entityBytesBase64: slot.entityBytesBase64 ?? null
	};

	if (slot.isEmpty) return { ...createEmptySlotView(slot.slot), ...details };

	return {
		slot: slot.slot,
		label: slot.nickname || `Species ${slot.speciesId}`,
		detail: `Lv. ${slot.level}`,
		level: slot.level,
		experience: slot.experience,
		experienceProjection: slot.experienceProjection,
		speciesId: slot.speciesId,
		form: slot.form,
		isEgg: slot.isEgg,
		spriteIdentity: slot.spriteIdentity,
		kind: 'pokemon',
		...details
	};
}

function createEmptySlotView(slot: number): SlotView {
	return {
		slot,
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
}

export function stagePokemonEditorDraftEdits(
	state: PokemonEditorState,
	draft: PokemonEditorDraftEdits
): PokemonEditorState {
	let nextState = cancelPokemonEditor(state);
	const edits = [
		draft.speciesForm
			? {
					id: 'species-form',
					capability: 'species-form-editing',
					label: `Set species ${draft.speciesForm.speciesId}, form ${draft.speciesForm.form}`,
					payload: draft.speciesForm
				}
			: null,
		draft.nickname === undefined
			? null
			: {
					id: 'nickname',
					capability: 'nickname-editing',
					label: draft.nickname.length === 0 ? 'Restore default nickname' : 'Set nickname',
					payload: { nickname: draft.nickname }
				},
		draft.levelExperience
			? {
					id: 'level-experience',
					capability: 'level-experience-editing',
					label:
						draft.levelExperience.mode === 'level'
							? `Set level to ${draft.levelExperience.level}`
							: `Set experience to ${draft.levelExperience.experience}`,
					payload: draft.levelExperience
				}
			: null,
		draft.natureId === undefined
			? null
			: {
					id: 'nature',
					capability: 'nature-editing',
					label: `Set Nature to ${
						state.slot.natureEditConstraints?.options.find((option) => option.id === draft.natureId)
							?.name ?? draft.natureId
					}`,
					payload: { natureId: draft.natureId }
				},
		draft.heldItemId === undefined
			? null
			: {
					id: 'held-item',
					capability: 'held-item-editing',
					label:
						draft.heldItemId === 0
							? 'Remove Held Item'
							: `Set Held Item to ${
									state.slot.heldItemEditConstraints?.options.find(
										(option) => option.id === draft.heldItemId
									)?.name ?? draft.heldItemId
								}`,
					payload: { heldItemId: draft.heldItemId }
				},
		draft.abilityIndex === undefined
			? null
			: {
					id: 'ability',
					capability: 'ability-editing',
					label: `Set Ability to ${
						state.slot.abilityEditConstraints?.options.find(
							(option) => option.index === draft.abilityIndex
						)?.name ?? `slot ${draft.abilityIndex + 1}`
					}`,
					payload: { abilityIndex: draft.abilityIndex }
				},
		draft.metData
			? {
					id: 'met-data',
					capability: 'met-data-editing',
					label: 'Set Met Data',
					payload: draft.metData
				}
			: null,
		draft.originalTrainer
			? {
					id: 'original-trainer',
					capability: 'original-trainer-data-editing',
					label: 'Set Original Trainer data',
					payload: draft.originalTrainer
				}
			: null,
		draft.ivs
			? { id: 'ivs', capability: 'iv-editing', label: 'Set IVs', payload: draft.ivs }
			: null,
		draft.evs
			? { id: 'evs', capability: 'ev-editing', label: 'Set EVs', payload: draft.evs }
			: null,
		draft.moveSet
			? {
					id: 'move-set',
					capability: 'move-set-editing',
					label: 'Set Move Set',
					payload: draft.moveSet
				}
			: null,
		draft.friendship
			? {
					id: 'friendship',
					capability: 'friendship-editing',
					label: 'Set Friendship fields',
					payload: draft.friendship
				}
			: null,
		draft.battleFields
			? {
					id: 'battle-fields',
					capability: 'generation-specific-battle-field-editing',
					label: 'Set battle fields',
					payload: draft.battleFields
				}
			: null
	].filter((edit) => edit !== null);

	for (const edit of edits) nextState = stagePokemonEditorEdit(nextState, edit);
	return nextState;
}

export function pokemonEditorDraftResetKey(state: PokemonEditorState): string {
	return JSON.stringify({
		source: state.source.identity.key,
		label: state.slot.label,
		speciesId: state.slot.speciesId,
		form: state.slot.form,
		level: state.slot.level,
		experience: state.slot.experience,
		natureId: state.slot.natureEditConstraints?.currentNatureId,
		heldItemId: state.slot.heldItemEditConstraints?.currentItemId,
		abilityIndex: state.slot.abilityEditConstraints?.currentAbilityIndex,
		metData: state.slot.metDataEditConstraints
			? {
					locationId: state.slot.metDataEditConstraints.currentLocationId,
					metLevel: state.slot.metDataEditConstraints.currentMetLevel,
					metDate: state.slot.metDataEditConstraints.currentMetDate ?? null,
					originGameId: state.slot.metDataEditConstraints.currentOriginGameId,
					ballId: state.slot.metDataEditConstraints.currentBallId
				}
			: null,
		originalTrainer: state.slot.originalTrainerEditConstraints
			? {
					name: state.slot.originalTrainerEditConstraints.currentName,
					trainerId: state.slot.originalTrainerEditConstraints.currentTrainerId,
					secretId: state.slot.originalTrainerEditConstraints.currentSecretId,
					genderId: state.slot.originalTrainerEditConstraints.currentGenderId,
					languageId: state.slot.originalTrainerEditConstraints.currentLanguageId
				}
			: null,
		ivs: state.slot.stats?.map((stat) => stat.iv ?? 0),
		evs: state.slot.stats?.map((stat) => stat.ev ?? 0),
		moves: state.slot.moves?.map((move) => ({
			slot: move.slot,
			id: move.id,
			pp: move.pp ?? 0,
			ppUps: move.ppUps ?? 0
		})),
		friendship: state.slot.friendshipEditConstraints?.fields.map((field) => ({
			key: field.key,
			value: field.value
		})),
		battleFields: state.slot.battleFields?.map((field) => ({ key: field.key, value: field.value }))
	});
}

export function pokemonEditSuccessMessage(
	operation: PokemonEditOperation,
	mutated: boolean
): string {
	if (!mutated) return 'No Pokemon change made.';

	const editedFields = [
		'speciesId',
		'form',
		'nickname',
		'level',
		'experience',
		'natureId',
		'heldItemId',
		'abilityIndex',
		'metData',
		'originalTrainer',
		'ivs',
		'evs',
		'moves',
		'friendshipEdits',
		'teraType'
	].filter((field) => operation[field as keyof PokemonEditOperation] !== undefined);
	return editedFields.length === 1 && editedFields[0] === 'nickname'
		? 'Pokemon nickname updated.'
		: 'Pokemon edits applied.';
}

export function briefToolbarStatus(message: string, sourceType: BoxSourceType): string {
	const normalized = message.toLowerCase();
	const match = toolbarStatusRules.find(([terms]) =>
		terms.some((term) => normalized.includes(term))
	);
	return match?.[1] ?? (sourceType === 'pokemon-storage' ? 'Storage ready' : 'Ready');
}
