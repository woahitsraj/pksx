import { stableAutomaticBackupId } from './automatic-backup';
import { bytesEqual, copyBytes } from './bytes';
import { clonePokemonStorage } from './pokemon-storage';
import { nextWorkspaceRevision, WorkspaceRevisionConflictError } from './workspace-revision';
import type {
	BackupId,
	BackupMetadata,
	CreateBackupInput,
	EnsureAutomaticBackupInput,
	EnsureAutomaticBackupResult,
	ImportSaveInput,
	SavesStorage,
	StoredPokemonStorage,
	PutWorkspaceInput,
	SaveFileId,
	StoredSaveFile,
	StoredWorkspace
} from './types';

const databaseVersion = 4;
const saveFilesStore = 'saveFiles';
const saveBytesStore = 'saveBytes';
const workspacesStore = 'workspaces';
const pokemonStorageStore = 'pokemonStorage';
const backupsStore = 'backups';
const backupBytesStore = 'backupBytes';
const appStateStore = 'appState';
const backupsBySaveFileIdIndex = 'bySaveFileId';
const activeSaveFileIdKey = 'activeSaveFileId';

type SaveBytesRecord = {
	saveFileId: SaveFileId;
	bytes: Uint8Array;
};

type BackupBytesRecord = {
	backupId: BackupId;
	bytes: Uint8Array;
};

type WorkspaceRecord = StoredWorkspace;
type PokemonStorageRecord = StoredPokemonStorage;

type AppStateRecord = {
	key: string;
	value: string | null;
};

export type IndexedDbSavesStorageOptions = {
	databaseName?: string;
	idFactory?: () => string;
	now?: () => string;
};

export class IndexedDbSavesStorage implements SavesStorage {
	readonly #databaseName: string;
	readonly #idFactory: () => string;
	readonly #now: () => string;

	constructor(options: IndexedDbSavesStorageOptions = {}) {
		this.#databaseName = options.databaseName ?? 'pksx-saves';
		this.#idFactory = options.idFactory ?? (() => crypto.randomUUID());
		this.#now = options.now ?? (() => new Date().toISOString());
	}

	async importSave(input: ImportSaveInput): Promise<StoredSaveFile> {
		const timestamp = this.#now();
		const saveFile: StoredSaveFile = {
			id: this.#idFactory(),
			originalFileName: input.originalFileName ?? null,
			byteLength: input.bytes.byteLength,
			importedAt: timestamp,
			updatedAt: timestamp
		};

		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(
				[saveFilesStore, saveBytesStore, appStateStore],
				'readwrite'
			);
			transaction.objectStore(saveFilesStore).put(saveFile);
			transaction.objectStore(saveBytesStore).put({
				saveFileId: saveFile.id,
				bytes: copyBytes(input.bytes)
			} satisfies SaveBytesRecord);
			transaction.objectStore(appStateStore).put({
				key: activeSaveFileIdKey,
				value: saveFile.id
			} satisfies AppStateRecord);
			await transactionDone(transaction);
		} finally {
			database.close();
		}

		return { ...saveFile };
	}

	async getSave(saveFileId: SaveFileId): Promise<StoredSaveFile | null> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(saveFilesStore, 'readonly');
			const saveFile = await requestToPromise<StoredSaveFile | undefined>(
				transaction.objectStore(saveFilesStore).get(saveFileId)
			);
			await transactionDone(transaction);
			return saveFile ? { ...saveFile } : null;
		} finally {
			database.close();
		}
	}

	async listSaves(): Promise<StoredSaveFile[]> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(saveFilesStore, 'readonly');
			const saveFiles = await requestToPromise<StoredSaveFile[]>(
				transaction.objectStore(saveFilesStore).getAll()
			);
			await transactionDone(transaction);

			return saveFiles
				.map((saveFile) => ({ ...saveFile }))
				.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
		} finally {
			database.close();
		}
	}

	async getSaveBytes(saveFileId: SaveFileId): Promise<Uint8Array | null> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(saveBytesStore, 'readonly');
			const record = await requestToPromise<SaveBytesRecord | undefined>(
				transaction.objectStore(saveBytesStore).get(saveFileId)
			);
			await transactionDone(transaction);
			return record ? copyBytes(record.bytes) : null;
		} finally {
			database.close();
		}
	}

	async putWorkspace(input: PutWorkspaceInput): Promise<StoredWorkspace> {
		const saveFile = await this.getSave(input.saveFileId);
		if (!saveFile) {
			throw new Error(`Cannot persist workspace for unknown save file: ${input.saveFileId}`);
		}

		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(workspacesStore, 'readwrite');
			const store = transaction.objectStore(workspacesStore);
			const previous = await requestToPromise<WorkspaceRecord | undefined>(
				store.get(input.saveFileId)
			);
			if (
				input.expectedUpdatedAt !== undefined &&
				(previous?.updatedAt ?? null) !== input.expectedUpdatedAt
			) {
				throw new WorkspaceRevisionConflictError();
			}
			const workspace: StoredWorkspace = {
				saveFileId: input.saveFileId,
				bytes: copyBytes(input.bytes),
				dirty: input.dirty,
				automaticBackupCreated: input.automaticBackupCreated,
				updatedAt: nextWorkspaceRevision(previous?.updatedAt, this.#now())
			};
			store.put({
				...workspace,
				bytes: copyBytes(workspace.bytes)
			} satisfies WorkspaceRecord);
			await transactionDone(transaction);
			return { ...workspace, bytes: copyBytes(workspace.bytes) };
		} finally {
			database.close();
		}
	}

	async getWorkspace(saveFileId: SaveFileId): Promise<StoredWorkspace | null> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(workspacesStore, 'readonly');
			const record = await requestToPromise<WorkspaceRecord | undefined>(
				transaction.objectStore(workspacesStore).get(saveFileId)
			);
			await transactionDone(transaction);
			return record ? { ...record, bytes: copyBytes(record.bytes) } : null;
		} finally {
			database.close();
		}
	}

	async clearWorkspace(saveFileId: SaveFileId): Promise<void> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(workspacesStore, 'readwrite');
			transaction.objectStore(workspacesStore).delete(saveFileId);
			await transactionDone(transaction);
		} finally {
			database.close();
		}
	}

	async getPokemonStorage(): Promise<StoredPokemonStorage | null> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(pokemonStorageStore, 'readonly');
			const record = await requestToPromise<PokemonStorageRecord | undefined>(
				transaction.objectStore(pokemonStorageStore).get('pokemon-storage')
			);
			await transactionDone(transaction);
			return record ? clonePokemonStorage(record) : null;
		} finally {
			database.close();
		}
	}

	async putPokemonStorage(storage: StoredPokemonStorage): Promise<StoredPokemonStorage> {
		const record: StoredPokemonStorage = {
			...clonePokemonStorage(storage),
			updatedAt: this.#now()
		};
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(pokemonStorageStore, 'readwrite');
			transaction.objectStore(pokemonStorageStore).put(record satisfies PokemonStorageRecord);
			await transactionDone(transaction);
		} finally {
			database.close();
		}

		return clonePokemonStorage(record);
	}

	async getActiveSaveFileId(): Promise<SaveFileId | null> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(appStateStore, 'readonly');
			const record = await requestToPromise<AppStateRecord | undefined>(
				transaction.objectStore(appStateStore).get(activeSaveFileIdKey)
			);
			await transactionDone(transaction);
			return record?.value ?? null;
		} finally {
			database.close();
		}
	}

	async setActiveSaveFileId(saveFileId: SaveFileId): Promise<StoredSaveFile> {
		const existing = await this.getSave(saveFileId);
		if (!existing) {
			throw new Error(`Cannot activate unknown save file: ${saveFileId}`);
		}

		const updated: StoredSaveFile = {
			...existing,
			updatedAt: this.#now()
		};

		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction([saveFilesStore, appStateStore], 'readwrite');
			transaction.objectStore(saveFilesStore).put(updated);
			transaction.objectStore(appStateStore).put({
				key: activeSaveFileIdKey,
				value: saveFileId
			} satisfies AppStateRecord);
			await transactionDone(transaction);
			return { ...updated };
		} finally {
			database.close();
		}
	}

	async deleteSave(saveFileId: SaveFileId): Promise<void> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(
				[
					saveFilesStore,
					saveBytesStore,
					workspacesStore,
					backupsStore,
					backupBytesStore,
					appStateStore
				],
				'readwrite'
			);
			const saveFiles = await requestToPromise<StoredSaveFile[]>(
				transaction.objectStore(saveFilesStore).getAll()
			);
			const activeRecord = await requestToPromise<AppStateRecord | undefined>(
				transaction.objectStore(appStateStore).get(activeSaveFileIdKey)
			);
			const backups = await requestToPromise<BackupMetadata[]>(
				transaction.objectStore(backupsStore).index(backupsBySaveFileIdIndex).getAll(saveFileId)
			);

			transaction.objectStore(saveFilesStore).delete(saveFileId);
			transaction.objectStore(saveBytesStore).delete(saveFileId);
			transaction.objectStore(workspacesStore).delete(saveFileId);

			for (const backup of backups) {
				transaction.objectStore(backupsStore).delete(backup.id);
				transaction.objectStore(backupBytesStore).delete(backup.id);
			}

			if (activeRecord?.value === saveFileId) {
				const nextActiveSave = saveFiles
					.filter((saveFile) => saveFile.id !== saveFileId)
					.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

				transaction.objectStore(appStateStore).put({
					key: activeSaveFileIdKey,
					value: nextActiveSave?.id ?? null
				} satisfies AppStateRecord);
			}
			await transactionDone(transaction);
		} finally {
			database.close();
		}
	}

	async createBackup(input: CreateBackupInput): Promise<BackupMetadata> {
		const saveFile = await this.getSave(input.saveFileId);
		if (!saveFile) {
			throw new Error(`Cannot create backup for unknown save file: ${input.saveFileId}`);
		}

		const backup: BackupMetadata = {
			id: input.id ?? this.#idFactory(),
			saveFileId: input.saveFileId,
			reason: input.reason,
			byteLength: input.bytes.byteLength,
			createdAt: this.#now()
		};

		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction([backupsStore, backupBytesStore], 'readwrite');
			transaction.objectStore(backupsStore).put(backup);
			transaction.objectStore(backupBytesStore).put({
				backupId: backup.id,
				bytes: copyBytes(input.bytes)
			} satisfies BackupBytesRecord);
			await transactionDone(transaction);
		} finally {
			database.close();
		}

		return { ...backup };
	}

	async ensureAutomaticBackup(
		input: EnsureAutomaticBackupInput
	): Promise<EnsureAutomaticBackupResult> {
		const database = await openSavesDatabase(this.#databaseName);
		const transaction = database.transaction(
			[saveFilesStore, saveBytesStore, workspacesStore, backupsStore, backupBytesStore],
			'readwrite'
		);
		try {
			const saveFile = await requestToPromise<StoredSaveFile | undefined>(
				transaction.objectStore(saveFilesStore).get(input.saveFileId)
			);
			if (!saveFile || saveFile.importedAt !== input.importedAt) {
				throw new Error('The selected Save File is no longer available.');
			}

			const workspaceStore = transaction.objectStore(workspacesStore);
			const previous = await requestToPromise<WorkspaceRecord | undefined>(
				workspaceStore.get(input.saveFileId)
			);
			if ((previous?.updatedAt ?? null) !== input.expectedUpdatedAt) {
				throw new WorkspaceRevisionConflictError();
			}
			if (previous?.automaticBackupCreated) {
				await transactionDone(transaction);
				return { workspace: cloneWorkspace(previous), established: false };
			}

			const bytes = previous
				? previous.bytes
				: (
						await requestToPromise<SaveBytesRecord | undefined>(
							transaction.objectStore(saveBytesStore).get(input.saveFileId)
						)
					)?.bytes;
			if (!bytes) throw new Error('The Save File bytes are no longer available.');

			const backupId = stableAutomaticBackupId({
				saveFileId: input.saveFileId,
				importedAt: input.importedAt,
				persistedRevision: previous?.updatedAt ?? saveFile.importedAt,
				bytes
			});
			const backupStore = transaction.objectStore(backupsStore);
			const backupBytesStoreObject = transaction.objectStore(backupBytesStore);
			const [existingBackup, existingBytes] = await Promise.all([
				requestToPromise<BackupMetadata | undefined>(backupStore.get(backupId)),
				requestToPromise<BackupBytesRecord | undefined>(backupBytesStoreObject.get(backupId))
			]);
			if (
				existingBackup &&
				(existingBackup.saveFileId !== input.saveFileId ||
					existingBackup.byteLength !== bytes.byteLength)
			) {
				throw new Error('The automatic Backup identity belongs to different content.');
			}
			if (existingBytes && !bytesEqual(existingBytes.bytes, bytes)) {
				throw new Error('The automatic Backup bytes do not match their identity.');
			}
			if (!existingBytes) {
				backupBytesStoreObject.put({
					backupId,
					bytes: copyBytes(bytes)
				} satisfies BackupBytesRecord);
			}
			if (!existingBackup) {
				backupStore.put({
					id: backupId,
					saveFileId: input.saveFileId,
					reason: input.reason,
					byteLength: bytes.byteLength,
					createdAt: this.#now()
				} satisfies BackupMetadata);
			}

			const workspace: StoredWorkspace = {
				saveFileId: input.saveFileId,
				bytes: copyBytes(bytes),
				dirty: previous?.dirty ?? false,
				automaticBackupCreated: true,
				updatedAt: nextWorkspaceRevision(previous?.updatedAt, this.#now())
			};
			workspaceStore.put({ ...workspace, bytes: copyBytes(bytes) } satisfies WorkspaceRecord);
			await transactionDone(transaction);
			return { workspace: cloneWorkspace(workspace), established: true };
		} catch (error) {
			try {
				transaction.abort();
			} catch {
				// The transaction already completed or aborted.
			}
			throw error;
		} finally {
			database.close();
		}
	}

	async listBackups(saveFileId: SaveFileId): Promise<BackupMetadata[]> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(backupsStore, 'readonly');
			const backups = await requestToPromise<BackupMetadata[]>(
				transaction.objectStore(backupsStore).index(backupsBySaveFileIdIndex).getAll(saveFileId)
			);
			await transactionDone(transaction);
			return backups
				.map((backup) => ({ ...backup }))
				.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
		} finally {
			database.close();
		}
	}

	async getBackupBytes(backupId: BackupId): Promise<Uint8Array | null> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction(backupBytesStore, 'readonly');
			const record = await requestToPromise<BackupBytesRecord | undefined>(
				transaction.objectStore(backupBytesStore).get(backupId)
			);
			await transactionDone(transaction);
			return record ? copyBytes(record.bytes) : null;
		} finally {
			database.close();
		}
	}

	async deleteBackup(backupId: BackupId): Promise<void> {
		const database = await openSavesDatabase(this.#databaseName);
		try {
			const transaction = database.transaction([backupsStore, backupBytesStore], 'readwrite');
			transaction.objectStore(backupsStore).delete(backupId);
			transaction.objectStore(backupBytesStore).delete(backupId);
			await transactionDone(transaction);
		} finally {
			database.close();
		}
	}

	async exportSave(saveFileId: SaveFileId): Promise<Uint8Array | null> {
		return this.getSaveBytes(saveFileId);
	}
}

export function deleteIndexedDbSaves(databaseName: string): Promise<void> {
	const request = indexedDB.deleteDatabase(databaseName);

	return new Promise((resolve, reject) => {
		request.onerror = () =>
			reject(request.error ?? new Error('Failed to delete IndexedDB database'));
		request.onblocked = () => reject(new Error('IndexedDB database deletion was blocked'));
		request.onsuccess = () => resolve();
	});
}

function openSavesDatabase(databaseName: string): Promise<IDBDatabase> {
	const request = indexedDB.open(databaseName, databaseVersion);

	return new Promise((resolve, reject) => {
		request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB database'));
		request.onupgradeneeded = () => migrateDatabase(request.result);
		request.onsuccess = () => resolve(request.result);
	});
}

function migrateDatabase(database: IDBDatabase): void {
	if (!database.objectStoreNames.contains(saveFilesStore)) {
		database.createObjectStore(saveFilesStore, { keyPath: 'id' });
	}

	if (!database.objectStoreNames.contains(saveBytesStore)) {
		database.createObjectStore(saveBytesStore, { keyPath: 'saveFileId' });
	}

	if (!database.objectStoreNames.contains(workspacesStore)) {
		database.createObjectStore(workspacesStore, { keyPath: 'saveFileId' });
	}

	if (!database.objectStoreNames.contains(pokemonStorageStore)) {
		database.createObjectStore(pokemonStorageStore, { keyPath: 'id' });
	}

	if (!database.objectStoreNames.contains(backupsStore)) {
		const store = database.createObjectStore(backupsStore, { keyPath: 'id' });
		store.createIndex(backupsBySaveFileIdIndex, 'saveFileId', { unique: false });
	}

	if (!database.objectStoreNames.contains(backupBytesStore)) {
		database.createObjectStore(backupBytesStore, { keyPath: 'backupId' });
	}

	if (!database.objectStoreNames.contains(appStateStore)) {
		database.createObjectStore(appStateStore, { keyPath: 'key' });
	}
}

function requestToPromise<T>(request: IDBRequest): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
		request.onsuccess = () => resolve(request.result as T);
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.onabort = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
		transaction.onerror = () =>
			reject(transaction.error ?? new Error('IndexedDB transaction failed'));
		transaction.oncomplete = () => resolve();
	});
}

function cloneWorkspace(workspace: StoredWorkspace): StoredWorkspace {
	return { ...workspace, bytes: copyBytes(workspace.bytes) };
}
