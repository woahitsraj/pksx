import { describe, expect, it } from 'vitest';
import type { EngineApi, SaveWorkspace } from '$lib/engine';
import type { BackupMetadata, SavesStorage, StoredSaveFile } from '$lib/pksx/saves';
import {
	createCleanWorkspaceState,
	createManualBackup,
	createRestoredWorkspaceState,
	preserveBackupAsSeparateSave,
	preserveRestoredWorkspaceAsSave,
	restoreBackupToWorkspace,
	shouldCreateAutomaticBackup,
	markAutomaticBackupCreated,
	type WorkspaceState
} from './index';

const workspace: SaveWorkspace = {
	summary: {
		fileName: 'emerald.sav',
		saveType: 'SAV3',
		gameVersion: 'E',
		gameVersionId: 3,
		generation: 3,
		trainerName: 'CASS',
		trainerId: 41203,
		playTime: '47:12',
		playedHours: 47,
		playedMinutes: 12,
		partyCount: 1,
		boxCount: 14,
		boxSlotCount: 30
	},
	partySlots: [],
	boxSlots: []
};

const saveFile: StoredSaveFile = {
	id: 'save-1',
	originalFileName: 'emerald.sav',
	byteLength: 4,
	importedAt: '2026-05-28T10:00:00.000Z',
	updatedAt: '2026-05-28T10:00:00.000Z'
};

const backup: BackupMetadata = {
	id: 'backup-1',
	saveFileId: saveFile.id,
	reason: 'manual',
	byteLength: 4,
	createdAt: '2026-05-28T11:00:00.000Z'
};

function storageStub(overrides: Partial<SavesStorage> = {}): SavesStorage {
	return {
		getActiveSaveFileId: async () => saveFile.id,
		getSave: async () => saveFile,
		getSaveBytes: async () => new Uint8Array([1, 2, 3, 4]),
		getBackupBytes: async () => new Uint8Array([9, 9, 9, 9]),
		listBackups: async () => [backup],
		createBackup: async () => backup,
		putWorkspace: async (input) => ({ ...input, updatedAt: '2026-05-28T11:00:00.000Z' }),
		importSave: async () => ({
			...saveFile,
			id: 'save-2',
			originalFileName: 'emerald.restored.sav'
		}),
		...overrides
	} as SavesStorage;
}

function engineStub(): EngineApi {
	return {
		loadSaveWorkspace: async () => ({ ok: true, value: workspace, error: null })
	} as unknown as EngineApi;
}

describe('backup workflow', () => {
	it('creates clean workspace state for a loaded save file', () => {
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const state = createCleanWorkspaceState({ file: saveFile, bytes, workspace });
		bytes[0] = 99;

		expect(state.dirty).toBe(false);
		expect(state.restoredFromBackup).toBeNull();
		expect(state.automaticBackupCreated).toBe(false);
		expect(state.bytes).toStrictEqual(new Uint8Array([1, 2, 3, 4]));
	});

	it('marks restored backup state dirty when it differs from the save artifact', () => {
		const state = createRestoredWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([9, 9, 9, 9]),
			currentSaveBytes: new Uint8Array([1, 2, 3, 4]),
			workspace,
			source: {
				id: 'backup-1',
				createdAt: '2026-05-28T11:00:00.000Z',
				reason: 'manual'
			}
		});

		expect(state.dirty).toBe(true);
		expect(state.restoredFromBackup?.id).toBe('backup-1');
	});

	it('keeps restored state clean when backup bytes match the save artifact', () => {
		const state = createRestoredWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([1, 2, 3, 4]),
			currentSaveBytes: new Uint8Array([1, 2, 3, 4]),
			workspace,
			source: {
				id: 'backup-1',
				createdAt: '2026-05-28T11:00:00.000Z',
				reason: 'manual'
			}
		});

		expect(state.dirty).toBe(false);
	});

	it('clears restored dirty state after preserving as a separate save file', () => {
		const restored = createRestoredWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([9, 9, 9, 9]),
			currentSaveBytes: new Uint8Array([1, 2, 3, 4]),
			workspace,
			source: {
				id: 'backup-1',
				createdAt: '2026-05-28T11:00:00.000Z',
				reason: 'manual'
			}
		});
		const separateSave = { ...saveFile, id: 'save-2' };

		const preserved = preserveRestoredWorkspaceAsSave(restored, separateSave);

		expect(preserved.file.id).toBe('save-2');
		expect(preserved.dirty).toBe(false);
		expect(preserved.restoredFromBackup).toBeNull();
	});

	it('creates at most one automatic backup per workspace state', () => {
		const state = createCleanWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([1, 2, 3, 4]),
			workspace
		});

		expect(shouldCreateAutomaticBackup(state)).toBe(true);
		expect(shouldCreateAutomaticBackup(markAutomaticBackupCreated(state))).toBe(false);
	});

	it('creates a manual Backup from the explicit owner and exact supplied Workspace bytes', async () => {
		const writes: { saveFileId: string; bytes: number[] }[] = [];
		const workspaceBytes = new Uint8Array([8, 7, 6, 5]);
		const selectedOwner = { ...saveFile, id: 'selected-save' };
		const storage = storageStub({
			getSave: async (id) => (id === selectedOwner.id ? selectedOwner : null),
			createBackup: async (input) => {
				writes.push({ saveFileId: input.saveFileId, bytes: [...input.bytes] });
				return { ...backup, id: 'manual-selected', saveFileId: input.saveFileId };
			}
		});

		await createManualBackup({ storage, owner: selectedOwner, workspaceBytes });
		workspaceBytes[0] = 0;

		expect(writes).toEqual([{ saveFileId: 'selected-save', bytes: [8, 7, 6, 5] }]);
	});

	it('restores owner-bound Backup bytes without changing the imported Save File', async () => {
		const workspaces: number[][] = [];
		const publications: WorkspaceState[] = [];
		let importedBytesRead = 0;
		const storage = storageStub({
			getSaveBytes: async () => {
				importedBytesRead += 1;
				return new Uint8Array([1, 2, 3, 4]);
			},
			putWorkspace: async (input) => {
				workspaces.push([...input.bytes]);
				return { ...input, updatedAt: '2026-05-28T11:00:00.000Z' };
			}
		});

		const restored = await restoreBackupToWorkspace({
			storage,
			engine: engineStub(),
			owner: saveFile,
			backup,
			box: 3,
			publish: (state) => publications.push(state)
		});

		expect(importedBytesRead).toBe(1);
		expect(workspaces).toEqual([[9, 9, 9, 9]]);
		expect(restored).toMatchObject({ file: { id: 'save-1' }, dirty: true });
		expect(publications).toEqual([restored]);
	});

	it('rejects stale owners and missing Backup bytes before mutation', async () => {
		let writes = 0;
		const stale = storageStub({
			getSave: async () => ({ ...saveFile, importedAt: 'later' }),
			createBackup: async () => {
				writes += 1;
				return backup;
			}
		});
		const missing = storageStub({
			getBackupBytes: async () => null,
			putWorkspace: async (input) => {
				writes += 1;
				return { ...input, updatedAt: 'now' };
			}
		});

		await expect(
			createManualBackup({ storage: stale, owner: saveFile, workspaceBytes: new Uint8Array([1]) })
		).rejects.toThrow('no longer available');
		await expect(
			restoreBackupToWorkspace({
				storage: missing,
				engine: engineStub(),
				owner: saveFile,
				backup,
				box: 0,
				publish: () => undefined
			})
		).rejects.toThrow('bytes are missing');
		expect(writes).toBe(0);
	});

	it('preserves a Backup as a clean separately owned Workspace', async () => {
		const publications: WorkspaceState[] = [];
		const storage = storageStub();

		const preserved = await preserveBackupAsSeparateSave({
			storage,
			engine: engineStub(),
			owner: saveFile,
			backup,
			fileName: 'emerald.restored.sav',
			box: 0,
			publish: (state) => publications.push(state)
		});

		expect(preserved).toMatchObject({ file: { id: 'save-2' }, dirty: false });
		expect(publications).toEqual([preserved]);
	});
});
