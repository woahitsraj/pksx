import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import path from 'node:path';

const emeraldFixturePath = path.resolve(
	'test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav'
);

async function openSettings(page: Page, width = 1280, height = 800) {
	await page.setViewportSize({ width, height });
	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function openPokemonEditor(page: Page) {
	await page.goto('/saves');
	await expect(page.locator('[data-destination-root="saves"]')).toHaveAttribute(
		'data-initial-state',
		'ready'
	);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 30_000
	});
	await page.goto('/');
	const slot = page.locator('#box-0-slot-0');
	await expect(slot).toContainText('ARON', { timeout: 15_000 });
	await slot.click();
	await page.keyboard.press('Enter');
	await page.getByRole('button', { name: 'Edit' }).click();
	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor.locator('#pokemon-editor-species')).toBeEnabled({ timeout: 15_000 });
	return editor;
}

async function expectEditableFontFloor(scope: Locator) {
	const controls = scope.locator(
		'input:not([type="button"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="radio"]):not([type="reset"]):not([type="submit"]), select, textarea, [contenteditable]:not([contenteditable="false" i])'
	);
	const sizes = await controls.evaluateAll((elements) =>
		elements.map((element) => ({
			control: element.getAttribute('id') ?? element.getAttribute('aria-label') ?? element.tagName,
			fontSize: parseFloat(getComputedStyle(element).fontSize)
		}))
	);

	expect(sizes.length).toBeGreaterThan(0);
	expect(sizes.filter(({ fontSize }) => fontSize < 16)).toEqual([]);
}

async function expectSharedEditableType(control: Locator) {
	const type = await control.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			fontSize: parseFloat(style.fontSize),
			token: parseFloat(style.getPropertyValue('--pksx-type-editable'))
		};
	});
	expect(Number.isFinite(type.token)).toBe(true);
	expect(type.fontSize).toBe(Math.max(16, type.token));
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

async function chooseMainMenu(page: Page, label: 'Saves') {
	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: new RegExp(`^${label}`) })
		.click();
}

async function densityValues(page: Page, width: number, height: number) {
	const container = page.locator('.settings-route');
	await container.evaluate(
		(element, size) => {
			element.setAttribute('style', `flex: none; width: ${size.width}px; height: ${size.height}px`);
		},
		{ width, height }
	);

	return page.locator('.settings-density').evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			caption: style.getPropertyValue('--pksx-type-caption').trim(),
			label: style.getPropertyValue('--pksx-type-label').trim(),
			body: style.getPropertyValue('--pksx-type-body').trim(),
			title: style.getPropertyValue('--pksx-type-title').trim(),
			display: style.getPropertyValue('--pksx-type-display').trim(),
			control: parseFloat(style.getPropertyValue('--pksx-control-height')),
			smallControl: parseFloat(style.getPropertyValue('--pksx-small-control-height')),
			space: parseFloat(style.getPropertyValue('--pksx-space-unit')),
			focusRing: parseFloat(style.getPropertyValue('--pksx-focus-ring'))
		};
	});
}

async function expectStopRevealed(
	scrollport: ReturnType<Page['locator']>,
	stop: ReturnType<Page['locator']>
) {
	await expect
		.poll(async () => {
			const [port, stopBounds] = await Promise.all([scrollport.boundingBox(), stop.boundingBox()]);
			return Boolean(
				port &&
				stopBounds &&
				stopBounds.y >= port.y - 1 &&
				stopBounds.y + stopBounds.height <= port.y + port.height + 1
			);
		})
		.toBe(true);
}

test('Settings is available without a Save File and reports live build metadata', async ({
	page
}) => {
	await openSettings(page);

	await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Controls reference' })).toBeVisible();
	for (const group of ['Everywhere', 'Boxes', 'Carry', 'Menus and Takeovers', 'Pokemon Editor']) {
		await expect(page.getByRole('heading', { name: group, exact: true })).toBeVisible();
	}
	await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
	await expect(page.getByText('0.0.1', { exact: true })).toBeVisible();
	await expect(page.getByText('Web', { exact: true })).toBeVisible();
	await expect(page.getByTestId('pkhex-core-version')).not.toHaveText(/Loading|Unavailable/, {
		timeout: 30_000
	});
});

test('fresh Settings reload reports the active Save File in the Main Menu', async ({ page }) => {
	await page.goto('/saves');
	await expect(page.locator('[data-destination-root="saves"]')).toHaveAttribute(
		'data-initial-state',
		'ready'
	);
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.locator('.save-card.active')).toContainText('011020251345.sav', {
		timeout: 30_000
	});
	await expect(page.locator('.save-card.active').getByText('Active')).toBeVisible();
	await page.goto('/settings');
	await page.reload();

	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	const menu = page.getByRole('dialog', { name: 'Main Menu' });
	await expect(menu.getByRole('button', { name: /^Trainer/ })).toContainText(
		'Edit Trainer details and money.'
	);
	await expect(menu.getByRole('button', { name: /^Bag/ })).toContainText(
		'Edit the active Save File Bag.'
	);
	await expect(menu.getByRole('button', { name: /^Backup Browser/ })).toContainText(
		'Create, restore, and delete Backups.'
	);
});

test('Settings uses one clamped vertical Focus Zone and reveals its focused stop', async ({
	page
}) => {
	await openSettings(page, 1280, 800);
	const scrollport = page.locator('.settings-scrollport');
	const stops = page.locator('[data-settings-stop]');
	const light = page.getByRole('button', { name: 'Use light theme' });
	const dark = page.getByRole('button', { name: 'Use dark theme' });

	await expect(light).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(dark).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(dark).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(dark).toHaveAttribute('aria-pressed', 'true');
	await expect(page).toHaveURL(/\/settings$/);
	await page.keyboard.press('ArrowDown');
	await expect(stops.nth(1)).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(stops.nth(1)).toBeFocused();
	await expect(page).toHaveURL(/\/settings$/);
	await pressController(page, 'Enter');
	await expect(stops.nth(1)).toBeFocused();
	await expect(page).toHaveURL(/\/settings$/);

	for (let index = 2; index < (await stops.count()); index += 1) {
		await page.keyboard.press('ArrowDown');
	}
	await expect(stops.last()).toBeFocused();
	await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
	await expectStopRevealed(scrollport, stops.last());

	await page.keyboard.press('ArrowDown');
	await expect(stops.last()).toBeFocused();
	await page.keyboard.press('ArrowUp');
	await expect(stops.nth((await stops.count()) - 2)).toBeFocused();

	const everywhere = page.getByRole('heading', { name: 'Everywhere', exact: true });
	await everywhere.focus();
	await page.keyboard.press('Control+k');
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Settings/ })
		.click();
	await expect(everywhere).toBeFocused();
	await expect(everywhere).toHaveAttribute('id', 'pksx-settings-reference-everywhere');

	const about = page.getByRole('heading', { name: 'About', exact: true });
	await expect(page.getByRole('region', { name: 'About' })).toBeVisible();
	await about.focus();
	await page.keyboard.press('Control+k');
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Settings/ })
		.click();
	await expect(about).toBeFocused();
	await expect(about).toHaveAttribute('id', 'pksx-settings-about');

	for (const size of [
		{ width: 640, height: 360 },
		{ width: 360, height: 640 }
	]) {
		await openSettings(page, size.width, size.height);
		await expect(light).toBeFocused();
		for (let index = 1; index < (await stops.count()); index += 1) {
			await page.keyboard.press('ArrowDown');
		}
		await expect(stops.last()).toBeFocused();
		await expect.poll(() => scrollport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
		await expectStopRevealed(scrollport, stops.last());
	}

	await openSettings(page, 1280, 800);
	await pressController(page, 'Menu');
	await expect(page.getByRole('dialog', { name: 'Main Menu' })).toBeVisible();
	await pressController(page, 'ArrowUp');
	await expect(
		page.getByRole('dialog', { name: 'Main Menu' }).getByRole('button', { name: /^Saves/ })
	).toBeFocused();
	await pressController(page, 'Enter');
	await expect(page).toHaveURL(/\/saves$/);
});

test('Settings owns floor overflow and uses shared theme state', async ({ page }) => {
	for (const size of [
		{ width: 640, height: 360 },
		{ width: 360, height: 640 }
	]) {
		await openSettings(page, size.width, size.height);
		await page.evaluate(() => {
			const root = document.documentElement;
			root.style.setProperty('--safe-area-inset-top', '23px');
			root.style.setProperty('--safe-area-inset-right', '29px');
			root.style.setProperty('--safe-area-inset-bottom', '31px');
			root.style.setProperty('--safe-area-inset-left', '37px');
		});
		const shell = page.locator('.app-shell');
		const containment = await page.evaluate(() => {
			const route = document.querySelector<HTMLElement>('.settings-route')!;
			const routeRect = route.getBoundingClientRect();
			const values = [routeRect.left, routeRect.top, routeRect.right, routeRect.bottom];

			return {
				finite: values.every(Number.isFinite),
				positive: routeRect.width > 0 && routeRect.height > 0,
				withinSafeCanvas:
					routeRect.left >= 37 - 1 &&
					routeRect.top >= 23 - 1 &&
					routeRect.right <= innerWidth - 29 + 1 &&
					routeRect.bottom <= innerHeight - 31 + 1
			};
		});
		expect(containment).toEqual({ finite: true, positive: true, withinSafeCanvas: true });
		await expect
			.poll(() =>
				page.evaluate(() => ({
					document: document.documentElement.scrollHeight - document.documentElement.clientHeight,
					shell:
						document.querySelector('.app-shell')!.scrollHeight -
						document.querySelector('.app-shell')!.clientHeight
				}))
			)
			.toEqual({ document: 0, shell: 0 });
		await expect(shell).toHaveCSS('overflow', 'hidden');
	}

	await openSettings(page);
	const shell = page.locator('.app-shell');
	const lightBackground = await shell.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);
	await page.getByRole('button', { name: 'Use dark theme' }).click();
	await expect(shell).toHaveClass(/dark/);
	await expect
		.poll(() => shell.evaluate((element) => getComputedStyle(element).backgroundColor))
		.not.toBe(lightBackground);
	await chooseMainMenu(page, 'Saves');
	await expect(page).toHaveURL(/\/saves$/);
	await expect(shell).toHaveClass(/dark/);
	await page.goBack();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('button', { name: 'Use dark theme' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('raw viewport height selects the inherited Height Band at 560px', async ({ page }) => {
	await openSettings(page, 640, 559);
	await expect(page.locator('.settings-density')).toHaveCSS('--pksx-height-band', 'short');
	await page.setViewportSize({ width: 640, height: 560 });
	await expect(page.locator('.settings-density')).toHaveCSS('--pksx-height-band', 'tall');
});

test('editable focus locks Height Band across pointer transfer and releases after editing', async ({
	page
}) => {
	await openSettings(page, 800, 700);
	await page.goto('/saves');
	await expect(page.getByRole('grid', { name: 'Saves collections' })).toBeFocused();
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 30_000
	});
	await page.goto('/trainer');
	const trainerName = page.getByLabel('Trainer name');
	await expect(trainerName).toBeVisible({ timeout: 30_000 });
	await expectSharedEditableType(trainerName);
	const money = page.getByRole('spinbutton', { name: 'Money' });
	await expect(money).toBeVisible({ timeout: 30_000 });
	await expectSharedEditableType(money);
	await page.goto('/bag');
	const quantities = page.locator(
		'[data-destination-root="bag"] input[data-ledger-draft="item-quantity"]'
	);
	await expect(quantities.first()).toBeVisible({ timeout: 30_000 });
	expect(await quantities.count()).toBeGreaterThan(1);
	await quantities.first().focus();
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'tall');
	const itemWidthBefore = (await page.locator('.item-row').first().boundingBox())?.width;

	await page.setViewportSize({ width: 500, height: 500 });
	const itemWidthAfter = (await page.locator('.item-row').first().boundingBox())?.width;
	expect(itemWidthAfter).not.toBe(itemWidthBefore);
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'tall');
	await quantities.nth(1).click();
	await expect(quantities.nth(1)).toBeFocused();
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'tall');

	await page.getByRole('button', { name: 'Open Main Menu' }).focus();
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'short');
});

test('semantic density steps type only at an allocated 900 by 700 container', async ({ page }) => {
	await openSettings(page, 1200, 900);

	const widthBelow = await densityValues(page, 899, 700);
	expect(widthBelow).toMatchObject({
		caption: '10px',
		label: '12px',
		body: '13px',
		title: '16px',
		display: '24px'
	});
	const heightBelow = await densityValues(page, 900, 699);
	expect(heightBelow).toMatchObject(widthBelow);
	const large = await densityValues(page, 900, 700);
	expect(large).toMatchObject({
		caption: '11px',
		label: '13px',
		body: '15px',
		title: '18px',
		display: '28px'
	});

	for (const values of [widthBelow, heightBelow, large]) {
		expect(values.control).toBeGreaterThanOrEqual(32);
		expect(values.control).toBeLessThanOrEqual(44);
		expect(values.smallControl).toBeGreaterThanOrEqual(24);
		expect(values.smallControl).toBeLessThanOrEqual(33);
		expect(values.space).toBeGreaterThanOrEqual(2);
		expect(values.space).toBeLessThanOrEqual(6);
		expect(values.focusRing).toBeGreaterThanOrEqual(2);
		expect(values.focusRing).toBeLessThanOrEqual(3);
	}
});

test('shared density keeps focused Pokemon Editor controls at 16px across budget canvases', async ({
	page
}) => {
	await page.setViewportSize({ width: 360, height: 640 });
	const editor = await openPokemonEditor(page);
	const shell = page.locator('.app-shell');
	const label = editor.locator('.nickname-panel .panel-title > span');

	for (const size of [
		{ width: 640, height: 360 },
		{ width: 640, height: 480 },
		{ width: 360, height: 640 },
		{ width: 393, height: 852 }
	]) {
		await page.setViewportSize(size);
		await expect(shell).toHaveCSS('--pksx-type-label', '12px');
		await editor.locator('#pokemon-editor-section-nickname').click();
		await expect(label).toHaveCSS('font-size', '12px');

		const input = editor.locator('#pokemon-editor-nickname');
		const select = editor.locator('#pokemon-editor-nature');
		for (const [section, control] of [
			['nickname', input],
			['nature', select]
		] as const) {
			await editor.locator(`#pokemon-editor-section-${section}`).click();
			await control.focus();
			expect(
				await control.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
			).toBeGreaterThanOrEqual(16);
		}
		await expectEditableFontFloor(editor);
		await editor.locator('#pokemon-editor-section-stats').click();
		const statInput = editor.locator('#pokemon-editor-hp-iv');
		await statInput.focus();
		const statInputBounds = await statInput.boundingBox();
		expect(statInputBounds?.width).toBeGreaterThanOrEqual(44);
		expect(statInputBounds?.height).toBeGreaterThanOrEqual(32);
		expect(statInputBounds?.height).toBeLessThanOrEqual(44);

		await editor.locator('#pokemon-editor-section-move-set').click();
		await editor.getByRole('combobox', { name: 'Move 1' }).click();
		const comboboxInput = editor.getByRole('searchbox', { name: 'Search moves for Move 1' });
		await expect(comboboxInput).toBeFocused();
		expect(
			await comboboxInput.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
		).toBeGreaterThanOrEqual(16);
		await expectEditableFontFloor(editor);
		await comboboxInput.press('Escape');
	}
});
