import { createPkhexEngine, type EngineApi } from '$lib/engine';
import { createCleanWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import { SaveFileEditCoordinator } from '$lib/pksx/save-file-edit-coordinator';
import { IndexedDbSavesStorage } from '$lib/pksx/saves';
import { mount, tick, unmount } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import emeraldUrl from '../../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav?url';
import xUrl from '../../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/x/011020252224.sav?url';
import shieldUrl from '../../../../test-fixtures/save-files/pkmds-blazor/test-save-shield.sav?url';
import SaveFileTrainerMoneyTestHarness from './SaveFileTrainerMoneyTestHarness.svelte';

type MountedHarness = {
	handleBack(): boolean;
	currentWorkspace(): WorkspaceState;
	currentLedgerProps(): { drafts?: { trainerName?: { value: string; error?: string | null } } };
};

let engine: EngineApi;
let host: HTMLElement;
let mounted: ReturnType<typeof mount> | null = null;

beforeAll(async () => {
	engine = await createPkhexEngine('/pkhex-engine');
}, 60_000);

afterEach(async () => {
	if (mounted) await unmount(mounted);
	mounted = null;
	host?.remove();
	document.body.replaceChildren();
});

afterAll(() => {
	document.documentElement.removeAttribute('data-input-modality');
});

async function setup(url: string, fileName: string, engineForCoordinator: EngineApi = engine) {
	const response = await fetch(url);
	const fixtureBytes = new Uint8Array(await response.arrayBuffer());
	const unchangedFixture = fixtureBytes.slice();
	const loaded = await engine.loadSaveWorkspace(fixtureBytes.slice(), fileName, 0);
	if (!loaded.ok || !loaded.value.saveFile) {
		throw new Error(loaded.error?.message ?? 'Public fixture has no editable projection.');
	}

	const databaseName = `pksx-trainer-money-${crypto.randomUUID()}`;
	const storage = new IndexedDbSavesStorage({ databaseName });
	const toast = { error: vi.fn() };
	const file = await storage.importSave({
		bytes: fixtureBytes.slice(),
		originalFileName: fileName
	});
	const workspace = createCleanWorkspaceState({
		file,
		bytes: fixtureBytes.slice(),
		workspace: loaded.value
	});
	const coordinator = new SaveFileEditCoordinator({ storage, engine: engineForCoordinator });

	host = document.createElement('div');
	host.style.width = '640px';
	host.style.height = '360px';
	host.style.padding = '12px';
	host.style.boxSizing = 'border-box';
	document.body.append(host);
	mounted = mount(SaveFileTrainerMoneyTestHarness, {
		target: host,
		props: {
			workspace,
			activeBox: 0,
			coordinator,
			toast,
			reloadWorkspace: async () => workspace
		}
	});
	await tick();
	return {
		fixtureBytes,
		unchangedFixture,
		storage,
		coordinator,
		toast,
		workspace,
		harness: mounted as unknown as MountedHarness
	};
}

function target(identity: string) {
	return host.querySelector<HTMLElement>(`[data-destination-focus="${identity}"]`)!;
}

function input(identity: string) {
	return target(identity) as HTMLInputElement;
}

function enterValue(control: HTMLInputElement, value: string) {
	control.value = value;
	control.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
}

function press(control: HTMLElement, key: string) {
	control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

async function waitForAccepted(
	harness: MountedHarness,
	read: (workspace: WorkspaceState) => unknown,
	expected: unknown
) {
	await vi.waitFor(() => expect(read(harness.currentWorkspace())).toBe(expected), {
		timeout: 10_000
	});
	await tick();
}

describe('Save File Trainer and Money real public fixtures', () => {
	test('covers direct commit, abandonment, pending, no-op, and Backup with Emerald', async () => {
		let releaseFirstEdit!: () => void;
		const firstEditGate = new Promise<void>((resolve) => (releaseFirstEdit = resolve));
		let firstEdit = true;
		const applySaveFileEditOperation = vi.fn<EngineApi['applySaveFileEditOperation']>(
			async (...args) => {
				if (firstEdit) {
					firstEdit = false;
					await firstEditGate;
				}
				return engine.applySaveFileEditOperation(...args);
			}
		);
		const instrumentedEngine: EngineApi = { ...engine, applySaveFileEditOperation };
		const { fixtureBytes, unchangedFixture, storage, workspace, harness } = await setup(
			emeraldUrl,
			'011020251345.sav',
			instrumentedEngine
		);

		const name = input('trainer-name');
		expect(name.enterKeyHint).toBe('done');
		name.focus();
		enterValue(name, 'PKSX');
		press(name, 'Enter');
		await tick();
		expect(name.getAttribute('aria-busy')).toBe('true');
		expect(input('money-value').readOnly).toBe(false);
		expect(host.textContent).not.toMatch(/Saving|Working/i);
		expect(name.closest('.field-row')?.querySelector('.spinner-graphic')).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(name.closest('.field-row')?.querySelector('.spinner-graphic')).not.toBeNull();
		releaseFirstEdit();
		await waitForAccepted(
			harness,
			(state) => state.workspace.saveFile?.trainerProfile.trainerName,
			'PKSX'
		);
		expect(input('trainer-name').value).toBe('PKSX');
		expect(await storage.listBackups(workspace.file.id)).toEqual([
			expect.objectContaining({ reason: 'save-file-editing' })
		]);

		const callsAfterFirstCommit = applySaveFileEditOperation.mock.calls.length;
		const persistedAfterFirstCommit = await storage.getWorkspace(workspace.file.id);
		enterValue(input('trainer-name'), ' PKSX ');
		press(input('trainer-name'), 'Enter');
		await tick();
		expect(applySaveFileEditOperation).toHaveBeenCalledTimes(callsAfterFirstCommit);
		expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
		expect(await storage.getWorkspace(workspace.file.id)).toEqual(persistedAfterFirstCommit);
		expect(input('trainer-name').getAttribute('aria-busy')).toBe('false');

		name.focus();
		enterValue(name, '');
		press(name, 'Enter');
		await tick();
		expect(name.value).toBe('');
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.activeElement).toBe(name);
		press(name, 'Escape');
		await tick();
		expect(name.value).toBe('PKSX');
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.activeElement).toBe(name);

		enterValue(name, 'LOCAL');
		await tick();
		expect(name.hasAttribute('aria-invalid')).toBe(false);
		expect(harness.handleBack()).toBe(true);
		await tick();
		expect(name.value).toBe('PKSX');
		expect(document.activeElement).toBe(name);

		enterValue(name, '');
		await tick();
		input('money-value').focus();
		await tick();
		expect(harness.currentLedgerProps().drafts?.trainerName?.value).toBe('PKSX');
		expect(input('trainer-name').value).toBe('PKSX');
		expect(input('trainer-name').getAttribute('aria-invalid')).toBe('true');

		const money = input('money-value');
		expect(money.enterKeyHint).toBe('done');
		const moneyLimits = workspace.workspace.saveFile!.money;
		const firstMoney = Math.min(moneyLimits.max, moneyLimits.min + 42);
		enterValue(money, String(firstMoney));
		press(money, 'Enter');
		await waitForAccepted(harness, (state) => state.workspace.saveFile?.money.value, firstMoney);

		money.focus();
		enterValue(money, '');
		press(money, 'Enter');
		await tick();
		expect(money.value).toBe('');
		expect(money.getAttribute('aria-invalid')).toBe('true');
		press(money, 'Escape');
		await tick();
		expect(money.value).toBe(String(firstMoney));
		expect(document.activeElement).toBe(money);

		enterValue(money, String(Math.min(moneyLimits.max, firstMoney + 1)));
		await tick();
		expect(harness.handleBack()).toBe(true);
		await tick();
		expect(input('money-value').value).toBe(String(firstMoney));
		expect(document.activeElement).toBe(money);

		enterValue(money, '');
		await tick();
		input('trainer-name').focus();
		await tick();
		expect(input('money-value').value).toBe(String(firstMoney));
		expect(input('money-value').getAttribute('aria-invalid')).toBe('true');

		const operatorBase = Math.min(moneyLimits.max - 1, moneyLimits.min + 100);
		money.focus();
		enterValue(money, String(operatorBase));
		await tick();
		const beforeOperator = applySaveFileEditOperation.mock.calls.length;
		target('money-increase').click();
		await waitForAccepted(
			harness,
			(state) => state.workspace.saveFile?.money.value,
			operatorBase + 1
		);
		expect(applySaveFileEditOperation).toHaveBeenCalledTimes(beforeOperator + 1);
		expect(input('money-value').value).toBe(String(operatorBase + 1));

		const selectedGender = host.querySelector<HTMLButtonElement>(
			'[aria-label="Trainer gender"] button[aria-pressed="true"]'
		)!;
		const otherGender = Array.from(
			host.querySelectorAll<HTMLButtonElement>('[aria-label="Trainer gender"] button')
		).find((button) => button !== selectedGender)!;
		otherGender.click();
		await vi.waitFor(() => expect(otherGender.getAttribute('aria-pressed')).toBe('true'));

		expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
		expect(fixtureBytes).toEqual(unchangedFixture);
	}, 60_000);

	test.each([
		{ generation: 6, url: xUrl, fileName: '011020252224.sav' },
		{ generation: 8, url: shieldUrl, fileName: 'test-save-shield.sav' }
	])(
		'commits a returned Money projection with a public Generation $generation fixture',
		async ({ url, fileName }) => {
			const { fixtureBytes, unchangedFixture, storage, toast, workspace, harness } = await setup(
				url,
				fileName
			);
			const projection = workspace.workspace.saveFile!;
			const candidate =
				projection.money.value === projection.money.min
					? Math.min(projection.money.max, projection.money.min + 1)
					: projection.money.min;
			const money = input('money-value');
			money.focus();
			enterValue(money, String(candidate));
			press(money, 'Enter');
			await vi.waitFor(() => expect(input('money-value').getAttribute('aria-busy')).toBe('false'), {
				timeout: 10_000
			});
			expect(input('money-value').getAttribute('aria-invalid')).toBeNull();
			expect(toast.error).not.toHaveBeenCalled();
			await waitForAccepted(harness, (state) => state.workspace.saveFile?.money.value, candidate);
			expect(input('money-value').value).toBe(String(candidate));
			expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
			expect(fixtureBytes).toEqual(unchangedFixture);
		},
		60_000
	);

	test('blocks pending Enter-blur duplication and restores one failed field with one Toast', async () => {
		let releaseEdit!: () => void;
		const editGate = new Promise<void>((resolve) => (releaseEdit = resolve));
		const applySaveFileEditOperation = vi.fn<EngineApi['applySaveFileEditOperation']>(async () => {
			await editGate;
			throw new Error('Engine stopped temporarily.');
		});
		const instrumentedEngine: EngineApi = { ...engine, applySaveFileEditOperation };
		const { toast, workspace } = await setup(emeraldUrl, '011020251345.sav', instrumentedEngine);
		const accepted = workspace.workspace.saveFile!.money.value!;
		const candidate = accepted === 0 ? 1 : 0;
		const money = input('money-value');
		money.focus();
		enterValue(money, String(candidate));
		press(money, 'Enter');
		await vi.waitFor(() => expect(applySaveFileEditOperation).toHaveBeenCalledOnce());
		money.blur();
		await tick();
		expect(applySaveFileEditOperation).toHaveBeenCalledOnce();

		releaseEdit();
		await vi.waitFor(() => expect(toast.error).toHaveBeenCalledOnce());
		expect(toast.error).toHaveBeenCalledWith(
			'Money could not be saved. Engine stopped temporarily.'
		);
		expect(input('money-value').value).toBe(String(accepted));
		expect(input('money-value').getAttribute('aria-busy')).toBe('false');
	}, 60_000);

	test('enters unavailable from a real stale coordinator result and retries the session', async () => {
		const { coordinator, harness, toast, workspace } = await setup(emeraldUrl, '011020251345.sav');
		coordinator.replaceWorkspace(workspace, 0);
		const accepted = workspace.workspace.saveFile!.money.value!;
		const candidate = accepted === 0 ? 1 : 0;
		const money = input('money-value');
		money.focus();
		enterValue(money, String(candidate));
		press(money, 'Enter');
		await vi.waitFor(() => expect(host.textContent).toContain('Editing unavailable.'));
		await tick();
		expect(host.textContent).toContain(
			'The Save File Workspace changed before this edit completed.'
		);
		expect(toast.error).not.toHaveBeenCalled();
		expect(input('money-value').value).toBe(String(accepted));
		expect(input('trainer-name').disabled).toBe(true);
		expect(input('money-value').disabled).toBe(true);

		target('editing-retry').click();
		await vi.waitFor(() => expect(host.textContent).not.toContain('Editing unavailable.'));
		expect(input('trainer-name').disabled).toBe(false);
		expect(input('money-value').disabled).toBe(false);

		enterValue(input('money-value'), String(candidate));
		press(input('money-value'), 'Enter');
		await waitForAccepted(harness, (state) => state.workspace.saveFile?.money.value, candidate);
		expect(toast.error).not.toHaveBeenCalled();
	});
});
