export const appChrome = $state({
	hasLoadedSave: false,
	controllerInputActive: false,
	controllerStatus: null as string | null,
	carryActive: false
});

export function updateAppChrome(input: Partial<typeof appChrome>) {
	Object.assign(appChrome, input);
}
