import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

const toastHostContextKey = Symbol('pksx-toast-host');
const maxVisibleToasts = 3;
const successLifetime = 3_400;
const errorLifetime = 5_200;

export type ToastTone = 'success' | 'error';

export type ToastView = {
	id: string;
	tone: ToastTone;
	message: string;
};

export type ToastHost = {
	readonly toasts: readonly ToastView[];
	success(message: string): void;
	error(message: string): void;
	dismiss(id: string): void;
	dispose(): void;
};

export function createToastHost(): ToastHost {
	const toasts = $state<ToastView[]>([]);
	const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	let nextId = 1;

	function dismiss(id: string) {
		const index = toasts.findIndex((toast) => toast.id === id);
		if (index >= 0) toasts.splice(index, 1);
		const timer = timers.get(id);
		if (timer) clearTimeout(timer);
		timers.delete(id);
	}

	function deliver(tone: ToastTone, message: string) {
		while (toasts.length >= maxVisibleToasts) dismiss(toasts[0].id);
		const toast = { id: `toast-${nextId++}`, tone, message };
		toasts.push(toast);
		timers.set(
			toast.id,
			setTimeout(() => dismiss(toast.id), tone === 'error' ? errorLifetime : successLifetime)
		);
	}

	return {
		get toasts() {
			return toasts;
		},
		success(message) {
			deliver('success', message);
		},
		error(message) {
			deliver('error', message);
		},
		dismiss,
		dispose() {
			for (const id of [...timers.keys()]) dismiss(id);
		}
	};
}

export function setToastHost(host: ToastHost) {
	return setContext(toastHostContextKey, host);
}

export function getToastHost() {
	const host = getContext<ToastHost | undefined>(toastHostContextKey);
	if (!host) throw new Error('Toast host is unavailable.');
	return host;
}
