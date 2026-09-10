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
		setPendingTargets: (targets: readonly string[]) => void;
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
		const container = host.querySelector<HTMLElement>('.save-file-ledger-container')!;
		const layout = host.querySelector<HTMLElement>('.ledger-layout')!;
		expect(getComputedStyle(container).containerName).toBe('save-file-ledger');
		expect(container.clientWidth).toBeGreaterThan(container.clientHeight);
		expect(getComputedStyle(layout).gridTemplateColumns.split(' ')[0]).toBe('260px');

		host.style.height = '640px';
		await new Promise(requestAnimationFrame);
		expect(container.clientWidth).toBe(container.clientHeight);
		expect(getComputedStyle(layout).gridTemplateColumns.split(' ')).toHaveLength(1);
		expect(getComputedStyle(layout).gridTemplateRows.split(' ').length).toBeGreaterThan(1);

		host.style.width = '393px';
		host.style.height = '852px';
		await new Promise(requestAnimationFrame);
		expect(container.clientWidth).toBeLessThan(container.clientHeight);
		expect(getComputedStyle(layout).gridTemplateColumns.split(' ')).toHaveLength(1);
		expect(
			host.querySelector<HTMLElement>('[data-testid="bag-ledger-scrollport"]')!.scrollWidth
		).toBeLessThanOrEqual(container.clientWidth);
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

		dispatchControllerKey('ArrowDown');
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
		await tick();
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

	test('gives a focused draft priority over an open command in the local Back handler', async () => {
		const onTrainerNameAbandon = vi.fn();
		const onCommandChange = vi.fn();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const ledger = render(publicFixtureView, {
			harness: false,
			props: {
				command: { kind: 'add-item', pocketKey: pocket.key, itemId: null, quantity: '1' },
				onTrainerNameAbandon,
				onCommandChange
			}
		});
		await tick();
		const name = target('trainer-name');
		name.focus();
		expect(ledger.handleBack()).toBe(true);
		expect(onTrainerNameAbandon).toHaveBeenCalledOnce();
		expect(onCommandChange).not.toHaveBeenCalled();
	});

	test('closes an open command from any ordinary Ledger control and restores its launcher', async () => {
		const ledger = render();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const launcherIdentity = `pocket-${pocket.key}-add`;
		(target(launcherIdentity) as HTMLButtonElement).click();
		await tick();
		target('money-decrease').focus();
		expect(ledger.handleBack()).toBe(true);
		await tick();
		expect(host.querySelector('[data-ledger-command]')).toBeNull();
		expect(document.activeElement).toBe(target(launcherIdentity));
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
		const harness = render();
		await tick();
		const money = target('money-value') as HTMLInputElement;
		money.focus();
		harness.setPendingTargets(['money']);
		await tick();
		expect(document.activeElement).toBe(money);
		expect(money.readOnly).toBe(true);
		expect(money.getAttribute('aria-disabled')).toBe('true');
		dispatchControllerKey('ArrowDown');
		expect(document.activeElement).toBe(
			host.querySelectorAll<HTMLElement>('[data-ledger-jump]')[1]
		);

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

	test('derives numeric field widths from engine maxima', () => {
		render();
		const moneyRow = host.querySelector<HTMLElement>('.money-row')!;
		const firstQuantity = host.querySelector<HTMLElement>('.quantity-controls')!;
		expect(moneyRow.style.getPropertyValue('--money-ch')).toBe(
			String(publicFixtureView.projection.money.max).length.toString()
		);
		const firstItem = publicFixtureView.projection.inventory.pockets[0].items[0];
		expect(firstQuantity.style.getPropertyValue('--quantity-ch')).toBe(
			String(firstItem.maxQuantity).length.toString()
		);
	});

	test('guards pending and bounded value activations without removing focus stops', () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn();
		const onItemQuantityStep = vi.fn();
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const boundedView = projectionWithItems(pocket.key, [{ ...item, quantity: 1 }]);
		render(boundedView, {
			harness: false,
			pendingTargets: ['money'],
			props: { onMoneyCommit, onMoneyStep, onItemQuantityStep }
		});

		const money = target('money-value');
		money.focus();
		press(money, 'Enter');
		(target('money-decrease') as HTMLButtonElement).click();
		(target(`item-${pocket.key}-${item.id}-decrease`) as HTMLButtonElement).click();
		expect(onMoneyCommit).not.toHaveBeenCalled();
		expect(onMoneyStep).not.toHaveBeenCalled();
		expect(onItemQuantityStep).not.toHaveBeenCalled();
	});

	test('exposes and guards pending gender, Add, and Remove operations', async () => {
		const onTrainerGenderSelect = vi.fn();
		render(publicFixtureView, {
			harness: false,
			pendingTargets: ['trainer-gender-male'],
			props: { onTrainerGenderSelect }
		});
		const genderGroup = host.querySelector<HTMLElement>(
			'[role="group"][aria-label="Trainer gender"]'
		)!;
		expect(genderGroup.getAttribute('aria-busy')).toBe('true');
		(target('trainer-gender-male') as HTMLButtonElement).click();
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

	test('lets controller traversal reach a same-field operator and activate one combined step', async () => {
		const onMoneyCommit = vi.fn();
		const onMoneyStep = vi.fn();
		render(publicFixtureView, {
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
		render(publicFixtureView, { harness: false, props: { onMoneyCommit } });
		await tick();
		const input = target('money-value');
		input.focus();
		dispatchControllerKey('ArrowRight');
		dispatchControllerKey('ArrowRight');
		expect(onMoneyCommit).not.toHaveBeenCalled();
		dispatchControllerKey('ArrowDown');
		expect(onMoneyCommit).toHaveBeenCalledOnce();
		expect(onMoneyCommit).toHaveBeenCalledWith('blur');
	});

	test('lets a controller quantity operator consume its own raw draft', async () => {
		const pocket = publicFixtureView.projection.inventory.pockets.find((candidate) =>
			candidate.items.some((item) => item.maxQuantity > 2)
		)!;
		const item = pocket.items.find((candidate) => candidate.maxQuantity > 2)!;
		const onItemQuantityCommit = vi.fn();
		const onItemQuantityStep = vi.fn();
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

	test('commits one field when a pointer activates a different field operator', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, { harness: false, props: { onMoneyCommit } });
		await tick();
		const money = target('money-value');
		const pocket = publicFixtureView.projection.inventory.pockets[0];
		const item = pocket.items[0];
		const increase = target(`item-${pocket.key}-${item.id}-increase`);
		money.focus();
		increase.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		increase.focus();
		expect(onMoneyCommit).toHaveBeenCalledOnce();
		expect(onMoneyCommit).toHaveBeenCalledWith('blur');
	});

	test('commits one field when controller focus crosses into a different field group', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, { harness: false, props: { onMoneyCommit } });
		await tick();
		target('money-value').focus();
		dispatchControllerKey('ArrowDown');
		expect(onMoneyCommit).toHaveBeenCalledOnce();
		expect(onMoneyCommit).toHaveBeenCalledWith('blur');
	});

	test('does not commit a deferred draft when the Ledger is destroyed', async () => {
		const onMoneyCommit = vi.fn();
		render(publicFixtureView, { harness: false, props: { onMoneyCommit } });
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

	test('omits only unsupported capability groups', () => {
		const projection = structuredClone(publicFixtureView.projection);
		projection.trainerProfile.trainerNameSupported = false;
		projection.trainerProfile.genderSupported = false;
		render({ ...publicFixtureView, projection });

		expect(host.querySelector('[aria-labelledby="ledger-trainer-title"]')).toBeNull();
		expect(host.querySelector('[aria-labelledby="ledger-money-title"]')).not.toBeNull();
		expect(host.querySelector('[aria-labelledby="ledger-bag-title"]')).not.toBeNull();
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
