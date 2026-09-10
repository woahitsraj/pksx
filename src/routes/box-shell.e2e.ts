import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const emeraldFixturePath = path.resolve(
	'test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav'
);
const scarletFixturePath = path.resolve(
	'test-fixtures/save-files/raj-pokemon-save-backups/switch/pokemon-scarlet-2025-03-24-main.sav'
);

async function openEmptySaves(page: Page) {
	await page.goto('/');
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.deleteDatabase('pksx-saves');

				request.onerror = () => reject(request.error ?? new Error('Could not clear Saves.'));
				request.onsuccess = () => resolve();
			})
	);
	await page.reload();
	await page.waitForLoadState('networkidle');
	await expect(page.locator('#box-grid')).toBeVisible({ timeout: 15000 });
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
}

async function pressController(page: Page, key: string) {
	await page.evaluate(async (controllerKey) => {
		const dispatch = (pressed: boolean) =>
			window.dispatchEvent(
				new CustomEvent('pksxcontroller', {
					detail: { key: controllerKey, pressed, id: 'Test controller' }
				})
			);
		const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

		dispatch(true);
		await nextFrame();
		await nextFrame();
		dispatch(false);
		await nextFrame();
	}, key);
}

async function expectControllerHighlights(page: Page, scope: Locator) {
	const controls = scope.locator(
		'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
	);
	let audited = 0;

	for (let index = 0; index < (await controls.count()); index += 1) {
		const control = controls.nth(index);
		if (!(await control.isVisible())) continue;

		await control.focus();
		await expect(control).toHaveCSS('outline-style', 'solid');
		await expect
			.poll(() => control.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)))
			.toBeGreaterThanOrEqual(3);
		audited += 1;
	}

	expect(audited).toBeGreaterThan(0);
}

async function importEmeraldThroughSaves(page: Page) {
	await page.goto('/saves');
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await page.goto('/');
	await expect(page.locator('.save-chip')).toContainText('011020251345.sav', { timeout: 15000 });
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
}

async function importScarletThroughSaves(page: Page) {
	await page.goto('/saves');
	await page.getByLabel('Import Save File').setInputFiles(scarletFixturePath);
	await expect(
		page.getByText('pokemon-scarlet-2025-03-24-main.sav imported and made active.')
	).toBeVisible({
		timeout: 60000
	});
	await page.goto('/');
	await expect(page.locator('.save-chip')).toContainText('pokemon-scarlet-2025-03-24-main.sav', {
		timeout: 60000
	});
}

// Seeds a Pokemon Storage shape the app never creates itself, so a later read proves persistence.
async function seedPokemonStorageBoxes(page: Page, boxCount: number) {
	await page.evaluate(
		(boxes) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('pksx-saves');

				open.onerror = () => reject(open.error ?? new Error('Could not open Saves.'));
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('pokemonStorage', 'readwrite');

					transaction.objectStore('pokemonStorage').put({
						id: 'pokemon-storage',
						schemaVersion: 1,
						boxCount: boxes,
						boxSlotCount: 30,
						updatedAt: '2026-05-16T12:00:00.000Z',
						boxes: Array.from({ length: boxes }, (_, box) => ({
							index: box,
							name: `Box ${String(box + 1).padStart(2, '0')}`,
							slots: Array.from({ length: 30 }, (_, slot) => ({ box, slot, pokemon: null }))
						}))
					});

					transaction.onerror = () =>
						reject(transaction.error ?? new Error('Could not seed Pokemon Storage.'));
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
				};
			}),
		boxCount
	);
}

async function seedOccupiedPokemonStorageSlot(page: Page) {
	await seedPokemonStorageBoxes(page, 3);
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('pksx-saves');
				open.onerror = () => reject(open.error ?? new Error('Could not open Saves.'));
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('pokemonStorage', 'readwrite');
					const store = transaction.objectStore('pokemonStorage');
					const read = store.get('pokemon-storage');
					read.onerror = () => reject(read.error ?? new Error('Could not read Pokemon Storage.'));
					read.onsuccess = () => {
						const storage = read.result;
						storage.boxes[0].slots[0].pokemon = {
							label: 'STORAGE ARON',
							detail: 'Lv. 11',
							level: 11,
							experience: 1331,
							speciesId: 304,
							form: 0,
							isEgg: false,
							spriteIdentity: {
								speciesId: 304,
								form: 0,
								isEgg: false,
								isShiny: false,
								displaySex: 'default'
							},
							origin: {
								entryMode: 'imported',
								originSaveFileName: null,
								originGame: null,
								originalTrainer: null,
								trainerId: null,
								enteredAt: '2026-09-08T12:00:00.000Z'
							}
						};
						store.put(storage);
					};
					transaction.onerror = () =>
						reject(transaction.error ?? new Error('Could not seed Pokemon Storage.'));
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
				};
			})
	);
}

async function backupCount(page: Page) {
	return page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const open = indexedDB.open('pksx-saves');
				open.onerror = () => reject(open.error ?? new Error('Could not open Saves.'));
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('backups', 'readonly');
					const request = transaction.objectStore('backups').count();
					request.onerror = () => reject(request.error ?? new Error('Could not count Backups.'));
					request.onsuccess = () => resolve(request.result);
					transaction.oncomplete = () => database.close();
				};
			})
	);
}

type SafeArea = { top: number; right: number; bottom: number; left: number };

async function setSafeArea(page: Page, insets: SafeArea) {
	await page.evaluate(({ top, right, bottom, left }) => {
		const root = document.documentElement;
		root.style.setProperty('--safe-area-inset-top', `${top}px`);
		root.style.setProperty('--safe-area-inset-right', `${right}px`);
		root.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
		root.style.setProperty('--safe-area-inset-left', `${left}px`);
	}, insets);
}

async function shellExtents(page: Page) {
	return page.evaluate(() => {
		const shell = document.querySelector('.app-shell');
		return {
			bodyHeight: document.body.scrollHeight,
			bodyWidth: document.body.scrollWidth,
			htmlHeight: document.documentElement.scrollHeight,
			htmlWidth: document.documentElement.scrollWidth,
			shellHeight: shell?.scrollHeight ?? 0,
			shellWidth: shell?.scrollWidth ?? 0
		};
	});
}

async function edgeSurfaceBounds(page: Page) {
	return page.locator('.edge-menu-layer').evaluate((layer) => {
		const panel = layer.querySelector('[role="dialog"]');
		const layerRect = layer.getBoundingClientRect();
		const panelRect = panel?.getBoundingClientRect();
		return {
			layer: {
				top: layerRect.top,
				right: layerRect.right,
				bottom: layerRect.bottom,
				left: layerRect.left,
				width: layerRect.width,
				height: layerRect.height
			},
			panel: panelRect
				? {
						top: panelRect.top,
						right: panelRect.right,
						bottom: panelRect.bottom,
						left: panelRect.left,
						width: panelRect.width,
						height: panelRect.height
					}
				: null
		};
	});
}

function expectSafeCanvas(
	bounds: Awaited<ReturnType<typeof edgeSurfaceBounds>>,
	viewport: { width: number; height: number },
	insets: SafeArea
) {
	expect(bounds.layer).toEqual({
		top: insets.top,
		right: viewport.width - insets.right,
		bottom: viewport.height - insets.bottom,
		left: insets.left,
		width: viewport.width - insets.left - insets.right,
		height: viewport.height - insets.top - insets.bottom
	});
	expect(bounds.panel?.width ?? 0).toBeGreaterThan(0);
	expect(bounds.panel?.height ?? 0).toBeGreaterThan(0);
}

async function expectLastSlotCommandVisible(page: Page) {
	const lastCommand = page.locator('#slot-action-7');
	await lastCommand.focus();
	await expect(lastCommand).toBeFocused();
	expect(
		await lastCommand.evaluate((command) => {
			const rowRect = command.parentElement?.getBoundingClientRect();
			const panelRect = command.closest('[role="dialog"]')?.getBoundingClientRect();
			const reason = document.getElementById(command.getAttribute('aria-describedby') ?? '');
			const reasonRect = reason?.getBoundingClientRect();
			return (
				rowRect !== undefined &&
				panelRect !== undefined &&
				reasonRect !== undefined &&
				rowRect.top >= panelRect.top &&
				rowRect.right <= panelRect.right &&
				rowRect.bottom <= panelRect.bottom &&
				rowRect.left >= panelRect.left &&
				reason?.contains(
					document.elementFromPoint(
						reasonRect.left + reasonRect.width / 2,
						reasonRect.top + reasonRect.height / 2
					)
				)
			);
		})
	).toBe(true);
}

async function expectSmallSlotCommandControls(page: Page) {
	const metrics = await page.getByRole('dialog', { name: 'Slot actions' }).evaluate((dialog) => ({
		token: parseFloat(getComputedStyle(dialog).getPropertyValue('--pksx-small-control-height')),
		heights: Array.from(
			dialog.querySelectorAll('.slot-command-row button'),
			(button) => button.getBoundingClientRect().height
		)
	}));
	expect(metrics.token).toBeGreaterThan(0);
	for (const height of metrics.heights) {
		expect(height).toBeGreaterThan(0);
		expect(height).toBeGreaterThanOrEqual(metrics.token - 0.5);
		expect(height).toBeLessThanOrEqual(metrics.token + 0.5);
	}
}

async function moveFirstEmeraldBoxSlotToThirdSlot(page: Page) {
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await expect(page.locator('#box-0-slot-0')).toContainText('Empty', { timeout: 15000 });
	await expect(page.locator('#box-0-slot-2')).toContainText('ARON');
}

async function fillEditorInput(input: Locator, value: string) {
	await input.click();
	await input.fill(value);
}

async function selectActiveSaveCard(page: Page) {
	await page.locator('.save-card.active .save-card-main').click();
}

test('keyboard navigation moves deterministically across the box grid', async ({ page }) => {
	await openEmptySaves(page);
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-0 img.slot-sprite')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toHaveCSS('--slot-hue', '16');
	await expect(page.locator('#box-0-slot-0')).toHaveCSS('--slot-chroma', '0.09');
	await expect(page.locator('#box-0-slot-0')).not.toHaveClass(/dual-type/);
	await expect(page.locator('.portrait-card img')).toHaveCount(0);
	await expect(
		page.locator('img[src^="https://img.pokemondb.net"], img[src^="http://img.pokemondb.net"]')
	).toHaveCount(0);
	await page.locator('#box-grid').focus();

	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#box-0-slot-1')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#box-0-slot-7')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('#box-0-slot-6')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('#box-0-slot-6')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pane-control-0')).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#top-control-5')).toBeFocused();
});

test('compact box controls and keyboard shortcuts update the active box label', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();

	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Next box' }).click();
	await expect(page.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await expect(page.locator('#box-1-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.locator('#box-grid').focus();
	await page.keyboard.press('PageDown');
	await expect(page.getByRole('heading', { name: 'Box 03' })).toBeVisible();
	await expect(page.locator('#box-2-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('PageDown');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Previous box' }).click();
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');
});

test('switches to durable Pokemon Storage with focusable empty Slot actions', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.getByRole('button', { name: 'Add source' }).click();
	await page.getByRole('button', { name: /Pokemon Storage/ }).click();
	await expect(page.locator('.pane-state-tag')).toContainText('AUTO-SAVED');
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');

	await page.getByRole('button', { name: 'Switch Pokemon Storage source' }).click();
	await page.getByRole('button', { name: /011020251345.sav/ }).click();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });

	await seedPokemonStorageBoxes(page, 5);
	await page.goto('/?source=pokemon-storage');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');

	await page.locator('#box-grid').focus();
	await page.keyboard.press('PageDown');
	await expect(page.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await expect(page.locator('#box-1-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Next box' }).click();
	await page.getByRole('button', { name: 'Next box' }).click();
	await page.getByRole('button', { name: 'Next box' }).click();
	// Only reachable when the persisted five-box shape survived the reload; a fresh shape wraps at Box 03.
	await expect(page.getByRole('heading', { name: 'Box 05' })).toBeVisible();
	await expect(page.locator('#box-4-slot-0')).toContainText('Empty');

	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');

	const actions = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(actions).toBeVisible();
	await expect(actions.getByRole('button', { name: 'Move' })).toHaveAttribute(
		'data-availability',
		'empty-slot'
	);
	await expect(actions.getByRole('button', { name: 'Move' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
});

test('confirm opens slot actions and back restores the grid focus', async ({ page }) => {
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');

	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toContainText('Box 1, slot 2');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toContainText('Slot Menu');
	await expect(page.locator('.slot-command-row strong')).toHaveText([
		'Create Pokemon',
		'Move',
		'Copy',
		'Export',
		'Legality Check'
	]);
	await expect(page.getByRole('button', { name: 'Move' })).toHaveAttribute(
		'aria-describedby',
		'slot-action-1-reason'
	);
	await expect(page.locator('#slot-action-1-reason')).toHaveText('Move needs an occupied Slot.');
	await expect(page.getByRole('button', { name: 'Copy' })).toHaveAttribute(
		'aria-describedby',
		'slot-action-2-reason'
	);
	await expect(page.locator('#slot-action-2-reason')).toHaveText('Copy needs an occupied Slot.');
	await expect(
		page.getByRole('button', {
			name: 'Create Pokemon'
		})
	).toHaveAttribute('aria-disabled', 'true');
	await expect(page.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-disabled', 'true');
	await expect(page.getByRole('alert')).toHaveCount(0);

	await expect(page.locator('#slot-action-0')).toBeFocused();
	await expect(page.locator('.chrome-inert-owner')).toHaveCount(2);
	expect(
		await page
			.locator('.chrome-inert-owner')
			.evaluateAll((owners) => owners.every((owner) => owner.hasAttribute('inert')))
	).toBe(true);
	const focusedAfterChromeAttempt = await page.locator('#top-control-0').evaluate((control) => {
		(control as HTMLElement).focus();
		return document.activeElement?.id;
	});
	expect(focusedAfterChromeAttempt).toBe('slot-action-0');
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#slot-action-1')).toBeFocused();
	for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown']) {
		await page.keyboard.press(key);
	}
	await expect(page.locator('#slot-action-4')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Legality Check' })).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('.boxes-route')).toHaveAttribute('inert', '');

	const backgroundSlot = await page.locator('#box-0-slot-29').boundingBox();
	expect(backgroundSlot).not.toBeNull();
	await page.mouse.click(
		(backgroundSlot?.x ?? 0) + (backgroundSlot?.width ?? 0) / 2,
		(backgroundSlot?.y ?? 0) + (backgroundSlot?.height ?? 0) / 2
	);
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await expect(page.locator('#box-0-slot-1')).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();

	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();

	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await expect(page.locator('#box-0-slot-1')).toHaveAttribute('aria-selected', 'true');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();
});

test('occupied slot actions expose Edit and Close dismisses', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');

	const dialog = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('Edit');
	await expect(dialog.locator('.slot-command-row strong')).toHaveText([
		'Edit',
		'Move',
		'Copy',
		'Clear Slot',
		'Export',
		'Legality Check',
		'Pokemon Actions',
		'Create Pokemon'
	]);
	await expect(dialog.getByRole('button', { name: 'Export' })).toHaveAttribute(
		'aria-describedby',
		'slot-action-4-reason'
	);
	await expect(page.locator('#slot-action-4-reason')).toHaveText('Export is not available yet.');
	await expect(page.getByRole('button', { name: 'Edit' })).not.toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Move' })).not.toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Copy' })).not.toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Clear Slot' })).not.toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Legality Check' })).not.toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(page.getByRole('button', { name: 'Pokemon Actions' })).not.toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(
		page.getByRole('button', {
			name: 'Create Pokemon'
		})
	).toHaveAttribute('aria-disabled', 'true');

	await page.getByRole('button', { name: 'Close' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
});

test('Pokemon Actions cancel without mutation and explicitly apply an evolution', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Pokemon Actions' }).click();

	const actions = page.getByRole('dialog', { name: 'Pokemon Actions' });
	await expect(actions).toBeVisible({ timeout: 15000 });
	await expect(actions.locator('#pokemon-action-close')).toBeFocused();
	await expect(actions).toContainText('ARON');
	const evolve = actions.getByRole('button', { name: /Lairon.*Level 32/i });
	await expect(evolve).toBeEnabled();
	await evolve.click();
	await expect(actions).toContainText('Preview');
	await expect(actions).toContainText('Aron');
	await expect(actions).toContainText('Lairon');

	await actions.getByRole('button', { name: 'Cancel' }).click();
	await expect(actions).toContainText('Preview Legality Fix');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	await expect(page.locator('.toolbar-status-strip')).not.toHaveText('Unsaved edits');

	await actions.getByRole('button', { name: /Lairon.*Level 32/i }).click();
	await actions.getByRole('button', { name: 'Apply Pokemon Action' }).click();
	await expect(actions).toBeHidden({ timeout: 15000 });
	await expect(page.locator('#box-0-slot-0')).toContainText('LAIRON');
	await expect(page.locator('#box-0-slot-0')).toContainText('Lv 32');
	await expect(page.locator('.toolbar-status-strip')).toHaveText('Unsaved edits');
	await expect(page.locator('#slot-action-6')).toBeFocused();
});

test('creates a Pokemon from an empty Slot after explicit apply and preserves cancel', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	const destination = page.locator('#box-0-slot-2');
	await destination.click();
	await page.keyboard.press('Enter');
	const createCommand = page.getByRole('button', { name: 'Create Pokemon' });
	await expect(createCommand).not.toHaveAttribute('aria-disabled', 'true');
	await createCommand.click();

	const dialog = page.getByRole('dialog', { name: 'New Pokemon' });
	await expect(dialog).toBeVisible();
	await expect(page.locator('#pokemon-creation-close')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(dialog.locator('#pokemon-creation-species')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(destination).toContainText('Empty');
	await expect(page.locator('.toolbar-status-strip')).not.toHaveText('Unsaved edits');

	await createCommand.click();
	await dialog.locator('#pokemon-creation-species').fill('25');
	await dialog.locator('#pokemon-creation-level').fill('5');
	await dialog.getByRole('button', { name: 'Apply creation' }).click();

	await expect(dialog).toBeHidden({ timeout: 15000 });
	await expect(destination).toContainText('PIKACHU');
	await expect(destination).toContainText('Lv 5');
	await expect(destination).toBeFocused();
	await expect(page.locator('.toolbar-status-strip')).toHaveText('Unsaved edits');

	await page.goto('/saves');
	await selectActiveSaveCard(page);
	await expect(page.getByLabel('Save File Backups')).toContainText('Pokemon creation');
});

test('Edit opens Pokemon Editor and returns focus to the command stack', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor).toBeVisible();
	await expect(editor).toContainText('Save File Pokemon');
	await expect(editor).toContainText('Box 01 · Slot 1 · Row A / Col 1');
	await expect(editor).toContainText('Species #0304');
	await expect(editor).toContainText('Move Set');
	await expect(editor).toContainText('Editable');
	await expect(editor).toContainText('Engine projection');
	await expect(editor).toContainText('No Pokemon edits staged.');
	await expect(page.getByRole('button', { name: 'Apply edits' })).toBeDisabled();
	const species = editor.locator('#pokemon-editor-species');
	await expect(species).toBeEnabled({ timeout: 15000 });
	await species.click({ position: { x: 8, y: 20 } });
	await expect(species).toBeFocused();
	await page.locator('#pokemon-editor-close').focus();
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-species')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-form')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-nickname')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-nature')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-held-item')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-ability')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-met-location')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-met-level')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-origin-game')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-ball')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-original-trainer-name')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-trainer-id')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-secret-id')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-trainer-gender')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-pokemon-language')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-mode')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-pokemon-language')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-trainer-gender')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-secret-id')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-trainer-id')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-original-trainer-name')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(editor.locator('#pokemon-editor-ball')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(editor.locator('#pokemon-editor-origin-game')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(editor.locator('#pokemon-editor-met-level')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(editor.locator('#pokemon-editor-met-location')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-ability')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-held-item')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(editor.locator('#pokemon-editor-nature')).toBeFocused();

	await page.keyboard.press('ArrowUp');
	await expect(editor.locator('#pokemon-editor-nickname')).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(editor).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('#slot-action-0')).toBeFocused();
});

test('Pokemon Editor exposes Move Set, IV, and EV projection sections', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();

	await page.getByRole('button', { name: 'Edit' }).click();
	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor).toBeVisible();
	await expect(editor).toContainText('Move Set');
	await expect(editor).toContainText('Visible Moves');
	await expect(editor).toContainText('IV / EV');
	await expect(editor).toContainText('Stats');
	await expect(editor).toContainText('No Pokemon edits staged.');
	await expect(editor.getByRole('button', { name: 'Apply edits' })).toBeDisabled();
	await editor.getByRole('combobox', { name: 'Move 1' }).click();
	await expect(editor.getByRole('searchbox', { name: 'Search moves for Move 1' })).toBeVisible();
	await expect(
		page.locator('#pokemon-editor-move-0-list [data-combobox-option]').first()
	).toBeVisible();
});

test('Pokemon Editor applies nickname changes and refreshes Slot labels', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor).toBeVisible();

	const nickname = editor.locator('#pokemon-editor-nickname');
	await fillEditorInput(nickname, 'RON');
	await nickname.press('Backspace');
	await expect(page.getByRole('dialog', { name: 'ARON' })).toBeVisible();
	await expect(nickname).toHaveValue('RO');
	await fillEditorInput(nickname, 'RON');
	await expect(editor).toContainText('1 Pokemon edit drafted.');

	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(page.locator('#box-0-slot-0')).toContainText('RON', { timeout: 15000 });
	const updatedEditor = page.getByRole('dialog', { name: 'RON' });
	await expect(updatedEditor).toBeVisible();
	await expect(updatedEditor).toContainText('Pokemon nickname updated.');
	await expect(updatedEditor.getByRole('button', { name: 'Apply edits' })).toBeDisabled();
});

test('Pokemon Editor previews and applies a Species and Form change', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await page.getByRole('button', { name: 'Edit' }).click();

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const species = editor.locator('#pokemon-editor-species');
	await expect(species).toBeEnabled({ timeout: 15000 });
	await species.selectOption({ label: 'Lairon' });
	await expect(editor).toContainText('Lairon · Default', { timeout: 15000 });
	await expect(editor).toContainText('Sprite Identity');
	await expect(editor).toContainText('1 Pokemon edit drafted.');

	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(page.locator('#box-0-slot-0')).toContainText('LAIRON', { timeout: 15000 });
	const updatedEditor = page.getByRole('dialog', { name: 'LAIRON' });
	await expect(updatedEditor).toContainText('Pokemon edits applied.');
	await expect(updatedEditor).toContainText('Species #0305');
	await expect(page.getByRole('status').filter({ hasText: 'Unsaved edits' })).toBeVisible();
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();
});

test('Pokemon Editor applies Original Trainer name changes and returns focus', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const trainerName = editor.locator('#pokemon-editor-original-trainer-name');
	await expect(editor).toContainText('Original Trainer');
	await fillEditorInput(trainerName, 'RAJAN');
	await expect(editor).toContainText('1 Pokemon edit drafted.');

	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(trainerName).toHaveValue('RAJAN', { timeout: 15000 });
	await expect(editor).toContainText('Pokemon edits applied.');
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();
});

test('Pokemon Editor changes Held Item and returns focus to the command stack', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const heldItem = page.locator('#pokemon-editor-held-item');
	await expect(editor).toContainText('Held Item');
	await expect(heldItem).toBeEnabled();
	await expect(editor.locator('#pokemon-editor-species')).toBeEnabled({ timeout: 15000 });
	const originalItem = await heldItem.inputValue();

	await page.locator('#pokemon-editor-close').focus();
	for (let step = 0; step < 5; step += 1) {
		await page.keyboard.press('ArrowDown');
	}
	await expect(heldItem).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(heldItem).not.toHaveValue(originalItem);
	const changedItem = await heldItem.inputValue();
	await expect(editor).toContainText('1 Pokemon edit drafted.');

	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(editor).toContainText('Pokemon edits applied.', { timeout: 15000 });
	await expect(heldItem).toHaveValue(changedItem);
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(editor).toBeHidden();
	await expect(page.locator('#slot-action-0')).toBeFocused();
});

test('Pokemon Editor changes Ability and returns focus to the command stack', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const ability = page.locator('#pokemon-editor-ability');
	await expect(editor).toContainText('Ability');
	await expect(ability).toBeEnabled();
	await expect(editor.locator('#pokemon-editor-species')).toBeEnabled({ timeout: 15000 });
	const originalAbility = await ability.inputValue();

	await page.locator('#pokemon-editor-close').focus();
	for (let step = 0; step < 6; step += 1) {
		await page.keyboard.press('ArrowDown');
	}
	await expect(ability).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(ability).not.toHaveValue(originalAbility);
	const changedAbility = await ability.inputValue();
	await expect(editor).toContainText('1 Pokemon edit drafted.');

	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(editor).toContainText('Pokemon edits applied.', { timeout: 15000 });
	await expect(ability).toHaveValue(changedAbility);
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(editor).toBeHidden();
	await expect(page.locator('#slot-action-0')).toBeFocused();
});

test('Pokemon Editor applies Met Data and returns focus to Edit', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const ball = editor.locator('#pokemon-editor-ball');
	await expect(ball).toBeVisible();
	const currentBall = await ball.inputValue();
	const ballChoices = await ball.locator('option').evaluateAll((options) =>
		options.map((option) => ({
			value: (option as HTMLOptionElement).value,
			label: option.textContent ?? ''
		}))
	);
	const nextBall = ballChoices.find((option) => option.value !== currentBall);
	if (!nextBall) throw new Error('Expected another engine-provided Ball choice.');

	await ball.selectOption(nextBall.value);
	await expect(editor).toContainText('1 Pokemon edit drafted.');
	await editor.getByRole('button', { name: 'Apply edits' }).click();

	const updatedEditor = page.getByRole('dialog', { name: 'ARON' });
	await expect(updatedEditor).toContainText('Pokemon edits applied.', { timeout: 15000 });
	await expect(updatedEditor.locator('#pokemon-editor-ball')).toHaveValue(nextBall.value);
	await updatedEditor.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(updatedEditor).toBeHidden();
	await expect(page.locator('#slot-action-0')).toBeFocused();
});

test('Legality Check opens an engine report from an occupied Slot and dismisses cleanly', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']) {
		await page.keyboard.press(key);
	}
	await expect(page.locator('#slot-action-5')).toBeFocused();
	await page.keyboard.press('Enter');

	const report = page.getByRole('dialog', { name: 'Legality Check' });
	await expect(report).toBeVisible({ timeout: 15000 });
	await expect(report).toContainText('ARON');
	await expect(report).toContainText(/PKHeX (judged|found)/);
	await report.getByRole('button', { name: 'Close report' }).focus();
	await expect(report.getByRole('button', { name: 'Close report' })).toBeFocused();
	await expect(page.getByText('Dirty Workspace')).toHaveCount(0);

	await page.keyboard.press('Escape');
	await expect(report).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('#slot-action-5')).toBeFocused();
});

test('keyboard navigation reaches top controls and mobile tabs', async ({ page }) => {
	await openEmptySaves(page);
	await page.locator('#top-control-0').focus();
	await expect(page.locator('#top-control-0')).toBeFocused();

	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-1')).toBeFocused();

	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-2')).toBeFocused();

	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-3')).toBeFocused();

	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-4')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-6')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-5')).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('#top-control-6')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#top-control-5')).toBeFocused();
	await page.locator('#box-0-slot-24').focus();
	await expect(page.locator('#top-control-6')).not.toHaveClass(/controller-focused/);

	await page.locator('#box-0-slot-24').focus();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#box-0-slot-24')).toBeFocused();

	await page.setViewportSize({ width: 420, height: 860 });
	await page.locator('#box-0-slot-0').focus();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pane-control-0')).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#top-control-5')).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#top-control-4')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-6')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-5')).toBeFocused();
	await expect(page.locator('.section-pills')).toBeHidden();

	await page.locator('#box-0-slot-0').focus();
	for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown']) {
		await page.keyboard.press(key);
	}

	await expect(page.locator('#mobile-tab-1')).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('#mobile-tab-0')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#mobile-tab-1')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#mobile-tab-2')).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('#mobile-tab-1')).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#box-0-slot-25')).toBeFocused();
});

test('controller input follows the keyboard navigation path', async ({ page }) => {
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();

	await pressController(page, 'ArrowRight');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();

	await pressController(page, 'Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('.boxes-route')).toHaveAttribute('inert', '');
	await pressController(page, 'y');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Add Box Source' })).toBeHidden();

	await pressController(page, 'ArrowDown');
	await expect(page.locator('#slot-action-1')).toBeFocused();
	await expect(page.locator('#slot-action-1')).toHaveClass(/controller-focused/);

	await pressController(page, 'Escape');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await expect(page.locator('.boxes-route')).not.toHaveAttribute('inert', '');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();

	await pressController(page, 'y');
	await expect(page.getByRole('dialog', { name: 'Add Box Source' })).toBeVisible();
	await expect(page.locator('.boxes-route')).toHaveAttribute('inert', '');
	await expect(page.locator('.source-card').first()).toBeFocused();
	await expect
		.poll(() =>
			page
				.locator('.source-card')
				.first()
				.evaluate((control) => getComputedStyle(control).outlineStyle)
		)
		.toBe('solid');
	await pressController(page, 'Escape');
	await expect(page.locator('.boxes-route')).not.toHaveAttribute('inert', '');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();
});

test('controller focus framework covers every interactive surface', async ({ page }) => {
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();
	await pressController(page, 'ArrowRight');
	await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'controller');

	await pressController(page, 'Enter');
	const slotActions = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(slotActions).toBeVisible();
	await expectControllerHighlights(page, slotActions);
	await pressController(page, 'Escape');

	await pressController(page, 'y');
	const sourcePicker = page.getByRole('dialog', { name: 'Add Box Source' });
	await expect(sourcePicker).toBeVisible();
	await expectControllerHighlights(page, sourcePicker);
	await pressController(page, 'Escape');

	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await pressController(page, 'Enter');
	await pressController(page, 'Enter');
	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor).toBeVisible();
	await expect(editor.locator('#pokemon-editor-species')).toBeEnabled({ timeout: 15000 });
	await expectControllerHighlights(page, editor);
	await pressController(page, 'Escape');
	await pressController(page, 'Escape');

	await page.getByRole('button', { name: 'Save File' }).click();
	await expect(page).toHaveURL(/\/save-file$/);
	await expect(page.locator('.field-sidebar nav button').first()).toBeVisible();
	await pressController(page, 'ArrowDown');
	await expect(page.locator('.save-file-route').locator(':focus')).toHaveCount(1);
	await expectControllerHighlights(page, page.locator('.save-file-route'));
	await page.getByRole('button', { name: /Money/ }).first().click();
	await pressController(page, 'ArrowDown');
	await expectControllerHighlights(page, page.locator('.save-file-route'));
	await page.getByRole('button', { name: /Bag Inventory pockets/ }).click();
	await pressController(page, 'ArrowDown');
	await expectControllerHighlights(page, page.locator('.save-file-route'));

	await page.getByRole('button', { name: 'Saves' }).click();
	await expect(page).toHaveURL(/\/saves$/);
	await pressController(page, 'ArrowDown');
	await expectControllerHighlights(page, page.locator('.saves-page'));
	await page.locator('.save-card.active .danger-action').click();
	const confirmDialog = page.getByRole('alertdialog');
	await expect(confirmDialog).toBeVisible();
	await pressController(page, 'ArrowRight');
	await expectControllerHighlights(page, confirmDialog);
});

test('controller shoulder buttons switch boxes and A drives the party toggle and editor', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();

	await pressController(page, 'PageDown');
	await expect(page.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await pressController(page, 'PageUp');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();

	await pressController(page, 'ArrowUp');
	await expect(page.locator('#party-slot-0')).toBeFocused();
	await pressController(page, 'ArrowUp');
	await expect(page.locator('#party-toggle')).toBeFocused();

	await pressController(page, 'Enter');
	await expect(page.locator('#party-list')).toBeHidden();
	await pressController(page, 'ArrowDown');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await pressController(page, 'ArrowUp');
	await expect(page.locator('#party-toggle')).toBeFocused();
	await pressController(page, 'Enter');
	await expect(page.locator('#party-list')).toBeVisible();

	await pressController(page, 'ArrowDown');
	await expect(page.locator('#party-slot-0')).toBeFocused();
	await pressController(page, 'ArrowDown');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await pressController(page, 'Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await pressController(page, 'Enter');
	await expect(page.locator('.pokemon-editor')).toBeVisible();
	await pressController(page, 'Escape');
	await expect(page.locator('.pokemon-editor')).toBeHidden();
	await pressController(page, 'Escape');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
});

test('landscape-floor Slot Menu uses the trailing Safe Canvas edge without shell growth', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	const viewport = { width: 640, height: 360 };
	const insets = { top: 12, right: 12, bottom: 12, left: 12 };
	await page.setViewportSize(viewport);
	await setSafeArea(page, insets);
	await page.locator('#box-grid').focus();
	const beforeOpen = await shellExtents(page);
	await page.keyboard.press('Enter');

	const dialog = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(dialog).toContainText('Clear Slot');
	await expectLastSlotCommandVisible(page);
	await expectSmallSlotCommandControls(page);
	const menuBounds = await edgeSurfaceBounds(page);
	expectSafeCanvas(menuBounds, viewport, insets);
	expect(menuBounds.panel?.right).toBe(menuBounds.layer.right);
	expect(menuBounds.panel?.top).toBe(menuBounds.layer.top);
	expect(menuBounds.panel?.bottom).toBe(menuBounds.layer.bottom);
	expect(menuBounds.panel?.width ?? 0).toBeLessThan(menuBounds.layer.width);
	expect(await shellExtents(page)).toEqual(beforeOpen);

	await page.getByRole('button', { name: 'Clear Slot' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(1);
	await expect(page.getByRole('dialog', { name: 'Clear ARON?' })).toContainText('Box 01 Slot 1');
	const clearBounds = await edgeSurfaceBounds(page);
	expectSafeCanvas(clearBounds, viewport, insets);
	expect(clearBounds.panel?.right).toBe(clearBounds.layer.right);
	expect(clearBounds.panel?.top).toBe(clearBounds.layer.top);
	expect(clearBounds.panel?.bottom).toBe(clearBounds.layer.bottom);
	expect(await shellExtents(page)).toEqual(beforeOpen);
});

test('small widescreen viewports use the mobile shell', async ({ page }) => {
	await openEmptySaves(page);
	await page.setViewportSize({ width: 960, height: 540 });

	await expect(page.locator('.mobile-tabbar')).toBeVisible();
	await expect(page.locator('.section-pills')).toBeHidden();
	await expect(page.locator('.box-sidebar')).toBeHidden();
});

test('portrait-floor Slot Menu uses the bottom Safe Canvas edge without shell growth', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	const viewport = { width: 360, height: 640 };
	const insets = { top: 24, right: 0, bottom: 72, left: 0 };
	await page.setViewportSize(viewport);
	await setSafeArea(page, insets);
	await page.locator('#box-grid').focus();
	const beforeOpen = await shellExtents(page);
	await page.keyboard.press('Enter');

	const dialog = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(dialog).toContainText('Clear Slot');
	await expectLastSlotCommandVisible(page);
	await expectSmallSlotCommandControls(page);
	const menuBounds = await edgeSurfaceBounds(page);
	expectSafeCanvas(menuBounds, viewport, insets);
	expect(menuBounds.panel?.left).toBe(menuBounds.layer.left);
	expect(menuBounds.panel?.right).toBe(menuBounds.layer.right);
	expect(menuBounds.panel?.bottom).toBe(menuBounds.layer.bottom);
	expect(await shellExtents(page)).toEqual(beforeOpen);

	await page.getByRole('button', { name: 'Clear Slot' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(1);
	await expect(page.getByRole('dialog', { name: 'Clear ARON?' })).toContainText('Box 01 Slot 1');
	const clearBounds = await edgeSurfaceBounds(page);
	expectSafeCanvas(clearBounds, viewport, insets);
	expect(clearBounds.panel?.left).toBe(clearBounds.layer.left);
	expect(clearBounds.panel?.right).toBe(clearBounds.layer.right);
	expect(clearBounds.panel?.bottom).toBe(clearBounds.layer.bottom);
	expect(await shellExtents(page)).toEqual(beforeOpen);
});

test('large allocated Edge Menu applies the shared density type refinement', async ({ page }) => {
	await openEmptySaves(page);
	const viewport = { width: 920, height: 720 };
	const insets = { top: 10, right: 10, bottom: 10, left: 10 };
	await page.setViewportSize(viewport);
	await setSafeArea(page, insets);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');

	const bounds = await edgeSurfaceBounds(page);
	expectSafeCanvas(bounds, viewport, insets);
	const type = await page.getByRole('dialog', { name: 'Slot actions' }).evaluate((dialog) => {
		const style = getComputedStyle(dialog);
		return {
			caption: parseFloat(style.getPropertyValue('--pksx-type-caption')),
			label: parseFloat(style.getPropertyValue('--pksx-type-label'))
		};
	});
	expect(type).toEqual({ caption: 11, label: 13 });
});

test('square Safe Canvas keeps the bottom Menu edge and preserves a pending Clear on reflow', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	const squareViewport = { width: 384, height: 408 };
	const landscapeViewport = { width: 640, height: 360 };
	const insets = { top: 12, right: 0, bottom: 12, left: 0 };
	await page.setViewportSize(squareViewport);
	await setSafeArea(page, insets);
	const squareBaseline = await shellExtents(page);
	await page.setViewportSize(landscapeViewport);
	const landscapeBaseline = await shellExtents(page);
	await page.setViewportSize(squareViewport);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');

	const dialog = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(dialog).toContainText('011020251345.sav, Box 1, slot 1');
	let edges = await edgeSurfaceBounds(page);
	expectSafeCanvas(edges, squareViewport, insets);
	expect(edges.layer.width).toBe(edges.layer.height);
	expect(edges.panel?.left).toBe(edges.layer.left);
	expect(edges.panel?.right).toBe(edges.layer.right);
	expect(edges.panel?.bottom).toBe(edges.layer.bottom);
	expect(await shellExtents(page)).toEqual(squareBaseline);

	await page.getByRole('button', { name: 'Clear Slot' }).click();
	const clear = page.getByRole('dialog', { name: 'Clear ARON?' });
	await expect(clear).toContainText('Clear ARON?');
	await expect(page.getByRole('dialog')).toHaveCount(1);
	expect(await shellExtents(page)).toEqual(squareBaseline);
	await page.setViewportSize(landscapeViewport);

	await expect(clear).toContainText('Box 01 Slot 1');
	await expect(page.getByRole('dialog')).toHaveCount(1);
	edges = await edgeSurfaceBounds(page);
	expectSafeCanvas(edges, landscapeViewport, insets);
	expect(edges.panel?.right).toBe(edges.layer.right);
	expect(edges.panel?.top).toBe(edges.layer.top);
	expect(edges.panel?.bottom).toBe(edges.layer.bottom);
	expect(await shellExtents(page)).toEqual(landscapeBaseline);

	await page.keyboard.press('Escape');
	await expect(dialog).toBeVisible();
	await expect(page.locator('#slot-action-3')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	expect(await shellExtents(page)).toEqual(landscapeBaseline);
});

test('each Clear and Slot Menu backdrop tap dismisses exactly one level without mutation', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	const backupsBefore = await backupCount(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Clear Slot' }).click();

	await page.getByRole('button', { name: 'Dismiss Clear ARON?' }).click();
	await expect(page.getByRole('dialog', { name: 'Clear ARON?' })).toBeHidden();
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('#slot-action-3')).toBeFocused();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	expect(await backupCount(page)).toBe(backupsBefore);

	await page.getByRole('button', { name: 'Dismiss Slot actions' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	expect(await backupCount(page)).toBe(backupsBefore);
});

test('pointer Slot clicks only move Controller Focus', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#party-slot-4').click();

	await expect(page.locator('#party-slot-4')).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();

	await page.locator('#party-slot-4').click();
	await page.locator('#party-slot-4').dblclick();
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();

	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText('Party slot 5');

	const menuState = await dialog.evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		return {
			top: rect.top,
			left: rect.left,
			bottom: rect.bottom,
			right: rect.right,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
			menuOwnsTopPoint: element.contains(document.elementFromPoint(x, y))
		};
	});

	expect(menuState.left).toBeGreaterThanOrEqual(0);
	expect(menuState.top).toBeGreaterThanOrEqual(0);
	expect(menuState.right).toBeLessThanOrEqual(menuState.viewportWidth);
	expect(menuState.bottom).toBeLessThanOrEqual(menuState.viewportHeight);
	expect(menuState.menuOwnsTopPoint).toBe(true);
});

test('active slot detail rail follows controller focus', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	const rail = page.getByTestId('active-slot-detail-rail');

	await page.locator('#box-grid').focus();
	await expect(rail).toContainText('ARON');
	await expect(rail).toContainText('Species #0304');
	await expect(rail).toContainText('LEVEL');
	await expect(rail).toContainText('11');
	await expect(rail).toContainText('Box 01 · Slot 1 · Row A / Col 1');
	await expect(rail).toContainText('Sassy');
	await expect(rail).toContainText('Rock Head');
	await expect(rail).toContainText('Move Set');
	await expect(rail).toContainText('Tackle');
	await expect(rail).toContainText('Stats');

	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#box-0-slot-1')).toHaveAttribute('aria-selected', 'true');
	await expect(rail).toContainText('ILLUMISE');
	await expect(rail).toContainText('Species #0314');
	await expect(rail).toContainText('Box 01 · Slot 2 · Row A / Col 2');
	await expect(rail).not.toContainText('Not available');
	await expect(rail).toContainText('Move Set');

	await page.locator('#party-slot-0').click();
	await expect(page.locator('#party-slot-0')).toHaveAttribute('aria-selected', 'true');
	await expect(rail).toContainText('1-UP');
	await expect(rail).toContainText('Party · Slot 1');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
});

test('imports the Emerald Save File, renders engine data, and exports serialized bytes', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await expect(page.getByText('DIXIE', { exact: true })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	await expect(page.locator('#party-slot-0')).toContainText('1-UP');
	const detailRail = page.getByTestId('active-slot-detail-rail');
	await expect(detailRail).toContainText('Steel');
	await expect(detailRail).toContainText('Rock');
	await expect(detailRail).toContainText('Sassy');
	await expect(detailRail).toContainText('Rock Head');
	await expect(detailRail).toContainText('Stats');
	await expect(detailRail).toContainText('HP');
	await expect(detailRail).toContainText('+0');
	await expect(detailRail).toContainText('Move Set');
	await expect(detailRail).not.toContainText('Not available');

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export' }).click();
	const download = await downloadPromise;
	const exported = await readFile(await download.path());
	const fixture = await readFile(emeraldFixturePath);

	expect(download.suggestedFilename()).toBe('emerald-011020251345.pksx.sav');
	expect(exported.byteLength).toBe(fixture.byteLength);
});

test('Save File route stages and applies trainer, money, and inventory edits', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.getByRole('button', { name: 'Save File' }).click();
	await expect(page).toHaveURL(/\/save-file$/);

	await expect(page.getByRole('heading', { name: 'Trainer profile' })).toBeVisible();
	const applyButton = page.getByRole('button', { name: /Apply edits/ });
	await expect(applyButton.locator('kbd')).toHaveCount(0);
	await page.getByRole('button', { name: 'Use dark mode' }).click();
	await expect(page.locator('.save-file-route')).toHaveCSS('color', 'rgb(244, 245, 247)');
	await page.getByRole('button', { name: 'Use light mode' }).click();

	const trainerName = page.locator('#save-file-trainer-name');
	await expect(trainerName).toHaveValue('DIXIE');
	await trainerName.fill('RAJ');
	await expect(page.getByText('1 staged edit')).toBeVisible();

	const fields = page.getByLabel('Save File fields');
	const trainerSection = fields.getByRole('button', { name: /Trainer profile/ });
	const moneySection = fields.getByRole('button', { name: /Money/ });
	await trainerSection.focus();
	await pressController(page, 'ArrowDown');
	await expect(moneySection).toBeFocused();
	await moneySection.click();
	await expect(page.getByRole('heading', { name: 'Money', exact: true })).toBeVisible();
	await page.locator('#save-file-money').fill('12345');

	await fields.getByRole('button', { name: /Bag/ }).click();
	await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
	const quantity = page.locator('.item-list article:not(.new-item) input[type="number"]').first();
	const originalQuantity = Number(await quantity.inputValue());
	await quantity.fill(String(originalQuantity + 1));
	await quantity.press('Tab');

	const addItem = page.getByRole('combobox', { name: /Add an item to/ });
	await addItem.click();
	const itemSearch = page.getByRole('searchbox', { name: /Search items/ });
	await expect(itemSearch).toBeVisible();
	await page.getByRole('option').first().click();
	await page.getByRole('button', { name: '+ Add', exact: true }).click();
	await expect(page.locator('.item-list article.new-item')).toHaveCount(1);
	await page.locator('.item-list article:not(.new-item) button.remove').nth(1).click();
	await expect(page.getByText('Save File bytes remain untouched until Apply.')).toBeVisible();

	await page.getByRole('button', { name: /Apply edits/ }).click();
	await expect(page.getByText('Save File edits applied.')).toBeVisible({ timeout: 15000 });
	await expect(page.getByText('Backup created')).toBeVisible();
	await expect(page.getByText('Workspace has unapplied export changes.')).toBeVisible();

	await fields.getByRole('button', { name: /Trainer profile/ }).click();
	await expect(trainerName).toHaveValue('RAJ');
	await trainerName.fill('TEMP');
	await page.getByRole('button', { name: 'Cancel all' }).click();
	await expect(trainerName).toHaveValue('RAJ');

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export' }).click();
	const download = await downloadPromise;
	const exported = await readFile(await download.path());
	const fixture = await readFile(emeraldFixturePath);
	expect(exported).not.toEqual(fixture);
});

test('Pokemon Editor changes level through Apply and keeps editor focus', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Edit' }).click();

	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor).toBeVisible();
	await expect(editor).toContainText('Level / Experience');
	await expect(editor).toContainText('Level 11');
	await expect(editor.locator('#pokemon-editor-species')).toBeEnabled({ timeout: 15000 });
	await page.locator('#pokemon-editor-close').focus();
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();

	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-species')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-form')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-nickname')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-nature')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-held-item')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-ability')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-met-location')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-met-level')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-origin-game')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(editor.locator('#pokemon-editor-ball')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-original-trainer-name')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-trainer-id')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-secret-id')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-trainer-gender')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-pokemon-language')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#pokemon-editor-mode')).toBeFocused();
	await expect(page.locator('#pokemon-editor-mode')).toHaveAttribute('aria-label', 'Editing Level');
	await page.keyboard.press('Enter');
	await expect(page.locator('#pokemon-editor-mode')).toHaveAttribute(
		'aria-label',
		'Editing Experience'
	);
	await page.keyboard.press('Enter');
	await expect(page.locator('#pokemon-editor-mode')).toHaveAttribute('aria-label', 'Editing Level');
	await page.keyboard.press('ArrowDown');
	const levelInput = editor.getByRole('spinbutton', { name: /^Level/ });
	await expect(levelInput).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#pokemon-editor-mode')).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(levelInput).toBeFocused();
	await page.keyboard.press(' ');
	await expect(levelInput).toHaveAttribute('data-controller-editing', 'true');
	await levelInput.fill('13');
	await expect(levelInput).toHaveValue('13');
	await expect(editor).toContainText('1 Pokemon edit drafted.');
	await expect(editor.getByRole('button', { name: 'Apply edits' })).toBeEnabled();

	await page.keyboard.press('ArrowLeft');
	await expect(page.locator('#pokemon-editor-mode')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(levelInput).toBeFocused();
	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(editor).toContainText('Pokemon edits applied.', { timeout: 15000 });
	await expect(editor).toContainText('Level 13');
	await expect(page.locator('#box-0-slot-0')).toContainText('Lv 13');
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();
});

test('Pokemon Editor stages, cancels, and applies an engine-projected Tera Type', async ({
	page
}) => {
	await openEmptySaves(page);
	await importScarletThroughSaves(page);

	await page.locator('#party-slot-0').click();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Edit' }).click();

	const editor = page.getByRole('dialog').filter({ hasText: 'Battle Fields' });
	const teraType = editor.locator('#pokemon-editor-battle-field-tera-type');
	await expect(teraType).toBeVisible({ timeout: 60000 });
	const original = await teraType.inputValue();
	const next = await teraType.locator('option').evaluateAll((options, current) => {
		const option = options.find((candidate) => (candidate as HTMLOptionElement).value !== current);
		return option ? (option as HTMLOptionElement).value : null;
	}, original);
	if (!next) throw new Error('Expected another Tera Type choice.');

	await teraType.selectOption(next);
	await expect(editor).toContainText('1 Pokemon edit drafted.');
	await editor.getByRole('button', { name: 'Cancel edits' }).click();
	await expect(teraType).toHaveValue(original);

	await teraType.selectOption(next);
	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(editor).toContainText('Pokemon edits applied.', { timeout: 60000 });
	await expect(editor.locator('#pokemon-editor-battle-field-tera-type')).toHaveValue(next);
	await expect(page.locator('.toolbar-status-strip')).toHaveText('Unsaved edits');
});

test('Pokemon Editor changes Nature through Apply and keeps editor focus', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Edit' }).click();

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const nature = editor.locator('#pokemon-editor-nature');
	await expect(nature).toBeEnabled();
	const nextNature = (await nature.inputValue()) === '3' ? '15' : '3';
	await nature.selectOption(nextNature);
	await expect(editor).toContainText('1 Pokemon edit drafted.');

	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(editor).toContainText('Pokemon edits applied.', { timeout: 15000 });
	await expect(nature).toHaveValue(nextNature);
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();
});

test('Pokemon Editor stages and applies Friendship while restoring focus', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Edit' }).click();

	const editor = page.getByRole('dialog', { name: 'ARON' });
	const friendship = editor.getByRole('spinbutton', { name: /^Friendship/ });
	await expect(friendship).toBeEnabled();
	const original = Number(await friendship.inputValue());
	const updated = original === 255 ? 254 : original + 1;

	await fillEditorInput(friendship, String(updated));
	await expect(editor).toContainText('1 Pokemon edit drafted.');
	await editor.getByRole('button', { name: 'Cancel edits' }).click();
	await expect(friendship).toHaveValue(String(original));

	await fillEditorInput(friendship, String(updated));
	await editor.getByRole('button', { name: 'Apply edits' }).click();
	await expect(editor).toContainText('Pokemon edits applied.', { timeout: 15000 });
	await expect(editor.getByRole('spinbutton', { name: /^Friendship/ })).toHaveValue(
		String(updated)
	);
	await expect(page.locator('#pokemon-editor-close')).toBeFocused();
});

test('creates and restores a manual backup for the loaded Save File', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.getByRole('button', { name: 'Saves' }).click();
	await expect(page).toHaveURL(/\/saves$/);
	await selectActiveSaveCard(page);
	const backups = page.getByLabel('Save File Backups');
	await expect(backups).toContainText('No Backups yet.');

	await backups.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByText('Backup created.')).toBeVisible();
	await expect(backups).toContainText('Manual');

	await backups.getByRole('button', { name: 'Open' }).click();
	await expect(page.locator('.save-chip')).toContainText('011020251345.restored.sav', {
		timeout: 15000
	});
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
});

test('deletes backups and save files after confirmation', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.goto('/saves');
	await selectActiveSaveCard(page);

	const backups = page.getByLabel('Save File Backups');
	await backups.getByRole('button', { name: 'Create' }).click();
	await expect(page.getByText('Backup created.')).toBeVisible();
	await expect(backups).toContainText('Manual');

	await backups.getByRole('button', { name: 'Delete' }).click();
	const backupDialog = page.getByRole('alertdialog', { name: 'Delete Manual Backup?' });
	await expect(backupDialog).toBeVisible();
	await expect(backupDialog).toContainText('This cannot be undone.');
	await backupDialog.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Backup deleted.')).toBeVisible();
	await expect(backups).toContainText('No Backups yet.');

	await page.locator('.save-card.active').getByRole('button', { name: 'Delete' }).click();
	const saveDialog = page.getByRole('alertdialog', {
		name: 'Delete emerald-011020251345.sav?'
	});
	await expect(saveDialog).toBeVisible();
	await expect(saveDialog).toContainText('all of its Backups');
	await saveDialog.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('emerald-011020251345.sav deleted.')).toBeVisible();
	await expect(page.locator('.save-card')).toHaveCount(1);
	await expect(page.locator('.storage-card')).toContainText('Pokemon Storage');
	await expect(page.getByText('No active Save File')).toBeVisible();
});

test('moves an occupied box slot into an empty destination slot', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await moveFirstEmeraldBoxSlotToThirdSlot(page);
	await expect(page.locator('#box-0-slot-2')).toBeFocused();
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('reload preserves unexported slot changes from the active workspace', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await moveFirstEmeraldBoxSlotToThirdSlot(page);
	await expect(page.locator('.toolbar-status-strip')).toHaveText('Unsaved edits');

	await page.reload();
	await expect(page.locator('.save-chip')).toContainText('011020251345.sav', { timeout: 15000 });
	await expect(page.locator('.toolbar-status-strip')).toHaveText('Unsaved edits');
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-2')).toContainText('ARON');
	await expect(page.locator('.toolbar-status-strip')).toHaveText('Unsaved edits');
});

test('can perform another slot mutation after the first move changes workspace bytes', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await moveFirstEmeraldBoxSlotToThirdSlot(page);
	await page.locator('#box-0-slot-1').click();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Copy' }).click();
	await page.locator('#box-0-slot-3').click();

	await expect(page.locator('#box-0-slot-3')).toContainText('ILLUMISE');
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('copies an occupied box slot into an empty destination slot', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	await expect(page.locator('#box-0-slot-3')).toContainText('ARON');
	await expect(page.locator('#box-0-slot-3')).toBeFocused();
});

test('copy keeps destination selection active and shows an error toast for occupied destinations', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await expect(page.locator('#box-0-slot-1')).toBeFocused();
	await expect(page.getByRole('alert')).toContainText('Copy needs an empty destination Slot.');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	await expect(page.locator('#box-0-slot-1')).toContainText('ILLUMISE');
});

test('clear slot cancellation and confirmation use the in-app confirmation surface', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await seedOccupiedPokemonStorageSlot(page);
	const backupsBefore = await backupCount(page);

	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Enter');

	const confirmDialog = page.getByRole('dialog', { name: 'Clear ARON?' });
	await expect(confirmDialog).toBeVisible();
	await expect(confirmDialog).toContainText('Clear Slot');
	await expect(confirmDialog).toContainText('Box 01 Slot 1');
	await page.getByRole('button', { name: 'Cancel' }).click();
	await expect(confirmDialog).toBeHidden();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('#slot-action-3')).toBeFocused();
	expect(await backupCount(page)).toBe(backupsBefore);

	await page.getByRole('button', { name: 'Clear Slot' }).click();
	await page.getByRole('button', { name: 'Confirm Clear' }).click();

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	expect(await backupCount(page)).toBe(backupsBefore + 1);

	await page.goto('/?source=pokemon-storage');
	await expect(page.locator('#box-0-slot-0')).toContainText('STORAGE ARON');
});

test('Clear uses its Pokemon Storage owner without mutating the loaded Save File or Backup state', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await seedOccupiedPokemonStorageSlot(page);
	const backupsBefore = await backupCount(page);

	await page.goto('/?source=pokemon-storage');
	await expect(page.locator('#box-0-slot-0')).toContainText('STORAGE ARON');
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Clear Slot' }).click();
	await expect(page.getByRole('dialog', { name: 'Clear STORAGE ARON?' })).toContainText(
		'This removes the Pokemon from Pokemon Storage.'
	);
	await page.getByRole('button', { name: 'Confirm Clear' }).click();

	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	expect(await backupCount(page)).toBe(backupsBefore);

	await page.getByRole('button', { name: 'Add source' }).click();
	await page.getByRole('button', { name: /011020251345.sav/ }).click();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
});

test('keyboard navigation covers the Saves route controls and desktop overflow scrolls', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.setViewportSize({ width: 1100, height: 520 });
	await page.goto('/saves');

	await page.locator('#top-control-0').focus();
	await page.keyboard.press('ArrowRight');
	await expect(page.locator('#top-control-1')).toBeFocused();
	for (let index = 0; index < 6; index += 1) {
		if (
			await page
				.getByRole('button', { name: /Import a Save File/ })
				.evaluate((button) => button === document.activeElement)
		) {
			break;
		}
		await page.keyboard.press('ArrowRight');
	}
	await expect(page.getByRole('button', { name: /Import a Save File/ })).toBeFocused();

	const fixture = await readFile(emeraldFixturePath);
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'alpha.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'beta.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});
	await expect(page.locator('.save-card')).toHaveCount(3);
	const saveCards = page.locator('.save-card:not(.storage-card)');

	await saveCards.first().getByRole('button').first().focus();
	await page.keyboard.press('ArrowDown');
	await expect(saveCards.first().getByRole('button', { name: 'Delete' })).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(saveCards.first().getByRole('button', { name: /^(Open|Switch) →$/ })).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(saveCards.nth(1).getByRole('button').first()).toBeFocused();
	for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown']) {
		await page.keyboard.press(key);
	}
	await expect(page.getByRole('button', { name: /Import a Save File/ })).toBeFocused();

	const scrollState = await page.locator('.save-picker-panel').evaluate((panel) => ({
		clientHeight: panel.clientHeight,
		scrollHeight: panel.scrollHeight
	}));
	expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);

	await page.locator('.save-picker-panel').evaluate((panel) => {
		panel.scrollTop = 120;
	});
	await expect
		.poll(() => page.locator('.save-picker-panel').evaluate((panel) => panel.scrollTop))
		.toBeGreaterThan(0);
});

test('mobile Saves route scrolls with the document', async ({ page }) => {
	await openEmptySaves(page);
	await page.setViewportSize({ width: 390, height: 640 });
	await page.goto('/saves');

	const fixture = await readFile(emeraldFixturePath);
	for (const name of ['alpha.sav', 'beta.sav', 'gamma.sav']) {
		await page.getByLabel('Import Save File').setInputFiles({
			name,
			mimeType: 'application/octet-stream',
			buffer: fixture
		});
	}

	await expect(page.locator('.save-card')).toHaveCount(4);
	const mobileGutters = await page.evaluate(() => {
		const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
		const panel = document.querySelector('.save-picker-panel')?.getBoundingClientRect();

		if (!shell || !panel) {
			throw new Error('Could not measure Saves route gutters.');
		}

		return {
			left: panel.left - shell.left,
			right: shell.right - panel.right
		};
	});
	expect(Math.abs(mobileGutters.left - mobileGutters.right)).toBeLessThanOrEqual(1);
	expect(mobileGutters.left).toBeGreaterThanOrEqual(9);

	await expect
		.poll(() =>
			page.evaluate(() => ({
				innerHeight,
				panelOverflowY: getComputedStyle(document.querySelector('.save-picker-panel')!).overflowY,
				scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
				scrollTop: document.scrollingElement?.scrollTop ?? 0
			}))
		)
		.toMatchObject({
			panelOverflowY: 'visible',
			scrollTop: 0
		});

	const scrollState = await page.evaluate(() => ({
		innerHeight,
		scrollHeight: document.scrollingElement?.scrollHeight ?? 0
	}));
	expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.innerHeight);

	await page.evaluate(() => window.scrollTo(0, 480));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
	await expect(page.getByText('Offline - all local')).toHaveCount(0);
});

test('browses the Saves route, imports, and switches the active Save File', async ({ page }) => {
	await openEmptySaves(page);

	await page.getByRole('button', { name: 'Saves' }).click();
	await expect(page).toHaveURL(/\/saves$/);
	await expect(page.getByRole('heading', { name: 'Save Files' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Import a Save File' })).toBeVisible();

	const fixture = await readFile(emeraldFixturePath);
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'alpha.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});

	await expect(page.getByText('alpha.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await expect(page.locator('.save-card.active')).toContainText('alpha.sav');
	await expect(page.locator('.save-card.active').getByText('Active')).toBeVisible();

	await page.getByLabel('Import Save File').setInputFiles({
		name: 'beta.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});

	await expect(page.getByText('beta.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await expect(page.locator('.save-card')).toHaveCount(3);
	await expect(page.locator('.save-card.active')).toContainText('beta.sav');

	await page
		.locator('.save-card')
		.filter({ hasText: 'alpha.sav' })
		.getByRole('button', { name: /^Switch/ })
		.click();

	await expect(page.locator('.save-chip')).toContainText('alpha.sav', { timeout: 15000 });
	await page.goto('/');
	await expect(page.locator('.save-chip')).toContainText('alpha.sav');

	await page.goto('/saves');
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'broken.sav',
		mimeType: 'application/octet-stream',
		buffer: Buffer.from([1, 2, 3, 4])
	});

	await expect(
		page.getByText('Import failed. Current active Save File was not changed.')
	).toBeVisible({
		timeout: 15000
	});
	await expect(page.locator('.save-card.active')).toContainText('alpha.sav');
});

test('reloads the most recent imported Save File while offline', async ({ page, context }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');

	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.reload();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });

	await context.setOffline(true);
	await page.reload();

	await expect(page.locator('.save-chip')).toContainText('011020251345.sav', { timeout: 15000 });
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });

	await context.setOffline(false);
});
