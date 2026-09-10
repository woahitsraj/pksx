import {
	base64ToBytes,
	type EngineApi,
	type EngineErrorCode,
	type SaveFileEditOperation
} from '$lib/engine';
import {
	createCleanWorkspaceState,
	createPersistedWorkspaceState,
	type WorkspaceState
} from '$lib/pksx/backup-workflow';
import {
	bytesEqual,
	copyBytes,
	type SaveFileId,
	type SavesStorage,
	type StoredSaveFile,
	type StoredWorkspace
} from '$lib/pksx/saves';

export type SaveFileEditOrigin = {
	saveFileId: SaveFileId;
	workspaceId: string;
};

export type SaveFileEditRequest = {
	key: string;
	operation: SaveFileEditOperation;
};

export type SaveFileEditFailureCode =
	| EngineErrorCode
	| 'backup-write-failed'
	| 'workspace-persistence-failed'
	| 'stale-workspace'
	| 'save-file-deleted'
	| 'queued-operation-cancelled';

export type SaveFileEditResult =
	| {
			ok: true;
			status: 'committed' | 'noop';
			origin: SaveFileEditOrigin;
			workspace: WorkspaceState;
	  }
	| {
			ok: false;
			status: 'failed' | 'rejected' | 'cancelled';
			origin: SaveFileEditOrigin;
			code: SaveFileEditFailureCode;
			message: string;
			workspace?: WorkspaceState;
	  };

export type PendingSaveFileEdit = {
	key: string;
	sequence: number;
};

export type SaveFileEditCoordinatorOptions = {
	storage: SavesStorage;
	engine: EngineApi | (() => EngineApi);
	publish?: (workspace: WorkspaceState, activeBox: number) => void;
	isResultCurrent?: (origin: SaveFileEditOrigin) => boolean;
	createWorkspaceId?: (saveFileId: SaveFileId) => string;
};

type OriginRecord = {
	origin: SaveFileEditOrigin;
	file: StoredSaveFile;
	latest: WorkspaceState;
	activeBox: number;
	persistedRevision: string | null;
	storedRevision: string | null;
	tail: Promise<void>;
	generation: number;
	sequence: number;
	pending: Map<number, string>;
	listeners: Set<(pending: readonly PendingSaveFileEdit[]) => void>;
	terminal: boolean;
};

export class SaveFileEditCoordinator {
	private readonly recordsByWorkspaceId = new Map<string, OriginRecord>();
	private readonly currentBySaveFileId = new Map<SaveFileId, OriginRecord>();
	private readonly terminalSaveFiles = new Map<SaveFileId, string>();
	private readonly deletionPromises = new Map<string, Promise<void>>();
	private nextWorkspaceId = 1;

	constructor(private readonly options: SaveFileEditCoordinatorOptions) {}

	openWorkspace(
		workspace: WorkspaceState,
		activeBox = 0,
		options: { replace?: boolean } = {}
	): SaveFileEditOrigin {
		const current = this.currentBySaveFileId.get(workspace.file.id);
		const terminalImport = this.terminalSaveFiles.get(workspace.file.id);
		if (terminalImport === workspace.file.importedAt) {
			return (
				current?.origin ?? {
					saveFileId: workspace.file.id,
					workspaceId: `deleted:${workspace.file.id}:${workspace.file.importedAt}`
				}
			);
		}
		if (terminalImport) this.terminalSaveFiles.delete(workspace.file.id);
		if (
			!options.replace &&
			current &&
			!current.terminal &&
			current.file.importedAt === workspace.file.importedAt &&
			(bytesEqual(current.latest.bytes, workspace.bytes) || current.pending.size > 0)
		) {
			if (bytesEqual(current.latest.bytes, workspace.bytes)) {
				current.latest = copyWorkspace(workspace);
			}
			current.activeBox = activeBox;
			return current.origin;
		}

		if (current) current.generation += 1;
		const workspaceId =
			this.options.createWorkspaceId?.(workspace.file.id) ??
			`${workspace.file.id}:${this.nextWorkspaceId++}`;
		const origin = { saveFileId: workspace.file.id, workspaceId };
		const record: OriginRecord = {
			origin,
			file: workspace.file,
			latest: copyWorkspace(workspace),
			activeBox,
			persistedRevision: null,
			storedRevision: null,
			tail: Promise.resolve(),
			generation: 0,
			sequence: 0,
			pending: new Map(),
			listeners: new Set(),
			terminal: false
		};
		this.recordsByWorkspaceId.set(workspaceId, record);
		this.currentBySaveFileId.set(workspace.file.id, record);
		return origin;
	}

	replaceWorkspace(workspace: WorkspaceState, activeBox = 0) {
		return this.openWorkspace(workspace, activeBox, { replace: true });
	}

	isCurrent(origin: SaveFileEditOrigin) {
		return this.currentRecord(origin) !== null;
	}

	listPending(origin: SaveFileEditOrigin): readonly PendingSaveFileEdit[] {
		const record = this.record(origin);
		return record ? [...record.pending].map(([sequence, key]) => ({ key, sequence })) : [];
	}

	isPending(origin: SaveFileEditOrigin, key?: string) {
		const pending = this.listPending(origin);
		return key ? pending.some((operation) => operation.key === key) : pending.length > 0;
	}

	subscribePending(
		origin: SaveFileEditOrigin,
		listener: (pending: readonly PendingSaveFileEdit[]) => void
	) {
		const record = this.record(origin);
		if (!record) {
			listener([]);
			return () => undefined;
		}
		record.listeners.add(listener);
		listener(this.listPending(origin));
		return () => record.listeners.delete(listener);
	}

	enqueueEdit(origin: SaveFileEditOrigin, request: SaveFileEditRequest) {
		const record = this.currentRecord(origin);
		if (!record) return Promise.resolve(this.staleResult(origin));
		if (record.terminal || this.terminalSaveFiles.has(origin.saveFileId)) {
			return Promise.resolve(this.deletedResult(origin));
		}

		if (
			![...record.pending.values()].includes(request.key) &&
			operationIsNoop(record.latest, request.operation)
		) {
			return Promise.resolve({
				ok: true,
				status: 'noop',
				origin,
				workspace: copyWorkspace(record.latest)
			} satisfies SaveFileEditResult);
		}

		const generation = record.generation;
		const sequence = ++record.sequence;
		record.pending.set(sequence, request.key);
		this.notify(record);
		const result = record.tail.then(() => this.runEdit(record, request, generation));
		record.tail = result.then(
			() => undefined,
			() => undefined
		);
		return result.finally(() => {
			record.pending.delete(sequence);
			this.notify(record);
		});
	}

	export(origin: SaveFileEditOrigin): Promise<Uint8Array> {
		const record = this.currentRecord(origin);
		if (!record) return Promise.reject(new Error('The Save File Workspace changed before Export.'));
		if (record.terminal || this.terminalSaveFiles.has(origin.saveFileId)) {
			return Promise.reject(new Error('The Save File is being deleted.'));
		}

		const result = record.tail.then(async () => {
			if (!this.currentRecord(origin)) {
				throw new Error('The Save File Workspace changed before Export.');
			}
			const latest = await this.loadLatest(record);
			const serialized = await this.engine.serializeSave(
				latest.bytes,
				latest.file.originalFileName ?? undefined
			);
			if (!serialized.ok) throw serialized.error;
			if (!this.currentRecord(origin)) {
				throw new Error('The Save File Workspace changed during Export.');
			}
			return base64ToBytes(serialized.value.bytesBase64, serialized.value.byteLength);
		});
		record.tail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	deleteSave(saveFile: Pick<StoredSaveFile, 'id' | 'importedAt'>): Promise<void> {
		const saveFileId = saveFile.id;
		const deletionKey = `${saveFileId}\u0000${saveFile.importedAt}`;
		const existing = this.deletionPromises.get(deletionKey);
		if (existing) return existing;

		const record = this.currentBySaveFileId.get(saveFileId);
		if (record && record.file.importedAt !== saveFile.importedAt) return Promise.resolve();
		this.terminalSaveFiles.set(saveFileId, saveFile.importedAt);
		if (record) record.terminal = true;
		const deletion = (record?.tail ?? Promise.resolve()).then(async () => {
			const stored = await this.options.storage.getSave(saveFileId);
			if (!stored || stored.importedAt !== saveFile.importedAt) return;
			await this.options.storage.deleteSave(saveFileId);
			if (record && this.currentBySaveFileId.get(saveFileId) === record) {
				record.generation += 1;
				this.currentBySaveFileId.delete(saveFileId);
			}
		});
		this.deletionPromises.set(deletionKey, deletion);
		void deletion.catch(() => this.deletionPromises.delete(deletionKey));
		return deletion;
	}

	private async runEdit(
		record: OriginRecord,
		request: SaveFileEditRequest,
		generation: number
	): Promise<SaveFileEditResult> {
		if (generation !== record.generation) {
			return this.cancelledResult(record.origin, record.latest);
		}
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin);

		let latest: WorkspaceState;
		try {
			latest = await this.loadLatest(record);
		} catch (error) {
			return this.failedResult(record, generation, 'workspace-persistence-failed', error);
		}
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
		if (operationIsNoop(latest, request.operation)) {
			return { ok: true, status: 'noop', origin: record.origin, workspace: latest };
		}

		try {
			latest = await this.ensureAutomaticBackup(record, latest);
		} catch (error) {
			if (error instanceof StaleWorkspaceError) {
				return this.staleResult(record.origin, latest);
			}
			return this.failedResult(record, generation, 'backup-write-failed', error, latest);
		}
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);

		let mutation;
		try {
			mutation = await this.engine.applySaveFileEditOperation(
				latest.bytes,
				latest.file.originalFileName ?? undefined,
				request.operation,
				record.activeBox
			);
		} catch (error) {
			return {
				ok: false,
				status: 'failed',
				origin: record.origin,
				code: 'engine-unavailable',
				message: errorMessage(error),
				workspace: latest
			};
		}
		if (!mutation.ok) {
			return {
				ok: false,
				status:
					mutation.error.code === 'invalid-save-file-edit' ||
					mutation.error.code === 'unsupported-save-file-edit'
						? 'rejected'
						: 'failed',
				origin: record.origin,
				code: mutation.error.code,
				message: mutation.error.message,
				workspace: latest
			};
		}
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);

		let persistedBeforeResult;
		try {
			persistedBeforeResult = await this.options.storage.getWorkspace(record.file.id);
		} catch (error) {
			return this.failedResult(record, generation, 'workspace-persistence-failed', error, latest);
		}
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
		if (
			!persistedBeforeResult ||
			persistedBeforeResult.updatedAt !== record.storedRevision ||
			!bytesEqual(persistedBeforeResult.bytes, latest.bytes)
		) {
			return this.staleResult(record.origin, await this.loadLatest(record));
		}

		const next: WorkspaceState = {
			...latest,
			bytes: copyBytes(mutation.value.bytes),
			workspace: mutation.value.workspace,
			dirty: latest.dirty || mutation.value.mutated,
			restoredFromBackup: null
		};
		let stored: StoredWorkspace;
		try {
			stored = await this.options.storage.putWorkspace({
				saveFileId: next.file.id,
				bytes: next.bytes,
				dirty: next.dirty,
				automaticBackupCreated: next.automaticBackupCreated,
				expectedUpdatedAt: record.storedRevision
			});
		} catch (error) {
			if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
			let restored = latest;
			try {
				restored = await this.loadLatest(record);
			} catch {
				// Keep the last state known to have persisted when storage cannot be read back.
			}
			return this.failedResult(record, generation, 'workspace-persistence-failed', error, restored);
		}
		if (!this.currentRecord(record.origin)) {
			await this.restoreCurrentWorkspace(record.file.id, stored.updatedAt);
			return this.staleResult(record.origin, latest);
		}

		record.latest = copyWorkspace(next);
		record.persistedRevision = stored.updatedAt;
		record.storedRevision = stored.updatedAt;
		if (!this.resultIsCurrent(record)) return this.staleResult(record.origin, next);
		this.options.publish?.(copyWorkspace(next), record.activeBox);
		return { ok: true, status: 'committed', origin: record.origin, workspace: copyWorkspace(next) };
	}

	private async ensureAutomaticBackup(record: OriginRecord, workspace: WorkspaceState) {
		if (workspace.automaticBackupCreated) return workspace;
		const id = stableAutomaticBackupId(
			workspace,
			record.persistedRevision ?? workspace.file.importedAt
		);
		const existing = (await this.options.storage.listBackups(workspace.file.id)).find(
			(backup) => backup.id === id
		);
		if (!this.currentRecord(record.origin)) throw new StaleWorkspaceError();
		const existingBytes = existing ? await this.options.storage.getBackupBytes(id) : null;
		if (!this.currentRecord(record.origin)) throw new StaleWorkspaceError();
		if (!existing || !existingBytes || !bytesEqual(existingBytes, workspace.bytes)) {
			await this.options.storage.createBackup({
				id,
				saveFileId: workspace.file.id,
				bytes: workspace.bytes,
				reason: 'save-file-editing'
			});
		}
		if (!this.currentRecord(record.origin)) throw new StaleWorkspaceError();

		const next = { ...workspace, automaticBackupCreated: true };
		const stored = await this.options.storage.putWorkspace({
			saveFileId: next.file.id,
			bytes: next.bytes,
			dirty: next.dirty,
			automaticBackupCreated: true,
			expectedUpdatedAt: record.storedRevision
		});
		if (!this.currentRecord(record.origin)) {
			await this.restoreCurrentWorkspace(record.file.id, stored.updatedAt);
			throw new StaleWorkspaceError();
		}
		record.latest = copyWorkspace(next);
		record.persistedRevision = stored.updatedAt;
		record.storedRevision = stored.updatedAt;
		if (this.resultIsCurrent(record)) {
			this.options.publish?.(copyWorkspace(next), record.activeBox);
		}
		return next;
	}

	private async loadLatest(record: OriginRecord) {
		const file = await this.options.storage.getSave(record.file.id);
		if (!file || file.importedAt !== record.file.importedAt) {
			throw new Error('The Save File is no longer available.');
		}
		const persisted = await this.options.storage.getWorkspace(file.id);
		record.persistedRevision = persisted?.updatedAt ?? file.importedAt;
		record.storedRevision = persisted?.updatedAt ?? null;
		const bytes = persisted?.bytes ?? (await this.options.storage.getSaveBytes(file.id));
		if (!bytes) throw new Error('The Save File bytes are no longer available.');
		if (
			bytesEqual(record.latest.bytes, bytes) &&
			record.latest.dirty === (persisted?.dirty ?? false) &&
			record.latest.automaticBackupCreated === (persisted?.automaticBackupCreated ?? false)
		) {
			return copyWorkspace(record.latest);
		}

		const loaded = await this.engine.loadSaveWorkspace(
			bytes,
			file.originalFileName ?? undefined,
			record.activeBox
		);
		if (!loaded.ok) throw loaded.error;
		const workspace = persisted
			? createPersistedWorkspaceState({
					file,
					bytes,
					workspace: loaded.value,
					dirty: persisted.dirty,
					automaticBackupCreated: persisted.automaticBackupCreated
				})
			: createCleanWorkspaceState({ file, bytes, workspace: loaded.value });
		record.latest = copyWorkspace(workspace);
		return workspace;
	}

	private async restoreCurrentWorkspace(saveFileId: SaveFileId, staleRevision: string) {
		const current = this.currentBySaveFileId.get(saveFileId);
		if (!current || current.terminal || this.terminalSaveFiles.has(saveFileId)) return;
		try {
			const restored = await this.options.storage.putWorkspace({
				saveFileId,
				bytes: current.latest.bytes,
				dirty: current.latest.dirty,
				automaticBackupCreated: current.latest.automaticBackupCreated,
				expectedUpdatedAt: staleRevision
			});
			current.persistedRevision = restored.updatedAt;
			current.storedRevision = restored.updatedAt;
		} catch {
			// A newer Workspace revision won the race, so it must remain persisted.
		}
	}

	private failedResult(
		record: OriginRecord,
		generation: number,
		code: 'backup-write-failed' | 'workspace-persistence-failed',
		error: unknown,
		workspace = record.latest
	): SaveFileEditResult {
		if (record.generation === generation) record.generation += 1;
		return {
			ok: false,
			status: 'failed',
			origin: record.origin,
			code,
			message: errorMessage(error),
			workspace: copyWorkspace(workspace)
		};
	}

	private staleResult(origin: SaveFileEditOrigin, workspace?: WorkspaceState): SaveFileEditResult {
		return {
			ok: false,
			status: 'rejected',
			origin,
			code: 'stale-workspace',
			message: 'The Save File Workspace changed before this edit completed.',
			...(workspace ? { workspace: copyWorkspace(workspace) } : {})
		};
	}

	private deletedResult(origin: SaveFileEditOrigin): SaveFileEditResult {
		return {
			ok: false,
			status: 'rejected',
			origin,
			code: 'save-file-deleted',
			message: 'The Save File is being deleted.'
		};
	}

	private cancelledResult(
		origin: SaveFileEditOrigin,
		workspace: WorkspaceState
	): SaveFileEditResult {
		return {
			ok: false,
			status: 'cancelled',
			origin,
			code: 'queued-operation-cancelled',
			message: 'A previous Save File edit failed, so this queued edit was cancelled.',
			workspace: copyWorkspace(workspace)
		};
	}

	private record(origin: SaveFileEditOrigin) {
		const record = this.recordsByWorkspaceId.get(origin.workspaceId);
		return record?.origin.saveFileId === origin.saveFileId ? record : null;
	}

	private currentRecord(origin: SaveFileEditOrigin) {
		const record = this.record(origin);
		return record && this.currentBySaveFileId.get(origin.saveFileId) === record ? record : null;
	}

	private resultIsCurrent(record: OriginRecord) {
		return this.options.isResultCurrent?.(record.origin) ?? true;
	}

	private notify(record: OriginRecord) {
		const pending = this.listPending(record.origin);
		for (const listener of record.listeners) listener(pending);
	}

	private get engine() {
		return typeof this.options.engine === 'function' ? this.options.engine() : this.options.engine;
	}
}

class StaleWorkspaceError extends Error {}

export function stableAutomaticBackupId(workspace: WorkspaceState, persistedRevision: string) {
	const owner = hashString(
		`${workspace.file.id}\u0000${workspace.file.importedAt}\u0000${persistedRevision}`
	);
	const content = hashBytes(workspace.bytes);
	return `save-file-edit-${owner}-${workspace.bytes.byteLength}-${content}`;
}

function operationIsNoop(workspace: WorkspaceState, operation: SaveFileEditOperation) {
	const projection = workspace.workspace.saveFile;
	if (!projection) return false;
	let compared = false;

	if (operation.trainerProfile?.trainerName !== undefined) {
		compared = true;
		if (operation.trainerProfile.trainerName !== projection.trainerProfile.trainerName)
			return false;
	}
	if (operation.trainerProfile?.gender !== undefined) {
		compared = true;
		if (operation.trainerProfile.gender !== projection.trainerProfile.gender) return false;
	}
	if (operation.money !== undefined) {
		compared = true;
		if (operation.money !== projection.money.value) return false;
	}
	for (const edit of operation.inventory ?? []) {
		compared = true;
		const item = projection.inventory.pockets
			.find((pocket) => pocket.key === edit.pocket)
			?.items.find((candidate) => candidate.id === edit.itemId);
		if (edit.kind === 'remove' ? item : !item || item.quantity !== edit.quantity) return false;
	}

	return compared;
}

function copyWorkspace(workspace: WorkspaceState): WorkspaceState {
	return { ...workspace, file: { ...workspace.file }, bytes: copyBytes(workspace.bytes) };
}

function hashString(value: string) {
	return hashBytes(new TextEncoder().encode(value));
}

function hashBytes(bytes: Uint8Array) {
	let left = 0x811c9dc5;
	let right = 0x9e3779b9;
	for (const byte of bytes) {
		left = Math.imul(left ^ byte, 0x01000193);
		right = Math.imul(right ^ byte, 0x85ebca6b);
	}
	return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}

function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: typeof error === 'object' && error && 'message' in error
			? String(error.message)
			: String(error);
}
