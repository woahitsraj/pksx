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
	await expect(page).toHaveURL(/\/saves$/);
	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Boxes/ })
		.click();
	await expect(page.locator('#box-grid')).toBeVisible({ timeout: 15000 });
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
}

async function pressController(page: Page, key: string) {
	await page.evaluate(async (controllerKey) => {
		const dispatch = (pressed: boolean) =>
			window.dispatchEvent(
				new CustomEvent('pksxcontroller', {
					detail: {
						key: controllerKey,
						pressed,
						discrete: !controllerKey.startsWith('Arrow'),
						id: 'Test controller'
					}
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

async function chooseMainMenu(
	page: Page,
	label: 'Boxes' | 'Trainer' | 'Bag' | 'Saves' | 'Settings' | 'Backup Browser'
) {
	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: new RegExp(`^${label}`) })
		.click();
}

async function expectActiveSaveOwner(page: Page, fileName: string, timeout = 15000) {
	await expect(page.locator('.boxes-route')).toHaveAttribute('data-active-save-file-id', /.+/, {
		timeout
	});
	await expect(page.getByRole('button', { name: `Open Box Menu for ${fileName}` })).toBeVisible({
		timeout
	});
}

async function openBackupBrowser(page: Page) {
	await chooseMainMenu(page, 'Backup Browser');
	return page.getByRole('dialog', { name: 'Backup Browser' });
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
	await expect(
		page.getByRole('button', { name: 'Open Box Menu for emerald-011020251345.sav' })
	).toBeVisible({ timeout: 15000 });
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
	await expect(
		page.getByRole('button', {
			name: 'Open Box Menu for pokemon-scarlet-2025-03-24-main.sav'
		})
	).toBeVisible({ timeout: 60000 });
}

async function showPartyFromFirstBox(page: Page) {
	const pane = page.locator('.box-pane.active-pane');
	await pane.getByRole('button', { name: 'Previous Location' }).click();
	await expect(pane.getByRole('heading', { name: 'Party' })).toBeVisible({ timeout: 60000 });
}

async function showFirstBoxFromParty(page: Page) {
	const pane = page.locator('.box-pane.active-pane');
	await pane.getByRole('button', { name: 'Next Location' }).click();
	await expect(pane.getByRole('heading', { name: 'Box 01' })).toBeVisible({ timeout: 60000 });
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

async function removeSaveBytes(page: Page, fileName: string) {
	await page.evaluate(
		(name) =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('pksx-saves');
				open.onerror = () => reject(open.error ?? new Error('Could not open Saves.'));
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction(['saveFiles', 'saveBytes'], 'readwrite');
					const saves = transaction.objectStore('saveFiles').getAll();
					saves.onerror = () => reject(saves.error ?? new Error('Could not read Saves.'));
					saves.onsuccess = () => {
						const save = (
							saves.result as Array<{ id: string; originalFileName: string | null }>
						).find((candidate) => candidate.originalFileName === name);
						if (save) transaction.objectStore('saveBytes').delete(save.id);
					};
					transaction.onerror = () =>
						reject(transaction.error ?? new Error('Could not remove Save bytes.'));
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
				};
			}),
		fileName
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

async function backupRecords(page: Page) {
	return page.evaluate(
		() =>
			new Promise<Array<{ saveFileName: string | null; reason: string; bytes: number[] }>>(
				(resolve, reject) => {
					const open = indexedDB.open('pksx-saves');
					open.onerror = () => reject(open.error ?? new Error('Could not open Saves.'));
					open.onsuccess = () => {
						const database = open.result;
						const transaction = database.transaction(
							['saveFiles', 'backups', 'backupBytes'],
							'readonly'
						);
						const savesRequest = transaction.objectStore('saveFiles').getAll();
						const backupsRequest = transaction.objectStore('backups').getAll();
						const bytesRequest = transaction.objectStore('backupBytes').getAll();
						transaction.onerror = () =>
							reject(transaction.error ?? new Error('Could not read Backups.'));
						transaction.oncomplete = () => {
							const saves = savesRequest.result as Array<{
								id: string;
								originalFileName: string | null;
							}>;
							const bytes = bytesRequest.result as Array<{ backupId: string; bytes: Uint8Array }>;
							resolve(
								(
									backupsRequest.result as Array<{
										id: string;
										saveFileId: string;
										reason: string;
									}>
								).map((backup) => ({
									saveFileName:
										saves.find((save) => save.id === backup.saveFileId)?.originalFileName ?? null,
									reason: backup.reason,
									bytes: Array.from(
										bytes.find((record) => record.backupId === backup.id)?.bytes ?? []
									)
								}))
							);
							database.close();
						};
					};
				}
			)
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

async function boxLayoutMetrics(page: Page) {
	return page.evaluate(() => {
		const bounds = (selector: string) => {
			const element = document.querySelector<HTMLElement>(selector);
			if (!element) throw new Error(`Missing ${selector}.`);
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				top: rect.top,
				right: rect.right,
				bottom: rect.bottom,
				left: rect.left,
				width: rect.width,
				height: rect.height,
				clientWidth: element.clientWidth,
				clientHeight: element.clientHeight,
				scrollWidth: element.scrollWidth,
				scrollHeight: element.scrollHeight,
				overflowX: style.overflowX,
				overflowY: style.overflowY
			};
		};
		const slots = Array.from(document.querySelectorAll<HTMLElement>('.location-grid .slot'));
		const firstSlot = slots[0]?.getBoundingClientRect();
		const lastSlot = slots.at(-1)?.getBoundingClientRect();

		return {
			route: bounds('.boxes-route'),
			workspace: bounds('.storage-workspace'),
			pane: bounds('.box-pane'),
			header: bounds('.pane-header'),
			title: bounds('.box-title h2'),
			occupancy: bounds('.box-title b'),
			control: bounds('.source-chip'),
			grid: bounds('.location-grid'),
			rail: bounds('.detail-rail'),
			slotCount: slots.length,
			slotWidth: firstSlot?.width ?? 0,
			slotHeight: firstSlot?.height ?? 0,
			lastSlotRight: lastSlot?.right ?? 0,
			lastSlotBottom: lastSlot?.bottom ?? 0,
			caption: parseFloat(
				getComputedStyle(
					document.querySelector<HTMLElement>('.storage-workspace')!
				).getPropertyValue('--pksx-type-caption')
			),
			label: parseFloat(
				getComputedStyle(
					document.querySelector<HTMLElement>('.storage-workspace')!
				).getPropertyValue('--pksx-type-label')
			)
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
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
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
	await expect(page.locator('#collection-control-pane-pokemon-storage')).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#collection-control-pane-pokemon-storage')).toBeFocused();
});

test('compact box controls and keyboard shortcuts update the active box label', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();

	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Next Location' }).click();
	await expect(page.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await expect(page.locator('#box-1-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.locator('#box-grid').focus();
	await page.keyboard.press('PageDown');
	await expect(page.getByRole('heading', { name: 'Box 03' })).toBeVisible();
	await expect(page.locator('#box-2-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('PageDown');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Previous Location' }).click();
	await expect(page.getByRole('heading', { name: 'Box 03' })).toBeVisible();
	await expect(page.locator('#box-2-slot-0')).toHaveAttribute('aria-selected', 'true');
});

test('switches to durable Pokemon Storage with focusable empty Slot actions', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);

	await page.locator('#box-grid').focus();
	await pressController(page, 'x');
	await expect(page.getByRole('dialog', { name: 'Box Menu' })).toBeVisible();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Open another' })
		.click();
	await page.getByRole('button', { name: /Pokemon Storage/ }).click();
	await expect(page.locator('.pane-state-tag')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');

	await page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' }).click();
	await page.getByRole('button', { name: 'Switch', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Switch collection' })
		.getByRole('button', { name: /011020251345.sav/ })
		.click();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });

	await seedPokemonStorageBoxes(page, 5);
	await page.goto('/?source=pokemon-storage');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');

	await page.locator('#box-grid').focus();
	await page.keyboard.press('PageDown');
	await expect(page.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await expect(page.locator('#box-1-slot-0')).toHaveAttribute('aria-selected', 'true');

	await page.getByRole('button', { name: 'Next Location' }).click();
	await page.getByRole('button', { name: 'Next Location' }).click();
	await page.getByRole('button', { name: 'Next Location' }).click();
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

test('Box Menu keeps fixed unavailable commands and X and Y preserve their contexts', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.locator('#box-0-slot-7').click();
	await page.keyboard.press('y');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await page.keyboard.press('x');
	const menu = page.getByRole('dialog', { name: 'Box Menu' });
	await expect(menu).toBeVisible();
	await expect(menu.locator('.box-menu-row strong')).toHaveText([
		'Export',
		'Save a backup',
		'Switch',
		'Open another collection',
		'Close'
	]);
	await expect(menu.getByRole('button', { name: 'Export' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(menu).toContainText('Pokemon Storage cannot be exported.');
	await expect(menu).toContainText('Pokemon Storage does not use Backups.');
	await expect(menu).toContainText('Keep at least one collection open.');

	const backupsBefore = await backupCount(page);
	let downloads = 0;
	page.on('download', () => (downloads += 1));
	await menu.getByRole('button', { name: 'Export' }).click({ force: true });
	await menu.getByRole('button', { name: 'Save a backup' }).click({ force: true });
	await menu.getByRole('button', { name: 'Close' }).click({ force: true });
	await expect(menu).toBeVisible();
	expect(downloads).toBe(0);
	expect(await backupCount(page)).toBe(backupsBefore);
	await expect(page.locator('.box-pane')).toHaveCount(1);

	await page.keyboard.press('x');
	await expect(menu).toBeHidden();
	await expect(page.locator('#box-0-slot-7')).toBeFocused();
	const collectionControl = page.getByRole('button', {
		name: 'Open Box Menu for Pokemon Storage'
	});
	await collectionControl.focus();
	await page.keyboard.press('Enter');
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(collectionControl).toBeFocused();
});

test('Box Menu import dismisses its workflow chain and installs the imported Save File', async ({
	page
}) => {
	await openEmptySaves(page);
	const collectionControl = page.getByRole('button', {
		name: 'Open Box Menu for Pokemon Storage'
	});
	const menu = page.getByRole('dialog', { name: 'Box Menu' });

	await collectionControl.click();
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	let fileChooserPromise = page.waitForEvent('filechooser');
	await page
		.getByRole('dialog', { name: 'Switch collection' })
		.getByRole('button', { name: 'Import Save File' })
		.click();
	let fileChooser = await fileChooserPromise;
	await fileChooser.setFiles([]);
	await expect(menu).toBeHidden();
	await expect(collectionControl).toBeFocused();

	await collectionControl.click();
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	fileChooserPromise = page.waitForEvent('filechooser');
	await page
		.getByRole('dialog', { name: 'Switch collection' })
		.getByRole('button', { name: 'Import Save File' })
		.click();
	fileChooser = await fileChooserPromise;
	await fileChooser.setFiles(emeraldFixturePath);

	await expectActiveSaveOwner(page, 'emerald-011020251345.sav');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await expect(menu).toBeHidden();
	await expect(
		page.getByRole('button', { name: 'Open Box Menu for emerald-011020251345.sav' })
	).toBeVisible();
});

test('a completed import does not move focus in a newer Boxes instance', async ({ page }) => {
	await openEmptySaves(page);
	await page.evaluate(() => {
		const arrayBuffer = File.prototype.arrayBuffer;
		File.prototype.arrayBuffer = function () {
			return new Promise<ArrayBuffer>((resolve, reject) => {
				(window as typeof window & { releaseImport?: () => void }).releaseImport = () => {
					void arrayBuffer.call(this).then(resolve, reject);
				};
			});
		};
	});

	await page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Switch', exact: true })
		.click();
	const fileChooserPromise = page.waitForEvent('filechooser');
	await page
		.getByRole('dialog', { name: 'Switch collection' })
		.getByRole('button', { name: 'Import Save File' })
		.click();
	await (await fileChooserPromise).setFiles(emeraldFixturePath);
	await page.waitForFunction(
		() =>
			typeof (window as typeof window & { releaseImport?: () => void }).releaseImport === 'function'
	);

	await chooseMainMenu(page, 'Trainer');
	await expect(page).toHaveURL(/\/trainer$/);
	await chooseMainMenu(page, 'Boxes');
	await expect(page.locator('.boxes-route')).toHaveAttribute('data-initial-state', 'ready', {
		timeout: 15000
	});
	await page.locator('#box-0-slot-17').click();
	await expect(page.locator('#box-0-slot-17')).toBeFocused();
	await page.evaluate(() =>
		(window as typeof window & { releaseImport?: () => void }).releaseImport?.()
	);

	await expect(page.locator('.boxes-route')).toHaveAttribute('data-active-save-file-id', /.+/, {
		timeout: 15000
	});
	await expect(page.locator('#box-0-slot-17')).toBeFocused();
});

test('Box Menu exports and backs up the captured secondary Save File Workspace', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await moveFirstEmeraldBoxSlotToThirdSlot(page);
	await importScarletThroughSaves(page);
	await expect(page.locator('#box-0-slot-0')).toHaveAttribute('aria-selected', 'true');
	await showPartyFromFirstBox(page);
	await page.locator('#party-slot-5').click();
	await page.keyboard.press('x');
	let menu = page.getByRole('dialog', { name: 'Box Menu' });
	const activeFileReason = 'This is your active save file. Pick another one from Saves.';
	await expect(menu.getByRole('button', { name: 'Switch', exact: true })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(menu.locator('#box-menu-command-2-reason')).toHaveText(activeFileReason);
	await expect(menu.locator('#box-menu-command-4-reason')).toHaveText(activeFileReason);
	await menu.getByRole('button', { name: 'Open another collection' }).click();
	const openAnotherPicker = page.getByRole('dialog', { name: 'Open another collection' });
	await expect(
		openAnotherPicker.getByRole('button', {
			name: /Pokemon Storage.*Automatically saved by PKSX/i
		})
	).toBeVisible();
	await expect(openAnotherPicker.getByRole('button', { name: /011020251345\.sav/ })).toBeVisible();
	await expect(
		openAnotherPicker.getByRole('button', {
			name: /pokemon-scarlet-2025-03-24-main\.sav/
		})
	).toBeVisible();
	await openAnotherPicker.getByRole('button', { name: /011020251345\.sav/ }).click();

	await expect(page.locator('.box-pane')).toHaveCount(2);
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-2')).toContainText('ARON');
	await page.keyboard.press('Enter');
	const secondarySlotMenu = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(secondarySlotMenu.getByRole('button', { name: 'Create Pokemon' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(secondarySlotMenu).toContainText('Load a Save File before creating Pokemon.');
	await page.keyboard.press('Escape');
	await page.locator('#box-0-slot-2').click();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Move' }).click();
	await page.locator('#box-0-slot-3').click();
	await expect(page.getByRole('alert')).toContainText(
		'Moving Pokemon between Save Files needs engine transfer support.'
	);
	await expect(page.locator('#box-0-slot-2')).toContainText('ARON');
	await expect(page.locator('#box-0-slot-3')).toContainText('Empty');
	await page.keyboard.press('Escape');
	await expect(page.locator('#box-0-slot-2')).toBeFocused();
	await page.locator('#box-0-slot-29').click();
	await page.keyboard.press('x');
	menu = page.getByRole('dialog', { name: 'Box Menu' });
	await expect(menu).toContainText('011020251345.sav');
	await expect(menu.locator('#box-menu-command-3-reason')).toHaveText(
		'Two collections are already open.'
	);

	const downloadPromise = page.waitForEvent('download');
	await menu.getByRole('button', { name: 'Export' }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe('emerald-011020251345.pksx.sav');
	const exportedBytes = await readFile(await download.path());
	expect(exportedBytes).not.toEqual(await readFile(emeraldFixturePath));

	await page.keyboard.press('x');
	await menu.getByRole('button', { name: 'Save a backup' }).click();
	await expect(page.locator('.toast-success')).toContainText(
		'Backup saved for emerald-011020251345.sav.'
	);
	const backups = (await backupRecords(page)).filter(({ reason }) => reason === 'manual');
	expect(backups).toHaveLength(1);
	expect(backups[0]).toMatchObject({
		saveFileName: 'emerald-011020251345.sav',
		reason: 'manual'
	});
	expect(Buffer.from(backups[0].bytes)).toEqual(exportedBytes);

	await page.keyboard.press('x');
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	let switchPicker = page.getByRole('dialog', { name: 'Switch collection' });
	await expect(
		switchPicker.getByRole('button', {
			name: /Pokemon Storage.*Automatically saved by PKSX/i
		})
	).toBeVisible();
	await expect(switchPicker.getByRole('button', { name: /011020251345\.sav/ })).toBeVisible();
	await expect(
		switchPicker.getByRole('button', { name: /pokemon-scarlet-2025-03-24-main\.sav/ })
	).toBeVisible();
	await switchPicker.getByRole('button', { name: /pokemon-scarlet-2025-03-24-main\.sav/ }).click();
	await page.keyboard.press('Escape');
	await expect(menu).toBeVisible();
	await expect(menu).toContainText('emerald-011020251345.sav');
	await expect(page.locator('#box-menu-command-2')).toBeFocused();
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	switchPicker = page.getByRole('dialog', { name: 'Switch collection' });
	await switchPicker.getByRole('button', { name: /Pokemon Storage/ }).click();
	await expect(
		page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' })
	).toBeVisible();
	await page.keyboard.press('x');
	menu = page.getByRole('dialog', { name: 'Box Menu' });
	await expect(menu.getByRole('button', { name: 'Export' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await expect(menu.getByRole('button', { name: 'Save a backup' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Switch collection' })
		.getByRole('button', { name: /pokemon-scarlet-2025-03-24-main\.sav/ })
		.click();
	await expect(page.locator('#box-grid')).toHaveAttribute(
		'aria-label',
		/pokemon-scarlet-2025-03-24-main\.sav Box 01/
	);
	const activePane = page.locator('.box-pane.active-pane');
	await activePane.getByRole('button', { name: 'Previous Location' }).click();
	await activePane.getByRole('button', { name: 'Previous Location' }).click();
	await expect(page.getByRole('heading', { name: 'Box 32' })).toBeVisible({ timeout: 60000 });
	await expect(page.locator('.box-pane.active-pane')).not.toHaveAttribute('aria-busy', 'true');
	await page.locator('#box-31-slot-29').click();
	await page.keyboard.press('x');
	menu = page.getByRole('dialog', { name: 'Box Menu' });
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	await page.getByRole('button', { name: /011020251345\.sav/ }).click();
	await expect(page.locator('#box-grid')).toHaveAttribute(
		'aria-label',
		/emerald-011020251345\.sav Box 14/
	);
	await expect(page.locator('#box-13-slot-29')).toBeFocused();

	await page.keyboard.press('x');
	menu = page.getByRole('dialog', { name: 'Box Menu' });
	await menu.getByRole('button', { name: 'Switch', exact: true }).click();
	await page.getByRole('button', { name: /Pokemon Storage/ }).click();
	await expect(
		page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' })
	).toBeVisible();
	await expect(page.locator('#box-2-slot-29')).toBeFocused();

	await page.locator('#pane-active-save-party-slot-5').click();
	await page.keyboard.press('x');
	menu = page.getByRole('dialog', { name: 'Box Menu' });
	await expect(menu).toContainText('pokemon-scarlet-2025-03-24-main.sav');
	await expect(menu.locator('#box-menu-command-2-reason')).toHaveText(activeFileReason);
	await expect(menu.locator('#box-menu-command-4-reason')).toHaveText(activeFileReason);
	await page.keyboard.press('x');
	await expect(page.locator('#party-slot-5')).toBeFocused();
	await page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Close' })
		.click();
	await expect(page.locator('.box-pane')).toHaveCount(1);
	await expect(page.locator('#party-slot-5')).toBeFocused();
});

test('Box Menu allows duplicate Save File panes and keeps Open another collection disabled at two panes', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();
	await page.keyboard.press('x');
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', {
			name: 'Open another collection'
		})
		.click();
	await page
		.getByRole('dialog', { name: 'Open another collection' })
		.getByRole('button', { name: /011020251345\.sav/ })
		.click();

	await expect(
		page.getByRole('button', { name: 'Open Box Menu for emerald-011020251345.sav' })
	).toHaveCount(2);
	await page.locator('#pane-active-save-box-0-slot-0').click();
	const fixedPane = page.locator('.box-pane').first();
	const duplicatePane = page.locator('.box-pane').nth(1);
	await expect(duplicatePane).not.toHaveAttribute('aria-busy', 'true');
	await duplicatePane.evaluate((pane) => {
		pane.setAttribute('data-observed-busy', 'false');
		const observer = new MutationObserver(() => {
			if (pane.getAttribute('aria-busy') === 'true') {
				pane.setAttribute('data-observed-busy', 'true');
				observer.disconnect();
			}
		});
		observer.observe(pane, { attributes: true, attributeFilter: ['aria-busy'] });
	});
	await duplicatePane.getByRole('button', { name: 'Next Location' }).click();
	await expect(duplicatePane).toHaveAttribute('data-observed-busy', 'true');
	await expect(duplicatePane.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await expect(duplicatePane).not.toHaveAttribute('aria-busy', 'true', { timeout: 15000 });
	await fixedPane.getByRole('button', { name: 'Next Location' }).click();
	await expect(fixedPane.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await expect(fixedPane).not.toHaveAttribute('aria-busy', 'true', { timeout: 15000 });
	await page.evaluate(() => {
		const [fixed, duplicate] = Array.from(document.querySelectorAll<HTMLElement>('.box-pane'));
		duplicate.querySelector<HTMLButtonElement>('[aria-label="Previous Location"]')?.click();
		duplicate.querySelector<HTMLButtonElement>('[role="gridcell"]')?.click();
		fixed.querySelector<HTMLButtonElement>('[aria-label="Previous Location"]')?.click();
	});
	await expect(fixedPane.getByRole('gridcell').first()).toContainText('ARON', { timeout: 15000 });
	await expect(duplicatePane.getByRole('gridcell').first()).toContainText('ARON', {
		timeout: 15000
	});
	await expect(fixedPane).not.toHaveAttribute('aria-busy', 'true');
	await expect(duplicatePane).not.toHaveAttribute('aria-busy', 'true');
	await duplicatePane.getByRole('button', { name: 'Previous Location' }).click();
	await expect(duplicatePane.getByRole('heading', { name: 'Party' })).toBeVisible({
		timeout: 15000
	});
	await duplicatePane.getByRole('gridcell').nth(5).click();
	await page.keyboard.press('x');
	await page.getByRole('button', { name: 'Switch', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Switch collection' })
		.getByRole('button', { name: /Pokemon Storage/ })
		.click();
	await expect(page.locator('#box-0-slot-8')).toBeFocused();
	await page.keyboard.press('x');
	const menu = page.getByRole('dialog', { name: 'Box Menu' });
	await expect(menu.getByRole('button', { name: 'Open another collection' })).toHaveAttribute(
		'aria-disabled',
		'true'
	);
	await menu.getByRole('button', { name: 'Open another collection' }).click({ force: true });
	await expect(page.locator('.box-pane')).toHaveCount(2);
});

test('Box Menu and related picker Cancel restore focus at both viewport floors', async ({
	page
}) => {
	for (const viewport of [
		{ width: 640, height: 360 },
		{ width: 360, height: 640 }
	]) {
		await page.setViewportSize(viewport);
		await openEmptySaves(page);
		await page.locator('#box-0-slot-2').click();
		await page.keyboard.press('x');
		await page
			.getByRole('button', { name: 'Dismiss Box Menu' })
			.click({ position: { x: 1, y: 1 } });
		await expect(page.locator('#box-0-slot-2')).toBeFocused();

		await page.keyboard.press('x');
		const menu = page.getByRole('dialog', { name: 'Box Menu' });
		await menu.getByRole('button', { name: 'Switch', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'Switch collection' })).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeVisible();
		await expect(page.locator('#box-menu-command-2')).toBeFocused();

		await menu.getByRole('button', { name: 'Switch', exact: true }).click();
		await page.locator('.source-picker-backdrop').click({ position: { x: 1, y: 1 } });
		await expect(menu).toBeVisible();
		await expect(page.locator('#box-menu-command-2')).toBeFocused();
		await page.keyboard.press('x');
		await expect(page.locator('#box-0-slot-2')).toBeFocused();
	}
});

test('Carry suppresses the Box Menu and Y only toggles Move and Copy', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.getByRole('button', { name: 'Open Box Menu for emerald-011020251345.sav' }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Open another' })
		.click();
	await page
		.getByRole('dialog', { name: 'Open another collection' })
		.getByRole('button', { name: /Pokemon Storage/ })
		.click();
	await page.locator('#pane-active-save-box-0-slot-0').click();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
	const sourceSpriteUrl = await page.locator('#box-0-slot-0 img.slot-sprite').getAttribute('src');
	expect(sourceSpriteUrl).not.toBeNull();
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Move' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toHaveAccessibleName(
		'Box Slot 1, row 1, column 1: ARON, Lv. 11. Carry Move ARON'
	);
	const collectionControl = page.getByRole('button', {
		name: 'Open Box Menu for Pokemon Storage'
	});
	await expect(collectionControl).toHaveAttribute('aria-disabled', 'true');
	await expect(collectionControl).toHaveAttribute('tabindex', '-1');
	await collectionControl.focus();
	await expect(
		page.locator('.box-pane').filter({ has: collectionControl }).locator('.location-grid')
	).toHaveCount(1);
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await collectionControl.click({ force: true });
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('dialog', { name: 'Open another collection' })).toBeHidden();

	await page.keyboard.press('x');
	await expect(page.getByRole('dialog', { name: 'Box Menu' })).toBeHidden();
	await page.keyboard.press('Control+k');
	await pressController(page, 'Menu');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open Main Menu' })).toHaveCount(0);
	await page.keyboard.press('y');
	await expect(page.locator('.carry-at-focus')).toHaveAttribute('aria-label', 'copy ARON');
	await expect(page.locator('#box-0-slot-0')).toHaveAccessibleName(
		'Box Slot 1, row 1, column 1: ARON, Lv. 11. Carry Copy ARON'
	);
	await page.keyboard.press('y');
	await expect(page.locator('.carry-at-focus')).toHaveAttribute('aria-label', 'move ARON');
	await expect(page.locator('.carry-at-focus img')).toHaveAttribute('src', sourceSpriteUrl!);
	expect(
		await page
			.locator('.carry-at-focus strong')
			.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
	).toBeGreaterThanOrEqual(10);
	const closeControl = page.getByRole('button', { name: 'Close Pokemon Storage pane' });
	await expect(closeControl).toHaveAttribute('aria-disabled', 'true');
	await expect(closeControl).toHaveAttribute('tabindex', '-1');
	await closeControl.focus();
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await closeControl.click({ force: true });
	await expect(page.locator('.box-pane')).toHaveCount(2);

	await pressController(page, 'PageDown');
	await expect(
		page.locator('.box-pane.active-pane').getByRole('heading', { name: 'Box 02' })
	).toBeVisible();
	await expect(page.locator('#box-1-slot-0')).toBeFocused();
	await expect(page.locator('.carry-at-focus')).toHaveAttribute('aria-label', 'move ARON');
	await expect(page.locator('.carry-at-focus img')).toHaveAttribute('src', sourceSpriteUrl!);
	await page.setViewportSize({ width: 360, height: 640 });
	await expect(page.locator('#box-1-slot-0')).toBeFocused();
	await expect(page.locator('.carry-at-focus')).toHaveAttribute('aria-label', 'move ARON');
	await expect(page.locator('.carry-at-focus img')).toHaveAttribute('src', sourceSpriteUrl!);
	await page.keyboard.press('Escape');
	await expect(
		page.locator('.box-pane.active-pane').getByRole('heading', { name: 'Box 01' })
	).toBeVisible();
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
	await expect(page.locator('.carry-at-focus')).toHaveCount(0);
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Move' }).click();
	await pressController(page, 'PageUp');
	await expect(page.getByRole('heading', { name: 'Party' })).toBeVisible();
	await expect(page.locator('#party-slot-0')).toBeFocused();
	await pressController(page, 'ArrowUp');
	await expect(page.locator('#party-slot-0')).toBeFocused();
	await pressController(page, 'PageDown');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await page.locator('#box-0-slot-2').click();
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-2')).toContainText('ARON');
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
	await expect(page.getByRole('button', { name: 'Open Main Menu' })).toHaveCount(0);
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
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);

	await actions.getByRole('button', { name: /Lairon.*Level 32/i }).click();
	await actions.getByRole('button', { name: 'Apply Pokemon Action' }).click();
	await expect(actions).toBeHidden({ timeout: 15000 });
	await expect(page.locator('#box-0-slot-0')).toContainText('LAIRON');
	await expect(page.locator('#box-0-slot-0')).toContainText('Lv 32');
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);
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
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);

	await createCommand.click();
	await dialog.locator('#pokemon-creation-species').fill('25');
	await dialog.locator('#pokemon-creation-level').fill('5');
	await dialog.getByRole('button', { name: 'Apply creation' }).click();

	await expect(dialog).toBeHidden({ timeout: 15000 });
	await expect(destination).toContainText('PIKACHU');
	await expect(destination).toContainText('Lv 5');
	await expect(destination).toBeFocused();
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);

	const browser = await openBackupBrowser(page);
	await expect(browser).toContainText('Pokemon creation');
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
	await fillEditorInput(nickname, 'RO');
	await nickname.press('x');
	await nickname.press('y');
	await expect(nickname).toHaveValue('ROxy');
	await pressController(page, 'x');
	await expect(nickname).toHaveValue('ROxy');
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
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);
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

test('Boxes navigation clamps at workspace edges while Main Menu owns destinations', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.locator('#box-0-slot-24').focus();
	await page.keyboard.press('ArrowDown');
	await expect(page.locator('#box-0-slot-24')).toBeFocused();

	await page.setViewportSize({ width: 420, height: 860 });
	await page.locator('#box-0-slot-0').focus();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#collection-control-pane-pokemon-storage')).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(page.locator('#collection-control-pane-pokemon-storage')).toBeFocused();
	await expect(page.locator('.section-pills')).toBeHidden();
	await expect(page.locator('.top-bar, .mobile-tabbar')).toHaveCount(0);
	await page.keyboard.press('Control+k');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeVisible();
});

test('controller input follows the keyboard navigation path', async ({ page }) => {
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();

	await pressController(page, 'ArrowRight');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();

	await pressController(page, 'Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.locator('.boxes-route')).toHaveAttribute('inert', '');
	await pressController(page, 'x');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Box Menu' })).toBeHidden();

	await pressController(page, 'ArrowDown');
	await expect(page.locator('#slot-action-1')).toBeFocused();
	await expect(page.locator('#slot-action-1')).toHaveClass(/controller-focused/);

	await pressController(page, 'Escape');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await expect(page.locator('.boxes-route')).not.toHaveAttribute('inert', '');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();

	await pressController(page, 'y');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await pressController(page, 'x');
	await expect(page.getByRole('dialog', { name: 'Box Menu' })).toBeVisible();
	await expect(page.locator('.boxes-route')).toHaveAttribute('inert', '');
	await expect(page.locator('#box-menu-command-0')).toBeFocused();
	await expect
		.poll(() =>
			page
				.locator('#box-menu-command-0')
				.evaluate((control) => getComputedStyle(control).outlineStyle)
		)
		.toBe('solid');
	await pressController(page, 'Escape');
	await expect(page.locator('.boxes-route')).not.toHaveAttribute('inert', '');
	await expect(page.locator('#box-0-slot-1')).toBeFocused();
});

test('controller focus framework covers every interactive surface', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEmptySaves(page);
	await page.locator('#box-grid').focus();
	await pressController(page, 'ArrowRight');
	await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'controller');

	await pressController(page, 'Enter');
	const slotActions = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(slotActions).toBeVisible();
	await expectControllerHighlights(page, slotActions);
	await pressController(page, 'Escape');

	await pressController(page, 'x');
	const boxMenu = page.getByRole('dialog', { name: 'Box Menu' });
	await expect(boxMenu).toBeVisible();
	await expectControllerHighlights(page, boxMenu);
	await boxMenu.getByRole('button', { name: 'Switch', exact: true }).click();
	const sourcePicker = page.getByRole('dialog', { name: 'Switch collection' });
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

	await chooseMainMenu(page, 'Trainer');
	await expect(page).toHaveURL(/\/trainer$/);
	await expect(page.locator('.field-sidebar nav button').first()).toBeVisible();
	await pressController(page, 'ArrowDown');
	await expect(page.locator('.save-file-route').locator(':focus')).toHaveCount(1);
	await expectControllerHighlights(page, page.locator('.save-file-route'));
	await page.getByRole('button', { name: /Money/ }).first().click();
	await pressController(page, 'ArrowDown');
	await expectControllerHighlights(page, page.locator('.save-file-route'));
	await chooseMainMenu(page, 'Bag');
	await expect(page).toHaveURL(/\/bag$/);
	await pressController(page, 'ArrowDown');
	await expectControllerHighlights(page, page.locator('.save-file-route'));

	await chooseMainMenu(page, 'Saves');
	await expect(page).toHaveURL(/\/saves$/);
	await pressController(page, 'ArrowDown');
	await expectControllerHighlights(page, page.locator('.saves-route'));
	await page
		.locator('.save-card.active')
		.getByRole('button', { name: /Open Save File Menu/ })
		.click();
	const saveFileMenu = page.getByRole('dialog', { name: 'Save File Menu' });
	await saveFileMenu.getByRole('button', { name: 'Delete from Saves' }).click();
	const confirmDialog = page.getByRole('dialog', { name: /^Delete .+\?$/ });
	await expect(confirmDialog).toBeVisible();
	await pressController(page, 'ArrowRight');
	await expectControllerHighlights(page, confirmDialog);
});

test('controller shoulders cycle Party and Boxes while collection focus is retained', async ({
	page
}) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.locator('#box-grid').focus();

	await pressController(page, 'PageDown');
	await expect(page.getByRole('heading', { name: 'Box 02' })).toBeVisible();
	await pressController(page, 'PageUp');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();

	await pressController(page, 'PageUp');
	await expect(page.getByRole('heading', { name: 'Party' })).toBeVisible();
	await expect(page.locator('#party-slot-0')).toBeFocused();
	await pressController(page, 'ArrowUp');
	await expect(page.locator('#collection-control-pane-active-save')).toBeFocused();
	await pressController(page, 'ArrowUp');
	await expect(page.locator('#collection-control-pane-active-save')).toBeFocused();
	await pressController(page, 'PageDown');
	await expect(page.getByRole('heading', { name: 'Box 01' })).toBeVisible();
	await expect(page.locator('#collection-control-pane-active-save')).toBeFocused();
	await pressController(page, 'ArrowDown');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await pressController(page, 'PageUp');
	await expect(page.locator('#party-slot-0')).toBeFocused();
	await pressController(page, 'Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await pressController(page, 'Enter');
	await expect(page.locator('.pokemon-editor')).toBeVisible();
	await pressController(page, 'Escape');
	await expect(page.locator('.pokemon-editor')).toBeHidden();
	await pressController(page, 'Escape');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await expect(page.locator('#party-slot-0')).toBeFocused();
});

test('Box Pane owns the viewport budget at floors, target, and large thresholds', async ({
	page
}) => {
	await openEmptySaves(page);

	await page.setViewportSize({ width: 640, height: 360 });
	await setSafeArea(page, { top: 12, right: 12, bottom: 12, left: 12 });
	let metrics = await boxLayoutMetrics(page);
	expect(metrics.route).toMatchObject({ width: 616, height: 336 });
	expect(metrics.slotCount).toBe(30);
	expect(metrics.slotWidth).toBeGreaterThanOrEqual(57);
	expect(metrics.slotWidth).toBeLessThanOrEqual(60);
	expect(metrics.slotHeight).toBe(metrics.slotWidth);
	expect(metrics.lastSlotRight).toBeLessThanOrEqual(metrics.grid.right + 0.5);
	expect(metrics.lastSlotBottom).toBeLessThanOrEqual(metrics.grid.bottom + 0.5);
	expect(metrics.control.height).toBeGreaterThan(0);
	expect(metrics.rail.right).toBeLessThanOrEqual(metrics.route.right);
	expect(metrics.title.top).toBeGreaterThanOrEqual(metrics.header.top);
	expect(metrics.occupancy.bottom).toBeLessThanOrEqual(metrics.header.bottom);
	expect(metrics.header.bottom).toBeLessThanOrEqual(metrics.grid.top);
	await expect(page.locator('#box-0-slot-0 .slot-number')).toHaveCSS('display', 'block');
	await expect(page.locator('#box-0-slot-0 .slot-label')).toHaveCSS('display', 'none');
	expect(await shellExtents(page)).toMatchObject({
		bodyHeight: 360,
		bodyWidth: 640,
		htmlHeight: 360,
		htmlWidth: 640,
		shellHeight: 360,
		shellWidth: 640
	});

	await page.setViewportSize({ width: 360, height: 640 });
	await setSafeArea(page, { top: 24, right: 0, bottom: 72, left: 0 });
	metrics = await boxLayoutMetrics(page);
	expect(metrics.pane.bottom).toBeLessThanOrEqual(metrics.rail.top);
	expect(metrics.route.scrollHeight).toBe(metrics.route.clientHeight);
	expect(metrics.route.scrollWidth).toBe(metrics.route.clientWidth);
	expect(metrics.grid.overflowY).toBe('auto');
	expect(metrics.rail.width).toBeLessThanOrEqual(260);
	expect(metrics.title.top).toBeGreaterThanOrEqual(metrics.header.top);
	expect(metrics.occupancy.bottom).toBeLessThanOrEqual(metrics.header.bottom);
	expect(metrics.header.bottom).toBeLessThanOrEqual(metrics.grid.top);

	await page.setViewportSize({ width: 360, height: 400 });
	await setSafeArea(page, { top: 10, right: 10, bottom: 10, left: 10 });
	metrics = await boxLayoutMetrics(page);
	expect(metrics.workspace.scrollHeight).toBeGreaterThan(metrics.workspace.clientHeight);
	await page.locator('.storage-workspace').evaluate((workspace) => {
		workspace.scrollTop = workspace.scrollHeight;
	});
	await expect(page.getByTestId('active-slot-detail-rail')).toBeInViewport();

	await page.setViewportSize({ width: 640, height: 480 });
	await setSafeArea(page, { top: 12, right: 0, bottom: 12, left: 0 });
	metrics = await boxLayoutMetrics(page);
	expect(metrics.pane.right).toBeLessThanOrEqual(metrics.rail.left);
	expect(metrics.lastSlotBottom).toBeLessThanOrEqual(metrics.grid.bottom + 0.5);

	for (const allocation of [
		{ viewport: { width: 919, height: 720 }, type: { caption: 10, label: 12 } },
		{ viewport: { width: 920, height: 719 }, type: { caption: 10, label: 12 } },
		{ viewport: { width: 920, height: 720 }, type: { caption: 11, label: 13 } }
	]) {
		await page.setViewportSize(allocation.viewport);
		await setSafeArea(page, { top: 10, right: 10, bottom: 10, left: 10 });
		metrics = await boxLayoutMetrics(page);
		expect({ caption: metrics.caption, label: metrics.label }).toEqual(allocation.type);
		expect(metrics.pane.width).toBeLessThanOrEqual(800);
		expect(metrics.rail.width).toBeLessThanOrEqual(260);
	}
	await expect(page.locator('#box-0-slot-0 .slot-label')).toHaveCSS('display', 'flex');
});

test('Box and Party grids expose rows and size real sprites against the Slot', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.setViewportSize({ width: 640, height: 360 });
	await setSafeArea(page, { top: 24, right: 12, bottom: 72, left: 12 });
	await expect(page.locator('#box-0-slot-0 .slot-number')).toHaveCSS('display', 'none');
	await expect(page.locator('#box-0-slot-0')).toHaveAccessibleName(
		'Box Slot 1, row 1, column 1: ARON, Lv. 11'
	);
	await expect(page.locator('#box-0-slot-2')).toHaveAccessibleName(
		'Box Slot 3, row 1, column 3: Empty'
	);

	for (const viewport of [
		{ width: 640, height: 360 },
		{ width: 920, height: 720 }
	]) {
		await page.setViewportSize(viewport);
		await setSafeArea(
			page,
			viewport.width === 640
				? { top: 12, right: 12, bottom: 12, left: 12 }
				: { top: 10, right: 10, bottom: 10, left: 10 }
		);
		const rows = page.getByRole('grid').getByRole('row');
		await expect(rows).toHaveCount(5);
		for (let row = 0; row < 5; row += 1) {
			await expect(rows.nth(row).getByRole('gridcell')).toHaveCount(6);
		}
		const ratio = await page.locator('#box-0-slot-0').evaluate((slot) => {
			const sprite = slot.querySelector<HTMLElement>('img.slot-sprite');
			if (!sprite) throw new Error('Expected a fixture sprite.');
			return sprite.getBoundingClientRect().width / slot.getBoundingClientRect().width;
		});
		expect(ratio).toBeGreaterThanOrEqual(0.78);
		expect(ratio).toBeLessThanOrEqual(0.92);
	}

	await showPartyFromFirstBox(page);
	await expect(page.locator('#party-slot-0')).toHaveAccessibleName(
		'Party Slot 1, row 1, column 1: 1-UP, Lv. 25'
	);
	const partyRows = page.getByRole('grid').getByRole('row');
	await expect(partyRows).toHaveCount(2);
	for (let row = 0; row < 2; row += 1) {
		await expect(partyRows.nth(row).getByRole('gridcell')).toHaveCount(3);
	}
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

test('small widescreen viewports use destination-owned layout without persistent chrome', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.setViewportSize({ width: 960, height: 540 });

	await expect(page.locator('.top-bar, .mobile-tabbar')).toHaveCount(0);
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
	await showPartyFromFirstBox(page);
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

	await showPartyFromFirstBox(page);
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

	await showPartyFromFirstBox(page);
	await expect(page.locator('#party-slot-0')).toContainText('1-UP');
	await expect(detailRail).toContainText('Party · Slot 1');
	await showFirstBoxFromParty(page);
	await chooseMainMenu(page, 'Boxes');
	await page.locator('#box-grid').focus();
	await pressController(page, 'x');
	const downloadPromise = page.waitForEvent('download');
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Export' })
		.click();
	const download = await downloadPromise;
	const exported = await readFile(await download.path());
	const fixture = await readFile(emeraldFixturePath);

	expect(download.suggestedFilename()).toBe('emerald-011020251345.pksx.sav');
	expect(exported.byteLength).toBe(fixture.byteLength);
});

test('Trainer and Bag destinations apply their Save File edits', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await chooseMainMenu(page, 'Trainer');
	await expect(page).toHaveURL(/\/trainer$/);

	await expect(page.getByRole('heading', { name: 'Trainer profile' })).toBeVisible();
	const applyButton = page.getByRole('button', { name: /Apply edits/ });
	await expect(applyButton.locator('kbd')).toHaveCount(0);
	const trainerName = page.locator('#save-file-trainer-name');
	await expect(trainerName).toHaveValue('DIXIE');
	await trainerName.fill('');
	await trainerName.pressSequentially('kyx');
	await expect(trainerName).toHaveValue('kyx');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeHidden();
	await pressController(page, 'Menu');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeVisible();
	await pressController(page, 'Menu');
	await expect(trainerName).toBeFocused();
	await trainerName.fill('RAJ');
	await expect(page.getByText('1 staged edit')).toBeVisible();

	const fields = page.getByLabel('Trainer fields');
	const trainerSection = fields.getByRole('button', { name: /Trainer profile/ });
	const moneySection = fields.getByRole('button', { name: /Money/ });
	await trainerSection.focus();
	await pressController(page, 'ArrowDown');
	await expect(moneySection).toBeFocused();
	await moneySection.click();
	await expect(page.getByRole('heading', { name: 'Money', exact: true })).toBeVisible();
	await page.locator('#save-file-money').fill('12345');

	await chooseMainMenu(page, 'Bag');
	await expect(page.getByRole('heading', { name: 'Inventory' })).toBeVisible();
	const quantity = page.locator('.item-list article:not(.new-item) input[type="number"]').first();
	const originalQuantity = Number(await quantity.inputValue());
	const quantityLabel = await quantity.getAttribute('aria-label');
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

	await chooseMainMenu(page, 'Trainer');
	await expect(trainerName).toHaveValue('RAJ');
	await page.getByLabel('Trainer fields').getByRole('button', { name: /Money/ }).click();
	await expect(page.locator('#save-file-money')).toHaveValue('12345');
	await expect(page.getByText('5 staged edits')).toBeVisible();
	await page.getByRole('button', { name: /Apply edits/ }).click();
	await expect(page.getByText('Save File edits applied.')).toBeVisible({ timeout: 15000 });
	await expect(page.getByText('Backup created')).toBeVisible();
	await expect(page.getByText('Workspace has unapplied export changes.')).toBeVisible();

	await chooseMainMenu(page, 'Bag');
	await expect(page.getByLabel(quantityLabel!)).toHaveValue(String(originalQuantity + 1));
	await chooseMainMenu(page, 'Trainer');
	await expect(trainerName).toHaveValue('RAJ');
	await trainerName.fill('TEMP');
	await page.getByRole('button', { name: 'Cancel all' }).click();
	await expect(trainerName).toHaveValue('RAJ');

	await chooseMainMenu(page, 'Boxes');
	const activeSaveMenu = page.getByRole('button', {
		name: 'Open Box Menu for emerald-011020251345.sav'
	});
	await expect(activeSaveMenu).toBeVisible({ timeout: 15000 });
	await activeSaveMenu.click();
	const exportButton = page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Export' });
	await expect(exportButton).not.toHaveAttribute('aria-disabled', 'true');
	const downloadPromise = page.waitForEvent('download');
	await exportButton.click();
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

	await showPartyFromFirstBox(page);
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
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);
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

	const browser = await openBackupBrowser(page);
	await expect(browser).toContainText('No Backups yet');
	await browser.getByRole('button', { name: 'Create Backup' }).click();
	const manualBackup = browser.locator('article').filter({ hasText: 'Manual' }).first();
	await expect(manualBackup).toBeVisible();
	await manualBackup.getByRole('button', { name: 'Restore' }).click();
	await browser.getByRole('button', { name: 'Restore', exact: true }).last().click();
	await expectActiveSaveOwner(page, 'emerald-011020251345.sav');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON');
});

test('Backup Browser owns active Save File recovery, fresh focus, guarded Back, and floor geometry', async ({
	page
}) => {
	await page.setViewportSize({ width: 640, height: 360 });
	await openEmptySaves(page);
	await page.goto('/saves');
	await setSafeArea(page, { top: 12, right: 12, bottom: 12, left: 12 });
	let browser = await openBackupBrowser(page);
	await expect(browser).toContainText('No active Save File');
	await expect(browser.getByRole('button', { name: 'Close Backup Browser' })).toBeFocused();
	await expect(browser).toHaveCSS('width', '616px');
	await expect(browser).toHaveCSS('height', '336px');
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-destination-focus="saves-grid"]')).toBeFocused();

	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	browser = await openBackupBrowser(page);
	await expect(browser).toContainText('No Backups yet');
	await expect(browser.getByRole('button', { name: 'Create Backup' })).toBeFocused();
	await browser.getByRole('button', { name: 'Create Backup' }).click();
	const manualBackup = browser.locator('article').filter({ hasText: 'Manual' }).first();
	await expect(manualBackup).toBeVisible();
	await expect(manualBackup.getByRole('button', { name: 'Restore' })).toBeFocused();

	await page.keyboard.press('Escape');
	await expect(page.locator('[data-destination-focus="saves-grid"]')).toBeFocused();
	browser = await openBackupBrowser(page);
	await expect(manualBackup.getByRole('button', { name: 'Restore' })).toBeFocused();

	await manualBackup.getByRole('button', { name: 'Delete' }).click();
	await expect(browser).toContainText('Delete this Backup?');
	await expect(page.getByRole('dialog')).toHaveCount(1);
	await pressController(page, 'ArrowLeft');
	await expect(browser.getByRole('button', { name: 'Keep', exact: true })).toBeFocused();
	await pressController(page, 'ArrowLeft');
	await expect(browser.getByRole('button', { name: 'Delete', exact: true }).last()).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(manualBackup.getByRole('button', { name: 'Restore' })).toBeFocused();
	await expect(manualBackup).toBeVisible();
	await manualBackup.getByRole('button', { name: 'Delete' }).click();
	await browser.getByRole('button', { name: 'Delete' }).last().click();
	await expect(browser).toContainText('No Backups yet');
	await browser.getByRole('button', { name: 'Create Backup' }).click();
	await expect(browser.locator('article').filter({ hasText: 'Manual' })).toBeVisible();
	await page.keyboard.press('Escape');

	await page.goto('/');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
	await moveFirstEmeraldBoxSlotToThirdSlot(page);
	await page.goto('/saves');
	await page.setViewportSize({ width: 1280, height: 800 });
	await setSafeArea(page, { top: 0, right: 0, bottom: 0, left: 0 });
	browser = await openBackupBrowser(page);
	const newestBackup = browser.locator('article').filter({ hasText: 'Pokemon movement' });
	await expect(newestBackup.getByRole('button', { name: 'Restore' })).toBeFocused();
	await expect(browser.locator('.takeover-content')).toHaveCSS('--pksx-space-unit', '5.04px');
	await expect(browser.locator('.takeover-content')).toHaveCSS('--pksx-type-display', '24px');
	const restorableManual = browser.locator('article').filter({ hasText: 'Manual' });
	await restorableManual.getByRole('button', { name: 'Restore' }).click();
	await expect(browser).toContainText('This replaces the Dirty Workspace.');
	await page.locator('.takeover-backdrop').click({ position: { x: 8, y: 8 } });
	await expect(restorableManual.getByRole('button', { name: 'Restore' })).toBeFocused();
	await restorableManual.getByRole('button', { name: 'Restore' }).click();
	await browser.getByRole('button', { name: 'Restore' }).last().click();
	await expect(browser).toBeHidden();
	await expect(page.locator('[data-destination-focus="saves-grid"]')).toBeFocused();
	const restoredCard = page.locator('.save-card.active');
	await expect(restoredCard).toContainText('Pokemon Emerald', { timeout: 15_000 });
	await expect(restoredCard.locator('.trainer')).toHaveText(/\S+/);
	await expect(restoredCard).toContainText('7 Pokemon');
	await page.goto('/');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
	await expect(page.locator('#box-0-slot-2')).toContainText('Empty');

	await page.goto('/saves');
	browser = await openBackupBrowser(page);

	await page.setViewportSize({ width: 360, height: 640 });
	await setSafeArea(page, { top: 0, right: 0, bottom: 96, left: 0 });
	await expect(browser).toHaveCSS('width', '360px');
	await expect(browser).toHaveCSS('height', '544px');
	const extentsBeforeLongList = await shellExtents(page);
	for (let count = 3; count <= 9; count += 1) {
		await browser.getByRole('button', { name: 'Create Backup' }).click();
		await expect(browser.locator('article')).toHaveCount(count);
	}
	await expect
		.poll(() =>
			browser.locator('.backup-list').evaluate((list) => list.scrollHeight > list.clientHeight)
		)
		.toBe(true);
	expect(await shellExtents(page)).toMatchObject({
		bodyHeight: extentsBeforeLongList.bodyHeight,
		bodyWidth: extentsBeforeLongList.bodyWidth,
		htmlHeight: extentsBeforeLongList.htmlHeight,
		htmlWidth: extentsBeforeLongList.htmlWidth
	});
	await expect(browser.getByRole('button', { name: 'Create Backup' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('[data-destination-focus="saves-grid"]')).toBeFocused();

	await page.setViewportSize({ width: 1280, height: 800 });
	await setSafeArea(page, { top: 0, right: 0, bottom: 0, left: 0 });
	await chooseMainMenu(page, 'Boxes');
	await expect(page).toHaveURL(/\/$/);
	const boxesRoute = page.locator('.boxes-route');
	await expect(boxesRoute).toHaveAttribute('data-initial-state', 'ready');
	await expect(boxesRoute).toHaveAttribute('data-active-save-file-id', /.+/);
	const previousOwnerId = await boxesRoute.getAttribute('data-active-save-file-id');
	expect(previousOwnerId).toBeTruthy();

	await page.getByRole('button', { name: /Open Box Menu for/ }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Open another' })
		.click();
	await page
		.getByRole('dialog', { name: 'Open another collection' })
		.getByRole('button', { name: /Pokemon Storage/ })
		.click();
	await expect(page).toHaveURL(/\/$/);
	await expect(boxesRoute).toHaveAttribute('data-initial-state', 'ready');
	const storageGrid = page.getByRole('grid', { name: 'Pokemon Storage Box 01' });
	await expect(storageGrid).toBeVisible();
	const preMenuSlot = storageGrid.getByRole('gridcell').first();
	await preMenuSlot.focus();
	await chooseMainMenu(page, 'Backup Browser');
	browser = page.getByRole('dialog', { name: 'Backup Browser' });
	await expect(browser).toBeVisible();
	await expect(storageGrid).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(preMenuSlot).toBeFocused();
	await chooseMainMenu(page, 'Backup Browser');
	await expect(browser).toBeVisible();
	await browser.locator('article').first().getByRole('button', { name: 'Restore' }).click();
	await browser.getByRole('button', { name: 'Restore' }).last().click();
	await expect(browser).toBeHidden();
	await expect(page).toHaveURL(/\/$/);
	await expect(storageGrid).toBeVisible();
	await expect(preMenuSlot).toBeFocused();
	await chooseMainMenu(page, 'Backup Browser');
	await expect(browser).toBeVisible();

	await browser
		.locator('article')
		.filter({ hasText: 'Manual' })
		.first()
		.getByRole('button', { name: 'Keep as Save File' })
		.click();
	await expect(page).toHaveURL(/\/$/);
	await expect(boxesRoute).toHaveAttribute('data-active-save-file-id', /.+/);
	await expect(boxesRoute).not.toHaveAttribute('data-active-save-file-id', previousOwnerId!);
	await expect(page.getByRole('button', { name: /011020251345\.restored\.sav/ })).toBeVisible({
		timeout: 15_000
	});
	await expect(page.locator('#box-0-slot-0')).toBeFocused();

	await page.setViewportSize({ width: 1280, height: 800 });
	await setSafeArea(page, { top: 0, right: 0, bottom: 0, left: 0 });
	await chooseMainMenu(page, 'Settings');
	await page.getByRole('button', { name: 'Use dark theme' }).click();
	await chooseMainMenu(page, 'Trainer');
	const saveFileLauncher = page.getByRole('button', { name: 'Browse Backups' });
	await expect(saveFileLauncher).toBeVisible({ timeout: 15000 });
	await saveFileLauncher.click();
	await expect(page).toHaveURL(/\/trainer$/);
	await expect(
		page.locator('.app-shell.dark').getByRole('dialog', { name: 'Backup Browser' })
	).toBeVisible();
	await pressController(page, 'Escape');
	await expect(saveFileLauncher).toBeFocused();

	await page.goto('/');
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeVisible();
	await page.goto('/saves');
	await expect(page.getByRole('dialog', { name: 'Slot actions' })).toBeHidden();
	await openBackupBrowser(page);
	await expect(page.getByRole('dialog', { name: 'Backup Browser' })).toBeVisible();
});

test('deletes an active Dirty Save File and all Backups after confirmation', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await moveFirstEmeraldBoxSlotToThirdSlot(page);
	const browser = await openBackupBrowser(page);
	await browser.getByRole('button', { name: 'Create Backup' }).click();
	await expect(browser.locator('article').filter({ hasText: 'Manual' })).toBeVisible();
	await page.keyboard.press('Escape');

	await chooseMainMenu(page, 'Saves');
	const activeCard = page.locator('.save-card.active');
	await activeCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	let menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await menu.getByRole('button', { name: 'Delete from Saves' }).click();
	let saveDialog = page.getByRole('dialog', {
		name: 'Delete emerald-011020251345.sav?'
	});
	await expect(saveDialog).toBeVisible();
	await expect(saveDialog).toContainText('all of its Backups');
	await expect(saveDialog).toContainText('active Workspace');
	await expect(saveDialog).toContainText('Dirty Workspace contains unexported changes');
	await saveDialog.getByRole('button', { name: 'Keep Save File' }).click();
	menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await expect(menu.getByRole('button', { name: 'Delete from Saves' })).toBeFocused();
	await menu.getByRole('button', { name: 'Delete from Saves' }).click();
	saveDialog = page.getByRole('dialog', { name: 'Delete emerald-011020251345.sav?' });
	await saveDialog.getByRole('button', { name: 'Delete', exact: true }).click();
	await expect(page.getByText('emerald-011020251345.sav deleted.')).toBeVisible();
	await expect(page.locator('.save-card')).toHaveCount(0);
	await expect(page.locator('#saves-target-pokemon-storage')).toContainText('Pokemon Storage');
	await expect(page.locator('[data-destination-focus="saves-grid"]')).toHaveAttribute(
		'aria-activedescendant',
		'saves-target-pokemon-storage'
	);
	await expect(page.locator('[data-destination-focus="saves-grid"]')).toBeFocused();
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
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);

	await page.reload();
	await expectActiveSaveOwner(page, 'emerald-011020251345.sav');
	await expect(
		page.getByRole('button', { name: 'Open Box Menu for emerald-011020251345.sav' })
	).toBeVisible({ timeout: 15000 });
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);
	await expect(page.locator('#box-0-slot-0')).toContainText('Empty');
	await expect(page.locator('#box-0-slot-2')).toContainText('ARON');
	await expect(page.locator('.toolbar-status-strip')).toHaveCount(0);
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

	await page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Open another' })
		.click();
	await page.getByRole('button', { name: /011020251345.sav/ }).click();
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
});

test('Saves opens Pokemon Storage as the focused single Boxes collection', async ({ page }) => {
	await openEmptySaves(page);
	await importEmeraldThroughSaves(page);
	await page.goto('/saves');

	const grid = page.getByRole('grid', { name: 'Saves collections' });
	const activeSaveFileId = (await page.locator('.save-card.active').getAttribute('id'))?.replace(
		'saves-target-',
		''
	);
	await page.getByRole('button', { name: 'Open Pokemon Storage in Boxes' }).click();

	await expect(page).toHaveURL(/\?source=pokemon-storage$/);
	await expect(
		page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' })
	).toBeVisible();
	await expect(page.locator('.box-pane')).toHaveCount(1);
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	const persistedActiveSaveFileId = await page.evaluate(
		() =>
			new Promise<string | null>((resolve, reject) => {
				const open = indexedDB.open('pksx-saves');
				open.onerror = () => reject(open.error);
				open.onsuccess = () => {
					const database = open.result;
					const request = database
						.transaction('appState', 'readonly')
						.objectStore('appState')
						.get('activeSaveFileId');
					request.onerror = () => reject(request.error);
					request.onsuccess = () => {
						database.close();
						resolve((request.result as { value?: string } | undefined)?.value ?? null);
					};
				};
			})
	);
	expect(persistedActiveSaveFileId).toBe(activeSaveFileId);

	await chooseMainMenu(page, 'Saves');
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-pokemon-storage');
	await expect(page.locator('.save-card.active')).toContainText('emerald-011020251345.sav');
});

test('Saves uses one identity grid with internal scrolling at the landscape floor', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.setViewportSize({ width: 640, height: 360 });
	await page.goto('/saves');
	await setSafeArea(page, { top: 12, right: 12, bottom: 12, left: 12 });

	const grid = page.getByRole('grid', { name: 'Saves collections' });
	await expect(grid).toBeFocused();
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-import');
	const storageCard = page.locator('#saves-target-pokemon-storage');
	await expect(storageCard).toContainText('0 Pokemon');
	await expect(storageCard).toContainText('3 Storage Boxes');
	await expect(storageCard).toContainText('Automatically saved by PKSX');

	const fixture = await readFile(emeraldFixturePath);
	for (const name of ['alpha.sav', 'beta.sav', 'gamma.sav', 'delta.sav']) {
		await page.getByLabel('Import Save File').setInputFiles({
			name,
			mimeType: 'application/octet-stream',
			buffer: fixture
		});
	}
	await expect(page.locator('.save-card')).toHaveCount(4);
	await expect(grid).toHaveAttribute('aria-colcount', '2');
	await expect(grid).toHaveAttribute('aria-activedescendant', /saves-target-.+/);
	const floorFit = await page.locator('.saves-scrollport').evaluate((scrollport) => {
		const viewport = scrollport.getBoundingClientRect();
		const targets = Array.from(scrollport.querySelectorAll<HTMLElement>('[role="gridcell"]'));
		const importCard = scrollport.querySelector('.import-cell')?.getBoundingClientRect();
		return {
			firstFourTargetsVisible: targets
				.slice(0, 4)
				.every((target) => target.getBoundingClientRect().bottom <= viewport.bottom),
			fifthTarget: targets[4]?.id,
			fifthTargetNeedsScroll: Boolean(
				targets[4] && targets[4].getBoundingClientRect().bottom > viewport.bottom + 1
			),
			importNeedsScroll: Boolean(importCard && importCard.bottom > viewport.bottom + 1)
		};
	});
	expect(floorFit).toEqual({
		firstFourTargetsVisible: true,
		fifthTarget: 'saves-target-pokemon-storage',
		fifthTargetNeedsScroll: true,
		importNeedsScroll: true
	});
	await page.locator('#save-file-input').dispatchEvent('cancel');
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-import');
	await expect
		.poll(() => page.locator('.saves-scrollport').evaluate((panel) => panel.scrollTop))
		.toBeGreaterThan(0);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	await page.keyboard.press('ArrowUp');
	await expect(grid).toHaveAttribute('aria-activedescendant', /saves-target-.+/);
	await expect(grid).not.toHaveAttribute('aria-activedescendant', 'saves-target-import');
	await page.keyboard.press('ArrowDown');
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-import');
	await page.keyboard.press('ArrowUp');
	const targetBeforeResize = await grid.getAttribute('aria-activedescendant');
	await page.setViewportSize({ width: 360, height: 640 });
	await expect(grid).toHaveAttribute('aria-colcount', '1');
	await expect(grid).toHaveAttribute('aria-activedescendant', targetBeforeResize!);

	const scrollState = await page.locator('.saves-scrollport').evaluate((panel) => ({
		clientHeight: panel.clientHeight,
		scrollHeight: panel.scrollHeight
	}));
	expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
	await page.locator('.saves-scrollport').evaluate((panel) => {
		panel.scrollTop = 120;
	});
	await expect
		.poll(() => page.locator('.saves-scrollport').evaluate((panel) => panel.scrollTop))
		.toBeGreaterThan(0);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('portrait Saves keeps the document fixed and the grid at one column', async ({ page }) => {
	await openEmptySaves(page);
	await page.setViewportSize({ width: 360, height: 640 });
	await page.goto('/saves');
	await setSafeArea(page, { top: 0, right: 0, bottom: 96, left: 0 });

	const fixture = await readFile(emeraldFixturePath);
	for (const name of ['alpha.sav', 'beta.sav', 'gamma.sav']) {
		await page.getByLabel('Import Save File').setInputFiles({
			name,
			mimeType: 'application/octet-stream',
			buffer: fixture
		});
	}

	await expect(page.locator('.save-card')).toHaveCount(3);
	await page.evaluate(() => window.scrollTo(0, 0));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	const mobileGutters = await page.evaluate(() => {
		const shell = document.querySelector('.app-shell')?.getBoundingClientRect();
		const panel = document.querySelector('.saves-density')?.getBoundingClientRect();

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
				gridColumns: getComputedStyle(document.querySelector('.saves-grid')!).gridTemplateColumns,
				panelOverflowY: getComputedStyle(document.querySelector('.saves-scrollport')!).overflowY,
				scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
				scrollTop: document.scrollingElement?.scrollTop ?? 0
			}))
		)
		.toMatchObject({
			panelOverflowY: 'auto',
			scrollTop: 0
		});
	const gridColumns = await page
		.locator('.saves-grid')
		.evaluate((gridElement) => getComputedStyle(gridElement).gridTemplateColumns);
	expect(gridColumns.trim().split(/\s+/)).toHaveLength(1);

	const scrollState = await page.evaluate(() => ({
		innerHeight,
		scrollHeight: document.scrollingElement?.scrollHeight ?? 0,
		gridScrollHeight: document.querySelector('.saves-scrollport')?.scrollHeight ?? 0,
		gridClientHeight: document.querySelector('.saves-scrollport')?.clientHeight ?? 0
	}));
	expect(scrollState.scrollHeight).toBeLessThanOrEqual(scrollState.innerHeight);
	expect(scrollState.gridScrollHeight).toBeGreaterThan(scrollState.gridClientHeight);

	await page.evaluate(() => window.scrollTo(0, 480));
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
	await expect(page.getByText('Offline - all local')).toHaveCount(0);
});

test('Saves imports distinct cards, opens cards and menus, and preserves failure state', async ({
	page
}) => {
	await openEmptySaves(page);

	await chooseMainMenu(page, 'Saves');
	await expect(page).toHaveURL(/\/saves$/);
	await expect(page.getByRole('heading', { name: 'Saves' })).toBeVisible();
	const grid = page.getByRole('grid', { name: 'Saves collections' });
	await expect(grid).toBeFocused();

	const fixture = await readFile(emeraldFixturePath);
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'alpha.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});

	await expect(page.getByText('alpha.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	let dismissNotification = page.getByRole('button', { name: 'Dismiss notification' });
	await dismissNotification.focus();
	const alphaTarget = await grid.getAttribute('aria-activedescendant');
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('x');
	await expect(dismissNotification).toBeFocused();
	await expect(grid).toHaveAttribute('aria-activedescendant', alphaTarget!);
	await expect(page.getByRole('dialog', { name: 'Save File Menu' })).toBeHidden();
	await page.keyboard.press('Enter');
	await expect(dismissNotification).toBeHidden();
	await expect(page).toHaveURL(/\/saves$/);
	const alphaCard = page.locator('.save-card').filter({ hasText: 'alpha.sav' });
	await expect(alphaCard).toContainText('Pokemon Emerald');
	await expect(alphaCard.locator('.trainer')).toHaveText(/\S+/);
	await expect(alphaCard).toContainText('14 boxes');
	await expect(alphaCard).toContainText('7 Pokemon');
	await expect(page.locator('.save-card.active').getByText('Active')).toBeVisible();

	await expect(page.locator('body')).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-pokemon-storage');
	await page.keyboard.press('x');
	await expect(page.getByRole('dialog', { name: 'Save File Menu' })).toBeHidden();
	await page.keyboard.press('ArrowLeft');
	await expect(grid).toHaveAttribute('aria-activedescendant', alphaTarget!);
	await page.getByRole('heading', { name: 'Saves', exact: true }).click();
	await expect(page.locator('body')).toBeFocused();
	await page.keyboard.press('x');
	await expect(page.getByRole('dialog', { name: 'Save File Menu' })).toBeVisible();
	await page.keyboard.press('Escape');
	await page.getByRole('heading', { name: 'Saves', exact: true }).click();
	await expect(page.locator('body')).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/$/);
	await chooseMainMenu(page, 'Saves');
	await expect(grid).toHaveAttribute('aria-activedescendant', alphaTarget!);

	await page.getByLabel('Import Save File').setInputFiles({
		name: 'beta.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});

	await expect(page.getByText('beta.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	dismissNotification = page.getByRole('button', { name: 'Dismiss notification' });
	await dismissNotification.focus();
	await page.keyboard.press('Space');
	await expect(dismissNotification).toBeHidden();
	await expect(page).toHaveURL(/\/saves$/);
	await expect(page.locator('.save-card')).toHaveCount(2);
	await expect(page.locator('.save-card.active')).toContainText('beta.sav');
	expect(
		await grid
			.getByRole('gridcell')
			.evaluateAll((cells) =>
				cells.every((cell) => cell.parentElement?.getAttribute('role') === 'row')
			)
	).toBe(true);

	const betaTarget = await grid.getAttribute('aria-activedescendant');
	const modifiedShortcutsPrevented = await page.evaluate(() => {
		const altLeft = new KeyboardEvent('keydown', {
			key: 'ArrowLeft',
			altKey: true,
			bubbles: true,
			cancelable: true
		});
		const commandX = new KeyboardEvent('keydown', {
			key: 'x',
			metaKey: true,
			bubbles: true,
			cancelable: true
		});
		window.dispatchEvent(altLeft);
		window.dispatchEvent(commandX);
		return [altLeft.defaultPrevented, commandX.defaultPrevented];
	});
	expect(modifiedShortcutsPrevented).toEqual([false, false]);
	await page.locator('#save-file-input').focus();
	await page.keyboard.press('x');
	await expect(page.getByRole('dialog', { name: 'Save File Menu' })).toBeHidden();
	await grid.focus();
	await pressController(page, 'x');
	let menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await expect(menu).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(grid).toHaveAttribute('aria-activedescendant', betaTarget!);
	await expect(grid).toBeFocused();

	await alphaCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	await expect(grid).toHaveAttribute('aria-activedescendant', betaTarget!);
	menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await expect(menu.getByRole('button', { name: 'Open Trainer' })).toBeFocused();
	await page.locator('.edge-menu-backdrop').click({ position: { x: 8, y: 8 } });
	await expect(grid).toBeFocused();
	await expect(grid).toHaveAttribute('aria-activedescendant', betaTarget!);
	await alphaCard.getByRole('button', { name: /Open Save File Menu/ }).focus();
	await pressController(page, 'Enter');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('button', { name: 'Open Box Menu for beta.sav' })).toBeVisible();
	await chooseMainMenu(page, 'Saves');
	await expect(grid).toHaveAttribute('aria-activedescendant', betaTarget!);

	await alphaCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await menu.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete alpha.sav?' })
		.getByRole('button', { name: 'Keep Save File' })
		.click();
	await page.locator('.edge-menu-backdrop').click({ position: { x: 8, y: 8 } });
	await expect(grid).toHaveAttribute('aria-activedescendant', betaTarget!);
	await expect(grid).toBeFocused();

	await alphaCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await page.evaluate(() => {
		const descriptor = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete');
		if (!descriptor?.get || !descriptor.set) throw new Error('Missing IDB completion accessors.');
		let armed = true;
		Object.defineProperty(IDBTransaction.prototype, 'oncomplete', {
			...descriptor,
			set: function (this: IDBTransaction, handler: IDBTransaction['oncomplete']) {
				if (!armed || !this.objectStoreNames.contains('saveFiles')) {
					descriptor.set!.call(this, handler);
					return;
				}
				armed = false;
				descriptor.set!.call(this, (event: Event) => {
					const testWindow = window as typeof window & {
						__pksxSaveReadHeld?: boolean;
						__pksxReleaseSaveRead?: () => void;
						__pksxSaveReadSettled?: boolean;
					};
					testWindow.__pksxSaveReadHeld = true;
					testWindow.__pksxReleaseSaveRead = () => {
						Object.defineProperty(IDBTransaction.prototype, 'oncomplete', descriptor);
						handler?.call(this, event);
						setTimeout(() => (testWindow.__pksxSaveReadSettled = true), 0);
					};
				});
			}
		});
	});
	await menu.getByRole('button', { name: 'Delete from Saves' }).click();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as typeof window & { __pksxSaveReadHeld?: boolean }).__pksxSaveReadHeld === true
			)
		)
		.toBe(true);
	await page.keyboard.press('Escape');
	await expect(menu).toBeHidden();
	await page.evaluate(() =>
		(window as typeof window & { __pksxReleaseSaveRead?: () => void }).__pksxReleaseSaveRead?.()
	);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as typeof window & { __pksxSaveReadSettled?: boolean }).__pksxSaveReadSettled ===
					true
			)
		)
		.toBe(true);
	await expect(page.getByRole('dialog', { name: 'Delete alpha.sav?' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Open Main Menu' })).toBeVisible();

	await alphaCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await menu.getByRole('button', { name: 'Open Trainer' }).click();
	await expect(page).toHaveURL(/\/trainer$/);
	await page.goto('/');
	await expectActiveSaveOwner(page, 'alpha.sav');

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
	await expect(page.locator('.save-card')).toHaveCount(2);
	await expect(grid).toBeFocused();

	await page.locator('.save-card').filter({ hasText: 'beta.sav' }).locator('.card-main').click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole('button', { name: 'Open Box Menu for beta.sav' })).toBeVisible({
		timeout: 15_000
	});
});

test('Saves menu activates its Save File before opening Trainer or Bag', async ({ page }) => {
	await openEmptySaves(page);
	await chooseMainMenu(page, 'Saves');
	const fixture = await readFile(emeraldFixturePath);
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'alpha.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});
	await expect(page.getByText('alpha.sav imported and made active.')).toBeVisible({
		timeout: 15_000
	});

	await page.getByLabel('Import Save File').setInputFiles({
		name: 'beta.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});
	await expect(page.getByText('beta.sav imported and made active.')).toBeVisible({
		timeout: 15_000
	});

	const grid = page.getByRole('grid', { name: 'Saves collections' });
	const alphaCard = page.locator('.save-card').filter({ hasText: 'alpha.sav' });
	const alphaTarget = await alphaCard.getAttribute('id');
	await grid.focus();
	await page.keyboard.press('ArrowRight');
	await expect(grid).toHaveAttribute('aria-activedescendant', alphaTarget!);
	await page.keyboard.press('x');
	let menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await expect(menu.getByRole('button', { name: 'Open Trainer' })).toBeFocused();
	await pressController(page, 'ArrowDown');
	await expect(menu.getByRole('button', { name: 'Open Bag' })).toBeFocused();
	await pressController(page, 'ArrowUp');
	await pressController(page, 'Enter');

	await expect(page).toHaveURL(/\/trainer$/);
	const trainer = page.locator('[data-destination-root="trainer"]');
	await expect(trainer).toHaveAttribute('data-initial-state', 'ready');
	await expect(trainer).toContainText('alpha.sav');
	await page.goto('/saves');
	await expect(alphaCard).toHaveClass(/active/);
	await alphaCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	menu = page.getByRole('dialog', { name: 'Save File Menu' });
	await menu.getByRole('button', { name: 'Open Bag' }).click();
	await expect(page).toHaveURL(/\/bag$/);
	const bag = page.locator('[data-destination-root="bag"]');
	await expect(bag).toHaveAttribute('data-initial-state', 'ready');
	await expect(bag).toContainText('alpha.sav');
	await page.goto('/saves');
	await expect(alphaCard).toHaveClass(/active/);
	await expect(grid).toHaveAttribute('aria-activedescendant', alphaTarget!);
});

test('Saves keeps unavailable cards actionable and restores semantic focus after navigation', async ({
	page
}) => {
	await openEmptySaves(page);
	await page.goto('/saves');
	const fixture = await readFile(emeraldFixturePath);
	await page.getByLabel('Import Save File').setInputFiles({
		name: 'unavailable.sav',
		mimeType: 'application/octet-stream',
		buffer: fixture
	});
	await expect(page.getByText('unavailable.sav imported and made active.')).toBeVisible({
		timeout: 15_000
	});
	await removeSaveBytes(page, 'unavailable.sav');
	await page.reload();

	const grid = page.getByRole('grid', { name: 'Saves collections' });
	const card = page.locator('.save-card').filter({ hasText: 'unavailable.sav' });
	await expect(card).toContainText('Details unavailable', { timeout: 15_000 });
	await expect(card.locator('.file-name')).toHaveText('unavailable.sav');
	await card.getByRole('button', { name: /Open Save File Menu/ }).click();
	await expect(page.getByRole('dialog', { name: 'Save File Menu' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(grid).toBeFocused();

	await page.locator('#save-file-input').dispatchEvent('cancel');
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-import');
	await expect(grid).toBeFocused();
	await chooseMainMenu(page, 'Settings');
	await chooseMainMenu(page, 'Saves');
	await expect(grid).toHaveAttribute('aria-activedescendant', 'saves-target-import');
	await expect(grid).toBeFocused();

	await page.setViewportSize({ width: 1920, height: 1080 });
	await expect(grid).toHaveAttribute('aria-colcount', '4');
	await expect
		.poll(() => page.locator('.saves-density').evaluate((element) => element.clientWidth))
		.toBeLessThanOrEqual(1200);
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

	await expectActiveSaveOwner(page, 'emerald-011020251345.sav');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });

	await context.setOffline(false);
});
