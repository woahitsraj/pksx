import { createPkhexEngine, type SaveFileEditableProjection } from '$lib/engine';
import { dispatchControllerKey } from '$lib/pksx/controller-input';
import { mount, tick, unmount } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import fixtureUrl from '../../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav?url';
import SaveFileLedger from './SaveFileLedger.svelte';
import SaveFileLedgerTestHarness from './save-file-ledger/SaveFileLedgerTestHarness.svelte';
import {
	captureDestinationFocus,
	isFocusableTarget,
	resolveDestinationFocus
} from '$lib/pksx/destination-focus';
import type {
	SaveFileLedgerCatalogue,
	SaveFileLedgerDestination,
	SaveFileLedgerProps,
	SaveFileLedgerView
} from './save-file-ledger/types';

let publicFixtureView: Extract<SaveFileLedgerView, { status: 'ready' }>;
let publicCatalogues: Readonly<Record<string, SaveFileLedgerCatalogue>>;
let mounted: ReturnType<typeof mount> | null = null;
let host: HTMLElement;

beforeAll(async () => {
	const [engine, response] = await Promise.all([
		createPkhexEngine('/pkhex-engine'),
		fetch(fixtureUrl)
	]);
	const bytes = new Uint8Array(await response.arrayBuffer());
	const [workspace, catalogue] = await Promise.all([
		engine.loadSaveWorkspace(bytes, '011020251345.sav', 0),
		engine.getSaveFileInventoryCatalogue(bytes, '011020251345.sav')
	]);
	if (!workspace.ok || !workspace.value.saveFile) {
		throw new Error(
			workspace.error?.message ?? 'Public Emerald fixture has no Save File projection.'
		);
	}
	if (!catalogue.ok) throw new Error(catalogue.error.message);

	publicFixtureView = {
		status: 'ready',
		originalFilename: '011020251345.sav',
		summary: workspace.value.summary,
		projection: workspace.value.saveFile
	};
	publicCatalogues = Object.fromEntries(
		catalogue.value.pockets.map((pocket) => [
			pocket.key,
			{ status: 'ready' as const, availableItems: pocket.availableItems }
		])
	);
}, 60_000);

afterEach(async () => {
	await clearMounted();
});

async function clearMounted() {
	if (mounted) await unmount(mounted);
	mounted = null;
	host?.remove();
	document.body.replaceChildren();
}

afterAll(() => {
	document.documentElement.removeAttribute('data-input-modality');
});

function render(
	view: SaveFileLedgerView = publicFixtureView,
	options: {
		destination?: SaveFileLedgerDestination;
		width?: number;
		height?: number;
		catalogues?: Readonly<Record<string, SaveFileLedgerCatalogue>>;
		pendingTargets?: readonly string[];
		harness?: boolean;
		props?: Partial<SaveFileLedgerProps>;
	} = {}
) {
	host = document.createElement('div');
	host.style.width = `${options.width ?? 640}px`;
	host.style.height = `${options.height ?? 360}px`;
	host.style.padding = '12px';
	host.style.boxSizing = 'border-box';
	document.body.append(host);

	const props = {
		destination: options.destination ?? 'bag',
		initialView: view,
		initialCatalogues: options.catalogues ?? publicCatalogues,
		pendingTargets: options.pendingTargets ?? [],
		getSessionFocusIdentity: options.props?.getSessionFocusIdentity
	};
	mounted =
		options.harness === false
			? mount(SaveFileLedger, {
					target: host,
					props: {
						destination: props.destination,
						view,
						catalogues: props.initialCatalogues,
						pendingTargets: props.pendingTargets,
						...options.props
					}
				})
			: mount(SaveFileLedgerTestHarness, { target: host, props });
	return mounted as unknown as {
		setView: (view: SaveFileLedgerView) => void;
		setCatalogues: (catalogues: Readonly<Record<string, SaveFileLedgerCatalogue>>) => void;
		setPendingTargets: (targets: readonly string[]) => void;
		setCommand: (command: SaveFileLedgerProps['command']) => void;
		handleBack: () => boolean;
	};
}

function target(identity: string) {
	return host.querySelector<HTMLElement>(`[data-destination-focus="${identity}"]`)!;
}

async function expectFocused(identity: string) {
	await vi.waitFor(() => expect(document.activeElement).toBe(target(identity)));
}

function press(targetElement: HTMLElement, key: string) {
	targetElement.dispatchEvent(
		new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
	);
}

function projectionWithItems(
	pocketKey: string,
	items: SaveFileEditableProjection['inventory']['pockets'][number]['items']
) {
	return {
		...publicFixtureView,
		projection: {
			...publicFixtureView.projection,
			inventory: {
				...publicFixtureView.projection.inventory,
				pockets: publicFixtureView.projection.inventory.pockets.map((pocket) =>
					pocket.key === pocketKey ? { ...pocket, items } : pocket
				)
			}
		}
	} satisfies Extract<SaveFileLedgerView, { status: 'ready' }>;
}

describe('SaveFileLedger public fixture presentation', () => {
	test('renders separate Trainer and Bag destinations without mock, staging, table, or imagery residue', async () => {
		render(publicFixtureView, { destination: 'bag' });

		expect(host.querySelectorAll('.pocket-section')).toHaveLength(
			publicFixtureView.projection.inventory.pockets.length
		);
		expect(host.querySelectorAll('.pocket-section h3')).toHaveLength(
			publicFixtureView.projection.inventory.pockets.length
		);
		expect(host.querySelector('table, [role="table"], img, svg')).toBeNull();
		expect(host.querySelector('.mock-section, .mock-field, .apply-bar, .item-icon')).toBeNull();
		expect(host.textContent).not.toMatch(/staged|Apply edits|Cancel all|generation|box count/i);
		expect(host.textContent).not.toContain('¤');
		expect(host.textContent).not.toContain('·');
		expect(host.querySelector('[data-destination-root="bag"]')).not.toBeNull();
		expect(host.querySelector('[data-testid="trainer-ledger-scrollport"]')).toBeNull();

		const identities = Array.from(
			host.querySelectorAll<HTMLElement>('[data-destination-focus]'),
			(element) => element.dataset.destinationFocus
		);
		expect(new Set(identities).size).toBe(identities.length);

		await clearMounted();
		render(publicFixtureView, { destination: 'trainer' });
		expect(host.querySelector('[data-destination-root="trainer"]')).not.toBeNull();
		expect(host.querySelector('.bag-block, .pocket-section')).toBeNull();
		expect(target('trainer-name').getAttribute('aria-label')).toBe('Trainer name');
		expect(target('money-decrease').getAttribute('aria-label')).toBe('Decrease Money');
		expect(target('money-increase').getAttribute('aria-label')).toBe('Increase Money');
		expect(host.textContent).not.toMatch(/staged|Apply edits|Cancel all|generation|box count/i);
	});

	test('keeps each destination independent across container aspect changes', async () => {
		render(publicFixtureView, { destination: 'trainer', width: 640, height: 360 });
		await tick();
		const container = host.querySelector<HTMLElement>('.save-file-ledger-container')!;
		const content = host.querySelector<HTMLElement>('.destination-content')!;
		const trainer = host.querySelector<HTMLElement>('.details-block')!;
		expect(getComputedStyle(container).containerName).toBe('save-file-ledger');
		expect(trainer.getBoundingClientRect().width).toBeCloseTo(
			content.getBoundingClientRect().width,
			0
		);
		expect(host.querySelector('.bag-block, .ledger-layout')).toBeNull();

		host.style.height = '640px';
		await new Promise(requestAnimationFrame);
		expect(container.clientWidth).toBe(container.clientHeight);
		expect(host.querySelector('.bag-block')).toBeNull();

		await clearMounted();
		render(publicFixtureView, { destination: 'bag', width: 393, height: 852 });
		await tick();
		const bagContainer = host.querySelector<HTMLElement>('.save-file-ledger-container')!;
		expect(bagContainer.clientWidth).toBeLessThan(bagContainer.clientHeight);
		expect(host.querySelector('.details-block, .ledger-layout')).toBeNull();
		expect(
			host.querySelector<HTMLElement>('[data-testid="bag-ledger-scrollport"]')!.scrollWidth
		).toBeLessThanOrEqual(bagContainer.clientWidth);
	});

	test('selects presentation without changing the shared engine projection', async () => {
		render(publicFixtureView, { destination: 'bag', width: 640, height: 360 });
		await tick();
		const bag = host.querySelector<HTMLElement>('.bag-block')!;
		const content = host.querySelector<HTMLElement>('.destination-content')!;
		expect(host.querySelector('.details-block')).toBeNull();
		expect(bag.getBoundingClientRect().width).toBeCloseTo(content.getBoundingClientRect().width, 0);
		expect(bag.getBoundingClientRect().height).toBeCloseTo(
			content.getBoundingClientRect().height,
			0
		);

		await clearMounted();
		render(publicFixtureView, { destination: 'trainer', width: 640, height: 360 });
		await tick();
		expect(host.querySelector('.bag-block')).toBeNull();
		expect(host.querySelectorAll('.details-section')).toHaveLength(2);
		expect(target('trainer-name')).not.toBeNull();
		expect(target('money-value')).not.toBeNull();
	});

	test('contains an open Add command and wrapped error at the 616 by 336 safe allocation', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const addConfirmIdentity = `pocket-${pocket.key}-add-confirm`;
		render(publicFixtureView, {
			width: 640,
			height: 360,
			harness: false,
			props: {
				errors: {
					[addConfirmIdentity]:
						'This item could not be added to the selected pocket because the engine rejected the requested change. Choose another item or quantity, then try the Add Item command again.'
				},
				command: {
					kind: 'add-item',
					pocketKey: pocket.key,
					itemId: null,
					quantity: '',
					quantityError:
						'Enter a whole number between one and the maximum quantity allowed for this selected Bag item.'
				}
			}
		});
		await tick();
		const frame = host.querySelector<HTMLElement>('.save-file-ledger-frame')!;
		const command = host.querySelector<HTMLElement>('.add-command')!;
		const pocketCommand = command.closest<HTMLElement>('.pocket-command')!;
		expect(frame.clientWidth).toBe(616);
		expect(frame.clientHeight).toBe(336);
		expect(command.scrollWidth).toBeLessThanOrEqual(command.clientWidth);
		expect(command.getBoundingClientRect().right).toBeLessThanOrEqual(
			pocketCommand.getBoundingClientRect().right + 1
		);
		expect(command.querySelector('.field-error')?.getBoundingClientRect().height).toBeGreaterThan(
			16
		);
		expect(target(addConfirmIdentity).getAttribute('aria-describedby')).toBe(
			`${addConfirmIdentity}-error`
		);
	});

	test('keeps each destination scroll local and preserves full Bag accessible names', async () => {
		const longName =
			'A very long public fixture filename that must remain available to assistive technology.sav';
		render({ ...publicFixtureView, originalFilename: longName }, { width: 640, height: 360 });
		await tick();
		const ledger = host.querySelector<HTMLElement>('[data-testid="bag-ledger-scrollport"]')!;
		const filename = host.querySelector<HTMLElement>('.filename')!;
		const itemName = host.querySelector<HTMLElement>('.item-copy strong')!;

		expect(getComputedStyle(ledger).overflowY).toBe('auto');
		expect(ledger.scrollHeight).toBeGreaterThan(ledger.clientHeight);
		expect(getComputedStyle(host.querySelector<HTMLElement>('.ledger-screen')!).overflowY).toBe(
			'hidden'
		);
		expect(filename.textContent).toBe(longName);
		expect(filename.title).toBe(longName);
		expect(getComputedStyle(filename).textOverflow).toBe('ellipsis');
		expect(getComputedStyle(itemName).webkitLineClamp).toBe('2');

		await clearMounted();
		render(publicFixtureView, { destination: 'trainer', width: 360, height: 200 });
		await tick();
		const trainer = host.querySelector<HTMLElement>('[data-testid="trainer-ledger-scrollport"]')!;
		expect(getComputedStyle(trainer).overflowY).toBe('auto');
		expect(trainer.scrollHeight).toBeGreaterThan(trainer.clientHeight);
		expect(getComputedStyle(host.querySelector<HTMLElement>('.ledger-screen')!).overflowY).toBe(
			'hidden'
		);
	});
});

describe('SaveFileLedger semantic focus graph', () => {
	test('keeps one semantic row order within each destination', async () => {
		render(publicFixtureView, { destination: 'trainer' });
		const rowOrder = () =>
			Array.from(
				host.querySelectorAll<HTMLElement>('[data-ledger-row]'),
				(row) => row.dataset.ledgerRow
			);
		expect(rowOrder()).toEqual(['trainer-name', 'trainer-gender', 'money']);

		host.style.height = '640px';
		await new Promise(requestAnimationFrame);
		expect(rowOrder()).toEqual(['trainer-name', 'trainer-gender', 'money']);

		await clearMounted();
		render(publicFixtureView, { destination: 'bag' });
		await tick();
		expect(rowOrder()[0]).toBe('pocket-jumps');
		expect(
			rowOrder()
				.slice(1)
				.every((row) => row?.startsWith('pocket-') || row?.startsWith('item-'))
		).toBe(true);
	});

	test('moves within Trainer rows and enters Bag pockets independently', async () => {
		render(publicFixtureView, { destination: 'trainer' });
		await tick();
		const decrease = target('money-decrease');
		decrease.focus();
		press(decrease, 'ArrowRight');
		expect(document.activeElement).toBe(target('money-value'));

		dispatchControllerKey('ArrowUp');
		expect(document.activeElement).toBe(target('trainer-gender-female'));

		await clearMounted();
		render(publicFixtureView, { destination: 'bag' });
		await tick();
		const secondJump = host.querySelectorAll<HTMLElement>('[data-ledger-jump]')[1];
		secondJump.focus();
		press(secondJump, 'ArrowDown');
		expect(document.activeElement?.getAttribute('data-destination-focus')).toBe(
			`pocket-${secondJump.dataset.ledgerJump}-add`
		);
	});

	test('returns upward to a row whose control is the row itself', async () => {
		render({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.' }
		});
		await tick();
		const jump = host.querySelector<HTMLElement>('[data-ledger-jump]')!;
		jump.focus();
		dispatchControllerKey('ArrowUp');
		expect(document.activeElement).toBe(target('editing-retry'));
	});

	test('keeps focused pocket jumps visible and activation leaves focus on the jump', async () => {
		render(publicFixtureView, { width: 360, height: 640 });
		await tick();
		const row = host.querySelector<HTMLElement>('.pocket-jumps')!;
		const jump =
			row.querySelectorAll<HTMLElement>('button')[row.querySelectorAll('button').length - 1];
		jump.focus();
		await tick();
		const jumpRect = jump.getBoundingClientRect();
		const rowRect = row.getBoundingClientRect();
		expect(jumpRect.left).toBeGreaterThanOrEqual(rowRect.left - 1);
		expect(jumpRect.right).toBeLessThanOrEqual(rowRect.right + 1);

		const ledger = host.querySelector<HTMLElement>('[data-testid="bag-ledger-scrollport"]')!;
		ledger.scrollTop = 0;
		jump.click();
		expect(document.activeElement).toBe(jump);
		expect(ledger.scrollTop).toBeGreaterThan(0);
	});

	test('opens and closes one controlled command with the specified focus returns', async () => {
		render();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const add = target(`pocket-${pocket.key}-add`) as HTMLButtonElement;
		add.click();
		await expectFocused(`pocket-${pocket.key}-add-item`);
		dispatchControllerKey('Escape');
		await expectFocused(`pocket-${pocket.key}-add`);

		const firstItem = pocket.items[0];
		const remove = target(`item-${pocket.key}-${firstItem.id}-remove`) as HTMLButtonElement;
		remove.click();
		await expectFocused(`item-${pocket.key}-${firstItem.id}-confirm-remove`);
		dispatchControllerKey('Escape');
		await expectFocused(`item-${pocket.key}-${firstItem.id}-remove`);
	});

	test('keeps an unrelated live draft focused when pending Add or Remove completes', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		let harness = render();
		let quantities = host.querySelectorAll<HTMLInputElement>('[data-ledger-draft="item-quantity"]');
		let liveQuantity = quantities[0];
		(target(`pocket-${pocket.key}-add`) as HTMLButtonElement).click();
		await expectFocused(`pocket-${pocket.key}-add-item`);
		const quantityBlur = vi.fn();
		liveQuantity.addEventListener('blur', quantityBlur);
		liveQuantity.focus();
		harness.setPendingTargets([`pocket-${pocket.key}-add-confirm`]);
		harness.setCommand(null);
		await tick();
		await tick();
		expect(document.activeElement).toBe(liveQuantity);
		expect(quantityBlur).not.toHaveBeenCalled();

		await clearMounted();
		harness = render();
		quantities = host.querySelectorAll<HTMLInputElement>('[data-ledger-draft="item-quantity"]');
		liveQuantity = quantities[0];
		const removedQuantity = Array.from(quantities).find(
			(candidate) =>
				candidate.dataset.pocketKey !== liveQuantity.dataset.pocketKey ||
				candidate.dataset.itemId !== liveQuantity.dataset.itemId
		)!;
		const removedPocketKey = removedQuantity.dataset.pocketKey!;
		const removedItemId = Number(removedQuantity.dataset.itemId);
		(target(`item-${removedPocketKey}-${removedItemId}-remove`) as HTMLButtonElement).click();
		await expectFocused(`item-${removedPocketKey}-${removedItemId}-confirm-remove`);
		const removeQuantityBlur = vi.fn();
		liveQuantity.addEventListener('blur', removeQuantityBlur);
		liveQuantity.focus();
		harness.setPendingTargets([`item-${removedPocketKey}-${removedItemId}-confirm-remove`]);
		harness.setCommand(null);
		await tick();
		await tick();
		expect(document.activeElement).toBe(liveQuantity);
		expect(removeQuantityBlur).not.toHaveBeenCalled();
	});

	test('re-enters an open Add command from its pocket jump', async () => {
		render();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		(target(`pocket-${pocket.key}-add`) as HTMLButtonElement).click();
		await expectFocused(`pocket-${pocket.key}-add-item`);
		dispatchControllerKey('ArrowUp');
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-jump`));
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add-item`));
	});

	test('moves to the next item after removal', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		render();
		const first = pocket.items[0];
		const second = pocket.items[1];
		(target(`item-${pocket.key}-${first.id}-remove`) as HTMLButtonElement).click();
		await expectFocused(`item-${pocket.key}-${first.id}-confirm-remove`);
		(target(`item-${pocket.key}-${first.id}-confirm-remove`) as HTMLButtonElement).click();
		await vi.waitFor(() =>
			expect(
				document.activeElement?.closest('[data-ledger-row]')?.getAttribute('data-ledger-row')
			).toBe(`item-${pocket.key}-${second.id}`)
		);
	});

	test('moves to Add Item when the removed item was alone', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const second = pocket.items[1];
		const oneItemView = projectionWithItems(pocket.key, [second]);
		render(oneItemView);
		(target(`item-${pocket.key}-${second.id}-remove`) as HTMLButtonElement).click();
		await expectFocused(`item-${pocket.key}-${second.id}-confirm-remove`);
		(target(`item-${pocket.key}-${second.id}-confirm-remove`) as HTMLButtonElement).click();
		await expectFocused(`pocket-${pocket.key}-add`);
	});

	test('moves to the previous item when removing the last item', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const previous = pocket.items[0];
		const last = pocket.items[1];
		render(projectionWithItems(pocket.key, [previous, last]));
		(target(`item-${pocket.key}-${last.id}-remove`) as HTMLButtonElement).click();
		await expectFocused(`item-${pocket.key}-${last.id}-confirm-remove`);
		(target(`item-${pocket.key}-${last.id}-confirm-remove`) as HTMLButtonElement).click();
		await vi.waitFor(() =>
			expect(
				document.activeElement?.closest('[data-ledger-row]')?.getAttribute('data-ledger-row')
			).toBe(`item-${pocket.key}-${previous.id}`)
		);
	});

	test('refreshes a surviving item index before a later removal fallback', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 5
		)!;
		const [first, second, focused, next, last] = pocket.items;
		const harness = render(projectionWithItems(pocket.key, [first, second, focused, next, last]));
		const focusedIdentity = `item-${pocket.key}-${focused.id}-remove`;
		await tick();
		await tick();
		target(focusedIdentity).focus();

		harness.setView(projectionWithItems(pocket.key, [second, focused, next, last]));
		await tick();
		await tick();
		await expectFocused(focusedIdentity);

		harness.setView(projectionWithItems(pocket.key, [second, next, last]));
		await expectFocused(`item-${pocket.key}-${next.id}-decrease`);
	});

	test('falls back from a vanished catalogue Retry and restores focus after route editing Retry', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const failedCatalogues = {
			...publicCatalogues,
			[pocket.key]: { status: 'failed' as const, message: 'Catalogue unavailable.' }
		};
		const harness = render(publicFixtureView, { catalogues: failedCatalogues });
		const retry = target(`pocket-${pocket.key}-retry`);
		retry.focus();
		harness.setCatalogues(publicCatalogues);
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add`));

		const remembered = target(`item-${pocket.key}-${pocket.items[0].id}-remove`);
		remembered.focus();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor service unavailable.' }
		});
		await expectFocused('editing-retry');
		harness.setView(publicFixtureView);
		await tick();
		await tick();
		expect(document.activeElement).toBe(remembered);
	});

	test('does not refocus editing Retry while recovery continues and another target survives', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const harness = render({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor service unavailable.' }
		});
		await expectFocused('editing-retry');
		const jump = target(`pocket-${pocket.key}-jump`);
		jump.focus();
		harness.setCatalogues({
			...publicCatalogues,
			[pocket.key]: { status: 'failed', message: 'Catalogue unavailable.' }
		});
		await tick();
		await tick();
		expect(document.activeElement).toBe(jump);

		const catalogueRetry = target(`pocket-${pocket.key}-retry`);
		catalogueRetry.focus();
		harness.setCatalogues({
			...publicCatalogues,
			[pocket.key]: { status: 'loading', retrying: true }
		});
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-retry`));
	});

	test('keeps catalogue Retry focused through retrying and returns to Add without stealing focus', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const failedCatalogues = {
			...publicCatalogues,
			[pocket.key]: { status: 'failed' as const, message: 'Catalogue unavailable.' }
		};
		const retryingCatalogues = {
			...publicCatalogues,
			[pocket.key]: { status: 'loading' as const, retrying: true }
		};
		const emptyView = projectionWithItems(pocket.key, []);
		let harness = render(emptyView, { catalogues: failedCatalogues });
		target(`pocket-${pocket.key}-retry`).focus();
		harness.setCatalogues(retryingCatalogues);
		await tick();
		await tick();
		const retrying = target(`pocket-${pocket.key}-retry`);
		expect(document.activeElement).toBe(retrying);
		expect(retrying.getAttribute('aria-label')).toBe(`Retry ${pocket.label} catalogue`);
		expect(retrying.getAttribute('aria-busy')).toBe('true');
		expect(retrying.getAttribute('aria-disabled')).toBe('true');
		expect(retrying.querySelector('.spinner-graphic')).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(retrying.querySelector('.spinner-graphic')).not.toBeNull();
		harness.setCatalogues(publicCatalogues);
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add`));

		await clearMounted();
		harness = render(publicFixtureView, { catalogues: failedCatalogues });
		target(`pocket-${pocket.key}-retry`).focus();
		harness.setCatalogues(retryingCatalogues);
		await tick();
		await tick();
		const quantityIdentity = `item-${pocket.key}-${pocket.items[0].id}-quantity`;
		target(quantityIdentity).focus();
		harness.setCatalogues(publicCatalogues);
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(quantityIdentity));
	});

	test('enters a pocket through Retry, first item, the next pocket, then clamps', async () => {
		const [first, second] = publicFixtureView.projection.inventory.pockets;
		const firstJump = () => target(`pocket-${first.key}-jump`);

		render(publicFixtureView, {
			catalogues: {
				...publicCatalogues,
				[first.key]: { status: 'failed', message: 'Catalogue unavailable.' }
			}
		});
		await tick();
		firstJump().focus();
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(target(`pocket-${first.key}-retry`));

		await clearMounted();
		render(publicFixtureView, {
			catalogues: {
				...publicCatalogues,
				[first.key]: { status: 'ready', availableItems: first.items }
			}
		});
		await tick();
		firstJump().focus();
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(target(`item-${first.key}-${first.items[0].id}-decrease`));

		const emptyFirstView = {
			...publicFixtureView,
			projection: {
				...publicFixtureView.projection,
				inventory: {
					...publicFixtureView.projection.inventory,
					pockets: publicFixtureView.projection.inventory.pockets.map((pocket) =>
						pocket.key === first.key ? { ...pocket, full: true, items: [] } : pocket
					)
				}
			}
		} satisfies Extract<SaveFileLedgerView, { status: 'ready' }>;
		await clearMounted();
		render(emptyFirstView);
		await tick();
		firstJump().focus();
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(target(`pocket-${second.key}-add`));

		await clearMounted();
		render(
			{
				...publicFixtureView,
				editingUnavailable: { message: 'Editor unavailable.' }
			},
			{
				catalogues: {
					...publicCatalogues,
					[second.key]: { status: 'failed', message: 'Catalogue unavailable.' }
				}
			}
		);
		await tick();
		firstJump().focus();
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(target(`pocket-${second.key}-retry`));

		const noPocketTargets = {
			...emptyFirstView,
			projection: {
				...emptyFirstView.projection,
				inventory: {
					...emptyFirstView.projection.inventory,
					pockets: emptyFirstView.projection.inventory.pockets.map((pocket) => ({
						...pocket,
						full: true,
						items: []
					}))
				}
			}
		} satisfies Extract<SaveFileLedgerView, { status: 'ready' }>;
		await clearMounted();
		render(noPocketTargets);
		await tick();
		const lastJump = host
			.querySelectorAll<HTMLElement>('[data-ledger-jump]')
			.item(noPocketTargets.projection.inventory.pockets.length - 1);
		lastJump.focus();
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(lastJump);
	});

	test('publishes ordered remount fallbacks through the shell identity seam', () => {
		render();
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 3
		)!;
		const item = pocket.items[1];
		const fallbacks = JSON.parse(
			target(`item-${pocket.key}-${item.id}-remove`).dataset.destinationFallbacks!
		) as string[];
		expect(fallbacks.slice(0, 3)).toEqual([
			`item-${pocket.key}-${pocket.items[2].id}-decrease`,
			`item-${pocket.key}-${pocket.items[0].id}-decrease`,
			`pocket-${pocket.key}-add`
		]);
		expect(fallbacks).toContain(
			`pocket-${publicFixtureView.projection.inventory.pockets[1].key}-add`
		);
	});

	test('resolves captured Ledger identities after command closure and item removal remounts', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const first = pocket.items[0];
		const second = pocket.items[1];

		render();
		(target(`item-${pocket.key}-${first.id}-remove`) as HTMLButtonElement).click();
		await tick();
		const confirmMemory = captureDestinationFocus(
			target(`item-${pocket.key}-${first.id}-confirm-remove`),
			'captured-confirm'
		)!;
		await clearMounted();
		render();
		expect(resolveDestinationFocus(host, confirmMemory)).toBe(
			target(`item-${pocket.key}-${first.id}-remove`)
		);

		const removalMemory = captureDestinationFocus(
			target(`item-${pocket.key}-${first.id}-remove`),
			'captured-remove'
		)!;
		await clearMounted();
		render(
			projectionWithItems(
				pocket.key,
				pocket.items.filter((item) => item.id !== first.id)
			)
		);
		expect(resolveDestinationFocus(host, removalMemory)).toBe(
			target(`item-${pocket.key}-${second.id}-decrease`)
		);

		await clearMounted();
		render();
		(target(`pocket-${pocket.key}-add`) as HTMLButtonElement).click();
		await tick();
		const addMemory = captureDestinationFocus(
			target(`pocket-${pocket.key}-add-quantity`),
			'captured-add'
		)!;
		await clearMounted();
		render();
		expect(resolveDestinationFocus(host, addMemory)).toBe(target(`pocket-${pocket.key}-add`));
	});

	test('uses the shell focus predicate for disabled, inherited-disabled, and aria-disabled targets', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const removed = pocket.items[0];
		render(projectionWithItems(pocket.key, [removed]));
		const memory = captureDestinationFocus(
			target(`item-${pocket.key}-${removed.id}-remove`),
			'captured-remove'
		)!;
		const failedCatalogues = {
			...publicCatalogues,
			[pocket.key]: { status: 'failed' as const, message: 'Catalogue unavailable.' }
		};
		await clearMounted();
		render(projectionWithItems(pocket.key, []), { catalogues: failedCatalogues });
		expect((target(`pocket-${pocket.key}-add`) as HTMLButtonElement).disabled).toBe(true);
		expect(resolveDestinationFocus(host, memory)).toBe(target(`pocket-${pocket.key}-retry`));

		const idOnly = document.createElement('button');
		idOnly.id = 'disabled-id-only';
		idOnly.disabled = true;
		host.append(idOnly);
		expect(
			resolveDestinationFocus(host, { id: idOnly.id, identity: null, fallbackIdentities: [] })
		).toBeNull();

		const fieldset = document.createElement('fieldset');
		fieldset.disabled = true;
		const inherited = document.createElement('button');
		fieldset.append(inherited);
		host.append(fieldset);
		expect(isFocusableTarget(inherited)).toBe(false);

		const ariaDisabled = target(`pocket-${pocket.key}-retry`);
		ariaDisabled.setAttribute('aria-disabled', 'true');
		expect(isFocusableTarget(ariaDisabled)).toBe(true);
	});

	test('preserves shell content memory while recovery controls receive focus', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const itemIdentity = `item-${pocket.key}-${pocket.items[0].id}-remove`;
		render();
		let memory = captureDestinationFocus(target(itemIdentity), 'content-control')!;
		await clearMounted();
		render(
			{ status: 'load-failed', message: 'Could not read the Save File.' },
			{
				props: { getSessionFocusIdentity: () => memory.identity }
			}
		);
		await tick();
		const retry = target('load-retry');
		memory = captureDestinationFocus(retry, 'load-retry-control', memory)!;
		expect(memory.identity).toBe(itemIdentity);
		const back = target('back-boxes');
		back.focus();
		expect(captureDestinationFocus(back, 'back-control', memory)).toBe(memory);
		expect(captureDestinationFocus(back, 'back-control')).toBeNull();

		await clearMounted();
		const remounted = render(
			{ status: 'load-failed', message: 'Could not read the Save File again.' },
			{ props: { getSessionFocusIdentity: () => memory.identity } }
		);
		await expectFocused('load-retry');
		remounted.setView(publicFixtureView);
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(itemIdentity));
	});

	test('restores exact session focus after load and editing recovery', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const itemIdentity = `item-${pocket.key}-${pocket.items[0].id}-remove`;
		const harness = render(publicFixtureView, {
			props: { getSessionFocusIdentity: () => itemIdentity }
		});
		target(itemIdentity).focus();
		harness.setView({ status: 'loading' });
		await tick();
		harness.setView({ status: 'load-failed', message: 'Could not read the Save File.' });
		await expectFocused('load-retry');
		harness.setView({ status: 'loading' });
		await tick();
		harness.setView({
			status: 'load-failed',
			message: 'Could not read the Save File.',
			retrying: true
		});
		await expectFocused('load-retry');
		harness.setView(publicFixtureView);
		await expectFocused(itemIdentity);

		await clearMounted();
		const unavailable = render(
			{
				...publicFixtureView,
				editingUnavailable: { message: 'Editor unavailable.' }
			},
			{ props: { getSessionFocusIdentity: () => itemIdentity } }
		);
		await expectFocused('editing-retry');
		unavailable.setView(publicFixtureView);
		await expectFocused(itemIdentity);
	});

	test('uses first editable focus when an exact recovery identity no longer exists', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const removed = pocket.items[0];
		const missingIdentity = `item-${pocket.key}-${removed.id}-remove`;
		const harness = render(
			{ status: 'load-failed', message: 'Could not read the Save File.' },
			{ props: { getSessionFocusIdentity: () => missingIdentity } }
		);
		await tick();
		harness.setView(
			projectionWithItems(
				pocket.key,
				pocket.items.filter((item) => item.id !== removed.id)
			)
		);
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add`));
	});

	test('restores local focus after retrying recovery and another target change', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const harness = render();
		const quantityIdentity = `item-${pocket.key}-${pocket.items[0].id}-quantity`;
		target(quantityIdentity).focus();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.' }
		});
		await tick();
		await tick();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.', retrying: true }
		});
		harness.setCatalogues({
			...publicCatalogues,
			[pocket.key]: { status: 'loading' }
		});
		await tick();
		harness.setView(publicFixtureView);
		await tick();
		await tick();
		expect(document.activeElement).toBe(target(quantityIdentity));
	});

	test('restores local focus when ready state overtakes the rendered unavailable phase', async () => {
		const harness = render(publicFixtureView, { destination: 'trainer' });
		target('money-value').focus();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.' }
		});
		await tick();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.', retrying: true }
		});
		harness.setView(publicFixtureView);
		await expectFocused('money-value');
	});

	test('does not restore recovery focus over a shell takeover', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const itemIdentity = `item-${pocket.key}-${pocket.items[0].id}-remove`;
		const harness = render(publicFixtureView, {
			props: { getSessionFocusIdentity: () => itemIdentity }
		});
		const takeover = document.createElement('button');
		takeover.textContent = 'Shell takeover';
		document.body.append(takeover);
		takeover.focus();
		harness.setView({ status: 'load-failed', message: 'Could not read the Save File.' });
		await tick();
		harness.setView(publicFixtureView);
		await tick();
		await tick();
		expect(document.activeElement).toBe(takeover);
	});

	test('replaces an open command and keeps only one command surface', async () => {
		render();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		(target(`pocket-${pocket.key}-add`) as HTMLButtonElement).click();
		await tick();
		(target(`item-${pocket.key}-${pocket.items[0].id}-remove`) as HTMLButtonElement).click();
		await tick();
		expect(host.querySelector('.add-command')).toBeNull();
		expect(host.querySelectorAll('[data-ledger-command]')).toHaveLength(1);
		expect(host.querySelector('.remove-command')).not.toBeNull();
	});

	test('keeps a focused item row clear of its sticky pocket heading', async () => {
		render(publicFixtureView, { width: 393, height: 852 });
		await tick();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const ledger = host.querySelector<HTMLElement>('[data-testid="bag-ledger-scrollport"]')!;
		ledger.scrollTop = ledger.scrollHeight;
		const control = target(
			`item-${pocket.key}-${pocket.items[pocket.items.length - 1].id}-decrease`
		);
		control.focus();
		await new Promise(requestAnimationFrame);
		const row = control.closest<HTMLElement>('.item-row')!;
		const heading = host.querySelector<HTMLElement>(
			`[data-ledger-pocket="${pocket.key}"] .pocket-heading`
		)!;
		expect(row.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			heading.getBoundingClientRect().bottom - 1
		);
		expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			ledger.getBoundingClientRect().bottom + 1
		);

		host.style.width = '640px';
		host.style.height = '360px';
		await new Promise(requestAnimationFrame);
		await new Promise(requestAnimationFrame);
		expect(document.activeElement).toBe(control);
		expect(row.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			heading.getBoundingClientRect().bottom - 1
		);
		expect(row.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			ledger.getBoundingClientRect().bottom + 1
		);
	});
});

describe('SaveFileLedger direct-edit boundary seam', () => {
	test('preserves native text editing and commits only completed Enter input', async () => {
		const onTrainerNameCommit = vi.fn();
		const onTrainerNameAbandon = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { onTrainerNameCommit, onTrainerNameAbandon }
		});
		await tick();
		const name = target('trainer-name');
		name.focus();

		for (const key of ['Backspace', 'ArrowLeft']) {
			const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
			name.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
		}
		expect(onTrainerNameAbandon).not.toHaveBeenCalled();

		const composingEnter = new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true,
			isComposing: true
		});
		name.dispatchEvent(composingEnter);
		expect(composingEnter.defaultPrevented).toBe(false);
		expect(onTrainerNameCommit).not.toHaveBeenCalled();

		press(name, 'Enter');
		expect(onTrainerNameCommit).toHaveBeenCalledOnce();
		expect(onTrainerNameCommit).toHaveBeenCalledWith('enter');
		press(name, 'Escape');
		expect(onTrainerNameAbandon).toHaveBeenCalledOnce();

		name.focus();
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(target('trainer-gender-male'));
	});

	test('preserves native Add Item selection while controller arrows cross controls', async () => {
		render();
		const pocketKey = publicFixtureView.projection.inventory.pockets[0].key;
		(target(`pocket-${pocketKey}-add`) as HTMLButtonElement).click();
		await expectFocused(`pocket-${pocketKey}-add-item`);
		const select = target(`pocket-${pocketKey}-add-item`);
		const nativeArrow = new KeyboardEvent('keydown', {
			key: 'ArrowRight',
			bubbles: true,
			cancelable: true
		});
		select.dispatchEvent(nativeArrow);
		expect(nativeArrow.defaultPrevented).toBe(false);
		expect(document.activeElement).toBe(select);

		dispatchControllerKey('ArrowRight');
		expect(document.activeElement).toBe(target(`pocket-${pocketKey}-add-quantity`));
	});

	test('keeps Add quantity raw text and exposes its controlled error', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const onCommandChange = vi.fn();
		render(publicFixtureView, {
			harness: false,
			props: {
				command: {
					kind: 'add-item',
					pocketKey: pocket.key,
					itemId: null,
					quantity: '',
					quantityError: 'Enter a whole number.'
				},
				onCommandChange
			}
		});
		await tick();
		const quantity = target(`pocket-${pocket.key}-add-quantity`) as HTMLInputElement;
		expect(quantity.getAttribute('aria-label')).toBe(`Quantity to add to ${pocket.label}`);
		expect(quantity.getAttribute('aria-invalid')).toBe('true');
		expect(quantity.getAttribute('aria-describedby')).toBe(
			`pocket-${pocket.key}-add-quantity-error`
		);
		expect(document.getElementById(`pocket-${pocket.key}-add-quantity-error`)?.textContent).toBe(
			'Enter a whole number.'
		);

		quantity.value = '007';
		quantity.dispatchEvent(new InputEvent('input', { bubbles: true }));
		expect(onCommandChange).toHaveBeenCalledWith(expect.objectContaining({ quantity: '007' }));
	});

	test('gives a focused Bag draft priority over an open command in the local Back handler', async () => {
		const onItemQuantityAbandon = vi.fn();
		const onCommandChange = vi.fn();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const ledger = render(publicFixtureView, {
			harness: false,
			props: {
				command: { kind: 'add-item', pocketKey: pocket.key, itemId: null, quantity: '1' },
				onItemQuantityAbandon,
				onCommandChange
			}
		});
		await expectFocused(`pocket-${pocket.key}-add-item`);
		const quantity = target(`item-${pocket.key}-${item.id}-quantity`);
		quantity.focus();
		expect(ledger.handleBack()).toBe(true);
		expect(onItemQuantityAbandon).toHaveBeenCalledWith(pocket.key, item.id);
		expect(onCommandChange).not.toHaveBeenCalled();
	});

	test('leaves pending read-only drafts focused and declines local Back handling', async () => {
		const onMoneyAbandon = vi.fn();
		const ledger = render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			pendingTargets: ['money'],
			props: { onMoneyAbandon }
		});
		const money = target('money-value') as HTMLInputElement;
		money.focus();
		expect(money.readOnly).toBe(true);
		expect(ledger.handleBack()).toBe(false);
		const escape = new KeyboardEvent('keydown', {
			key: 'Escape',
			bubbles: true,
			cancelable: true
		});
		money.dispatchEvent(escape);
		expect(escape.defaultPrevented).toBe(false);
		expect(onMoneyAbandon).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(money);

		await clearMounted();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const pendingQuantity = `item-${pocket.key}-${pocket.items[0].id}-quantity`;
		const onCommandChange = vi.fn();
		const withCommand = render(publicFixtureView, {
			harness: false,
			pendingTargets: [pendingQuantity],
			props: {
				command: { kind: 'add-item', pocketKey: pocket.key, itemId: null, quantity: '1' },
				onCommandChange
			}
		});
		await expectFocused(`pocket-${pocket.key}-add-item`);
		const quantity = target(pendingQuantity) as HTMLInputElement;
		quantity.focus();
		expect(quantity.readOnly).toBe(true);
		expect(withCommand.handleBack()).toBe(true);
		expect(onCommandChange).toHaveBeenCalledWith(null);
	});

	test('closes an open command from any ordinary Ledger control and restores its launcher', async () => {
		const ledger = render();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const launcherIdentity = `pocket-${pocket.key}-add`;
		(target(launcherIdentity) as HTMLButtonElement).click();
		await expectFocused(`pocket-${pocket.key}-add-item`);
		target(`pocket-${pocket.key}-jump`).focus();
		expect(ledger.handleBack()).toBe(true);
		await expectFocused(launcherIdentity);
		expect(host.querySelector('[data-ledger-command]')).toBeNull();
	});

	test('does not steal focus when async command reconciliation runs after a shell takeover', async () => {
		render();
		await tick();
		const takeover = document.createElement('button');
		document.body.append(takeover);
		(
			target(
				`pocket-${publicFixtureView.projection.inventory.pockets[0].key}-add`
			) as HTMLButtonElement
		).click();
		takeover.focus();
		await tick();
		expect(document.activeElement).toBe(takeover);
	});

	test('keeps pending, bounded, and retry targets focused while blocking repeat activation', async () => {
		let harness = render(publicFixtureView, { destination: 'trainer' });
		await tick();
		const money = target('money-value') as HTMLInputElement;
		money.focus();
		harness.setPendingTargets(['money']);
		await tick();
		expect(document.activeElement).toBe(money);
		expect(money.readOnly).toBe(true);
		expect(money.getAttribute('aria-disabled')).toBe('true');
		dispatchControllerKey('ArrowUp');
		expect(document.activeElement).toBe(target('trainer-gender-female'));

		await clearMounted();
		harness = render();

		const pocket = publicFixtureView.projection.inventory.pockets.find((candidate) =>
			candidate.items.some((item) => item.quantity > 1)
		)!;
		const item = pocket.items.find((candidate) => candidate.quantity > 1)!;
		const decreaseIdentity = `item-${pocket.key}-${item.id}-decrease`;
		const decrease = target(decreaseIdentity);
		decrease.focus();
		harness.setPendingTargets([]);
		harness.setView(
			projectionWithItems(
				pocket.key,
				pocket.items.map((candidate) =>
					candidate.id === item.id ? { ...candidate, quantity: 1 } : candidate
				)
			)
		);
		await tick();
		expect(document.activeElement).toBe(target(decreaseIdentity));
		expect(target(decreaseIdentity).getAttribute('aria-disabled')).toBe('true');

		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.', retrying: false }
		});
		await tick();
		const retry = target('editing-retry');
		retry.focus();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor unavailable.', retrying: true }
		});
		await tick();
		expect(document.activeElement).toBe(retry);
		expect(retry.getAttribute('aria-disabled')).toBe('true');
	});

	test('derives numeric field widths from engine maxima', async () => {
		const expectValueFits = (input: HTMLInputElement, value: string) => {
			const style = getComputedStyle(input);
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d')!;
			context.font = style.font;
			const contentWidth =
				input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
			expect(context.measureText(value).width).toBeLessThanOrEqual(contentWidth);
		};
		render(publicFixtureView, { destination: 'trainer' });
		const moneyRow = host.querySelector<HTMLElement>('.money-row')!;
		const moneyInput = target('money-value') as HTMLInputElement;
		expect(moneyRow.style.getPropertyValue('--money-ch')).toBe(
			String(publicFixtureView.projection.money.max).length.toString()
		);
		expect(getComputedStyle(moneyInput).fontSize).toBe('16px');
		expectValueFits(moneyInput, String(publicFixtureView.projection.money.max));

		await clearMounted();
		render();
		const firstQuantity = host.querySelector<HTMLElement>('.quantity-controls')!;
		const firstItem = publicFixtureView.projection.inventory.pockets[0].items[0];
		const quantityInput = target(
			`item-${publicFixtureView.projection.inventory.pockets[0].key}-${firstItem.id}-quantity`
		) as HTMLInputElement;
		expect(firstQuantity.style.getPropertyValue('--quantity-ch')).toBe(
			String(firstItem.maxQuantity).length.toString()
		);
		expect(getComputedStyle(quantityInput).fontSize).toBe('16px');
		expectValueFits(quantityInput, String(firstItem.maxQuantity));
	});

	test('guards pending and bounded value activations without removing focus stops', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn(() => true);
		const onItemQuantityStep = vi.fn(() => true);
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const boundedView = projectionWithItems(pocket.key, [{ ...item, quantity: 1 }]);
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			pendingTargets: ['money'],
			props: { onMoneyCommit, onMoneyStep }
		});

		const money = target('money-value');
		money.focus();
		press(money, 'Enter');
		(target('money-decrease') as HTMLButtonElement).click();
		expect(onMoneyCommit).not.toHaveBeenCalled();
		expect(onMoneyStep).not.toHaveBeenCalled();

		await clearMounted();
		render(boundedView, { harness: false, props: { onItemQuantityStep } });
		(target(`item-${pocket.key}-${item.id}-decrease`) as HTMLButtonElement).click();
		expect(onItemQuantityStep).not.toHaveBeenCalled();
	});

	test('keeps raw boundary drafts activatable until Money accepts the boundary', async () => {
		const onMoneyStep = vi.fn(() => true);
		const maximum = publicFixtureView.projection.money.max;
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { drafts: { money: { value: String(maximum) } }, onMoneyStep }
		});
		const max = target('money-max') as HTMLButtonElement;
		expect(max.getAttribute('aria-disabled')).toBe('false');
		max.click();
		expect(onMoneyStep).toHaveBeenCalledWith('max', String(maximum));

		await clearMounted();
		const accepted = structuredClone(publicFixtureView);
		accepted.projection.money.value = maximum;
		onMoneyStep.mockClear();
		render(accepted, {
			destination: 'trainer',
			harness: false,
			props: { drafts: { money: { value: String(maximum) } }, onMoneyStep }
		});
		expect(target('money-max').getAttribute('aria-disabled')).toBe('true');
		(target('money-max') as HTMLButtonElement).click();
		expect(onMoneyStep).not.toHaveBeenCalled();

		await clearMounted();
		render(accepted, {
			destination: 'trainer',
			harness: false,
			props: { drafts: { money: { value: 'invalid' } }, onMoneyStep }
		});
		expect(target('money-max').getAttribute('aria-disabled')).toBe('false');
		(target('money-max') as HTMLButtonElement).click();
		expect(onMoneyStep).toHaveBeenCalledWith('max', 'invalid');
	});

	test('keeps raw boundary drafts activatable until Bag accepts the boundary', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find((candidate) =>
			candidate.items.some((item) => item.quantity > 1)
		)!;
		const item = pocket.items.find((candidate) => candidate.quantity > 1)!;
		const onItemQuantityStep = vi.fn(() => true);
		render(publicFixtureView, {
			harness: false,
			props: {
				drafts: { itemQuantities: { [`${pocket.key}:${item.id}`]: { value: '1' } } },
				onItemQuantityStep
			}
		});
		const decrease = target(`item-${pocket.key}-${item.id}-decrease`) as HTMLButtonElement;
		expect(decrease.getAttribute('aria-disabled')).toBe('false');
		decrease.click();
		expect(onItemQuantityStep).toHaveBeenCalledWith(pocket.key, item.id, -1, '1');

		await clearMounted();
		const accepted = projectionWithItems(
			pocket.key,
			pocket.items.map((candidate) =>
				candidate.id === item.id ? { ...candidate, quantity: 1 } : candidate
			)
		);
		onItemQuantityStep.mockClear();
		render(accepted, {
			harness: false,
			props: {
				drafts: { itemQuantities: { [`${pocket.key}:${item.id}`]: { value: '1' } } },
				onItemQuantityStep
			}
		});
		expect(target(`item-${pocket.key}-${item.id}-decrease`).getAttribute('aria-disabled')).toBe(
			'true'
		);
		(target(`item-${pocket.key}-${item.id}-decrease`) as HTMLButtonElement).click();
		expect(onItemQuantityStep).not.toHaveBeenCalled();
	});

	test('exposes and guards pending gender, Add, and Remove operations', async () => {
		const onTrainerGenderSelect = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			pendingTargets: ['trainer-gender-male'],
			props: { onTrainerGenderSelect }
		});
		const genderRow = host.querySelector<HTMLElement>('[data-ledger-row="trainer-gender"]')!;
		expect(genderRow.getAttribute('aria-busy')).toBe('true');
		expect(target('trainer-gender-male').getAttribute('aria-disabled')).toBe('true');
		expect(target('trainer-gender-female').getAttribute('aria-disabled')).toBe('true');
		(target('trainer-gender-male') as HTMLButtonElement).click();
		(target('trainer-gender-female') as HTMLButtonElement).click();
		expect(onTrainerGenderSelect).not.toHaveBeenCalled();

		await clearMounted();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const occupied = new Set(pocket.items.map((item) => item.id));
		const catalogue = publicCatalogues[pocket.key];
		if (catalogue.status !== 'ready') throw new Error('Expected a ready public catalogue.');
		const option = catalogue.availableItems.find((item) => !occupied.has(item.id))!;
		const addIdentity = `pocket-${pocket.key}-add-confirm`;
		const onAddItem = vi.fn();
		render(publicFixtureView, {
			harness: false,
			pendingTargets: [addIdentity],
			props: {
				command: { kind: 'add-item', pocketKey: pocket.key, itemId: option.id, quantity: '1' },
				onAddItem
			}
		});
		const addConfirm = target(addIdentity);
		expect(addConfirm.closest('[data-ledger-command]')?.getAttribute('aria-busy')).toBe('true');
		(addConfirm as HTMLButtonElement).click();
		expect(onAddItem).not.toHaveBeenCalled();

		await clearMounted();
		const item = pocket.items[0];
		const removeIdentity = `item-${pocket.key}-${item.id}-confirm-remove`;
		const onRemoveItem = vi.fn();
		render(publicFixtureView, {
			harness: false,
			pendingTargets: [removeIdentity],
			props: {
				command: { kind: 'remove-item', pocketKey: pocket.key, itemId: item.id },
				onRemoveItem
			}
		});
		const removeConfirm = target(removeIdentity);
		expect(removeConfirm.closest('[data-ledger-command]')?.getAttribute('aria-busy')).toBe('true');
		(removeConfirm as HTMLButtonElement).click();
		expect(onRemoveItem).not.toHaveBeenCalled();

		await clearMounted();
		render(
			{ ...publicFixtureView, editingUnavailable: { message: 'Editor unavailable.' } },
			{
				harness: false,
				props: {
					command: { kind: 'remove-item', pocketKey: pocket.key, itemId: item.id },
					onRemoveItem
				}
			}
		);
		expect((target(removeIdentity) as HTMLButtonElement).disabled).toBe(true);
	});

	test('exposes a gender Engine rejection without changing pressed-button activation', () => {
		const onTrainerGenderSelect = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: {
				errors: { 'trainer-gender': 'This gender could not be saved.' },
				onTrainerGenderSelect
			}
		});
		const row = host.querySelector<HTMLElement>('[data-ledger-row="trainer-gender"]')!;
		const group = host.querySelector<HTMLElement>('[role="group"][aria-label="Trainer gender"]')!;
		expect(row.getAttribute('aria-invalid')).toBe('true');
		expect(row.getAttribute('aria-describedby')).toBe('trainer-gender-error');
		expect(group.getAttribute('aria-describedby')).toBe('trainer-gender-error');
		for (const choice of ['trainer-gender-male', 'trainer-gender-female']) {
			expect(target(choice).getAttribute('aria-describedby')).toBe('trainer-gender-error');
		}
		const male = target('trainer-gender-male');
		male.focus();
		dispatchControllerKey('ArrowRight');
		expect(document.activeElement).toBe(target('trainer-gender-female'));
		expect(onTrainerGenderSelect).not.toHaveBeenCalled();
		(document.activeElement as HTMLButtonElement).click();
		expect(onTrainerGenderSelect).toHaveBeenCalledOnce();
		expect(onTrainerGenderSelect).toHaveBeenCalledWith('female');
		expect(group.getAttribute('role')).toBe('group');
		expect(document.getElementById('trainer-gender-error')?.textContent).toBe(
			'This gender could not be saved.'
		);
	});

	test('reconstructs discarded Add and Remove commands from confirmation pending keys', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const addIdentity = `pocket-${pocket.key}-add-confirm`;
		const removeIdentity = `item-${pocket.key}-${item.id}-confirm-remove`;
		const onCommandChange = vi.fn();
		render(publicFixtureView, {
			harness: false,
			pendingTargets: [addIdentity, removeIdentity],
			props: { onCommandChange }
		});

		const add = target(`pocket-${pocket.key}-add`) as HTMLButtonElement;
		const remove = target(`item-${pocket.key}-${item.id}-remove`) as HTMLButtonElement;
		expect(add.disabled).toBe(false);
		expect(add.getAttribute('aria-busy')).toBe('true');
		expect(add.getAttribute('aria-disabled')).toBe('true');
		expect(remove.disabled).toBe(false);
		expect(remove.getAttribute('aria-disabled')).toBe('true');
		expect(remove.closest('.item-row')?.getAttribute('aria-busy')).toBe('true');
		expect(host.querySelectorAll('[data-ledger-command]')).toHaveLength(0);
		expect(host.querySelector('.spinner-graphic')).toBeNull();
		add.click();
		remove.click();
		expect(onCommandChange).not.toHaveBeenCalled();
		expect(
			(target(`item-${pocket.key}-${pocket.items[1].id}-quantity`) as HTMLInputElement).readOnly
		).toBe(false);

		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(add.parentElement?.querySelector('.spinner-graphic')).not.toBeNull();
		expect(remove.closest('.item-row')?.querySelector('.spinner-graphic')).not.toBeNull();
	});

	test('associates an Engine rejection with the active Remove confirmation', () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const identity = `item-${pocket.key}-${item.id}-confirm-remove`;
		render(publicFixtureView, {
			harness: false,
			props: {
				command: { kind: 'remove-item', pocketKey: pocket.key, itemId: item.id },
				errors: { [identity]: 'This item could not be removed from its pocket.' }
			}
		});
		expect(target(identity).getAttribute('aria-describedby')).toBe(`${identity}-error`);
		expect(document.getElementById(`${identity}-error`)?.textContent).toBe(
			'This item could not be removed from its pocket.'
		);
	});

	test('lets a pointer operator consume the raw draft without a second blur commit', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn(() => true);
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: {
				drafts: { money: { value: '001' } },
				onMoneyCommit,
				onMoneyStep
			}
		});
		await tick();
		const input = target('money-value');
		const decrease = target('money-decrease');
		input.focus();
		const pointerdown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
		decrease.dispatchEvent(pointerdown);
		expect(pointerdown.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(input);
		decrease.click();

		expect(onMoneyCommit).not.toHaveBeenCalled();
		expect(onMoneyStep).toHaveBeenCalledWith(-1, '001');
	});

	test('consumes a null-related-target pointer blur with exactly one operator step', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn(() => true);
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: {
				drafts: { money: { value: '001' } },
				onMoneyCommit,
				onMoneyStep
			}
		});
		await tick();
		const input = target('money-value');
		const increase = target('money-increase');
		input.focus();
		increase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
		input.dispatchEvent(new FocusEvent('blur', { relatedTarget: null }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		await Promise.resolve();
		expect(onMoneyCommit).not.toHaveBeenCalled();
		increase.click();

		expect(onMoneyCommit).not.toHaveBeenCalled();
		expect(onMoneyStep).toHaveBeenCalledOnce();
		expect(onMoneyStep).toHaveBeenCalledWith(1, '001');
	});

	test('keeps a pointer-cancelled or released draft focused until a real focus transfer', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { onMoneyCommit }
		});
		await tick();
		const input = target('money-value');
		const increase = target('money-increase');
		input.focus();
		increase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
		window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
		expect(document.activeElement).toBe(input);
		expect(onMoneyCommit).not.toHaveBeenCalled();

		increase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
		window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
		await Promise.resolve();
		expect(document.activeElement).toBe(input);
		expect(onMoneyCommit).not.toHaveBeenCalled();

		target('trainer-name').focus();
		expect(onMoneyCommit).toHaveBeenCalledOnce();
	});

	test('lets controller traversal reach a same-field operator and activate one combined step', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn(() => true);
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { drafts: { money: { value: '001' } }, onMoneyCommit, onMoneyStep }
		});
		await tick();
		const input = target('money-value');
		input.focus();
		dispatchControllerKey('ArrowRight');
		expect(document.activeElement).toBe(target('money-increase'));
		dispatchControllerKey('ArrowRight');
		expect(document.activeElement).toBe(target('money-max'));
		expect(onMoneyCommit).not.toHaveBeenCalled();
		dispatchControllerKey('Enter');
		expect(onMoneyCommit).not.toHaveBeenCalled();
		expect(onMoneyStep).toHaveBeenCalledOnce();
		expect(onMoneyStep).toHaveBeenCalledWith('max', '001');
	});

	test('commits a deferred draft once when controller focus leaves its operator group', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { onMoneyCommit }
		});
		await tick();
		const input = target('money-value');
		input.focus();
		dispatchControllerKey('ArrowRight');
		dispatchControllerKey('ArrowRight');
		expect(onMoneyCommit).not.toHaveBeenCalled();
		dispatchControllerKey('ArrowUp');
		expect(onMoneyCommit).toHaveBeenCalledOnce();
		expect(onMoneyCommit).toHaveBeenCalledWith('blur');
	});

	test('lets a controller quantity operator consume its own raw draft', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find((candidate) =>
			candidate.items.some((item) => item.maxQuantity > 2)
		)!;
		const item = pocket.items.find((candidate) => candidate.maxQuantity > 2)!;
		const onItemQuantityCommit = vi.fn();
		const onItemQuantityStep = vi.fn(() => true);
		render(publicFixtureView, {
			harness: false,
			props: {
				drafts: { itemQuantities: { [`${pocket.key}:${item.id}`]: { value: '002' } } },
				onItemQuantityCommit,
				onItemQuantityStep
			}
		});
		await tick();
		target(`item-${pocket.key}-${item.id}-quantity`).focus();
		dispatchControllerKey('ArrowRight');
		expect(document.activeElement).toBe(target(`item-${pocket.key}-${item.id}-increase`));
		dispatchControllerKey('Enter');
		expect(onItemQuantityCommit).not.toHaveBeenCalled();
		expect(onItemQuantityStep).toHaveBeenCalledWith(pocket.key, item.id, 1, '002');
	});

	test('keeps deferred drafts armed after blocked or rejected operator activation', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn(() => false);
		const maximum = String(publicFixtureView.projection.money.max);
		const acceptedMaximum = structuredClone(publicFixtureView);
		acceptedMaximum.projection.money.value = publicFixtureView.projection.money.max;
		render(acceptedMaximum, {
			destination: 'trainer',
			harness: false,
			props: { drafts: { money: { value: maximum } }, onMoneyCommit, onMoneyStep }
		});
		await tick();
		target('money-value').focus();
		target('money-increase').focus();
		(target('money-increase') as HTMLButtonElement).click();
		expect(onMoneyStep).not.toHaveBeenCalled();
		target('trainer-name').focus();
		expect(onMoneyCommit).toHaveBeenCalledOnce();

		await clearMounted();
		onMoneyCommit.mockClear();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { drafts: { money: { value: '001' } }, onMoneyCommit, onMoneyStep }
		});
		await tick();
		target('money-value').focus();
		target('money-increase').focus();
		(target('money-increase') as HTMLButtonElement).click();
		expect(onMoneyStep).toHaveBeenCalledWith(1, '001');
		target('trainer-name').focus();
		expect(onMoneyCommit).toHaveBeenCalledOnce();

		await clearMounted();
		onMoneyCommit.mockClear();
		onMoneyStep.mockClear();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			pendingTargets: ['money'],
			props: { drafts: { money: { value: '001' } }, onMoneyCommit, onMoneyStep }
		});
		await tick();
		target('money-value').focus();
		target('money-increase').focus();
		(target('money-increase') as HTMLButtonElement).click();
		expect(onMoneyStep).not.toHaveBeenCalled();
		target('trainer-name').focus();
		expect(onMoneyCommit).toHaveBeenCalledOnce();
	});

	test('commits one field when a pointer activates a different field operator', async () => {
		const onTrainerNameCommit = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { onTrainerNameCommit }
		});
		await tick();
		const name = target('trainer-name');
		const increase = target('money-increase');
		name.focus();
		increase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		increase.focus();
		expect(onTrainerNameCommit).toHaveBeenCalledOnce();
		expect(onTrainerNameCommit).toHaveBeenCalledWith('blur');
	});

	test('commits one field when controller focus crosses into a different field group', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { onMoneyCommit }
		});
		await tick();
		target('money-value').focus();
		dispatchControllerKey('ArrowUp');
		expect(onMoneyCommit).toHaveBeenCalledOnce();
		expect(onMoneyCommit).toHaveBeenCalledWith('blur');
	});

	test('does not commit a deferred draft when the Ledger is destroyed', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, {
			destination: 'trainer',
			harness: false,
			props: { onMoneyCommit }
		});
		await tick();
		target('money-value').focus();
		dispatchControllerKey('ArrowRight');
		expect(onMoneyCommit).not.toHaveBeenCalled();
		await clearMounted();
		expect(onMoneyCommit).not.toHaveBeenCalled();
	});
});

describe('SaveFileLedger states and feedback', () => {
	test('orders initial-load failure actions and guards a focused retry', () => {
		const onRetryLoad = vi.fn();
		render(
			{ status: 'load-failed', message: 'Unreadable fixture.', retrying: true },
			{ harness: false, props: { onRetryLoad } }
		);
		expect(
			Array.from(host.querySelectorAll('[data-ledger-control]')).map((control) =>
				control.textContent?.trim()
			)
		).toEqual(['Retry', 'Back to Boxes']);
		const retry = target('load-retry');
		retry.focus();
		retry.click();
		expect(document.activeElement).toBe(retry);
		expect(retry.getAttribute('aria-disabled')).toBe('true');
		expect(onRetryLoad).not.toHaveBeenCalled();
	});

	test('gives no-active Save File one stop', () => {
		render({ status: 'no-active-save' }, { harness: false });
		expect(host.querySelectorAll('[data-ledger-control]')).toHaveLength(1);
		expect(target('back-boxes').hasAttribute('data-destination-initial')).toBe(true);
	});

	test('shows destination-specific empty states for unsupported capabilities', async () => {
		const projection = structuredClone(publicFixtureView.projection);
		projection.trainerProfile.trainerNameSupported = false;
		projection.trainerProfile.genderSupported = false;
		projection.money.supported = false;
		render({ ...publicFixtureView, projection }, { destination: 'trainer' });

		expect(host.querySelector('.details-block')).toBeNull();
		expect(host.textContent).toContain('No editable Trainer details are available');
		expect(host.textContent).not.toContain('Generation');

		await clearMounted();
		projection.inventory.supported = false;
		render({ ...publicFixtureView, projection }, { destination: 'bag' });
		expect(host.querySelector('.bag-block')).toBeNull();
		expect(host.textContent).toContain('No editable Bag details are available');
	});

	test('omits only unsupported groups within the selected destination', async () => {
		const projection = structuredClone(publicFixtureView.projection);
		projection.trainerProfile.trainerNameSupported = false;
		projection.trainerProfile.genderSupported = false;
		render({ ...publicFixtureView, projection }, { destination: 'trainer' });

		const trainer = host.querySelector<HTMLElement>('[aria-labelledby="ledger-trainer-title"]')!;
		expect(trainer).not.toBeNull();
		expect(Array.from(trainer.querySelectorAll('dt'), (term) => term.textContent)).toEqual([
			'Trainer ID',
			'Play time'
		]);
		expect(Array.from(trainer.querySelectorAll('dd'), (value) => value.textContent)).toEqual([
			String(publicFixtureView.summary.trainerId),
			publicFixtureView.summary.playTime
		]);
		expect(target('trainer-name')).toBeNull();
		expect(target('trainer-gender-male')).toBeNull();
		expect(host.querySelector('[aria-labelledby="ledger-money-title"]')).not.toBeNull();
		expect(host.querySelector('[aria-labelledby="ledger-bag-title"]')).toBeNull();
		expect(host.querySelector('.workspace-identity .eyebrow')).toBeNull();

		await clearMounted();
		render({ ...publicFixtureView, projection }, { destination: 'bag' });
		expect(host.querySelector('[aria-labelledby="ledger-bag-title"]')).not.toBeNull();
		expect(host.querySelector('[aria-labelledby="ledger-money-title"]')).toBeNull();
		expect(host.querySelector('.workspace-identity .eyebrow')).toBeNull();
	});

	test('exposes pending immediately without prose and delays the localized spinner', async () => {
		render(publicFixtureView, {
			destination: 'trainer',
			pendingTargets: ['money'],
			harness: false
		});
		const money = host.querySelector<HTMLElement>('.money-row')!;
		expect(money.getAttribute('aria-busy')).toBe('true');
		expect(host.textContent).not.toMatch(/Saving|Working/i);
		expect(money.querySelector('.spinner-graphic')).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(money.querySelector('.spinner-graphic')).not.toBeNull();

		await clearMounted();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		render(publicFixtureView, {
			harness: false,
			catalogues: { ...publicCatalogues, [pocket.key]: { status: 'loading' } }
		});
		const catalogueStatus = host.querySelector<HTMLElement>(
			`[data-ledger-pocket="${pocket.key}"] .catalogue-status`
		)!;
		expect(catalogueStatus.getAttribute('aria-busy')).toBe('true');
		expect(catalogueStatus.querySelector('.spinner-graphic')).toBeNull();
	});

	test('does not shift Money or quantity row geometry when delayed spinners appear', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const quantityIdentity = `item-${pocket.key}-${item.id}-quantity`;
		let harness = render(publicFixtureView, { destination: 'trainer' });
		const money = host.querySelector<HTMLElement>('.money-row')!;
		const moneyHeight = money.getBoundingClientRect().height;
		harness.setPendingTargets(['money']);
		await tick();
		expect(money.getBoundingClientRect().height).toBe(moneyHeight);
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(money.getBoundingClientRect().height).toBe(moneyHeight);

		await clearMounted();
		harness = render();
		const quantity = target(quantityIdentity).closest<HTMLElement>('.quantity-controls')!;
		const quantityHeight = quantity.getBoundingClientRect().height;
		harness.setPendingTargets([quantityIdentity]);
		await tick();
		expect(quantity.getBoundingClientRect().height).toBe(quantityHeight);
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(quantity.getBoundingClientRect().height).toBe(quantityHeight);
	});

	test('associates a failed pocket catalogue with Add and a pocket-specific Retry name', () => {
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		render(publicFixtureView, {
			catalogues: {
				...publicCatalogues,
				[pocket.key]: { status: 'failed', message: 'Catalogue unavailable.' }
			}
		});
		const errorId = `pocket-${pocket.key}-catalogue-error`;
		expect(document.getElementById(errorId)?.textContent).toBe('Catalogue unavailable.');
		expect(target(`pocket-${pocket.key}-add`).getAttribute('aria-describedby')).toBe(errorId);
		const retry = target(`pocket-${pocket.key}-retry`);
		expect(retry.getAttribute('aria-describedby')).toBe(errorId);
		expect(retry.getAttribute('aria-label')).toBe(`Retry ${pocket.label} catalogue`);
	});
});
