export type DestinationFocus = {
	id: string;
	identity: string | null;
	fallbackIdentities: readonly string[];
};

export function captureDestinationFocus(control: HTMLElement, id: string): DestinationFocus {
	return {
		id,
		identity: control.dataset.destinationFocus ?? null,
		fallbackIdentities: readFallbackIdentities(control)
	};
}

export function resolveDestinationFocus(
	route: HTMLElement,
	remembered: DestinationFocus,
	isFocusable: (target: HTMLElement | null) => target is HTMLElement
) {
	if (!remembered.identity) {
		const target = document.getElementById(remembered.id);
		return target && route.contains(target) && isFocusable(target) ? target : null;
	}

	for (const identity of [remembered.identity, ...remembered.fallbackIdentities]) {
		const target = Array.from(
			route.querySelectorAll<HTMLElement>(`[data-destination-focus="${CSS.escape(identity)}"]`)
		).find(isFocusable);
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
