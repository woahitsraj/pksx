import type {
	PokemonEditOperation,
	PokemonFriendshipFieldEdit,
	PokemonMetDataEdit,
	PokemonMoveSlotEdit,
	PokemonOriginalTrainerEdit,
	PokemonStatEditSet,
	SaveSlotRef
} from '$lib/engine';
import type { SlotView } from '$lib/components/pksx/types';

export type PokemonEditorOwner = 'save-file' | 'pokemon-storage';

export type PokemonEditorSourceIdentity = {
	key: string;
};

export type SaveFilePokemonEditorSource = {
	owner: 'save-file';
	saveFileId: string | null;
	slotRef: SaveSlotRef;
	location: string;
	identity: PokemonEditorSourceIdentity;
};

export type PokemonStorageEditorSource = {
	owner: 'pokemon-storage';
	storagePokemonId: string;
	location: string;
	identity: PokemonEditorSourceIdentity;
};

export type PokemonEditorSource = SaveFilePokemonEditorSource | PokemonStorageEditorSource;
export type PokemonEditorSourceInput =
	| (Omit<SaveFilePokemonEditorSource, 'identity'> & {
			identity?: PokemonEditorSourceIdentity;
	  })
	| (Omit<PokemonStorageEditorSource, 'identity'> & {
			identity?: PokemonEditorSourceIdentity;
	  });

export type StagedPokemonEdit = {
	id: string;
	capability: string;
	label: string;
	payload?: unknown;
};

export type LevelExperienceEditPayload =
	| {
			mode: 'level';
			level: number;
	  }
	| {
			mode: 'experience';
			experience: number;
	  };

export type PokemonStatKey = keyof PokemonStatEditSet;

export type PokemonStatEditPayload = PokemonStatEditSet;

export type PokemonMoveSetEditPayload = {
	moves: PokemonMoveSlotEdit[];
};

export type PokemonSpeciesFormEditPayload = {
	speciesId: number;
	form: number;
};

export type PokemonOriginalTrainerEditPayload = PokemonOriginalTrainerEdit;

export type PokemonMetDataEditPayload = PokemonMetDataEdit;

export type NatureEditPayload = {
	natureId: number;
};

export type HeldItemEditPayload = {
	heldItemId: number;
};

export type AbilityEditPayload = {
	abilityIndex: number;
};

export type PokemonFriendshipEditPayload = {
	fields: PokemonFriendshipFieldEdit[];
};

export type PokemonBattleFieldEditPayload = {
	fields: Array<{ key: string; value: number }>;
};

export type PokemonEditorDraftEdits = {
	speciesForm?: PokemonSpeciesFormEditPayload;
	nickname?: string;
	levelExperience?: LevelExperienceEditPayload;
	natureId?: number;
	heldItemId?: number;
	abilityIndex?: number;
	metData?: PokemonMetDataEditPayload;
	originalTrainer?: PokemonOriginalTrainerEditPayload;
	ivs?: PokemonStatEditPayload;
	evs?: PokemonStatEditPayload;
	moveSet?: PokemonMoveSetEditPayload;
	friendship?: PokemonFriendshipEditPayload;
	battleFields?: PokemonBattleFieldEditPayload;
};

export type PokemonEditorApplyOutcome =
	| {
			status: 'idle';
			message: string | null;
	  }
	| {
			status: 'noop';
			message: string;
	  }
	| {
			status: 'success';
			message: string;
	  }
	| {
			status: 'rejected' | 'unsupported' | 'failed';
			message: string;
			reason?: string;
	  };

export type PokemonEditorState = {
	source: PokemonEditorSource;
	slot: SlotView;
	stagedEdits: StagedPokemonEdit[];
	staged: boolean;
	applyOutcome: PokemonEditorApplyOutcome;
	unsupportedReason: string | null;
};

export type PokemonEditorEntryResult =
	| {
			ok: true;
			state: PokemonEditorState;
	  }
	| {
			ok: false;
			reason: string;
	  };

export type PokemonEditValidationResult =
	| {
			ok: true;
	  }
	| {
			ok: false;
			status: 'rejected' | 'unsupported' | 'failed';
			message: string;
			reason?: string;
	  };

export type PokemonEditorLevelExperienceValidation =
	| {
			ok: true;
			payload: LevelExperienceEditPayload;
			label: string;
	  }
	| {
			ok: false;
			message: string;
	  };

export type PokemonEditorPayloadValidation<TPayload> =
	| {
			ok: true;
			payload: TPayload;
			label: string;
	  }
	| {
			ok: false;
			message: string;
	  };

const statKeys = ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'] as const satisfies PokemonStatKey[];

export type PokemonEditOperationBuildResult =
	| {
			ok: true;
			operation: PokemonEditOperation;
	  }
	| Extract<PokemonEditValidationResult, { ok: false }>;

type PokemonEditPatch = Partial<Omit<PokemonEditOperation, 'source'>>;
type PokemonEditPatchResult =
	| { ok: true; patch: PokemonEditPatch }
	| Extract<PokemonEditValidationResult, { ok: false }>;
type PokemonEditOperationBuilder = (payload: unknown, slot: SlotView) => PokemonEditPatchResult;

export type PokemonEditorMutationResult =
	| {
			ok: true;
			slot: SlotView;
			message?: string;
	  }
	| {
			ok: false;
			status: 'rejected' | 'unsupported' | 'failed';
			message: string;
			reason?: string;
	  };

export type PokemonEditorSourceVerification =
	| {
			ok: true;
	  }
	| {
			ok: false;
			message?: string;
	  };

export type PokemonEditorApplyServices = {
	verifySource?: (state: PokemonEditorState) => Promise<PokemonEditorSourceVerification>;
	validate: (state: PokemonEditorState) => Promise<PokemonEditValidationResult>;
	ensureSaveFileBackup?: (state: PokemonEditorState) => Promise<PokemonEditValidationResult>;
	mutateSaveFilePokemon?: (state: PokemonEditorState) => Promise<PokemonEditorMutationResult>;
	mutateStoragePokemon?: (state: PokemonEditorState) => Promise<PokemonEditorMutationResult>;
};

export type PokemonEditorApplyResult = {
	state: PokemonEditorState;
	outcome: PokemonEditorApplyOutcome;
};

export function createPokemonEditorSourceIdentity(slot: SlotView): PokemonEditorSourceIdentity {
	const sprite = slot.spriteIdentity
		? [
				slot.spriteIdentity.speciesId,
				slot.spriteIdentity.form,
				slot.spriteIdentity.isEgg ? 'egg' : 'not-egg',
				slot.spriteIdentity.isShiny ? 'shiny' : 'normal',
				slot.spriteIdentity.displaySex
			].join(':')
		: 'no-sprite';

	return {
		key: [
			slot.kind,
			slot.slot,
			slot.speciesId ?? 'unknown',
			slot.form ?? 'unknown',
			slot.label,
			sprite
		].join('|')
	};
}

export function createPokemonEditorState(
	source: PokemonEditorSourceInput,
	slot: SlotView
): PokemonEditorEntryResult {
	if (slot.kind !== 'pokemon') {
		return {
			ok: false,
			reason: 'Pokemon Editor requires an occupied Slot.'
		};
	}

	const editorSlot = hydrateSaveFileEditorSlot(source, slot);

	return {
		ok: true,
		state: withStagedEdits({
			source: {
				...source,
				identity: source.identity ?? createPokemonEditorSourceIdentity(editorSlot)
			} as PokemonEditorSource,
			slot: editorSlot,
			stagedEdits: [],
			staged: false,
			applyOutcome: { status: 'idle', message: null },
			unsupportedReason: null
		})
	};
}

function hydrateSaveFileEditorSlot(source: PokemonEditorSourceInput, slot: SlotView): SlotView {
	if (source.owner !== 'save-file' || slot.kind !== 'pokemon') {
		return slot;
	}

	const statEditConstraints =
		slot.stats && slot.stats.length > 0 && !slot.statEditConstraints?.supported
			? {
					supported: true,
					minIv: slot.statEditConstraints?.minIv ?? 0,
					maxIv: slot.statEditConstraints?.maxIv ?? 31,
					minEv: slot.statEditConstraints?.minEv ?? 0,
					maxEv: slot.statEditConstraints?.maxEv ?? 255,
					maxTotalEv: slot.statEditConstraints?.maxTotalEv ?? 510
				}
			: slot.statEditConstraints;

	const moveSetEditConstraints =
		slot.moves && slot.moves.length > 0 && !slot.moveSetEditConstraints?.supported
			? {
					supported: true,
					maxMoveSlots: slot.moveSetEditConstraints?.maxMoveSlots ?? 4,
					availableMoves: currentMoveOptions(slot)
				}
			: slot.moveSetEditConstraints;

	if (
		statEditConstraints === slot.statEditConstraints &&
		moveSetEditConstraints === slot.moveSetEditConstraints
	) {
		return slot;
	}

	return {
		...slot,
		statEditConstraints,
		moveSetEditConstraints
	};
}

function currentMoveOptions(slot: SlotView) {
	const options = new Map<
		number,
		NonNullable<SlotView['moveSetEditConstraints']>['availableMoves'][number]
	>();
	options.set(0, { id: 0, name: 'Empty', type: 'None', hue: 48, chroma: 0.04, maxPp: 0 });

	for (const move of slot.moves ?? []) {
		if (move.id === 0 || options.has(move.id)) {
			continue;
		}

		options.set(move.id, {
			id: move.id,
			name: move.name,
			type: move.type,
			hue: move.hue,
			chroma: move.chroma ?? 0.04,
			maxPp: move.maxPp ?? move.pp ?? 0
		});
	}

	return [...options.values()];
}

export function stagePokemonEditorEdit(
	state: PokemonEditorState,
	edit: StagedPokemonEdit
): PokemonEditorState {
	const stagedEdits = [...state.stagedEdits.filter((existing) => existing.id !== edit.id), edit];
	return withStagedEdits({
		...state,
		stagedEdits,
		applyOutcome: { status: 'idle', message: null },
		unsupportedReason: null
	});
}

export function stageNicknameEdit(state: PokemonEditorState, nickname: string): PokemonEditorState {
	if (nickname === state.slot.label) {
		return removePokemonEditorEdit(state, 'nickname');
	}

	return stagePokemonEditorEdit(state, {
		id: 'nickname',
		capability: 'nickname-editing',
		label: nickname.length === 0 ? 'Restore default nickname' : 'Set nickname',
		payload: { nickname }
	});
}

function removePokemonEditorEdit(state: PokemonEditorState, editId: string): PokemonEditorState {
	return withStagedEdits({
		...state,
		stagedEdits: state.stagedEdits.filter((existing) => existing.id !== editId)
	});
}

export function validateLevelExperienceEdit(
	slot: SlotView,
	payload: LevelExperienceEditPayload
): PokemonEditorLevelExperienceValidation {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Level and Experience Editing needs an occupied Slot.' };
	}

	if (!slot.experienceProjection) {
		return {
			ok: false,
			message: 'Level and Experience Editing is not supported for this Pokemon format.'
		};
	}

	const projection = slot.experienceProjection;

	if (payload.mode === 'level') {
		if (!Number.isInteger(payload.level)) {
			return { ok: false, message: 'Level must be a whole number.' };
		}

		if (payload.level < projection.minLevel || payload.level > projection.maxLevel) {
			return {
				ok: false,
				message: `Level must be between ${projection.minLevel} and ${projection.maxLevel}.`
			};
		}

		return {
			ok: true,
			payload,
			label: `Set level to ${payload.level}`
		};
	}

	if (!Number.isInteger(payload.experience)) {
		return { ok: false, message: 'Experience must be a whole number.' };
	}

	if (
		payload.experience < projection.minExperience ||
		payload.experience > projection.maxExperience
	) {
		return {
			ok: false,
			message: `Experience must be between ${projection.minExperience} and ${projection.maxExperience}.`
		};
	}

	return {
		ok: true,
		payload,
		label: `Set experience to ${payload.experience}`
	};
}

export function stageLevelExperienceEdit(
	state: PokemonEditorState,
	payload: LevelExperienceEditPayload
): PokemonEditorState {
	const validation = validateLevelExperienceEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'level-experience'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	return stagePokemonEditorEdit(state, {
		id: 'level-experience',
		capability: 'level-experience-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageOriginalTrainerEdit(
	state: PokemonEditorState,
	payload: PokemonOriginalTrainerEditPayload
): PokemonEditorState {
	const validation = validateOriginalTrainerEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'original-trainer'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	if (originalTrainerEditMatchesSlot(state.slot, validation.payload)) {
		return removePokemonEditorEdit(state, 'original-trainer');
	}

	return stagePokemonEditorEdit(state, {
		id: 'original-trainer',
		capability: 'original-trainer-data-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageMetDataEdit(
	state: PokemonEditorState,
	payload: PokemonMetDataEditPayload
): PokemonEditorState {
	const validation = validateMetDataEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'met-data'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	if (metDataEditMatchesSlot(state.slot, validation.payload)) {
		return removePokemonEditorEdit(state, 'met-data');
	}

	return stagePokemonEditorEdit(state, {
		id: 'met-data',
		capability: 'met-data-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageNatureEdit(
	state: PokemonEditorState,
	payload: NatureEditPayload
): PokemonEditorState {
	const validation = validateNatureEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'nature'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	if (payload.natureId === state.slot.natureEditConstraints?.currentNatureId) {
		return removePokemonEditorEdit(state, 'nature');
	}

	return stagePokemonEditorEdit(state, {
		id: 'nature',
		capability: 'nature-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageHeldItemEdit(
	state: PokemonEditorState,
	payload: HeldItemEditPayload
): PokemonEditorState {
	const validation = validateHeldItemEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'held-item'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	if (payload.heldItemId === state.slot.heldItemEditConstraints?.currentItemId) {
		return removePokemonEditorEdit(state, 'held-item');
	}

	return stagePokemonEditorEdit(state, {
		id: 'held-item',
		capability: 'held-item-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageAbilityEdit(
	state: PokemonEditorState,
	payload: AbilityEditPayload
): PokemonEditorState {
	const validation = validateAbilityEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'ability'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	if (payload.abilityIndex === state.slot.abilityEditConstraints?.currentAbilityIndex) {
		return removePokemonEditorEdit(state, 'ability');
	}

	return stagePokemonEditorEdit(state, {
		id: 'ability',
		capability: 'ability-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageIvEdit(
	state: PokemonEditorState,
	payload: PokemonStatEditPayload
): PokemonEditorState {
	const validation = validateIvEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'ivs'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	return stagePokemonEditorEdit(state, {
		id: 'ivs',
		capability: 'iv-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageEvEdit(
	state: PokemonEditorState,
	payload: PokemonStatEditPayload
): PokemonEditorState {
	const validation = validateEvEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'evs'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	return stagePokemonEditorEdit(state, {
		id: 'evs',
		capability: 'ev-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageMoveSetEdit(
	state: PokemonEditorState,
	payload: PokemonMoveSetEditPayload
): PokemonEditorState {
	const validation = validateMoveSetEdit(state.slot, payload);
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'move-set'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	return stagePokemonEditorEdit(state, {
		id: 'move-set',
		capability: 'move-set-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function stageSpeciesFormEdit(
	state: PokemonEditorState,
	payload: PokemonSpeciesFormEditPayload
): PokemonEditorState {
	if (state.slot.kind !== 'pokemon') {
		return removePokemonEditorEdit(state, 'species-form');
	}

	if (state.slot.speciesId === payload.speciesId && (state.slot.form ?? 0) === payload.form) {
		return removePokemonEditorEdit(state, 'species-form');
	}

	if (
		!Number.isInteger(payload.speciesId) ||
		payload.speciesId <= 0 ||
		!Number.isInteger(payload.form) ||
		payload.form < 0
	) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'species-form'), {
			status: 'rejected',
			message: 'Species and Form selection is invalid.',
			reason: 'invalid-pokemon-edit'
		});
	}

	return stagePokemonEditorEdit(state, {
		id: 'species-form',
		capability: 'species-form-editing',
		label: `Set species ${payload.speciesId}, form ${payload.form}`,
		payload
	});
}

export function stageFriendshipEdit(
	state: PokemonEditorState,
	payload: PokemonFriendshipEditPayload
): PokemonEditorState {
	const currentValues = new Map(
		(state.slot.friendshipEditConstraints?.fields ?? []).map((field) => [field.key, field.value])
	);
	const changedFields = payload.fields.filter(
		(field) => currentValues.get(field.key) !== field.value
	);
	if (changedFields.length === 0) {
		return removePokemonEditorEdit(state, 'friendship');
	}

	const validation = validateFriendshipEdit(state.slot, { fields: changedFields });
	if (!validation.ok) {
		return withApplyOutcome(removePokemonEditorEdit(state, 'friendship'), {
			status: 'rejected',
			message: validation.message,
			reason: 'invalid-pokemon-edit'
		});
	}

	return stagePokemonEditorEdit(state, {
		id: 'friendship',
		capability: 'friendship-editing',
		label: validation.label,
		payload: validation.payload
	});
}

export function statEditPayloadFromSlot(
	slot: SlotView,
	value: 'iv' | 'ev'
): PokemonStatEditPayload {
	return Object.fromEntries(
		statKeys.map((key) => [key, slot.stats?.find((stat) => stat.key === key)?.[value] ?? 0])
	) as PokemonStatEditPayload;
}

export function moveSetEditPayloadFromSlot(slot: SlotView): PokemonMoveSetEditPayload {
	return {
		moves: Array.from({ length: slot.moveSetEditConstraints?.maxMoveSlots ?? 4 }, (_, index) => {
			const move = slot.moves?.find((candidate) => candidate.slot === index);
			return {
				slot: index,
				move: move?.id ?? 0,
				pp: move?.pp ?? move?.maxPp ?? 0,
				ppUps: move?.ppUps ?? 0
			};
		})
	};
}

export function createPokemonEditOperation(
	state: PokemonEditorState
): PokemonEditOperationBuildResult {
	if (state.source.owner !== 'save-file') {
		return {
			ok: false,
			status: 'unsupported',
			message: 'Pokemon Storage editing is not available yet.',
			reason: 'storage-unavailable'
		};
	}

	const operation: PokemonEditOperation = { source: state.source.slotRef };
	let supportedEditFound = false;

	for (const { id, build } of pokemonEditOperationBuilders) {
		const edit = state.stagedEdits.find((candidate) => candidate.id === id);
		if (!edit) continue;

		supportedEditFound = true;
		const result = build(edit.payload, state.slot);
		if (!result.ok) return result;
		Object.assign(operation, result.patch);
	}

	if (!supportedEditFound) {
		return {
			ok: false,
			status: 'unsupported',
			message: 'No supported Pokemon edits are staged.',
			reason: 'unsupported-pokemon-edit'
		};
	}

	return { ok: true, operation };
}

const pokemonEditOperationBuilders = [
	{ id: 'species-form', build: buildSpeciesFormEdit },
	{ id: 'nickname', build: buildNicknameEdit },
	{ id: 'level-experience', build: buildLevelExperienceEdit },
	{ id: 'nature', build: buildNatureEdit },
	{ id: 'held-item', build: buildHeldItemEdit },
	{ id: 'ability', build: buildAbilityEdit },
	{ id: 'met-data', build: buildMetDataEdit },
	{ id: 'original-trainer', build: buildOriginalTrainerEdit },
	{ id: 'ivs', build: buildIvEdit },
	{ id: 'evs', build: buildEvEdit },
	{ id: 'move-set', build: buildMoveSetEdit },
	{ id: 'friendship', build: buildFriendshipEdit },
	{ id: 'battle-fields', build: buildBattleFieldEdit }
] satisfies { id: string; build: PokemonEditOperationBuilder }[];

function buildSpeciesFormEdit(payload: unknown): PokemonEditPatchResult {
	if (!isPokemonSpeciesFormEditPayload(payload)) {
		return invalidPokemonEdit('Species and Form edit payload is invalid.');
	}

	return { ok: true, patch: { speciesId: payload.speciesId, form: payload.form } };
}

function buildNatureEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isNatureEditPayload(payload)) {
		return invalidPokemonEdit('Nature edit payload is invalid.');
	}

	const validation = validateNatureEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return { ok: true, patch: { natureId: validation.payload.natureId } };
}

function validateNatureEdit(
	slot: SlotView,
	payload: NatureEditPayload
): PokemonEditorPayloadValidation<NatureEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Nature Editing needs an occupied Slot.' };
	}

	const constraints = slot.natureEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ?? 'Nature Editing is not supported for this Pokemon format.'
		};
	}

	if (!Number.isInteger(payload.natureId)) {
		return { ok: false, message: 'Nature choice is invalid.' };
	}

	const option = constraints.options.find((candidate) => candidate.id === payload.natureId);
	if (!option) {
		return { ok: false, message: `Nature ${payload.natureId} is not available.` };
	}

	return { ok: true, payload, label: `Set Nature to ${option.name}` };
}

function buildHeldItemEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isHeldItemEditPayload(payload)) {
		return invalidPokemonEdit('Held Item edit payload is invalid.');
	}

	const validation = validateHeldItemEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return { ok: true, patch: { heldItemId: validation.payload.heldItemId } };
}

function validateHeldItemEdit(
	slot: SlotView,
	payload: HeldItemEditPayload
): PokemonEditorPayloadValidation<HeldItemEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Held Item Editing needs an occupied Slot.' };
	}

	const constraints = slot.heldItemEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ?? 'Held Item Editing is not supported for this Pokemon.'
		};
	}

	if (!Number.isInteger(payload.heldItemId)) {
		return { ok: false, message: 'Held Item choice is invalid.' };
	}

	const option = constraints.options.find((candidate) => candidate.id === payload.heldItemId);
	if (!option) {
		return {
			ok: false,
			message: `Item ${payload.heldItemId} is not available for this Pokemon in the current Save File.`
		};
	}

	if (!option.available) {
		return {
			ok: false,
			message: option.unavailableReason ?? `${option.name} is not available for this Pokemon.`
		};
	}

	return {
		ok: true,
		payload,
		label: payload.heldItemId === 0 ? 'Remove Held Item' : `Set Held Item to ${option.name}`
	};
}

function buildAbilityEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isAbilityEditPayload(payload)) {
		return invalidPokemonEdit('Ability edit payload is invalid.');
	}

	const validation = validateAbilityEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return { ok: true, patch: { abilityIndex: validation.payload.abilityIndex } };
}

function validateAbilityEdit(
	slot: SlotView,
	payload: AbilityEditPayload
): PokemonEditorPayloadValidation<AbilityEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Ability Editing needs an occupied Slot.' };
	}

	const constraints = slot.abilityEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ??
				'Ability Editing is not supported for this Pokemon format.'
		};
	}

	if (!Number.isInteger(payload.abilityIndex)) {
		return { ok: false, message: 'Ability choice is invalid.' };
	}

	const option = constraints.options.find((candidate) => candidate.index === payload.abilityIndex);
	if (!option) {
		return {
			ok: false,
			message: `Ability slot ${payload.abilityIndex + 1} is not supported by this Pokemon.`
		};
	}

	if (!option.available) {
		return {
			ok: false,
			message: option.unavailableReason ?? `${option.name} is not legal for this Pokemon.`
		};
	}

	return { ok: true, payload, label: `Set Ability to ${option.name}` };
}

function buildFriendshipEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isPokemonFriendshipEditPayload(payload)) {
		return invalidPokemonEdit('Friendship edit payload is invalid.');
	}

	const validation = validateFriendshipEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return {
		ok: true,
		patch: { friendshipEdits: validation.payload.fields.map((field) => ({ ...field })) }
	};
}

function buildBattleFieldEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isPokemonBattleFieldEditPayload(payload)) {
		return invalidPokemonEdit('Battle field edit payload is invalid.');
	}

	const validation = validateBattleFieldEdits(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	const patch: PokemonEditPatch = {};
	for (const field of validation.payload.fields) {
		if (field.key === 'tera-type') patch.teraType = field.value;
	}
	return { ok: true, patch };
}

export function validateBattleFieldEdits(
	slot: SlotView,
	payload: PokemonBattleFieldEditPayload
): PokemonEditorPayloadValidation<PokemonBattleFieldEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Battle Field Editing needs an occupied Slot.' };
	}

	if (payload.fields.length === 0) {
		return { ok: false, message: 'Choose a battle field to edit.' };
	}

	const projections = new Map((slot.battleFields ?? []).map((field) => [field.key, field]));
	const seen = new Set<string>();
	for (const edit of payload.fields) {
		if (seen.has(edit.key)) {
			return { ok: false, message: `Battle field ${edit.key} is duplicated.` };
		}
		seen.add(edit.key);

		const projection = projections.get(edit.key);
		if (!projection) {
			return {
				ok: false,
				message: 'This Pokemon format does not expose that battle field.'
			};
		}

		if (!projection.supported) {
			return {
				ok: false,
				message:
					projection.unsupportedReason ?? `${projection.label} is not supported for this Pokemon.`
			};
		}

		if (edit.key !== 'tera-type') {
			return { ok: false, message: `${projection.label} editing is not implemented.` };
		}

		if (
			!Number.isInteger(edit.value) ||
			!projection.options.some((option) => option.value === edit.value)
		) {
			return { ok: false, message: `Choose a valid ${projection.label}.` };
		}
	}

	return { ok: true, payload, label: 'Set battle fields' };
}

function buildNicknameEdit(payload: unknown): PokemonEditPatchResult {
	return isNicknameEditPayload(payload)
		? { ok: true, patch: { nickname: payload.nickname } }
		: invalidPokemonEdit('Nickname edit payload is invalid.');
}

function buildLevelExperienceEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isLevelExperienceEditPayload(payload)) {
		return invalidPokemonEdit('Level and Experience edit payload is invalid.');
	}

	const validation = validateLevelExperienceEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return {
		ok: true,
		patch: payload.mode === 'level' ? { level: payload.level } : { experience: payload.experience }
	};
}

function buildIvEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	return buildStatEdit(payload, slot, 'ivs');
}

function buildEvEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	return buildStatEdit(payload, slot, 'evs');
}

function buildStatEdit(
	payload: unknown,
	slot: SlotView,
	kind: 'ivs' | 'evs'
): PokemonEditPatchResult {
	if (!isPokemonStatEditPayload(payload)) {
		return invalidPokemonEdit(`${kind === 'ivs' ? 'IV' : 'EV'} edit payload is invalid.`);
	}

	const validation = kind === 'ivs' ? validateIvEdit(slot, payload) : validateEvEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	const stats = cloneStatEditPayload(validation.payload);
	return { ok: true, patch: kind === 'ivs' ? { ivs: stats } : { evs: stats } };
}

function buildMoveSetEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isPokemonMoveSetEditPayload(payload)) {
		return invalidPokemonEdit('Move Set edit payload is invalid.');
	}

	const validation = validateMoveSetEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return {
		ok: true,
		patch: { moves: validation.payload.moves.map((move) => ({ ...move })) }
	};
}

function invalidPokemonEdit(message: string): Extract<PokemonEditValidationResult, { ok: false }> {
	return { ok: false, status: 'rejected', message, reason: 'invalid-pokemon-edit' };
}

function buildMetDataEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isPokemonMetDataEditPayload(payload)) {
		return invalidPokemonEdit('Met Data edit payload is invalid.');
	}

	const validation = validateMetDataEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return { ok: true, patch: { metData: { ...validation.payload } } };
}

function validateMetDataEdit(
	slot: SlotView,
	payload: PokemonMetDataEditPayload
): PokemonEditorPayloadValidation<PokemonMetDataEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Met Data Editing needs an occupied Slot.' };
	}

	const constraints = slot.metDataEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ?? 'Met Data Editing is not supported for this Pokemon.'
		};
	}

	if (!Number.isInteger(payload.metLevel)) {
		return { ok: false, message: 'Met level must be a whole number.' };
	}
	if (payload.metLevel < constraints.minMetLevel || payload.metLevel > constraints.maxMetLevel) {
		return {
			ok: false,
			message: `Met level must be between ${constraints.minMetLevel} and ${constraints.maxMetLevel}.`
		};
	}

	const originGameId = payload.originGameId ?? constraints.currentOriginGameId;
	if (
		payload.originGameId !== undefined &&
		(!constraints.supportsOriginGame ||
			!constraints.originGames.some((option) => option.id === payload.originGameId))
	) {
		return { ok: false, message: 'Origin game choice is not supported by this Pokemon.' };
	}

	const locationGroup = constraints.locationGroups.find(
		(group) => group.originGameId === originGameId
	);
	if (
		!Number.isInteger(payload.locationId) ||
		!locationGroup?.options.some((option) => option.id === payload.locationId)
	) {
		return {
			ok: false,
			message: 'Met location is not available for the selected origin game.'
		};
	}

	if (
		payload.ballId !== undefined &&
		(!constraints.supportsBall || !constraints.balls.some((option) => option.id === payload.ballId))
	) {
		return { ok: false, message: 'Ball choice is not supported by this Pokemon.' };
	}

	if (payload.metDate !== undefined) {
		if (!constraints.supportsMetDate) {
			return {
				ok: false,
				message: 'Met date editing is not supported for this Pokemon.'
			};
		}
		if (payload.metDate !== null && !isValidMetDate(payload.metDate)) {
			return { ok: false, message: 'Met date must be a valid date from 2000 through 2255.' };
		}
	}

	return { ok: true, payload, label: 'Set Met Data' };
}

function metDataEditMatchesSlot(slot: SlotView, payload: PokemonMetDataEditPayload): boolean {
	const constraints = slot.metDataEditConstraints;
	return (
		constraints !== undefined &&
		payload.locationId === constraints.currentLocationId &&
		payload.metLevel === constraints.currentMetLevel &&
		(payload.metDate ?? null) === (constraints.currentMetDate ?? null) &&
		(payload.originGameId ?? constraints.currentOriginGameId) === constraints.currentOriginGameId &&
		(payload.ballId ?? constraints.currentBallId) === constraints.currentBallId
	);
}

function isValidMetDate(value: string): boolean {
	if (!/^2\d{3}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	const year = Number(value.slice(0, 4));
	return (
		year >= 2000 &&
		year <= 2255 &&
		!Number.isNaN(parsed.valueOf()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

function buildOriginalTrainerEdit(payload: unknown, slot: SlotView): PokemonEditPatchResult {
	if (!isPokemonOriginalTrainerEditPayload(payload)) {
		return invalidPokemonEdit('Original Trainer edit payload is invalid.');
	}

	const validation = validateOriginalTrainerEdit(slot, payload);
	if (!validation.ok) return invalidPokemonEdit(validation.message);

	return { ok: true, patch: { originalTrainer: { ...validation.payload } } };
}

function validateOriginalTrainerEdit(
	slot: SlotView,
	payload: PokemonOriginalTrainerEditPayload
): PokemonEditorPayloadValidation<PokemonOriginalTrainerEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Original Trainer Data Editing needs an occupied Slot.' };
	}

	const constraints = slot.originalTrainerEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ??
				'Original Trainer Data Editing is not supported for this Pokemon.'
		};
	}

	if (payload.name.trim().length === 0) {
		return { ok: false, message: 'Original Trainer name is required.' };
	}
	if (payload.name.length > constraints.maxNameLength) {
		return {
			ok: false,
			message: `Original Trainer name must be ${constraints.maxNameLength} characters or fewer.`
		};
	}
	if (
		!Number.isInteger(payload.trainerId) ||
		payload.trainerId < constraints.minTrainerId ||
		payload.trainerId > constraints.maxTrainerId
	) {
		return {
			ok: false,
			message: `Trainer ID must be between ${constraints.minTrainerId} and ${constraints.maxTrainerId}.`
		};
	}
	if (
		payload.secretId !== undefined &&
		(!constraints.supportsSecretId ||
			!Number.isInteger(payload.secretId) ||
			payload.secretId < constraints.minTrainerId ||
			payload.secretId > constraints.maxTrainerId)
	) {
		return {
			ok: false,
			message: constraints.supportsSecretId
				? `Secret ID must be between ${constraints.minTrainerId} and ${constraints.maxTrainerId}.`
				: 'Secret ID editing is not supported for this Pokemon.'
		};
	}
	if (
		payload.genderId !== undefined &&
		(!constraints.supportsGender ||
			!constraints.genders.some((option) => option.id === payload.genderId))
	) {
		return {
			ok: false,
			message: constraints.supportsGender
				? 'Original Trainer gender choice is invalid.'
				: 'Original Trainer gender editing is not supported for this Pokemon.'
		};
	}
	if (
		payload.languageId !== undefined &&
		(!constraints.supportsLanguage ||
			!constraints.languages.some((option) => option.id === payload.languageId))
	) {
		return {
			ok: false,
			message: constraints.supportsLanguage
				? 'Pokemon language choice is invalid.'
				: 'Pokemon language editing is not supported for this Pokemon.'
		};
	}

	return { ok: true, payload, label: 'Set Original Trainer data' };
}

function originalTrainerEditMatchesSlot(
	slot: SlotView,
	payload: PokemonOriginalTrainerEditPayload
): boolean {
	const constraints = slot.originalTrainerEditConstraints;
	return (
		constraints !== undefined &&
		payload.name === constraints.currentName &&
		payload.trainerId === constraints.currentTrainerId &&
		(payload.secretId ?? constraints.currentSecretId) === constraints.currentSecretId &&
		(payload.genderId ?? constraints.currentGenderId) === constraints.currentGenderId &&
		(payload.languageId ?? constraints.currentLanguageId) === constraints.currentLanguageId
	);
}

function validateIvEdit(
	slot: SlotView,
	payload: PokemonStatEditPayload
): PokemonEditorPayloadValidation<PokemonStatEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'IV Editing needs an occupied Slot.' };
	}

	const constraints = slot.statEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ?? 'IV Editing is not supported for this Pokemon format.'
		};
	}

	for (const key of statKeys) {
		const value = payload[key];
		if (!Number.isInteger(value)) {
			return { ok: false, message: `${key} IV must be a whole number.` };
		}

		if (value < constraints.minIv || value > constraints.maxIv) {
			return {
				ok: false,
				message: `${key} IV must be between ${constraints.minIv} and ${constraints.maxIv}.`
			};
		}
	}

	return { ok: true, payload, label: 'Set IVs' };
}

function validateEvEdit(
	slot: SlotView,
	payload: PokemonStatEditPayload
): PokemonEditorPayloadValidation<PokemonStatEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'EV Editing needs an occupied Slot.' };
	}

	const constraints = slot.statEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ?? 'EV Editing is not supported for this Pokemon format.'
		};
	}

	let total = 0;
	for (const key of statKeys) {
		const value = payload[key];
		if (!Number.isInteger(value)) {
			return { ok: false, message: `${key} EV must be a whole number.` };
		}

		if (value < constraints.minEv || value > constraints.maxEv) {
			return {
				ok: false,
				message: `${key} EV must be between ${constraints.minEv} and ${constraints.maxEv}.`
			};
		}

		total += value;
	}

	if (total > constraints.maxTotalEv) {
		return {
			ok: false,
			message: `Total EVs must be ${constraints.maxTotalEv} or less.`
		};
	}

	return { ok: true, payload, label: 'Set EVs' };
}

function validateMoveSetEdit(
	slot: SlotView,
	payload: PokemonMoveSetEditPayload
): PokemonEditorPayloadValidation<PokemonMoveSetEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Move Set Editing needs an occupied Slot.' };
	}

	const constraints = slot.moveSetEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ??
				'Move Set Editing is not supported for this Pokemon format.'
		};
	}

	const options = new Map(constraints.availableMoves.map((option) => [option.id, option]));
	for (const edit of payload.moves) {
		const message = validateMoveSlotEdit(edit, constraints, options);
		if (message) return { ok: false, message };
	}

	return { ok: true, payload, label: 'Set Move Set' };
}

export function validateFriendshipEdit(
	slot: SlotView,
	payload: PokemonFriendshipEditPayload
): PokemonEditorPayloadValidation<PokemonFriendshipEditPayload> {
	if (slot.kind !== 'pokemon') {
		return { ok: false, message: 'Friendship Editing needs an occupied Slot.' };
	}

	const constraints = slot.friendshipEditConstraints;
	if (!constraints?.supported) {
		return {
			ok: false,
			message:
				constraints?.unsupportedReason ??
				'Friendship Editing is not supported for this Pokemon format.'
		};
	}
	if (payload.fields.length === 0) {
		return { ok: false, message: 'Choose a Friendship edit to apply.' };
	}

	const availableFields = new Map(constraints.fields.map((field) => [field.key, field]));
	const keys = new Set<string>();
	for (const edit of payload.fields) {
		if (keys.has(edit.key)) {
			return { ok: false, message: `${edit.key} is duplicated.` };
		}
		keys.add(edit.key);

		const field = availableFields.get(edit.key);
		if (!field) {
			return { ok: false, message: `Friendship field '${edit.key}' is not supported.` };
		}
		if (!Number.isInteger(edit.value)) {
			return { ok: false, message: `${field.label} must be a whole number.` };
		}
		if (edit.value < field.min || edit.value > field.max) {
			return {
				ok: false,
				message: `${field.label} must be between ${field.min} and ${field.max}.`
			};
		}
	}

	const labels = payload.fields.map((edit) => availableFields.get(edit.key)?.label ?? edit.key);
	return {
		ok: true,
		payload,
		label: `Set ${labels.join(' and ')}`
	};
}

type MoveSetEditConstraints = NonNullable<SlotView['moveSetEditConstraints']>;
type MoveOption = MoveSetEditConstraints['availableMoves'][number];

function validateMoveSlotEdit(
	edit: PokemonMoveSlotEdit,
	constraints: MoveSetEditConstraints,
	options: Map<number, MoveOption>
): string | null {
	if (!Number.isInteger(edit.slot) || edit.slot < 0 || edit.slot >= constraints.maxMoveSlots) {
		return 'Move Set slot must be between 1 and 4.';
	}

	const option = options.get(edit.move);
	if (!option) return `Move ${edit.move} is not available for this Pokemon.`;

	const ppUps = edit.ppUps ?? 0;
	if (!Number.isInteger(ppUps) || ppUps < 0 || ppUps > 3) {
		return 'PP Ups must be between 0 and 3.';
	}

	const maxPp = maxPpForPpUps(option.maxPp, ppUps);
	const pp = edit.pp ?? maxPp;
	return !Number.isInteger(pp) || pp < 0 || pp > maxPp
		? `PP for ${option.name} must be between 0 and ${maxPp}.`
		: null;
}

export function maxPpForPpUps(basePp: number, ppUps: number): number {
	if (basePp <= 0) return 0;
	return Math.floor((basePp * (5 + ppUps)) / 5);
}

function cloneStatEditPayload(payload: PokemonStatEditPayload): PokemonStatEditPayload {
	return {
		HP: payload.HP,
		ATK: payload.ATK,
		DEF: payload.DEF,
		SPA: payload.SPA,
		SPD: payload.SPD,
		SPE: payload.SPE
	};
}

export function cancelPokemonEditor(state: PokemonEditorState): PokemonEditorState {
	return withStagedEdits({
		...state,
		stagedEdits: [],
		applyOutcome: { status: 'idle', message: null },
		unsupportedReason: null
	});
}

export function markUnsupportedPokemonEditorApply(
	state: PokemonEditorState,
	reason = 'Pokemon editing is not available yet.'
): PokemonEditorState {
	return withApplyOutcome(state, {
		status: 'unsupported',
		message: reason,
		reason: 'engine-unavailable'
	});
}

export function isSamePokemonEditorSourceIdentity(
	state: PokemonEditorState,
	slot: SlotView | null
): boolean {
	if (!slot || slot.kind !== 'pokemon') {
		return false;
	}

	return state.source.identity.key === createPokemonEditorSourceIdentity(slot).key;
}

export async function applyPokemonEditorEdits(
	state: PokemonEditorState,
	services: PokemonEditorApplyServices
): Promise<PokemonEditorApplyResult> {
	if (state.stagedEdits.length === 0) {
		return completeApply(state, {
			status: 'noop',
			message: 'No Pokemon edits are staged.'
		});
	}

	const sourceVerification = await services.verifySource?.(state);
	if (sourceVerification && !sourceVerification.ok) {
		return completeApply(state, {
			status: 'failed',
			message: sourceVerification.message ?? 'Pokemon Editor source changed before Apply.',
			reason: 'stale-source'
		});
	}

	const validation = await services.validate(state);
	if (!validation.ok) {
		return completeApply(state, outcomeFromValidation(validation));
	}

	if (state.source.owner === 'save-file') {
		const backup = await services.ensureSaveFileBackup?.(state);
		if (backup && !backup.ok) {
			return completeApply(state, outcomeFromValidation(backup));
		}

		const mutation = services.mutateSaveFilePokemon
			? await services.mutateSaveFilePokemon(state)
			: {
					ok: false as const,
					status: 'unsupported' as const,
					message: 'Pokemon editing is not available yet.',
					reason: 'engine-unavailable'
				};

		return completeMutation(state, mutation);
	}

	const mutation = services.mutateStoragePokemon
		? await services.mutateStoragePokemon(state)
		: {
				ok: false as const,
				status: 'unsupported' as const,
				message: 'Pokemon Storage editing is not available yet.',
				reason: 'storage-unavailable'
			};

	return completeMutation(state, mutation);
}

function completeMutation(
	state: PokemonEditorState,
	mutation: PokemonEditorMutationResult
): PokemonEditorApplyResult {
	if (!mutation.ok) {
		return completeApply(state, outcomeFromMutation(mutation));
	}

	return completeApply(
		withStagedEdits({
			...state,
			slot: mutation.slot,
			source: {
				...state.source,
				identity: createPokemonEditorSourceIdentity(mutation.slot)
			},
			stagedEdits: []
		}),
		{
			status: 'success',
			message: mutation.message ?? 'Pokemon edits applied.'
		}
	);
}

function outcomeFromValidation(
	validation: Extract<PokemonEditValidationResult, { ok: false }>
): Exclude<PokemonEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> {
	const outcome: Exclude<PokemonEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> = {
		status: validation.status,
		message: validation.message
	};
	if (validation.reason) outcome.reason = validation.reason;
	return outcome;
}

function outcomeFromMutation(
	mutation: Extract<PokemonEditorMutationResult, { ok: false }>
): Exclude<PokemonEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> {
	const outcome: Exclude<PokemonEditorApplyOutcome, { status: 'idle' | 'noop' | 'success' }> = {
		status: mutation.status,
		message: mutation.message
	};
	if (mutation.reason) outcome.reason = mutation.reason;
	return outcome;
}

function completeApply(
	state: PokemonEditorState,
	outcome: Exclude<PokemonEditorApplyOutcome, { status: 'idle' }>
): PokemonEditorApplyResult {
	const nextState = withApplyOutcome(state, outcome);
	return {
		state: nextState,
		outcome: nextState.applyOutcome
	};
}

function withApplyOutcome(
	state: PokemonEditorState,
	outcome: PokemonEditorApplyOutcome
): PokemonEditorState {
	return {
		...withStagedEdits(state),
		applyOutcome: outcome,
		unsupportedReason: outcome.status === 'unsupported' ? outcome.message : null
	};
}

function withStagedEdits(state: PokemonEditorState): PokemonEditorState {
	return {
		...state,
		staged: state.stagedEdits.length > 0
	};
}

function isLevelExperienceEditPayload(value: unknown): value is LevelExperienceEditPayload {
	if (typeof value !== 'object' || value === null || !('mode' in value)) {
		return false;
	}

	if (value.mode === 'level') {
		return 'level' in value && typeof value.level === 'number';
	}

	if (value.mode === 'experience') {
		return 'experience' in value && typeof value.experience === 'number';
	}

	return false;
}

function isNicknameEditPayload(value: unknown): value is { nickname: string } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'nickname' in value &&
		typeof value.nickname === 'string'
	);
}

function isPokemonOriginalTrainerEditPayload(
	value: unknown
): value is PokemonOriginalTrainerEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'name' in value &&
		typeof value.name === 'string' &&
		'trainerId' in value &&
		typeof value.trainerId === 'number' &&
		(!('secretId' in value) || typeof value.secretId === 'number') &&
		(!('genderId' in value) || typeof value.genderId === 'number') &&
		(!('languageId' in value) || typeof value.languageId === 'number')
	);
}

function isPokemonMetDataEditPayload(value: unknown): value is PokemonMetDataEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'locationId' in value &&
		typeof value.locationId === 'number' &&
		'metLevel' in value &&
		typeof value.metLevel === 'number' &&
		(!('metDate' in value) || value.metDate === null || typeof value.metDate === 'string') &&
		(!('originGameId' in value) || typeof value.originGameId === 'number') &&
		(!('ballId' in value) || typeof value.ballId === 'number')
	);
}

function isNatureEditPayload(value: unknown): value is NatureEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'natureId' in value &&
		typeof value.natureId === 'number'
	);
}

function isHeldItemEditPayload(value: unknown): value is HeldItemEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'heldItemId' in value &&
		typeof value.heldItemId === 'number'
	);
}

function isAbilityEditPayload(value: unknown): value is AbilityEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'abilityIndex' in value &&
		typeof value.abilityIndex === 'number'
	);
}

function isPokemonStatEditPayload(value: unknown): value is PokemonStatEditPayload {
	const candidate = value as Partial<Record<PokemonStatKey, unknown>>;
	return (
		typeof value === 'object' &&
		value !== null &&
		statKeys.every((key) => key in candidate && typeof candidate[key] === 'number')
	);
}

function isPokemonMoveSetEditPayload(value: unknown): value is PokemonMoveSetEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'moves' in value &&
		Array.isArray(value.moves) &&
		value.moves.every(
			(move) =>
				typeof move === 'object' &&
				move !== null &&
				'slot' in move &&
				typeof move.slot === 'number' &&
				'move' in move &&
				typeof move.move === 'number' &&
				(!('pp' in move) || typeof move.pp === 'number') &&
				(!('ppUps' in move) || typeof move.ppUps === 'number')
		)
	);
}

function isPokemonSpeciesFormEditPayload(value: unknown): value is PokemonSpeciesFormEditPayload {
	return (
		typeof value === 'object' &&
		value !== null &&
		'speciesId' in value &&
		typeof value.speciesId === 'number' &&
		Number.isInteger(value.speciesId) &&
		value.speciesId > 0 &&
		'form' in value &&
		typeof value.form === 'number' &&
		Number.isInteger(value.form) &&
		value.form >= 0
	);
}

function isPokemonFriendshipEditPayload(value: unknown): value is PokemonFriendshipEditPayload {
	return isPokemonFieldEditPayload(value);
}

function isPokemonBattleFieldEditPayload(value: unknown): value is PokemonBattleFieldEditPayload {
	return isPokemonFieldEditPayload(value);
}

function isPokemonFieldEditPayload(
	value: unknown
): value is { fields: Array<{ key: string; value: number }> } {
	return (
		typeof value === 'object' &&
		value !== null &&
		'fields' in value &&
		Array.isArray(value.fields) &&
		value.fields.every(
			(field) =>
				typeof field === 'object' &&
				field !== null &&
				'key' in field &&
				typeof field.key === 'string' &&
				'value' in field &&
				typeof field.value === 'number'
		)
	);
}
