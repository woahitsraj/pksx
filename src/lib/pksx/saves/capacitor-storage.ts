import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { stableAutomaticBackupId } from './automatic-backup';
import { bytesEqual, copyBytes } from './bytes';
import {
	backupBytesPath,
	cloneCatalog,
	NativeCatalogJournal,
	saveBytesPath,
	storedWorkspaceMetadata,
	type NativeCatalogSnapshot,
	type NativeFileStore,
	type NativeWorkspaceMetadata
} from './native-catalog-journal';
import { clonePokemonStorage } from './pokemon-storage';
import { nextWorkspaceRevision, WorkspaceRevisionConflictError } from './workspace-revision';
import type {
	BackupId,
	BackupMetadata,
	CreateBackupInput,
	EnsureAutomaticBackupInput,
	EnsureAutomaticBackupResult,
	ImportSaveInput,
	PutWorkspaceInput,
	SaveFileId,
	SavesStorage,
	StoredPokemonStorage,
	StoredSaveFile,
	StoredWorkspace
} from './types';

const pokemonStoragePath = 'pokemon-storage.json';
const missingFileCode = 'OS-PLUG-FILE-0008';

export type { NativeFileStore } from './native-catalog-journal';

export type CapacitorSavesStorageOptions = {
	fileStore?: NativeFileStore;
	idFactory?: () => string;
	now?: () => string;
};

export class CapacitorSavesStorage implements SavesStorage {
	readonly #fileStore: NativeFileStore;
	readonly #journal: NativeCatalogJournal;
	readonly #idFactory: () => string;
	readonly #now: () => string;
	#pending: Promise<void> = Promise.resolve();

	constructor(options: CapacitorSavesStorageOptions = {}) {
		this.#fileStore = options.fileStore ?? createCapacitorFileStore();
		this.#journal = new NativeCatalogJournal(this.#fileStore);
		this.#idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.#now = options.now ?? (() => new Date().toISOString());
	}

	importSave(input: ImportSaveInput): Promise<StoredSaveFile> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			const timestamp = this.#now();
			const saveFile: StoredSaveFile = {
				id: this.#idFactory(),
				originalFileName: input.originalFileName ?? null,
				byteLength: input.bytes.byteLength,
				importedAt: timestamp,
				updatedAt: timestamp
			};
			catalog.saves.push(saveFile);
			catalog.activeSaveFileId = saveFile.id;
			await this.#journal.commit(snapshot, catalog, {
				stagedBytes: [{ path: saveBytesPath(saveFile.id), bytes: input.bytes }]
			});
			return { ...saveFile };
		});
	}

	getSave(saveFileId: SaveFileId): Promise<StoredSaveFile | null> {
		return this.#run(async () => {
			const saveFile = (await this.#journal.read()).catalog.saves.find(
				({ id }) => id === saveFileId
			);
			return saveFile ? { ...saveFile } : null;
		});
	}

	listSaves(): Promise<StoredSaveFile[]> {
		return this.#run(async () =>
			(await this.#journal.read()).catalog.saves
				.map((saveFile) => ({ ...saveFile }))
				.sort((left, right) => right.importedAt.localeCompare(left.importedAt))
		);
	}

	getSaveBytes(saveFileId: SaveFileId): Promise<Uint8Array | null> {
		return this.#run(() => this.#fileStore.readBytes(saveBytesPath(saveFileId)));
	}

	putWorkspace(input: PutWorkspaceInput): Promise<StoredWorkspace> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			if (!catalog.saves.some(({ id }) => id === input.saveFileId)) {
				throw new Error(`Cannot persist workspace for unknown save file: ${input.saveFileId}`);
			}
			const previous = catalog.workspaces[input.saveFileId];
			if (
				input.expectedUpdatedAt !== undefined &&
				(previous?.updatedAt ?? null) !== input.expectedUpdatedAt
			) {
				throw new WorkspaceRevisionConflictError();
			}

			const metadata: NativeWorkspaceMetadata = {
				saveFileId: input.saveFileId,
				dirty: input.dirty,
				automaticBackupCreated: input.automaticBackupCreated,
				updatedAt: nextWorkspaceRevision(previous?.updatedAt, this.#now())
			};
			catalog.workspaces[input.saveFileId] = metadata;
			await this.#journal.commit(snapshot, catalog, {
				workspaceBytes: new Map([[input.saveFileId, input.bytes]])
			});
			return { ...storedWorkspaceMetadata(metadata), bytes: copyBytes(input.bytes) };
		});
	}

	getWorkspace(saveFileId: SaveFileId): Promise<StoredWorkspace | null> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const metadata = snapshot.catalog.workspaces[saveFileId];
			if (!metadata) return null;
			const bytes = await this.#journal.readWorkspace(snapshot, saveFileId);
			if (!bytes) throw new Error('The persisted Workspace bytes are missing.');
			return { ...storedWorkspaceMetadata(metadata), bytes };
		});
	}

	clearWorkspace(saveFileId: SaveFileId): Promise<void> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			delete catalog.workspaces[saveFileId];
			await this.#journal.commit(snapshot, catalog);
			await this.#journal.cleanupWorkspace(saveFileId);
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
		return this.#run(async () => (await this.#journal.read()).catalog.activeSaveFileId);
	}

	setActiveSaveFileId(saveFileId: SaveFileId): Promise<StoredSaveFile> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			const index = catalog.saves.findIndex(({ id }) => id === saveFileId);
			if (index < 0) throw new Error(`Cannot activate unknown save file: ${saveFileId}`);
			const updated = { ...catalog.saves[index], updatedAt: this.#now() };
			catalog.saves[index] = updated;
			catalog.activeSaveFileId = saveFileId;
			await this.#journal.commit(snapshot, catalog);
			return { ...updated };
		});
	}

	deleteSave(saveFileId: SaveFileId): Promise<void> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			const saveFile = catalog.saves.find(({ id }) => id === saveFileId);
			const workspace = catalog.workspaces[saveFileId];
			const interruptedBackupId =
				saveFile && !workspace?.automaticBackupCreated
					? await this.#interruptedAutomaticBackupId(snapshot, saveFile, workspace)
					: null;
			const backupIds = new Set(
				catalog.backups
					.filter((backup) => backup.saveFileId === saveFileId)
					.map((backup) => backup.id)
			);
			if (interruptedBackupId) backupIds.add(interruptedBackupId);
			catalog.saves = catalog.saves.filter(({ id }) => id !== saveFileId);
			catalog.backups = catalog.backups.filter((backup) => backup.saveFileId !== saveFileId);
			delete catalog.workspaces[saveFileId];
			if (catalog.activeSaveFileId === saveFileId) {
				catalog.activeSaveFileId =
					[...catalog.saves].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
						?.id ?? null;
			}
			await this.#journal.commit(snapshot, catalog);
			await this.#journal.cleanupSave(saveFileId, backupIds);
		});
	}

	createBackup(input: CreateBackupInput): Promise<BackupMetadata> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
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
			catalog.backups = [
				...catalog.backups.filter((candidate) => candidate.id !== backup.id),
				backup
			];
			await this.#journal.commit(snapshot, catalog, {
				stagedBytes: [{ path: backupBytesPath(backup.id), bytes: input.bytes }]
			});
			return { ...backup };
		});
	}

	ensureAutomaticBackup(input: EnsureAutomaticBackupInput): Promise<EnsureAutomaticBackupResult> {
		return this.#run(async () => {
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			const saveFile = catalog.saves.find(({ id }) => id === input.saveFileId);
			if (!saveFile || saveFile.importedAt !== input.importedAt) {
				throw new Error('The selected Save File is no longer available.');
			}
			const previous = catalog.workspaces[input.saveFileId];
			if ((previous?.updatedAt ?? null) !== input.expectedUpdatedAt) {
				throw new WorkspaceRevisionConflictError();
			}
			if (previous?.automaticBackupCreated) {
				const bytes = await this.#journal.readWorkspace(snapshot, input.saveFileId);
				if (!bytes) throw new Error('The persisted Workspace bytes are missing.');
				return {
					workspace: { ...storedWorkspaceMetadata(previous), bytes },
					established: false
				};
			}

			const bytes = previous
				? await this.#journal.readWorkspace(snapshot, input.saveFileId)
				: await this.#fileStore.readBytes(saveBytesPath(input.saveFileId));
			if (!bytes) throw new Error('The Save File bytes are no longer available.');
			const backupId = stableAutomaticBackupId({
				saveFileId: input.saveFileId,
				importedAt: input.importedAt,
				persistedRevision: previous?.updatedAt ?? saveFile.importedAt,
				bytes
			});
			const existingBackup = catalog.backups.find(({ id }) => id === backupId);
			const backupPath = backupBytesPath(backupId);
			const existingBytes = await this.#fileStore.readBytes(backupPath);
			if (
				existingBackup &&
				(existingBackup.saveFileId !== input.saveFileId ||
					existingBackup.byteLength !== bytes.byteLength)
			) {
				throw new Error('The automatic Backup identity belongs to different content.');
			}
			if (existingBackup && existingBytes && !bytesEqual(existingBytes, bytes)) {
				throw new Error('The automatic Backup bytes do not match their identity.');
			}
			if (!existingBackup) {
				catalog.backups.push({
					id: backupId,
					saveFileId: input.saveFileId,
					reason: input.reason,
					byteLength: bytes.byteLength,
					createdAt: this.#now()
				});
			}
			const metadata: NativeWorkspaceMetadata = {
				saveFileId: input.saveFileId,
				dirty: previous?.dirty ?? false,
				automaticBackupCreated: true,
				updatedAt: nextWorkspaceRevision(previous?.updatedAt, this.#now())
			};
			catalog.workspaces[input.saveFileId] = metadata;
			await this.#journal.commit(snapshot, catalog, {
				workspaceBytes: new Map([[input.saveFileId, bytes]]),
				stagedBytes: existingBackup && existingBytes ? [] : [{ path: backupPath, bytes }]
			});
			return {
				workspace: { ...storedWorkspaceMetadata(metadata), bytes: copyBytes(bytes) },
				established: true
			};
		});
	}

	listBackups(saveFileId: SaveFileId): Promise<BackupMetadata[]> {
		return this.#run(async () =>
			(await this.#journal.read()).catalog.backups
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
			const snapshot = await this.#journal.read();
			const catalog = cloneCatalog(snapshot.catalog);
			catalog.backups = catalog.backups.filter(({ id }) => id !== backupId);
			await this.#journal.commit(snapshot, catalog);
			await this.#fileStore.delete(backupBytesPath(backupId)).catch(() => undefined);
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

	async #interruptedAutomaticBackupId(
		snapshot: NativeCatalogSnapshot,
		saveFile: StoredSaveFile,
		workspace: NativeWorkspaceMetadata | undefined
	) {
		let bytes: Uint8Array | null;
		try {
			bytes = workspace
				? await this.#journal.readWorkspace(snapshot, saveFile.id)
				: await this.#fileStore.readBytes(saveBytesPath(saveFile.id));
		} catch {
			return null;
		}
		return bytes
			? stableAutomaticBackupId({
					saveFileId: saveFile.id,
					importedAt: saveFile.importedAt,
					persistedRevision: workspace?.updatedAt ?? saveFile.importedAt,
					bytes
				})
			: null;
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
				if (typeof result.data !== 'string')
					throw new Error(`Expected native text for ${relativePath}`);
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
				if (typeof result.data !== 'string')
					throw new Error(`Expected native bytes for ${relativePath}`);
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
		},
		async list(relativePath) {
			try {
				const result = await Filesystem.readdir({
					path: path(relativePath),
					directory: Directory.Data
				});
				return result.files.map((file) => file.name);
			} catch (error) {
				if (isMissingFile(error)) return [];
				throw error;
			}
		}
	};
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
