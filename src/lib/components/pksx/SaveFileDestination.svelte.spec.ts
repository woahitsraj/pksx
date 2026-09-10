import { afterEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { createMockEngine, type EngineApi, type SaveFileEditableProjection } from '$lib/engine';
import { SaveFileEditCoordinator } from '$lib/pksx/save-file-edit-coordinator';
import {
	deleteIndexedDbSaves,
	IndexedDbSavesStorage,
	type PutWorkspaceInput,
	type SavesStorage
} from '$lib/pksx/saves';
import { ActiveWorkspaceService } from '$lib/pksx/workspace-store';
import SaveFileDestination from './SaveFileDestination.svelte';

const fakes = vi.hoisted(() => ({
	storage: null as SavesStorage | null,
	service: null as ActiveWorkspaceService | null,
	coordinator: null as SaveFileEditCoordinator | null,
	engine: null as EngineApi | null
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
vi.mock('$lib/pksx/app-chrome.svelte', () => ({ updateAppChrome: vi.fn() }));
vi.mock('$lib/pksx/destination-focus-context.svelte', () => ({
	getDestinationFocusIdentityGetter: () => undefined
}));
vi.mock('$lib/pksx/route-back-context.svelte', () => ({ getRouteBackRegistrar: () => undefined }));
vi.mock('$lib/pksx/toast/host.svelte', () => ({
	getToastHost: () => ({ error: vi.fn() })
}));
vi.mock('$lib/pksx/saves-cache', () => ({
	getActiveWorkspaceService: () => fakes.service!,
	getCachedActiveWorkspaceBox: () => 0,
	getPkhexEngine: () => fakes.engine!,
	getSaveFileEditCoordinator: () => fakes.coordinator!,
	loadActiveWorkspaceFromSaves: async () => {
		const saveFileId = await fakes.storage!.getActiveSaveFileId();
		if (!saveFileId) return null;
		const cached = fakes.service!.current;
		return cached?.file.id === saveFileId
			? cached
			: await fakes.service!.hydrate(saveFileId, 0);
	}
}));

let component: ReturnType<typeof mount> | null = null;
let container: HTMLElement;
let databaseName = '';

afterEach(async () => {
	if (component) await unmount(component);
	component = null;
	container?.remove();
	if (databaseName) await deleteIndexedDbSaves(databaseName);
});

it('recovers authoritative bytes after a stale final write and publishes them across remount', async () => {
	const harness = await setup();
	await commitTrainerName('WANTED');
	await harness.finalWriteStarted.promise;
	harness.replaceCurrent(11);
	harness.releaseFinalWrite();

	await expect.poll(() => retryButton()).not.toBeNull();
	await expect.poll(() => persistedRevision(harness.baseStorage)).toBe(11);
	expect(cachedRevision()).toBe(10);
	expect(trainerNameInput().value).toBe('BASE AGAIN');
	expect(harness.applyInputs).toEqual([10]);

	retryButton()!.click();
	await expect.poll(() => retryButton()).toBeUndefined();
	expect(cachedRevision()).toBe(11);
	expect(trainerNameInput().value).toBe('LATEST');

	await unmount(component!);
	component = null;
	container.remove();
	render();
	await expect.poll(() => trainerNameInput().value).toBe('LATEST');

	await commitTrainerName('WANTED AGAIN');
	await expect.poll(() => persistedRevision(harness.baseStorage)).toBe(13);
	expect(harness.applyInputs).toEqual([10, 11]);
	expect(cachedRevision()).toBe(13);
});

it('keeps failed recovery actionable without publishing unpersisted Engine output', async () => {
	const harness = await setup({ failFirstRecovery: true });
	await commitTrainerName('WANTED AGAIN');
	await harness.finalWriteStarted.promise;
	harness.replaceCurrent(11);
	harness.releaseFinalWrite();

	await expect.poll(() => retryButton()).not.toBeNull();
	await expect.poll(() => persistedRevision(harness.baseStorage)).toBe(11);
	expect(cachedRevision()).toBe(10);
	expect(trainerNameInput().value).toBe('BASE AGAIN');

	retryButton()!.click();
	await expect.poll(() => editingMessage()).toContain('Reload unavailable.');
	expect(cachedRevision()).toBe(10);
	expect(await persistedRevision(harness.baseStorage)).toBe(11);
	expect(trainerNameInput().value).toBe('BASE AGAIN');

	retryButton()!.click();
	await expect.poll(() => retryButton()).toBeUndefined();
	expect(cachedRevision()).toBe(11);
	expect(trainerNameInput().value).toBe('LATEST');

	await commitTrainerName('WANTED AGAIN');
	await expect.poll(() => persistedRevision(harness.baseStorage)).toBe(13);
	expect(harness.applyInputs).toEqual([10, 11]);
});

async function setup(options: { failFirstRecovery?: boolean } = {}) {
	databaseName = `pksx-save-file-destination-test-${crypto.randomUUID()}`;
	const baseStorage = new IndexedDbSavesStorage({ databaseName });
	await baseStorage.importSave({
		bytes: new Uint8Array([10]),
		originalFileName: 'save.sav'
	});
	const finalWriteStarted = deferred<void>();
	const finalWriteRelease = deferred<void>();
	let putWorkspaceCalls = 0;
	const storage = bindStorage(baseStorage, async (input) => {
		putWorkspaceCalls += 1;
		if (putWorkspaceCalls === 1) {
			finalWriteStarted.resolve();
			await finalWriteRelease.promise;
		}
		return baseStorage.putWorkspace(input);
	});
	const applyInputs: number[] = [];
	let recoveryFailures = options.failFirstRecovery ? 1 : 0;
	const engine = createMockEngine({
		loadSaveWorkspace: async (bytes) => {
			if (bytes[0] === 11 && recoveryFailures > 0) {
				recoveryFailures -= 1;
				return {
					ok: false,
					value: null,
					error: { code: 'engine-unavailable', message: 'Reload unavailable.' }
				};
			}
			return success(workspaceFor(bytes[0]));
		},
		applySaveFileEditOperation: async (bytes) => {
			applyInputs.push(bytes[0]);
			const revision = bytes[0] === 10 ? 12 : 13;
			return success({
				bytes: new Uint8Array([revision]),
				workspace: workspaceFor(revision),
				mutated: true
			});
		}
	});
	const service = new ActiveWorkspaceService({ storage, engine });
	await service.start();
	const coordinator = new SaveFileEditCoordinator({
		storage,
		engine,
		publish: (workspace, activeBox) => service.set(workspace, activeBox),
		isResultCurrent: ({ saveFileId }) => service.current?.file.id === saveFileId
	});
	fakes.storage = storage;
	fakes.service = service;
	fakes.coordinator = coordinator;
	fakes.engine = engine;
	render();
	await expect.poll(() => trainerNameInput().value).toBe('BASE AGAIN');

	return {
		applyInputs,
		baseStorage,
		finalWriteStarted,
		releaseFinalWrite: () => finalWriteRelease.resolve(),
		replaceCurrent(revision: number) {
			const current = service.current;
			if (!current) throw new Error('Expected an active Workspace.');
			coordinator.replaceWorkspace(
				{
					...current,
					bytes: new Uint8Array([revision]),
					workspace: workspaceFor(revision),
					dirty: true,
					automaticBackupCreated: true
				},
				0
			);
		}
	};
}

function bindStorage(
	storage: IndexedDbSavesStorage,
	putWorkspace: (input: PutWorkspaceInput) => ReturnType<SavesStorage['putWorkspace']>
) {
	return new Proxy(storage as SavesStorage, {
		get(target, property) {
			if (property === 'putWorkspace') return putWorkspace;
			const value = Reflect.get(target, property);
			return typeof value === 'function' ? value.bind(storage) : value;
		}
	});
}

function render() {
	container = document.createElement('div');
	document.body.append(container);
	component = mount(SaveFileDestination, {
		target: container,
		props: { destination: 'trainer' }
	});
}

async function commitTrainerName(value: string) {
	const input = trainerNameInput();
	input.focus();
	input.value = value;
	input.dispatchEvent(new InputEvent('input', { bubbles: true }));
	await tick();
	input.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
	);
}

function trainerNameInput() {
	return container.querySelector<HTMLInputElement>('input[aria-label="Trainer name"]')!;
}

function retryButton() {
	return Array.from(container.querySelectorAll('button')).find(
		(button) => button.textContent?.trim() === 'Retry'
	);
}

function editingMessage() {
	return container.querySelector('[role="status"]')?.textContent?.replace(/\s+/g, ' ') ?? '';
}

function cachedRevision() {
	return fakes.service!.current?.bytes[0];
}

async function persistedRevision(storage: IndexedDbSavesStorage) {
	const saveFileId = await storage.getActiveSaveFileId();
	return saveFileId ? (await storage.getWorkspace(saveFileId))?.bytes[0] : undefined;
}

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	const promise = new Promise<T>((accept) => (resolve = accept));
	return { promise, resolve };
}

function success<T>(value: T) {
	return { ok: true as const, value, error: null };
}

function workspaceFor(revision: number) {
	const names: Record<number, string> = {
		10: 'BASE AGAIN',
		11: 'LATEST',
		12: 'UNPERSISTED AGAIN',
		13: 'WANTED AGAIN'
	};
	const trainerName = names[revision] ?? 'BASE';
	const projection: SaveFileEditableProjection = {
		trainerProfile: {
			trainerName,
			trainerNameSupported: true,
			trainerNameMaxLength: 12,
			trainerNameUnsupportedReason: null,
			gender: 'female',
			genderSupported: true,
			genderUnsupportedReason: null,
			trainerId: 12345,
			gameVersion: 'E',
			generation: 3
		},
		money: { value: 3000, min: 0, max: 999999, supported: true, unsupportedReason: null },
		inventory: { supported: true, unsupportedReason: null, pockets: [] }
	};
	return {
		summary: {
			fileName: 'save.sav',
			saveType: 'SAV3',
			gameVersion: 'E',
			gameVersionId: 3,
			generation: 3,
			trainerName,
			trainerId: 12345,
			playTime: '10:22',
			playedHours: 10,
			playedMinutes: 22,
			partyCount: 0,
			boxCount: 1,
			boxSlotCount: 30
		},
		partySlots: [],
		boxSlots: [],
		saveFile: projection
	};
}
