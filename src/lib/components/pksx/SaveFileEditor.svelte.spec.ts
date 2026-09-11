import { afterEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import { createMockEngine, type EngineApi, type SaveFileEditableProjection } from '$lib/engine';
import SaveFileEditor from './SaveFileEditor.svelte';
import { createSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';
import { deleteIndexedDbSaves } from '$lib/pksx/saves';
import {
	getCachedActiveWorkspace,
	getSavesStorage,
	invalidateActiveWorkspaceCache
} from '$lib/pksx/saves-cache';

const fakes = vi.hoisted(() => ({
	databaseName: 'pksx-save-file-editor-test-' + crypto.randomUUID(),
	engine: null as EngineApi | null,
	host: null as ReturnType<typeof createSummonedWorkflowHost> | null
}));

vi.mock('$lib/pksx/saves', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/pksx/saves')>();
	return {
		...original,
		createSavesStorage: () =>
			new original.IndexedDbSavesStorage({ databaseName: fakes.databaseName })
	};
});
vi.mock('$lib/engine', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/engine')>()),
	createPkhexWorkerEngine: () =>
		new Proxy({} as EngineApi, {
			get:
				(_target, method: keyof EngineApi) =>
				(...args: never[]) =>
					(fakes.engine![method] as (...values: never[]) => unknown)(...args)
		})
}));
vi.mock('$lib/pksx/summoned-workflow/host.svelte', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/pksx/summoned-workflow/host.svelte')>()),
	getSummonedWorkflowHost: () => fakes.host
}));

let component: ReturnType<typeof mount> | null = null;
let container: HTMLElement;

afterEach(async () => {
	if (component) await unmount(component);
	component = null;
	container?.remove();
	invalidateActiveWorkspaceCache();
	await deleteIndexedDbSaves(fakes.databaseName);
});

it('reloads the accepted Workspace after a final revision conflict and reapplies the staged edit', async () => {
	const storage = getSavesStorage();
	const file = await storage.importSave({
		bytes: new Uint8Array([1]),
		originalFileName: 'save.sav'
	});
	const applyInputs: number[] = [];
	fakes.host = createSummonedWorkflowHost();
	fakes.engine = createMockEngine({
		loadSaveWorkspace: async (bytes) => success(workspaceFor(bytes[0])),
		applySaveFileEditOperation: async (bytes) => {
			applyInputs.push(bytes[0]);
			if (applyInputs.length === 1) {
				const prepared = await storage.getWorkspace(file.id);
				if (!prepared) throw new Error('Expected prepared Workspace.');
				await storage.putWorkspace({
					saveFileId: file.id,
					bytes: new Uint8Array([2]),
					dirty: true,
					automaticBackupCreated: true,
					expectedUpdatedAt: prepared.updatedAt
				});
				return success({ bytes: new Uint8Array([3]), workspace: workspaceFor(3), mutated: true });
			}
			return success({ bytes: new Uint8Array([4]), workspace: workspaceFor(4), mutated: true });
		}
	});

	render();
	const input = await trainerNameInput();
	input.value = 'WANTED';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await tick();
	applyButton().click();

	await expect.poll(() => outcome()).toContain('persisted Workspace changed');
	expect(container.querySelector('.trainer-card strong')?.textContent).toBe('CONCURRENT');
	expect(trainerNameInputNow().value).toBe('WANTED');
	expect(Array.from(getCachedActiveWorkspace()?.bytes ?? [])).toEqual([2]);
	expect(Array.from((await storage.getWorkspace(file.id))?.bytes ?? [])).toEqual([2]);

	applyButton().click();
	await expect.poll(() => outcome()).toContain('Save File edits applied');
	expect(applyInputs).toEqual([1, 2]);
	expect(Array.from(getCachedActiveWorkspace()?.bytes ?? [])).toEqual([4]);
	expect(Array.from((await storage.getWorkspace(file.id))?.bytes ?? [])).toEqual([4]);
});

it('keeps a failed reload actionable without publishing unpersisted Engine output', async () => {
	const storage = getSavesStorage();
	const file = await storage.importSave({
		bytes: new Uint8Array([10]),
		originalFileName: 'save.sav'
	});
	const applyInputs: number[] = [];
	let rejectNextReload = true;
	fakes.host = createSummonedWorkflowHost();
	fakes.engine = createMockEngine({
		loadSaveWorkspace: async (bytes) => {
			if (bytes[0] === 11 && rejectNextReload) {
				rejectNextReload = false;
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
			if (applyInputs.length === 1) {
				const prepared = await storage.getWorkspace(file.id);
				if (!prepared) throw new Error('Expected prepared Workspace.');
				await storage.putWorkspace({
					saveFileId: file.id,
					bytes: new Uint8Array([11]),
					dirty: true,
					automaticBackupCreated: true,
					expectedUpdatedAt: prepared.updatedAt
				});
				return success({ bytes: new Uint8Array([12]), workspace: workspaceFor(12), mutated: true });
			}
			return success({ bytes: new Uint8Array([13]), workspace: workspaceFor(13), mutated: true });
		}
	});

	render();
	const input = await trainerNameInput();
	input.value = 'WANTED AGAIN';
	input.dispatchEvent(new Event('input', { bubbles: true }));
	await tick();
	applyButton().click();

	await expect.poll(() => outcome()).toContain('persisted Workspace changed');
	expect(Array.from(getCachedActiveWorkspace()?.bytes ?? [])).toEqual([10]);
	expect(Array.from((await storage.getWorkspace(file.id))?.bytes ?? [])).toEqual([11]);
	expect(trainerNameInputNow().value).toBe('WANTED AGAIN');

	applyButton().click();
	await expect
		.poll(() => container.querySelector('.trainer-card strong')?.textContent)
		.toBe('LATEST');
	expect(applyInputs).toEqual([10]);
	expect(Array.from(getCachedActiveWorkspace()?.bytes ?? [])).toEqual([11]);
	expect(trainerNameInputNow().value).toBe('WANTED AGAIN');

	applyButton().click();
	await expect.poll(() => outcome()).toContain('Save File edits applied');
	expect(applyInputs).toEqual([10, 11]);
	expect(Array.from(getCachedActiveWorkspace()?.bytes ?? [])).toEqual([13]);
});

function render() {
	container = document.createElement('div');
	document.body.append(container);
	component = mount(SaveFileEditor, { target: container, props: { destination: 'trainer' } });
}

async function trainerNameInput() {
	await expect.poll(() => container.querySelector('#save-file-trainer-name')).not.toBeNull();
	return trainerNameInputNow();
}

function trainerNameInputNow() {
	return container.querySelector<HTMLInputElement>('#save-file-trainer-name')!;
}

function applyButton() {
	return container.querySelector<HTMLButtonElement>('.apply-bar .apply')!;
}

function outcome() {
	return container.querySelector('.notice.outcome')?.textContent?.replace(/\s+/g, ' ') ?? '';
}

function success<T>(value: T) {
	return { ok: true as const, value, error: null };
}

function workspaceFor(revision: number) {
	const names: Record<number, string> = {
		1: 'BASE',
		2: 'CONCURRENT',
		3: 'UNPERSISTED',
		4: 'WANTED',
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
