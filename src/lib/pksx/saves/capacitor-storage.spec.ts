import { beforeEach, describe, expect, it } from 'vitest';
import { bytesEqual } from './bytes';
import { stableAutomaticBackupId } from './automatic-backup';
import { CapacitorSavesStorage, type NativeFileStore } from './capacitor-storage';
import { WorkspaceRevisionConflictError } from './workspace-revision';

describe('CapacitorSavesStorage', () => {
	let files: Map<string, string | Uint8Array>;
	let storage: CapacitorSavesStorage;
	let fileStore: NativeFileStore;
	let failCatalogWrites: number;

	beforeEach(() => {
		files = new Map();
		failCatalogWrites = 0;
		const ids = ['save-1', 'backup-1'];
		fileStore = {
			async readText(path) {
				const value = files.get(path);
				return typeof value === 'string' ? value : null;
			},
			async writeText(path, value) {
				if (path === 'catalog.json' && failCatalogWrites > 0) {
					failCatalogWrites -= 1;
					throw new Error('catalog unavailable');
				}
				files.set(path, value);
			},
			async readBytes(path) {
				const value = files.get(path);
				return value instanceof Uint8Array ? new Uint8Array(value) : null;
			},
			async writeBytes(path, value) {
				files.set(path, new Uint8Array(value));
			},
			async delete(path) {
				files.delete(path);
			}
		};
		storage = new CapacitorSavesStorage({
			fileStore,
			idFactory: () => {
				const id = ids.shift();
				if (!id) throw new Error('Test id sequence exhausted');
				return id;
			},
			now: () => '2026-05-16T12:00:00.000Z'
		});
	});

	it('preserves imported, exported, and backup bytes with their metadata', async () => {
		const importedBytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
		const saveFile = await storage.importSave({
			bytes: importedBytes,
			originalFileName: 'pokemon.sav'
		});
		importedBytes[0] = 99;

		const backup = await storage.createBackup({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([8, 6, 7, 5, 3, 0, 9]),
			reason: 'manual'
		});
		const retrievedBytes = await storage.getSaveBytes(saveFile.id);
		const exportedBytes = await storage.exportSave(saveFile.id);
		const backupBytes = await storage.getBackupBytes(backup.id);

		expect(saveFile).toStrictEqual({
			id: 'save-1',
			originalFileName: 'pokemon.sav',
			byteLength: 6,
			importedAt: '2026-05-16T12:00:00.000Z',
			updatedAt: '2026-05-16T12:00:00.000Z'
		});
		expect(await storage.listBackups(saveFile.id)).toStrictEqual([backup]);
		expect(
			bytesEqual(retrievedBytes ?? new Uint8Array(), new Uint8Array([0, 1, 2, 253, 254, 255]))
		).toBe(true);
		expect(bytesEqual(exportedBytes ?? new Uint8Array(), retrievedBytes ?? new Uint8Array())).toBe(
			true
		);
		expect(bytesEqual(backupBytes ?? new Uint8Array(), new Uint8Array([8, 6, 7, 5, 3, 0, 9]))).toBe(
			true
		);
	});

	it('reconciles a Backup written again with the same stable identity', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		await storage.createBackup({
			id: 'stable-edit-backup',
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			reason: 'save-file-editing'
		});
		const reconciled = await storage.createBackup({
			id: 'stable-edit-backup',
			saveFileId: saveFile.id,
			bytes: new Uint8Array([3]),
			reason: 'save-file-editing'
		});

		expect(await storage.listBackups(saveFile.id)).toEqual([reconciled]);
		expect(await storage.getBackupBytes(reconciled.id)).toEqual(new Uint8Array([3]));
	});

	it('assigns distinct Workspace revisions when the clock does not advance', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		const first = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});
		const second = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});

		expect(first.updatedAt).toBe('2026-05-16T12:00:00.000Z');
		expect(second.updatedAt).toBe('2026-05-16T12:00:00.001Z');
	});

	it('rejects a Workspace write based on an obsolete persisted revision', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		const first = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});
		const second = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([3]),
			dirty: true,
			automaticBackupCreated: true,
			expectedUpdatedAt: first.updatedAt
		});

		await expect(
			storage.putWorkspace({
				saveFileId: saveFile.id,
				bytes: new Uint8Array([4]),
				dirty: true,
				automaticBackupCreated: true,
				expectedUpdatedAt: first.updatedAt
			})
		).rejects.toBeInstanceOf(WorkspaceRevisionConflictError);
		expect(await storage.getWorkspace(saveFile.id)).toEqual(second);
	});

	it('restores Workspace bytes when catalog persistence fails', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		const persisted = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});
		failCatalogWrites = 1;

		await expect(
			storage.putWorkspace({
				saveFileId: saveFile.id,
				bytes: new Uint8Array([3]),
				dirty: true,
				automaticBackupCreated: true,
				expectedUpdatedAt: persisted.updatedAt
			})
		).rejects.toThrow('catalog unavailable');
		expect(await storage.getWorkspace(saveFile.id)).toEqual(persisted);
	});

	it('reconciles orphan automatic Backup bytes after catalog failure and recreation', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1, 2, 3]),
			originalFileName: null
		});
		failCatalogWrites = 1;

		await expect(
			storage.ensureAutomaticBackup({
				saveFileId: saveFile.id,
				importedAt: saveFile.importedAt,
				expectedUpdatedAt: null,
				reason: 'inventory-editing'
			})
		).rejects.toThrow('catalog unavailable');
		expect(await storage.getWorkspace(saveFile.id)).toBeNull();
		expect(await storage.listBackups(saveFile.id)).toEqual([]);
		const orphanPath = [...files.keys()].find((path) => path.startsWith('backups/'));
		expect(orphanPath).toBeDefined();

		const recreated = new CapacitorSavesStorage({
			fileStore,
			now: () => '2026-05-16T12:00:00.000Z'
		});
		const prepared = await recreated.ensureAutomaticBackup({
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: null,
			reason: 'inventory-editing'
		});

		expect(prepared.established).toBe(true);
		expect(await recreated.listBackups(saveFile.id)).toHaveLength(1);
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toEqual([orphanPath]);
	});

	it('preserves reconciled automatic Backup metadata and distinguishes a byte-identical Restore', async () => {
		const bytes = new Uint8Array([4, 5, 6]);
		const saveFile = await storage.importSave({ bytes, originalFileName: null });
		const stableId = stableAutomaticBackupId({
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			persistedRevision: saveFile.importedAt,
			bytes
		});
		const existing = await storage.createBackup({
			id: stableId,
			saveFileId: saveFile.id,
			bytes,
			reason: 'trainer-editing'
		});
		const first = await storage.ensureAutomaticBackup({
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: null,
			reason: 'inventory-editing'
		});
		expect(await storage.listBackups(saveFile.id)).toEqual([existing]);

		const restored = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes,
			dirty: false,
			automaticBackupCreated: false,
			expectedUpdatedAt: first.workspace.updatedAt
		});
		await storage.ensureAutomaticBackup({
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: restored.updatedAt,
			reason: 'inventory-editing'
		});

		const backups = await storage.listBackups(saveFile.id);
		expect(backups).toHaveLength(2);
		expect(backups.map(({ id }) => id)).toContain(stableId);
		expect(new Set(backups.map(({ id }) => id)).size).toBe(2);
	});
});
