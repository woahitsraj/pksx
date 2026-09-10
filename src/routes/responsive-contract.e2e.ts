import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import path from 'node:path';

type Insets = { top: number; right: number; bottom: number; left: number };
type BudgetCase = {
	name: string;
	viewport: { width: number; height: number };
	insets: Insets;
	safe: { width: number; height: number };
	portrait: boolean;
	target: boolean;
};
type Destination = {
	name: 'Boxes' | 'Trainer' | 'Bag' | 'Saves' | 'Settings';
	path: string;
	key: 'boxes' | 'trainer' | 'bag' | 'saves' | 'settings';
	scrollOwner: string;
};

const emeraldFixturePath = path.resolve(
	'test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav'
);

const floorAndTargetCases: BudgetCase[] = [
	{
		name: 'landscape-floor',
		viewport: { width: 640, height: 360 },
		insets: { top: 12, right: 12, bottom: 12, left: 12 },
		safe: { width: 616, height: 336 },
		portrait: false,
		target: false
	},
	{
		name: 'landscape-target',
		viewport: { width: 640, height: 480 },
		insets: { top: 12, right: 0, bottom: 12, left: 0 },
		safe: { width: 640, height: 456 },
		portrait: false,
		target: true
	},
	{
		name: 'portrait-floor',
		viewport: { width: 360, height: 640 },
		insets: { top: 24, right: 0, bottom: 72, left: 0 },
		safe: { width: 360, height: 544 },
		portrait: true,
		target: false
	},
	{
		name: 'portrait-target',
		viewport: { width: 393, height: 852 },
		insets: { top: 34, right: 0, bottom: 59, left: 0 },
		safe: { width: 393, height: 759 },
		portrait: true,
		target: true
	}
];

const destinations: Destination[] = [
	{ name: 'Boxes', path: '/', key: 'boxes', scrollOwner: '.storage-workspace' },
	{
		name: 'Trainer',
		path: '/trainer',
		key: 'trainer',
		scrollOwner: '[data-testid="trainer-ledger-scrollport"]'
	},
	{
		name: 'Bag',
		path: '/bag',
		key: 'bag',
		scrollOwner: '[data-testid="bag-ledger-scrollport"]'
	},
	{ name: 'Saves', path: '/saves', key: 'saves', scrollOwner: '.saves-scrollport' },
	{ name: 'Settings', path: '/settings', key: 'settings', scrollOwner: '.settings-scrollport' }
];

const editableSelector =
	'input:not([type="button"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="radio"]):not([type="reset"]):not([type="submit"]), select, textarea, [contenteditable]:not([contenteditable="false" i])';

async function setSafeArea(page: Page, insets: Insets) {
	await page.evaluate(({ top, right, bottom, left }) => {
		const root = document.documentElement;
		root.style.setProperty('--safe-area-inset-top', `${top}px`);
		root.style.setProperty('--safe-area-inset-right', `${right}px`);
		root.style.setProperty('--safe-area-inset-bottom', `${bottom}px`);
		root.style.setProperty('--safe-area-inset-left', `${left}px`);
	}, insets);
}

async function openDestination(page: Page, destination: Destination, budget: BudgetCase) {
	await page.setViewportSize(budget.viewport);
	await page.goto(destination.path);
	await setSafeArea(page, budget.insets);
	const root = page.locator(`[data-destination-root="${destination.key}"]`);
	await expect(root, `[BUDGET-1] ${destination.name} must finish initialization`).toHaveAttribute(
		'data-initial-state',
		'ready',
		{ timeout: 30_000 }
	);
	return root;
}

async function importPublicSave(page: Page) {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/saves');
	const saves = page.locator('[data-destination-root="saves"]');
	await expect(saves).toHaveAttribute('data-initial-state', 'ready');
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(page.getByText('011020251345.sav imported and made active.')).toBeVisible({
		timeout: 30_000
	});
}

async function expectDestinationContract(
	page: Page,
	root: Locator,
	destination: Destination,
	budget: BudgetCase
) {
	const result = await page.evaluate(
		({ rootSelector, ownerSelector, expectedInsets, expectedSafe }) => {
			const route = document.querySelector<HTMLElement>(rootSelector);
			const shell = document.querySelector<HTMLElement>('.app-shell');
			const owner = route?.querySelector<HTMLElement>(ownerSelector);
			const focus = document.activeElement as HTMLElement | null;
			const workspaceFile = route?.querySelector<HTMLElement>('.workspace-file');
			const mainMenuOpener = document.querySelector<HTMLElement>('#main-menu-opener');
			const errors: string[] = [];
			const rect = (element: HTMLElement) => {
				const box = element.getBoundingClientRect();
				return {
					top: box.top,
					right: box.right,
					bottom: box.bottom,
					left: box.left,
					width: box.width,
					height: box.height
				};
			};
			if (!route || !shell || !owner || !focus) {
				return {
					errors: ['missing route, shell, scroll owner, or focused target'],
					focusIdentity: null,
					safe: null
				};
			}

			const safe = {
				top: expectedInsets.top,
				right: innerWidth - expectedInsets.right,
				bottom: innerHeight - expectedInsets.bottom,
				left: expectedInsets.left
			};
			const routeRect = rect(route);
			const focusRect = rect(focus);
			const ownerRect = rect(owner);
			const identity =
				focus.dataset.destinationFocus ??
				focus.id ??
				focus.getAttribute('aria-label') ??
				focus.tagName;
			const within = (
				target: ReturnType<typeof rect>,
				boundary: ReturnType<typeof rect> | typeof safe
			) =>
				target.left >= boundary.left - 1 &&
				target.top >= boundary.top - 1 &&
				target.right <= boundary.right + 1 &&
				target.bottom <= boundary.bottom + 1;

			if (innerWidth - expectedInsets.left - expectedInsets.right !== expectedSafe.width)
				errors.push('Safe Canvas width does not match the published case');
			if (innerHeight - expectedInsets.top - expectedInsets.bottom !== expectedSafe.height)
				errors.push('Safe Canvas height does not match the published case');
			if (!within(routeRect, safe))
				errors.push(`route ${JSON.stringify(routeRect)} escapes Safe Canvas`);
			if (!route.contains(focus)) errors.push(`focused target ${identity} is outside the route`);
			if (focusRect.width <= 0 || focusRect.height <= 0)
				errors.push(`focused target ${identity} has no rendered area ${JSON.stringify(focusRect)}`);
			if (!within(focusRect, routeRect))
				errors.push(`focused target ${identity} ${JSON.stringify(focusRect)} escapes route`);
			if (!within(focusRect, safe))
				errors.push(`focused target ${identity} ${JSON.stringify(focusRect)} escapes Safe Canvas`);
			if (!owner.contains(focus))
				errors.push(`scroll owner ${ownerSelector} does not contain focused target ${identity}`);
			if (!within(focusRect, ownerRect))
				errors.push(
					`focused target ${identity} ${JSON.stringify(focusRect)} is clipped by ${ownerSelector}`
				);
			if (!['auto', 'scroll'].includes(getComputedStyle(owner).overflowY))
				errors.push(`${ownerSelector} does not own vertical overflow`);
			if (workspaceFile && mainMenuOpener) {
				const fileRect = rect(workspaceFile);
				const openerRect = rect(mainMenuOpener);
				const overlaps =
					fileRect.left < openerRect.right &&
					fileRect.right > openerRect.left &&
					fileRect.top < openerRect.bottom &&
					fileRect.bottom > openerRect.top;
				if (overlaps)
					errors.push(
						`workspace filename ${JSON.stringify(fileRect)} overlaps Main Menu ${JSON.stringify(openerRect)}`
					);
			}
			if (document.documentElement.scrollWidth > innerWidth + 1)
				errors.push(`document width ${document.documentElement.scrollWidth} exceeds ${innerWidth}`);
			if (document.documentElement.scrollHeight > innerHeight + 1)
				errors.push(
					`document height ${document.documentElement.scrollHeight} exceeds ${innerHeight}`
				);
			if (
				document.body.scrollWidth > innerWidth + 1 ||
				document.body.scrollHeight > innerHeight + 1
			)
				errors.push(
					`body extent ${document.body.scrollWidth}x${document.body.scrollHeight} exceeds viewport`
				);
			if (shell.scrollWidth > shell.clientWidth + 1 || shell.scrollHeight > shell.clientHeight + 1)
				errors.push(
					`shell extent ${shell.scrollWidth}x${shell.scrollHeight} exceeds its client size`
				);

			const style = getComputedStyle(shell);
			for (const [edge, expected] of Object.entries(expectedInsets)) {
				const actual = parseFloat(style.getPropertyValue(`--pksx-safe-area-${edge}`));
				if (actual !== expected)
					errors.push(`resolved ${edge} inset is ${actual}px, expected ${expected}px`);
			}

			return { errors, focusIdentity: identity, safe };
		},
		{
			rootSelector: `[data-destination-root="${destination.key}"]`,
			ownerSelector: destination.scrollOwner,
			expectedInsets: budget.insets,
			expectedSafe: budget.safe
		}
	);

	expect(
		result.errors,
		`[BUDGET-1][FOCUS-1][FOCUS-4] ${destination.name} ${budget.name}, focus ${result.focusIdentity}`
	).toEqual([]);
}

async function expectEditableFontFloor(scope: Locator, context: string, focusEach: boolean) {
	const controls = scope.locator(editableSelector);
	const failures: string[] = [];
	for (let index = 0; index < (await controls.count()); index += 1) {
		const control = controls.nth(index);
		if (!(await control.isVisible())) continue;
		const inspect = async (state: string) => {
			const result = await control.evaluate((element) => ({
				identity:
					element.getAttribute('id') ??
					element.getAttribute('data-destination-focus') ??
					element.getAttribute('aria-label') ??
					element.tagName,
				fontSize: parseFloat(getComputedStyle(element).fontSize)
			}));
			if (result.fontSize < 16)
				failures.push(`${result.identity} is ${result.fontSize}px while ${state}`);
		};
		await inspect('rendered');
		if (focusEach && (await control.isEnabled())) {
			await control.focus();
			await inspect('focused for editing');
		}
	}
	expect(failures, `[DENSITY-1] ${context} editable controls`).toEqual([]);
}

async function attachTargetScreenshot(
	page: Page,
	testInfo: TestInfo,
	budget: BudgetCase,
	destination: Destination
) {
	if (testInfo.project.name !== 'chromium' || !budget.target) return;
	const fileName = `responsive-${budget.name}-${destination.key}.png`;
	const screenshotPath = testInfo.outputPath(fileName);
	await page.screenshot({ path: screenshotPath });
	await testInfo.attach(fileName, { path: screenshotPath, contentType: 'image/png' });
}

async function chooseMainMenu(page: Page, name: Destination['name'] | 'Backup Browser') {
	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: new RegExp(`^${name}`) })
		.click();
}

function skipNonChromium(testInfo: TestInfo) {
	test.skip(testInfo.project.name !== 'chromium', 'Chromium owns the complete responsive matrix.');
}

for (const budget of floorAndTargetCases) {
	test(`@responsive-matrix [BUDGET-1][FOCUS-1][FOCUS-4] ${budget.name} renders all five destinations`, async ({
		page
	}, testInfo) => {
		await importPublicSave(page);

		for (const destination of destinations) {
			await test.step(destination.name, async () => {
				const root = await openDestination(page, destination, budget);
				await expectDestinationContract(page, root, destination, budget);
				if (budget.portrait) {
					await expectEditableFontFloor(root, `${destination.name} ${budget.name}`, true);
					if (destination.key === 'bag') {
						const addItem = root.getByRole('button', { name: 'Add Item' }).first();
						await expect(addItem).toBeEnabled({ timeout: 30_000 });
						await addItem.click();
						await expectEditableFontFloor(root, `${destination.name} open Add Item`, true);
						await root.getByRole('button', { name: 'Cancel' }).click();
					}
				}
				await attachTargetScreenshot(page, testInfo, budget, destination);
			});
		}
	});
}

test('[BUDGET-1][NAV-1] below-floor canvas keeps every destination reachable', async ({
	page
}, testInfo) => {
	skipNonChromium(testInfo);
	await importPublicSave(page);
	const budget: BudgetCase = {
		name: 'below-floor',
		viewport: { width: 568, height: 320 },
		insets: { top: 10, right: 10, bottom: 10, left: 10 },
		safe: { width: 548, height: 300 },
		portrait: false,
		target: false
	};
	await openDestination(page, destinations[0], budget);

	for (const destination of destinations) {
		if (destination.key !== 'boxes') await chooseMainMenu(page, destination.name);
		const root = page.locator(`[data-destination-root="${destination.key}"]`);
		await expect(root).toHaveAttribute('data-initial-state', 'ready');
		await expect(root, `[BUDGET-1] ${destination.name} must render below the floor`).toBeVisible();
		await expect(
			page.getByText(/screen too small|unsupported viewport|rotate your device/i)
		).toHaveCount(0);
		const target = root.locator(':focus');
		await expect(
			target,
			`[FOCUS-1] ${destination.name} must retain a reachable target`
		).toHaveCount(1);
		expect(
			await target.evaluate((element) => element.getBoundingClientRect().width)
		).toBeGreaterThan(0);
	}
});

test('[RESP-1][RESP-2] 559/560 reflow preserves pane, focus, Carry, and Menu identity', async ({
	page
}, testInfo) => {
	skipNonChromium(testInfo);
	await importPublicSave(page);
	await page.setViewportSize({ width: 640, height: 559 });
	await page.goto('/');
	await setSafeArea(page, { top: 10, right: 10, bottom: 10, left: 10 });
	await expect(page.locator('[data-destination-root="boxes"]')).toHaveAttribute(
		'data-initial-state',
		'ready'
	);
	const panes = page.locator('.box-pane');
	const paneState = await panes.evaluateAll((elements) =>
		elements.map((element) => ({
			pane: (element as HTMLElement).dataset.paneId,
			source: (element as HTMLElement).dataset.sourceId,
			location: (element as HTMLElement).dataset.location
		}))
	);
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'short');
	await page.locator('#box-0-slot-0').click();
	await page.keyboard.press('Enter');
	await page
		.getByRole('dialog', { name: 'Slot actions' })
		.getByRole('button', { name: 'Move' })
		.click();
	await expect(page.locator('.carry-at-focus')).toHaveAttribute('aria-label', 'move ARON');

	await page.setViewportSize({ width: 640, height: 560 });
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'tall');
	expect(
		await panes.evaluateAll((elements) =>
			elements.map((element) => ({
				pane: (element as HTMLElement).dataset.paneId,
				source: (element as HTMLElement).dataset.sourceId,
				location: (element as HTMLElement).dataset.location
			}))
		)
	).toEqual(paneState);
	await expect(page.locator('#box-0-slot-0')).toBeFocused();
	await expect(page.locator('.carry-at-focus')).toHaveAttribute('aria-label', 'move ARON');
	await page.keyboard.press('Escape');
	await page.keyboard.press('Enter');
	const menu = page.getByRole('dialog', { name: 'Slot actions' });
	await expect(menu).toBeVisible();
	const command = menu.locator(':focus');
	const commandId = await command.getAttribute('id');

	await page.setViewportSize({ width: 640, height: 559 });
	await expect(page.locator('.app-shell')).toHaveCSS('--pksx-height-band', 'short');
	await expect(menu).toBeVisible();
	await expect(menu.locator(`#${commandId}`)).toBeFocused();
	expect(
		await panes.evaluateAll((elements) => elements.map((element) => element.dataset.paneId))
	).toEqual(paneState.map(({ pane }) => pane));
});

test('[DENSITY-2] landscape floor co-displays the collection control, 30 Slots, and detail rail', async ({
	page
}, testInfo) => {
	skipNonChromium(testInfo);
	await importPublicSave(page);
	const budget = floorAndTargetCases[0];
	await openDestination(page, destinations[0], budget);
	const result = await page.locator('[data-destination-root="boxes"]').evaluate((root) => {
		const safe = root.getBoundingClientRect();
		const control = root.querySelector<HTMLElement>('.source-chip')?.getBoundingClientRect();
		const rail = root.querySelector<HTMLElement>('.detail-rail')?.getBoundingClientRect();
		const slots = Array.from(root.querySelectorAll<HTMLElement>('.location-grid .slot')).map(
			(slot) => slot.getBoundingClientRect()
		);
		const visible = (rect: DOMRect | undefined) =>
			Boolean(
				rect &&
				rect.width > 0 &&
				rect.height > 0 &&
				rect.left >= safe.left - 1 &&
				rect.top >= safe.top - 1 &&
				rect.right <= safe.right + 1 &&
				rect.bottom <= safe.bottom + 1
			);
		return {
			slotCount: slots.length,
			slotWidths: slots.map(({ width }) => width),
			slotHeights: slots.map(({ height }) => height),
			controlVisible: visible(control),
			railVisible: visible(rail),
			allSlotsVisible: slots.every(visible)
		};
	});
	expect(result.slotCount, '[DENSITY-2] a Box is a 6 by 5 grid').toBe(30);
	expect(result.controlVisible, '[BUDGET-1] collection control must be co-visible').toBe(true);
	expect(result.railVisible, '[BUDGET-1] full detail rail must be co-visible').toBe(true);
	expect(result.allSlotsVisible, '[BUDGET-1] all 30 Slots must be co-visible').toBe(true);
	for (const size of [...result.slotWidths, ...result.slotHeights]) {
		expect(
			size,
			'[DENSITY-2] settled Slot size is 58 to 59px with 1px rounding tolerance'
		).toBeGreaterThanOrEqual(57);
		expect(
			size,
			'[DENSITY-2] settled Slot size is 58 to 59px with 1px rounding tolerance'
		).toBeLessThanOrEqual(60);
	}
});

test('[LARGE-1][SURFACE-1] large caps and representative surfaces use bounded geometry', async ({
	page
}, testInfo) => {
	skipNonChromium(testInfo);
	await importPublicSave(page);
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto('/');
	await setSafeArea(page, { top: 0, right: 0, bottom: 0, left: 0 });
	await expect(page.locator('[data-destination-root="boxes"]')).toHaveAttribute(
		'data-initial-state',
		'ready'
	);
	let boxes = await page.evaluate(() => {
		const workspace = document
			.querySelector<HTMLElement>('.storage-workspace')!
			.getBoundingClientRect();
		const pane = document.querySelector<HTMLElement>('.box-pane')!.getBoundingClientRect();
		const rail = document.querySelector<HTMLElement>('.detail-rail')!.getBoundingClientRect();
		return {
			paneCount: document.querySelectorAll('.box-pane').length,
			paneWidth: pane.width,
			railWidth: rail.width,
			leftSpend: pane.left - workspace.left,
			rightSpend: workspace.right - rail.right
		};
	});
	expect(boxes.paneCount, '[LARGE-1] a large canvas must not open another pane').toBe(1);
	expect(boxes.paneWidth).toBeLessThanOrEqual(800);
	expect(boxes.railWidth).toBeLessThanOrEqual(260);
	expect(
		Math.abs(boxes.leftSpend - boxes.rightSpend),
		'[LARGE-1] Boxes composition must be centered'
	).toBeLessThanOrEqual(1);

	await page.getByRole('button', { name: /Open Box Menu for/ }).click();
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Open another' })
		.click();
	await page
		.getByRole('dialog', { name: 'Open another collection' })
		.getByRole('button', { name: /Pokemon Storage/ })
		.click();
	await expect(page.locator('.box-pane')).toHaveCount(2);
	boxes = await page.evaluate(() => {
		const workspace = document
			.querySelector<HTMLElement>('.storage-workspace')!
			.getBoundingClientRect();
		const pane = document.querySelector<HTMLElement>('.box-pane')!.getBoundingClientRect();
		const rail = document.querySelector<HTMLElement>('.detail-rail')!.getBoundingClientRect();
		return {
			paneCount: document.querySelectorAll('.box-pane').length,
			paneWidth: pane.width,
			railWidth: rail.width,
			leftSpend: pane.left - workspace.left,
			rightSpend: workspace.right - rail.right
		};
	});
	expect(boxes.paneWidth).toBeLessThanOrEqual(640);
	expect(boxes.railWidth).toBeLessThanOrEqual(260);

	await page.setViewportSize({ width: 1920, height: 1080 });
	await page.goto('/saves');
	await setSafeArea(page, { top: 0, right: 0, bottom: 0, left: 0 });
	await expect(page.locator('[data-destination-root="saves"]')).toHaveAttribute(
		'data-initial-state',
		'ready'
	);
	const saves = await page.evaluate(() => {
		const density = document.querySelector<HTMLElement>('.saves-density')!.getBoundingClientRect();
		const route = document
			.querySelector<HTMLElement>('[data-destination-root="saves"]')!
			.getBoundingClientRect();
		const grid = document.querySelector<HTMLElement>('.saves-grid')!;
		return {
			width: density.width,
			top: density.top,
			routeTop: route.top,
			columns: getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length
		};
	});
	expect(saves.width).toBeLessThanOrEqual(1200);
	expect(saves.top, '[LARGE-1] Saves stays top-aligned').toBe(saves.routeTop);
	expect(saves.columns).toBe(4);

	await page.setViewportSize({ width: 1280, height: 800 });
	await setSafeArea(page, { top: 0, right: 0, bottom: 0, left: 0 });
	await chooseMainMenu(page, 'Backup Browser');
	const browserBounds = await page.getByRole('dialog', { name: 'Backup Browser' }).boundingBox();
	expect(browserBounds?.width).toBeLessThanOrEqual(760);
	expect(browserBounds?.height).toBeLessThanOrEqual(560);
});

test('[DENSITY-1][SURFACE-1] portrait Pokemon Editor audits focused and open combobox controls', async ({
	page
}, testInfo) => {
	skipNonChromium(testInfo);
	await importPublicSave(page);
	await page.goto('/');
	await expect(page.locator('#box-0-slot-0')).toContainText('ARON', { timeout: 30_000 });
	await page.locator('#box-grid').focus();
	await page.keyboard.press('Enter');
	await page.keyboard.press('Enter');
	const editor = page.getByRole('dialog', { name: 'ARON' });
	await expect(editor.locator('#pokemon-editor-species')).toBeEnabled({ timeout: 30_000 });
	const editorBounds = await editor.boundingBox();
	expect(editorBounds?.width).toBeLessThanOrEqual(760);
	expect(editorBounds?.height).toBeLessThanOrEqual(560);

	for (const budget of floorAndTargetCases.filter(({ portrait }) => portrait)) {
		await page.setViewportSize(budget.viewport);
		await setSafeArea(page, budget.insets);
		await expectEditableFontFloor(editor, `Pokemon Editor ${budget.name}`, true);
		await editor.locator('#pokemon-editor-section-move-set').click();
		await editor.getByRole('combobox', { name: 'Move 1' }).click();
		const search = editor.getByRole('searchbox', { name: 'Search moves for Move 1' });
		await expect(search).toBeFocused();
		await expectEditableFontFloor(editor, `Pokemon Editor open combobox ${budget.name}`, true);
		await search.press('Escape');
	}
});

test('[SURFACE-1][SURFACE-2] Menu and Backup Browser follow Safe Canvas edges without shell growth', async ({
	page
}, testInfo) => {
	skipNonChromium(testInfo);
	await importPublicSave(page);
	for (const budget of floorAndTargetCases.filter(({ target }) => !target)) {
		await openDestination(page, destinations[0], budget);
		const before = await page.locator('.app-shell').evaluate((shell) => ({
			width: shell.scrollWidth,
			height: shell.scrollHeight
		}));
		await page.locator('#box-0-slot-0').click();
		await page.keyboard.press('Enter');
		const panel = page.getByRole('dialog', { name: 'Slot actions' });
		await expect(panel).toBeVisible();
		const geometry = await page.locator('.edge-menu-layer').evaluate((layer) => {
			const layerBox = layer.getBoundingClientRect();
			const panelBox = layer.querySelector<HTMLElement>('[role="dialog"]')!.getBoundingClientRect();
			return {
				layer: {
					top: layerBox.top,
					right: layerBox.right,
					bottom: layerBox.bottom,
					left: layerBox.left
				},
				panel: {
					top: panelBox.top,
					right: panelBox.right,
					bottom: panelBox.bottom,
					left: panelBox.left
				}
			};
		});
		expect(geometry.layer, `[SURFACE-1] ${budget.name} Menu layer`).toEqual({
			top: budget.insets.top,
			right: budget.viewport.width - budget.insets.right,
			bottom: budget.viewport.height - budget.insets.bottom,
			left: budget.insets.left
		});
		if (budget.portrait) {
			expect(geometry.panel.left).toBe(geometry.layer.left);
			expect(geometry.panel.right).toBe(geometry.layer.right);
			expect(geometry.panel.bottom).toBe(geometry.layer.bottom);
		} else {
			expect(geometry.panel.top).toBe(geometry.layer.top);
			expect(geometry.panel.right).toBe(geometry.layer.right);
			expect(geometry.panel.bottom).toBe(geometry.layer.bottom);
		}
		expect(
			await page.locator('.app-shell').evaluate((shell) => ({
				width: shell.scrollWidth,
				height: shell.scrollHeight
			}))
		).toEqual(before);
		await page.keyboard.press('Escape');
	}

	const portraitFloor = floorAndTargetCases[2];
	await openDestination(page, destinations[3], portraitFloor);
	await chooseMainMenu(page, 'Backup Browser');
	const browser = page.getByRole('dialog', { name: 'Backup Browser' });
	await expect(browser).toBeVisible();
	const bounds = await browser.boundingBox();
	expect(bounds).toMatchObject({
		x: portraitFloor.insets.left,
		y: portraitFloor.insets.top,
		width: portraitFloor.safe.width,
		height: portraitFloor.safe.height
	});
});
