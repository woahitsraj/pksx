import {
	bytesEqual,
	copyBytes,
	type BackupMetadata,
	type BackupId,
	type BackupReason,
	type SavesStorage,
	type StoredSaveFile,
	WorkspaceRevisionConflictError
} from '$lib/pksx/saves';
import type { EngineApi, SaveWorkspace } from '$lib/engine';

export type RestoredBackupSource = {
	id: BackupId;
	createdAt: string;
	reason: BackupReason;
};

export type WorkspaceState = {
	file: StoredSaveFile;
	bytes: Uint8Array;
	workspace: SaveWorkspace;
	dirty: boolean;
	restoredFromBackup: RestoredBackupSource | null;
	automaticBackupCreated: boolean;
};

export type CreateWorkspaceStateInput = {
	file: StoredSaveFile;
	bytes: Uint8Array;
	workspace: SaveWorkspace;
};

export function createCleanWorkspaceState(input: CreateWorkspaceStateInput): WorkspaceState {
	return {
		file: input.file,
		bytes: copyBytes(input.bytes),
		workspace: input.workspace,
		dirty: false,
		restoredFromBackup: null,
		automaticBackupCreated: false
	};
}

export type PersistedWorkspaceStateInput = CreateWorkspaceStateInput & {
	dirty: boolean;
	automaticBackupCreated: boolean;
};

export function createPersistedWorkspaceState(input: PersistedWorkspaceStateInput): WorkspaceState {
	return {
		file: input.file,
		bytes: copyBytes(input.bytes),
		workspace: input.workspace,
		dirty: input.dirty,
		restoredFromBackup: null,
		automaticBackupCreated: input.automaticBackupCreated
	};
}

export type RestoreBackupInput = CreateWorkspaceStateInput & {
	source: RestoredBackupSource;
	currentSaveBytes: Uint8Array;
};

export function createRestoredWorkspaceState(input: RestoreBackupInput): WorkspaceState {
	return {
		file: input.file,
		bytes: copyBytes(input.bytes),
		workspace: input.workspace,
		dirty: !bytesEqual(input.bytes, input.currentSaveBytes),
		restoredFromBackup: input.source,
		automaticBackupCreated: false
	};
}

export function preserveRestoredWorkspaceAsSave(
	state: WorkspaceState,
	file: StoredSaveFile
): WorkspaceState {
	return {
		...state,
		file,
		dirty: false,
		restoredFromBackup: null,
		automaticBackupCreated: false
	};
}

export function markAutomaticBackupCreated(state: WorkspaceState): WorkspaceState {
	return {
		...state,
		automaticBackupCreated: true
	};
}

export function shouldCreateAutomaticBackup(state: WorkspaceState): boolean {
	return !state.automaticBackupCreated;
}

export type PreparedAutomaticBackup = {
	state: WorkspaceState;
	revision: string;
	established: boolean;
};

export async function prepareAutomaticBackup(input: {
	storage: SavesStorage;
	state: WorkspaceState;
	reason: BackupReason;
}): Promise<PreparedAutomaticBackup> {
	const owner = await requireSaveFileOwner(input.storage, input.state.file);
	const persisted = await input.storage.getWorkspace(owner.id);
	const bytes = persisted?.bytes ?? (await input.storage.getSaveBytes(owner.id));
	if (!bytes) throw new Error('The Save File bytes are no longer available.');
	if (!bytesEqual(bytes, input.state.bytes) || (persisted?.dirty ?? false) !== input.state.dirty) {
		throw new WorkspaceRevisionConflictError();
	}

	const prepared = await input.storage.ensureAutomaticBackup({
		saveFileId: owner.id,
		importedAt: owner.importedAt,
		expectedUpdatedAt: persisted?.updatedAt ?? null,
		reason: input.reason
	});
	if (
		!bytesEqual(prepared.workspace.bytes, bytes) ||
		prepared.workspace.dirty !== input.state.dirty
	) {
		throw new WorkspaceRevisionConflictError();
	}
	return {
		state: markAutomaticBackupCreated({ ...input.state, file: owner }),
		revision: prepared.workspace.updatedAt,
		established: prepared.established
	};
}

export function createRestoredSaveFileName(fileName: string | null) {
	if (!fileName) return 'pksx-restored.sav';
	const lastDot = fileName.lastIndexOf('.');
	return lastDot <= 0
		? `${fileName}.restored`
		: `${fileName.slice(0, lastDot)}.restored${fileName.slice(lastDot)}`;
}

export async function createManualBackup(input: {
	storage: SavesStorage;
	owner: StoredSaveFile;
	workspaceBytes: Uint8Array;
}): Promise<BackupMetadata> {
	await requireSaveFileOwner(input.storage, input.owner);
	return input.storage.createBackup({
		saveFileId: input.owner.id,
		bytes: copyBytes(input.workspaceBytes),
		reason: 'manual'
	});
}

export async function restoreBackupToWorkspace(input: {
	storage: SavesStorage;
	engine: EngineApi;
	owner: StoredSaveFile;
	backup: BackupMetadata;
	box: number;
	publish: (state: WorkspaceState, box: number) => void;
}): Promise<WorkspaceState> {
	const activeSaveFileId = await input.storage.getActiveSaveFileId();
	if (activeSaveFileId !== input.owner.id) {
		throw new Error('The active Save File changed while the Backup Browser was open.');
	}

	const owner = await requireSaveFileOwner(input.storage, input.owner);
	await requireBackupOwner(input.storage, owner, input.backup);
	const [backupBytes, currentSaveBytes] = await Promise.all([
		input.storage.getBackupBytes(input.backup.id),
		input.storage.getSaveBytes(owner.id)
	]);
	if (!backupBytes) throw new Error('The selected Backup bytes are missing.');
	if (!currentSaveBytes) throw new Error('The original Save File bytes are missing.');

	const loaded = await input.engine.loadSaveWorkspace(
		backupBytes,
		owner.originalFileName ?? undefined,
		input.box
	);
	if (!loaded.ok) throw loaded.error;

	const state = createRestoredWorkspaceState({
		file: owner,
		bytes: backupBytes,
		workspace: loaded.value,
		currentSaveBytes,
		source: {
			id: input.backup.id,
			createdAt: input.backup.createdAt,
			reason: input.backup.reason
		}
	});
	await persistWorkspace(input.storage, state);
	input.publish(state, input.box);
	return state;
}

export async function preserveBackupAsSeparateSave(input: {
	storage: SavesStorage;
	engine: EngineApi;
	owner: StoredSaveFile;
	backup: BackupMetadata;
	fileName: string;
	box: number;
	publish: (state: WorkspaceState, box: number) => void;
}): Promise<WorkspaceState> {
	const owner = await requireSaveFileOwner(input.storage, input.owner);
	await requireBackupOwner(input.storage, owner, input.backup);
	const backupBytes = await input.storage.getBackupBytes(input.backup.id);
	if (!backupBytes) throw new Error('The selected Backup bytes are missing.');

	const loaded = await input.engine.loadSaveWorkspace(backupBytes, input.fileName, input.box);
	if (!loaded.ok) throw loaded.error;

	const file = await input.storage.importSave({
		bytes: backupBytes,
		originalFileName: input.fileName
	});
	const restored = createRestoredWorkspaceState({
		file: owner,
		bytes: backupBytes,
		workspace: loaded.value,
		currentSaveBytes: backupBytes,
		source: {
			id: input.backup.id,
			createdAt: input.backup.createdAt,
			reason: input.backup.reason
		}
	});
	const state = preserveRestoredWorkspaceAsSave(restored, file);
	await persistWorkspace(input.storage, state);
	input.publish(state, input.box);
	return state;
}

export async function deleteOwnedBackup(input: {
	storage: SavesStorage;
	owner: StoredSaveFile;
	backup: BackupMetadata;
}): Promise<void> {
	const owner = await requireSaveFileOwner(input.storage, input.owner);
	await requireBackupOwner(input.storage, owner, input.backup);
	await input.storage.deleteBackup(input.backup.id);
}

async function requireSaveFileOwner(storage: SavesStorage, owner: StoredSaveFile) {
	const current = await storage.getSave(owner.id);
	if (!current || current.importedAt !== owner.importedAt) {
		throw new Error('The selected Save File is no longer available.');
	}
	return current;
}

async function requireBackupOwner(
	storage: SavesStorage,
	owner: StoredSaveFile,
	backup: BackupMetadata
) {
	const current = (await storage.listBackups(owner.id)).find(({ id }) => id === backup.id);
	if (!current || current.saveFileId !== owner.id || backup.saveFileId !== owner.id) {
		throw new Error('The selected Backup is no longer available for this Save File.');
	}
	return current;
}

async function persistWorkspace(storage: SavesStorage, state: WorkspaceState) {
	await storage.putWorkspace({
		saveFileId: state.file.id,
		bytes: state.bytes,
		dirty: state.dirty,
		automaticBackupCreated: state.automaticBackupCreated
	});
}
