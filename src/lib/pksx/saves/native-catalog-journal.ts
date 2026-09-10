import type {
	BackupId,
	BackupMetadata,
	SaveFileId,
	StoredSaveFile,
	StoredWorkspace
} from './types';

const catalogVersion = 1;
const envelopeVersion = 1;
const catalogSlots = ['catalog.0.json', 'catalog.1.json'] as const;
const legacyCatalogPath = 'catalog.json';

export type NativeFileStore = {
	readText(path: string): Promise<string | null>;
	writeText(path: string, value: string): Promise<void>;
	readBytes(path: string): Promise<Uint8Array | null>;
	writeBytes(path: string, value: Uint8Array): Promise<void>;
	delete(path: string): Promise<void>;
	list(path: string): Promise<string[]>;
};

export type NativeWorkspaceMetadata = Omit<StoredWorkspace, 'bytes'> & {
	byteGeneration?: number;
	byteLength?: number;
};

export type NativeCatalog = {
	version: typeof catalogVersion;
	saves: StoredSaveFile[];
	backups: BackupMetadata[];
	workspaces: Record<SaveFileId, NativeWorkspaceMetadata>;
	activeSaveFileId: SaveFileId | null;
};

type NativeCatalogEnvelope = {
	envelopeVersion: typeof envelopeVersion;
	generation: number;
	workspaceLayout: 'revisioned';
	catalog: NativeCatalog;
	checksum: string;
};

export type NativeCatalogSnapshot = {
	catalog: NativeCatalog;
	generation: number;
	slot: 0 | 1 | null;
	modern: boolean;
	checksum: string | null;
};

export type NativeCatalogCommit = {
	workspaceBytes?: Map<SaveFileId, Uint8Array>;
	stagedBytes?: ReadonlyArray<{ path: string; bytes: Uint8Array }>;
};

export class NativeCatalogJournal {
	readonly #fileStore: NativeFileStore;
	#swept = false;

	constructor(fileStore: NativeFileStore) {
		this.#fileStore = fileStore;
	}

	async read(): Promise<NativeCatalogSnapshot> {
		const snapshot = await this.#resolve();
		if (!this.#swept) {
			this.#swept = true;
			await this.#sweepOrphans().catch(() => undefined);
		}
		return snapshot;
	}

	async commit(
		base: NativeCatalogSnapshot,
		catalog: NativeCatalog,
		commit: NativeCatalogCommit = {}
	): Promise<NativeCatalogSnapshot> {
		const generation = base.generation + 1;
		const candidate = cloneCatalog(catalog);
		const workspaceBytes = new Map(commit.workspaceBytes);

		for (const [saveFileId, metadata] of Object.entries(candidate.workspaces)) {
			const bytes = workspaceBytes.get(saveFileId);
			if (bytes) {
				candidate.workspaces[saveFileId] = {
					...metadata,
					byteGeneration: generation,
					byteLength: bytes.byteLength
				};
				continue;
			}
			if (base.modern) continue;

			const legacyBytes = await this.#fileStore.readBytes(legacyWorkspaceBytesPath(saveFileId));
			if (!legacyBytes) {
				throw new Error(`The persisted Workspace bytes are missing for ${saveFileId}.`);
			}
			workspaceBytes.set(saveFileId, legacyBytes);
			candidate.workspaces[saveFileId] = {
				...metadata,
				byteGeneration: generation,
				byteLength: legacyBytes.byteLength
			};
		}

		const staged = [
			...(commit.stagedBytes ?? []),
			...[...workspaceBytes].map(([saveFileId, bytes]) => ({
				path: revisionWorkspaceBytesPath(saveFileId, generation),
				bytes
			}))
		];
		const createdPaths: string[] = [];
		try {
			for (const entry of staged) {
				if (!(await this.#fileStore.readBytes(entry.path))) createdPaths.push(entry.path);
				await this.#fileStore.writeBytes(entry.path, entry.bytes);
			}
		} catch (error) {
			throw (await this.#cleanupFailedCandidate(createdPaths)) ?? error;
		}

		const unsigned: Omit<NativeCatalogEnvelope, 'checksum'> = {
			envelopeVersion,
			generation,
			workspaceLayout: 'revisioned' as const,
			catalog: candidate
		};
		const checksum = checksumFor(unsigned);
		const envelope: NativeCatalogEnvelope = { ...unsigned, checksum };
		const slot = (generation % 2) as 0 | 1;
		try {
			await this.#fileStore.writeText(catalogSlots[slot], JSON.stringify(envelope));
		} catch (error) {
			let resolved: NativeCatalogSnapshot;
			try {
				resolved = await this.#resolve();
			} catch {
				throw error;
			}
			if (resolved.generation !== generation || resolved.checksum !== checksum) {
				throw (await this.#cleanupFailedCandidate(createdPaths)) ?? error;
			}
		}

		const snapshot: NativeCatalogSnapshot = {
			catalog: candidate,
			generation,
			slot,
			modern: true,
			checksum
		};
		await this.#sweepOrphans().catch(() => undefined);
		return snapshot;
	}

	async readWorkspace(
		snapshot: NativeCatalogSnapshot,
		saveFileId: SaveFileId
	): Promise<Uint8Array | null> {
		const metadata = snapshot.catalog.workspaces[saveFileId];
		if (!metadata) return null;
		if (!snapshot.modern) return this.#fileStore.readBytes(legacyWorkspaceBytesPath(saveFileId));
		if (metadata.byteGeneration === undefined) {
			throw new Error('The persisted Workspace revision is missing.');
		}
		const bytes = await this.#fileStore.readBytes(
			revisionWorkspaceBytesPath(saveFileId, metadata.byteGeneration)
		);
		if (!bytes || metadata.byteLength === undefined || bytes.byteLength !== metadata.byteLength) {
			throw new Error('The persisted Workspace bytes are missing or truncated.');
		}
		return bytes;
	}

	async cleanupSave(saveFileId: SaveFileId, backupIds: Iterable<BackupId>): Promise<void> {
		const revisionPaths = await this.#workspaceRevisionPaths(saveFileId).catch(() => []);
		await Promise.allSettled([
			this.#fileStore.delete(saveBytesPath(saveFileId)),
			this.#fileStore.delete(legacyWorkspaceBytesPath(saveFileId)),
			...revisionPaths.map((path) => this.#fileStore.delete(path)),
			...[...backupIds].map((backupId) => this.#fileStore.delete(backupBytesPath(backupId)))
		]);
	}

	async cleanupWorkspace(saveFileId: SaveFileId): Promise<void> {
		const revisionPaths = await this.#workspaceRevisionPaths(saveFileId).catch(() => []);
		await Promise.allSettled([
			this.#fileStore.delete(legacyWorkspaceBytesPath(saveFileId)),
			...revisionPaths.map((path) => this.#fileStore.delete(path))
		]);
	}

	async #resolve(): Promise<NativeCatalogSnapshot> {
		const slots = await Promise.all(
			catalogSlots.map(async (path, slot) => {
				const value = await this.#fileStore.readText(path);
				return {
					present: value !== null,
					candidate: value ? parseEnvelope(value, slot as 0 | 1) : null
				};
			})
		);
		const candidates = slots
			.map(({ candidate }) => candidate)
			.filter((candidate): candidate is NativeCatalogSnapshot => candidate !== null)
			.sort((left, right) => right.generation - left.generation);
		if (candidates[0]) return candidates[0];

		const legacyValue = await this.#fileStore.readText(legacyCatalogPath);
		if (!legacyValue) {
			if (slots.some(({ present }) => present)) {
				throw new Error('The native Saves catalog is malformed.');
			}
			return emptySnapshot();
		}
		const catalog = JSON.parse(legacyValue) as NativeCatalog;
		assertCatalog(catalog);
		return { catalog, generation: 0, slot: null, modern: false, checksum: null };
	}

	async #sweepOrphans(): Promise<void> {
		const references = await this.#catalogReferences();
		await Promise.all([
			this.#sweepFlatDirectory('saves', references),
			this.#sweepFlatDirectory('backups', references),
			this.#sweepLegacyWorkspaces(references),
			this.#sweepWorkspaceRevisions(references)
		]);
	}

	async #catalogReferences(): Promise<Set<string>> {
		const references = new Set<string>();
		const snapshot = await this.#resolve();
		collectCatalogReferences(snapshot.catalog, references, snapshot.modern);
		return references;
	}

	async #sweepFlatDirectory(directory: 'saves' | 'backups', references: Set<string>) {
		const names = await this.#fileStore.list(directory);
		await Promise.all(
			names
				.filter((name) => /^[^/]+\.bin$/.test(name))
				.map((name) => `${directory}/${name}`)
				.filter((path) => !references.has(path))
				.map((path) => this.#fileStore.delete(path))
		);
	}

	async #sweepWorkspaceRevisions(references: Set<string>) {
		const owners = await this.#fileStore.list('workspaces/revisions');
		await Promise.all(
			owners.map(async (owner) => {
				if (owner.includes('/')) return;
				const directory = `workspaces/revisions/${owner}`;
				const names = await this.#fileStore.list(directory);
				await Promise.all(
					names
						.filter((name) => /^\d+\.bin$/.test(name))
						.map((name) => `${directory}/${name}`)
						.filter((path) => !references.has(path))
						.map((path) => this.#fileStore.delete(path))
				);
			})
		);
	}

	async #sweepLegacyWorkspaces(references: Set<string>) {
		const names = await this.#fileStore.list('workspaces');
		await Promise.all(
			names
				.filter((name) => /^[^/]+\.bin$/.test(name))
				.map((name) => `workspaces/${name}`)
				.filter((path) => !references.has(path))
				.map((path) => this.#fileStore.delete(path))
		);
	}

	async #workspaceRevisionPaths(saveFileId: SaveFileId) {
		const directory = workspaceRevisionDirectory(saveFileId);
		return (await this.#fileStore.list(directory))
			.filter((name) => /^\d+\.bin$/.test(name))
			.map((name) => `${directory}/${name}`);
	}

	async #cleanupFailedCandidate(paths: string[]) {
		let cleanupError: unknown;
		for (const path of paths) {
			try {
				await this.#fileStore.delete(path);
			} catch (error) {
				cleanupError ??= error;
			}
		}
		return cleanupError;
	}
}

export function emptyCatalog(): NativeCatalog {
	return {
		version: catalogVersion,
		saves: [],
		backups: [],
		workspaces: {},
		activeSaveFileId: null
	};
}

export function cloneCatalog(catalog: NativeCatalog): NativeCatalog {
	return {
		version: catalog.version,
		saves: catalog.saves.map((save) => ({ ...save })),
		backups: catalog.backups.map((backup) => ({ ...backup })),
		workspaces: Object.fromEntries(
			Object.entries(catalog.workspaces).map(([saveFileId, workspace]) => [
				saveFileId,
				{ ...workspace }
			])
		),
		activeSaveFileId: catalog.activeSaveFileId
	};
}

export function storedWorkspaceMetadata(
	metadata: NativeWorkspaceMetadata
): Omit<StoredWorkspace, 'bytes'> {
	return {
		saveFileId: metadata.saveFileId,
		dirty: metadata.dirty,
		automaticBackupCreated: metadata.automaticBackupCreated,
		updatedAt: metadata.updatedAt
	};
}

export function saveBytesPath(saveFileId: SaveFileId) {
	return `saves/${encodeURIComponent(saveFileId)}.bin`;
}

export function legacyWorkspaceBytesPath(saveFileId: SaveFileId) {
	return `workspaces/${encodeURIComponent(saveFileId)}.bin`;
}

export function revisionWorkspaceBytesPath(saveFileId: SaveFileId, generation: number) {
	return `${workspaceRevisionDirectory(saveFileId)}/${generation}.bin`;
}

export function backupBytesPath(backupId: BackupId) {
	return `backups/${encodeURIComponent(backupId)}.bin`;
}

function workspaceRevisionDirectory(saveFileId: SaveFileId) {
	return `workspaces/revisions/${encodeURIComponent(saveFileId)}`;
}

function parseEnvelope(value: string, slot: 0 | 1): NativeCatalogSnapshot | null {
	let parsed: NativeCatalogEnvelope;
	try {
		parsed = JSON.parse(value) as NativeCatalogEnvelope;
		assertCatalog(parsed.catalog);
	} catch {
		return null;
	}
	if (
		parsed.envelopeVersion !== envelopeVersion ||
		parsed.workspaceLayout !== 'revisioned' ||
		!Number.isSafeInteger(parsed.generation) ||
		parsed.generation < 1 ||
		parsed.generation % 2 !== slot
	) {
		return null;
	}
	const checksum = checksumFor({
		envelopeVersion: parsed.envelopeVersion,
		generation: parsed.generation,
		workspaceLayout: parsed.workspaceLayout,
		catalog: parsed.catalog
	});
	if (checksum !== parsed.checksum) return null;
	return {
		catalog: parsed.catalog,
		generation: parsed.generation,
		slot,
		modern: true,
		checksum
	};
}

function assertCatalog(catalog: NativeCatalog) {
	if (
		!catalog ||
		catalog.version !== catalogVersion ||
		!Array.isArray(catalog.saves) ||
		!Array.isArray(catalog.backups) ||
		!catalog.workspaces ||
		typeof catalog.workspaces !== 'object'
	) {
		throw new Error(`Unsupported native Saves catalog version: ${catalog?.version}`);
	}
}

function checksumFor(value: Omit<NativeCatalogEnvelope, 'checksum'>) {
	const input = JSON.stringify(value);
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}

function collectCatalogReferences(
	catalog: NativeCatalog,
	references: Set<string>,
	modern: boolean
) {
	for (const save of catalog.saves) references.add(saveBytesPath(save.id));
	for (const backup of catalog.backups) references.add(backupBytesPath(backup.id));
	for (const [saveFileId, workspace] of Object.entries(catalog.workspaces)) {
		if (modern && workspace.byteGeneration !== undefined) {
			references.add(revisionWorkspaceBytesPath(saveFileId, workspace.byteGeneration));
		} else if (!modern) {
			references.add(legacyWorkspaceBytesPath(saveFileId));
		}
	}
}

function emptySnapshot(): NativeCatalogSnapshot {
	return { catalog: emptyCatalog(), generation: 0, slot: null, modern: false, checksum: null };
}
