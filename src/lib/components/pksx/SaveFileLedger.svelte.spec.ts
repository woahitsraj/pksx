import { createPkhexEngine, type SaveFileEditableProjection } from '$lib/engine';
import { dispatchControllerKey } from '$lib/pksx/controller-input';
import { mount, tick, unmount } from 'svelte';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import fixtureUrl from '../../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav?url';
import SaveFileLedger from './SaveFileLedger.svelte';
import SaveFileLedgerTestHarness from './save-file-ledger/SaveFileLedgerTestHarness.svelte';
import type {
	SaveFileLedgerCatalogue,
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
		initialView: view,
		initialCatalogues: options.catalogues ?? publicCatalogues,
		pendingTargets: options.pendingTargets ?? []
	};
	mounted =
		options.harness === false
			? mount(SaveFileLedger, {
					target: host,
					props: {
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
		handleBack: () => boolean;
	};
}

function target(identity: string) {
	return host.querySelector<HTMLElement>(`[data-destination-focus="${identity}"]`)!;
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
	test('renders the Ledger hierarchy without mock, staging, table, or imagery residue', () => {
		render();

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
		expect(target('money-decrease').getAttribute('aria-label')).toBe('Decrease Money');
		expect(target('money-increase').getAttribute('aria-label')).toBe('Increase Money');

		const identities = Array.from(
			host.querySelectorAll<HTMLElement>('[data-destination-focus]'),
			(element) => element.dataset.destinationFocus
		);
		expect(new Set(identities).size).toBe(identities.length);
	});

	test('uses the strict container aspect tie rule and an exact 260px leading block', async () => {
		render(publicFixtureView, { width: 640, height: 360 });
		await tick();
		const layout = host.querySelector<HTMLElement>('.ledger-layout')!;
		expect(getComputedStyle(layout).gridTemplateColumns.split(' ')[0]).toBe('260px');

		host.style.height = '640px';
		await new Promise(requestAnimationFrame);
		expect(getComputedStyle(layout).gridTemplateColumns.split(' ')).toHaveLength(1);
		expect(getComputedStyle(layout).gridTemplateRows.split(' ').length).toBeGreaterThan(1);
	});

	test('keeps the Bag as its only vertical scroll owner and preserves full accessible names', async () => {
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
	});
});

describe('SaveFileLedger semantic focus graph', () => {
	test('keeps one semantic row order across the responsive composition boundary', async () => {
		render();
		const expectedPrefix = ['trainer-name', 'trainer-gender', 'money', 'pocket-jumps'];
		const rowOrder = () =>
			Array.from(
				host.querySelectorAll<HTMLElement>('[data-ledger-row]'),
				(row) => row.dataset.ledgerRow
			);
		expect(rowOrder().slice(0, 4)).toEqual(expectedPrefix);

		host.style.height = '640px';
		await new Promise(requestAnimationFrame);
		expect(rowOrder().slice(0, 4)).toEqual(expectedPrefix);
	});

	test('moves within a row, then through semantic rows independent of composition', async () => {
		render();
		await tick();
		const decrease = target('money-decrease');
		decrease.focus();
		press(decrease, 'ArrowRight');
		expect(document.activeElement).toBe(target('money-value'));

		press(document.activeElement as HTMLElement, 'ArrowDown');
		expect(document.activeElement).toBe(
			host.querySelectorAll<HTMLElement>('[data-ledger-jump]')[1]
		);
		const secondJump = host.querySelectorAll<HTMLElement>('[data-ledger-jump]')[1];
		secondJump.focus();
		press(secondJump, 'ArrowDown');
		expect(document.activeElement?.getAttribute('data-destination-focus')).toBe(
			`pocket-${secondJump.dataset.ledgerJump}-add`
		);
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

		jump.click();
		expect(document.activeElement).toBe(jump);
	});

	test('opens and closes one controlled command with the specified focus returns', async () => {
		render();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const add = target(`pocket-${pocket.key}-add`) as HTMLButtonElement;
		add.click();
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add-item`));
		dispatchControllerKey('Escape');
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add`));

		const firstItem = pocket.items[0];
		const remove = target(`item-${pocket.key}-${firstItem.id}-remove`) as HTMLButtonElement;
		remove.click();
		await tick();
		expect(document.activeElement).toBe(
			target(`item-${pocket.key}-${firstItem.id}-confirm-remove`)
		);
		dispatchControllerKey('Escape');
		await tick();
		expect(document.activeElement).toBe(target(`item-${pocket.key}-${firstItem.id}-remove`));
	});

	test('moves to the next item after removal', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		render();
		const first = pocket.items[0];
		const second = pocket.items[1];
		(target(`item-${pocket.key}-${first.id}-remove`) as HTMLButtonElement).click();
		await tick();
		(target(`item-${pocket.key}-${first.id}-confirm-remove`) as HTMLButtonElement).click();
		await tick();
		expect(
			document.activeElement?.closest('[data-ledger-row]')?.getAttribute('data-ledger-row')
		).toBe(`item-${pocket.key}-${second.id}`);
	});

	test('moves to Add Item when the removed item was alone', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const second = pocket.items[1];
		const oneItemView = projectionWithItems(pocket.key, [second]);
		render(oneItemView);
		(target(`item-${pocket.key}-${second.id}-remove`) as HTMLButtonElement).click();
		await tick();
		(target(`item-${pocket.key}-${second.id}-confirm-remove`) as HTMLButtonElement).click();
		await tick();
		expect(document.activeElement).toBe(target(`pocket-${pocket.key}-add`));
	});

	test('moves to the previous item when removing the last item', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find(
			(candidate) => candidate.items.length >= 2
		)!;
		const previous = pocket.items[0];
		const last = pocket.items[1];
		render(projectionWithItems(pocket.key, [previous, last]));
		(target(`item-${pocket.key}-${last.id}-remove`) as HTMLButtonElement).click();
		await tick();
		(target(`item-${pocket.key}-${last.id}-confirm-remove`) as HTMLButtonElement).click();
		await tick();
		expect(
			document.activeElement?.closest('[data-ledger-row]')?.getAttribute('data-ledger-row')
		).toBe(`item-${pocket.key}-${previous.id}`);
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

		const remembered = target('money-value');
		remembered.focus();
		harness.setView({
			...publicFixtureView,
			editingUnavailable: { message: 'Editor service unavailable.' }
		});
		await tick();
		expect(document.activeElement).toBe(target('editing-retry'));
		harness.setView(publicFixtureView);
		await tick();
		await tick();
		expect(document.activeElement).toBe(remembered);
	});
});

describe('SaveFileLedger direct-edit boundary seam', () => {
	test('uses one local Back handler only for a focused draft or open command', async () => {
		const onTrainerNameAbandon = vi.fn();
		const ledger = render(publicFixtureView, {
			harness: false,
			props: { onTrainerNameAbandon }
		});
		await tick();
		const name = target('trainer-name');
		name.focus();
		expect(ledger.handleBack()).toBe(true);
		expect(onTrainerNameAbandon).toHaveBeenCalledOnce();

		target('money-decrease').focus();
		expect(ledger.handleBack()).toBe(false);
	});

	test('lets a pointer operator consume the raw draft without a second blur commit', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn();
		render(publicFixtureView, {
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
		decrease.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		decrease.focus();
		decrease.click();

		expect(onMoneyCommit).not.toHaveBeenCalled();
		expect(onMoneyStep).toHaveBeenCalledWith(-1, '001');
	});
});

describe('SaveFileLedger states and feedback', () => {
	test('orders initial-load failure actions', () => {
		render({ status: 'load-failed', message: 'Unreadable fixture.' }, { harness: false });
		expect(
			Array.from(host.querySelectorAll('[data-ledger-control]')).map((control) =>
				control.textContent?.trim()
			)
		).toEqual(['Retry', 'Back to Boxes']);
	});

	test('gives no-active Save File one stop', () => {
		render({ status: 'no-active-save' }, { harness: false });
		expect(host.querySelectorAll('[data-ledger-control]')).toHaveLength(1);
		expect(target('back-boxes').hasAttribute('data-destination-initial')).toBe(true);
	});

	test('omits unsupported capability groups and shows the route empty state', () => {
		const projection = structuredClone(publicFixtureView.projection);
		projection.trainerProfile.trainerNameSupported = false;
		projection.trainerProfile.genderSupported = false;
		projection.money.supported = false;
		projection.inventory.supported = false;
		render({ ...publicFixtureView, projection });

		expect(host.querySelector('.details-block, .bag-block')).toBeNull();
		expect(host.textContent).toContain('No editable details are available');
		expect(host.textContent).not.toContain('Generation');
	});

	test('exposes pending immediately without prose and delays the localized spinner', async () => {
		render(publicFixtureView, { pendingTargets: ['money'], harness: false });
		const money = host.querySelector<HTMLElement>('.money-row')!;
		expect(money.getAttribute('aria-busy')).toBe('true');
		expect(host.textContent).not.toMatch(/Saving|Working/i);
		expect(money.querySelector('.spinner-graphic')).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 550));
		expect(money.querySelector('.spinner-graphic')).not.toBeNull();
	});
});
