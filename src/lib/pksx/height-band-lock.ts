const editableSelector = [
	'input:not([type="button"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"]):not([type="radio"]):not([type="reset"]):not([type="submit"])',
	'textarea',
	'select',
	'[contenteditable]:not([contenteditable="false"])'
].join(',');

export function heightBandLock(node: HTMLElement) {
	const root = document.documentElement;

	const isEditable = (target: Element | null) => target?.matches(editableSelector) === true;
	const lock = (target: Element) => {
		const band = getComputedStyle(target).getPropertyValue('--pksx-height-band').trim();
		if (band === 'short' || band === 'tall') root.dataset.pksxHeightBandLock = band;
	};
	const handleFocusIn = (event: FocusEvent) => {
		if (event.target instanceof Element && isEditable(event.target)) lock(event.target);
	};
	const handleFocusOut = (event: FocusEvent) => {
		if (event.relatedTarget instanceof Element && isEditable(event.relatedTarget)) return;
		queueMicrotask(() => {
			if (isEditable(document.activeElement)) {
				lock(document.activeElement as Element);
				return;
			}
			delete root.dataset.pksxHeightBandLock;
		});
	};

	node.addEventListener('focusin', handleFocusIn);
	node.addEventListener('focusout', handleFocusOut);

	return () => {
		node.removeEventListener('focusin', handleFocusIn);
		node.removeEventListener('focusout', handleFocusOut);
		delete root.dataset.pksxHeightBandLock;
	};
}
