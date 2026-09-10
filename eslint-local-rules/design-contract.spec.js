import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from './design-contract.js';

function messages(source) {
	const linter = new Linter({ configType: 'flat' });
	return linter.verify(source, {
		languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
		plugins: { pksx: plugin },
		rules: {
			'pksx/no-responsive-classifier': 'error',
			'pksx/no-owned-token-writes': 'error'
		}
	});
}

describe('local responsive rules', () => {
	it.each([
		'const width = window.innerWidth;',
		"const width = window['screen'].width;",
		'const viewport = window.visualViewport; viewport.height;',
		'const viewport = globalThis; viewport.innerHeight;',
		'const { height } = screen;',
		'innerWidth > 640;',
		'const { screen: display } = window; display.width;',
		"matchMedia('(min-width: 40rem)')",
		'const root = document.documentElement; root.clientWidth;',
		'const { body: root } = document; root.clientHeight;',
		'document.body.getBoundingClientRect();',
		'element.clientWidth > element.clientHeight'
	])('[RESP-1] rejects %s', (source) => {
		expect(messages(source).some(({ message }) => message.includes('[RESP-1]'))).toBe(true);
	});

	it('[RESP-1] permits non-layout media and element coordinates', () => {
		expect(
			messages(
				"matchMedia('(prefers-reduced-motion: reduce)'); element.getBoundingClientRect(); element.clientWidth > 0;"
			)
		).toEqual([]);
	});

	it('[DENSITY-1] rejects runtime token writes', () => {
		expect(messages("element.style.setProperty('--pksx-type-body', '12px')")[0]?.message).toContain(
			'[DENSITY-1]'
		);
	});
});
