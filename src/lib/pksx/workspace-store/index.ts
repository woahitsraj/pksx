import { base64ToBytes, type EngineApi, type SaveWorkspace } from '$lib/engine';
import {
	createCleanWorkspaceState,
	createPersistedWorkspaceState,
	type WorkspaceState
} from '$lib/pksx/backup-workflow';
import type { SavesStorage, SaveFileId, StoredSaveFile } from '$lib/pksx/saves';
import { createStore, type Store } from 'tinybase';
import type { WorkspaceStorePersistence } from './persistence';
import {
	WORKSPACE_PARSER_VERSION,
	WORKSPACE_SCHEMA_VERSION,
	workspaceTablesSchema,
	workspaceValuesSchema
} from './schema';

type WorkspaceArtifactContext = {
	file: StoredSaveFile;
	bytes: Uint8Array;
	entityBytesBySlot: Map<string, string | null | undefined>;
};

export type ActiveWorkspaceServiceOptions = {
	storage: SavesStorage;
	engine: EngineApi | (() => EngineApi);
	persistence?: WorkspaceStorePersistence;
};

export class ActiveWorkspaceService {
	readonly store: Store;
	private artifact: WorkspaceArtifactContext | null = null;
	private persistQueue = Promise.resolve();

	constructor(private readonly options: ActiveWorkspaceServiceOptions) {
		this.store = createStore()
			.setTablesSchema(workspaceTablesSchema)
			.setValuesSchema(workspaceValuesSchema);
	}

	async start() {
		const content = await this.options.persistence?.load();
		if (content) this.store.setContent(content);
		this.store.setValues({
			schemaVersion: WORKSPACE_SCHEMA_VERSION,
			parserVersion: WORKSPACE_PARSER_VERSION
		});
	}

	get current() {
		return this.read();
	}

	subscribe(listener: (state: WorkspaceState | null) => void) {
		const notify = () => listener(this.read());
		const tablesListener = this.store.addTablesListener(notify);
		const valuesListener = this.store.addValuesListener(notify);
		notify();
		return () => {
			this.store.delListener(tablesListener);
			this.store.delListener(valuesListener);
		};
	}

	async hydrate(saveFileId: SaveFileId, activeBox = 0) {
		const state = await this.load(saveFileId, activeBox);
		if (state) this.set(state, activeBox);
		return state;
	}

	async load(saveFileId: SaveFileId, activeBox = 0) {
		const [file, saveBytes, persisted] = await Promise.all([
			this.options.storage.getSave(saveFileId),
			this.options.storage.getSaveBytes(saveFileId),
			this.options.storage.getWorkspace(saveFileId)
		]);
		if (!file || !saveBytes) return null;

		const bytes = persisted?.bytes ?? saveBytes;
		const result = await this.engine.loadSaveWorkspace(
			bytes,
			file.originalFileName ?? undefined,
			activeBox
		);
		if (!result.ok) throw result.error;

		const state = persisted
			? createPersistedWorkspaceState({
					file,
					bytes,
					workspace: result.value,
					dirty: persisted.dirty,
					automaticBackupCreated: persisted.automaticBackupCreated
				})
			: createCleanWorkspaceState({ file, bytes, workspace: result.value });
		return state;
	}

	set(state: WorkspaceState | null, activeBox = 0) {
		if (!state) {
			this.artifact = null;
			this.store.transaction(() => {
				this.store.delTables().setValues({ activeSaveFileId: '', dirty: false });
			});
			this.queuePersist();
			return;
		}

		this.artifact = {
			file: state.file,
			bytes: new Uint8Array(state.bytes),
			entityBytesBySlot: new Map()
		};
		const saveFileId = state.file.id;
		this.store.transaction(() => {
			this.store.delTables();
			this.store.setRow('workspaces', saveFileId, {
				saveFileId,
				activeBox,
				summary: JSON.stringify(state.workspace.summary),
				saveFile: JSON.stringify(state.workspace.saveFile ?? null),
				restoredFromBackup: JSON.stringify(state.restoredFromBackup),
				automaticBackupCreated: state.automaticBackupCreated
			});
			for (let index = 0; index < state.workspace.summary.boxCount; index += 1) {
				this.store.setRow('boxes', `${saveFileId}:${index}`, { saveFileId, index });
			}
			for (const slot of state.workspace.partySlots) {
				const rowId = `${saveFileId}:party:${slot.slot}`;
				this.artifact?.entityBytesBySlot.set(rowId, slot.entityBytesBase64);
				const projection = { ...slot };
				delete projection.entityBytesBase64;
				this.store.setRow('slots', rowId, {
					saveFileId,
					zone: 'party',
					box: -1,
					slot: slot.slot,
					projection: JSON.stringify(projection)
				});
			}
			for (const slot of state.workspace.boxSlots) {
				const rowId = `${saveFileId}:box:${slot.box}:${slot.slot}`;
				this.artifact?.entityBytesBySlot.set(rowId, slot.entityBytesBase64);
				const projection = { ...slot };
				delete projection.entityBytesBase64;
				this.store.setRow('slots', rowId, {
					saveFileId,
					zone: 'box',
					box: slot.box,
					slot: slot.slot,
					projection: JSON.stringify(projection)
				});
			}
			this.store.setValues({ activeSaveFileId: saveFileId, dirty: state.dirty });
		});
		this.queuePersist();
	}

	async exportBytes(state = this.read()) {
		if (!state) throw new Error('Load a Save File before exporting.');
		const result = await this.engine.serializeSave(
			state.bytes,
			state.file.originalFileName ?? undefined
		);
		if (!result.ok) throw result.error;
		return base64ToBytes(result.value.bytesBase64, result.value.byteLength);
	}

	async flushed() {
		await this.persistQueue;
	}

	private read(): WorkspaceState | null {
		const saveFileId = this.store.getValue('activeSaveFileId');
		if (typeof saveFileId !== 'string' || !saveFileId || !this.artifact) return null;
		const row = this.store.getRow('workspaces', saveFileId);
		if (typeof row.summary !== 'string') return null;

		const partySlots: SaveWorkspace['partySlots'] = [];
		const boxSlots: SaveWorkspace['boxSlots'] = [];
		for (const [rowId, slotRow] of Object.entries(this.store.getTable('slots'))) {
			if (slotRow.saveFileId !== saveFileId || typeof slotRow.projection !== 'string') continue;
			const projection = {
				...JSON.parse(slotRow.projection),
				entityBytesBase64: this.artifact.entityBytesBySlot.get(rowId)
			};
			if (slotRow.zone === 'party') partySlots.push(projection);
			if (slotRow.zone === 'box') boxSlots.push(projection);
		}
		partySlots.sort((a, b) => a.slot - b.slot);
		boxSlots.sort((a, b) => a.box - b.box || a.slot - b.slot);

		return {
			file: this.artifact.file,
			bytes: new Uint8Array(this.artifact.bytes),
			workspace: {
				summary: JSON.parse(row.summary),
				partySlots,
				boxSlots,
				saveFile:
					typeof row.saveFile === 'string' ? (JSON.parse(row.saveFile) ?? undefined) : undefined
			},
			dirty: this.store.getValue('dirty') === true,
			restoredFromBackup:
				typeof row.restoredFromBackup === 'string' ? JSON.parse(row.restoredFromBackup) : null,
			automaticBackupCreated: row.automaticBackupCreated === true
		};
	}

	private queuePersist() {
		if (!this.options.persistence) return;
		const content = this.store.getContent();
		this.persistQueue = this.persistQueue.then(() => this.options.persistence!.save(content));
	}

	private get engine() {
		return typeof this.options.engine === 'function' ? this.options.engine() : this.options.engine;
	}
}

export { LocalStorageWorkspacePersistence } from './persistence';
export {
	WORKSPACE_PARSER_VERSION,
	WORKSPACE_SCHEMA_VERSION,
	workspaceTablesSchema,
	workspaceValuesSchema
} from './schema';
