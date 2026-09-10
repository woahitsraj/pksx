import { describe, expect, test } from 'vitest';
import { readGamepadKeys } from './controller-input';

describe('readGamepadKeys', () => {
	test('maps standard buttons and axes to keyboard navigation', () => {
		const gamepad = createGamepad({
			axes: [0.8, -0.8],
			pressedButtons: [0, 1, 2, 3, 4]
		});

		expect(readGamepadKeys(gamepad)).toEqual([
			'ArrowUp',
			'ArrowRight',
			'Enter',
			'Escape',
			'x',
			'y',
			'PageUp'
		]);
	});

	test('maps a non-standard hat axis', () => {
		const gamepad = createGamepad({
			axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, -0.714],
			mapping: ''
		});

		expect(readGamepadKeys(gamepad)).toEqual(['ArrowUp', 'ArrowRight']);
	});
});

function createGamepad({
	axes,
	pressedButtons = [],
	mapping = 'standard'
}: {
	axes: number[];
	pressedButtons?: number[];
	mapping?: GamepadMappingType | '';
}) {
	return {
		axes,
		mapping,
		buttons: Array.from({ length: 16 }, (_, index) => ({
			pressed: pressedButtons.includes(index),
			touched: pressedButtons.includes(index),
			value: pressedButtons.includes(index) ? 1 : 0
		}))
	} as unknown as Gamepad;
}
