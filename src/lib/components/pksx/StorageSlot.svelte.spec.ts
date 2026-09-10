import { mount, unmount } from 'svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import StorageSlot from './StorageSlot.svelte';
import type { SlotView } from './types';

const pokemonSlot: SlotView = {
	slot: 0,
	label: 'Pikachu',
	detail: 'Lv. 5',
	level: 5,
	experience: 125,
	experienceProjection: {
		minLevel: 1,
		maxLevel: 100,
		minExperience: 0,
		maxExperience: 1_000_000,
		currentLevelMinExperience: 125,
		nextLevelMinExperience: 216,
		currentLevelProgress: 0
	},
	speciesId: 25,
	form: 0,
	isEgg: false,
	spriteIdentity: {
		speciesId: 25,
		form: 0,
		isEgg: false,
		isShiny: false,
		displaySex: 'default'
	},
	kind: 'pokemon'
};

const emptySlot: SlotView = {
	slot: 1,
	label: 'Empty',
	detail: '',
	level: null,
	experience: null,
	experienceProjection: null,
	speciesId: null,
	form: null,
	isEgg: false,
	spriteIdentity: null,
	kind: 'empty'
};

let mounted: ReturnType<typeof mount> | null = null;

afterEach(() => {
	if (mounted) {
		unmount(mounted);
		mounted = null;
	}
	document.body.replaceChildren();
});

function renderSlot(props: {
	slot: SlotView;
	focused?: boolean;
	spriteUrl?: string | null;
	zone?: 'party' | 'box';
	onChooseSlot?: () => void;
}) {
	const host = document.createElement('div');
	host.style.width = '80px';
	host.style.height = '80px';
	document.body.append(host);

	const onFocusSlot = vi.fn();
	mounted = mount(StorageSlot, {
		target: host,
		props: {
			id: 'slot-under-test',
			slot: props.slot,
			zone: props.zone ?? 'box',
			focused: props.focused ?? false,
			dualType: true,
			style: '--slot-hue: 48; --slot-hue-2: 190',
			rowIndex: 1,
			colIndex: 1,
			spriteUrl: props.spriteUrl ?? null,
			onChooseSlot: props.onChooseSlot,
			onFocusSlot
		}
	});

	return {
		button: host.querySelector('button') as HTMLButtonElement,
		host,
		onFocusSlot
	};
}

describe('StorageSlot', () => {
	test('renders a sprite-first filled Slot with compact metadata', () => {
		const { button } = renderSlot({
			slot: pokemonSlot,
			focused: true,
			spriteUrl: '/sprites/pokemon/species/0025-form-00-sex-default-normal.png'
		});

		expect(button.classList.contains('pokemon')).toBe(true);
		expect(button.classList.contains('focused')).toBe(true);
		expect(button.classList.contains('dual-type')).toBe(true);
		expect(button.getAttribute('aria-selected')).toBe('true');
		expect(button.querySelector('.sprite-stage')).not.toBeNull();
		expect(button.querySelector('img.slot-sprite')?.getAttribute('src')).toBe(
			'/sprites/pokemon/species/0025-form-00-sex-default-normal.png'
		);
		expect(button.querySelector('.slot-label')?.textContent).toContain('Lv 5');
		expect(button.querySelector('.slot-label')?.textContent).toContain('Pikachu');
	});

	test('keeps missing sprite fallback inside the same sprite stage', () => {
		const { button } = renderSlot({ slot: pokemonSlot, spriteUrl: null });

		expect(button.querySelector('img.slot-sprite')).toBeNull();
		expect(button.querySelector('.sprite-stage .missing-sprite')).not.toBeNull();
		expect(button.querySelector('.slot-label')?.textContent).toContain('Pikachu');
	});

	test('keeps empty Slots focusable with a distinct quiet state', () => {
		const { button, onFocusSlot } = renderSlot({ slot: emptySlot, focused: true });

		button.focus();

		expect(button.classList.contains('empty')).toBe(true);
		expect(button.classList.contains('focused')).toBe(true);
		expect(button.getAttribute('role')).toBe('gridcell');
		expect(button.getAttribute('tabindex')).toBe('-1');
		expect(button.querySelector('.sprite-stage .empty-sprite')).not.toBeNull();
		expect(button.querySelector('.slot-label')?.textContent).toContain('Empty');
		expect(onFocusSlot).toHaveBeenCalledTimes(1);
	});

	test('reports pointer activation for an already focused Slot once', () => {
		const { button, onFocusSlot } = renderSlot({
			slot: pokemonSlot,
			focused: true
		});

		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		button.click();

		expect(onFocusSlot).toHaveBeenCalledTimes(1);
		button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(onFocusSlot).toHaveBeenCalledTimes(1);
	});

	test('reports pointer activation for an unfocused Slot', () => {
		const { button, onFocusSlot } = renderSlot({
			slot: pokemonSlot,
			focused: false
		});

		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		button.click();

		expect(onFocusSlot).toHaveBeenCalledTimes(1);
	});

	test('chooses a pending destination on pointer activation', () => {
		const onChooseSlot = vi.fn();
		const { button } = renderSlot({
			slot: pokemonSlot,
			focused: true,
			onChooseSlot
		});

		button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		button.click();

		expect(onChooseSlot).toHaveBeenCalledTimes(1);
	});
});
