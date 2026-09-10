import { createPkhexEngine, type EngineApi } from '$lib/engine';
import type { SaveFileLedgerProps } from '$lib/components/pksx/save-file-ledger/types';
import { createCleanWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import { dispatchControllerKey } from '$lib/pksx/controller-input';
import {
	SaveFileEditCoordinator,
	type SaveFileEditOrigin
} from '$lib/pksx/save-file-edit-coordinator';
import { IndexedDbSavesStorage } from '$lib/pksx/saves';
import { mount, tick, unmount } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import emeraldUrl from '../../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav?url';
import SaveFileBagTestHarness from './SaveFileBagTestHarness.svelte';

type MountedHarness = {
	handleBack(): boolean;
	currentWorkspace(): WorkspaceState;
	currentLedgerProps(): SaveFileLedgerProps;
	currentPendingTargets(): string[];
	currentOrigin(): SaveFileEditOrigin;
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
	const openWorkspace = vi.spyOn(coordinator, 'openWorkspace');
	const subscribePending = vi.spyOn(coordinator, 'subscribePending');
	const toast = { error: vi.fn() };
	host = document.createElement('div');
	host.style.width = '640px';
	host.style.height = '360px';
	host.style.padding = '12px';
	host.style.boxSizing = 'border-box';
	document.body.append(host);
	mounted = mount(SaveFileBagTestHarness, {
		target: host,
		props: {
			workspace,
			activeBox: 0,
			coordinator,
			engine: catalogueEngine,
			toast
		}
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
		coordinator,
		openWorkspace,
		subscribePending,
		harness: mounted as unknown as MountedHarness
	};
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((next) => (resolve = next));
	return { promise, resolve };
}

function commitContext(reason: 'enter' | 'blur', isEditing = () => true) {
	return { reason, isEditing };
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
	test('commits boundary quantity drafts once through their operators', async () => {
		const applySaveFileEditOperation = vi.fn<EngineApi['applySaveFileEditOperation']>((...args) =>
			engine.applySaveFileEditOperation(...args)
		);
		const { harness } = await setup({ ...engine, applySaveFileEditOperation });
		const ledgerProps = harness.currentLedgerProps();
		expect(ledgerProps.destination).toBe('bag');
		expect(ledgerProps.view.status).toBe('ready');
		if (ledgerProps.view.status === 'ready') {
			expect(ledgerProps.view.projection).toEqual(harness.currentWorkspace().workspace.saveFile);
		}
		expect(host.querySelector('[data-destination-root="bag"]')).not.toBeNull();
		expect(host.querySelector('[data-destination-focus="trainer-name"]')).toBeNull();
		expect(host.querySelector('[data-destination-focus="money-value"]')).toBeNull();
		const projection = harness.currentWorkspace().workspace.saveFile!;
		const pocket = projection.inventory.pockets.find((candidate) =>
			candidate.items.some((item) => item.quantity === 2 && item.maxQuantity > 2)
		);
		const item = pocket?.items.find(
			(candidate) => candidate.quantity === 2 && candidate.maxQuantity > 2
		);
		if (!pocket || !item) {
			throw new Error('Public Emerald fixture has no quantity-two Bag item.');
		}

		const quantityIdentity = `item-${pocket.key}-${item.id}-quantity`;
		await vi.waitFor(() => expect(input(quantityIdentity).disabled).toBe(false));
		const quantity = input(quantityIdentity);
		quantity.focus();
		enterValue(quantity, '1');
		await tick();
		const decrease = target(`item-${pocket.key}-${item.id}-decrease`);
		expect(decrease.getAttribute('aria-disabled')).toBe('false');
		const callsBeforeDecrease = applySaveFileEditOperation.mock.calls.length;
		decrease.click();
		await waitForItem(harness, pocket.key, item.id, 1);
		expect(applySaveFileEditOperation).toHaveBeenCalledTimes(callsBeforeDecrease + 1);

		enterValue(input(quantityIdentity), String(item.maxQuantity));
		await tick();
		const increase = target(`item-${pocket.key}-${item.id}-increase`);
		expect(increase.getAttribute('aria-disabled')).toBe('false');
		const callsBeforeIncrease = applySaveFileEditOperation.mock.calls.length;
		increase.click();
		await waitForItem(harness, pocket.key, item.id, item.maxQuantity);
		expect(applySaveFileEditOperation).toHaveBeenCalledTimes(callsBeforeIncrease + 1);
	}, 60_000);

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
		const pendingCommand = harness.currentLedgerProps().command;
		expect(pendingCommand?.kind).toBe('add-item');
		if (pendingCommand?.kind === 'add-item') expect(pendingCommand.quantityError).toBeNull();
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
		const pockets = harness.currentWorkspace().workspace.saveFile!.inventory.pockets;
		const lastPocket = pockets.at(-1)!;
		target(`pocket-${pockets[0].key}-jump`).focus();
		for (let index = 1; index < pockets.length; index += 1) {
			dispatchControllerKey('ArrowRight');
		}
		const lastJump = target(`pocket-${lastPocket.key}-jump`);
		expect(document.activeElement).toBe(lastJump);
		dispatchControllerKey('Enter');
		expect(document.activeElement).toBe(lastJump);
		dispatchControllerKey('ArrowDown');
		await new Promise(requestAnimationFrame);
		expect(scrollport.scrollTop).toBeGreaterThan(0);
		const focusedTarget = document.activeElement as HTMLElement;
		expect(focusedTarget.closest<HTMLElement>('[data-ledger-pocket]')?.dataset.ledgerPocket).toBe(
			lastPocket.key
		);
		const targetRect = focusedTarget.getBoundingClientRect();
		for (const container of [scrollport, host]) {
			const containerRect = container.getBoundingClientRect();
			expect(targetRect.top).toBeGreaterThanOrEqual(containerRect.top - 1);
			expect(targetRect.right).toBeLessThanOrEqual(containerRect.right + 1);
			expect(targetRect.bottom).toBeLessThanOrEqual(containerRect.bottom + 1);
			expect(targetRect.left).toBeGreaterThanOrEqual(containerRect.left - 1);
		}
		expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
		expect(fixtureBytes).toEqual(unchangedFixture);
	}, 60_000);

	test.each(['add', 'remove', 'quantity'] as const)(
		'discards the %s draft on unmount and reconstructs its confirmed pending operation',
		async (operation) => {
			const editGate = deferred<void>();
			const applySaveFileEditOperation = vi.fn<EngineApi['applySaveFileEditOperation']>(
				async (...args) => {
					await editGate.promise;
					return engine.applySaveFileEditOperation(...args);
				}
			);
			const instrumentedEngine: EngineApi = { ...engine, applySaveFileEditOperation };
			const {
				fixtureBytes,
				unchangedFixture,
				workspace,
				pocket,
				item,
				option,
				toast,
				coordinator,
				harness
			} = await setup(instrumentedEngine);
			await vi.waitFor(() =>
				expect((target(`pocket-${pocket.key}-add`) as HTMLButtonElement).disabled).toBe(false)
			);

			let pendingIdentity: string;
			if (operation === 'add') {
				target(`pocket-${pocket.key}-add`).click();
				await tick();
				const select = target(`pocket-${pocket.key}-add-item`) as HTMLSelectElement;
				select.value = String(option.id);
				select.dispatchEvent(new Event('change', { bubbles: true }));
				enterValue(input(`pocket-${pocket.key}-add-quantity`), '2');
				await tick();
				pendingIdentity = `pocket-${pocket.key}-add-confirm`;
				target(pendingIdentity).click();
			} else if (operation === 'remove') {
				target(`item-${pocket.key}-${item.id}-remove`).click();
				await tick();
				pendingIdentity = `item-${pocket.key}-${item.id}-confirm-remove`;
				target(pendingIdentity).click();
			} else {
				pendingIdentity = `item-${pocket.key}-${item.id}-quantity`;
				const quantity = input(pendingIdentity);
				quantity.focus();
				enterValue(
					quantity,
					String(item.quantity === item.maxQuantity ? item.quantity - 1 : item.quantity + 1)
				);
				press(quantity, 'Enter');
			}
			await vi.waitFor(() => expect(harness.currentPendingTargets()).toContain(pendingIdentity));

			const firstMount = mounted;
			if (!firstMount) throw new Error('Bag harness was not mounted.');
			await unmount(firstMount);
			mounted = null;
			mounted = mount(SaveFileBagTestHarness, {
				target: host,
				props: { workspace, activeBox: 0, coordinator, engine, toast }
			});
			await tick();
			const remounted = mounted as unknown as MountedHarness;
			await vi.waitFor(() => expect(remounted.currentPendingTargets()).toContain(pendingIdentity));
			expect(remounted.currentLedgerProps().command).toBeNull();
			expect(remounted.currentLedgerProps().drafts?.itemQuantities).toEqual({});

			if (operation === 'add') {
				expect(target(`pocket-${pocket.key}-add`).getAttribute('aria-busy')).toBe('true');
			} else {
				const itemRow = host.querySelector<HTMLElement>(
					`[data-ledger-row="item-${pocket.key}-${item.id}"]`
				)!;
				expect(itemRow.getAttribute('aria-busy')).toBe('true');
				if (operation === 'quantity') expect(input(pendingIdentity).readOnly).toBe(true);
				else expect(target(`item-${pocket.key}-${item.id}-remove`).ariaDisabled).toBe('true');
			}

			editGate.resolve();
			await vi.waitFor(() =>
				expect(remounted.currentPendingTargets()).not.toContain(pendingIdentity)
			);
			expect(toast.error).not.toHaveBeenCalled();
			expect(fixtureBytes).toEqual(unchangedFixture);
		},
		60_000
	);

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

	test('uses one shared session for Bag origin, pending state, and coordinator Retry', async () => {
		const firstEdit = deferred<void>();
		const fatalEdit = deferred<void>();
		let editCall = 0;
		const applySaveFileEditOperation = vi.fn<EngineApi['applySaveFileEditOperation']>(
			async (...args) => {
				editCall += 1;
				if (editCall === 1) await firstEdit.promise;
				if (editCall === 2) await fatalEdit.promise;
				return engine.applySaveFileEditOperation(...args);
			}
		);
		const loadSaveWorkspace = vi.fn<EngineApi['loadSaveWorkspace']>((...args) =>
			engine.loadSaveWorkspace(...args)
		);
		const coordinatorEngine: EngineApi = {
			...engine,
			applySaveFileEditOperation,
			loadSaveWorkspace
		};
		const staleCatalogue =
			deferred<Awaited<ReturnType<EngineApi['getSaveFileInventoryCatalogue']>>>();
		let catalogueCall = 0;
		const getSaveFileInventoryCatalogue = vi.fn<EngineApi['getSaveFileInventoryCatalogue']>(
			async (...args) => {
				catalogueCall += 1;
				if (catalogueCall === 2) return staleCatalogue.promise;
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
			coordinator,
			openWorkspace,
			subscribePending,
			harness
		} = await setup(coordinatorEngine, { getSaveFileInventoryCatalogue });
		const recoverWorkspace = vi.spyOn(coordinator, 'recoverWorkspace');
		await vi.waitFor(() =>
			expect((target(`pocket-${pocket.key}-add`) as HTMLButtonElement).disabled).toBe(false)
		);
		expect(openWorkspace).toHaveBeenCalledOnce();
		expect(subscribePending).toHaveBeenCalledOnce();

		let props = harness.currentLedgerProps();
		const firstQuantity =
			item.quantity === item.maxQuantity ? item.quantity - 1 : item.quantity + 1;
		props.onItemQuantityInput?.(pocket.key, item.id, String(firstQuantity));
		props.onItemQuantityCommit?.(pocket.key, item.id, commitContext('enter'));
		await vi.waitFor(() =>
			expect(harness.currentPendingTargets()).toContain(`item-${pocket.key}-${item.id}-quantity`)
		);
		expect(subscribePending).toHaveBeenCalledOnce();
		firstEdit.resolve();
		await waitForItem(harness, pocket.key, item.id, firstQuantity);
		props = harness.currentLedgerProps();
		expect(props.drafts?.itemQuantities?.[`${pocket.key}:${item.id}`]).toBeUndefined();

		props.onRetryCatalogue?.(pocket.key);
		await vi.waitFor(() => expect(getSaveFileInventoryCatalogue).toHaveBeenCalledTimes(2));
		const fatalQuantity =
			firstQuantity === item.maxQuantity ? firstQuantity - 1 : firstQuantity + 1;
		props.onItemQuantityInput?.(pocket.key, item.id, String(fatalQuantity));
		props.onCommandChange?.({
			kind: 'add-item',
			pocketKey: pocket.key,
			itemId: null,
			quantity: '1'
		});
		props.onItemQuantityCommit?.(pocket.key, item.id, commitContext('enter'));
		await vi.waitFor(() => expect(harness.currentPendingTargets().length).toBeGreaterThan(0));
		const recoveryBasis = harness.currentWorkspace();
		const recoveryBytes = recoveryBasis.bytes.slice();
		const originBeforeFailure = harness.currentOrigin();
		coordinator.replaceWorkspace(recoveryBasis, 0);
		fatalEdit.resolve();
		await vi.waitFor(() => {
			const view = harness.currentLedgerProps().view;
			expect(view.status).toBe('ready');
			if (view.status === 'ready') expect(view.editingUnavailable?.message).toBeTruthy();
		});

		props = harness.currentLedgerProps();
		expect(props.command).toBeNull();
		expect(props.drafts?.itemQuantities).toEqual({});
		expect(input(`item-${pocket.key}-${item.id}-quantity`).disabled).toBe(true);

		target('editing-retry').click();
		await vi.waitFor(() => {
			expect(harness.currentOrigin()).not.toEqual(originBeforeFailure);
			const view = harness.currentLedgerProps().view;
			expect(view.status).toBe('ready');
			if (view.status === 'ready') expect(view.editingUnavailable).toBeNull();
		});
		expect(recoverWorkspace).toHaveBeenCalledOnce();
		expect(recoverWorkspace).toHaveBeenCalledWith(originBeforeFailure, {
			isCurrent: expect.any(Function)
		});
		expect(loadSaveWorkspace).toHaveBeenCalledOnce();
		expect(loadSaveWorkspace.mock.calls[0][0]).toEqual(recoveryBytes);
		expect(loadSaveWorkspace.mock.calls[0][0]).not.toBe(recoveryBasis.bytes);
		expect(harness.currentWorkspace().bytes).toEqual(recoveryBytes);
		expect(harness.currentWorkspace().workspace).toEqual(recoveryBasis.workspace);
		expect(subscribePending).toHaveBeenCalledTimes(2);
		await vi.waitFor(() =>
			expect(harness.currentLedgerProps().catalogues?.[pocket.key]?.status).toBe('ready')
		);
		staleCatalogue.resolve({
			ok: false,
			value: null,
			error: { code: 'engine-unavailable', message: 'Old catalogue result.' }
		});
		await tick();
		expect(harness.currentLedgerProps().catalogues?.[pocket.key]?.status).toBe('ready');
		expect(harness.currentLedgerProps().command).toBeNull();
		expect(harness.currentLedgerProps().drafts?.itemQuantities).toEqual({});

		const acceptedAfterRetry = harness
			.currentWorkspace()
			.workspace.saveFile!.inventory.pockets.find((candidate) => candidate.key === pocket.key)!
			.items.find((candidate) => candidate.id === item.id)!;
		const finalQuantity =
			acceptedAfterRetry.quantity === acceptedAfterRetry.maxQuantity
				? acceptedAfterRetry.quantity - 1
				: acceptedAfterRetry.quantity + 1;
		props = harness.currentLedgerProps();
		props.onItemQuantityInput?.(pocket.key, item.id, String(finalQuantity));
		props.onItemQuantityCommit?.(pocket.key, item.id, commitContext('enter'));
		await waitForItem(harness, pocket.key, item.id, finalQuantity);
		expect(await storage.listBackups(workspace.file.id)).toHaveLength(1);
		expect(fixtureBytes).toEqual(unchangedFixture);
	}, 60_000);
});
