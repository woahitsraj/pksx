import { Linter } from 'eslint';
import { describe, expect, it } from 'vitest';
import plugin from './design-contract.js';

function messages(source, filename = 'src/example.js') {
	const linter = new Linter({ configType: 'flat' });
	return linter.verify(
		source,
		{
			files: ['**/*.{js,ts}'],
			languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
			plugins: { pksx: plugin },
			rules: {
				'pksx/no-responsive-classifier': 'error',
				'pksx/no-owned-token-writes': 'error'
			}
		},
		{ filename }
	);
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
		'const { clientWidth } = document.documentElement; if (clientWidth > 640) useWideLayout();',
		'let width; ({ clientWidth: width } = document.documentElement); if (width > 640) useWideLayout();',
		'const { body: root } = document; root.clientHeight;',
		'document.body.getBoundingClientRect();',
		'element.clientWidth > element.clientHeight'
	])('[RESP-1] rejects %s', (source) => {
		expect(messages(source).some(({ message }) => message.includes('[RESP-1]'))).toBe(true);
	});

	it('[RESP-1] permits non-layout media and element coordinates', () => {
		expect(
			messages(
				'const query = `(prefers-reduced-motion: reduce)`; matchMedia(query); element.getBoundingClientRect(); element.clientWidth > 0;'
			)
		).toEqual([]);
	});

	it('[DENSITY-1] rejects runtime token writes', () => {
		expect(messages("element.style.setProperty('--pksx-type-body', '12px')")[0]?.message).toContain(
			'[DENSITY-1]'
		);
		expect(
			messages("const token = '--pksx-type-body'; element.style.setProperty(token, '12px')")[0]
				?.message
		).toContain('[DENSITY-1]');
		expect(
			messages("const token = `--pksx-type-body`; element.style.setProperty(token, '12px')")[0]
				?.message
		).toContain('[DENSITY-1]');
		expect(
			messages("let token; token = '--pksx-type-body'; element.style.setProperty(token, '12px')")[0]
				?.message
		).toContain('[DENSITY-1]');
	});

	it('[RESP-1] reserves runtime Height Band writes for the focus lock owner', () => {
		expect(
			messages("document.documentElement.style.setProperty('--pksx-height-band', 'tall')")[0]
				?.message
		).toContain('[RESP-1]');
		expect(
			messages(
				"const style = document.documentElement.style; const token = `--pksx-height-band`; style.setProperty(token, 'tall')"
			)[0]?.message
		).toContain('[RESP-1]');
		expect(
			messages("document.documentElement.dataset.pksxHeightBandLock = 'tall'")[0]?.message
		).toContain('[RESP-1]');
		expect(
			messages(
				"const { documentElement: root } = document; const { dataset } = root; const key = `pksxHeightBandLock`; dataset[key] = 'tall'"
			)[0]?.message
		).toContain('[RESP-1]');
		expect(
			messages('delete document.documentElement.dataset.pksxHeightBandLock')[0]?.message
		).toContain('[RESP-1]');

		const owner = `const root = document.documentElement;
			const band = getComputedStyle(target).getPropertyValue('--pksx-height-band').trim();
			root.dataset.pksxHeightBandLock = band;
			delete root.dataset.pksxHeightBandLock;`;
		expect(messages(owner, 'src/lib/pksx/height-band-lock.ts')).toEqual([]);
		expect(
			messages(
				"document.documentElement.dataset.pksxHeightBandLock = 'tall'",
				'src/lib/pksx/height-band-lock.ts'
			)[0]?.message
		).toContain('[RESP-1]');
	});
});
