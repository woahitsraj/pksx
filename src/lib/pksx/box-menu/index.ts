import type { BoxSourceType } from '$lib/pksx/storage-workbench';

export type BoxMenuCommandKey = 'export' | 'save-backup' | 'switch' | 'open-another' | 'close';

export type BoxMenuCommand = {
	key: BoxMenuCommandKey;
	label: string;
	availability: 'available' | 'unavailable';
	reason: string | null;
};

export function createBoxMenuCommands(input: {
	source: { type: BoxSourceType; label: string };
	workspaceReady: boolean;
	activeSavePane: boolean;
	paneCount: number;
}): BoxMenuCommand[] {
	const unavailable = (key: BoxMenuCommandKey, label: string, reason: string): BoxMenuCommand => ({
		key,
		label,
		availability: 'unavailable',
		reason
	});
	const available = (key: BoxMenuCommandKey, label: string): BoxMenuCommand => ({
		key,
		label,
		availability: 'available',
		reason: null
	});
	const activeFileReason = 'This is your active save file. Pick another one from Saves.';
	const workspaceReason = `${input.source.label} is still loading.`;
	const storage = input.source.type === 'pokemon-storage';

	return [
		storage
			? unavailable('export', 'Export', 'Pokemon Storage cannot be exported.')
			: input.workspaceReady
				? available('export', 'Export')
				: unavailable('export', 'Export', workspaceReason),
		storage
			? unavailable('save-backup', 'Save a backup', 'Pokemon Storage does not use Backups.')
			: input.workspaceReady
				? available('save-backup', 'Save a backup')
				: unavailable('save-backup', 'Save a backup', workspaceReason),
		input.activeSavePane
			? unavailable('switch', 'Switch', activeFileReason)
			: available('switch', 'Switch'),
		input.paneCount >= 2
			? unavailable('open-another', 'Open another collection', 'Two collections are already open.')
			: available('open-another', 'Open another collection'),
		input.activeSavePane
			? unavailable('close', 'Close', activeFileReason)
			: input.paneCount <= 1
				? unavailable('close', 'Close', 'Keep at least one collection open.')
				: available('close', 'Close')
	];
}
