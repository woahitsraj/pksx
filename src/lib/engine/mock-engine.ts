import type {
	BoxSlotSummary,
	EngineApi,
	EngineResult,
	EngineVersion,
	LegalityReport,
	PokemonActionPreview,
	PokemonActionResult,
	PokemonCreationCatalogue,
	PokemonCreationResult,
	PokemonEditOperationResult,
	PokemonSpeciesFormEditProjection,
	SaveSlotRef,
	PartySlotSummary,
	SaveSummary,
	SaveWorkspace,
	SlotOperation,
	SlotOperationResult,
	StoredPokemonImportResult,
	StoredPokemonActionResult,
	SerializedSave
} from './types';

const mockVersion: EngineVersion = {
	pkhexCoreVersion: 'mock',
	facadeVersion: 'mock'
};

const mockSaveSummary: SaveSummary = {
	fileName: 'mock.sav',
	saveType: 'MockSaveFile',
	gameVersion: 'SV',
	gameVersionId: 45,
	generation: 9,
	trainerName: 'PKSX',
	trainerId: 41203,
	playTime: '47:12',
	playedHours: 47,
	playedMinutes: 12,
	partyCount: 1,
	boxCount: 1,
	boxSlotCount: 30
};

const mockPikachuDetails = {
	experience: 125,
	experienceProjection: {
		minLevel: 1,
		maxLevel: 100,
		minExperience: 0,
		maxExperience: 1_000_000,
		currentLevelMinExperience: 125,
		nextLevelMinExperience: 216,
		currentLevelProgress: 0
	},
	gender: '♂',
	nature: 'Hardy',
	natureEditConstraints: {
		supported: true,
		currentNatureId: 0,
		originalNatureId: 0,
		statNatureId: 0,
		usesStatNature: true,
		options: [
			{ id: 0, name: 'Hardy', effect: 'No stat change' },
			{ id: 3, name: 'Adamant', effect: '+Attack, -Sp. Atk' },
			{ id: 15, name: 'Modest', effect: '+Sp. Atk, -Attack' }
		]
	},
	ability: 'Static',
	heldItem: 'Light Ball',
	types: [{ name: 'Electric', hue: 94, chroma: 0.16 }],
	stats: [
		{ key: 'HP', label: 'HP', value: 20, ev: null, iv: 31, max: 255 },
		{ key: 'ATK', label: 'ATK', value: 12, ev: null, iv: 31, max: 255 },
		{ key: 'DEF', label: 'DEF', value: 10, ev: null, iv: 31, max: 255 },
		{ key: 'SPA', label: 'SPA', value: 11, ev: null, iv: 31, max: 255 },
		{ key: 'SPD', label: 'SPD', value: 12, ev: null, iv: 31, max: 255 },
		{ key: 'SPE', label: 'SPE', value: 18, ev: null, iv: 31, max: 255 }
	],
	moves: [
		{
			slot: 0,
			id: 84,
			name: 'Thunder Shock',
			type: 'Electric',
			hue: 94,
			chroma: 0.16,
			pp: 30,
			maxPp: 30,
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
	heldItemEditConstraints: {
		supported: true,
		currentItemId: 236,
		options: [
			{ id: 0, name: 'No item', available: true },
			{ id: 236, name: 'Light Ball', available: true },
			{ id: 25, name: 'Poke Doll', available: false, unavailableReason: 'Unavailable.' }
		]
	},
	abilityEditConstraints: {
		supported: true,
		currentAbilityIndex: 0,
		options: [
			{ index: 0, id: 9, name: 'Static', hidden: false, available: true },
			{ index: 1, id: 31, name: 'Lightning Rod', hidden: false, available: true }
		]
	},
	metDataEditConstraints: {
		supported: true,
		currentLocationId: 6,
		currentMetLevel: 5,
		currentMetDate: '2024-01-15',
		currentOriginGameId: 45,
		currentBallId: 4,
		minMetLevel: 0,
		maxMetLevel: 100,
		supportsMetDate: true,
		supportsOriginGame: true,
		supportsBall: true,
		locationGroups: [
			{
				originGameId: 45,
				options: [
					{ id: 6, name: 'South Province (Area One)' },
					{ id: 10, name: 'Poco Path' }
				]
			}
		],
		originGames: [{ id: 45, name: 'Violet' }],
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
		maxEv: 255,
		maxTotalEv: 510
	},
	moveSetEditConstraints: {
		supported: true,
		maxMoveSlots: 4,
		availableMoves: [
			{ id: 0, name: 'Empty', type: 'None', hue: 48, chroma: 0.04, maxPp: 0 },
			{ id: 84, name: 'Thunder Shock', type: 'Electric', hue: 94, chroma: 0.16, maxPp: 30 },
			{ id: 45, name: 'Growl', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 40 },
			{ id: 98, name: 'Quick Attack', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 30 }
		]
	},
	originalTrainerEditConstraints: {
		supported: true,
		currentName: 'PKSX',
		currentTrainerId: 41203,
		currentSecretId: 1204,
		currentGenderId: 0,
		currentLanguageId: 2,
		maxNameLength: 12,
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
	friendshipEditConstraints: {
		supported: true,
		fields: [
			{ key: 'friendship', label: 'Friendship', value: 70, min: 0, max: 255 },
			{ key: 'affection', label: 'Affection', value: 0, min: 0, max: 255 }
		]
	},
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
	],
	originalTrainer: 'PKSX',
	metLabel: 'Lv. 5',
	spriteIdentity: {
		speciesId: 25,
		form: 0,
		isEgg: false,
		isShiny: false,
		displaySex: 'male' as const
	}
};

const mockBoxSlots: BoxSlotSummary[] = [
	{
		box: 0,
		slot: 0,
		speciesId: 25,
		form: 0,
		format: 9,
		level: 5,
		nickname: 'Pikachu',
		isEgg: false,
		isEmpty: false,
		entityBytesBase64: 'bW9jay1waWthY2h1',
		...mockPikachuDetails
	},
	{
		box: 0,
		slot: 1,
		speciesId: 0,
		form: 0,
		format: 0,
		level: 0,
		experience: 0,
		experienceProjection: null,
		nickname: '',
		isEgg: false,
		isEmpty: true,
		entityBytesBase64: null,
		spriteIdentity: {
			speciesId: 0,
			form: 0,
			isEgg: false,
			isShiny: false,
			displaySex: 'default'
		},
		types: [],
		stats: [],
		moves: [],
		natureEditConstraints: {
			supported: false,
			currentNatureId: -1,
			originalNatureId: -1,
			statNatureId: -1,
			usesStatNature: false,
			options: [],
			unsupportedReason: 'Nature Editing needs an occupied Slot.'
		},
		heldItemEditConstraints: {
			supported: false,
			currentItemId: 0,
			options: [],
			unsupportedReason: 'Held Item Editing needs an occupied Slot.'
		},
		abilityEditConstraints: {
			supported: false,
			currentAbilityIndex: -1,
			options: [],
			unsupportedReason: 'Ability Editing needs an occupied Slot.'
		},
		metDataEditConstraints: {
			supported: false,
			currentLocationId: 0,
			currentMetLevel: 0,
			currentOriginGameId: 0,
			currentBallId: 0,
			minMetLevel: 0,
			maxMetLevel: 100,
			supportsMetDate: false,
			supportsOriginGame: false,
			supportsBall: false,
			locationGroups: [],
			originGames: [],
			balls: [],
			unsupportedReason: 'Met Data Editing needs an occupied Slot.'
		},
		originalTrainerEditConstraints: {
			supported: false,
			currentName: '',
			currentTrainerId: 0,
			currentSecretId: 0,
			currentGenderId: 0,
			currentLanguageId: 0,
			maxNameLength: 0,
			minTrainerId: 0,
			maxTrainerId: 65535,
			supportsSecretId: false,
			supportsGender: false,
			supportsLanguage: false,
			genders: [],
			languages: [],
			unsupportedReason: 'Original Trainer Data Editing needs an occupied Slot.'
		},
		statEditConstraints: {
			supported: false,
			minIv: 0,
			maxIv: 0,
			minEv: 0,
			maxEv: 0,
			maxTotalEv: 0,
			unsupportedReason: 'IV and EV Editing needs an occupied Slot.'
		},
		moveSetEditConstraints: {
			supported: false,
			maxMoveSlots: 0,
			availableMoves: [],
			unsupportedReason: 'Move Set Editing needs an occupied Slot.'
		},
		friendshipEditConstraints: {
			supported: false,
			fields: [],
			unsupportedReason: 'Friendship Editing needs an occupied Slot.'
		},
		battleFields: []
	}
];

const mockPartySlots: PartySlotSummary[] = [
	{
		slot: 0,
		speciesId: 25,
		form: 0,
		format: 9,
		level: 5,
		nickname: 'Pikachu',
		isEgg: false,
		isEmpty: false,
		...mockPikachuDetails
	}
];

export function createMockEngine(overrides: Partial<EngineApi> = {}): EngineApi {
	return {
		getVersion: async () => success(mockVersion),
		summarizeSave: async (_bytes, fileName) => success({ ...mockSaveSummary, fileName }),
		listBoxSlots: async (_bytes, _fileName, box) => {
			if (box !== 0) {
				return {
					ok: false,
					value: null,
					error: {
						code: 'invalid-box',
						message: `Box ${box} is outside the mock save's box range.`
					}
				};
			}

			return success(mockBoxSlots);
		},
		loadSaveWorkspace: async (_bytes, fileName, box) => {
			if (box !== 0) {
				return {
					ok: false,
					value: null,
					error: {
						code: 'invalid-box',
						message: `Box ${box} is outside the mock save's box range.`
					}
				};
			}

			return success<SaveWorkspace>({
				summary: { ...mockSaveSummary, fileName },
				partySlots: mockPartySlots,
				boxSlots: mockBoxSlots
			});
		},
		serializeSave: async (bytes) =>
			success<SerializedSave>({
				bytesBase64: bytesToBase64(bytes),
				byteLength: bytes.byteLength
			}),
		applySlotOperation: async (bytes, fileName, operation, activeBox) =>
			success<SlotOperationResult>({
				bytes: copyBytes(bytes),
				mutated: !isSameSlotOperation(operation),
				workspace: {
					summary: { ...mockSaveSummary, fileName },
					partySlots: mockPartySlots,
					boxSlots: activeBox === 0 ? mockBoxSlots : []
				}
			}),
		applyPokemonEditOperation: async (bytes, fileName, operation, activeBox) =>
			success<PokemonEditOperationResult>({
				bytes: copyBytes(bytes),
				mutated:
					operation.nickname !== undefined ||
					operation.level !== undefined ||
					operation.experience !== undefined ||
					operation.natureId !== undefined ||
					operation.heldItemId !== undefined ||
					operation.abilityIndex !== undefined ||
					operation.metData !== undefined ||
					operation.originalTrainer !== undefined ||
					operation.ivs !== undefined ||
					operation.evs !== undefined ||
					operation.moves !== undefined ||
					operation.friendshipEdits !== undefined,
				workspace: {
					summary: { ...mockSaveSummary, fileName },
					partySlots: mockPartySlots,
					boxSlots: activeBox === 0 ? mockBoxSlots : []
				}
			}),
		createPokemon: async (bytes, fileName, _operation, activeBox) =>
			success<PokemonCreationResult>({
				bytes: copyBytes(bytes),
				mutated: true,
				workspace: {
					summary: { ...mockSaveSummary, fileName },
					partySlots: mockPartySlots,
					boxSlots: activeBox === 0 ? mockBoxSlots : []
				}
			}),
		getPokemonCreationCatalogue: async () =>
			success<PokemonCreationCatalogue>({
				defaultSpecies: { id: 1, name: 'Bulbasaur' },
				availableSpecies: [
					{ id: 1, name: 'Bulbasaur' },
					{ id: 25, name: 'Pikachu' }
				]
			}),
		previewPokemonSpeciesFormEdit: async (_bytes, _fileName, _source, speciesId, form) =>
			success<PokemonSpeciesFormEditProjection>({
				availableSpecies: [{ id: speciesId, name: `Species ${speciesId}` }],
				availableForms: [{ id: form, name: form === 0 ? 'Default' : `Form ${form}` }],
				preview: {
					speciesId,
					speciesName: `Species ${speciesId}`,
					form,
					formName: form === 0 ? 'Default' : `Form ${form}`,
					types: [],
					moves: [],
					spriteIdentity: {
						speciesId,
						form,
						isEgg: false,
						isShiny: false,
						displaySex: 'default'
					},
					legal: true,
					legalitySummary: 'PKHeX judged this Pokemon legal.',
					consequences: []
				}
			}),
		applySaveFileEditOperation: async () => ({
			ok: false,
			value: null,
			error: {
				code: 'unsupported-save-file-edit',
				message: 'Save File field editing is not available for the mock engine.'
			}
		}),
		getSaveFileInventoryCatalogue: async () => ({
			ok: false,
			value: null,
			error: {
				code: 'unsupported-save-file-edit',
				message: 'Save File field editing is not available for the mock engine.'
			}
		}),
		importStoredPokemon: async (bytes, fileName, _operation, activeBox) =>
			success<StoredPokemonImportResult>({
				bytes: copyBytes(bytes),
				mutated: true,
				workspace: {
					summary: { ...mockSaveSummary, fileName },
					partySlots: mockPartySlots,
					boxSlots: activeBox === 0 ? mockBoxSlots : []
				}
			}),
		checkSlotLegality: async () =>
			success<LegalityReport>({
				legal: true,
				judgement: 'Legal',
				summary: 'PKHeX judged this Pokemon legal.',
				fixableProblems: [],
				warnings: [],
				messages: [{ severity: 'Valid', identifier: 'Encounter', message: 'Encounter is valid.' }]
			}),
		previewPokemonActions: async () => success(mockPokemonActionPreview()),
		applyPokemonAction: async (bytes, fileName, _operation, activeBox) =>
			success<PokemonActionResult>({
				bytes: copyBytes(bytes),
				mutated: true,
				workspace: {
					summary: { ...mockSaveSummary, fileName },
					partySlots: mockPartySlots,
					boxSlots: activeBox === 0 ? mockBoxSlots : []
				},
				changes: [{ field: 'Species', before: 'Pikachu', after: 'Raichu' }]
			}),
		previewStoredPokemonActions: async () => success(mockPokemonActionPreview()),
		applyStoredPokemonAction: async () =>
			success<StoredPokemonActionResult>({
				entityBytesBase64: 'bW9jay1yYWljaHU=',
				mutated: true,
				projection: {
					...mockBoxSlots[0],
					speciesId: 26,
					nickname: 'Raichu',
					spriteIdentity: { ...mockBoxSlots[0].spriteIdentity, speciesId: 26 },
					entityBytesBase64: 'bW9jay1yYWljaHU='
				},
				changes: [{ field: 'Species', before: 'Pikachu', after: 'Raichu' }]
			}),
		...overrides
	};
}

function mockPokemonActionPreview(): PokemonActionPreview {
	return {
		legalityReport: {
			legal: true,
			judgement: 'Legal',
			summary: 'PKHeX judged this Pokemon legal.',
			fixableProblems: [],
			warnings: [],
			messages: []
		},
		actions: [
			{
				kind: 'legality-fix',
				available: false,
				unavailableReason: 'The Legality Report has no supported fixable problems.',
				changes: [],
				choices: [],
				fixes: []
			},
			{
				kind: 'evolve',
				available: true,
				changes: [],
				choices: [
					{
						id: '26:0:7:0:0',
						speciesId: 26,
						form: 0,
						speciesName: 'Raichu',
						method: 'UseItem',
						requirement: 'UseItem',
						changes: [{ field: 'Species', before: 'Pikachu', after: 'Raichu' }]
					}
				],
				fixes: []
			}
		]
	};
}

function success<T>(value: T): EngineResult<T> {
	return { ok: true, value, error: null };
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

function isSameSlotOperation(operation: SlotOperation): boolean {
	return (
		operation.kind !== 'clear' && slotRefKey(operation.source) === slotRefKey(operation.destination)
	);
}

function slotRefKey(ref: SaveSlotRef): string {
	return ref.zone === 'party' ? `party:${ref.slot}` : `box:${ref.box}:${ref.slot}`;
}

function copyBytes(bytes: Uint8Array): Uint8Array {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy;
}
