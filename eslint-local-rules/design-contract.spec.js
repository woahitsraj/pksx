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
		'const viewport = globalThis.window; if (viewport.innerWidth > 640) useWideLayout();',
		'const doc = globalThis.document; if (doc.documentElement.clientWidth > 640) useWideLayout();',
		'const { document: doc } = window; const { body: root } = doc; root.clientHeight;',
		'const viewport = window; { const viewport = element; } viewport.innerWidth;',
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

	it('resolves strings and browser aliases in their lexical scope', () => {
		expect(
			messages(`const query = '(min-width: 640px)';
			{ const query = '(prefers-reduced-motion: reduce)'; matchMedia(query); }
			matchMedia(query);`).map(({ message }) => message)
		).toEqual([expect.stringContaining('[RESP-1]')]);
		expect(
			messages(`const token = '--pksx-type-body';
			{ const token = '--local'; element.style.setProperty(token, '12px'); }
			element.style.setProperty(token, '12px');`).map(({ message }) => message)
		).toEqual([expect.stringContaining('[DENSITY-1]')]);
		expect(
			messages(`const viewport = window;
			{ const viewport = element; viewport.clientWidth; }
			function measure(window, document, innerWidth) {
				return window.innerWidth + document.body.clientWidth + innerWidth;
			}
			const innerHeight = 'local'; useValue(innerHeight);`)
		).toEqual([]);
	});

	it('resolves later initializer definitions without crossing lexical bindings', () => {
		for (const source of [
			'function classify() { return viewport.innerWidth > 640; } const viewport = globalThis.window;',
			"function force() { root.setAttribute('data-pksx-height-band-lock', 'tall'); } const root = document.documentElement;",
			"function force() { root.dataset.pksxHeightBandLock = 'tall'; } const { documentElement: root } = doc; const doc = document;"
		])
			expect(messages(source)[0]?.message).toContain('[RESP-1]');
		expect(
			messages(`function inspect() { return viewport.clientWidth; } const viewport = element;
			function animate() { matchMedia(query); } const query = '(prefers-reduced-motion: reduce)';
			function local(window) { return window.innerWidth; }
			function cyclic() { return first.innerWidth; } const first = second; const second = first;`)
		).toEqual([]);
	});

	it('resolves a single unconditional alias assignment in its declaring scope', () => {
		for (const source of [
			'function classify() { return viewport.innerWidth > 640; } let viewport; viewport = globalThis.window;',
			"function force() { root.setAttribute('data-pksx-height-band-lock', 'tall'); } let root; root = document.documentElement;",
			'let viewport; function classify() { return viewport.innerWidth > 640; } viewport = globalThis.window;',
			"function setup() { let root; function force() { root.dataset.pksxHeightBandLock = 'tall'; } root = document.documentElement; }"
		])
			expect(messages(source)[0]?.message).toContain('[RESP-1]');
		expect(
			messages(`function inspect() { return viewport.innerWidth; } let viewport; viewport = element;
			function animate() { matchMedia(query); } let query; query = '(prefers-reduced-motion: reduce)';
			function local(viewport) { return viewport.innerWidth; }
			function cyclic() { return first.innerWidth; } let first, second; first = second; second = first;`)
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

		for (const source of [
			"document.documentElement.setAttribute('data-pksx-height-band-lock', 'tall');",
			"document.documentElement.style.cssText = '--pksx-height-band:tall';",
			"const doc = document; doc.documentElement.dataset.pksxHeightBandLock = 'tall';",
			"const doc = globalThis.document; const root = doc.documentElement; root.setAttribute('style', '--pksx-height-band: tall');",
			"const { documentElement: root } = window.document; root.removeAttribute('data-pksx-height-band-lock');",
			"const root = document.documentElement; { const root = element; } root.dataset.pksxHeightBandLock = 'tall';",
			"const root = document.scrollingElement; if (root) root.setAttribute('data-pksx-height-band-lock', 'tall');",
			"const root = document.scrollingElement; if (root) root.dataset.pksxHeightBandLock = 'tall';"
		])
			expect(messages(source)[0]?.message).toContain('[RESP-1]');
		expect(
			messages(`const doc = document; { const doc = element; doc.documentElement.dataset.pksxHeightBandLock = 'local'; }
			element.style.cssText = 'color: red; left: 12px';
			element.setAttribute('style', 'top: 24px');
			element.style.setProperty('--local', '12px');`)
		).toEqual([]);

		const owner = `const root = document.documentElement;
			const band = getComputedStyle(target).getPropertyValue('--pksx-height-band').trim();
			root.dataset.pksxHeightBandLock = band;
			delete root.dataset.pksxHeightBandLock;`;
		expect(messages(owner, 'src/lib/pksx/height-band-lock.ts')).toEqual([]);
		expect(
			messages(
				"const band = 'tall'; document.documentElement.dataset.pksxHeightBandLock = band;",
				'src/lib/pksx/height-band-lock.ts'
			)[0]?.message
		).toContain('[RESP-1]');
		expect(
			messages(
				"document.documentElement.dataset.pksxHeightBandLock = 'tall'",
				'src/lib/pksx/height-band-lock.ts'
			)[0]?.message
		).toContain('[RESP-1]');
	});
});
