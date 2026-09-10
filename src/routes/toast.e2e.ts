import { expect, test } from '@playwright/test';
import path from 'node:path';

const emeraldFixturePath = path.resolve(
	'test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav'
);

test('one root Toast host delivers across Saves and Boxes without moving focus or layout', async ({
	page
}) => {
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

	const notifications = page.getByRole('region', { name: 'Notifications' });
	await expect(notifications).toHaveCount(1);
	const announcements = notifications.getByRole('status');
	await expect(announcements).toHaveCount(1);
	await expect(announcements).toBeEmpty();
	await page.getByLabel('Import Save File').setInputFiles(emeraldFixturePath);
	await expect(announcements.filter({ hasText: 'imported and made active' })).toBeVisible({
		timeout: 15_000
	});
	await expect(page.getByRole('grid', { name: 'Saves collections' })).toBeFocused();

	await page.getByRole('button', { name: 'Open Main Menu' }).click();
	await page
		.getByRole('dialog', { name: 'Main Menu' })
		.getByRole('button', { name: /^Boxes/ })
		.click();
	await expect(page.locator('[data-destination-root="boxes"]')).toHaveAttribute(
		'data-initial-state',
		'ready',
		{ timeout: 15_000 }
	);
	const invokingSlot = page.locator('#box-0-slot-0');
	await expect(invokingSlot).toBeFocused();
	const before = await page.locator('.app-shell').evaluate((shell) => ({
		width: shell.getBoundingClientRect().width,
		height: shell.getBoundingClientRect().height,
		scrollWidth: shell.scrollWidth,
		scrollHeight: shell.scrollHeight
	}));

	await page.keyboard.press('x');
	await page
		.getByRole('dialog', { name: 'Box Menu' })
		.getByRole('button', { name: 'Save a backup' })
		.click();
	await expect(announcements.filter({ hasText: 'Backup saved for' })).toBeVisible();
	await expect(notifications).toHaveCount(1);
	await expect(invokingSlot).toBeFocused();
	expect(
		await page.locator('.app-shell').evaluate((shell) => ({
			width: shell.getBoundingClientRect().width,
			height: shell.getBoundingClientRect().height,
			scrollWidth: shell.scrollWidth,
			scrollHeight: shell.scrollHeight
		}))
	).toEqual(before);
	await expect(page.locator('.toast-success').filter({ hasText: 'Backup saved for' })).toHaveCount(
		0,
		{ timeout: 5_000 }
	);
	await expect(invokingSlot).toBeFocused();
	expect(
		await page.locator('.app-shell').evaluate((shell) => ({
			width: shell.getBoundingClientRect().width,
			height: shell.getBoundingClientRect().height,
			scrollWidth: shell.scrollWidth,
			scrollHeight: shell.scrollHeight
		}))
	).toEqual(before);
});
