import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import path from 'node:path';

const emeraldFixturePath = path.resolve(
	'test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav'
);

const destinations: Record<string, { path: string; root: string }> = {
	Boxes: { path: '/', root: 'boxes' },
	Trainer: { path: '/trainer', root: 'trainer' },
	Bag: { path: '/bag', root: 'bag' },
	Saves: { path: '/saves', root: 'saves' },
	Settings: { path: '/settings', root: 'settings' }
};

async function expectDestinationReady(page: Page, destination: string) {
	await expect(page.locator(`[data-destination-root="${destination}"]`)).toHaveAttribute(
		'data-initial-state',
		'ready',
		{ timeout: 15000 }
	);
}

async function resetEmptyStorage(page: Page) {
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
	await expect(page).toHaveURL(/\/saves$/);
	await expectDestinationReady(page, 'saves');
}

async function openMainMenu(page: Page) {
	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	return page.getByRole('dialog', { name: 'Main Menu' });
}

async function choose(page: Page, label: string) {
	const menu = await openMainMenu(page);
	await menu.getByRole('button', { name: new RegExp(`^${label}`) }).click();
	const destination = destinations[label];
	if (!destination) return;
	await expect(page).toHaveURL((url) => url.pathname === destination.path);
	await expectDestinationReady(page, destination.root);
}

async function controllerButton(page: Page, key: string, pressed: boolean) {
	await page.evaluate(
		({ controllerKey, isPressed }) => {
			window.dispatchEvent(
				new CustomEvent('pksxcontroller', {
					detail: {
						key: controllerKey,
						pressed: isPressed,
						discrete: true,
						id: 'Acceptance controller'
					}
				})
			);
		},
		{ controllerKey: key, isPressed: pressed }
	);
}

async function pressController(page: Page, key: string) {
	await controllerButton(page, key, true);
	await controllerButton(page, key, false);
}

async function expectSavesFocus(page: Page, target: string | RegExp = 'saves-target-import') {
	await expect(page.locator('[data-destination-root="saves"]')).toHaveAttribute(
		'data-initial-state',
		'ready'
	);
	const grid = page.getByRole('grid', { name: 'Saves collections' });
	await expect(grid).toBeFocused();
	await expect(grid).toHaveAttribute('aria-activedescendant', target);
	return grid;
}

test('empty first run lands on Saves and exposes the amended selectable destinations', async ({
	page
}) => {
	await resetEmptyStorage(page);

	await expectSavesFocus(page);
	const opener = page.getByRole('button', { name: 'Open Main Menu' });
	await expect(opener).toHaveAttribute('tabindex', '-1');

	let menu = await openMainMenu(page);
	await expect(menu.locator('.main-menu-row strong')).toHaveText([
		'Boxes',
		'Trainer',
		'Bag',
		'Saves',
		'Settings',
		'Backup Browser'
	]);
	await expect(menu.getByRole('button', { name: /^Search/ })).toHaveCount(0);
	await expect(menu.getByRole('button', { name: /^Saves/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
	await expect(menu.getByRole('button', { name: /^Trainer/ })).toContainText('No active Save File');
	await expect(menu.getByRole('button', { name: /^Bag/ })).toContainText('No active Save File');
	await expect(menu.getByRole('button', { name: /^Backup Browser/ })).toContainText(
		'No active Save File'
	);

	await menu.getByRole('button', { name: /^Saves/ }).click();
	await expect(menu).toBeHidden();
	await expectSavesFocus(page);

	await choose(page, 'Boxes');
	await expect(page).toHaveURL(/\/$/);
	await choose(page, 'Trainer');
	await expect(page).toHaveURL(/\/trainer$/);
	await expect(page.getByText('No active Save File')).toBeVisible();
	await choose(page, 'Bag');
	await expect(page).toHaveURL(/\/bag$/);
	await expect(page.getByText('No active Save File')).toBeVisible();
	await choose(page, 'Settings');
	await expect(page).toHaveURL(/\/settings$/);
	menu = await openMainMenu(page);
	await menu.getByRole('button', { name: /^Backup Browser/ }).click();
	await expect(page.getByRole('dialog', { name: 'Backup Browser' })).toContainText(
		'No active Save File'
	);
	await pressController(page, 'Escape');
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.locator('.top-bar, .mobile-tabbar')).toHaveCount(0);
});

test('Main Menu opens before destination controls are ready and restores the ready control', async ({
	page
}) => {
	await resetEmptyStorage(page);
	await page.evaluate(() => {
		const route = document.querySelector<HTMLElement>('[data-destination-root="saves"]')!;
		route.dataset.initialState = 'loading';
		route.replaceChildren(document.createTextNode('Loading Saves…'));
	});

	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	const menu = page.getByRole('dialog', { name: 'Main Menu' });
	await expect(menu).toBeVisible();
	await page.evaluate(() => {
		const route = document.querySelector<HTMLElement>('[data-destination-root="saves"]')!;
		const readyControl = document.createElement('button');
		readyControl.type = 'button';
		readyControl.textContent = 'Ready Save';
		readyControl.dataset.destinationInitial = '';
		readyControl.dataset.destinationFocus = 'ready-save';
		route.append(readyControl);
		route.dataset.initialState = 'ready';
	});
	await menu.getByRole('button', { name: /^Saves/ }).click();
	await expect(page.getByRole('button', { name: 'Ready Save' })).toBeFocused();
});

test('a second fresh Start closes Main Menu while Save File availability is still loading', async ({
	page
}) => {
	await resetEmptyStorage(page);
	await page.evaluate(async () => {
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('pksx-saves', 4);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
		const transaction = database.transaction('appState', 'readwrite');
		const store = transaction.objectStore('appState');
		let released = false;
		const keepAlive = () => {
			const request = store.get('activeSaveFileId');
			request.onsuccess = () => {
				if (!released) keepAlive();
			};
		};
		keepAlive();
		(
			window as typeof window & { releaseMainMenuStorageLock?: () => void }
		).releaseMainMenuStorageLock = () => {
			released = true;
			transaction.oncomplete = () => database.close();
		};
	});

	await pressController(page, 'Menu');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeVisible();
	await pressController(page, 'Menu');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeHidden();
	await page.evaluate(() => {
		(
			window as typeof window & { releaseMainMenuStorageLock?: () => void }
		).releaseMainMenuStorageLock?.();
	});
});

test('Trainer and Bag report the persisted active Save File while Pokemon Storage has focus', async ({
	page
}) => {
	await resetEmptyStorage(page);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await choose(page, 'Boxes');
	await page.getByRole('button', { name: 'Open Box Menu for emerald-011020251345.sav' }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Open another' })
		.click();
	await page
		.getByRole('dialog', { name: 'Open another collection' })
		.getByRole('button', { name: /Pokemon Storage/ })
		.click();
	await page.getByRole('button', { name: 'Open Box Menu for Pokemon Storage' }).focus();

	const menu = await openMainMenu(page);
	await expect(menu.getByRole('button', { name: /^Trainer/ })).toContainText(
		'Edit Trainer details and money.'
	);
	await expect(menu.getByRole('button', { name: /^Bag/ })).toContainText(
		'Edit the active Save File Bag.'
	);
});

test('Start is fresh-press only and restores destination focus by identity', async ({ page }) => {
	await resetEmptyStorage(page);
	const savesGrid = await expectSavesFocus(page);

	await controllerButton(page, 'Menu', true);
	await controllerButton(page, 'Menu', true);
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeVisible();
	await controllerButton(page, 'Menu', false);
	await controllerButton(page, 'Menu', true);
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeHidden();
	await expectSavesFocus(page);
	await controllerButton(page, 'Menu', false);
	await controllerButton(page, 'Menu', true);
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeVisible();
	await page.evaluate(() => {
		window.dispatchEvent(
			new CustomEvent('pksxcontrollerconnection', {
				detail: { id: 'Reconnected acceptance controller' }
			})
		);
	});
	await controllerButton(page, 'Menu', true);
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeHidden();
	await controllerButton(page, 'Menu', false);

	await choose(page, 'Settings');
	const darkTheme = page.getByRole('button', { name: 'Use dark theme' });
	await darkTheme.focus();
	await page.keyboard.press('Control+k');
	let menu = page.getByRole('dialog', { name: 'Main Menu' });
	await menu.getByRole('button', { name: /^Settings/ }).click();
	await expect(darkTheme).toBeFocused();

	await page.keyboard.press('Control+k');
	menu = page.getByRole('dialog', { name: 'Main Menu' });
	await menu.getByRole('button', { name: /^Backup Browser/ }).click();
	await page.goBack();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('dialog', { name: 'Backup Browser' })).toBeHidden();
	await expect(darkTheme).toBeFocused();

	await page.keyboard.press('Control+k');
	menu = page.getByRole('dialog', { name: 'Main Menu' });
	await menu.getByRole('button', { name: /^Backup Browser/ }).click();
	await pressController(page, 'Escape');
	await expect(darkTheme).toBeFocused();

	await choose(page, 'Saves');
	await expectSavesFocus(page);
	await choose(page, 'Settings');
	await expect(page).toHaveURL(/\/settings$/);
	await page.goBack();
	await expect(page).toHaveURL(/\/saves$/);
	await expect(savesGrid).toBeFocused();
	await expect(savesGrid).toHaveAttribute('aria-activedescendant', 'saves-target-import');

	await choose(page, 'Settings');
	await pressController(page, 'Escape');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
});

test('reloading with the Main Menu open does not prompt and resets session focus', async ({
	page
}) => {
	await resetEmptyStorage(page);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await choose(page, 'Boxes');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 15000 });
	await page.locator('#box-0-slot-17').focus();
	await openMainMenu(page);

	let unloadDialogs = 0;
	page.on('dialog', (dialog) => {
		unloadDialogs += 1;
		void dialog.dismiss();
	});
	await page.reload();

	await expectDestinationReady(page, 'boxes');
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	expect(unloadDialogs).toBe(0);
});

test('stored Pokemon in any box makes Boxes the first-run destination', async ({ page }) => {
	await resetEmptyStorage(page);
	await page.evaluate(
		() =>
			new Promise<void>((resolve, reject) => {
				const open = indexedDB.open('pksx-saves');
				open.onerror = () => reject(open.error ?? new Error('Could not open Saves.'));
				open.onsuccess = () => {
					const database = open.result;
					const transaction = database.transaction('pokemonStorage', 'readwrite');
					transaction.objectStore('pokemonStorage').put({
						id: 'pokemon-storage',
						schemaVersion: 1,
						boxCount: 2,
						boxSlotCount: 30,
						updatedAt: '2026-09-09T00:00:00.000Z',
						boxes: Array.from({ length: 2 }, (_, box) => ({
							index: box,
							name: `Box ${box + 1}`,
							slots: Array.from({ length: 30 }, (_, slot) => ({
								box,
								slot,
								pokemon:
									box === 1 && slot === 29
										? { label: 'PIKACHU', speciesId: 25, form: 0, isEgg: false }
										: null
							}))
						}))
					});
					transaction.onerror = () =>
						reject(transaction.error ?? new Error('Could not seed Pokemon Storage.'));
					transaction.oncomplete = () => {
						database.close();
						resolve();
					};
				};
			})
	);

	await page.goto('/');
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('#box-grid')).toBeVisible();
});

test('Saves restores an asynchronously loaded control by stable identity', async ({ page }) => {
	await resetEmptyStorage(page);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await page.reload();
	await expectDestinationReady(page, 'saves');
	const grid = await expectSavesFocus(page, /saves-target-.+/);
	const rememberedTarget = await grid.getAttribute('aria-activedescendant');
	expect(rememberedTarget).toBeTruthy();

	await choose(page, 'Settings');
	await choose(page, 'Saves');
	await expect(grid).toBeFocused();
	await expect(grid).toHaveAttribute('aria-activedescendant', rememberedTarget!);
});

test('Trainer and Bag keep independent semantic focus within their separate destinations', async ({
	page
}) => {
	await resetEmptyStorage(page);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});
	await choose(page, 'Trainer');

	const trainerName = page.locator('#save-file-trainer-name');
	await expect(trainerName).toHaveValue('DIXIE', { timeout: 15000 });
	await expect(
		page.getByLabel('Trainer fields').getByRole('button', { name: /Trainer profile/ })
	).toBeFocused();
	await expect(page.getByLabel('Trainer fields').getByRole('button', { name: /Bag/ })).toHaveCount(
		0
	);
	await page.setViewportSize({ width: 390, height: 700 });
	await page.reload();
	await expectDestinationReady(page, 'trainer');
	const mobileSections = page.getByLabel('Trainer sections');
	await expect(mobileSections.getByRole('button', { name: 'Trainer' })).toBeFocused();
	await mobileSections.getByRole('button', { name: 'Money' }).focus();
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.keyboard.press('Control+k');
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Trainer/ })
		.click();
	await expect(
		page.getByLabel('Trainer fields').getByRole('button', { name: /Money/ })
	).toBeFocused();
	await trainerName.fill('RAJ');
	const cancelAll = page.getByRole('button', { name: 'Cancel all' });
	await cancelAll.focus();
	await expect(cancelAll).toHaveAttribute('id', 'pksx-trainer-cancel-all');
	await page.keyboard.press('Control+k');
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Trainer/ })
		.click();
	await expect(cancelAll).toBeFocused();
	await page.getByLabel('Trainer fields').getByRole('button', { name: /Money/ }).focus();

	await choose(page, 'Bag');
	await expect(
		page.getByLabel('Bag fields').getByRole('button', { name: /Trainer|Money/ })
	).toHaveCount(0);
	await expect(
		page.getByLabel('Bag fields').getByRole('button', { name: /Bag Inventory pockets/ })
	).toBeFocused();
	const pockets = page.getByLabel('Bag pockets').getByRole('button');
	const addItem = page.getByRole('button', { name: '+ Add', exact: true });
	await page.getByRole('combobox', { name: /Add an item to/ }).click();
	await page.getByRole('option').first().click();
	await addItem.focus();
	const firstPocketAddId = await addItem.getAttribute('id');
	await pockets.nth(1).click();
	await page.getByRole('combobox', { name: /Add an item to/ }).click();
	await page.getByRole('option').first().click();
	await addItem.focus();
	const secondPocketAddId = await addItem.getAttribute('id');
	expect(firstPocketAddId).toMatch(/^pksx-bag-inventory-/);
	expect(secondPocketAddId).toMatch(/^pksx-bag-inventory-/);
	expect(secondPocketAddId).not.toBe(firstPocketAddId);

	const quantity = page.locator('.item-list article:not(.new-item) input[type="number"]').first();
	await quantity.focus();
	const quantityId = await quantity.getAttribute('id');
	expect(quantityId).toMatch(/^pksx-bag-item-/);
	await page.keyboard.press('Control+k');
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Bag/ })
		.click();
	await expect(page.locator(`#${quantityId}`)).toBeFocused();
	await pockets.nth(1).focus();
	await choose(page, 'Trainer');
	await expect(
		page.getByLabel('Trainer fields').getByRole('button', { name: /Money/ })
	).toBeFocused();
	await choose(page, 'Bag');
	await expect(pockets.nth(1)).toBeFocused();
	await expect(page.locator('[id^="pksx-bag-focus-"]')).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const ids = [...document.querySelectorAll<HTMLElement>('[id]')].map(({ id }) => id);
				return ids.length - new Set(ids).size;
			})
		)
		.toBe(0);

	const combobox = page.getByRole('combobox', { name: /Add an item to/ });
	await combobox.click();
	await expect(page.getByRole('searchbox', { name: /Search items/ })).toBeVisible();
	await pressController(page, 'Escape');
	await expect(page.getByRole('searchbox', { name: /Search items/ })).toBeHidden();
	await expect(page).toHaveURL(/\/bag$/);
	await pressController(page, 'Escape');
	await expect(page).toHaveURL(/\/$/);
});

test('Saves deletion workflow owns shortcuts, controller Back, and browser history', async ({
	page
}) => {
	await resetEmptyStorage(page);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 15000
	});

	const activeCard = page.locator('.save-card.active');
	await activeCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	let saveFileMenu = page.getByRole('dialog', { name: 'Save File Menu' });
	await saveFileMenu.getByRole('button', { name: 'Delete from Saves' }).click();
	let confirmation = page.getByRole('dialog', {
		name: /Delete .*011020251345\.sav\?/
	});
	await expect(confirmation).toBeVisible();
	await expect(page.getByRole('button', { name: 'Open Main Menu' })).toBeHidden();
	await page.keyboard.press('Control+k');
	await pressController(page, 'Menu');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeHidden();
	await expect(confirmation).toBeVisible();

	await pressController(page, 'Escape');
	await expect(confirmation).toBeHidden();
	await expect(saveFileMenu).toBeVisible();
	await expect(page).toHaveURL(/\/saves$/);
	await pressController(page, 'Escape');
	await expect(saveFileMenu).toBeHidden();

	await choose(page, 'Settings');
	await choose(page, 'Saves');
	await activeCard.getByRole('button', { name: /Open Save File Menu/ }).click();
	saveFileMenu = page.getByRole('dialog', { name: 'Save File Menu' });
	await saveFileMenu.getByRole('button', { name: 'Delete from Saves' }).click();
	confirmation = page.getByRole('dialog', { name: /Delete .*011020251345\.sav\?/ });
	await expect(confirmation).toBeVisible();
	await page.evaluate(() => history.back());
	await expect(confirmation).toBeHidden();
	await expect(saveFileMenu).toBeVisible();
	await expect(page).toHaveURL(/\/saves$/);
});
