export const appChrome = $state({
	hasLoadedSave: false,
	carryActive: false
});

export function updateAppChrome(input: Partial<typeof appChrome>) {
	Object.assign(appChrome, input);
}
