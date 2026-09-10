import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bytesEqual } from './bytes';
import { deleteIndexedDbSaves, IndexedDbSavesStorage } from './indexed-db-storage';
import { createEmptyPokemonStorage } from './pokemon-storage';
import { WorkspaceRevisionConflictError } from './workspace-revision';

describe('IndexedDbSavesStorage', () => {
	let databaseName: string;
	let ids: string[];
	let storage: IndexedDbSavesStorage;

	beforeEach(() => {
		databaseName = `pksx-saves-test-${crypto.randomUUID()}`;
		ids = ['save-1', 'backup-1'];
		storage = new IndexedDbSavesStorage({
			databaseName,
			idFactory: () => {
				const id = ids.shift();
				if (!id) {
					throw new Error('Test id sequence exhausted');
				}
				return id;
			},
			now: () => '2026-05-16T12:00:00.000Z'
		});
	});

	afterEach(async () => {
		await deleteIndexedDbSaves(databaseName);
	});

	it('imports save bytes and retrieves them unchanged', async () => {
		const importedBytes = new Uint8Array([0, 1, 2, 253, 254, 255]);

		const saveFile = await storage.importSave({
			bytes: importedBytes,
			originalFileName: 'pokemon.sav'
		});
		importedBytes[0] = 99;

		const retrievedSave = await storage.getSave(saveFile.id);
		const retrievedBytes = await storage.getSaveBytes(saveFile.id);

		expect(saveFile).toStrictEqual({
			id: 'save-1',
			originalFileName: 'pokemon.sav',
			byteLength: 6,
			importedAt: '2026-05-16T12:00:00.000Z',
			updatedAt: '2026-05-16T12:00:00.000Z'
		});
		expect(retrievedSave).toStrictEqual(saveFile);
		expect(retrievedBytes).not.toBeNull();
		expect(
			bytesEqual(retrievedBytes ?? new Uint8Array(), new Uint8Array([0, 1, 2, 253, 254, 255]))
		).toBe(true);
		await expect(storage.getActiveSaveFileId()).resolves.toBe(saveFile.id);
	});

	it('exports the original bytes for an unchanged save', async () => {
		const originalBytes = new Uint8Array([10, 20, 30, 40]);
		const saveFile = await storage.importSave({
			bytes: originalBytes,
			originalFileName: 'clean.sav'
		});

		const exportedBytes = await storage.exportSave(saveFile.id);
		exportedBytes?.set([99], 0);
		const exportedAgain = await storage.exportSave(saveFile.id);

		expect(exportedBytes).not.toBeNull();
		expect(bytesEqual(exportedBytes ?? new Uint8Array(), originalBytes)).toBe(false);
		expect(bytesEqual(exportedAgain ?? new Uint8Array(), originalBytes)).toBe(true);
	});

	it('persists workspace bytes separately from the imported save artifact', async () => {
		const originalBytes = new Uint8Array([10, 20, 30, 40]);
		const workspaceBytes = new Uint8Array([10, 99, 30, 40]);
		const saveFile = await storage.importSave({
			bytes: originalBytes,
			originalFileName: 'dirty.sav'
		});

		const storedWorkspace = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: workspaceBytes,
			dirty: true,
			automaticBackupCreated: true
		});
		workspaceBytes[1] = 55;

		const retrievedWorkspace = await storage.getWorkspace(saveFile.id);
		const originalAgain = await storage.getSaveBytes(saveFile.id);

		expect(storedWorkspace).toStrictEqual({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([10, 99, 30, 40]),
			dirty: true,
			automaticBackupCreated: true,
			updatedAt: '2026-05-16T12:00:00.000Z'
		});
		expect(retrievedWorkspace).toStrictEqual(storedWorkspace);
		expect(bytesEqual(originalAgain ?? new Uint8Array(), originalBytes)).toBe(true);
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

	it('clears persisted workspace bytes for a save artifact', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1, 2, 3]),
			originalFileName: 'workspace.sav'
		});

		await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([3, 2, 1]),
			dirty: true,
			automaticBackupCreated: false
		});
		await storage.clearWorkspace(saveFile.id);

		await expect(storage.getWorkspace(saveFile.id)).resolves.toBeNull();
	});

	it('persists empty Pokemon Storage across Saves instances', async () => {
		const emptyStorage = createEmptyPokemonStorage(2, 4, () => '2026-05-16T11:00:00.000Z');
		await storage.putPokemonStorage(emptyStorage);
		emptyStorage.boxes[0]!.name = 'Changed after write';

		const reloaded = await new IndexedDbSavesStorage({ databaseName }).getPokemonStorage();

		expect(reloaded).toStrictEqual({
			...createEmptyPokemonStorage(2, 4, () => '2026-05-16T11:00:00.000Z'),
			updatedAt: '2026-05-16T12:00:00.000Z'
		});
	});

	it('rejects workspace persistence for an unknown save file', async () => {
		await expect(
			storage.putWorkspace({
				saveFileId: 'missing-save',
				bytes: new Uint8Array([1]),
				dirty: true,
				automaticBackupCreated: false
			})
		).rejects.toThrow('Cannot persist workspace for unknown save file: missing-save');
	});

	it('lists the most recently imported save first', async () => {
		ids = ['older-save', 'newer-save'];
		storage = new IndexedDbSavesStorage({
			databaseName,
			idFactory: () => {
				const id = ids.shift();
				if (!id) {
					throw new Error('Test id sequence exhausted');
				}
				return id;
			},
			now: (() => {
				const timestamps = ['2026-05-16T12:00:00.000Z', '2026-05-16T13:00:00.000Z'];
				return () => timestamps.shift() ?? '2026-05-16T14:00:00.000Z';
			})()
		});

		const older = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: 'older.sav'
		});
		const newer = await storage.importSave({
			bytes: new Uint8Array([2]),
			originalFileName: 'newer.sav'
		});

		await expect(storage.listSaves()).resolves.toStrictEqual([newer, older]);
	});

	it('activates an existing save and updates its opened timestamp', async () => {
		ids = ['older-save', 'newer-save'];
		storage = new IndexedDbSavesStorage({
			databaseName,
			idFactory: () => {
				const id = ids.shift();
				if (!id) {
					throw new Error('Test id sequence exhausted');
				}
				return id;
			},
			now: (() => {
				const timestamps = [
					'2026-05-16T12:00:00.000Z',
					'2026-05-16T13:00:00.000Z',
					'2026-05-16T14:00:00.000Z'
				];
				return () => timestamps.shift() ?? '2026-05-16T15:00:00.000Z';
			})()
		});

		const older = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: 'older.sav'
		});
		await storage.importSave({
			bytes: new Uint8Array([2]),
			originalFileName: 'newer.sav'
		});

		const activated = await storage.setActiveSaveFileId(older.id);

		expect(activated.updatedAt).toBe('2026-05-16T14:00:00.000Z');
		await expect(storage.getActiveSaveFileId()).resolves.toBe(older.id);
		await expect(storage.getSave(older.id)).resolves.toStrictEqual(activated);
	});

	it('rejects activating an unknown save file', async () => {
		await expect(storage.setActiveSaveFileId('missing-save')).rejects.toThrow(
			'Cannot activate unknown save file: missing-save'
		);
	});

	it('creates and lists backup metadata for a save file', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1, 3, 3, 7]),
			originalFileName: 'backup-source.sav'
		});

		const backup = await storage.createBackup({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([8, 6, 7, 5, 3, 0, 9]),
			reason: 'manual'
		});
		const backups = await storage.listBackups(saveFile.id);
		const backupBytes = await storage.getBackupBytes(backup.id);

		expect(backup).toStrictEqual({
			id: 'backup-1',
			saveFileId: 'save-1',
			reason: 'manual',
			byteLength: 7,
			createdAt: '2026-05-16T12:00:00.000Z'
		});
		expect(backups).toStrictEqual([backup]);
		expect(bytesEqual(backupBytes ?? new Uint8Array(), new Uint8Array([8, 6, 7, 5, 3, 0, 9]))).toBe(
			true
		);
	});

	it('rejects backup creation for an unknown save file', async () => {
		await expect(
			storage.createBackup({
				saveFileId: 'missing-save',
				bytes: new Uint8Array([1]),
				reason: 'manual'
			})
		).rejects.toThrow('Cannot create backup for unknown save file: missing-save');
	});

	it('lists newest backups first', async () => {
		ids = ['save-1', 'older-backup', 'newer-backup'];
		storage = new IndexedDbSavesStorage({
			databaseName,
			idFactory: () => {
				const id = ids.shift();
				if (!id) {
					throw new Error('Test id sequence exhausted');
				}
				return id;
			},
			now: (() => {
				const timestamps = [
					'2026-05-16T12:00:00.000Z',
					'2026-05-16T12:30:00.000Z',
					'2026-05-16T13:00:00.000Z'
				];
				return () => timestamps.shift() ?? '2026-05-16T14:00:00.000Z';
			})()
		});

		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: 'backup-source.sav'
		});
		const older = await storage.createBackup({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			reason: 'manual'
		});
		const newer = await storage.createBackup({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([3]),
			reason: 'pokemon-editing'
		});

		await expect(storage.listBackups(saveFile.id)).resolves.toStrictEqual([newer, older]);
	});

	it('deletes a backup metadata and bytes record', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: 'backup-source.sav'
		});
		const backup = await storage.createBackup({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			reason: 'manual'
		});

		await storage.deleteBackup(backup.id);

		await expect(storage.listBackups(saveFile.id)).resolves.toStrictEqual([]);
		await expect(storage.getBackupBytes(backup.id)).resolves.toBeNull();
	});

	it('deletes save metadata, bytes, backups, and moves active save when needed', async () => {
		ids = ['older-save', 'newer-save', 'backup-1'];
		storage = new IndexedDbSavesStorage({
			databaseName,
			idFactory: () => {
				const id = ids.shift();
				if (!id) {
					throw new Error('Test id sequence exhausted');
				}
				return id;
			},
			now: (() => {
				const timestamps = [
					'2026-05-16T12:00:00.000Z',
					'2026-05-16T13:00:00.000Z',
					'2026-05-16T14:00:00.000Z'
				];
				return () => timestamps.shift() ?? '2026-05-16T15:00:00.000Z';
			})()
		});

		const older = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: 'older.sav'
		});
		const newer = await storage.importSave({
			bytes: new Uint8Array([2]),
			originalFileName: 'newer.sav'
		});
		const backup = await storage.createBackup({
			saveFileId: newer.id,
			bytes: new Uint8Array([3]),
			reason: 'manual'
		});

		await storage.deleteSave(newer.id);

		await expect(storage.getSave(newer.id)).resolves.toBeNull();
		await expect(storage.getSaveBytes(newer.id)).resolves.toBeNull();
		await expect(storage.getBackupBytes(backup.id)).resolves.toBeNull();
		await expect(storage.listBackups(newer.id)).resolves.toStrictEqual([]);
		await expect(storage.getActiveSaveFileId()).resolves.toBe(older.id);
	});
});
