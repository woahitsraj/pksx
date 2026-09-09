import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import DelayedSpinner from './DelayedSpinner.svelte';

let component: ReturnType<typeof mount> | null = null;
const props = $state({ active: false });

afterEach(async () => {
	if (component) await unmount(component);
	component = null;
	props.active = false;
	document.body.replaceChildren();
	vi.useRealTimers();
});

function renderSpinner() {
	component = mount(DelayedSpinner, { target: document.body, props });
	flushSync();
}

describe('DelayedSpinner', () => {
	test('stays hidden for operations that finish within 500 ms', () => {
		vi.useFakeTimers();
		props.active = true;
		renderSpinner();

		vi.advanceTimersByTime(499);
		flushSync();
		expect(document.querySelector('[role="status"]')?.textContent).toBe('');
		expect(document.querySelector('.spinner-graphic')).toBeNull();

		props.active = false;
		flushSync();
		vi.advanceTimersByTime(1);
		flushSync();
		expect(document.querySelector('[role="status"]')).toBeNull();
	});

	test('shows for longer operations and restarts the delay after completion', () => {
		vi.useFakeTimers();
		props.active = true;
		renderSpinner();

		vi.advanceTimersByTime(500);
		flushSync();
		const status = document.querySelector('[role="status"]');
		expect(status?.getAttribute('aria-busy')).toBe('false');
		expect(status?.textContent?.trim()).toBe('Loading');
		expect(document.querySelector('.spinner-graphic')).not.toBeNull();

		props.active = false;
		flushSync();
		expect(document.querySelector('[role="status"]')).toBeNull();

		props.active = true;
		flushSync();
		vi.advanceTimersByTime(499);
		flushSync();
		expect(document.querySelector('[role="status"]')?.textContent).toBe('');
		expect(document.querySelector('.spinner-graphic')).toBeNull();
		vi.advanceTimersByTime(1);
		flushSync();
		expect(document.querySelector('[role="status"]')).not.toBeNull();
	});
});
