import { flushSync, mount, unmount } from 'svelte';
import { afterEach, expect, test } from 'vitest';
import { createToastHost } from '$lib/pksx/toast/host.svelte';
import ToastRegion from './ToastRegion.svelte';

let component: ReturnType<typeof mount> | null = null;
let host: ReturnType<typeof createToastHost> | null = null;

afterEach(async () => {
	if (component) await unmount(component);
	host?.dispose();
	component = null;
	host = null;
	document.body.replaceChildren();
});

test('announces deliveries without taking focus or changing destination layout', () => {
	const destination = document.createElement('main');
	const invokingControl = document.createElement('button');
	invokingControl.textContent = 'Save';
	destination.append(invokingControl);
	document.body.append(destination);

	host = createToastHost();
	component = mount(ToastRegion, { target: document.body, props: { toasts: host.toasts } });
	invokingControl.focus();
	const before = destination.getBoundingClientRect();

	host.success('Boxes action completed.');
	host.error('Save File action failed.');
	flushSync();

	expect(document.querySelector('[role="status"]')?.textContent).toContain(
		'Boxes action completed.'
	);
	expect(document.querySelector('[role="alert"]')?.textContent).toContain(
		'Save File action failed.'
	);
	expect(document.querySelectorAll('.toast')).toHaveLength(2);
	expect(document.querySelector('.toast-region button')).toBeNull();
	expect(getComputedStyle(document.querySelector('.toast-region')!).pointerEvents).toBe('none');
	expect(document.activeElement).toBe(invokingControl);
	expect(destination.getBoundingClientRect()).toEqual(before);
});
