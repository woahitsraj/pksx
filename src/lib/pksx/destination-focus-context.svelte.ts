import { getContext, setContext } from 'svelte';
import type { Destination } from './destination-focus';

const destinationFocusIdentityContextKey = Symbol('pksx-destination-focus-identity');

export type DestinationFocusIdentityGetter = (destination: Destination) => string | null;

export function setDestinationFocusIdentityGetter(getIdentity: DestinationFocusIdentityGetter) {
	return setContext(destinationFocusIdentityContextKey, getIdentity);
}

export function getDestinationFocusIdentityGetter() {
	return getContext<DestinationFocusIdentityGetter | undefined>(destinationFocusIdentityContextKey);
}
