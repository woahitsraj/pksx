export type EngineErrorCode =
	| 'unsupported-save'
	| 'invalid-box'
	| 'invalid-slot'
	| 'empty-source-slot'
	| 'occupied-destination-slot'
	| 'unsupported-slot-operation'
	| 'invalid-pokemon-edit'
	| 'unsupported-pokemon-edit'
	| 'invalid-pokemon-action'
	| 'unsupported-pokemon-action'
	| 'stale-pokemon-action-preview'
	| 'invalid-pokemon-creation'
	| 'unsupported-pokemon-creation'
	| 'invalid-pokemon-import'
	| 'invalid-stored-pokemon'
	| 'incompatible-stored-pokemon'
	| 'invalid-save-file-edit'
	| 'unsupported-save-file-edit'
	| 'engine-unavailable'
	| 'invalid-engine-response'
	| 'invalid-worker-message'
	| 'unknown-engine-error';

export type EngineError = {
	code: EngineErrorCode;
	message: string;
};

export type EngineResult<T> =
	| { ok: true; value: T; error: null }
	| { ok: false; value: null; error: EngineError };

export type EngineVersion = {
	pkhexCoreVersion: string;
	facadeVersion: string;
};

export type SaveSummary = {
	fileName?: string;
	saveType: string;
	/** PKHeX.Core GameVersion enum name. */
	gameVersion: string;
	/** PKHeX.Core GameVersion enum value. */
	gameVersionId: number;
	generation: number;
	trainerName?: string;
	trainerId: number;
	playTime: string;
	playedHours: number;
	playedMinutes: number;
	partyCount: number;
	boxCount: number;
	boxSlotCount: number;
};

export type SpriteIdentity = {
	speciesId: number;
	form: number;
	isEgg: boolean;
	isShiny: boolean;
	displaySex: 'default' | 'male' | 'female';
};

export type BoxSlotSummary = {
	box: number;
	slot: number;
	speciesId: number;
	form: number;
	format: number;
	level: number;
	experience: number;
	experienceProjection: PokemonExperienceProjection | null;
	nickname: string;
	isEgg: boolean;
	isEmpty: boolean;
	gender?: string | null;
	nature?: string | null;
	ability?: string | null;
	heldItem?: string | null;
	types: SlotTypeSummary[];
	stats: SlotStatSummary[];
	moves: SlotMoveSummary[];
	natureEditConstraints: PokemonNatureEditConstraints;
	heldItemEditConstraints: PokemonHeldItemEditConstraints;
	abilityEditConstraints: PokemonAbilityEditConstraints;
	metDataEditConstraints: PokemonMetDataEditConstraints;
	originalTrainerEditConstraints: PokemonOriginalTrainerEditConstraints;
	statEditConstraints: PokemonStatEditConstraints;
	moveSetEditConstraints: PokemonMoveSetEditConstraints;
	friendshipEditConstraints: PokemonFriendshipEditConstraints;
	battleFields: PokemonBattleFieldProjection[];
	originalTrainer?: string | null;
	metLabel?: string | null;
	spriteIdentity: SpriteIdentity;
	entityBytesBase64?: string | null;
};

export type PartySlotSummary = Omit<BoxSlotSummary, 'box'>;

export type SlotTypeSummary = {
	name: string;
	hue: number;
	chroma: number;
};

export type PokemonExperienceProjection = {
	minLevel: number;
	maxLevel: number;
	minExperience: number;
	maxExperience: number;
	currentLevelMinExperience: number;
	nextLevelMinExperience: number;
	currentLevelProgress: number;
};

export type SlotStatSummary = {
	key: string;
	label: string;
	value: number;
	ev?: number | null;
	iv?: number | null;
	max: number;
};

export type SlotMoveSummary = {
	slot: number;
	id: number;
	name: string;
	type: string;
	hue: number;
	chroma: number;
	pp?: number | null;
	maxPp?: number | null;
	ppUps?: number | null;
};

export type PokemonStatEditConstraints = {
	supported: boolean;
	minIv: number;
	maxIv: number;
	minEv: number;
	maxEv: number;
	maxTotalEv: number;
	unsupportedReason?: string | null;
};

export type PokemonNatureOption = {
	id: number;
	name: string;
	effect: string;
};

export type PokemonNatureEditConstraints = {
	supported: boolean;
	currentNatureId: number;
	originalNatureId: number;
	statNatureId: number;
	usesStatNature: boolean;
	options: PokemonNatureOption[];
	unsupportedReason?: string | null;
};

export type PokemonHeldItemOption = {
	id: number;
	name: string;
	available: boolean;
	unavailableReason?: string | null;
};

export type PokemonHeldItemEditConstraints = {
	supported: boolean;
	currentItemId: number;
	options: PokemonHeldItemOption[];
	unsupportedReason?: string | null;
};

export type PokemonAbilityOption = {
	index: number;
	id: number;
	name: string;
	hidden: boolean;
	available: boolean;
	unavailableReason?: string | null;
};

export type PokemonAbilityEditConstraints = {
	supported: boolean;
	currentAbilityIndex: number;
	options: PokemonAbilityOption[];
	unsupportedReason?: string | null;
};

export type PokemonMoveOption = {
	id: number;
	name: string;
	type: string;
	hue: number;
	chroma: number;
	maxPp: number;
};

export type PokemonMoveSetEditConstraints = {
	supported: boolean;
	maxMoveSlots: number;
	availableMoves: PokemonMoveOption[];
	unsupportedReason?: string | null;
};

export type PokemonSpeciesOption = {
	id: number;
	name: string;
};

export type PokemonCreationCatalogue = {
	defaultSpecies: PokemonSpeciesOption | null;
	availableSpecies: PokemonSpeciesOption[];
};

export type PokemonFormOption = {
	id: number;
	name: string;
};

export type PokemonMetDataOption = {
	id: number;
	name: string;
};

export type PokemonOriginalTrainerOption = {
	id: number;
	name: string;
};

export type PokemonSpeciesFormPreview = {
	speciesId: number;
	speciesName: string;
	form: number;
	formName: string;
	ability?: string | null;
	gender?: string | null;
	types: string[];
	moves: string[];
	spriteIdentity: SpriteIdentity;
	legal: boolean;
	legalitySummary: string;
	consequences: string[];
};

export type PokemonSpeciesFormEditProjection = {
	availableSpecies: PokemonSpeciesOption[];
	availableForms: PokemonFormOption[];
	preview: PokemonSpeciesFormPreview;
};

export type PokemonOriginalTrainerEditConstraints = {
	supported: boolean;
	currentName: string;
	currentTrainerId: number;
	currentSecretId: number;
	currentGenderId: number;
	currentLanguageId: number;
	maxNameLength: number;
	minTrainerId: number;
	maxTrainerId: number;
	supportsSecretId: boolean;
	supportsGender: boolean;
	supportsLanguage: boolean;
	genders: PokemonOriginalTrainerOption[];
	languages: PokemonOriginalTrainerOption[];
	unsupportedReason?: string | null;
};

export type PokemonMetLocationGroup = {
	originGameId: number;
	options: PokemonMetDataOption[];
};

export type PokemonMetDataEditConstraints = {
	supported: boolean;
	currentLocationId: number;
	currentMetLevel: number;
	currentMetDate?: string | null;
	currentOriginGameId: number;
	currentBallId: number;
	minMetLevel: number;
	maxMetLevel: number;
	supportsMetDate: boolean;
	supportsOriginGame: boolean;
	supportsBall: boolean;
	locationGroups: PokemonMetLocationGroup[];
	originGames: PokemonMetDataOption[];
	balls: PokemonMetDataOption[];
	unsupportedReason?: string | null;
};

export type PokemonFriendshipField = {
	key: string;
	label: string;
	value: number;
	min: number;
	max: number;
};

export type PokemonFriendshipEditConstraints = {
	supported: boolean;
	fields: PokemonFriendshipField[];
	unsupportedReason?: string | null;
};

export type PokemonBattleFieldOption = {
	value: number;
	label: string;
};

export type PokemonBattleFieldProjection = {
	key: string;
	label: string;
	value: number;
	valueLabel: string;
	supported: boolean;
	options: PokemonBattleFieldOption[];
	unsupportedReason?: string | null;
};

export type SaveWorkspace = {
	summary: SaveSummary;
	partySlots: PartySlotSummary[];
	boxSlots: BoxSlotSummary[];
	saveFile?: SaveFileEditableProjection;
};

export type TrainerGender = 'male' | 'female';

export type SaveFileEditableProjection = {
	trainerProfile: {
		trainerName: string | null;
		trainerNameSupported: boolean;
		trainerNameMaxLength: number;
		trainerNameUnsupportedReason: string | null;
		gender: TrainerGender | null;
		genderSupported: boolean;
		genderUnsupportedReason: string | null;
		trainerId: number;
		gameVersion: string;
		generation: number;
	};
	money: {
		value: number | null;
		min: number;
		max: number;
		supported: boolean;
		unsupportedReason: string | null;
	};
	inventory: {
		supported: boolean;
		unsupportedReason: string | null;
		pockets: InventoryPocketProjection[];
	};
};

export type InventoryPocketProjection = {
	key: string;
	label: string;
	capacity: number;
	full: boolean;
	unsupportedReason: string | null;
	items: InventoryItemProjection[];
};

/** Fetched on demand: too large to embed in every workspace projection. */
export type SaveFileInventoryCatalogue = {
	supported: boolean;
	unsupportedReason: string | null;
	pockets: { key: string; availableItems: InventoryItemOption[] }[];
};

export type InventoryItemProjection = {
	id: number;
	name: string;
	quantity: number;
	maxQuantity: number;
};

export type InventoryItemOption = Omit<InventoryItemProjection, 'quantity'>;

export type SerializedSave = {
	bytesBase64: string;
	byteLength: number;
};

export type SaveSlotRef =
	| {
			zone: 'party';
			slot: number;
	  }
	| {
			zone: 'box';
			box: number;
			slot: number;
	  };

export type SlotOperation =
	| {
			kind: 'move';
			source: SaveSlotRef;
			destination: SaveSlotRef;
	  }
	| {
			kind: 'copy';
			source: SaveSlotRef;
			destination: SaveSlotRef;
	  }
	| {
			kind: 'clear';
			source: SaveSlotRef;
	  };

export type SlotOperationResult = {
	bytes: Uint8Array;
	mutated: boolean;
	workspace: SaveWorkspace;
};

export type StoredPokemonImportOperation = {
	entityBytesBase64: string;
	destination: SaveSlotRef;
};

export type StoredPokemonImportResult = {
	bytes: Uint8Array;
	mutated: boolean;
	workspace: SaveWorkspace;
};

export type PokemonEditOperation = {
	source: SaveSlotRef;
	speciesId?: number;
	form?: number;
	nickname?: string;
	level?: number;
	experience?: number;
	natureId?: number;
	heldItemId?: number;
	abilityIndex?: number;
	metData?: PokemonMetDataEdit;
	originalTrainer?: PokemonOriginalTrainerEdit;
	ivs?: PokemonStatEditSet;
	evs?: PokemonStatEditSet;
	moves?: PokemonMoveSlotEdit[];
	friendshipEdits?: PokemonFriendshipFieldEdit[];
	teraType?: number;
};

export type PokemonMetDataEdit = {
	locationId: number;
	metLevel: number;
	metDate?: string | null;
	originGameId?: number;
	ballId?: number;
};

export type PokemonStatEditSet = {
	HP: number;
	ATK: number;
	DEF: number;
	SPA: number;
	SPD: number;
	SPE: number;
};

export type PokemonMoveSlotEdit = {
	slot: number;
	move: number;
	pp?: number;
	ppUps?: number;
};

export type PokemonOriginalTrainerEdit = {
	name: string;
	trainerId: number;
	secretId?: number;
	genderId?: number;
	languageId?: number;
};

export type PokemonFriendshipFieldEdit = {
	key: string;
	value: number;
};

export type PokemonEditOperationResult = {
	bytes: Uint8Array;
	mutated: boolean;
	workspace: SaveWorkspace;
};

export type PokemonEditPreviewValidationScope = {
	moves: boolean;
	metData: boolean;
	originalTrainer: boolean;
};

export type PokemonCreationOperation = {
	destination: SaveSlotRef;
	speciesId?: number;
	level: number;
};

export type PokemonCreationResult = {
	bytes: Uint8Array;
	mutated: boolean;
	workspace: SaveWorkspace;
};

export type SaveFileEditOperation = {
	trainerProfile?: {
		trainerName?: string;
		gender?: TrainerGender;
	};
	money?: number;
	inventory?: InventoryEditOperation[];
};

export type InventoryEditOperation = {
	kind: 'set' | 'add' | 'remove';
	pocket: string;
	itemId: number;
	quantity?: number;
};

export type SaveFileEditOperationResult = {
	bytes: Uint8Array;
	mutated: boolean;
	workspace: SaveWorkspace;
};

export type LegalityReportLine = {
	severity: string;
	identifier: string;
	message: string;
	fixId?: string;
};

export type LegalityReport = {
	legal: boolean;
	judgement: string;
	summary: string;
	fixableProblems: string[];
	warnings: LegalityReportLine[];
	messages: LegalityReportLine[];
};

export type PokemonActionKind = 'legality-fix' | 'evolve';

export type PokemonActionChange = {
	field: string;
	before: string;
	after: string;
};

export type PokemonEvolutionChoice = {
	id: string;
	speciesId: number;
	form: number;
	speciesName: string;
	method: string;
	requirement: string;
	changes: PokemonActionChange[];
};

export type PokemonLegalityFixChoice = {
	id: string;
	token: string;
	label: string;
	changes: PokemonActionChange[];
};

export type PokemonActionAvailability = {
	kind: PokemonActionKind;
	available: boolean;
	unavailableReason?: string | null;
	changes: PokemonActionChange[];
	choices: PokemonEvolutionChoice[];
	fixes: PokemonLegalityFixChoice[];
};

export type PokemonActionPreview = {
	legalityReport: LegalityReport;
	actions: PokemonActionAvailability[];
};

export type PokemonActionOperation = {
	kind: PokemonActionKind;
	source: SaveSlotRef;
	choiceId?: string;
};

export type PokemonActionResult = {
	bytes: Uint8Array;
	mutated: boolean;
	workspace: SaveWorkspace;
	changes: PokemonActionChange[];
};

export type StoredPokemonActionOperation = {
	kind: PokemonActionKind;
	choiceId?: string;
};

export type StoredPokemonActionResult = {
	entityBytesBase64: string;
	mutated: boolean;
	projection: BoxSlotSummary;
	changes: PokemonActionChange[];
};

export type EngineApi = {
	getVersion(): Promise<EngineResult<EngineVersion>>;
	summarizeSave(bytes: Uint8Array, fileName?: string): Promise<EngineResult<SaveSummary>>;
	listBoxSlots(
		bytes: Uint8Array,
		fileName: string | undefined,
		box: number
	): Promise<EngineResult<BoxSlotSummary[]>>;
	loadSaveWorkspace(
		bytes: Uint8Array,
		fileName: string | undefined,
		box: number
	): Promise<EngineResult<SaveWorkspace>>;
	serializeSave(bytes: Uint8Array, fileName?: string): Promise<EngineResult<SerializedSave>>;
	applySlotOperation(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: SlotOperation,
		activeBox: number
	): Promise<EngineResult<SlotOperationResult>>;
	applyPokemonEditOperation(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: PokemonEditOperation,
		activeBox: number
	): Promise<EngineResult<PokemonEditOperationResult>>;
	previewPokemonEditOperation(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: PokemonEditOperation,
		activeBox: number
	): Promise<EngineResult<PokemonEditOperationResult>>;
	validatePokemonEditPreview(
		baselineBytes: Uint8Array,
		candidateBytes: Uint8Array,
		fileName: string | undefined,
		source: SaveSlotRef,
		scope: PokemonEditPreviewValidationScope
	): Promise<EngineResult<boolean>>;
	previewPokemonSpeciesFormEdit(
		bytes: Uint8Array,
		fileName: string | undefined,
		source: SaveSlotRef,
		speciesId: number,
		form: number
	): Promise<EngineResult<PokemonSpeciesFormEditProjection>>;
	createPokemon(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: PokemonCreationOperation,
		activeBox: number
	): Promise<EngineResult<PokemonCreationResult>>;
	getPokemonCreationCatalogue(
		bytes: Uint8Array,
		fileName: string | undefined
	): Promise<EngineResult<PokemonCreationCatalogue>>;
	applySaveFileEditOperation(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: SaveFileEditOperation,
		activeBox: number
	): Promise<EngineResult<SaveFileEditOperationResult>>;
	getSaveFileInventoryCatalogue(
		bytes: Uint8Array,
		fileName: string | undefined
	): Promise<EngineResult<SaveFileInventoryCatalogue>>;
	importStoredPokemon(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: StoredPokemonImportOperation,
		activeBox: number
	): Promise<EngineResult<StoredPokemonImportResult>>;
	checkSlotLegality(
		bytes: Uint8Array,
		fileName: string | undefined,
		source: SaveSlotRef
	): Promise<EngineResult<LegalityReport>>;
	previewPokemonActions(
		bytes: Uint8Array,
		fileName: string | undefined,
		source: SaveSlotRef
	): Promise<EngineResult<PokemonActionPreview>>;
	applyPokemonAction(
		bytes: Uint8Array,
		fileName: string | undefined,
		operation: PokemonActionOperation,
		activeBox: number
	): Promise<EngineResult<PokemonActionResult>>;
	previewStoredPokemonActions(
		entityBytesBase64: string
	): Promise<EngineResult<PokemonActionPreview>>;
	applyStoredPokemonAction(
		entityBytesBase64: string,
		operation: StoredPokemonActionOperation
	): Promise<EngineResult<StoredPokemonActionResult>>;
};
