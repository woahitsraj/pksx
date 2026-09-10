import {
	createPkhexWorkerEngine,
	type EngineApi,
	type PartySlotSummary,
	type SaveSummary
} from '$lib/engine';
import type { WorkspaceState } from '$lib/pksx/backup-workflow';
import {
	createSavesStorage,
	type BackupMetadata,
	type SaveFileId,
	type StoredSaveFile
} from '$lib/pksx/saves';
import {
	ActiveWorkspaceService,
	LocalStorageWorkspacePersistence
} from '$lib/pksx/workspace-store';

export type SaveCardDetails = {
	summary: SaveSummary;
	partySlots: PartySlotSummary[];
	creatureCount: number;
};

export type SavesSnapshot = {
	activeSaveFileId: SaveFileId | null;
	saveFiles: StoredSaveFile[];
	backupsBySaveFileId: Record<SaveFileId, BackupMetadata[]>;
	detailsBySaveFileId: Record<SaveFileId, SaveCardDetails | null>;
};

type SaveDetailsCacheEntry = {
	fingerprint: string;
	details: SaveCardDetails | null;
};

const storage = createSavesStorage();
const detailsCache = new Map<SaveFileId, SaveDetailsCacheEntry>();

let engine: EngineApi | null = null;
let savesSnapshot: SavesSnapshot | null = null;
let savesSnapshotSeeded = false;
let workspaceService: ActiveWorkspaceService | null = null;
let workspaceServiceStart: Promise<void> | null = null;
let activeWorkspaceBox = 0;
let pendingActiveSaveAdoption: SaveFileId | null = null;

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

export async function getSavesSnapshot(options: { force?: boolean } = {}) {
	if (savesSnapshot && !options.force) {
		return savesSnapshot;
	}

	const [activeSaveFileId, saveFiles] = await Promise.all([
		storage.getActiveSaveFileId(),
		storage.listSaves()
	]);
	const backupEntries = await Promise.all(
		saveFiles.map(
			async (saveFile) => [saveFile.id, await storage.listBackups(saveFile.id)] as const
		)
	);
	const detailEntries = await Promise.all(
		saveFiles.map(async (saveFile) => [saveFile.id, await getSaveCardDetails(saveFile)] as const)
	);
	const activeIds = new Set(saveFiles.map((saveFile) => saveFile.id));

	for (const saveFileId of detailsCache.keys()) {
		if (!activeIds.has(saveFileId)) {
			detailsCache.delete(saveFileId);
		}
	}

	savesSnapshot = {
		activeSaveFileId,
		saveFiles,
		backupsBySaveFileId: Object.fromEntries(backupEntries),
		detailsBySaveFileId: Object.fromEntries(detailEntries)
	};
	savesSnapshotSeeded = false;

	return savesSnapshot;
}

export function invalidateSavesCache() {
	savesSnapshot = null;
	savesSnapshotSeeded = false;
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
	getActiveWorkspaceService().set(workspace, box);
	activeWorkspaceBox = box;
	if (workspace) {
		detailsCache.set(workspace.file.id, {
			fingerprint: createSaveFileFingerprint(workspace.file),
			details: createSaveCardDetailsFromWorkspace(workspace)
		});
	}
	if (workspace && savesSnapshot) {
		savesSnapshot = mergeWorkspaceIntoSnapshot(savesSnapshot, workspace);
	}
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

export function seedSavesSnapshotFromActiveWorkspace(
	saveFiles: StoredSaveFile[],
	options: { backupsBySaveFileId?: Record<SaveFileId, BackupMetadata[]> } = {}
) {
	const workspace = workspaceService?.current ?? null;
	if (!workspace) {
		return null;
	}

	const details =
		detailsCache.get(workspace.file.id)?.details ?? createSaveCardDetailsFromWorkspace(workspace);
	const nextSaveFiles = ensureSaveFileIncluded(saveFiles, workspace.file);
	const snapshot: SavesSnapshot = {
		activeSaveFileId: workspace.file.id,
		saveFiles: nextSaveFiles,
		backupsBySaveFileId: Object.fromEntries(
			nextSaveFiles.map((saveFile) => [
				saveFile.id,
				options.backupsBySaveFileId?.[saveFile.id] ?? []
			])
		),
		detailsBySaveFileId: Object.fromEntries(
			nextSaveFiles.map((saveFile) => [
				saveFile.id,
				saveFile.id === workspace.file.id
					? details
					: (detailsCache.get(saveFile.id)?.details ?? null)
			])
		)
	};

	savesSnapshot = snapshot;
	savesSnapshotSeeded = true;
	detailsCache.set(workspace.file.id, {
		fingerprint: createSaveFileFingerprint(workspace.file),
		details
	});
	return snapshot;
}

export async function loadActiveWorkspaceFromSaves() {
	const activeSaveFileId = await storage.getActiveSaveFileId();
	const saveFile = activeSaveFileId ? await storage.getSave(activeSaveFileId) : null;
	const fallbackSaveFile = saveFile ?? (await storage.listSaves())[0] ?? null;

	if (!fallbackSaveFile) {
		return null;
	}

	const service = await startActiveWorkspaceService();
	const activeWorkspace = service.current;
	if (activeWorkspace && activeWorkspace.file.id === fallbackSaveFile.id) {
		return activeWorkspace;
	}

	const workspace = await service.hydrate(fallbackSaveFile.id, 0);
	activeWorkspaceBox = 0;
	return workspace;
}

async function getSaveCardDetails(saveFile: StoredSaveFile) {
	const fingerprint = createSaveFileFingerprint(saveFile);
	const cached = detailsCache.get(saveFile.id);

	if (cached?.fingerprint === fingerprint) {
		return cached.details;
	}

	const details = await loadSaveCardDetails(saveFile);
	detailsCache.set(saveFile.id, { fingerprint, details });
	return details;
}

function createSaveCardDetailsFromWorkspace(workspace: WorkspaceState): SaveCardDetails {
	return {
		summary: workspace.workspace.summary,
		partySlots: workspace.workspace.partySlots,
		creatureCount: workspace.workspace.boxSlots.filter((slot) => !slot.isEmpty).length
	};
}

function mergeWorkspaceIntoSnapshot(
	snapshot: SavesSnapshot,
	workspace: WorkspaceState
): SavesSnapshot {
	const saveFiles = ensureSaveFileIncluded(snapshot.saveFiles, workspace.file);

	return {
		activeSaveFileId: workspace.file.id,
		saveFiles,
		backupsBySaveFileId: {
			...Object.fromEntries(saveFiles.map((saveFile) => [saveFile.id, []])),
			...snapshot.backupsBySaveFileId
		},
		detailsBySaveFileId: {
			...Object.fromEntries(saveFiles.map((saveFile) => [saveFile.id, null])),
			...snapshot.detailsBySaveFileId,
			[workspace.file.id]: createSaveCardDetailsFromWorkspace(workspace)
		}
	};
}

function ensureSaveFileIncluded(saveFiles: StoredSaveFile[], saveFile: StoredSaveFile) {
	const existing = saveFiles.some((candidate) => candidate.id === saveFile.id);
	return existing ? saveFiles : [saveFile, ...saveFiles];
}

async function loadSaveCardDetails(saveFile: StoredSaveFile): Promise<SaveCardDetails | null> {
	const bytes = await storage.getSaveBytes(saveFile.id);
	if (!bytes) {
		return null;
	}

	const activeEngine = getPkhexEngine();
	const workspace = await activeEngine.loadSaveWorkspace(
		bytes,
		saveFile.originalFileName ?? undefined,
		0
	);
	if (!workspace.ok) {
		return null;
	}

	let creatureCount = workspace.value.boxSlots.filter((slot) => !slot.isEmpty).length;
	for (let box = 1; box < workspace.value.summary.boxCount; box += 1) {
		const slots = await activeEngine.listBoxSlots(
			bytes,
			saveFile.originalFileName ?? undefined,
			box
		);
		if (slots.ok) {
			creatureCount += slots.value.filter((slot) => !slot.isEmpty).length;
		}
	}

	return {
		summary: workspace.value.summary,
		partySlots: workspace.value.partySlots,
		creatureCount
	};
}

function createSaveFileFingerprint(saveFile: StoredSaveFile) {
	return `${saveFile.importedAt}:${saveFile.byteLength}:${saveFile.originalFileName ?? ''}`;
}
