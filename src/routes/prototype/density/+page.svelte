<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PrototypeSwitcher from '../box-first/PrototypeSwitcher.svelte';
	import BoxScreen from './BoxScreen.svelte';
	import CanvasFrame from './CanvasFrame.svelte';
	import EditorScreen from './EditorScreen.svelte';
	import SavesScreen from './SavesScreen.svelte';
	import './tokens.css';

	// Three token systems on the three approved compositions at every budget canvas, on /prototype/density?variant=.
	const variants = [
		{ key: 'A', name: 'Two ladders', note: 'Every token steps once, by Height Band' },
		{
			key: 'B',
			name: 'One fluid ladder',
			note: 'Body size tracks container height; all else derives'
		},
		{
			key: 'C',
			name: 'Fixed type, fluid room',
			note: 'Text never changes; spacing and controls scale'
		}
	];
	const canvases = [
		{ label: 'Landscape floor', raw: '640×360', width: 616, height: 336, band: 'short' },
		{ label: 'Landscape target', raw: '640×480', width: 640, height: 480, band: 'short' },
		{ label: 'Portrait floor', raw: '360×640', width: 360, height: 544, band: 'tall' },
		{ label: 'Portrait target', raw: '393×852', width: 393, height: 759, band: 'tall' },
		{ label: 'Below floor', raw: '568×320', width: 548, height: 300, band: 'short' },
		{ label: 'Tall landscape', raw: '1280×800', width: 1280, height: 800, band: 'tall', scale: 0.5 }
	] as const;
	const screens = [
		{ key: 'box', name: 'Boxes (box-first, Sidecar)', component: BoxScreen },
		{ key: 'editor', name: 'Pokemon Editor (IV / EV Takeover)', component: EditorScreen },
		{ key: 'saves', name: 'Saves', component: SavesScreen }
	];

	const param = (key: string) => (browser ? page.url.searchParams.get(key) : null);
	const initialVariant = param('variant')?.toUpperCase() ?? 'A';
	let current = $state(variants.some((v) => v.key === initialVariant) ? initialVariant : 'A');
	const live = $derived(screens.find((s) => s.key === param('live')));
	const only = $derived(param('screen'));
	const showControls = $derived(browser && param('controls') !== '0');

	function changeVariant(key: string) {
		current = key;
		const url = new URL(page.url);
		url.searchParams.set('variant', key);
		replaceState(resolve(`/prototype/density?${url.searchParams.toString()}`), page.state);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.target instanceof HTMLElement && event.target.matches('input, textarea')) return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
		event.preventDefault();
		const index = variants.findIndex((v) => v.key === current);
		const offset = event.key === 'ArrowLeft' ? -1 : 1;
		changeVariant(variants[(index + offset + variants.length) % variants.length].key);
	}
</script>

<svelte:head>
	<title>Density and type scale prototype · PKSX</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="wall" class:live={Boolean(live)}>
	{#if live}
		<div class="live-frame" data-canvas="live">
			<div class={['density-root', `variant-${current}`]}>
				<live.component />
			</div>
		</div>
	{:else}
		<p class="intro">
			Variant <strong>{current}</strong>. Add <code>?live=box|editor|saves</code> to fill the real
			viewport,
			<code>&screen=box</code> to show one row, <code>&controls=0</code> to hide the switcher.
		</p>
		{#each screens.filter((s) => !only || s.key === only) as screen (screen.key)}
			<section class="row">
				<h2>{screen.name}</h2>
				<div class="frames">
					{#each canvases as canvas (canvas.label)}
						<CanvasFrame {...canvas}>
							<div class={['density-root', `variant-${current}`]}>
								<screen.component />
							</div>
						</CanvasFrame>
					{/each}
				</div>
			</section>
		{/each}
	{/if}
	{#if dev && showControls}
		<PrototypeSwitcher {variants} {current} onChange={changeVariant} />
	{/if}
</main>

<style>
	:global(.app-shell:has(.wall)) {
		padding: 0;
		gap: 0;
	}

	.wall {
		position: fixed;
		z-index: 3000;
		inset: 0;
		overflow: auto;
		padding: 16px 16px 80px;
		background: #d9cfbc;
		color: #2a241c;
		font-family: var(--pksx-font-sans);
	}

	.wall.live {
		padding: 0;
		overflow: hidden;
	}

	.intro,
	h2 {
		margin: 0 0 8px;
		font-size: 13px;
	}

	code {
		font-family: var(--pksx-font-mono);
	}

	.row {
		margin-bottom: 24px;
	}

	.frames {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 16px;
		overflow-x: auto;
		padding-bottom: 8px;
	}

	/* Live mode: the viewport is the container and the band comes from raw height, as the axis model says. */
	.live-frame {
		container-type: size;
		width: 100%;
		height: 100dvh;
		--band: var(--pksx-height-band);
	}

	:global(.density-root) {
		width: 100%;
		height: 100%;
	}
</style>
