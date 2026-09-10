import { describe, expect, it, vi } from 'vitest';
import type {
	EngineApi,
	SaveFileEditOperation,
	SaveFileEditableProjection,
	SaveWorkspace
} from '$lib/engine';
import { createPersistedWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import type {
	BackupMetadata,
	PutWorkspaceInput,
	SavesStorage,
	StoredSaveFile,
	StoredWorkspace
} from '$lib/pksx/saves';
import { SaveFileEditCoordinator } from '.';

type Harness = ReturnType<typeof createHarness>;

function createHarness(...states: WorkspaceState[]) {
	const files = new Map(states.map((state) => [state.file.id, { ...state.file }]));
	const imported = new Map(states.map((state) => [state.file.id, new Uint8Array(state.bytes)]));
	const workspaces = new Map<string, StoredWorkspace>(
		states.map((state) => [
			state.file.id,
			{
				saveFileId: state.file.id,
				bytes: new Uint8Array(state.bytes),
				dirty: state.dirty,
				automaticBackupCreated: state.automaticBackupCreated,
				updatedAt: '2026-09-10T12:00:00.000Z'
			}
		])
	);
	const backups = new Map<string, { metadata: BackupMetadata; bytes: Uint8Array }>();
	let timestamp = 1;

	const storage = {
		getSave: vi.fn(async (id: string) => files.get(id) ?? null),
		getSaveBytes: vi.fn(async (id: string) => imported.get(id) ?? null),
		getWorkspace: vi.fn(async (id: string) => {
			const stored = workspaces.get(id);
			return stored ? { ...stored, bytes: new Uint8Array(stored.bytes) } : null;
		}),
		putWorkspace: vi.fn(async (input: PutWorkspaceInput) => {
			const previous = workspaces.get(input.saveFileId);
			if (
				input.expectedUpdatedAt !== undefined &&
				(previous?.updatedAt ?? null) !== input.expectedUpdatedAt
			) {
				throw new Error('The persisted Workspace changed before this write.');
			}
			const stored = {
				saveFileId: input.saveFileId,
				bytes: new Uint8Array(input.bytes),
				dirty: input.dirty,
				automaticBackupCreated: input.automaticBackupCreated,
				updatedAt: `2026-09-10T12:00:0${timestamp++}.000Z`
			};
			workspaces.set(input.saveFileId, stored);
			return stored;
		}),
		createBackup: vi.fn(async (input) => {
			const metadata: BackupMetadata = {
				id: input.id ?? `backup-${backups.size + 1}`,
				saveFileId: input.saveFileId,
				reason: input.reason,
				byteLength: input.bytes.byteLength,
				createdAt: '2026-09-10T12:00:00.000Z'
			};
			backups.set(metadata.id, { metadata, bytes: new Uint8Array(input.bytes) });
			return metadata;
		}),
		listBackups: vi.fn(async (id: string) =>
			[...backups.values()]
				.map(({ metadata }) => metadata)
				.filter((backup) => backup.saveFileId === id)
		),
		getBackupBytes: vi.fn(async (id: string) => backups.get(id)?.bytes ?? null),
		deleteSave: vi.fn(async (id: string) => {
			files.delete(id);
			imported.delete(id);
			workspaces.delete(id);
			for (const [backupId, { metadata }] of backups) {
				if (metadata.saveFileId === id) backups.delete(backupId);
			}
		}),
		importSave: vi.fn(),
		listSaves: vi.fn(),
		clearWorkspace: vi.fn(),
		getPokemonStorage: vi.fn(),
		putPokemonStorage: vi.fn(),
		getActiveSaveFileId: vi.fn(),
		setActiveSaveFileId: vi.fn(),
		deleteBackup: vi.fn(),
		exportSave: vi.fn()
	} satisfies SavesStorage;

	const engine = {
		loadSaveWorkspace: vi.fn(async (bytes: Uint8Array, fileName?: string) => {
			const source = states.find((state) => state.file.originalFileName === fileName) ?? states[0];
			return { ok: true, value: { ...source.workspace }, error: null } as const;
		}),
		applySaveFileEditOperation: vi.fn(
			async (bytes: Uint8Array, _fileName: string | undefined, operation: SaveFileEditOperation) =>
				mutationResult(states, bytes, operation)
		),
		serializeSave: vi.fn(async (bytes: Uint8Array) => ({
			ok: true,
			value: { bytesBase64: Buffer.from(bytes).toString('base64'), byteLength: bytes.byteLength },
			error: null
		}))
	} as unknown as EngineApi;

	return { storage, engine, files, workspaces, backups };
}

function mutationResult(
	states: WorkspaceState[],
	bytes: Uint8Array,
	operation: SaveFileEditOperation
) {
	const source = states.find((state) => state.bytes[0] === bytes[0]) ?? states[0];
	const projection = source.workspace.saveFile!;
	const nextProjection: SaveFileEditableProjection = {
		...projection,
		trainerProfile: { ...projection.trainerProfile, ...operation.trainerProfile },
		money: {
			...projection.money,
			value: operation.money ?? projection.money.value
		}
	};
	const nextWorkspace: SaveWorkspace = {
		...source.workspace,
		summary: {
			...source.workspace.summary,
			trainerName: operation.trainerProfile?.trainerName ?? source.workspace.summary.trainerName
		},
		saveFile: nextProjection
	};
	states.push({ ...source, bytes: new Uint8Array([bytes[0] + 1]), workspace: nextWorkspace });
	return {
		ok: true,
		value: { bytes: new Uint8Array([bytes[0] + 1]), mutated: true, workspace: nextWorkspace },
		error: null
	} as const;
}

function workspace(id = 'save-1', byte = 1, automaticBackupCreated = false): WorkspaceState {
	const file: StoredSaveFile = {
		id,
		originalFileName: `${id}.sav`,
		byteLength: 1,
		importedAt: `2026-09-10T10:00:0${byte}.000Z`,
		updatedAt: '2026-09-10T10:00:00.000Z'
	};
	const saveFile: SaveFileEditableProjection = {
		trainerProfile: {
			trainerName: 'RED',
			trainerNameSupported: true,
			trainerNameMaxLength: 7,
			trainerNameUnsupportedReason: null,
			gender: 'male',
			genderSupported: true,
			genderUnsupportedReason: null,
			trainerId: 1,
			gameVersion: 'E',
			generation: 3
		},
		money: { value: 100, min: 0, max: 999999, supported: true, unsupportedReason: null },
		inventory: {
			supported: true,
			unsupportedReason: null,
			pockets: [
				{
					key: 'Items',
					label: 'Items',
					capacity: 20,
					full: false,
					unsupportedReason: null,
					items: [{ id: 1, name: 'Potion', quantity: 2, maxQuantity: 99 }]
				}
			]
		}
	};
	return createPersistedWorkspaceState({
		file,
		bytes: new Uint8Array([byte]),
		workspace: {
			summary: {
				saveType: 'SAV3E',
				gameVersion: 'E',
				gameVersionId: 3,
				generation: 3,
				trainerName: 'RED',
				trainerId: 1,
				playTime: '1:00',
				playedHours: 1,
				playedMinutes: 0,
				partyCount: 0,
				boxCount: 1,
				boxSlotCount: 30
			},
			partySlots: [],
			boxSlots: [],
			saveFile
		},
		dirty: false,
		automaticBackupCreated
	});
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return { promise, resolve, reject };
}

function coordinator(harness: Harness) {
	return new SaveFileEditCoordinator({ storage: harness.storage, engine: harness.engine });
}

describe('Save File edit coordinator', () => {
	it('serializes concurrent fields FIFO against the latest persisted Workspace', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const firstGate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation)
			.mockImplementationOnce(() => firstGate.promise)
			.mockImplementationOnce(async (bytes, _fileName, operation) =>
				mutationResult([state], bytes, operation)
			);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const first = edits.enqueueEdit(origin, {
			key: 'trainer-name',
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});
		const second = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });

		await vi.waitFor(() =>
			expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalledTimes(1)
		);
		expect(edits.listPending(origin).map(({ key }) => key)).toEqual(['trainer-name', 'money']);
		firstGate.resolve(
			mutationResult([state], state.bytes, { trainerProfile: { trainerName: 'BLUE' } })
		);
		await expect(first).resolves.toMatchObject({ ok: true, status: 'committed' });
		await expect(second).resolves.toMatchObject({ ok: true, status: 'committed' });
		expect(vi.mocked(harness.engine.applySaveFileEditOperation).mock.calls[1][0]).toEqual(
			new Uint8Array([2])
		);
	});

	it('runs different Save File origins independently', async () => {
		const firstState = workspace('save-1', 1, true);
		const secondState = workspace('save-2', 5, true);
		const harness = createHarness(firstState, secondState);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation)
			.mockImplementationOnce(() => gate.promise)
			.mockImplementationOnce(async (bytes, _fileName, operation) =>
				mutationResult([secondState], bytes, operation)
			);
		const edits = coordinator(harness);
		const first = edits.enqueueEdit(edits.openWorkspace(firstState), {
			key: 'money',
			operation: { money: 200 }
		});
		const second = edits.enqueueEdit(edits.openWorkspace(secondState), {
			key: 'money',
			operation: { money: 300 }
		});

		await vi.waitFor(() =>
			expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalledTimes(2)
		);
		await expect(second).resolves.toMatchObject({ ok: true });
		gate.resolve(mutationResult([firstState], firstState.bytes, { money: 200 }));
		await expect(first).resolves.toMatchObject({ ok: true });
	});

	it('short-circuits a known no-op before pending state, Engine, Backup, or persistence', async () => {
		const state = workspace('save-1', 1);
		const harness = createHarness(state);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const pending: number[] = [];
		edits.subscribePending(origin, (operations) => pending.push(operations.length));

		await expect(
			edits.enqueueEdit(origin, { key: 'money', operation: { money: 100 } })
		).resolves.toMatchObject({ ok: true, status: 'noop' });
		expect(pending).toEqual([0]);
		expect(harness.engine.loadSaveWorkspace).not.toHaveBeenCalled();
		expect(harness.engine.applySaveFileEditOperation).not.toHaveBeenCalled();
		expect(harness.storage.createBackup).not.toHaveBeenCalled();
		expect(harness.storage.putWorkspace).not.toHaveBeenCalled();
	});

	it('evaluates a queued apparent no-op after its predecessor', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const first = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		const second = edits.enqueueEdit(origin, { key: 'money', operation: { money: 100 } });
		gate.resolve(mutationResult([state], state.bytes, { money: 200 }));

		await expect(first).resolves.toMatchObject({ ok: true, status: 'committed' });
		await expect(second).resolves.toMatchObject({ ok: true, status: 'committed' });
		expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalledTimes(2);
	});

	it('keeps a known no-op out of the queue while a different field is pending', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const first = edits.enqueueEdit(origin, {
			key: 'trainer-name',
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});

		await expect(
			edits.enqueueEdit(origin, { key: 'money', operation: { money: 100 } })
		).resolves.toMatchObject({ ok: true, status: 'noop' });
		expect(edits.listPending(origin).map(({ key }) => key)).toEqual(['trainer-name']);
		gate.resolve(mutationResult([state], state.bytes, { trainerProfile: { trainerName: 'BLUE' } }));
		await first;
		expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalledTimes(1);
	});

	it('creates one automatic Backup and reuses it across later edits', async () => {
		const state = workspace();
		const harness = createHarness(state);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);

		await edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		await edits.enqueueEdit(origin, {
			key: 'trainer-name',
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});

		expect(harness.storage.createBackup).toHaveBeenCalledTimes(1);
		expect(harness.storage.createBackup).toHaveBeenCalledWith(
			expect.objectContaining({
				reason: 'save-file-editing',
				id: expect.stringMatching(/^save-file-edit-/)
			})
		);
	});

	it('reconciles the stable Backup identity after an interrupted attempt and recreation', async () => {
		const state = workspace();
		const harness = createHarness(state);
		vi.mocked(harness.storage.putWorkspace).mockRejectedValueOnce(new Error('interrupted'));
		const firstCoordinator = coordinator(harness);
		const failed = await firstCoordinator.enqueueEdit(firstCoordinator.openWorkspace(state), {
			key: 'money',
			operation: { money: 200 }
		});
		expect(failed).toMatchObject({ ok: false, code: 'backup-write-failed' });
		const backupId = vi.mocked(harness.storage.createBackup).mock.calls[0][0].id;

		const recreated = coordinator(harness);
		const retried = await recreated.enqueueEdit(recreated.openWorkspace(state), {
			key: 'money',
			operation: { money: 200 }
		});
		expect(retried).toMatchObject({ ok: true, status: 'committed' });
		expect(harness.storage.createBackup).toHaveBeenCalledTimes(1);
		expect([...harness.backups.keys()]).toEqual([backupId]);
	});

	it('uses the persisted revision to distinguish a byte-identical restored Workspace', async () => {
		const state = workspace();
		const harness = createHarness(state);
		vi.mocked(harness.storage.putWorkspace).mockRejectedValueOnce(new Error('interrupted'));
		const firstCoordinator = coordinator(harness);
		await firstCoordinator.enqueueEdit(firstCoordinator.openWorkspace(state), {
			key: 'money',
			operation: { money: 200 }
		});
		const firstId = vi.mocked(harness.storage.createBackup).mock.calls[0][0].id;
		harness.workspaces.set(state.file.id, {
			...harness.workspaces.get(state.file.id)!,
			updatedAt: '2026-09-10T13:00:00.000Z'
		});

		const restoredCoordinator = coordinator(harness);
		await restoredCoordinator.enqueueEdit(restoredCoordinator.openWorkspace(state), {
			key: 'money',
			operation: { money: 200 }
		});
		const secondId = vi.mocked(harness.storage.createBackup).mock.calls[1][0].id;
		expect(secondId).not.toBe(firstId);
	});

	it('prevents mutation and cancels queued edits when Backup creation fails', async () => {
		const state = workspace();
		const harness = createHarness(state);
		const gate = deferred<BackupMetadata>();
		vi.mocked(harness.storage.createBackup).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const first = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		const second = edits.enqueueEdit(origin, {
			key: 'trainer-name',
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});
		gate.reject(new Error('backup unavailable'));

		await expect(first).resolves.toMatchObject({ ok: false, code: 'backup-write-failed' });
		await expect(second).resolves.toMatchObject({
			ok: false,
			status: 'cancelled',
			code: 'queued-operation-cancelled'
		});
		expect(harness.engine.applySaveFileEditOperation).not.toHaveBeenCalled();
	});

	it('restores the last persisted Workspace and cancels later edits after persistence failure', async () => {
		const state = workspace();
		const harness = createHarness(state);
		vi.mocked(harness.storage.putWorkspace)
			.mockImplementationOnce(async (input) => {
				const stored = { ...input, bytes: new Uint8Array(input.bytes), updatedAt: 'backup-marker' };
				harness.workspaces.set(input.saveFileId, stored);
				return stored;
			})
			.mockRejectedValueOnce(new Error('workspace unavailable'));
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const first = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		const second = edits.enqueueEdit(origin, {
			key: 'trainer-name',
			operation: { trainerProfile: { trainerName: 'BLUE' } }
		});

		await expect(first).resolves.toMatchObject({
			ok: false,
			code: 'workspace-persistence-failed',
			workspace: { bytes: new Uint8Array([1]), automaticBackupCreated: true }
		});
		await expect(second).resolves.toMatchObject({ ok: false, status: 'cancelled' });
		expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalledTimes(1);
	});

	it('invalidates an old origin after explicit byte-identical Workspace replacement', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const oldOrigin = edits.openWorkspace(state);
		const pending = edits.enqueueEdit(oldOrigin, { key: 'money', operation: { money: 200 } });
		await vi.waitFor(() => expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalled());
		const newOrigin = edits.replaceWorkspace({ ...state, bytes: new Uint8Array(state.bytes) });
		gate.resolve(mutationResult([state], state.bytes, { money: 200 }));

		expect(newOrigin.workspaceId).not.toBe(oldOrigin.workspaceId);
		await expect(pending).resolves.toMatchObject({ ok: false, code: 'stale-workspace' });
		expect(harness.storage.putWorkspace).not.toHaveBeenCalled();
	});

	it('does not publish stale state when identity changes during the Backup write', async () => {
		const state = workspace();
		const harness = createHarness(state);
		const backupGate = deferred<BackupMetadata>();
		vi.mocked(harness.storage.createBackup).mockImplementationOnce(() => backupGate.promise);
		const publish = vi.fn();
		const edits = new SaveFileEditCoordinator({
			storage: harness.storage,
			engine: harness.engine,
			publish
		});
		const origin = edits.openWorkspace(state);
		const pending = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		await vi.waitFor(() => expect(harness.storage.createBackup).toHaveBeenCalled());
		edits.replaceWorkspace({ ...state, bytes: new Uint8Array(state.bytes) });
		backupGate.resolve({
			id: 'backup',
			saveFileId: state.file.id,
			reason: 'save-file-editing',
			byteLength: 1,
			createdAt: '2026-09-10T12:00:00.000Z'
		});

		await expect(pending).resolves.toMatchObject({ ok: false, code: 'stale-workspace' });
		expect(harness.storage.putWorkspace).not.toHaveBeenCalled();
		expect(publish).not.toHaveBeenCalled();
	});

	it('restores the replacement and does not publish when identity changes during final persistence', async () => {
		const state = workspace('save-1', 1, true);
		const replacement = { ...state, bytes: new Uint8Array([9]) };
		const harness = createHarness(state);
		const putGate = deferred<StoredWorkspace>();
		vi.mocked(harness.storage.putWorkspace).mockImplementationOnce(async (input) => {
			const stored = await putGate.promise;
			harness.workspaces.set(input.saveFileId, stored);
			return stored;
		});
		const publish = vi.fn();
		const edits = new SaveFileEditCoordinator({
			storage: harness.storage,
			engine: harness.engine,
			publish
		});
		const origin = edits.openWorkspace(state);
		const pending = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		await vi.waitFor(() => expect(harness.storage.putWorkspace).toHaveBeenCalledTimes(1));
		edits.replaceWorkspace(replacement);
		putGate.resolve({
			saveFileId: state.file.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: true,
			updatedAt: 'stale-write'
		});

		await expect(pending).resolves.toMatchObject({ ok: false, code: 'stale-workspace' });
		expect(harness.workspaces.get(state.file.id)?.bytes).toEqual(new Uint8Array([9]));
		expect(publish).not.toHaveBeenCalled();
	});

	it('does not overwrite a newer replacement while recovering from a stale final write', async () => {
		const state = workspace('save-1', 1, true);
		const replacement = { ...state, bytes: new Uint8Array([9]) };
		const harness = createHarness(state);
		const putGate = deferred<StoredWorkspace>();
		vi.mocked(harness.storage.putWorkspace)
			.mockImplementationOnce(async (input) => {
				const stored = await putGate.promise;
				harness.workspaces.set(input.saveFileId, stored);
				return stored;
			})
			.mockImplementationOnce(async (input) => {
				harness.workspaces.set(state.file.id, {
					saveFileId: state.file.id,
					bytes: replacement.bytes,
					dirty: false,
					automaticBackupCreated: true,
					updatedAt: 'newer-replacement'
				});
				throw new Error(`Revision ${input.expectedUpdatedAt} lost the race.`);
			});
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const pending = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		await vi.waitFor(() => expect(harness.storage.putWorkspace).toHaveBeenCalledTimes(1));
		edits.replaceWorkspace(replacement);
		putGate.resolve({
			saveFileId: state.file.id,
			bytes: new Uint8Array([2]),
			dirty: true,
			automaticBackupCreated: true,
			updatedAt: 'stale-write'
		});

		await expect(pending).resolves.toMatchObject({ ok: false, code: 'stale-workspace' });
		expect(harness.workspaces.get(state.file.id)?.bytes).toEqual(new Uint8Array([9]));
		expect(harness.workspaces.get(state.file.id)?.updatedAt).toBe('newer-replacement');
	});

	it('persists an origin after the active Save changes without publishing into the new destination', async () => {
		const firstState = workspace('save-1', 1, true);
		const secondState = workspace('save-2', 5, true);
		const harness = createHarness(firstState, secondState);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		let activeSaveFileId = firstState.file.id;
		const publish = vi.fn();
		const edits = new SaveFileEditCoordinator({
			storage: harness.storage,
			engine: harness.engine,
			publish,
			isResultCurrent: ({ saveFileId }) => saveFileId === activeSaveFileId
		});
		const firstOrigin = edits.openWorkspace(firstState);
		const pending = edits.enqueueEdit(firstOrigin, { key: 'money', operation: { money: 200 } });
		await vi.waitFor(() => expect(harness.engine.applySaveFileEditOperation).toHaveBeenCalled());
		activeSaveFileId = secondState.file.id;
		edits.openWorkspace(secondState);
		gate.resolve(mutationResult([firstState], firstState.bytes, { money: 200 }));

		await expect(pending).resolves.toMatchObject({ ok: false, code: 'stale-workspace' });
		expect(harness.workspaces.get(firstState.file.id)?.bytes).toEqual(new Uint8Array([2]));
		expect(publish).not.toHaveBeenCalled();
	});

	it('converts rejected Engine promises into failures without losing the persisted Workspace', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		vi.mocked(harness.engine.applySaveFileEditOperation).mockRejectedValueOnce(
			new Error('worker stopped')
		);
		const edits = coordinator(harness);
		const result = await edits.enqueueEdit(edits.openWorkspace(state), {
			key: 'money',
			operation: { money: 200 }
		});

		expect(result).toMatchObject({ ok: false, code: 'engine-unavailable' });
		expect(harness.workspaces.get(state.file.id)?.bytes).toEqual(new Uint8Array([1]));
	});

	it('lets a remounted destination recover and observe pending state', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const pending = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		const remountedOrigin = edits.openWorkspace({ ...state, bytes: new Uint8Array(state.bytes) });
		const observations: number[] = [];
		edits.subscribePending(remountedOrigin, (operations) => observations.push(operations.length));

		expect(remountedOrigin).toEqual(origin);
		expect(edits.isPending(remountedOrigin, 'money')).toBe(true);
		gate.resolve(mutationResult([state], state.bytes, { money: 200 }));
		await pending;
		expect(observations).toEqual([1, 0]);
	});

	it('waits for prior edits and exports the resulting persisted Workspace', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const pending = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		const exported = edits.export(origin);
		expect(harness.engine.serializeSave).not.toHaveBeenCalled();
		gate.resolve(mutationResult([state], state.bytes, { money: 200 }));

		await pending;
		await expect(exported).resolves.toEqual(new Uint8Array([2]));
		expect(harness.engine.serializeSave).toHaveBeenCalledWith(new Uint8Array([2]), 'save-1.sav');
	});

	it('rejects an Export result when its Workspace identity changes during serialization', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<{
			ok: true;
			value: { bytesBase64: string; byteLength: number };
			error: null;
		}>();
		vi.mocked(harness.engine.serializeSave).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const exported = edits.export(origin);
		await vi.waitFor(() => expect(harness.engine.serializeSave).toHaveBeenCalled());
		edits.replaceWorkspace({ ...state, bytes: new Uint8Array(state.bytes) });
		gate.resolve({
			ok: true,
			value: { bytesBase64: Buffer.from(state.bytes).toString('base64'), byteLength: 1 },
			error: null
		});

		await expect(exported).rejects.toThrow('Workspace changed during Export');
	});

	it('queues deletion after confirmed edits and rejects every later operation', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const gate = deferred<ReturnType<typeof mutationResult>>();
		vi.mocked(harness.engine.applySaveFileEditOperation).mockImplementationOnce(() => gate.promise);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		const edit = edits.enqueueEdit(origin, { key: 'money', operation: { money: 200 } });
		const deletion = edits.deleteSave(state.file);
		const remountedOrigin = edits.openWorkspace({ ...state, bytes: new Uint8Array(state.bytes) });
		await expect(
			edits.enqueueEdit(remountedOrigin, {
				key: 'trainer-name',
				operation: { trainerProfile: { trainerName: 'BLUE' } }
			})
		).resolves.toMatchObject({ ok: false, code: 'save-file-deleted' });
		expect(harness.storage.deleteSave).not.toHaveBeenCalled();
		gate.resolve(mutationResult([state], state.bytes, { money: 200 }));

		await edit;
		await deletion;
		expect(harness.storage.deleteSave).toHaveBeenCalledWith('save-1');
		expect(harness.files.has('save-1')).toBe(false);
		expect(harness.workspaces.has('save-1')).toBe(false);
		expect(harness.backups.size).toBe(0);
	});

	it('keeps a deleted import terminal while allowing a new import that reuses its ID', async () => {
		const state = workspace('save-1', 1, true);
		const harness = createHarness(state);
		const edits = coordinator(harness);
		const origin = edits.openWorkspace(state);
		await edits.deleteSave(state.file);
		const staleRemount = edits.openWorkspace({ ...state, bytes: new Uint8Array(state.bytes) });
		await expect(
			edits.enqueueEdit(staleRemount, { key: 'money', operation: { money: 200 } })
		).resolves.toMatchObject({ ok: false });

		const reimported = workspace('save-1', 5, true);
		harness.files.set(reimported.file.id, reimported.file);
		harness.workspaces.set(reimported.file.id, {
			saveFileId: reimported.file.id,
			bytes: reimported.bytes,
			dirty: false,
			automaticBackupCreated: true,
			updatedAt: 'reimported'
		});
		const newOrigin = edits.openWorkspace(reimported);

		expect(newOrigin.workspaceId).not.toBe(origin.workspaceId);
		await expect(
			edits.enqueueEdit(newOrigin, { key: 'money', operation: { money: 200 } })
		).resolves.toMatchObject({ ok: true, status: 'committed' });
		await edits.deleteSave(state.file);
		expect(harness.storage.deleteSave).toHaveBeenCalledTimes(1);
		expect(harness.files.has('save-1')).toBe(true);
		await edits.deleteSave(reimported.file);
		expect(harness.storage.deleteSave).toHaveBeenCalledTimes(2);
		expect(harness.files.has('save-1')).toBe(false);
	});
});
