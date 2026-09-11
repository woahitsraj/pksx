import { describe, expect, it, vi } from 'vitest';
import type { SaveSlotRef } from '$lib/engine';
import type { SlotView } from '$lib/components/pksx/types';
import {
	applyPokemonEditorEdits,
	cancelPokemonEditor,
	createPokemonEditOperation,
	createPokemonEditorState,
	isSamePokemonEditorSourceIdentity,
	markUnsupportedPokemonEditorApply,
	maxPpForPpUps,
	moveSetEditPayloadFromSlot,
	stageAbilityEdit,
	stageEvEdit,
	stageFriendshipEdit,
	stageHeldItemEdit,
	stageIvEdit,
	stageLevelExperienceEdit,
	stageMetDataEdit,
	stageMoveSetEdit,
	stageNatureEdit,
	stageOriginalTrainerEdit,
	stagePokemonEditorEdit,
	stageSpeciesFormEdit,
	statEditPayloadFromSlot,
	validateBattleFieldEdits,
	type PokemonEditorApplyServices,
	type PokemonEditorSourceInput
} from '.';

const slotRef: SaveSlotRef = { zone: 'box', box: 0, slot: 0 };

const source: PokemonEditorSourceInput = {
	owner: 'save-file',
	saveFileId: 'save-1',
	slotRef,
	location: 'Box 1, slot 1'
};

const pokemonSlot: SlotView = {
	slot: 0,
	label: 'ARON',
	detail: 'Lv. 12',
	level: 12,
	experience: 1728,
	experienceProjection: {
		minLevel: 1,
		maxLevel: 100,
		minExperience: 0,
		maxExperience: 1_000_000,
		currentLevelMinExperience: 1728,
		nextLevelMinExperience: 2197,
		currentLevelProgress: 0
	},
	speciesId: 304,
	form: 0,
	spriteIdentity: {
		speciesId: 304,
		form: 0,
		isEgg: false,
		isShiny: false,
		displaySex: 'default'
	},
	isEgg: false,
	kind: 'pokemon',
	friendshipEditConstraints: {
		supported: true,
		fields: [
			{ key: 'friendship', label: 'Friendship', value: 70, min: 0, max: 255 },
			{ key: 'affection', label: 'Affection', value: 0, min: 0, max: 255 }
		]
	}
};

const editablePokemonSlot: SlotView = {
	...pokemonSlot,
	stats: [
		{ key: 'HP', label: 'HP', value: 32, ev: 0, iv: 31, max: 255 },
		{ key: 'ATK', label: 'ATK', value: 20, ev: 0, iv: 30, max: 255 },
		{ key: 'DEF', label: 'DEF', value: 18, ev: 0, iv: 29, max: 255 },
		{ key: 'SPA', label: 'SPA', value: 15, ev: 0, iv: 28, max: 255 },
		{ key: 'SPD', label: 'SPD', value: 16, ev: 0, iv: 27, max: 255 },
		{ key: 'SPE', label: 'SPE', value: 22, ev: 0, iv: 26, max: 255 }
	],
	moves: [
		{
			slot: 0,
			id: 33,
			name: 'Tackle',
			type: 'Normal',
			hue: 107,
			chroma: 0.06,
			pp: 35,
			maxPp: 35,
			ppUps: 0
		},
		{
			slot: 1,
			id: 45,
			name: 'Growl',
			type: 'Normal',
			hue: 107,
			chroma: 0.06,
			pp: 40,
			maxPp: 40,
			ppUps: 0
		}
	],
	originalTrainerEditConstraints: {
		supported: true,
		currentName: 'PKSX',
		currentTrainerId: 41203,
		currentSecretId: 1204,
		currentGenderId: 0,
		currentLanguageId: 2,
		maxNameLength: 7,
		minTrainerId: 0,
		maxTrainerId: 65535,
		supportsSecretId: true,
		supportsGender: true,
		supportsLanguage: true,
		genders: [
			{ id: 0, name: 'Male' },
			{ id: 1, name: 'Female' }
		],
		languages: [
			{ id: 1, name: 'Japanese' },
			{ id: 2, name: 'English' }
		]
	},
	heldItemEditConstraints: {
		supported: true,
		currentItemId: 0,
		options: [
			{ id: 0, name: 'No item', available: true },
			{ id: 213, name: 'Bright Powder', available: true },
			{
				id: 999,
				name: 'Future Item',
				available: false,
				unavailableReason: 'Future Item is not supported for this Pokemon.'
			}
		]
	},
	ability: 'Sturdy',
	abilityEditConstraints: {
		supported: true,
		currentAbilityIndex: 0,
		options: [
			{ index: 0, id: 5, name: 'Sturdy', hidden: false, available: true },
			{ index: 1, id: 69, name: 'Rock Head', hidden: false, available: true },
			{
				index: 2,
				id: 134,
				name: 'Heavy Metal',
				hidden: true,
				available: false,
				unavailableReason: "Heavy Metal is not legal for this Pokemon's encounter and format."
			}
		]
	},
	metDataEditConstraints: {
		supported: true,
		currentLocationId: 16,
		currentMetLevel: 12,
		currentOriginGameId: 3,
		currentBallId: 4,
		minMetLevel: 0,
		maxMetLevel: 100,
		supportsMetDate: false,
		supportsOriginGame: true,
		supportsBall: true,
		locationGroups: [
			{
				originGameId: 3,
				options: [
					{ id: 16, name: 'Route 101' },
					{ id: 24, name: 'Littleroot Town' }
				]
			}
		],
		originGames: [{ id: 3, name: 'Emerald' }],
		balls: [
			{ id: 4, name: 'Poké Ball' },
			{ id: 3, name: 'Great Ball' }
		]
	},
	statEditConstraints: {
		supported: true,
		minIv: 0,
		maxIv: 31,
		minEv: 0,
		maxEv: 252,
		maxTotalEv: 510
	},
	moveSetEditConstraints: {
		supported: true,
		maxMoveSlots: 4,
		availableMoves: [
			{ id: 0, name: 'Empty', type: 'None', hue: 48, chroma: 0.04, maxPp: 0 },
			{ id: 33, name: 'Tackle', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 35 },
			{ id: 45, name: 'Growl', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 40 },
			{ id: 575, name: 'Sparkling Aria', type: 'Water', hue: 238, chroma: 0.09, maxPp: 10 }
		]
	},
	nature: 'Adamant',
	natureEditConstraints: {
		supported: true,
		currentNatureId: 3,
		originalNatureId: 3,
		statNatureId: 3,
		usesStatNature: false,
		options: [
			{ id: 3, name: 'Adamant', effect: '+Attack, -Sp. Atk' },
			{ id: 15, name: 'Modest', effect: '+Sp. Atk, -Attack' }
		]
	}
};

const battleFieldPokemonSlot: SlotView = {
	...editablePokemonSlot,
	battleFields: [
		{
			key: 'tera-type',
			label: 'Tera Type',
			value: 12,
			valueLabel: 'Electric',
			supported: true,
			options: [
				{ value: 9, label: 'Fire' },
				{ value: 12, label: 'Electric' }
			]
		}
	]
};

const updatedPokemonSlot: SlotView = {
	...pokemonSlot,
	label: 'LAIRON',
	speciesId: 305,
	spriteIdentity: {
		...pokemonSlot.spriteIdentity!,
		speciesId: 305
	}
};

const emptySlot: SlotView = {
	slot: 1,
	label: 'Empty',
	detail: '',
	level: null,
	experience: null,
	experienceProjection: null,
	speciesId: null,
	form: null,
	spriteIdentity: null,
	isEgg: false,
	kind: 'empty'
};

const stagedEdit = {
	id: 'nickname',
	capability: 'nickname-editing',
	label: 'Set nickname',
	payload: { nickname: 'RON' }
};

function openEditor(sourceOverride = source) {
	const opened = createPokemonEditorState(sourceOverride, pokemonSlot);
	if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');
	return opened.state;
}

function openEditableEditor(sourceOverride = source) {
	const opened = createPokemonEditorState(sourceOverride, editablePokemonSlot);
	if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');
	return opened.state;
}

function openBattleFieldEditor() {
	const opened = createPokemonEditorState(source, battleFieldPokemonSlot);
	if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');
	return opened.state;
}

function applyServices(
	overrides: Partial<PokemonEditorApplyServices> = {}
): PokemonEditorApplyServices {
	return {
		validate: vi.fn(async () => ({ ok: true as const })),
		mutateSaveFilePokemon: vi.fn(async () => ({
			ok: true as const,
			slot: updatedPokemonSlot,
			message: 'Applied Save File Pokemon edits.'
		})),
		mutateStoragePokemon: vi.fn(async () => ({
			ok: true as const,
			slot: updatedPokemonSlot,
			message: 'Applied Pokemon Storage edits.'
		})),
		...overrides
	};
}

describe('Pokemon editor state', () => {
	it('opens for an occupied Slot with source ownership context', () => {
		const result = createPokemonEditorState(source, pokemonSlot);

		expect(result).toMatchObject({
			ok: true,
			state: {
				source: {
					owner: 'save-file',
					saveFileId: 'save-1',
					slotRef,
					location: 'Box 1, slot 1'
				},
				slot: pokemonSlot,
				stagedEdits: [],
				staged: false,
				applyOutcome: { status: 'idle', message: null },
				unsupportedReason: null
			}
		});
	});

	it('hydrates missing save-file edit constraints from occupied Slot projections', () => {
		const slotWithProjectionOnly: SlotView = {
			...editablePokemonSlot,
			statEditConstraints: {
				supported: false,
				minIv: 0,
				maxIv: 31,
				minEv: 0,
				maxEv: 255,
				maxTotalEv: 510,
				unsupportedReason: 'IV and EV Editing is not available for this Pokemon projection.'
			},
			moveSetEditConstraints: {
				supported: false,
				maxMoveSlots: 4,
				availableMoves: [],
				unsupportedReason: 'Move Set Editing is not available for this Pokemon projection.'
			}
		};

		const result = createPokemonEditorState(source, slotWithProjectionOnly);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.state.slot.statEditConstraints).toMatchObject({
			supported: true,
			maxIv: 31,
			maxEv: 255,
			maxTotalEv: 510
		});
		expect(result.state.slot.moveSetEditConstraints).toMatchObject({
			supported: true,
			maxMoveSlots: 4,
			availableMoves: expect.arrayContaining([
				expect.objectContaining({ id: 0, name: 'Empty' }),
				expect.objectContaining({ id: 33, name: 'Tackle' }),
				expect.objectContaining({ id: 45, name: 'Growl' })
			])
		});
	});

	it('does not hydrate app-owned storage edit constraints', () => {
		const storageSource: PokemonEditorSourceInput = {
			owner: 'pokemon-storage',
			storagePokemonId: 'pokemon-storage:0:0',
			location: 'Box 1, slot 1'
		};
		const result = createPokemonEditorState(storageSource, {
			...editablePokemonSlot,
			statEditConstraints: {
				supported: false,
				minIv: 0,
				maxIv: 31,
				minEv: 0,
				maxEv: 255,
				maxTotalEv: 510,
				unsupportedReason: 'Storage editing is not supported yet.'
			},
			moveSetEditConstraints: {
				supported: false,
				maxMoveSlots: 4,
				availableMoves: [],
				unsupportedReason: 'Storage editing is not supported yet.'
			}
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.state.slot.statEditConstraints?.supported).toBe(false);
		expect(result.state.slot.moveSetEditConstraints?.supported).toBe(false);
	});

	it('rejects empty Slots', () => {
		expect(createPokemonEditorState(source, emptySlot)).toEqual({
			ok: false,
			reason: 'Pokemon Editor requires an occupied Slot.'
		});
	});

	it('stages engine mutation commands without mutating the source Slot projection', () => {
		const opened = openEditor();

		const staged = stagePokemonEditorEdit(opened, stagedEdit);

		expect(staged.staged).toBe(true);
		expect(staged.stagedEdits).toEqual([stagedEdit]);
		expect(staged.slot).toBe(pokemonSlot);
		expect(opened.staged).toBe(false);
	});

	it('stages and cancels a Species and Form edit without mutating the source projection', () => {
		const opened = openEditor();
		const staged = stageSpeciesFormEdit(opened, { speciesId: 305, form: 0 });

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, speciesId: 305, form: 0 }
		});
		expect(staged.slot).toBe(pokemonSlot);
		expect(cancelPokemonEditor(staged)).toMatchObject({
			stagedEdits: [],
			staged: false,
			slot: pokemonSlot
		});
	});

	it('rejects malformed Species and Form edits before apply', () => {
		const invalid = stageSpeciesFormEdit(openEditor(), { speciesId: 0, form: -1 });

		expect(invalid).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'Species and Form selection is invalid.',
				reason: 'invalid-pokemon-edit'
			}
		});
	});

	it('replaces staged commands from the same capability instance', () => {
		const opened = openEditor();

		const staged = stagePokemonEditorEdit(stagePokemonEditorEdit(opened, stagedEdit), {
			...stagedEdit,
			payload: { nickname: 'IRON' }
		});

		expect(staged.stagedEdits).toHaveLength(1);
		expect(staged.stagedEdits[0]?.payload).toEqual({ nickname: 'IRON' });
	});

	it('stages valid level edits with engine-backed range metadata', () => {
		const staged = stageLevelExperienceEdit(openEditor(), { mode: 'level', level: 20 });

		expect(staged.stagedEdits).toEqual([
			{
				id: 'level-experience',
				capability: 'level-experience-editing',
				label: 'Set level to 20',
				payload: { mode: 'level', level: 20 }
			}
		]);
		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, level: 20 }
		});
	});

	it('stages Original Trainer data with engine-backed text and ID constraints', () => {
		const staged = stageOriginalTrainerEdit(openEditableEditor(), {
			name: 'RAJAN',
			trainerId: 12345,
			secretId: 54321,
			genderId: 1,
			languageId: 2
		});

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: {
				source: slotRef,
				originalTrainer: {
					name: 'RAJAN',
					trainerId: 12345,
					secretId: 54321,
					genderId: 1,
					languageId: 2
				}
			}
		});
	});

	it('rejects invalid Original Trainer text and ID values', () => {
		const invalidName = stageOriginalTrainerEdit(openEditableEditor(), {
			name: 'TOO-LONG',
			trainerId: 1
		});
		const invalidId = stageOriginalTrainerEdit(openEditableEditor(), {
			name: 'PKSX',
			trainerId: 65536
		});

		expect(invalidName.applyOutcome).toMatchObject({
			status: 'rejected',
			message: 'Original Trainer name must be 7 characters or fewer.'
		});
		expect(invalidId.applyOutcome).toMatchObject({
			status: 'rejected',
			message: 'Trainer ID must be between 0 and 65535.'
		});
	});

	it('stages engine-projected Friendship fields into one operation', () => {
		const staged = stageFriendshipEdit(openEditor(), {
			fields: [
				{ key: 'friendship', value: 255 },
				{ key: 'affection', value: 100 }
			]
		});

		expect(staged.stagedEdits).toEqual([
			{
				id: 'friendship',
				capability: 'friendship-editing',
				label: 'Set Friendship and Affection',
				payload: {
					fields: [
						{ key: 'friendship', value: 255 },
						{ key: 'affection', value: 100 }
					]
				}
			}
		]);
		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: {
				source: slotRef,
				friendshipEdits: [
					{ key: 'friendship', value: 255 },
					{ key: 'affection', value: 100 }
				]
			}
		});
	});

	it('rejects invalid and unsupported Friendship fields', () => {
		const invalid = stageFriendshipEdit(openEditor(), {
			fields: [{ key: 'friendship', value: 256 }]
		});
		const unsupportedSlot: SlotView = {
			...pokemonSlot,
			friendshipEditConstraints: {
				supported: false,
				fields: [],
				unsupportedReason: 'Friendship Editing is not supported for Generation 1 Pokemon.'
			}
		};
		const opened = createPokemonEditorState(source, unsupportedSlot);
		if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');
		const unsupported = stageFriendshipEdit(opened.state, {
			fields: [{ key: 'friendship', value: 100 }]
		});

		expect(invalid.applyOutcome).toEqual({
			status: 'rejected',
			message: 'Friendship must be between 0 and 255.',
			reason: 'invalid-pokemon-edit'
		});
		expect(unsupported.applyOutcome).toEqual({
			status: 'rejected',
			message: 'Friendship Editing is not supported for Generation 1 Pokemon.',
			reason: 'invalid-pokemon-edit'
		});
	});

	it('stages an engine-provided Held Item choice', () => {
		const staged = stageHeldItemEdit(openEditableEditor(), { heldItemId: 213 });

		expect(staged.stagedEdits).toEqual([
			{
				id: 'held-item',
				capability: 'held-item-editing',
				label: 'Set Held Item to Bright Powder',
				payload: { heldItemId: 213 }
			}
		]);
		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, heldItemId: 213 }
		});
	});

	it('stages Held Item removal and cancel leaves the Slot projection unchanged', () => {
		const heldItemSlot: SlotView = {
			...editablePokemonSlot,
			heldItem: 'Bright Powder',
			heldItemEditConstraints: {
				...editablePokemonSlot.heldItemEditConstraints!,
				currentItemId: 213
			}
		};
		const opened = createPokemonEditorState(source, heldItemSlot);
		if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');

		const staged = stageHeldItemEdit(opened.state, { heldItemId: 0 });

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, heldItemId: 0 }
		});
		expect(cancelPokemonEditor(staged)).toMatchObject({
			slot: heldItemSlot,
			stagedEdits: [],
			staged: false
		});
	});

	it('rejects a Held Item unavailable for the Pokemon', () => {
		const rejected = stageHeldItemEdit(openEditableEditor(), { heldItemId: 999 });

		expect(rejected).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'Future Item is not supported for this Pokemon.',
				reason: 'invalid-pokemon-edit'
			}
		});
	});

	it('rejects invalid level and experience ranges without staging mutation', () => {
		const invalidLevel = stageLevelExperienceEdit(openEditor(), { mode: 'level', level: 101 });
		const invalidExperience = stageLevelExperienceEdit(openEditor(), {
			mode: 'experience',
			experience: -1
		});

		expect(invalidLevel).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'Level must be between 1 and 100.',
				reason: 'invalid-pokemon-edit'
			}
		});
		expect(invalidExperience).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'Experience must be between 0 and 1000000.',
				reason: 'invalid-pokemon-edit'
			}
		});
	});

	it('clears a pending level edit when a later level value is invalid', () => {
		const staged = stageLevelExperienceEdit(openEditor(), { mode: 'level', level: 20 });
		const invalid = stageLevelExperienceEdit(staged, { mode: 'level', level: 101 });

		expect(invalid).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'Level must be between 1 and 100.',
				reason: 'invalid-pokemon-edit'
			}
		});
	});

	it('stages an engine-backed Nature choice', () => {
		const staged = stageNatureEdit(openEditableEditor(), { natureId: 15 });

		expect(staged.stagedEdits).toEqual([
			{
				id: 'nature',
				capability: 'nature-editing',
				label: 'Set Nature to Modest',
				payload: { natureId: 15 }
			}
		]);
		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, natureId: 15 }
		});
	});

	it('stages an engine-backed Ability choice and cancels without mutation', () => {
		const staged = stageAbilityEdit(openEditableEditor(), { abilityIndex: 1 });

		expect(staged.stagedEdits).toEqual([
			{
				id: 'ability',
				capability: 'ability-editing',
				label: 'Set Ability to Rock Head',
				payload: { abilityIndex: 1 }
			}
		]);
		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, abilityIndex: 1 }
		});
		expect(cancelPokemonEditor(staged)).toMatchObject({
			slot: editablePokemonSlot,
			stagedEdits: [],
			staged: false
		});
	});

	it('stages supported Met Data fields from engine-provided choices and cancels cleanly', () => {
		const payload = {
			locationId: 24,
			metLevel: 10,
			originGameId: 3,
			ballId: 3
		};
		const opened = openEditableEditor();
		const staged = stageMetDataEdit(opened, payload);

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, metData: payload }
		});
		expect(cancelPokemonEditor(staged)).toMatchObject({
			slot: editablePokemonSlot,
			stagedEdits: [],
			staged: false
		});
	});

	it('rejects unavailable and unsupported Ability choices', () => {
		const unavailable = stageAbilityEdit(openEditableEditor(), { abilityIndex: 2 });
		const unsupported = stageAbilityEdit(openEditor(), { abilityIndex: 0 });

		expect(unavailable.applyOutcome).toEqual({
			status: 'rejected',
			message: "Heavy Metal is not legal for this Pokemon's encounter and format.",
			reason: 'invalid-pokemon-edit'
		});
		expect(unsupported.applyOutcome).toEqual({
			status: 'rejected',
			message: 'Ability Editing is not supported for this Pokemon format.',
			reason: 'invalid-pokemon-edit'
		});
	});

	it('rejects Met Data choices that are invalid for the selected origin game', () => {
		const invalid = stageMetDataEdit(openEditableEditor(), {
			locationId: 999,
			metLevel: 10,
			originGameId: 3,
			ballId: 4
		});

		expect(invalid).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'Met location is not available for the selected origin game.',
				reason: 'invalid-pokemon-edit'
			}
		});
	});

	it('stages supported Met Date edits and rejects invalid dates', () => {
		const datedSlot: SlotView = {
			...editablePokemonSlot,
			metDataEditConstraints: {
				...editablePokemonSlot.metDataEditConstraints!,
				currentMetDate: '2024-01-15',
				supportsMetDate: true
			}
		};
		const opened = createPokemonEditorState(source, datedSlot);
		if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');
		const payload = {
			locationId: 16,
			metLevel: 12,
			metDate: '2024-02-29',
			originGameId: 3,
			ballId: 4
		};

		expect(createPokemonEditOperation(stageMetDataEdit(opened.state, payload))).toEqual({
			ok: true,
			operation: { source: slotRef, metData: payload }
		});
		expect(
			stageMetDataEdit(opened.state, { ...payload, metDate: '2024-02-30' }).applyOutcome
		).toEqual({
			status: 'rejected',
			message: 'Met date must be a valid date from 2000 through 2255.',
			reason: 'invalid-pokemon-edit'
		});
	});

	it('rejects unsupported and unknown Nature choices', () => {
		const unsupported = stageNatureEdit(
			{
				...openEditableEditor(),
				slot: {
					...editablePokemonSlot,
					natureEditConstraints: {
						...editablePokemonSlot.natureEditConstraints!,
						supported: false,
						unsupportedReason: 'Nature Editing is not supported for this Pokemon format.'
					}
				}
			},
			{ natureId: 15 }
		);
		const unknown = stageNatureEdit(openEditableEditor(), { natureId: 99 });

		expect(unsupported.applyOutcome).toMatchObject({
			status: 'rejected',
			message: 'Nature Editing is not supported for this Pokemon format.'
		});
		expect(unknown.applyOutcome).toMatchObject({
			status: 'rejected',
			message: 'Nature 99 is not available.'
		});
	});

	it('keeps Nature edits staged on failure and clears them on cancel', async () => {
		const state = stageNatureEdit(openEditableEditor(), { natureId: 15 });
		const services = applyServices({
			mutateSaveFilePokemon: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Engine mutation failed.'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.state.stagedEdits).toEqual(state.stagedEdits);
		expect(cancelPokemonEditor(result.state).stagedEdits).toEqual([]);
	});

	it('keeps Pokemon Storage Nature edits behind the storage ownership boundary', () => {
		const opened = createPokemonEditorState(
			{
				owner: 'pokemon-storage',
				storagePokemonId: 'stored-pokemon-1',
				location: 'Storage Box 1, slot 1'
			},
			editablePokemonSlot
		);
		if (!opened.ok) throw new Error('Expected Pokemon Editor to open.');
		const state = stageNatureEdit(opened.state, { natureId: 15 });

		expect(createPokemonEditOperation(state)).toMatchObject({
			ok: false,
			status: 'unsupported',
			reason: 'storage-unavailable'
		});
	});

	it('applies Met Data through Save File and Pokemon Storage ownership boundaries', async () => {
		const payload = { locationId: 24, metLevel: 10, originGameId: 3, ballId: 3 };
		const saveState = stageMetDataEdit(openEditableEditor(), payload);
		const saveServices = applyServices();
		const saveResult = await applyPokemonEditorEdits(saveState, saveServices);
		expect(saveResult.outcome.status).toBe('success');
		expect(saveServices.mutateSaveFilePokemon).toHaveBeenCalledWith(saveState);

		const storageSource: PokemonEditorSourceInput = {
			owner: 'pokemon-storage',
			storagePokemonId: 'stored-pokemon-1',
			location: 'Storage Box 1, slot 1'
		};
		const storageState = stageMetDataEdit(openEditableEditor(storageSource), payload);
		const storageServices = applyServices();
		const storageResult = await applyPokemonEditorEdits(storageState, storageServices);
		expect(storageResult.outcome.status).toBe('success');
		expect(storageServices.mutateStoragePokemon).toHaveBeenCalledWith(storageState);
	});

	it('keeps Met Data staged when engine mutation fails', async () => {
		const state = stageMetDataEdit(openEditableEditor(), {
			locationId: 24,
			metLevel: 10,
			originGameId: 3,
			ballId: 3
		});
		const result = await applyPokemonEditorEdits(
			state,
			applyServices({
				mutateSaveFilePokemon: vi.fn(async () => ({
					ok: false as const,
					status: 'rejected' as const,
					message: 'Met Data edit is not valid for this Pokemon encounter.'
				}))
			})
		);

		expect(result.outcome.status).toBe('rejected');
		expect(result.state.stagedEdits).toEqual(state.stagedEdits);
	});

	it('stages IV boundary values from engine-provided constraints', () => {
		const staged = stageIvEdit(openEditableEditor(), {
			HP: 31,
			ATK: 0,
			DEF: 1,
			SPA: 2,
			SPD: 3,
			SPE: 4
		});

		expect(staged.stagedEdits).toEqual([
			{
				id: 'ivs',
				capability: 'iv-editing',
				label: 'Set IVs',
				payload: { HP: 31, ATK: 0, DEF: 1, SPA: 2, SPD: 3, SPE: 4 }
			}
		]);
		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: {
				source: slotRef,
				ivs: { HP: 31, ATK: 0, DEF: 1, SPA: 2, SPD: 3, SPE: 4 }
			}
		});
	});

	it('builds structured-clone-safe IV operation payloads for Worker messages', () => {
		const proxyPayload = new Proxy({ HP: 31, ATK: 30, DEF: 29, SPA: 28, SPD: 27, SPE: 26 }, {});
		const staged = stageIvEdit(openEditableEditor(), proxyPayload);
		const built = createPokemonEditOperation(staged);

		expect(built.ok).toBe(true);
		if (!built.ok) return;
		expect(() => structuredClone(built.operation)).not.toThrow();
		expect(built.operation.ivs).toEqual(proxyPayload);
		expect(built.operation.ivs).not.toBe(proxyPayload);
	});

	it('rejects invalid IV ranges without staging mutation', () => {
		const invalid = stageIvEdit(openEditableEditor(), {
			HP: 32,
			ATK: 0,
			DEF: 0,
			SPA: 0,
			SPD: 0,
			SPE: 0
		});

		expect(invalid).toMatchObject({
			stagedEdits: [],
			staged: false,
			applyOutcome: {
				status: 'rejected',
				message: 'HP IV must be between 0 and 31.',
				reason: 'invalid-pokemon-edit'
			}
		});
	});

	it('rejects invalid EV totals before apply', () => {
		const invalid = stageEvEdit(openEditableEditor(), {
			HP: 252,
			ATK: 252,
			DEF: 7,
			SPA: 0,
			SPD: 0,
			SPE: 0
		});

		expect(invalid.applyOutcome).toEqual({
			status: 'rejected',
			message: 'Total EVs must be 510 or less.',
			reason: 'invalid-pokemon-edit'
		});
		expect(invalid.stagedEdits).toEqual([]);
	});

	it('stages EV edits and Move Set edits into one engine operation', () => {
		const evs = { HP: 252, ATK: 0, DEF: 0, SPA: 0, SPD: 4, SPE: 252 };
		const moves = moveSetEditPayloadFromSlot(editablePokemonSlot);
		moves.moves[1] = { slot: 1, move: 0, pp: 0, ppUps: 0 };

		const staged = stageMoveSetEdit(stageEvEdit(openEditableEditor(), evs), moves);

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: {
				source: slotRef,
				evs,
				moves: moves.moves
			}
		});
	});

	it('builds a Tera Type operation from engine-projected battle field choices', () => {
		const staged = stagePokemonEditorEdit(openBattleFieldEditor(), {
			id: 'battle-fields',
			capability: 'generation-specific-battle-field-editing',
			label: 'Set battle fields',
			payload: { fields: [{ key: 'tera-type', value: 9 }] }
		});

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: true,
			operation: { source: slotRef, teraType: 9 }
		});
	});

	it('rejects unavailable, invalid, and engine-disabled battle fields', () => {
		expect(
			validateBattleFieldEdits(pokemonSlot, {
				fields: [{ key: 'tera-type', value: 9 }]
			})
		).toEqual({
			ok: false,
			message: 'This Pokemon format does not expose that battle field.'
		});
		expect(
			validateBattleFieldEdits(battleFieldPokemonSlot, {
				fields: [{ key: 'tera-type', value: 99 }]
			})
		).toEqual({ ok: false, message: 'Choose a valid Tera Type.' });
		expect(
			validateBattleFieldEdits(
				{
					...battleFieldPokemonSlot,
					battleFields: [
						{
							...battleFieldPokemonSlot.battleFields![0]!,
							supported: false,
							unsupportedReason: 'Tera Type Editing is not supported for this Pokemon species.'
						}
					]
				},
				{ fields: [{ key: 'tera-type', value: 9 }] }
			)
		).toEqual({
			ok: false,
			message: 'Tera Type Editing is not supported for this Pokemon species.'
		});
	});

	it('preserves move slot positions from compacted move projections', () => {
		const sparseSlot: SlotView = {
			...editablePokemonSlot,
			moves: [
				{
					slot: 0,
					id: 33,
					name: 'Tackle',
					type: 'Normal',
					hue: 107,
					chroma: 0.06,
					pp: 35,
					maxPp: 35,
					ppUps: 0
				},
				{
					slot: 2,
					id: 45,
					name: 'Growl',
					type: 'Normal',
					hue: 107,
					chroma: 0.06,
					pp: 40,
					maxPp: 40,
					ppUps: 0
				}
			]
		};

		expect(moveSetEditPayloadFromSlot(sparseSlot)).toEqual({
			moves: [
				{ slot: 0, move: 33, pp: 35, ppUps: 0 },
				{ slot: 1, move: 0, pp: 0, ppUps: 0 },
				{ slot: 2, move: 45, pp: 40, ppUps: 0 },
				{ slot: 3, move: 0, pp: 0, ppUps: 0 }
			]
		});
	});

	it('rejects unsupported move selection from engine-provided options', () => {
		const invalid = stageMoveSetEdit(openEditableEditor(), {
			moves: [{ slot: 0, move: 999, pp: 10, ppUps: 0 }]
		});

		expect(invalid.applyOutcome).toEqual({
			status: 'rejected',
			message: 'Move 999 is not available for this Pokemon.',
			reason: 'invalid-pokemon-edit'
		});
	});

	it('validates move PP against the PP Up-adjusted maximum', () => {
		expect(maxPpForPpUps(10, 3)).toBe(16);

		const valid = stageMoveSetEdit(openEditableEditor(), {
			moves: [{ slot: 0, move: 575, pp: 16, ppUps: 3 }]
		});
		const invalid = stageMoveSetEdit(openEditableEditor(), {
			moves: [{ slot: 0, move: 575, pp: 17, ppUps: 3 }]
		});

		expect(createPokemonEditOperation(valid)).toEqual({
			ok: true,
			operation: {
				source: slotRef,
				moves: [{ slot: 0, move: 575, pp: 16, ppUps: 3 }]
			}
		});
		expect(invalid.applyOutcome).toEqual({
			status: 'rejected',
			message: 'PP for Sparkling Aria must be between 0 and 16.',
			reason: 'invalid-pokemon-edit'
		});
	});

	it('rejects malformed Move Set operation payloads', () => {
		const staged = stagePokemonEditorEdit(openEditableEditor(), {
			id: 'move-set',
			capability: 'move-set-editing',
			label: 'Set Move Set',
			payload: { moves: 'invalid' }
		});

		expect(createPokemonEditOperation(staged)).toEqual({
			ok: false,
			status: 'rejected',
			message: 'Move Set edit payload is invalid.',
			reason: 'invalid-pokemon-edit'
		});
	});

	it('reports unsupported Move Set Editing constraints', () => {
		const editor = openEditableEditor();
		const unsupported = stageMoveSetEdit(
			{
				...editor,
				slot: {
					...editor.slot,
					moveSetEditConstraints: {
						...editor.slot.moveSetEditConstraints!,
						supported: false,
						unsupportedReason: 'Move Set Editing is unavailable for this format.'
					}
				}
			},
			{ moves: [{ slot: 0, move: 33 }] }
		);

		expect(unsupported.applyOutcome).toEqual({
			status: 'rejected',
			message: 'Move Set Editing is unavailable for this format.',
			reason: 'invalid-pokemon-edit'
		});
		expect(unsupported.stagedEdits).toEqual([]);
	});

	it('creates stat payloads from visible Slot projections', () => {
		expect(statEditPayloadFromSlot(editablePokemonSlot, 'iv')).toEqual({
			HP: 31,
			ATK: 30,
			DEF: 29,
			SPA: 28,
			SPD: 27,
			SPE: 26
		});
		expect(statEditPayloadFromSlot(editablePokemonSlot, 'ev')).toEqual({
			HP: 0,
			ATK: 0,
			DEF: 0,
			SPA: 0,
			SPD: 0,
			SPE: 0
		});
	});

	it('keeps cancel non-mutating and clears staged feedback', () => {
		const staged = markUnsupportedPokemonEditorApply(
			stageFriendshipEdit(openEditor(), {
				fields: [{ key: 'friendship', value: 120 }]
			})
		);

		expect(cancelPokemonEditor(staged)).toMatchObject({
			slot: pokemonSlot,
			stagedEdits: [],
			staged: false,
			applyOutcome: { status: 'idle', message: null },
			unsupportedReason: null
		});
	});

	it('treats no staged edits as a no-op without validation or mutation', async () => {
		const services = applyServices();

		const result = await applyPokemonEditorEdits(openEditor(), services);

		expect(result.outcome).toEqual({
			status: 'noop',
			message: 'No Pokemon edits are staged.'
		});
		expect(services.validate).not.toHaveBeenCalled();
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('applies Save File-owned staged edits after validation and backup checks', async () => {
		const calls: string[] = [];
		const state = stagePokemonEditorEdit(openEditor(), stagedEdit);
		const services = applyServices({
			validate: vi.fn(async () => {
				calls.push('validate');
				return { ok: true as const };
			}),
			ensureSaveFileBackup: vi.fn(async () => {
				calls.push('backup');
				return { ok: true as const };
			}),
			mutateSaveFilePokemon: vi.fn(async () => {
				calls.push('mutate');
				return { ok: true as const, slot: updatedPokemonSlot, message: 'Saved.' };
			})
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(calls).toEqual(['validate', 'backup', 'mutate']);
		expect(result.outcome).toEqual({ status: 'success', message: 'Saved.' });
		expect(result.state.slot).toEqual(updatedPokemonSlot);
		expect(result.state.stagedEdits).toEqual([]);
		expect(result.state.staged).toBe(false);
	});

	it('does not create a Backup when engine validation rejects staged edits', async () => {
		const state = stagePokemonEditorEdit(openEditor(), stagedEdit);
		const services = applyServices({
			validate: vi.fn(async () => ({
				ok: false as const,
				status: 'rejected' as const,
				message: 'Nickname is not valid for this format.'
			})),
			ensureSaveFileBackup: vi.fn(async () => ({ ok: true as const }))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'rejected',
			message: 'Nickname is not valid for this format.'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
		expect(services.ensureSaveFileBackup).not.toHaveBeenCalled();
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('keeps staged edits when backup creation fails before mutation', async () => {
		const state = stagePokemonEditorEdit(openEditor(), stagedEdit);
		const services = applyServices({
			ensureSaveFileBackup: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Backup could not be created.',
				reason: 'backup-write-failed'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Backup could not be created.',
			reason: 'backup-write-failed'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('records unsupported apply feedback without staging a mutation', async () => {
		const state = stagePokemonEditorEdit(openEditor(), stagedEdit);
		const services = applyServices({
			validate: vi.fn(async () => ({
				ok: false as const,
				status: 'unsupported' as const,
				message: 'Pokemon editing is not available yet.',
				reason: 'engine-unavailable'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'unsupported',
			message: 'Pokemon editing is not available yet.',
			reason: 'engine-unavailable'
		});
		expect(result.state.unsupportedReason).toBe('Pokemon editing is not available yet.');
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
	});

	it('routes Pokemon Storage-owned Species and Form apply through the storage mutation boundary', async () => {
		const storageSource: PokemonEditorSourceInput = {
			owner: 'pokemon-storage',
			storagePokemonId: 'stored-pokemon-1',
			location: 'Storage Box 1, slot 1'
		};
		const state = stageSpeciesFormEdit(openEditor(storageSource), { speciesId: 305, form: 0 });
		const services = applyServices({
			ensureSaveFileBackup: vi.fn(async () => ({ ok: true as const }))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome.status).toBe('success');
		expect(services.mutateStoragePokemon).toHaveBeenCalledWith(state);
		expect(services.ensureSaveFileBackup).not.toHaveBeenCalled();
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('routes Pokemon Storage-owned apply through the storage mutation boundary', async () => {
		const storageSource: PokemonEditorSourceInput = {
			owner: 'pokemon-storage',
			storagePokemonId: 'stored-pokemon-1',
			location: 'Storage Box 1, slot 1'
		};
		const state = stageFriendshipEdit(openEditor(storageSource), {
			fields: [{ key: 'friendship', value: 120 }]
		});
		const services = applyServices({
			ensureSaveFileBackup: vi.fn(async () => ({ ok: true as const }))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome.status).toBe('success');
		expect(services.mutateStoragePokemon).toHaveBeenCalledWith(state);
		expect(services.ensureSaveFileBackup).not.toHaveBeenCalled();
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('keeps Species and Form edits staged when Save File mutation fails', async () => {
		const state = stageSpeciesFormEdit(openEditor(), { speciesId: 305, form: 0 });
		const services = applyServices({
			mutateSaveFilePokemon: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Engine mutation failed.',
				reason: 'engine-unavailable'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Engine mutation failed.',
			reason: 'engine-unavailable'
		});
		expect(result.state.stagedEdits).toEqual(state.stagedEdits);
	});

	it('keeps Ability edits staged when Save File mutation fails', async () => {
		const state = stageAbilityEdit(openEditableEditor(), { abilityIndex: 1 });
		const services = applyServices({
			mutateSaveFilePokemon: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Engine mutation failed.',
				reason: 'engine-unavailable'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Engine mutation failed.',
			reason: 'engine-unavailable'
		});
		expect(result.state.stagedEdits).toEqual(state.stagedEdits);
	});

	it('keeps Friendship edits staged when apply fails', async () => {
		const state = stageFriendshipEdit(openEditor(), {
			fields: [{ key: 'friendship', value: 120 }]
		});
		const services = applyServices({
			mutateSaveFilePokemon: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Engine mutation failed.',
				reason: 'engine-unavailable'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome.status).toBe('failed');
		expect(result.state.stagedEdits).toEqual(state.stagedEdits);
	});

	it('keeps Held Item edits staged after failure and routes storage ownership correctly', async () => {
		const failedState = stageHeldItemEdit(openEditableEditor(), { heldItemId: 213 });
		const failed = await applyPokemonEditorEdits(
			failedState,
			applyServices({
				mutateSaveFilePokemon: vi.fn(async () => ({
					ok: false as const,
					status: 'failed' as const,
					message: 'Engine mutation failed.',
					reason: 'engine-unavailable'
				}))
			})
		);
		expect(failed.state.stagedEdits).toEqual(failedState.stagedEdits);

		const storageSource: PokemonEditorSourceInput = {
			owner: 'pokemon-storage',
			storagePokemonId: 'stored-pokemon-1',
			location: 'Storage Box 1, slot 1'
		};
		const opened = createPokemonEditorState(storageSource, editablePokemonSlot);
		if (!opened.ok) throw new Error('Expected Pokemon Storage editor to open.');
		const storageState = stageHeldItemEdit(opened.state, { heldItemId: 213 });
		const services = applyServices();
		const applied = await applyPokemonEditorEdits(storageState, services);

		expect(applied.outcome.status).toBe('success');
		expect(services.mutateStoragePokemon).toHaveBeenCalledWith(storageState);
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('keeps level edits staged when Save File mutation fails', async () => {
		const state = stageLevelExperienceEdit(openEditor(), { mode: 'level', level: 18 });
		const services = applyServices({
			mutateSaveFilePokemon: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Engine mutation failed.',
				reason: 'engine-unavailable'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Engine mutation failed.',
			reason: 'engine-unavailable'
		});
		expect(result.state.stagedEdits).toEqual(state.stagedEdits);
	});

	it('refuses apply when the source no longer identifies the same Pokemon Entity', async () => {
		const state = stagePokemonEditorEdit(openEditor(), stagedEdit);
		const services = applyServices({
			verifySource: vi.fn(async () => ({
				ok: false,
				message: 'Pokemon Editor source changed before Apply.'
			}))
		});

		const result = await applyPokemonEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Pokemon Editor source changed before Apply.',
			reason: 'stale-source'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
		expect(services.validate).not.toHaveBeenCalled();
		expect(services.mutateSaveFilePokemon).not.toHaveBeenCalled();
	});

	it('compares editor source identity against current Slot projections', () => {
		const state = openEditor();

		expect(isSamePokemonEditorSourceIdentity(state, pokemonSlot)).toBe(true);
		expect(isSamePokemonEditorSourceIdentity(state, updatedPokemonSlot)).toBe(false);
		expect(isSamePokemonEditorSourceIdentity(state, emptySlot)).toBe(false);
		expect(isSamePokemonEditorSourceIdentity(state, null)).toBe(false);
	});
});
