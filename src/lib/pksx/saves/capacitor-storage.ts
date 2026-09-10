import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { copyBytes } from './bytes';
import { clonePokemonStorage } from './pokemon-storage';
import { nextWorkspaceRevision } from './workspace-revision';
import type {
	BackupId,
	BackupMetadata,
	CreateBackupInput,
	ImportSaveInput,
	SavesStorage,
	PutWorkspaceInput,
	SaveFileId,
	StoredPokemonStorage,
	StoredSaveFile,
	StoredWorkspace
} from './types';

const catalogVersion = 1;
const catalogPath = 'catalog.json';
const pokemonStoragePath = 'pokemon-storage.json';
const missingFileCode = 'OS-PLUG-FILE-0008';

type WorkspaceMetadata = Omit<StoredWorkspace, 'bytes'>;

type NativeCatalog = {
	version: typeof catalogVersion;
	saves: StoredSaveFile[];
	backups: BackupMetadata[];
	workspaces: Record<SaveFileId, WorkspaceMetadata>;
	activeSaveFileId: SaveFileId | null;
};

export type NativeFileStore = {
	readText(path: string): Promise<string | null>;
	writeText(path: string, value: string): Promise<void>;
	readBytes(path: string): Promise<Uint8Array | null>;
	writeBytes(path: string, value: Uint8Array): Promise<void>;
	delete(path: string): Promise<void>;
};

export type CapacitorSavesStorageOptions = {
	fileStore?: NativeFileStore;
	idFactory?: () => string;
	now?: () => string;
};

export class CapacitorSavesStorage implements SavesStorage {
	readonly #fileStore: NativeFileStore;
	readonly #idFactory: () => string;
	readonly #now: () => string;
	#pending: Promise<void> = Promise.resolve();

	constructor(options: CapacitorSavesStorageOptions = {}) {
		this.#fileStore = options.fileStore ?? createCapacitorFileStore();
		this.#idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.#now = options.now ?? (() => new Date().toISOString());
	}

	importSave(input: ImportSaveInput): Promise<StoredSaveFile> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			const timestamp = this.#now();
			const saveFile: StoredSaveFile = {
				id: this.#idFactory(),
				originalFileName: input.originalFileName ?? null,
				byteLength: input.bytes.byteLength,
				importedAt: timestamp,
				updatedAt: timestamp
			};

			await this.#fileStore.writeBytes(saveBytesPath(saveFile.id), input.bytes);
			catalog.saves.push(saveFile);
			catalog.activeSaveFileId = saveFile.id;
			await this.#writeCatalog(catalog);
			return { ...saveFile };
		});
	}

	getSave(saveFileId: SaveFileId): Promise<StoredSaveFile | null> {
		return this.#run(async () => {
			const saveFile = (await this.#readCatalog()).saves.find(({ id }) => id === saveFileId);
			return saveFile ? { ...saveFile } : null;
		});
	}

	listSaves(): Promise<StoredSaveFile[]> {
		return this.#run(async () =>
			(await this.#readCatalog()).saves
				.map((saveFile) => ({ ...saveFile }))
				.sort((left, right) => right.importedAt.localeCompare(left.importedAt))
		);
	}

	getSaveBytes(saveFileId: SaveFileId): Promise<Uint8Array | null> {
		return this.#run(() => this.#fileStore.readBytes(saveBytesPath(saveFileId)));
	}

	putWorkspace(input: PutWorkspaceInput): Promise<StoredWorkspace> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			if (!catalog.saves.some(({ id }) => id === input.saveFileId)) {
				throw new Error(`Cannot persist workspace for unknown save file: ${input.saveFileId}`);
			}
			if (
				input.expectedUpdatedAt !== undefined &&
				(catalog.workspaces[input.saveFileId]?.updatedAt ?? null) !== input.expectedUpdatedAt
			) {
				throw new Error('The persisted Workspace changed before this write.');
			}

			const metadata: WorkspaceMetadata = {
				saveFileId: input.saveFileId,
				dirty: input.dirty,
				automaticBackupCreated: input.automaticBackupCreated,
				updatedAt: nextWorkspaceRevision(
					catalog.workspaces[input.saveFileId]?.updatedAt,
					this.#now()
				)
			};
			const path = workspaceBytesPath(input.saveFileId);
			const previousBytes = await this.#fileStore.readBytes(path);
			await this.#fileStore.writeBytes(path, input.bytes);
			catalog.workspaces[input.saveFileId] = metadata;
			try {
				await this.#writeCatalog(catalog);
			} catch (error) {
				if (previousBytes) await this.#fileStore.writeBytes(path, previousBytes);
				else await this.#fileStore.delete(path);
				throw error;
			}
			return { ...metadata, bytes: copyBytes(input.bytes) };
		});
	}

	getWorkspace(saveFileId: SaveFileId): Promise<StoredWorkspace | null> {
		return this.#run(async () => {
			const metadata = (await this.#readCatalog()).workspaces[saveFileId];
			if (!metadata) return null;

			const bytes = await this.#fileStore.readBytes(workspaceBytesPath(saveFileId));
			return bytes ? { ...metadata, bytes } : null;
		});
	}

	clearWorkspace(saveFileId: SaveFileId): Promise<void> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			delete catalog.workspaces[saveFileId];
			await this.#writeCatalog(catalog);
			await this.#fileStore.delete(workspaceBytesPath(saveFileId));
		});
	}

	getPokemonStorage(): Promise<StoredPokemonStorage | null> {
		return this.#run(async () => {
			const value = await this.#fileStore.readText(pokemonStoragePath);
			return value ? clonePokemonStorage(JSON.parse(value) as StoredPokemonStorage) : null;
		});
	}

	putPokemonStorage(storage: StoredPokemonStorage): Promise<StoredPokemonStorage> {
		return this.#run(async () => {
			const stored = clonePokemonStorage({ ...storage, updatedAt: this.#now() });
			await this.#fileStore.writeText(pokemonStoragePath, JSON.stringify(stored));
			return clonePokemonStorage(stored);
		});
	}

	getActiveSaveFileId(): Promise<SaveFileId | null> {
		return this.#run(async () => (await this.#readCatalog()).activeSaveFileId);
	}

	setActiveSaveFileId(saveFileId: SaveFileId): Promise<StoredSaveFile> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			const index = catalog.saves.findIndex(({ id }) => id === saveFileId);
			if (index < 0) {
				throw new Error(`Cannot activate unknown save file: ${saveFileId}`);
			}

			const updated = { ...catalog.saves[index], updatedAt: this.#now() };
			catalog.saves[index] = updated;
			catalog.activeSaveFileId = saveFileId;
			await this.#writeCatalog(catalog);
			return { ...updated };
		});
	}

	deleteSave(saveFileId: SaveFileId): Promise<void> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			const backupIds = catalog.backups
				.filter((backup) => backup.saveFileId === saveFileId)
				.map((backup) => backup.id);
			catalog.saves = catalog.saves.filter(({ id }) => id !== saveFileId);
			catalog.backups = catalog.backups.filter((backup) => backup.saveFileId !== saveFileId);
			delete catalog.workspaces[saveFileId];
			if (catalog.activeSaveFileId === saveFileId) {
				catalog.activeSaveFileId =
					[...catalog.saves].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
						?.id ?? null;
			}

			await this.#writeCatalog(catalog);
			await Promise.all([
				this.#fileStore.delete(saveBytesPath(saveFileId)),
				this.#fileStore.delete(workspaceBytesPath(saveFileId)),
				...backupIds.map((backupId) => this.#fileStore.delete(backupBytesPath(backupId)))
			]);
		});
	}

	createBackup(input: CreateBackupInput): Promise<BackupMetadata> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			if (!catalog.saves.some(({ id }) => id === input.saveFileId)) {
				throw new Error(`Cannot create backup for unknown save file: ${input.saveFileId}`);
			}

			const backup: BackupMetadata = {
				id: input.id ?? this.#idFactory(),
				saveFileId: input.saveFileId,
				reason: input.reason,
				byteLength: input.bytes.byteLength,
				createdAt: this.#now()
			};
			await this.#fileStore.writeBytes(backupBytesPath(backup.id), input.bytes);
			catalog.backups = [
				...catalog.backups.filter((candidate) => candidate.id !== backup.id),
				backup
			];
			await this.#writeCatalog(catalog);
			return { ...backup };
		});
	}

	listBackups(saveFileId: SaveFileId): Promise<BackupMetadata[]> {
		return this.#run(async () =>
			(await this.#readCatalog()).backups
				.filter((backup) => backup.saveFileId === saveFileId)
				.map((backup) => ({ ...backup }))
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
		);
	}

	getBackupBytes(backupId: BackupId): Promise<Uint8Array | null> {
		return this.#run(() => this.#fileStore.readBytes(backupBytesPath(backupId)));
	}

	deleteBackup(backupId: BackupId): Promise<void> {
		return this.#run(async () => {
			const catalog = await this.#readCatalog();
			catalog.backups = catalog.backups.filter(({ id }) => id !== backupId);
			await this.#writeCatalog(catalog);
			await this.#fileStore.delete(backupBytesPath(backupId));
		});
	}

	exportSave(saveFileId: SaveFileId): Promise<Uint8Array | null> {
		return this.getSaveBytes(saveFileId);
	}

	#run<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.#pending.then(operation, operation);
		this.#pending = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	async #readCatalog(): Promise<NativeCatalog> {
		const value = await this.#fileStore.readText(catalogPath);
		if (!value) return emptyCatalog();

		const catalog = JSON.parse(value) as NativeCatalog;
		if (catalog.version !== catalogVersion) {
			throw new Error(`Unsupported native Saves catalog version: ${catalog.version}`);
		}
		return catalog;
	}

	#writeCatalog(catalog: NativeCatalog): Promise<void> {
		return this.#fileStore.writeText(catalogPath, JSON.stringify(catalog));
	}
}

function createCapacitorFileStore(rootPath = 'pksx-saves'): NativeFileStore {
	const path = (relativePath: string) => `${rootPath}/${relativePath}`;
	return {
		async readText(relativePath) {
			try {
				const result = await Filesystem.readFile({
					path: path(relativePath),
					directory: Directory.Data,
					encoding: Encoding.UTF8
				});
				if (typeof result.data !== 'string') {
					throw new Error(`Expected native text for ${relativePath}`);
				}
				return result.data;
			} catch (error) {
				if (isMissingFile(error)) return null;
				throw error;
			}
		},
		writeText(relativePath, value) {
			return Filesystem.writeFile({
				path: path(relativePath),
				data: value,
				directory: Directory.Data,
				encoding: Encoding.UTF8,
				recursive: true
			}).then(() => undefined);
		},
		async readBytes(relativePath) {
			try {
				const result = await Filesystem.readFile({
					path: path(relativePath),
					directory: Directory.Data
				});
				if (typeof result.data !== 'string') {
					throw new Error(`Expected native bytes for ${relativePath}`);
				}
				return base64ToBytes(result.data);
			} catch (error) {
				if (isMissingFile(error)) return null;
				throw error;
			}
		},
		writeBytes(relativePath, value) {
			return Filesystem.writeFile({
				path: path(relativePath),
				data: bytesToBase64(value),
				directory: Directory.Data,
				recursive: true
			}).then(() => undefined);
		},
		async delete(relativePath) {
			try {
				await Filesystem.deleteFile({ path: path(relativePath), directory: Directory.Data });
			} catch (error) {
				if (!isMissingFile(error)) throw error;
			}
		}
	};
}

function emptyCatalog(): NativeCatalog {
	return {
		version: catalogVersion,
		saves: [],
		backups: [],
		workspaces: {},
		activeSaveFileId: null
	};
}

function saveBytesPath(saveFileId: SaveFileId) {
	return `saves/${encodeURIComponent(saveFileId)}.bin`;
}

function workspaceBytesPath(saveFileId: SaveFileId) {
	return `workspaces/${encodeURIComponent(saveFileId)}.bin`;
}

function backupBytesPath(backupId: BackupId) {
	return `backups/${encodeURIComponent(backupId)}.bin`;
}

function isMissingFile(error: unknown) {
	return (
		typeof error === 'object' && error !== null && 'code' in error && error.code === missingFileCode
	);
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
