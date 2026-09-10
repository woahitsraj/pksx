import type { SaveSummary } from '$lib/engine';

export type AppChromeRoute = 'boxes' | 'save-file' | 'saves';

export const appChrome = $state({
	route: 'boxes' as AppChromeRoute,
	saveSummary: null as SaveSummary | null,
	boxCount: 0,
	activeBox: 0,
	fileName: null as string | null,
	busy: false,
	hasLoadedSave: false,
	controllerInputActive: false,
	controllerStatus: null as string | null,
	importSave: null as ((file: File) => void) | null,
	exportSave: null as (() => void) | null
});

export function updateAppChrome(input: Partial<typeof appChrome>) {
	Object.assign(appChrome, input);
}
