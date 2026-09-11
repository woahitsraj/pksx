import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import type { EngineApi } from '$lib/engine';
import SavesGrid from './SavesGrid.svelte';
import { createSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';
import { createEmptyPokemonStorage, deleteIndexedDbSaves } from '$lib/pksx/saves';
import { getSavesSnapshot, getSavesStorage, invalidateSavesCache } from '$lib/pksx/saves-cache';

type LoadSaveResult = Awaited<ReturnType<EngineApi['loadSaveWorkspace']>>;

const fakes = vi.hoisted(() => ({
	databaseName: 'pksx-grid-test-' + crypto.randomUUID(),
	host: null as ReturnType<typeof createSummonedWorkflowHost> | null,
	detailsRequest: null as Promise<LoadSaveResult> | null
}));

vi.mock('$lib/pksx/saves', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/pksx/saves')>();
	return {
		...original,
		createSavesStorage: () =>
			new original.IndexedDbSavesStorage({ databaseName: fakes.databaseName })
	};
});
vi.mock('$lib/pksx/summoned-workflow/host.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/pksx/summoned-workflow/host.svelte')>()),
	getSummonedWorkflowHost: () => fakes.host
}));
vi.mock('$lib/engine', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/engine')>()),
	createPkhexWorkerEngine: () => ({
		loadSaveWorkspace: () =>
			fakes.detailsRequest ?? Promise.resolve({ ok: false } as LoadSaveResult),
		listBoxSlots: async () => ({ ok: true, value: [], error: null })
	})
}));

let component: ReturnType<typeof mount> | null = null;
let container: HTMLElement;

afterEach(async () => {
	if (component) await unmount(component);
	component = null;
	container?.remove();
	fakes.detailsRequest = null;
	await deleteIndexedDbSaves(fakes.databaseName);
	invalidateSavesCache();
	vi.useRealTimers();
});

it.each(['save-file-menu', 'save-file-delete', 'main-menu'] as const)(
	'reconciles a missing menu target while %s owns the workflow',
	async (kind) => {
		const storage = getSavesStorage();
		const removed = await storage.importSave({
			bytes: new Uint8Array([1]),
			originalFileName: 'removed.sav'
		});
		const survivor = await storage.importSave({
			bytes: new Uint8Array([2]),
			originalFileName: 'survivor.sav'
		});
		const host = createSummonedWorkflowHost();
		fakes.host = host;
		container = document.createElement('div');
		document.body.append(container);
		component = mount(SavesGrid, { target: container });
		await expect.poll(() => container.querySelectorAll('.save-card').length).toBe(2);
		const grid = container.querySelector<HTMLElement>('#saves-grid')!;
		await expect.poll(() => document.activeElement).toBe(grid);
		container
			.querySelector<HTMLButtonElement>('[aria-label="Open Save File Menu for removed.sav"]')!
			.click();
		await tick();
		if (kind === 'save-file-delete') {
			host.openRelated(kind, { type: 'control', id: 'save-file-menu-command-2' });
		} else if (kind === 'main-menu') {
			host.closeAll();
			host.open(kind, { type: 'control', id: 'saves-grid' });
		}
		await storage.deleteSave(removed.id);
		invalidateSavesCache();
		await getSavesSnapshot({ force: true });
		await tick();

		expect(host.active?.kind ?? null).toBe(kind === 'main-menu' ? 'main-menu' : null);
		expect(grid.getAttribute('aria-activedescendant')).toBe('saves-target-' + survivor.id);
		if (kind !== 'main-menu') {
			await expect.poll(() => document.activeElement).toBe(grid);
			expect(container.querySelector('[inert]')).toBeNull();
		}
	}
);

it('includes Pokemon Storage in grid navigation', async () => {
	fakes.host = createSummonedWorkflowHost();
	await getSavesStorage().putPokemonStorage(createEmptyPokemonStorage(4));
	container = document.createElement('div');
	document.body.append(container);
	component = mount(SavesGrid, { target: container });

	const grid = container.querySelector<HTMLElement>('#saves-grid')!;
	const storageCard = container.querySelector<HTMLElement>('#saves-target-pokemon-storage')!;
	await expect
		.poll(() => storageCard.textContent?.replace(/\s+/g, ' '))
		.toContain('4 Storage Boxes');
	expect(grid.getAttribute('aria-activedescendant')).toBe('saves-target-import');
	const storageText = storageCard.textContent?.replace(/\s+/g, ' ');
	expect(storageCard.getAttribute('role')).toBe('gridcell');
	expect(storageText).toContain('0 Pokemon');
	expect(storageText).toContain('4 Storage Boxes');
	expect(storageText).toContain('Automatically saved by PKSX');

	grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
	await tick();
	expect(grid.getAttribute('aria-activedescendant')).toBe('saves-target-pokemon-storage');
	grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
	await tick();
	expect(grid.getAttribute('aria-activedescendant')).toBe('saves-target-import');
});

it('marks a Save File card busy only while its details are loading', async () => {
	let resolveDetails!: (result: LoadSaveResult) => void;
	fakes.detailsRequest = new Promise((resolve) => (resolveDetails = resolve));
	fakes.host = createSummonedWorkflowHost();
	await getSavesStorage().importSave({
		bytes: new Uint8Array([1]),
		originalFileName: 'loading.sav'
	});
	await getSavesSnapshot({ force: true });
	vi.useFakeTimers();
	container = document.createElement('div');
	document.body.append(container);
	component = mount(SavesGrid, { target: container });
	flushSync();

	const card = container.querySelector<HTMLElement>('.save-card')!;
	expect(card.getAttribute('aria-busy')).toBe('true');
	const progress = card.querySelector<HTMLElement>('[role="status"]')!;
	vi.advanceTimersByTime(499);
	flushSync();
	expect(progress.textContent).toBe('');
	vi.advanceTimersByTime(1);
	flushSync();
	expect(progress.textContent?.trim()).toBe('Reading loading.sav');

	resolveDetails({
		ok: true,
		error: null,
		value: {
			summary: {
				gameVersion: 'E',
				trainerName: 'CASS',
				partyCount: 0,
				boxCount: 1
			},
			partySlots: [],
			boxSlots: []
		}
	} as unknown as LoadSaveResult);

	await expect.poll(() => card.getAttribute('aria-busy')).toBe('false');
	expect(card.querySelector('[role="status"]')).toBeNull();
	expect(card.textContent).toContain('CASS');
});
