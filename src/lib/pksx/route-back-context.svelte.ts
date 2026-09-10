import { getContext, setContext } from 'svelte';

const routeBackContextKey = Symbol('pksx-route-back');

export type RouteBackRegistrar = (handler: () => boolean) => () => void;

export function setRouteBackRegistrar(register: RouteBackRegistrar) {
	return setContext(routeBackContextKey, register);
}

export function getRouteBackRegistrar() {
	return getContext<RouteBackRegistrar | undefined>(routeBackContextKey);
}
