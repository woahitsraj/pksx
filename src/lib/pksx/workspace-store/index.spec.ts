import {
	createMockEngine,
	type EngineApi,
	type EngineResult,
	type SaveWorkspace
} from '$lib/engine';
import type { SavesStorage, StoredSaveFile } from '$lib/pksx/saves';
import { describe, expect, it, vi } from 'vitest';
import { ActiveWorkspaceService, WORKSPACE_SCHEMA_VERSION } from './index';
import type { WorkspaceStoreContent, WorkspaceStorePersistence } from './persistence';

const file: StoredSaveFile = {
	id: 'save-1',
	originalFileName: 'emerald.sav',
	byteLength: 4,
	importedAt: '2026-07-23T10:00:00.000Z',
	updatedAt: '2026-07-23T10:00:00.000Z'
};

describe('ActiveWorkspaceService', () => {
	it('initializes the versioned Workspace schema', () => {
		const service = createService();
		const schema = JSON.parse(service.store.getTablesSchemaJson());

		expect(schema).toHaveProperty('workspaces');
		expect(schema).toHaveProperty('boxes');
		expect(schema).toHaveProperty('slots');
		expect(schema).toHaveProperty('validation');
		expect(service.store.getValue('schemaVersion')).toBe(WORKSPACE_SCHEMA_VERSION);
	});

	it('hydrates reactive projections through Saves and Engine boundaries', async () => {
		const baseEngine = createMockEngine();
		const loaded = await baseEngine.loadSaveWorkspace(
			new Uint8Array([1, 2, 3, 4]),
			file.originalFileName ?? undefined,
			0
		);
		if (!loaded.ok) throw loaded.error;
		const workspace: SaveWorkspace = {
			...loaded.value,
			boxSlots: loaded.value.boxSlots.map((slot, index) =>
				index === 0 ? { ...slot, entityBytesBase64: 'engine-owned-secret' } : slot
			)
		};
		const persistence = createPersistence();
		const service = createService({
			engine: createMockEngine({
				loadSaveWorkspace: vi.fn(
					async (): Promise<EngineResult<SaveWorkspace>> => ({
						ok: true,
						value: workspace,
						error: null
					})
				)
			}),
			persistence
		});
		const observed: Array<boolean | null> = [];
		const unsubscribe = service.subscribe((state) => observed.push(state?.dirty ?? null));

		const state = await service.hydrate(file.id);
		expect(state?.file.id).toBe(file.id);
		expect(service.store.getRow('workspaces', file.id).saveFileId).toBe(file.id);
		expect(service.store.getRowIds('boxes')[0]).toBe(`${file.id}:0`);
		expect(JSON.stringify(service.store.getContent())).not.toContain('engine-owned-secret');
		expect(service.current?.workspace.boxSlots[0]?.entityBytesBase64).toBe('engine-owned-secret');

		service.set({ ...service.current!, dirty: true });
		await service.flushed();
		expect(observed.at(-1)).toBe(true);
		expect(persistence.save).toHaveBeenCalled();
		expect(persistence.content?.[1].dirty).toBe(true);
		unsubscribe();
	});

	it('loads an authoritative Workspace without publishing it', async () => {
		const service = createService();

		const loaded = await service.load(file.id);

		expect(loaded?.file.id).toBe(file.id);
		expect(service.current).toBeNull();
	});

	it('exports unchanged Workspace bytes byte-for-byte', async () => {
		const service = createService();
		await service.hydrate(file.id);

		expect(await service.exportBytes()).toStrictEqual(new Uint8Array([1, 2, 3, 4]));
	});
});

function createService(
	options: { engine?: EngineApi; persistence?: WorkspaceStorePersistence } = {}
) {
	return new ActiveWorkspaceService({
		storage: createStorage(),
		engine: options.engine ?? createMockEngine(),
		persistence: options.persistence
	});
}

function createStorage(): SavesStorage {
	return {
		getSave: vi.fn(async () => file),
		getSaveBytes: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
		getWorkspace: vi.fn(async () => null)
	} as unknown as SavesStorage;
}

function createPersistence() {
	const persistence = {
		content: null as WorkspaceStoreContent | null,
		load: vi.fn(async () => null),
		save: vi.fn(async (content: WorkspaceStoreContent) => {
			persistence.content = content;
		})
	} satisfies WorkspaceStorePersistence & { content: WorkspaceStoreContent | null };
	return persistence;
}
