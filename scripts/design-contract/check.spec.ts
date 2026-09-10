import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDesignContract, checkRepository } from './check';

function names(path: string, source: string) {
	return checkDesignContract(path, source).map(({ contract, name }) => `${contract} ${name}`);
}

describe('responsive design contract', () => {
	it.each([
		'@media (width >= 40rem) { .x { display: grid } }',
		'@media not (orientation: portrait) { .x { display: grid } }',
		'@custom-media --wide (min-aspect-ratio: 1 / 1);',
		'@import "theme.css" (device-height > 400px);'
	])('[RESP-1] rejects layout media: %s', (source) => {
		expect(names('src/example.css', source)).toContain('RESP-1 viewport-query');
	});

	it('[RESP-1] permits the canonical authority, container queries, and accessibility media', () => {
		const source = `
			:root { --pksx-height-band: short; }
			@media (min-height: 560px) { :root { --pksx-height-band: tall; } }
			:root[data-pksx-height-band-lock='short'] { --pksx-height-band: short; }
			:root[data-pksx-height-band-lock='tall'] { --pksx-height-band: tall; }
			@container card (orientation: landscape) { .x { display: grid; } }
			@media (prefers-reduced-motion: reduce) { .x { transition: none; } }
		`;
		expect(names('src/routes/layout.css', source)).toEqual([]);
	});

	it('[RESP-1] requires the structurally exact Height Band authority', () => {
		expect(names('src/routes/layout.css', ':root { --pksx-height-band: short; }')).toContain(
			'RESP-1 viewport-query'
		);
		expect(
			names(
				'src/routes/layout.css',
				'@media (min-height: 560px) { :root { --pksx-height-band: tall; color: red; } }'
			)
		).toContain('RESP-1 viewport-query');
		expect(
			names('src/other.css', '@media (min-height: 560px) { :root { --pksx-height-band: tall; } }')
		).toEqual(expect.arrayContaining(['RESP-1 viewport-query', 'RESP-1 height-band-owner']));
		expect(
			names(
				'src/routes/layout.css',
				'@media (min-height: 560px) { :root { --pksx-height-band: tall; } } @media (min-height: 560px) { :root { --pksx-height-band: tall; } }'
			)
		).toContain('RESP-1 viewport-query');
		expect(names('src/routes/layout.css', '.x { --pksx-height-band: short; }')).toContain(
			'RESP-1 height-band-owner'
		);
	});

	it('[RESP-1] requires the Height Band authority file in the repository', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'pksx-design-contract-'));
		try {
			await mkdir(path.join(root, 'src'));
			await writeFile(path.join(root, 'src', 'component.css'), '.component { display: grid; }');
			expect(await checkRepository(root)).toEqual([
				expect.objectContaining({
					contract: 'RESP-1',
					name: 'viewport-query',
					path: 'src/routes/layout.css'
				})
			]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it.each([
		'sm:grid',
		'max-sm:hidden',
		'min-[700px]:flex',
		'portrait:block',
		'landscape:block',
		'[@media(width>1px)]:grid'
	])('[RESP-1] rejects viewport variant %s', (variant) =>
		expect(names('src/Example.svelte', `<div class="${variant}"></div>`)).toContain(
			'RESP-1 viewport-variant'
		)
	);

	it('[RESP-1] permits named Height Band and container variants', () => {
		expect(names('src/Example.svelte', '<div class="tall:grid @md:flex"></div>')).toEqual([]);
	});

	it('[RESP-1] rejects literal viewport variants in templates and CSS directives', () => {
		expect(
			names('src/Example.svelte', '<div class={`base ${active ? "md:grid" : ""}`}></div>')
		).toContain('RESP-1 viewport-variant');
		expect(names('src/example.css', '@custom-variant md (&:hover);')).toContain(
			'RESP-1 viewport-variant'
		);
		expect(names('src/example.css', '@custom-variant tall (&:hover);')).toContain(
			'RESP-1 viewport-variant'
		);
	});

	it('[RESP-1] classifies Svelte viewport bindings separately from CSS queries', () => {
		expect(
			names(
				'src/Example.svelte',
				'<script>let width;</script><svelte:window bind:innerWidth={width} />'
			)
		).toContain('RESP-1 viewport-classifier');
	});

	it('[RESP-1] rejects layout media on HTML stylesheet links', () => {
		expect(
			names(
				'src/app.html',
				'<link rel="stylesheet" media="(orientation: portrait)" href="app.css">'
			)
		).toContain('RESP-1 viewport-query');
	});
});

describe('density design contract', () => {
	it('[DENSITY-1] rejects raw type, descendant token writes, and unowned custom controls', () => {
		const source = `<button class="custom">Go</button><style>
			.wrapper .pksx-density { --pksx-type-body: 12px; }
			.custom { min-block-size: 37px; font-size: 13px; }
		</style>`;
		expect(names('src/Example.svelte', source)).toEqual(
			expect.arrayContaining([
				'DENSITY-1 token-owner',
				'DENSITY-1 type-token',
				'DENSITY-1 control-owner'
			])
		);
	});

	it('[DENSITY-1] distinguishes standard, small, and custom controls', () => {
		const source = `
			<button class="standard">Standard</button>
			<button class="small" data-pksx-control-category="small">Small</button>
			<button class="slot" data-pksx-control-category="slot">Slot</button>
			<style>
				.standard { block-size: var(--pksx-control-height); font-size: var(--pksx-type-label); }
				.small { min-height: var(--pksx-small-control-height); font-size: var(--pksx-type-caption); }
				.slot { height: 100%; font-size: var(--pksx-type-label); }
			</style>`;
		expect(names('src/Example.svelte', source)).toEqual([]);
	});

	it('[DENSITY-1] connects descendant class and ID selectors to the exact control', () => {
		const source = `<div class="form"><button id="compact">Go</button></div><style>
			.form #compact { height: var(--pksx-small-control-height); }
		</style>`;
		expect(names('src/Example.svelte', source)).toContain('DENSITY-1 control-owner');
	});

	it('[DENSITY-1] requires control ownership even without a block-size declaration', () => {
		expect(names('src/Example.svelte', '<button>Go</button>')).toContain('DENSITY-1 control-owner');
		expect(
			names(
				'src/Example.svelte',
				'<button class="action">Go</button><style>.action { padding: 1rem; }</style>'
			)
		).toContain('DENSITY-1 control-owner');
		expect(
			names(
				'src/Example.svelte',
				'<button class="action" data-pksx-control-category="small">Go</button><style>.action { height: 1px; }</style>'
			)
		).toContain('DENSITY-1 control-owner');
	});

	it('[DENSITY-1] rejects derived sizes, invalid categories, and inline ownership bypasses', () => {
		const source = `<button class="derived">Go</button>
			<button class="invalid" data-pksx-control-category="compact" style:height={'30px'}>No</button>
			<style>.derived { height: calc(var(--pksx-control-height) - 1px); }</style>`;
		expect(names('src/Example.svelte', source)).toEqual(
			expect.arrayContaining([
				'DENSITY-1 control-owner',
				'DENSITY-1 control-owner',
				'DENSITY-1 control-owner'
			])
		);
	});

	it('[DENSITY-1] enforces editable font ownership', () => {
		const rejected = names(
			'src/Example.svelte',
			'<input class="field" data-pksx-control-category="composition" /><style>.field { font-size: var(--pksx-type-label); }</style>'
		);
		expect(rejected).toContain('DENSITY-1 editable-floor');
		expect(
			names(
				'src/Example.svelte',
				'<input class="field" data-pksx-control-category="composition" /><style>.field { font: 700 var(--pksx-type-label) sans-serif; }</style>'
			)
		).toContain('DENSITY-1 editable-floor');
		expect(
			names(
				'src/Example.svelte',
				'<input class="field" data-pksx-control-category="composition" /><style>.field { font-size: var(--pksx-type-editable); }</style>'
			)
		).toEqual([]);
		expect(
			names(
				'src/Example.svelte',
				'<input class="field" data-pksx-control-category="composition" /><style>.field { font-size: max(16px, var(--pksx-type-editable, 16px)); }</style>'
			)
		).toEqual([]);
		expect(
			names(
				'src/Example.svelte',
				'<input class="field" data-pksx-control-category="composition" /><style>.field { font-size: max(15px, var(--pksx-type-editable, 15px)); }</style>'
			)
		).toEqual(expect.arrayContaining(['DENSITY-1 type-token', 'DENSITY-1 editable-floor']));
		expect(
			names(
				'src/Example.svelte',
				'<div class="form"><div id="editable" contenteditable data-pksx-control-category="composition"></div></div><style>.form #editable { font-size: var(--pksx-type-label); }</style>'
			)
		).toContain('DENSITY-1 editable-floor');
		expect(
			names(
				'src/Example.svelte',
				'<input data-pksx-control-category="composition" /><style>input { font: 12px / var(--pksx-type-editable) sans-serif !important; }</style>'
			)
		).toEqual(expect.arrayContaining(['DENSITY-1 type-token', 'DENSITY-1 editable-floor']));
	});
});
