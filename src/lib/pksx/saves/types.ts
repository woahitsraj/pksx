export type SaveFileId = string;
export type BackupId = string;
export type BackupReason =
	| 'manual'
	| 'save-file-editing'
	| 'pokemon-movement'
	| 'pokemon-editing'
	| 'pokemon-creation'
	| 'trainer-editing'
	| 'inventory-editing'
	| 'legality-fix'
	| 'evolution';

export type StoredSaveFile = {
	id: SaveFileId;
	originalFileName: string | null;
	byteLength: number;
	importedAt: string;
	updatedAt: string;
};

export type BackupMetadata = {
	id: BackupId;
	saveFileId: SaveFileId;
	reason: BackupReason;
	byteLength: number;
	createdAt: string;
};

export type StoredWorkspace = {
	saveFileId: SaveFileId;
	bytes: Uint8Array;
	dirty: boolean;
	automaticBackupCreated: boolean;
	updatedAt: string;
};

export type PokemonStorageId = 'pokemon-storage';

export type StoredPokemonStorage = {
	id: PokemonStorageId;
	schemaVersion: 1;
	boxCount: number;
	boxSlotCount: number;
	boxes: StoredPokemonStorageBox[];
	updatedAt: string;
};

export type StoredPokemonStorageBox = {
	index: number;
	name: string;
	slots: StoredPokemonStorageSlot[];
};

export type StoredPokemonStorageSlot = {
	box: number;
	slot: number;
	pokemon: StoredPokemonStoragePokemon | null;
};

export type StoredPokemonStoragePokemon = {
	label: string;
	detail: string;
	level: number | null;
	experience: number | null;
	speciesId: number | null;
	form: number | null;
	isEgg: boolean;
	spriteIdentity: {
		speciesId: number;
		form: number;
		isEgg: boolean;
		isShiny: boolean;
		displaySex: 'default' | 'male' | 'female';
	} | null;
	gender?: string;
	nature?: string;
	ability?: string;
	heldItem?: string;
	originalTrainer?: string;
	metLabel?: string;
	entityBytesBase64?: string;
	origin: {
		entryMode: 'moved-in' | 'copied-in' | 'imported';
		originSaveFileName: string | null;
		originGame: string | null;
		originalTrainer: string | null;
		trainerId: string | null;
		enteredAt: string;
	};
};

export type ImportSaveInput = {
	bytes: Uint8Array;
	originalFileName?: string | null;
};

export type CreateBackupInput = {
	id?: BackupId;
	saveFileId: SaveFileId;
	bytes: Uint8Array;
	reason: BackupReason;
};

export type PutWorkspaceInput = {
	saveFileId: SaveFileId;
	bytes: Uint8Array;
	dirty: boolean;
	automaticBackupCreated: boolean;
	expectedUpdatedAt?: string | null;
};

export type EnsureAutomaticBackupInput = {
	saveFileId: SaveFileId;
	importedAt: string;
	expectedUpdatedAt: string | null;
	reason: BackupReason;
};

export type EnsureAutomaticBackupResult = {
	workspace: StoredWorkspace;
	established: boolean;
};

export type SavesStorage = {
	importSave(input: ImportSaveInput): Promise<StoredSaveFile>;
	getSave(saveFileId: SaveFileId): Promise<StoredSaveFile | null>;
	listSaves(): Promise<StoredSaveFile[]>;
	getSaveBytes(saveFileId: SaveFileId): Promise<Uint8Array | null>;
	putWorkspace(input: PutWorkspaceInput): Promise<StoredWorkspace>;
	getWorkspace(saveFileId: SaveFileId): Promise<StoredWorkspace | null>;
	clearWorkspace(saveFileId: SaveFileId): Promise<void>;
	getPokemonStorage(): Promise<StoredPokemonStorage | null>;
	putPokemonStorage(storage: StoredPokemonStorage): Promise<StoredPokemonStorage>;
	getActiveSaveFileId(): Promise<SaveFileId | null>;
	setActiveSaveFileId(saveFileId: SaveFileId): Promise<StoredSaveFile>;
	deleteSave(saveFileId: SaveFileId): Promise<void>;
	createBackup(input: CreateBackupInput): Promise<BackupMetadata>;
	ensureAutomaticBackup(input: EnsureAutomaticBackupInput): Promise<EnsureAutomaticBackupResult>;
	listBackups(saveFileId: SaveFileId): Promise<BackupMetadata[]>;
	getBackupBytes(backupId: BackupId): Promise<Uint8Array | null>;
	deleteBackup(backupId: BackupId): Promise<void>;
	exportSave(saveFileId: SaveFileId): Promise<Uint8Array | null>;
};
