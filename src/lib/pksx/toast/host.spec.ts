import { afterEach, describe, expect, test, vi } from 'vitest';
import { createToastHost } from './host.svelte';

afterEach(() => {
	vi.useRealTimers();
});

describe('Toast host', () => {
	test('keeps the newest three deliveries in order', () => {
		vi.useFakeTimers();
		const host = createToastHost();

		host.success('First');
		host.error('Second');
		host.success('Third');
		host.error('Fourth');

		expect(host.toasts.map(({ tone, message }) => ({ tone, message }))).toEqual([
			{ tone: 'error', message: 'Second' },
			{ tone: 'success', message: 'Third' },
			{ tone: 'error', message: 'Fourth' }
		]);
	});

	test('dismisses success and error deliveries after their normal lifetimes', () => {
		vi.useFakeTimers();
		const host = createToastHost();

		host.success('Saved');
		host.error('Could not save');
		vi.advanceTimersByTime(3_399);
		expect(host.toasts.map((toast) => toast.message)).toEqual(['Saved', 'Could not save']);

		vi.advanceTimersByTime(1);
		expect(host.toasts.map((toast) => toast.message)).toEqual(['Could not save']);

		vi.advanceTimersByTime(1_800);
		expect(host.toasts).toEqual([]);
	});
});
