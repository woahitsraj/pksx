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
	let failBackupDeletes: number;
	let failWorkspaceReads: number;
	let failWorkspaceWrites: number;
	let failWorkspaceDeletes: number;
	let partialBackupWrites: number;
	let completeBackupWriteFailures: number;
	let deniedBackupWrites: number;
	let catalogWriteFailure: 'after' | 'partial' | null;
	let failCatalogReads: number;
	let failCatalogReadback: boolean;

	beforeEach(() => {
		files = new Map();
		failCatalogWrites = 0;
		failBackupDeletes = 0;
		failWorkspaceReads = 0;
		failWorkspaceWrites = 0;
		failWorkspaceDeletes = 0;
		partialBackupWrites = 0;
		completeBackupWriteFailures = 0;
		deniedBackupWrites = 0;
		catalogWriteFailure = null;
		failCatalogReads = 0;
		failCatalogReadback = false;
		const ids = ['save-1', 'backup-1'];
		fileStore = {
			async readText(path) {
				if (path.startsWith('catalog.') && failCatalogReads > 0) {
					failCatalogReads -= 1;
					throw new Error('catalog read unavailable');
				}
				const value = files.get(path);
				return typeof value === 'string' ? value : null;
			},
			async writeText(path, value) {
				if (path.startsWith('catalog.') && failCatalogWrites > 0) {
					failCatalogWrites -= 1;
					throw new Error('catalog unavailable');
				}
				if (path.startsWith('catalog.') && catalogWriteFailure) {
					files.set(path, catalogWriteFailure === 'after' ? value : value.slice(0, 23));
					catalogWriteFailure = null;
					if (failCatalogReadback) {
						failCatalogReadback = false;
						failCatalogReads = 1;
					}
					throw new Error('catalog acknowledgement unavailable');
				}
				files.set(path, value);
			},
			async readBytes(path) {
				if (path.startsWith('workspaces/') && failWorkspaceReads > 0) {
					failWorkspaceReads -= 1;
					throw new Error('workspace read unavailable');
				}
				const value = files.get(path);
				return value instanceof Uint8Array ? new Uint8Array(value) : null;
			},
			async writeBytes(path, value) {
				if (path.startsWith('backups/') && deniedBackupWrites > 0) {
					deniedBackupWrites -= 1;
					throw new Error('Backup write unavailable');
				}
				if (path.startsWith('backups/') && partialBackupWrites > 0) {
					partialBackupWrites -= 1;
					files.set(path, new Uint8Array(value.slice(0, 1)));
					throw new Error('partial Backup write');
				}
				files.set(path, new Uint8Array(value));
				if (path.startsWith('backups/') && completeBackupWriteFailures > 0) {
					completeBackupWriteFailures -= 1;
					throw new Error('Backup acknowledgement unavailable');
				}
				if (path.startsWith('workspaces/') && failWorkspaceWrites > 0) {
					failWorkspaceWrites -= 1;
					throw new Error('workspace write unavailable');
				}
			},
			async delete(path) {
				if (path.startsWith('backups/') && failBackupDeletes > 0) {
					failBackupDeletes -= 1;
					throw new Error('backup cleanup unavailable');
				}
				if (path.startsWith('workspaces/') && failWorkspaceDeletes > 0) {
					failWorkspaceDeletes -= 1;
					throw new Error('workspace cleanup unavailable');
				}
				files.delete(path);
			},
			async list(path) {
				return listChildren(files, path);
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

	it('accepts a complete catalog write whose acknowledgement fails', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		catalogWriteFailure = 'after';

		const persisted = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});

		expect(await storage.getWorkspace(saveFile.id)).toEqual(persisted);
	});

	it('ignores a partial inactive catalog and preserves the selected generation', async () => {
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
		catalogWriteFailure = 'partial';

		await expect(
			storage.putWorkspace({
				saveFileId: saveFile.id,
				bytes: new Uint8Array([3]),
				dirty: true,
				automaticBackupCreated: true,
				expectedUpdatedAt: persisted.updatedAt
			})
		).rejects.toThrow('catalog acknowledgement unavailable');

		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.getWorkspace(saveFile.id)).toEqual(persisted);
	});

	it('falls back only when the newest catalog envelope checksum is invalid', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});
		const newest = JSON.parse(files.get('catalog.0.json') as string) as { checksum: string };
		newest.checksum = '00000000';
		files.set('catalog.0.json', JSON.stringify(newest));

		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.listSaves()).toHaveLength(1);
		expect(await recreated.getWorkspace(saveFile.id)).toBeNull();
	});

	it('preserves an ambiguously acknowledged candidate for recreation', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		catalogWriteFailure = 'after';
		failCatalogReadback = true;

		await expect(
			storage.putWorkspace({
				saveFileId: saveFile.id,
				bytes: new Uint8Array([2]),
				dirty: true,
				automaticBackupCreated: false
			})
		).rejects.toThrow('catalog acknowledgement unavailable');

		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.getWorkspace(saveFile.id)).toMatchObject({
			bytes: new Uint8Array([2]),
			dirty: true
		});
	});

	it('survives a modified Workspace candidate and failed cleanup', async () => {
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
		failWorkspaceWrites = 1;
		failWorkspaceDeletes = 1;

		await expect(
			storage.putWorkspace({
				saveFileId: saveFile.id,
				bytes: new Uint8Array([3]),
				dirty: true,
				automaticBackupCreated: true,
				expectedUpdatedAt: persisted.updatedAt
			})
		).rejects.toThrow('workspace cleanup unavailable');

		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.getWorkspace(saveFile.id)).toEqual(persisted);
		expect(workspaceRevisionPaths(files)).toHaveLength(1);
	});

	it('does not turn post-commit cleanup failure into a failed Workspace write', async () => {
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
		failWorkspaceDeletes = 1;

		const second = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([3]),
			dirty: true,
			automaticBackupCreated: true,
			expectedUpdatedAt: first.updatedAt
		});

		expect(await storage.getWorkspace(saveFile.id)).toEqual(second);
		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.getWorkspace(saveFile.id)).toEqual(second);
		expect(workspaceRevisionPaths(files)).toHaveLength(1);
	});

	it('distinguishes a malformed committed-only catalog from a fresh store', async () => {
		files.set('catalog.0.json', '{"envelopeVersion":1');
		const recreated = new CapacitorSavesStorage({ fileStore });

		await expect(recreated.listSaves()).rejects.toThrow('native Saves catalog is malformed');
	});

	it('migrates legacy Workspace bytes before the first envelope commit', async () => {
		seedLegacyWorkspace(files);
		const recreated = new CapacitorSavesStorage({
			fileStore,
			now: () => '2026-05-16T12:00:00.000Z'
		});

		await recreated.setActiveSaveFileId('legacy-save');

		expect(await recreated.getWorkspace('legacy-save')).toMatchObject({
			bytes: new Uint8Array([7, 8]),
			dirty: true
		});
		expect(files.has('workspaces/legacy-save.bin')).toBe(false);
		expect(workspaceRevisionPaths(files)).toHaveLength(1);
	});

	it('retains the legacy generation when its Workspace copy fails', async () => {
		seedLegacyWorkspace(files);
		failWorkspaceWrites = 1;
		const recreated = new CapacitorSavesStorage({ fileStore });

		await expect(recreated.setActiveSaveFileId('legacy-save')).rejects.toThrow(
			'workspace write unavailable'
		);
		expect(await recreated.getWorkspace('legacy-save')).toMatchObject({
			bytes: new Uint8Array([7, 8]),
			dirty: true
		});
		expect(files.has('catalog.json')).toBe(true);
	});

	it('cleans failed automatic Backup bytes and creates one Backup after recreation', async () => {
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
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toEqual([]);

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
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toHaveLength(1);
	});

	it.each([
		['Workspace baseline read', () => (failWorkspaceReads = 1), 'workspace read unavailable'],
		['Workspace baseline write', () => (failWorkspaceWrites = 1), 'workspace write unavailable']
	])('cleans new Backup bytes after a failed %s', async (_label, fail, message) => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1, 2, 3]),
			originalFileName: null
		});
		const persisted = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([1, 2, 3]),
			dirty: false,
			automaticBackupCreated: false
		});
		fail();

		await expect(
			storage.ensureAutomaticBackup({
				saveFileId: saveFile.id,
				importedAt: saveFile.importedAt,
				expectedUpdatedAt: persisted.updatedAt,
				reason: 'inventory-editing'
			})
		).rejects.toThrow(message);
		expect(await storage.getWorkspace(saveFile.id)).toEqual(persisted);
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toEqual([]);
	});

	it('keeps the newest catalog authoritative when one Save byte file is unavailable', async () => {
		const first = await storage.importSave({ bytes: new Uint8Array([1]), originalFileName: null });
		const second = await storage.importSave({ bytes: new Uint8Array([2]), originalFileName: null });
		await storage.createBackup({
			id: 'second-backup',
			saveFileId: second.id,
			bytes: new Uint8Array([9]),
			reason: 'manual'
		});
		files.delete(`saves/${second.id}.bin`);

		const recreated = new CapacitorSavesStorage({ fileStore });
		expect((await recreated.listSaves()).map(({ id }) => id)).toEqual([first.id, second.id]);
		expect(await recreated.getSaveBytes(second.id)).toBeNull();
		expect(await recreated.listBackups(second.id)).toHaveLength(1);
		expect(files.has('backups/second-backup.bin')).toBe(true);
	});

	it('rejects missing bytes for the selected modern Workspace without using an older generation', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2, 3]),
			dirty: true,
			automaticBackupCreated: false
		});
		for (const path of workspaceRevisionPaths(files)) files.delete(path);

		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.listSaves()).toHaveLength(1);
		await expect(recreated.getWorkspace(saveFile.id)).rejects.toThrow(
			'persisted Workspace bytes are missing or truncated'
		);
	});

	it('deletes an unavailable Save whose modern Workspace and import bytes are missing', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});
		files.delete(`saves/${saveFile.id}.bin`);
		for (const path of workspaceRevisionPaths(files)) files.delete(path);

		await expect(storage.deleteSave(saveFile.id)).resolves.toBeUndefined();
		expect(await storage.getSave(saveFile.id)).toBeNull();
	});

	it('commits Workspace clearing before cleanup and sweeps its orphan after recreation', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: null
		});
		await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: false
		});
		failWorkspaceDeletes = 1;

		await expect(storage.clearWorkspace(saveFile.id)).resolves.toBeUndefined();
		expect(await storage.getWorkspace(saveFile.id)).toBeNull();
		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.getWorkspace(saveFile.id)).toBeNull();
		expect(workspaceRevisionPaths(files)).toEqual([]);
	});

	it('deletes identifiable interrupted automatic Backup bytes after cleanup failure', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1, 2, 3]),
			originalFileName: null
		});
		failCatalogWrites = 1;
		failBackupDeletes = 1;

		await expect(
			storage.ensureAutomaticBackup({
				saveFileId: saveFile.id,
				importedAt: saveFile.importedAt,
				expectedUpdatedAt: null,
				reason: 'inventory-editing'
			})
		).rejects.toThrow('backup cleanup unavailable');
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toHaveLength(1);

		await storage.deleteSave(saveFile.id);

		expect(await storage.getSave(saveFile.id)).toBeNull();
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toEqual([]);
	});

	it('retries one automatic Backup identity after orphan cleanup and recreation', async () => {
		const saveFile = await storage.importSave({
			bytes: new Uint8Array([1, 2, 3]),
			originalFileName: null
		});
		failCatalogWrites = 1;
		failBackupDeletes = 1;

		await expect(
			storage.ensureAutomaticBackup({
				saveFileId: saveFile.id,
				importedAt: saveFile.importedAt,
				expectedUpdatedAt: null,
				reason: 'inventory-editing'
			})
		).rejects.toThrow('backup cleanup unavailable');
		const [orphanPath] = [...files.keys()].filter((path) => path.startsWith('backups/'));

		const recreated = new CapacitorSavesStorage({
			fileStore,
			now: () => '2026-05-16T12:00:00.000Z'
		});
		await recreated.ensureAutomaticBackup({
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: null,
			reason: 'inventory-editing'
		});

		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toEqual([orphanPath]);
		expect(await recreated.listBackups(saveFile.id)).toHaveLength(1);
	});

	it('repairs a truncated uncatalogued automatic Backup on the same adapter retry', async () => {
		const baseline = new Uint8Array([1, 2, 3]);
		const saveFile = await storage.importSave({ bytes: baseline, originalFileName: null });
		const workspace = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: baseline,
			dirty: false,
			automaticBackupCreated: false
		});
		const input = {
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: workspace.updatedAt,
			reason: 'save-file-editing' as const
		};
		partialBackupWrites = 1;
		failBackupDeletes = 1;

		await expect(storage.ensureAutomaticBackup(input)).rejects.toThrow(
			'backup cleanup unavailable'
		);
		await expect(storage.ensureAutomaticBackup(input)).resolves.toMatchObject({
			established: true
		});

		const [backup] = await storage.listBackups(saveFile.id);
		expect(await storage.getBackupBytes(backup.id)).toEqual(baseline);
		expect((await storage.getWorkspace(saveFile.id))?.automaticBackupCreated).toBe(true);
		const recreated = new CapacitorSavesStorage({ fileStore });
		expect(await recreated.listBackups(saveFile.id)).toEqual([backup]);
		expect(await recreated.getBackupBytes(backup.id)).toEqual(baseline);
	});

	it('reuses a complete uncatalogued automatic Backup without a second byte write', async () => {
		const baseline = new Uint8Array([1, 2, 3]);
		const saveFile = await storage.importSave({ bytes: baseline, originalFileName: null });
		const workspace = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: baseline,
			dirty: false,
			automaticBackupCreated: false
		});
		const input = {
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: workspace.updatedAt,
			reason: 'save-file-editing' as const
		};
		completeBackupWriteFailures = 1;
		failBackupDeletes = 1;

		await expect(storage.ensureAutomaticBackup(input)).rejects.toThrow(
			'backup cleanup unavailable'
		);
		deniedBackupWrites = 1;
		await expect(storage.ensureAutomaticBackup(input)).resolves.toMatchObject({
			established: true
		});

		expect(deniedBackupWrites).toBe(1);
		const [backup] = await storage.listBackups(saveFile.id);
		expect(await storage.getBackupBytes(backup.id)).toEqual(baseline);
		expect((await storage.getWorkspace(saveFile.id))?.automaticBackupCreated).toBe(true);
	});

	it('preserves a complete pending automatic Backup through recreation and terminal deletion', async () => {
		const baseline = new Uint8Array([1, 2, 3]);
		const saveFile = await storage.importSave({ bytes: baseline, originalFileName: null });
		const workspace = await storage.putWorkspace({
			saveFileId: saveFile.id,
			bytes: baseline,
			dirty: false,
			automaticBackupCreated: false
		});
		const input = {
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			expectedUpdatedAt: workspace.updatedAt,
			reason: 'save-file-editing' as const
		};
		completeBackupWriteFailures = 1;
		failBackupDeletes = 1;
		await expect(storage.ensureAutomaticBackup(input)).rejects.toThrow(
			'backup cleanup unavailable'
		);

		const recreated = new CapacitorSavesStorage({ fileStore });
		await recreated.listSaves();
		deniedBackupWrites = 1;
		await expect(recreated.ensureAutomaticBackup(input)).resolves.toMatchObject({
			established: true
		});
		expect(deniedBackupWrites).toBe(1);
		const [backup] = await recreated.listBackups(saveFile.id);
		expect(await recreated.getBackupBytes(backup.id)).toEqual(baseline);

		await recreated.deleteSave(saveFile.id);
		expect(await recreated.getSave(saveFile.id)).toBeNull();
		expect([...files.keys()].filter((path) => path.startsWith('backups/'))).toEqual([]);
	});

	it('does not overwrite mismatched bytes for a catalogued automatic Backup identity', async () => {
		const baseline = new Uint8Array([1, 2, 3]);
		const saveFile = await storage.importSave({ bytes: baseline, originalFileName: null });
		const backupId = stableAutomaticBackupId({
			saveFileId: saveFile.id,
			importedAt: saveFile.importedAt,
			persistedRevision: saveFile.importedAt,
			bytes: baseline
		});
		await storage.createBackup({
			id: backupId,
			saveFileId: saveFile.id,
			bytes: new Uint8Array([9, 9, 9]),
			reason: 'save-file-editing'
		});

		await expect(
			storage.ensureAutomaticBackup({
				saveFileId: saveFile.id,
				importedAt: saveFile.importedAt,
				expectedUpdatedAt: null,
				reason: 'save-file-editing'
			})
		).rejects.toThrow('automatic Backup bytes do not match their identity');
		expect(await storage.getBackupBytes(backupId)).toEqual(new Uint8Array([9, 9, 9]));
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

function listChildren(files: Map<string, string | Uint8Array>, directory: string) {
	const prefix = `${directory}/`;
	return [
		...new Set(
			[...files.keys()]
				.filter((path) => path.startsWith(prefix))
				.map((path) => path.slice(prefix.length).split('/')[0])
		)
	];
}

function workspaceRevisionPaths(files: Map<string, string | Uint8Array>) {
	return [...files.keys()].filter((path) => path.startsWith('workspaces/revisions/'));
}

function seedLegacyWorkspace(files: Map<string, string | Uint8Array>) {
	const timestamp = '2026-05-16T12:00:00.000Z';
	files.set('saves/legacy-save.bin', new Uint8Array([1]));
	files.set('workspaces/legacy-save.bin', new Uint8Array([7, 8]));
	files.set(
		'catalog.json',
		JSON.stringify({
			version: 1,
			saves: [
				{
					id: 'legacy-save',
					originalFileName: null,
					byteLength: 1,
					importedAt: timestamp,
					updatedAt: timestamp
				}
			],
			backups: [],
			workspaces: {
				'legacy-save': {
					saveFileId: 'legacy-save',
					dirty: true,
					automaticBackupCreated: false,
					updatedAt: timestamp
				}
			},
			activeSaveFileId: 'legacy-save'
		})
	);
}
