import { createPkhexEngine, type EngineApi } from '$lib/engine';
import { createCleanWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import { SaveFileEditCoordinator } from '$lib/pksx/save-file-edit-coordinator';
import { IndexedDbSavesStorage } from '$lib/pksx/saves';
import { mount, tick, unmount } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import emeraldUrl from '../../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav?url';
import SaveFileBagTestHarness from './SaveFileBagTestHarness.svelte';

type MountedHarness = {
	handleBack(): boolean;
	currentWorkspace(): WorkspaceState;
	currentLedgerProps(): {
		command?: {
			kind: string;
			pocketKey: string;
			itemId?: number | null;
			quantity?: string;
			quantityError?: string | null;
		} | null;
	};
	currentPendingTargets(): string[];
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

async function setup(
	engineForCoordinator: EngineApi = engine,
	catalogueEngine: Pick<EngineApi, 'getSaveFileInventoryCatalogue'> = engine
) {
	const response = await fetch(emeraldUrl);
	const fixtureBytes = new Uint8Array(await response.arrayBuffer());
	const unchangedFixture = fixtureBytes.slice();
	const loaded = await engine.loadSaveWorkspace(fixtureBytes.slice(), '011020251345.sav', 0);
	const catalogue = await engine.getSaveFileInventoryCatalogue(
		fixtureBytes.slice(),
		'011020251345.sav'
	);
	if (!loaded.ok || !loaded.value.saveFile || !catalogue.ok || !catalogue.value.supported) {
		throw new Error('Public Emerald fixture has no editable Bag projection.');
	}

	const pocket = loaded.value.saveFile.inventory.pockets.find((candidate) => {
		const options = catalogue.value.pockets.find((entry) => entry.key === candidate.key);
		return (
			!candidate.full &&
			candidate.items.some((item) => item.maxQuantity > 1) &&
			options?.availableItems.some(
				(option) => !candidate.items.some((item) => item.id === option.id)
			)
		);
	});
	if (!pocket) throw new Error('Public Emerald fixture has no editable Bag pocket.');
	const item = pocket.items.find((candidate) => candidate.maxQuantity > 1)!;
	const option = catalogue.value.pockets
		.find((entry) => entry.key === pocket.key)!
		.availableItems.find(
			(candidate) => !pocket.items.some((existing) => existing.id === candidate.id)
		)!;
	const storage = new IndexedDbSavesStorage({
		databaseName: `pksx-bag-${crypto.randomUUID()}`
	});
	const file = await storage.importSave({
		bytes: fixtureBytes.slice(),
		originalFileName: '011020251345.sav'
	});
	const workspace = createCleanWorkspaceState({
		file,
		bytes: fixtureBytes.slice(),
		workspace: loaded.value
	});
	const coordinator = new SaveFileEditCoordinator({ storage, engine: engineForCoordinator });
	const toast = { error: vi.fn() };
	host = document.createElement('div');
	host.style.width = '640px';
	host.style.height = '360px';
	host.style.padding = '12px';
	host.style.boxSizing = 'border-box';
	document.body.append(host);
	mounted = mount(SaveFileBagTestHarness, {
		target: host,
		props: { workspace, activeBox: 0, coordinator, engine: catalogueEngine, toast }
	});
	await tick();
	return {
		fixtureBytes,
		unchangedFixture,
		storage,
		workspace,
		pocket,
		item,
		option,
		toast,
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

async function waitForItem(
	harness: MountedHarness,
	pocketKey: string,
	itemId: number,
	quantity?: number
) {
	await vi.waitFor(
		() => {
			const item = harness
				.currentWorkspace()
				.workspace.saveFile?.inventory.pockets.find((pocket) => pocket.key === pocketKey)
				?.items.find((candidate) => candidate.id === itemId);
			if (quantity === undefined) expect(item).toBeUndefined();
			else expect(item?.quantity).toBe(quantity);
		},
		{ timeout: 10_000 }
	);
	await tick();
}

describe('Save File Bag with a real public fixture', () => {
	test('commits Add, quantity, and Remove through the mounted Ledger', async () => {
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
		const {
			fixtureBytes,
			unchangedFixture,
			storage,
			workspace,
			pocket,
			item,
			option,
			toast,
			harness
		} = await setup(instrumentedEngine);

		await vi.waitFor(() =>
			expect((target(`pocket-${pocket.key}-add`) as HTMLButtonElement).disabled).toBe(false)
		);
		const openAdd = target(`pocket-${pocket.key}-add`) as HTMLButtonElement;
		expect(openAdd.disabled).toBe(false);
		openAdd.click();
		await tick();
		expect(harness.currentLedgerProps().command?.kind).toBe('add-item');
		await vi.waitFor(() => expect(target(`pocket-${pocket.key}-add-item`)).not.toBeNull());
		const select = target(`pocket-${pocket.key}-add-item`) as HTMLSelectElement;
		select.value = String(option.id);
		select.dispatchEvent(new Event('change', { bubbles: true }));
		const addQuantity = input(`pocket-${pocket.key}-add-quantity`);
		enterValue(addQuantity, '7');
		await tick();
		expect(harness.currentLedgerProps().command).toMatchObject({
			kind: 'add-item',
			pocketKey: pocket.key,
			itemId: option.id,
			quantity: '7'
		});
		target(`pocket-${pocket.key}-add-confirm`).click();
		await tick();
		expect(harness.currentLedgerProps().command?.quantityError).toBeNull();
		expect(harness.currentPendingTargets()).toContain(`pocket-${pocket.key}-add-confirm`);
		const addCommand = host.querySelector<HTMLElement>('[data-ledger-command]')!;
		expect(addCommand.getAttribute('aria-busy')).toBe('true');
		expect(input(`item-${pocket.key}-${item.id}-quantity`).readOnly).toBe(false);
		expect(host.textContent).not.toMatch(/Saving|Working/i);
		expect(addCommand.querySelector('.spinner-graphic')).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(addCommand.querySelector('.spinner-graphic')).not.toBeNull();
		releaseFirstEdit();
		await waitForItem(harness, pocket.key, option.id, 7);
		expect(toast.error).not.toHaveBeenCalled();

		const typedQuantity =
			item.quantity === item.maxQuantity ? item.quantity - 1 : item.quantity + 1;
		const quantity = input(`item-${pocket.key}-${item.id}-quantity`);
		quantity.focus();
		enterValue(quantity, String(typedQuantity));
		press(quantity, 'Enter');
		await waitForItem(harness, pocket.key, item.id, typedQuantity);

		const operatorBase = typedQuantity >= item.maxQuantity ? item.maxQuantity - 1 : typedQuantity;
		enterValue(quantity, String(operatorBase));
		const callsBeforeOperator = applySaveFileEditOperation.mock.calls.length;
		target(`item-${pocket.key}-${item.id}-increase`).click();
		await waitForItem(harness, pocket.key, item.id, operatorBase + 1);
		expect(applySaveFileEditOperation).toHaveBeenCalledTimes(callsBeforeOperator + 1);

		const callsBeforeNoop = applySaveFileEditOperation.mock.calls.length;
		enterValue(quantity, String(operatorBase + 1));
		press(quantity, 'Enter');
		await tick();
		expect(applySaveFileEditOperation).toHaveBeenCalledTimes(callsBeforeNoop);

		enterValue(quantity, '0');
		press(quantity, 'Enter');
		await tick();
		expect(quantity.getAttribute('aria-invalid')).toBe('true');
		press(quantity, 'Escape');
		await tick();
		expect(quantity.value).toBe(String(operatorBase + 1));
		expect(document.activeElement).toBe(quantity);

		const removeIdentity = `item-${pocket.key}-${option.id}-remove`;
		target(removeIdentity).click();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(target(`item-${pocket.key}-${option.id}-confirm-remove`))
		);
		target(`item-${pocket.key}-${option.id}-cancel-remove`).click();
		await vi.waitFor(() => expect(document.activeElement).toBe(target(removeIdentity)));

		target(removeIdentity).click();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(target(`item-${pocket.key}-${option.id}-confirm-remove`))
		);
		expect(harness.handleBack()).toBe(true);
		await vi.waitFor(() => expect(document.activeElement).toBe(target(removeIdentity)));

		target(removeIdentity).click();
		await vi.waitFor(() =>
			expect(document.activeElement).toBe(target(`item-${pocket.key}-${option.id}-confirm-remove`))
		);
		const itemsBeforeRemoval = harness
			.currentWorkspace()
			.workspace.saveFile!.inventory.pockets.find(
				(candidate) => candidate.key === pocket.key
			)!.items;
		const removedIndex = itemsBeforeRemoval.findIndex((candidate) => candidate.id === option.id);
		const focusItem = itemsBeforeRemoval[removedIndex + 1] ?? itemsBeforeRemoval[removedIndex - 1];
		target(`item-${pocket.key}-${option.id}-confirm-remove`).click();
		await waitForItem(harness, pocket.key, option.id);
		expect((document.activeElement as HTMLElement).dataset.destinationFocus).toBe(
			focusItem ? `item-${pocket.key}-${focusItem.id}-decrease` : `pocket-${pocket.key}-add`
		);

		const scrollport = host.querySelector<HTMLElement>('[data-testid="bag-ledger-scrollport"]')!;
		scrollport.scrollTop = 0;
		const lastPocket = harness.currentWorkspace().workspace.saveFile!.inventory.pockets.at(-1)!;
		const lastTarget = Array.from(
			host.querySelectorAll<HTMLElement>(
				`[data-ledger-pocket="${lastPocket.key}"] [data-destination-focus]`
			)
		).at(-1)!;
		lastTarget.focus();
		await new Promise(requestAnimationFrame);
		expect(scrollport.scrollTop).toBeGreaterThan(0);
		expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
		expect(fixtureBytes).toEqual(unchangedFixture);
	}, 60_000);

	test('keeps catalogue and edit failures local, then retries against Emerald', async () => {
		let failEdit = true;
		const applySaveFileEditOperation = vi.fn<EngineApi['applySaveFileEditOperation']>(
			async (...args) => {
				if (failEdit) {
					failEdit = false;
					return {
						ok: false,
						value: null,
						error: { code: 'engine-unavailable', message: 'Engine stopped.' }
					};
				}
				return engine.applySaveFileEditOperation(...args);
			}
		);
		const coordinatorEngine: EngineApi = { ...engine, applySaveFileEditOperation };
		let failCatalogue = true;
		const getSaveFileInventoryCatalogue = vi.fn<EngineApi['getSaveFileInventoryCatalogue']>(
			async (...args) => {
				if (failCatalogue) {
					failCatalogue = false;
					return {
						ok: false,
						value: null,
						error: { code: 'engine-unavailable', message: 'Catalogue stopped.' }
					};
				}
				return engine.getSaveFileInventoryCatalogue(...args);
			}
		);
		const {
			fixtureBytes,
			unchangedFixture,
			storage,
			workspace,
			pocket,
			item,
			option,
			toast,
			harness
		} = await setup(coordinatorEngine, { getSaveFileInventoryCatalogue });

		await vi.waitFor(() => expect(target(`pocket-${pocket.key}-retry`)).not.toBeNull());
		expect(input(`item-${pocket.key}-${item.id}-quantity`).disabled).toBe(false);
		target(`pocket-${pocket.key}-retry`).click();
		await vi.waitFor(() =>
			expect((target(`pocket-${pocket.key}-add`) as HTMLButtonElement).disabled).toBe(false)
		);

		target(`pocket-${pocket.key}-add`).click();
		await tick();
		const select = target(`pocket-${pocket.key}-add-item`) as HTMLSelectElement;
		select.value = String(option.id);
		select.dispatchEvent(new Event('change', { bubbles: true }));
		enterValue(input(`pocket-${pocket.key}-add-quantity`), '2');
		await tick();
		target(`pocket-${pocket.key}-add-confirm`).click();
		await vi.waitFor(() =>
			expect(toast.error).toHaveBeenCalledWith(`${option.name} could not be saved. Engine stopped.`)
		);
		expect(target(`pocket-${pocket.key}-add-confirm`)).not.toBeNull();

		target(`pocket-${pocket.key}-add-confirm`).click();
		await waitForItem(harness, pocket.key, option.id, 2);
		expect(toast.error).toHaveBeenCalledOnce();
		expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
		expect(fixtureBytes).toEqual(unchangedFixture);
	}, 60_000);
});
