export type DestinationFocus = {
	id: string;
	identity: string | null;
	fallbackIdentities: readonly string[];
};

export type Destination = 'boxes' | 'trainer' | 'bag' | 'saves' | 'settings';

export function isFocusableTarget(target: HTMLElement | null): target is HTMLElement {
	return Boolean(
		target &&
		!target.hidden &&
		!target.matches(':disabled') &&
		!target.closest('[inert]') &&
		target.getClientRects().length > 0 &&
		getComputedStyle(target).display !== 'none' &&
		getComputedStyle(target).visibility !== 'hidden'
	);
}

export function captureDestinationFocus(
	control: HTMLElement,
	id: string,
	previous: DestinationFocus | null = null
): DestinationFocus | null {
	if (control.closest('[data-destination-focus-memory="preserve"]')) return previous;
	return {
		id,
		identity: control.dataset.destinationFocus ?? null,
		fallbackIdentities: readFallbackIdentities(control)
	};
}

export function resolveDestinationFocus(route: HTMLElement, remembered: DestinationFocus) {
	if (!remembered.identity) {
		const target = document.getElementById(remembered.id);
		return target && route.contains(target) && isFocusableTarget(target) ? target : null;
	}

	for (const identity of [remembered.identity, ...remembered.fallbackIdentities]) {
		const target = Array.from(
			route.querySelectorAll<HTMLElement>(`[data-destination-focus="${CSS.escape(identity)}"]`)
		).find(isFocusableTarget);
		if (target) return target;
	}
	return null;
}

function readFallbackIdentities(control: HTMLElement) {
	const encoded = control.dataset.destinationFallbacks;
	if (!encoded) return [];
	try {
		const parsed: unknown = JSON.parse(encoded);
		return Array.isArray(parsed)
			? parsed.filter((identity): identity is string => typeof identity === 'string')
			: [];
	} catch {
		return [];
	}
}
