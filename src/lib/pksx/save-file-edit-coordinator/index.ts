import {
	base64ToBytes,
	type EngineApi,
	type EngineErrorCode,
	type SaveFileEditOperation
} from '$lib/engine';
import {
	createCleanWorkspaceState,
	createPersistedWorkspaceState,
	prepareAutomaticBackup,
	type WorkspaceState
} from '$lib/pksx/backup-workflow';
import {
	bytesEqual,
	copyBytes,
	type SaveFileId,
	type SavesStorage,
	type StoredSaveFile,
	type StoredWorkspace,
	WorkspaceRevisionConflictError
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

export type SaveFileWorkspaceRecoveryResult =
	| {
			ok: true;
			status: 'accepted';
			origin: SaveFileEditOrigin;
			workspace: WorkspaceState;
	  }
	| {
			ok: false;
			status: 'rejected';
			origin: SaveFileEditOrigin;
			code: 'stale-workspace' | 'save-file-deleted';
			message: string;
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
};

type OriginRecord = {
	origin: SaveFileEditOrigin;
	file: StoredSaveFile;
	latest: WorkspaceState;
	activeBox: number;
	storedRevision: string | null;
	tail: Promise<void>;
	generation: number;
	sequence: number;
	pending: Map<number, string>;
	listeners: Set<(pending: readonly PendingSaveFileEdit[]) => void>;
	terminal: boolean;
};

type WorkspaceRecoveryAuthority = {
	activeSaveFileId: SaveFileId | null;
	file: StoredSaveFile | null;
	persisted: StoredWorkspace | null;
	bytes: Uint8Array | null;
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
		const workspaceId = `${workspace.file.id}:${this.nextWorkspaceId++}`;
		const origin = { saveFileId: workspace.file.id, workspaceId };
		const record: OriginRecord = {
			origin,
			file: workspace.file,
			latest: copyWorkspace(workspace),
			activeBox,
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

	async recoverWorkspace(
		origin: SaveFileEditOrigin,
		options: { isCurrent: () => boolean }
	): Promise<SaveFileWorkspaceRecoveryResult> {
		const caller = this.record(origin);
		if (!caller || !options.isCurrent()) return this.recoveryRejected(origin, 'stale-workspace');
		if (this.importIsTerminal(caller.file)) {
			return this.recoveryRejected(origin, 'save-file-deleted');
		}
		const target = this.currentBySaveFileId.get(origin.saveFileId);
		if (!target || target.file.importedAt !== caller.file.importedAt) {
			return this.recoveryRejected(origin, 'stale-workspace');
		}
		const initialOwner = await this.readRecoveryOwner(caller.file.id);
		if (!initialOwner.file) return this.recoveryRejected(origin, 'save-file-deleted');
		if (
			initialOwner.activeSaveFileId !== caller.file.id ||
			initialOwner.file.importedAt !== caller.file.importedAt ||
			!options.isCurrent()
		) {
			return this.recoveryRejected(origin, 'stale-workspace');
		}

		for (;;) {
			const tails = this.sameImportRecords(caller.file).map((record) => ({
				record,
				tail: record.tail
			}));
			await Promise.all(tails.map(({ tail }) => tail));
			if (!options.isCurrent()) return this.recoveryRejected(origin, 'stale-workspace');
			if (this.importIsTerminal(caller.file)) {
				return this.recoveryRejected(origin, 'save-file-deleted');
			}
			if (this.currentBySaveFileId.get(origin.saveFileId) !== target) {
				return this.recoveryRejected(origin, 'stale-workspace');
			}
			if (tails.some(({ record, tail }) => record.tail !== tail)) continue;

			const settledTail = target.tail;
			const activeBox = target.activeBox;
			const before = await this.readRecoveryAuthority(caller.file);
			const rejected = this.validateRecoveryAuthority(origin, caller.file, target, before, options);
			if (rejected) return rejected;
			if (!before.file) return this.recoveryRejected(origin, 'save-file-deleted');
			if (!before.bytes) throw new Error('The Save File bytes are no longer available.');

			const loaded = await this.engine.loadSaveWorkspace(
				copyBytes(before.bytes),
				before.file.originalFileName ?? undefined,
				activeBox
			);
			if (!loaded.ok) throw loaded.error;

			const after = await this.readRecoveryAuthority(caller.file);
			const afterRejection = this.validateRecoveryAuthority(
				origin,
				caller.file,
				target,
				after,
				options
			);
			if (afterRejection) return afterRejection;
			if (!after.file) return this.recoveryRejected(origin, 'save-file-deleted');
			if (!after.bytes) throw new Error('The Save File bytes are no longer available.');
			if (target.tail !== settledTail || target.activeBox !== activeBox) continue;
			if (!sameRecoveryAuthority(before, after)) continue;

			const workspace = after.persisted
				? createPersistedWorkspaceState({
						file: after.file,
						bytes: after.bytes,
						workspace: loaded.value,
						dirty: after.persisted.dirty,
						automaticBackupCreated: after.persisted.automaticBackupCreated
					})
				: createCleanWorkspaceState({
						file: after.file,
						bytes: after.bytes,
						workspace: loaded.value
					});
			if (
				!options.isCurrent() ||
				this.currentBySaveFileId.get(origin.saveFileId) !== target ||
				target.tail !== settledTail ||
				target.activeBox !== activeBox ||
				this.importIsTerminal(caller.file)
			) {
				return this.recoveryRejected(
					origin,
					this.importIsTerminal(caller.file) ? 'save-file-deleted' : 'stale-workspace'
				);
			}

			const acceptedOrigin = this.replaceWorkspace(workspace, activeBox);
			const accepted = this.currentRecord(acceptedOrigin)!;
			accepted.storedRevision = after.persisted?.updatedAt ?? null;
			this.options.publish?.(copyWorkspace(workspace), activeBox);
			return {
				ok: true,
				status: 'accepted',
				origin: acceptedOrigin,
				workspace: copyWorkspace(workspace)
			};
		}
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
		const deletion = (record?.tail ?? Promise.resolve())
			.then(async () => {
				const stored = await this.options.storage.getSave(saveFileId);
				if (!stored || stored.importedAt !== saveFile.importedAt) return;
				await this.options.storage.deleteSave(saveFileId);
				if (record && this.currentBySaveFileId.get(saveFileId) === record) {
					record.generation += 1;
					this.currentBySaveFileId.delete(saveFileId);
				}
			})
			.catch(async (error: unknown) => {
				this.deletionPromises.delete(deletionKey);
				let survivingImport = false;
				try {
					survivingImport =
						(await this.options.storage.getSave(saveFileId))?.importedAt === saveFile.importedAt;
				} catch {
					// Keep the terminal lock while storage availability remains unknown.
				}
				if (
					survivingImport &&
					this.terminalSaveFiles.get(saveFileId) === saveFile.importedAt &&
					(!record || this.currentBySaveFileId.get(saveFileId) === record)
				) {
					this.terminalSaveFiles.delete(saveFileId);
					if (record) record.terminal = false;
				}
				throw error;
			});
		this.deletionPromises.set(deletionKey, deletion);
		return deletion;
	}

	private async runEdit(
		record: OriginRecord,
		request: SaveFileEditRequest,
		generation: number
	): Promise<SaveFileEditResult> {
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin);
		if (generation !== record.generation) {
			return this.cancelledResult(record.origin, record.latest);
		}

		let latest: WorkspaceState;
		try {
			latest = await this.loadLatest(record);
		} catch (error) {
			if (!this.currentRecord(record.origin)) return this.staleResult(record.origin);
			return this.failedResult(record, generation, 'workspace-persistence-failed', error);
		}
		if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
		if (operationIsNoop(latest, request.operation)) {
			if (!this.resultIsCurrent(record)) return this.staleResult(record.origin, latest);
			return { ok: true, status: 'noop', origin: record.origin, workspace: latest };
		}

		return this.applyAgainstLatest(record, request, generation, latest);
	}

	private async applyAgainstLatest(
		record: OriginRecord,
		request: SaveFileEditRequest,
		generation: number,
		initial: WorkspaceState
	): Promise<SaveFileEditResult> {
		let latest = initial;
		for (;;) {
			try {
				latest = await this.ensureAutomaticBackup(record, latest);
			} catch (error) {
				if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
				if (error instanceof StaleWorkspaceError) {
					return this.staleResult(record.origin, latest);
				}
				if (error instanceof WorkspaceRevisionConflictError) {
					const reloaded = await this.reloadAfterConcurrentWrite(
						record,
						generation,
						request,
						latest
					);
					if ('result' in reloaded) return reloaded.result;
					latest = reloaded.workspace;
					continue;
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
				if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
				return {
					ok: false,
					status: 'failed',
					origin: record.origin,
					code: 'engine-unavailable',
					message: errorMessage(error),
					workspace: latest
				};
			}
			if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
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

			let persistedBeforeResult;
			try {
				persistedBeforeResult = await this.options.storage.getWorkspace(record.file.id);
			} catch (error) {
				if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
				return this.failedResult(record, generation, 'workspace-persistence-failed', error, latest);
			}
			if (!this.currentRecord(record.origin)) return this.staleResult(record.origin, latest);
			if (
				!persistedBeforeResult ||
				persistedBeforeResult.updatedAt !== record.storedRevision ||
				!bytesEqual(persistedBeforeResult.bytes, latest.bytes)
			) {
				const reloaded = await this.reloadAfterConcurrentWrite(record, generation, request, latest);
				if ('result' in reloaded) return reloaded.result;
				latest = reloaded.workspace;
				continue;
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
				if (error instanceof WorkspaceRevisionConflictError) {
					const reloaded = await this.reloadAfterConcurrentWrite(
						record,
						generation,
						request,
						latest
					);
					if ('result' in reloaded) return reloaded.result;
					latest = reloaded.workspace;
					continue;
				}
				let restored = latest;
				try {
					restored = await this.loadLatest(record);
				} catch {
					// Keep the last state known to have persisted when storage cannot be read back.
				}
				return this.failedResult(
					record,
					generation,
					'workspace-persistence-failed',
					error,
					restored
				);
			}
			if (!this.currentRecord(record.origin)) {
				try {
					await this.restoreCurrentWorkspace(record.file.id, stored.updatedAt);
				} catch (error) {
					return this.recoveryFailure(record.origin, error);
				}
				return this.staleResult(record.origin, latest);
			}

			record.latest = copyWorkspace(next);
			record.storedRevision = stored.updatedAt;
			if (!this.resultIsCurrent(record)) return this.staleResult(record.origin, next);
			this.options.publish?.(copyWorkspace(next), record.activeBox);
			return {
				ok: true,
				status: 'committed',
				origin: record.origin,
				workspace: copyWorkspace(next)
			};
		}
	}

	private async reloadAfterConcurrentWrite(
		record: OriginRecord,
		generation: number,
		request: SaveFileEditRequest,
		fallback: WorkspaceState
	): Promise<{ workspace: WorkspaceState } | { result: SaveFileEditResult }> {
		let latest: WorkspaceState;
		try {
			latest = await this.loadLatest(record);
		} catch (error) {
			if (!this.currentRecord(record.origin)) {
				return { result: this.staleResult(record.origin, fallback) };
			}
			return {
				result: this.failedResult(
					record,
					generation,
					'workspace-persistence-failed',
					error,
					fallback
				)
			};
		}
		if (!this.currentRecord(record.origin)) {
			return { result: this.staleResult(record.origin, latest) };
		}
		if (operationIsNoop(latest, request.operation)) {
			if (!this.resultIsCurrent(record)) {
				return { result: this.staleResult(record.origin, latest) };
			}
			return {
				result: {
					ok: true,
					status: 'noop',
					origin: record.origin,
					workspace: copyWorkspace(latest)
				}
			};
		}
		return { workspace: latest };
	}

	private async ensureAutomaticBackup(record: OriginRecord, workspace: WorkspaceState) {
		const prepared = await prepareAutomaticBackup({
			storage: this.options.storage,
			state: workspace,
			reason: 'save-file-editing'
		});
		if (!this.currentRecord(record.origin)) {
			throw new StaleWorkspaceError();
		}
		record.latest = copyWorkspace(prepared.state);
		record.storedRevision = prepared.revision;
		return prepared.state;
	}

	private async loadLatest(record: OriginRecord) {
		const file = await this.options.storage.getSave(record.file.id);
		if (!file || file.importedAt !== record.file.importedAt) {
			throw new Error('The Save File is no longer available.');
		}
		const persisted = await this.options.storage.getWorkspace(file.id);
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
			current.storedRevision = restored.updatedAt;
		} catch (error) {
			if (error instanceof WorkspaceRevisionConflictError) return;
			throw new StaleWorkspaceRecoveryError(error);
		}
	}

	private sameImportRecords(file: Pick<StoredSaveFile, 'id' | 'importedAt'>) {
		return [...this.recordsByWorkspaceId.values()].filter(
			(record) => record.file.id === file.id && record.file.importedAt === file.importedAt
		);
	}

	private importIsTerminal(file: Pick<StoredSaveFile, 'id' | 'importedAt'>) {
		const current = this.currentBySaveFileId.get(file.id);
		return (
			this.terminalSaveFiles.get(file.id) === file.importedAt ||
			(current?.file.importedAt === file.importedAt && current.terminal)
		);
	}

	private async readRecoveryAuthority(file: Pick<StoredSaveFile, 'id' | 'importedAt'>) {
		const [{ activeSaveFileId, file: storedFile }, persisted] = await Promise.all([
			this.readRecoveryOwner(file.id),
			this.options.storage.getWorkspace(file.id)
		]);
		const bytes = persisted?.bytes ?? (await this.options.storage.getSaveBytes(file.id));
		if (!bytes && storedFile) throw new Error('The Save File bytes are no longer available.');
		return { activeSaveFileId, file: storedFile, persisted, bytes: bytes && copyBytes(bytes) };
	}

	private async readRecoveryOwner(saveFileId: SaveFileId) {
		const [activeSaveFileId, file] = await Promise.all([
			this.options.storage.getActiveSaveFileId(),
			this.options.storage.getSave(saveFileId)
		]);
		return { activeSaveFileId, file };
	}

	private validateRecoveryAuthority(
		origin: SaveFileEditOrigin,
		file: Pick<StoredSaveFile, 'id' | 'importedAt'>,
		target: OriginRecord,
		authority: WorkspaceRecoveryAuthority,
		options: { isCurrent: () => boolean }
	): Extract<SaveFileWorkspaceRecoveryResult, { ok: false }> | null {
		if (this.importIsTerminal(file) || !authority.file) {
			return this.recoveryRejected(origin, 'save-file-deleted');
		}
		if (
			!options.isCurrent() ||
			authority.activeSaveFileId !== file.id ||
			authority.file.importedAt !== file.importedAt ||
			this.currentBySaveFileId.get(file.id) !== target ||
			target.file.importedAt !== file.importedAt
		) {
			return this.recoveryRejected(origin, 'stale-workspace');
		}
		return null;
	}

	private recoveryRejected(
		origin: SaveFileEditOrigin,
		code: 'stale-workspace' | 'save-file-deleted'
	): Extract<SaveFileWorkspaceRecoveryResult, { ok: false }> {
		return {
			ok: false,
			status: 'rejected',
			origin,
			code,
			message:
				code === 'save-file-deleted'
					? 'The Save File is being deleted.'
					: 'The Save File Workspace changed before recovery completed.'
		};
	}

	private recoveryFailure(origin: SaveFileEditOrigin, error: unknown): SaveFileEditResult {
		const cause = error instanceof StaleWorkspaceRecoveryError ? error.cause : error;
		return {
			ok: false,
			status: 'failed',
			origin,
			code: 'workspace-persistence-failed',
			message: `The current Workspace could not be restored after a stale write. ${errorMessage(cause)}`
		};
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

class StaleWorkspaceRecoveryError extends Error {
	constructor(readonly cause?: unknown) {
		super('The current Workspace could not be restored after a stale write.');
	}
}

function sameRecoveryAuthority(
	left: WorkspaceRecoveryAuthority,
	right: WorkspaceRecoveryAuthority
) {
	return (
		left.activeSaveFileId === right.activeSaveFileId &&
		left.file?.importedAt === right.file?.importedAt &&
		left.persisted?.updatedAt === right.persisted?.updatedAt &&
		(left.persisted?.dirty ?? false) === (right.persisted?.dirty ?? false) &&
		(left.persisted?.automaticBackupCreated ?? false) ===
			(right.persisted?.automaticBackupCreated ?? false) &&
		((left.bytes === null && right.bytes === null) ||
			(left.bytes !== null && right.bytes !== null && bytesEqual(left.bytes, right.bytes)))
	);
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

function errorMessage(error: unknown) {
	return error instanceof Error
		? error.message
		: typeof error === 'object' && error && 'message' in error
			? String(error.message)
			: String(error);
}
