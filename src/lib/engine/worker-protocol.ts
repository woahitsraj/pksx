import { z } from 'zod/v4';

export const engineWorkerRequestIdSchema = z.string().min(1);

export const engineWorkerMethodSchema = z.enum([
	'getVersion',
	'summarizeSave',
	'listBoxSlots',
	'loadSaveWorkspace',
	'serializeSave',
	'applySlotOperation',
	'applyPokemonEditOperation',
	'createPokemon',
	'getPokemonCreationCatalogue',
	'previewPokemonSpeciesFormEdit',
	'applySaveFileEditOperation',
	'getSaveFileInventoryCatalogue',
	'importStoredPokemon',
	'checkSlotLegality',
	'previewPokemonActions',
	'applyPokemonAction',
	'previewStoredPokemonActions',
	'applyStoredPokemonAction'
]);

export const engineWorkerStatusSchema = z.enum(['idle', 'loading', 'ready', 'failed']);

export const engineErrorCodeSchema = z.enum([
	'unsupported-save',
	'invalid-box',
	'invalid-slot',
	'empty-source-slot',
	'occupied-destination-slot',
	'unsupported-slot-operation',
	'invalid-pokemon-edit',
	'unsupported-pokemon-edit',
	'invalid-pokemon-action',
	'unsupported-pokemon-action',
	'stale-pokemon-action-preview',
	'invalid-pokemon-creation',
	'unsupported-pokemon-creation',
	'invalid-pokemon-import',
	'invalid-stored-pokemon',
	'incompatible-stored-pokemon',
	'invalid-save-file-edit',
	'unsupported-save-file-edit',
	'engine-unavailable',
	'invalid-engine-response',
	'invalid-worker-message',
	'unknown-engine-error'
]);

export const engineErrorSchema = z.object({
	code: z
		.string()
		.min(1)
		.transform((code) => {
			const parsed = engineErrorCodeSchema.safeParse(code);

			return parsed.success ? parsed.data : 'unknown-engine-error';
		}),
	message: z.string().min(1)
});

export const engineVersionSchema = z.object({
	pkhexCoreVersion: z.string(),
	facadeVersion: z.string()
});

export const saveSummarySchema = z.object({
	fileName: z.string().optional(),
	saveType: z.string(),
	gameVersion: z.string(),
	gameVersionId: z.number(),
	generation: z.number(),
	trainerName: z.string().optional(),
	trainerId: z.number().default(0),
	playTime: z.string().default(''),
	playedHours: z.number().default(0),
	playedMinutes: z.number().default(0),
	partyCount: z.number(),
	boxCount: z.number(),
	boxSlotCount: z.number()
});

export const saveFileEditableProjectionSchema = z.object({
	trainerProfile: z.object({
		trainerName: z.string().nullable(),
		trainerNameSupported: z.boolean(),
		trainerNameMaxLength: z.number().int(),
		trainerNameUnsupportedReason: z.string().nullable(),
		gender: z.enum(['male', 'female']).nullable(),
		genderSupported: z.boolean(),
		genderUnsupportedReason: z.string().nullable(),
		trainerId: z.number(),
		gameVersion: z.string(),
		generation: z.number()
	}),
	money: z.object({
		value: z.number().int().nullable(),
		min: z.number().int(),
		max: z.number().int(),
		supported: z.boolean(),
		unsupportedReason: z.string().nullable()
	}),
	inventory: z.object({
		supported: z.boolean(),
		unsupportedReason: z.string().nullable(),
		pockets: z.array(
			z.object({
				key: z.string(),
				label: z.string(),
				capacity: z.number().int(),
				full: z.boolean(),
				unsupportedReason: z.string().nullable(),
				items: z.array(
					z.object({
						id: z.number().int(),
						name: z.string(),
						quantity: z.number().int(),
						maxQuantity: z.number().int()
					})
				)
			})
		)
	})
});

export const saveFileInventoryCatalogueSchema = z.object({
	supported: z.boolean(),
	unsupportedReason: z.string().nullable(),
	pockets: z.array(
		z.object({
			key: z.string(),
			availableItems: z.array(
				z.object({
					id: z.number().int(),
					name: z.string(),
					maxQuantity: z.number().int()
				})
			)
		})
	)
});

export const slotTypeSummarySchema = z.object({
	name: z.string(),
	hue: z.number(),
	chroma: z.number().default(0.09)
});

export const slotStatSummarySchema = z.object({
	key: z.string(),
	label: z.string(),
	value: z.number(),
	ev: z.number().nullable().optional(),
	iv: z.number().nullable().optional(),
	max: z.number()
});

export const slotMoveSummarySchema = z.object({
	slot: z.number().int().default(0),
	id: z.number().default(0),
	name: z.string(),
	type: z.string(),
	hue: z.number(),
	chroma: z.number().default(0.09),
	pp: z.number().nullable().optional(),
	maxPp: z.number().nullable().optional(),
	ppUps: z.number().nullable().optional()
});

export const pokemonStatEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	minIv: z.number().default(0),
	maxIv: z.number().default(31),
	minEv: z.number().default(0),
	maxEv: z.number().default(255),
	maxTotalEv: z.number().default(510),
	unsupportedReason: z.string().nullable().optional()
});

export const pokemonNatureEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	currentNatureId: z.number().int().default(-1),
	originalNatureId: z.number().int().default(-1),
	statNatureId: z.number().int().default(-1),
	usesStatNature: z.boolean().default(false),
	options: z
		.array(
			z.object({
				id: z.number().int(),
				name: z.string(),
				effect: z.string()
			})
		)
		.default([]),
	unsupportedReason: z.string().nullable().optional()
});

export const pokemonHeldItemOptionSchema = z.object({
	id: z.number().int(),
	name: z.string(),
	available: z.boolean().default(false),
	unavailableReason: z.string().nullable().optional()
});

export const pokemonHeldItemEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	currentItemId: z.number().int().default(0),
	options: z.array(pokemonHeldItemOptionSchema).default([]),
	unsupportedReason: z.string().nullable().optional()
});

export const pokemonAbilityOptionSchema = z.object({
	index: z.number().int(),
	id: z.number().int(),
	name: z.string(),
	hidden: z.boolean().default(false),
	available: z.boolean().default(false),
	unavailableReason: z.string().nullable().optional()
});

export const pokemonAbilityEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	currentAbilityIndex: z.number().int().default(-1),
	options: z.array(pokemonAbilityOptionSchema).default([]),
	unsupportedReason: z.string().nullable().optional()
});

export const pokemonMoveOptionSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string(),
	hue: z.number(),
	chroma: z.number().default(0.09),
	maxPp: z.number()
});

export const pokemonMoveSetEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	maxMoveSlots: z.number().default(4),
	availableMoves: z.array(pokemonMoveOptionSchema).default([]),
	unsupportedReason: z.string().nullable().optional()
});

const pokemonMetDataOptionSchema = z.object({
	id: z.number().int(),
	name: z.string()
});

export const pokemonOriginalTrainerOptionSchema = z.object({
	id: z.number().int(),
	name: z.string()
});

export const pokemonOriginalTrainerEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	currentName: z.string().default(''),
	currentTrainerId: z.number().int().default(0),
	currentSecretId: z.number().int().default(0),
	currentGenderId: z.number().int().default(0),
	currentLanguageId: z.number().int().default(0),
	maxNameLength: z.number().int().default(0),
	minTrainerId: z.number().int().default(0),
	maxTrainerId: z.number().int().default(65535),
	supportsSecretId: z.boolean().default(false),
	supportsGender: z.boolean().default(false),
	supportsLanguage: z.boolean().default(false),
	genders: z.array(pokemonOriginalTrainerOptionSchema).default([]),
	languages: z.array(pokemonOriginalTrainerOptionSchema).default([]),
	unsupportedReason: z.string().nullable().optional()
});

const pokemonMetDataEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	currentLocationId: z.number().int().default(0),
	currentMetLevel: z.number().int().default(0),
	currentMetDate: z.string().nullable().optional(),
	currentOriginGameId: z.number().int().default(0),
	currentBallId: z.number().int().default(0),
	minMetLevel: z.number().int().default(0),
	maxMetLevel: z.number().int().default(100),
	supportsMetDate: z.boolean().default(false),
	supportsOriginGame: z.boolean().default(false),
	supportsBall: z.boolean().default(false),
	locationGroups: z
		.array(
			z.object({
				originGameId: z.number().int(),
				options: z.array(pokemonMetDataOptionSchema)
			})
		)
		.default([]),
	originGames: z.array(pokemonMetDataOptionSchema).default([]),
	balls: z.array(pokemonMetDataOptionSchema).default([]),
	unsupportedReason: z.string().nullable().optional()
});

export const pokemonFriendshipFieldSchema = z.object({
	key: z.string(),
	label: z.string(),
	value: z.number().int(),
	min: z.number().int(),
	max: z.number().int()
});

export const pokemonFriendshipEditConstraintsSchema = z.object({
	supported: z.boolean().default(false),
	fields: z.array(pokemonFriendshipFieldSchema).default([]),
	unsupportedReason: z.string().nullable().optional()
});

export const pokemonBattleFieldProjectionSchema = z.object({
	key: z.string(),
	label: z.string(),
	value: z.number().int(),
	valueLabel: z.string(),
	supported: z.boolean(),
	options: z.array(
		z.object({
			value: z.number().int(),
			label: z.string()
		})
	),
	unsupportedReason: z.string().nullable().optional()
});

export const displaySexSchema = z.enum(['default', 'male', 'female']);

export const spriteIdentitySchema = z.object({
	speciesId: z.number(),
	form: z.number(),
	isEgg: z.boolean(),
	isShiny: z.boolean(),
	displaySex: displaySexSchema
});

const slotSummaryFields = {
	slot: z.number(),
	speciesId: z.number(),
	form: z.number(),
	format: z.number(),
	level: z.number(),
	experience: z.number().default(0),
	experienceProjection: z
		.object({
			minLevel: z.number(),
			maxLevel: z.number(),
			minExperience: z.number(),
			maxExperience: z.number(),
			currentLevelMinExperience: z.number(),
			nextLevelMinExperience: z.number(),
			currentLevelProgress: z.number()
		})
		.nullable()
		.default(null),
	nickname: z.string(),
	isEgg: z.boolean(),
	isEmpty: z.boolean(),
	gender: z.string().nullable().optional(),
	nature: z.string().nullable().optional(),
	ability: z.string().nullable().optional(),
	heldItem: z.string().nullable().optional(),
	types: z.array(slotTypeSummarySchema).default([]),
	stats: z.array(slotStatSummarySchema).default([]),
	moves: z.array(slotMoveSummarySchema).default([]),
	natureEditConstraints: pokemonNatureEditConstraintsSchema.default({
		supported: false,
		currentNatureId: -1,
		originalNatureId: -1,
		statNatureId: -1,
		usesStatNature: false,
		options: [],
		unsupportedReason: 'Nature Editing is not available for this Pokemon projection.'
	}),
	heldItemEditConstraints: pokemonHeldItemEditConstraintsSchema.default({
		supported: false,
		currentItemId: 0,
		options: [],
		unsupportedReason: 'Held Item Editing is not available for this Pokemon projection.'
	}),
	abilityEditConstraints: pokemonAbilityEditConstraintsSchema.default({
		supported: false,
		currentAbilityIndex: -1,
		options: [],
		unsupportedReason: 'Ability Editing is not available for this Pokemon projection.'
	}),
	metDataEditConstraints: pokemonMetDataEditConstraintsSchema.default({
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
		unsupportedReason: 'Met Data Editing is not available for this Pokemon projection.'
	}),
	originalTrainerEditConstraints: pokemonOriginalTrainerEditConstraintsSchema.default({
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
		unsupportedReason: 'Original Trainer Data Editing is not available for this projection.'
	}),
	statEditConstraints: pokemonStatEditConstraintsSchema.default({
		supported: false,
		minIv: 0,
		maxIv: 31,
		minEv: 0,
		maxEv: 255,
		maxTotalEv: 510,
		unsupportedReason: 'IV and EV Editing is not available for this Pokemon projection.'
	}),
	moveSetEditConstraints: pokemonMoveSetEditConstraintsSchema.default({
		supported: false,
		maxMoveSlots: 4,
		availableMoves: [],
		unsupportedReason: 'Move Set Editing is not available for this Pokemon projection.'
	}),
	friendshipEditConstraints: pokemonFriendshipEditConstraintsSchema.default({
		supported: false,
		fields: [],
		unsupportedReason: 'Friendship Editing is not available for this Pokemon projection.'
	}),
	battleFields: z.array(pokemonBattleFieldProjectionSchema).default([]),
	originalTrainer: z.string().nullable().optional(),
	metLabel: z.string().nullable().optional(),
	spriteIdentity: spriteIdentitySchema.optional(),
	entityBytesBase64: z.string().nullable().optional()
};

const slotSummaryBaseSchema = z.object(slotSummaryFields);

function fillSpriteIdentity<T extends z.infer<typeof slotSummaryBaseSchema>>(slot: T) {
	return {
		...slot,
		spriteIdentity: slot.spriteIdentity ?? {
			speciesId: slot.speciesId,
			form: slot.form,
			isEgg: slot.isEgg,
			isShiny: false,
			displaySex: 'default' as const
		}
	};
}

export const boxSlotSummarySchema = z
	.object({
		box: z.number(),
		...slotSummaryFields
	})
	.transform(fillSpriteIdentity);

export const partySlotSummarySchema = slotSummaryBaseSchema.transform(fillSpriteIdentity);

export const saveWorkspaceSchema = z.object({
	summary: saveSummarySchema,
	partySlots: z.array(partySlotSummarySchema),
	boxSlots: z.array(boxSlotSummarySchema),
	saveFile: saveFileEditableProjectionSchema.optional()
});

export const serializedSaveSchema = z.object({
	bytesBase64: z.string(),
	byteLength: z.number()
});

export const saveSlotRefSchema = z.discriminatedUnion('zone', [
	z.object({
		zone: z.literal('party'),
		slot: z.number().int()
	}),
	z.object({
		zone: z.literal('box'),
		box: z.number().int(),
		slot: z.number().int()
	})
]);

export const slotOperationSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('move'),
		source: saveSlotRefSchema,
		destination: saveSlotRefSchema
	}),
	z.object({
		kind: z.literal('copy'),
		source: saveSlotRefSchema,
		destination: saveSlotRefSchema
	}),
	z.object({
		kind: z.literal('clear'),
		source: saveSlotRefSchema
	})
]);

export const slotOperationResultSchema = z.object({
	bytes: z.instanceof(ArrayBuffer),
	mutated: z.boolean(),
	workspace: saveWorkspaceSchema
});

export const pokemonEditOperationSchema = z.object({
	source: saveSlotRefSchema,
	speciesId: z.number().int().optional(),
	form: z.number().int().optional(),
	nickname: z.string().optional(),
	level: z.number().int().optional(),
	experience: z.number().int().optional(),
	natureId: z.number().int().optional(),
	heldItemId: z.number().int().optional(),
	abilityIndex: z.number().int().optional(),
	metData: z
		.object({
			locationId: z.number().int(),
			metLevel: z.number().int(),
			metDate: z.string().nullable().optional(),
			originGameId: z.number().int().optional(),
			ballId: z.number().int().optional()
		})
		.optional(),
	originalTrainer: z
		.object({
			name: z.string(),
			trainerId: z.number().int(),
			secretId: z.number().int().optional(),
			genderId: z.number().int().optional(),
			languageId: z.number().int().optional()
		})
		.optional(),
	ivs: z
		.object({
			HP: z.number().int(),
			ATK: z.number().int(),
			DEF: z.number().int(),
			SPA: z.number().int(),
			SPD: z.number().int(),
			SPE: z.number().int()
		})
		.optional(),
	evs: z
		.object({
			HP: z.number().int(),
			ATK: z.number().int(),
			DEF: z.number().int(),
			SPA: z.number().int(),
			SPD: z.number().int(),
			SPE: z.number().int()
		})
		.optional(),
	moves: z
		.array(
			z.object({
				slot: z.number().int(),
				move: z.number().int(),
				pp: z.number().int().optional(),
				ppUps: z.number().int().optional()
			})
		)
		.optional(),
	friendshipEdits: z
		.array(
			z.object({
				key: z.string(),
				value: z.number().int()
			})
		)
		.optional(),
	teraType: z.number().int().optional()
});

export const pokemonEditOperationResultSchema = z.object({
	bytes: z.instanceof(ArrayBuffer),
	mutated: z.boolean(),
	workspace: saveWorkspaceSchema
});

export const pokemonCreationOperationSchema = z.object({
	destination: saveSlotRefSchema,
	speciesId: z.number().int().optional(),
	level: z.number().int()
});

export const pokemonCreationResultSchema = z.object({
	bytes: z.instanceof(ArrayBuffer),
	mutated: z.boolean(),
	workspace: saveWorkspaceSchema
});

export const pokemonCreationCatalogueSchema = z.object({
	defaultSpecies: z.object({ id: z.number().int(), name: z.string() }).nullable(),
	availableSpecies: z.array(z.object({ id: z.number().int(), name: z.string() }))
});

export const pokemonSpeciesFormEditProjectionSchema = z.object({
	availableSpecies: z.array(z.object({ id: z.number().int(), name: z.string() })),
	availableForms: z.array(z.object({ id: z.number().int(), name: z.string() })),
	preview: z.object({
		speciesId: z.number().int(),
		speciesName: z.string(),
		form: z.number().int(),
		formName: z.string(),
		ability: z.string().nullable().optional(),
		gender: z.string().nullable().optional(),
		types: z.array(z.string()),
		moves: z.array(z.string()),
		spriteIdentity: spriteIdentitySchema,
		legal: z.boolean(),
		legalitySummary: z.string(),
		consequences: z.array(z.string())
	})
});

export const saveFileEditOperationSchema = z.object({
	trainerProfile: z
		.object({
			trainerName: z.string().optional(),
			gender: z.enum(['male', 'female']).optional()
		})
		.optional(),
	money: z.number().int().optional(),
	inventory: z
		.array(
			z.object({
				kind: z.enum(['set', 'add', 'remove']),
				pocket: z.string(),
				itemId: z.number().int(),
				quantity: z.number().int().optional()
			})
		)
		.optional()
});

export const saveFileEditOperationResultSchema = z.object({
	bytes: z.instanceof(ArrayBuffer),
	mutated: z.boolean(),
	workspace: saveWorkspaceSchema
});

export const storedPokemonImportOperationSchema = z.object({
	entityBytesBase64: z.string(),
	destination: saveSlotRefSchema
});

export const storedPokemonImportResultSchema = z.object({
	bytes: z.instanceof(ArrayBuffer),
	mutated: z.boolean(),
	workspace: saveWorkspaceSchema
});

export const legalityReportLineSchema = z.object({
	severity: z.string(),
	identifier: z.string(),
	message: z.string(),
	fixId: z.string().optional()
});

export const legalityReportSchema = z.object({
	legal: z.boolean(),
	judgement: z.string(),
	summary: z.string(),
	fixableProblems: z.array(z.string()).default([]),
	warnings: z.array(legalityReportLineSchema),
	messages: z.array(legalityReportLineSchema)
});

export const pokemonActionKindSchema = z.enum(['legality-fix', 'evolve']);

export const pokemonActionChangeSchema = z.object({
	field: z.string(),
	before: z.string(),
	after: z.string()
});

export const pokemonEvolutionChoiceSchema = z.object({
	id: z.string().min(1),
	speciesId: z.number().int(),
	form: z.number().int(),
	speciesName: z.string(),
	method: z.string(),
	requirement: z.string(),
	changes: z.array(pokemonActionChangeSchema)
});

export const pokemonActionAvailabilitySchema = z.object({
	kind: pokemonActionKindSchema,
	available: z.boolean(),
	unavailableReason: z.string().nullable().optional(),
	changes: z.array(pokemonActionChangeSchema),
	choices: z.array(pokemonEvolutionChoiceSchema),
	fixes: z.array(
		z.object({
			id: z.string().min(1),
			token: z.string().min(1),
			label: z.string(),
			changes: z.array(pokemonActionChangeSchema)
		})
	)
});

export const pokemonActionPreviewSchema = z.object({
	legalityReport: legalityReportSchema,
	actions: z.array(pokemonActionAvailabilitySchema)
});

export const pokemonActionOperationSchema = z.object({
	kind: pokemonActionKindSchema,
	source: saveSlotRefSchema,
	choiceId: z.string().optional()
});

export const pokemonActionResultSchema = z.object({
	bytes: z.instanceof(ArrayBuffer),
	mutated: z.boolean(),
	workspace: saveWorkspaceSchema,
	changes: z.array(pokemonActionChangeSchema)
});

export const storedPokemonActionOperationSchema = z.object({
	kind: pokemonActionKindSchema,
	choiceId: z.string().optional()
});

export const storedPokemonActionResultSchema = z.object({
	entityBytesBase64: z.string(),
	mutated: z.boolean(),
	projection: boxSlotSummarySchema,
	changes: z.array(pokemonActionChangeSchema)
});

const engineResultSchema = <T extends z.ZodType>(valueSchema: T) =>
	z.discriminatedUnion('ok', [
		z.object({
			ok: z.literal(true),
			value: valueSchema,
			error: z.null()
		}),
		z.object({
			ok: z.literal(false),
			value: z.null(),
			error: engineErrorSchema
		})
	]);

export const engineVersionResultSchema = engineResultSchema(engineVersionSchema);

export const saveSummaryResultSchema = engineResultSchema(saveSummarySchema);

export const boxSlotSummaryListResultSchema = engineResultSchema(z.array(boxSlotSummarySchema));

export const saveWorkspaceResultSchema = engineResultSchema(saveWorkspaceSchema);

export const serializedSaveResultSchema = engineResultSchema(serializedSaveSchema);

export const slotOperationResultResultSchema = engineResultSchema(slotOperationResultSchema);

export const pokemonEditOperationResultResultSchema = engineResultSchema(
	pokemonEditOperationResultSchema
);

export const pokemonCreationResultResultSchema = engineResultSchema(pokemonCreationResultSchema);

export const pokemonSpeciesFormEditProjectionResultSchema = engineResultSchema(
	pokemonSpeciesFormEditProjectionSchema
);

export const saveFileEditOperationResultResultSchema = engineResultSchema(
	saveFileEditOperationResultSchema
);

export const saveFileInventoryCatalogueResultSchema = engineResultSchema(
	saveFileInventoryCatalogueSchema
);

export const storedPokemonImportResultResultSchema = engineResultSchema(
	storedPokemonImportResultSchema
);

export const legalityReportResultSchema = engineResultSchema(legalityReportSchema);

export const pokemonActionPreviewResultSchema = engineResultSchema(pokemonActionPreviewSchema);

export const pokemonActionResultResultSchema = engineResultSchema(pokemonActionResultSchema);

export const storedPokemonActionResultResultSchema = engineResultSchema(
	storedPokemonActionResultSchema
);

export const engineWorkerInitMessageSchema = z.object({
	type: z.literal('init'),
	basePath: z.string().min(1)
});

export const engineWorkerGetVersionRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('getVersion')
});

export const engineWorkerSummarizeSaveRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('summarizeSave'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional()
	})
});

export const engineWorkerListBoxSlotsRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('listBoxSlots'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		box: z.number().int()
	})
});

export const engineWorkerLoadSaveWorkspaceRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('loadSaveWorkspace'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		box: z.number().int()
	})
});

export const engineWorkerSerializeSaveRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('serializeSave'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional()
	})
});

export const engineWorkerApplySlotOperationRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applySlotOperation'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		operation: slotOperationSchema,
		activeBox: z.number().int()
	})
});

export const engineWorkerApplyPokemonEditOperationRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applyPokemonEditOperation'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		operation: pokemonEditOperationSchema,
		activeBox: z.number().int()
	})
});

export const engineWorkerCreatePokemonRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('createPokemon'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		operation: pokemonCreationOperationSchema,
		activeBox: z.number().int()
	})
});

export const engineWorkerGetPokemonCreationCatalogueRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('getPokemonCreationCatalogue'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional()
	})
});

export const engineWorkerPreviewPokemonSpeciesFormEditRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('previewPokemonSpeciesFormEdit'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		source: saveSlotRefSchema,
		speciesId: z.number().int(),
		form: z.number().int()
	})
});

export const engineWorkerApplySaveFileEditOperationRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applySaveFileEditOperation'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		operation: saveFileEditOperationSchema,
		activeBox: z.number().int()
	})
});

export const engineWorkerGetSaveFileInventoryCatalogueRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('getSaveFileInventoryCatalogue'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional()
	})
});

export const engineWorkerImportStoredPokemonRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('importStoredPokemon'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		operation: storedPokemonImportOperationSchema,
		activeBox: z.number().int()
	})
});

export const engineWorkerCheckSlotLegalityRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('checkSlotLegality'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		source: saveSlotRefSchema
	})
});

export const engineWorkerPreviewPokemonActionsRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('previewPokemonActions'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		source: saveSlotRefSchema
	})
});

export const engineWorkerApplyPokemonActionRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applyPokemonAction'),
	payload: z.object({
		bytes: z.instanceof(ArrayBuffer),
		fileName: z.string().optional(),
		operation: pokemonActionOperationSchema,
		activeBox: z.number().int()
	})
});

export const engineWorkerPreviewStoredPokemonActionsRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('previewStoredPokemonActions'),
	payload: z.object({
		entityBytesBase64: z.string().min(1)
	})
});

export const engineWorkerApplyStoredPokemonActionRequestSchema = z.object({
	type: z.literal('request'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applyStoredPokemonAction'),
	payload: z.object({
		entityBytesBase64: z.string().min(1),
		operation: storedPokemonActionOperationSchema
	})
});

export const engineWorkerRequestSchema = z.discriminatedUnion('method', [
	engineWorkerGetVersionRequestSchema,
	engineWorkerSummarizeSaveRequestSchema,
	engineWorkerListBoxSlotsRequestSchema,
	engineWorkerLoadSaveWorkspaceRequestSchema,
	engineWorkerSerializeSaveRequestSchema,
	engineWorkerApplySlotOperationRequestSchema,
	engineWorkerApplyPokemonEditOperationRequestSchema,
	engineWorkerCreatePokemonRequestSchema,
	engineWorkerGetPokemonCreationCatalogueRequestSchema,
	engineWorkerPreviewPokemonSpeciesFormEditRequestSchema,
	engineWorkerApplySaveFileEditOperationRequestSchema,
	engineWorkerGetSaveFileInventoryCatalogueRequestSchema,
	engineWorkerImportStoredPokemonRequestSchema,
	engineWorkerCheckSlotLegalityRequestSchema,
	engineWorkerPreviewPokemonActionsRequestSchema,
	engineWorkerApplyPokemonActionRequestSchema,
	engineWorkerPreviewStoredPokemonActionsRequestSchema,
	engineWorkerApplyStoredPokemonActionRequestSchema
]);

export const engineWorkerGetVersionResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('getVersion'),
	result: engineVersionResultSchema
});

export const engineWorkerSummarizeSaveResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('summarizeSave'),
	result: saveSummaryResultSchema
});

export const engineWorkerListBoxSlotsResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('listBoxSlots'),
	result: boxSlotSummaryListResultSchema
});

export const engineWorkerLoadSaveWorkspaceResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('loadSaveWorkspace'),
	result: saveWorkspaceResultSchema
});

export const engineWorkerSerializeSaveResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('serializeSave'),
	result: serializedSaveResultSchema
});

export const engineWorkerApplySlotOperationResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applySlotOperation'),
	result: slotOperationResultResultSchema
});

export const engineWorkerApplyPokemonEditOperationResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applyPokemonEditOperation'),
	result: pokemonEditOperationResultResultSchema
});

export const engineWorkerCreatePokemonResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('createPokemon'),
	result: pokemonCreationResultResultSchema
});

export const engineWorkerGetPokemonCreationCatalogueResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('getPokemonCreationCatalogue'),
	result: engineResultSchema(pokemonCreationCatalogueSchema)
});

export const engineWorkerPreviewPokemonSpeciesFormEditResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('previewPokemonSpeciesFormEdit'),
	result: pokemonSpeciesFormEditProjectionResultSchema
});

export const engineWorkerApplySaveFileEditOperationResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applySaveFileEditOperation'),
	result: saveFileEditOperationResultResultSchema
});

export const engineWorkerGetSaveFileInventoryCatalogueResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('getSaveFileInventoryCatalogue'),
	result: saveFileInventoryCatalogueResultSchema
});

export const engineWorkerImportStoredPokemonResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('importStoredPokemon'),
	result: storedPokemonImportResultResultSchema
});

export const engineWorkerCheckSlotLegalityResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('checkSlotLegality'),
	result: legalityReportResultSchema
});

export const engineWorkerPreviewPokemonActionsResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('previewPokemonActions'),
	result: pokemonActionPreviewResultSchema
});

export const engineWorkerApplyPokemonActionResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applyPokemonAction'),
	result: pokemonActionResultResultSchema
});

export const engineWorkerPreviewStoredPokemonActionsResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('previewStoredPokemonActions'),
	result: pokemonActionPreviewResultSchema
});

export const engineWorkerApplyStoredPokemonActionResponseSchema = z.object({
	type: z.literal('response'),
	id: engineWorkerRequestIdSchema,
	method: z.literal('applyStoredPokemonAction'),
	result: storedPokemonActionResultResultSchema
});

export const engineWorkerResponseSchema = z.discriminatedUnion('method', [
	engineWorkerGetVersionResponseSchema,
	engineWorkerSummarizeSaveResponseSchema,
	engineWorkerListBoxSlotsResponseSchema,
	engineWorkerLoadSaveWorkspaceResponseSchema,
	engineWorkerSerializeSaveResponseSchema,
	engineWorkerApplySlotOperationResponseSchema,
	engineWorkerApplyPokemonEditOperationResponseSchema,
	engineWorkerCreatePokemonResponseSchema,
	engineWorkerGetPokemonCreationCatalogueResponseSchema,
	engineWorkerPreviewPokemonSpeciesFormEditResponseSchema,
	engineWorkerApplySaveFileEditOperationResponseSchema,
	engineWorkerGetSaveFileInventoryCatalogueResponseSchema,
	engineWorkerImportStoredPokemonResponseSchema,
	engineWorkerCheckSlotLegalityResponseSchema,
	engineWorkerPreviewPokemonActionsResponseSchema,
	engineWorkerApplyPokemonActionResponseSchema,
	engineWorkerPreviewStoredPokemonActionsResponseSchema,
	engineWorkerApplyStoredPokemonActionResponseSchema
]);

export const engineWorkerProtocolErrorSchema = z.object({
	type: z.literal('protocol-error'),
	id: engineWorkerRequestIdSchema.optional(),
	error: engineErrorSchema
});

export const engineWorkerStatusMessageSchema = z.discriminatedUnion('status', [
	z.object({
		type: z.literal('status'),
		status: z.enum(['idle', 'loading', 'ready'])
	}),
	z.object({
		type: z.literal('status'),
		status: z.literal('failed'),
		error: engineErrorSchema
	})
]);

export const engineWorkerMessageSchema = z.union([
	engineWorkerInitMessageSchema,
	engineWorkerRequestSchema,
	engineWorkerResponseSchema,
	engineWorkerProtocolErrorSchema,
	engineWorkerStatusMessageSchema
]);

export type EngineWorkerRequestId = z.infer<typeof engineWorkerRequestIdSchema>;

export type EngineWorkerMethod = z.infer<typeof engineWorkerMethodSchema>;

export type EngineWorkerStatus = z.infer<typeof engineWorkerStatusSchema>;

export type EngineWorkerInitMessage = z.infer<typeof engineWorkerInitMessageSchema>;

export type EngineWorkerGetVersionRequest = z.infer<typeof engineWorkerGetVersionRequestSchema>;

export type EngineWorkerSummarizeSaveRequest = z.infer<
	typeof engineWorkerSummarizeSaveRequestSchema
>;

export type EngineWorkerListBoxSlotsRequest = z.infer<typeof engineWorkerListBoxSlotsRequestSchema>;

export type EngineWorkerLoadSaveWorkspaceRequest = z.infer<
	typeof engineWorkerLoadSaveWorkspaceRequestSchema
>;

export type EngineWorkerSerializeSaveRequest = z.infer<
	typeof engineWorkerSerializeSaveRequestSchema
>;

export type EngineWorkerApplySlotOperationRequest = z.infer<
	typeof engineWorkerApplySlotOperationRequestSchema
>;

export type EngineWorkerApplyPokemonEditOperationRequest = z.infer<
	typeof engineWorkerApplyPokemonEditOperationRequestSchema
>;

export type EngineWorkerCreatePokemonRequest = z.infer<
	typeof engineWorkerCreatePokemonRequestSchema
>;

export type EngineWorkerGetPokemonCreationCatalogueRequest = z.infer<
	typeof engineWorkerGetPokemonCreationCatalogueRequestSchema
>;

export type EngineWorkerPreviewPokemonSpeciesFormEditRequest = z.infer<
	typeof engineWorkerPreviewPokemonSpeciesFormEditRequestSchema
>;

export type EngineWorkerApplySaveFileEditOperationRequest = z.infer<
	typeof engineWorkerApplySaveFileEditOperationRequestSchema
>;

export type EngineWorkerGetSaveFileInventoryCatalogueRequest = z.infer<
	typeof engineWorkerGetSaveFileInventoryCatalogueRequestSchema
>;

export type EngineWorkerImportStoredPokemonRequest = z.infer<
	typeof engineWorkerImportStoredPokemonRequestSchema
>;

export type EngineWorkerCheckSlotLegalityRequest = z.infer<
	typeof engineWorkerCheckSlotLegalityRequestSchema
>;

export type EngineWorkerPreviewPokemonActionsRequest = z.infer<
	typeof engineWorkerPreviewPokemonActionsRequestSchema
>;

export type EngineWorkerApplyPokemonActionRequest = z.infer<
	typeof engineWorkerApplyPokemonActionRequestSchema
>;

export type EngineWorkerPreviewStoredPokemonActionsRequest = z.infer<
	typeof engineWorkerPreviewStoredPokemonActionsRequestSchema
>;

export type EngineWorkerApplyStoredPokemonActionRequest = z.infer<
	typeof engineWorkerApplyStoredPokemonActionRequestSchema
>;

export type EngineWorkerRequest = z.infer<typeof engineWorkerRequestSchema>;

export type EngineWorkerResponse = z.infer<typeof engineWorkerResponseSchema>;

export type EngineWorkerProtocolError = z.infer<typeof engineWorkerProtocolErrorSchema>;

export type EngineWorkerStatusMessage = z.infer<typeof engineWorkerStatusMessageSchema>;

export type EngineWorkerMessage = z.infer<typeof engineWorkerMessageSchema>;

export type EngineWorkerResultForMethod<TMethod extends EngineWorkerMethod> = Extract<
	EngineWorkerResponse,
	{ method: TMethod }
>['result'];

export type ProtocolParseResult<T> =
	| { ok: true; value: T }
	| { ok: false; id?: EngineWorkerRequestId; error: z.infer<typeof engineErrorSchema> };

type WorkerParseSchema<T> = z.ZodType<T>;

export function parseEngineWorkerInitMessage(
	value: unknown
): ProtocolParseResult<EngineWorkerInitMessage> {
	return parseEngineWorkerValue(engineWorkerInitMessageSchema, value, 'init message');
}

export function parseEngineWorkerRequest(value: unknown): ProtocolParseResult<EngineWorkerRequest> {
	return parseEngineWorkerValue(engineWorkerRequestSchema, value, 'request');
}

export function parseEngineWorkerResponse(
	value: unknown
): ProtocolParseResult<EngineWorkerResponse> {
	return parseEngineWorkerValue(engineWorkerResponseSchema, value, 'response');
}

export function parseEngineWorkerMessage(value: unknown): ProtocolParseResult<EngineWorkerMessage> {
	return parseEngineWorkerValue(engineWorkerMessageSchema, value, 'message');
}

export function parseEngineWorkerProtocolError(
	value: unknown
): ProtocolParseResult<EngineWorkerProtocolError> {
	return parseEngineWorkerValue(engineWorkerProtocolErrorSchema, value, 'protocol error');
}

export function parseEngineWorkerStatusMessage(
	value: unknown
): ProtocolParseResult<EngineWorkerStatusMessage> {
	return parseEngineWorkerValue(engineWorkerStatusMessageSchema, value, 'status message');
}

export function createEngineWorkerResponse<TRequest extends EngineWorkerRequest>(
	request: TRequest,
	result: EngineWorkerResultForMethod<TRequest['method']>
): EngineWorkerResponse {
	return engineWorkerResponseSchema.parse({
		type: 'response',
		id: request.id,
		method: request.method,
		result
	});
}

export function createEngineWorkerProtocolError(
	error: z.infer<typeof engineErrorSchema>,
	id?: EngineWorkerRequestId
): EngineWorkerProtocolError {
	return engineWorkerProtocolErrorSchema.parse(
		id === undefined ? { type: 'protocol-error', error } : { type: 'protocol-error', id, error }
	);
}

function parseEngineWorkerValue<T>(
	schema: WorkerParseSchema<T>,
	value: unknown,
	messageName: string
): ProtocolParseResult<T> {
	const parsed = schema.safeParse(value);

	if (parsed.success) {
		return { ok: true, value: parsed.data };
	}

	return invalidWorkerMessage(formatZodError(messageName, parsed.error), getMessageId(value));
}

function invalidWorkerMessage(
	message: string,
	id?: EngineWorkerRequestId
): ProtocolParseResult<never> {
	return {
		ok: false,
		...(id === undefined ? {} : { id }),
		error: { code: 'invalid-worker-message', message }
	};
}

function getMessageId(value: unknown): EngineWorkerRequestId | undefined {
	const parsed = z.object({ id: engineWorkerRequestIdSchema }).safeParse(value);

	return parsed.success ? parsed.data.id : undefined;
}

function formatZodError(messageName: string, error: z.ZodError): string {
	const issue = error.issues[0];

	if (issue === undefined) {
		return `Invalid PKHeX Engine worker ${messageName}.`;
	}

	const path = issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';

	return `Invalid PKHeX Engine worker ${messageName}${path}: ${issue.message}`;
}
