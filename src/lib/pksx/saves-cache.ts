import {
	createPkhexWorkerEngine,
	type BoxSlotSummary,
	type EngineApi,
	type EngineResult,
	type PartySlotSummary,
	type SaveSummary
} from '$lib/engine';
import type { WorkspaceState } from '$lib/pksx/backup-workflow';
import { SaveFileEditCoordinator } from '$lib/pksx/save-file-edit-coordinator';
import { createSavesStorage, type SaveFileId, type StoredSaveFile } from '$lib/pksx/saves';
import {
	ActiveWorkspaceService,
	LocalStorageWorkspacePersistence
} from '$lib/pksx/workspace-store';

export type SaveCardDetails = {
	summary: SaveSummary;
	partySlots: PartySlotSummary[];
	creatureCount: number;
};

export type SaveCardDetailsState =
	| { status: 'loading' }
	| { status: 'ready'; details: SaveCardDetails }
	| { status: 'unavailable' };

export type SavesSnapshot = {
	activeSaveFileId: SaveFileId | null;
	saveFiles: StoredSaveFile[];
	detailsBySaveFileId: Record<SaveFileId, SaveCardDetailsState>;
};

type SaveDetailsCacheEntry = {
	fingerprint: string;
	state: Exclude<SaveCardDetailsState, { status: 'loading' }>;
};

type SavesSnapshotOptions = {
	force?: boolean;
};

const storage = createSavesStorage();
const detailsCache = new Map<SaveFileId, SaveDetailsCacheEntry>();
const snapshotListeners = new Set<(snapshot: SavesSnapshot) => void>();
const catalogRequests = new Map<number, Promise<SavesSnapshot>>();
const detailGenerations = new Map<SaveFileId, number>();

let engine: EngineApi | null = null;
let savesSnapshot: SavesSnapshot | null = null;
let savesSnapshotSeeded = false;
let savesSnapshotValid = false;
let snapshotGeneration = 0;
let workspaceService: ActiveWorkspaceService | null = null;
let workspaceServiceStart: Promise<void> | null = null;
let activeWorkspaceBox = 0;
let pendingActiveSaveAdoption: SaveFileId | null = null;
let saveFileEditCoordinator: SaveFileEditCoordinator | null = null;

export function getSavesStorage() {
	return storage;
}

export function getPkhexEngine() {
	engine ??= createPkhexWorkerEngine('/pkhex-engine');
	return engine;
}

export function getActiveWorkspaceService() {
	workspaceService ??= new ActiveWorkspaceService({
		storage,
		engine: getPkhexEngine,
		persistence:
			typeof localStorage === 'undefined'
				? undefined
				: new LocalStorageWorkspacePersistence('pksx-active-workspace-v1')
	});
	return workspaceService;
}

export function getSaveFileEditCoordinator() {
	saveFileEditCoordinator ??= new SaveFileEditCoordinator({
		storage,
		engine: getPkhexEngine,
		publish: setCachedActiveWorkspace,
		isResultCurrent: ({ saveFileId }) => workspaceService?.current?.file.id === saveFileId
	});
	return saveFileEditCoordinator;
}

async function startActiveWorkspaceService() {
	const service = getActiveWorkspaceService();
	workspaceServiceStart ??= service.start();
	await workspaceServiceStart;
	return service;
}

export function getCachedSavesSnapshot() {
	return savesSnapshot;
}

export function isCachedSavesSnapshotSeeded() {
	return savesSnapshot !== null && savesSnapshotSeeded;
}

export function subscribeSavesSnapshot(listener: (snapshot: SavesSnapshot) => void) {
	snapshotListeners.add(listener);
	if (savesSnapshot && savesSnapshotValid) listener(savesSnapshot);
	return () => {
		snapshotListeners.delete(listener);
		if (snapshotListeners.size === 0 && !savesSnapshotValid) {
			savesSnapshot = null;
		}
	};
}

export function getSavesSnapshot(options: SavesSnapshotOptions = {}): Promise<SavesSnapshot> {
	if (savesSnapshot && savesSnapshotValid && !options.force) {
		return Promise.resolve(savesSnapshot);
	}

	const generation = ++snapshotGeneration;
	const request = loadSavesSnapshot(generation);
	catalogRequests.set(generation, request);
	void request.then(
		() => catalogRequests.delete(generation),
		() => catalogRequests.delete(generation)
	);
	return request;
}

async function loadSavesSnapshot(generation: number): Promise<SavesSnapshot> {
	const [activeSaveFileId, saveFiles] = await Promise.all([
		storage.getActiveSaveFileId(),
		storage.listSaves()
	]);
	const activeIds = new Set(saveFiles.map((saveFile) => saveFile.id));

	for (const saveFileId of detailsCache.keys()) {
		if (!activeIds.has(saveFileId)) detailsCache.delete(saveFileId);
	}

	const snapshot: SavesSnapshot = {
		activeSaveFileId,
		saveFiles,
		detailsBySaveFileId: Object.fromEntries(
			saveFiles.map((saveFile) => [
				saveFile.id,
				detailsCache.get(saveFile.id)?.fingerprint === createSaveFileFingerprint(saveFile)
					? detailsCache.get(saveFile.id)!.state
					: { status: 'loading' }
			])
		)
	};

	if (generation !== snapshotGeneration) {
		return (
			catalogRequests.get(snapshotGeneration) ??
			(savesSnapshotValid ? savesSnapshot : null) ??
			getSavesSnapshot({ force: true })
		);
	}
	savesSnapshot = snapshot;
	savesSnapshotSeeded = false;
	savesSnapshotValid = true;
	publishSavesSnapshot();

	for (const saveFile of saveFiles) {
		if (snapshot.detailsBySaveFileId[saveFile.id].status === 'loading') {
			scheduleSaveCardDetails(saveFile);
		} else {
			supersedeSaveCardDetails(saveFile.id);
		}
	}

	return snapshot;
}

export function invalidateSavesCache() {
	snapshotGeneration += 1;
	savesSnapshotSeeded = false;
	savesSnapshotValid = false;
	if (snapshotListeners.size === 0) {
		savesSnapshot = null;
	}
}

export function getCachedActiveWorkspace() {
	return workspaceService?.current ?? null;
}

export function getCachedActiveWorkspaceBox() {
	return activeWorkspaceBox;
}

export function setCachedActiveWorkspace(
	workspace: WorkspaceState | null,
	box = 0,
	options: { adoptAsActiveSave?: boolean } = {}
) {
	pendingActiveSaveAdoption = workspace && options.adoptAsActiveSave ? workspace.file.id : null;
	activeWorkspaceBox = box;
	getActiveWorkspaceService().set(workspace, box);
	if (!workspace) return;
	detailsCache.delete(workspace.file.id);
	const detailGeneration = supersedeSaveCardDetails(workspace.file.id);
	if (!savesSnapshot) return;
	if (snapshotListeners.size === 0) {
		invalidateSavesCache();
		return;
	}
	savesSnapshot = mergeWorkspaceIntoSnapshot(savesSnapshot, workspace);
	publishSavesSnapshot();
	queueSaveCardDetails(workspace.file, detailGeneration);
}

export function consumeActiveSaveAdoption(saveFileId: SaveFileId) {
	if (pendingActiveSaveAdoption !== saveFileId) return false;
	pendingActiveSaveAdoption = null;
	return true;
}

export function invalidateActiveWorkspaceCache(saveFileId?: SaveFileId) {
	if (!saveFileId || workspaceService?.current?.file.id === saveFileId) {
		workspaceService?.set(null);
		activeWorkspaceBox = 0;
	}
}

export function seedSavesSnapshotFromActiveWorkspace(saveFiles: StoredSaveFile[]) {
	const workspace = workspaceService?.current ?? null;
	if (!workspace) return null;

	const nextSaveFiles = ensureSaveFileIncluded(saveFiles, workspace.file);
	const snapshot: SavesSnapshot = {
		activeSaveFileId: workspace.file.id,
		saveFiles: nextSaveFiles,
		detailsBySaveFileId: Object.fromEntries(
			nextSaveFiles.map((saveFile) => [saveFile.id, { status: 'loading' }])
		)
	};

	snapshotGeneration += 1;
	savesSnapshot = snapshot;
	savesSnapshotSeeded = true;
	savesSnapshotValid = true;
	for (const saveFile of nextSaveFiles) supersedeSaveCardDetails(saveFile.id);
	detailsCache.delete(workspace.file.id);
	publishSavesSnapshot();
	return snapshot;
}

export async function loadActiveWorkspaceFromSaves() {
	const activeSaveFileId = await storage.getActiveSaveFileId();
	const saveFile = activeSaveFileId ? await storage.getSave(activeSaveFileId) : null;
	const fallbackSaveFile = saveFile ?? (await storage.listSaves())[0] ?? null;

	if (!fallbackSaveFile) return null;

	const service = await startActiveWorkspaceService();
	const activeWorkspace = service.current;
	if (activeWorkspace && activeWorkspace.file.id === fallbackSaveFile.id) return activeWorkspace;

	const workspace = await service.hydrate(fallbackSaveFile.id, 0);
	activeWorkspaceBox = 0;
	return workspace;
}

function supersedeSaveCardDetails(saveFileId: SaveFileId) {
	const detailGeneration = (detailGenerations.get(saveFileId) ?? 0) + 1;
	detailGenerations.set(saveFileId, detailGeneration);
	return detailGeneration;
}

function scheduleSaveCardDetails(saveFile: StoredSaveFile) {
	void settleSaveCardDetails(saveFile, supersedeSaveCardDetails(saveFile.id));
}

function queueSaveCardDetails(saveFile: StoredSaveFile, detailGeneration: number) {
	queueMicrotask(() => {
		if (
			detailGeneration !== detailGenerations.get(saveFile.id) ||
			!savesSnapshot?.saveFiles.some((candidate) => candidate.id === saveFile.id)
		) {
			return;
		}
		void settleSaveCardDetails(saveFile, detailGeneration);
	});
}

async function settleSaveCardDetails(saveFile: StoredSaveFile, detailGeneration: number) {
	let details: SaveCardDetails | null;
	try {
		details = await loadSaveCardDetails(saveFile);
	} catch {
		details = null;
	}
	const state: Exclude<SaveCardDetailsState, { status: 'loading' }> = details
		? { status: 'ready', details }
		: { status: 'unavailable' };

	const catalogRequest = catalogRequests.get(snapshotGeneration);
	if (catalogRequest) await catalogRequest.catch(() => undefined);

	if (
		detailGeneration !== detailGenerations.get(saveFile.id) ||
		!savesSnapshot?.saveFiles.some((candidate) => candidate.id === saveFile.id)
	) {
		return;
	}

	detailsCache.set(saveFile.id, { fingerprint: createSaveFileFingerprint(saveFile), state });
	savesSnapshot = {
		...savesSnapshot,
		detailsBySaveFileId: {
			...savesSnapshot.detailsBySaveFileId,
			[saveFile.id]: state
		}
	};
	publishSavesSnapshot();
}

function publishSavesSnapshot() {
	if (!savesSnapshot) return;
	for (const listener of snapshotListeners) listener(savesSnapshot);
}

function mergeWorkspaceIntoSnapshot(snapshot: SavesSnapshot, workspace: WorkspaceState) {
	const saveFiles = ensureSaveFileIncluded(snapshot.saveFiles, workspace.file);
	return {
		activeSaveFileId: workspace.file.id,
		saveFiles,
		detailsBySaveFileId: {
			...Object.fromEntries(saveFiles.map((saveFile) => [saveFile.id, { status: 'loading' }])),
			...snapshot.detailsBySaveFileId,
			[workspace.file.id]: { status: 'loading' }
		}
	} satisfies SavesSnapshot;
}

function ensureSaveFileIncluded(saveFiles: StoredSaveFile[], saveFile: StoredSaveFile) {
	return saveFiles.some((candidate) => candidate.id === saveFile.id)
		? saveFiles
		: [saveFile, ...saveFiles];
}

async function loadSaveCardDetails(saveFile: StoredSaveFile): Promise<SaveCardDetails | null> {
	const [storedBytes, persistedWorkspace] = await Promise.all([
		storage.getSaveBytes(saveFile.id),
		storage.getWorkspace(saveFile.id)
	]);
	const activeWorkspace = getCachedActiveWorkspace();
	const bytes =
		activeWorkspace?.file.id === saveFile.id
			? activeWorkspace.bytes
			: (persistedWorkspace?.bytes ?? storedBytes);
	if (!bytes) return null;

	const activeEngine = getPkhexEngine();
	const workspace = await activeEngine.loadSaveWorkspace(
		bytes,
		saveFile.originalFileName ?? undefined,
		0
	);
	if (!workspace.ok) return null;

	const creatureCount = await countSavePokemon(
		workspace.value.summary,
		workspace.value.boxSlots,
		(box) => activeEngine.listBoxSlots(bytes, saveFile.originalFileName ?? undefined, box)
	);
	if (creatureCount === null) return null;

	return {
		summary: workspace.value.summary,
		partySlots: workspace.value.partySlots,
		creatureCount
	};
}

export async function countSavePokemon(
	summary: SaveSummary,
	firstBoxSlots: BoxSlotSummary[],
	loadBoxSlots: (box: number) => Promise<EngineResult<BoxSlotSummary[]>>
) {
	let count = summary.partyCount + firstBoxSlots.filter((slot) => !slot.isEmpty).length;
	for (let box = 1; box < summary.boxCount; box += 1) {
		const slots = await loadBoxSlots(box);
		if (!slots.ok) return null;
		count += slots.value.filter((slot) => !slot.isEmpty).length;
	}
	return count;
}

function createSaveFileFingerprint(saveFile: StoredSaveFile) {
	return `${saveFile.importedAt}:${saveFile.byteLength}:${saveFile.originalFileName ?? ''}`;
}
