<script lang="ts">
	import { browser, dev } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BookendsVariant from './BookendsVariant.svelte';
	import PrototypeSwitcher from './PrototypeSwitcher.svelte';
	import SidecarVariant from './SidecarVariant.svelte';

	// Single-pane and two-pane Box modes, switchable with ?variant=, on /prototype/box-first.
	const variants = [
		{ key: 'A', name: 'Single pane', note: 'One reusable Box pane with details beside it' },
		{ key: 'B', name: 'Two panes', note: 'Two reusable Box panes with transfer controls' }
	];
	const initialVariant = browser
		? (page.url.searchParams.get('variant')?.toUpperCase() ?? 'A')
		: 'A';
	let current = $state(
		variants.some((variant) => variant.key === initialVariant) ? initialVariant : 'A'
	);
	const showControls = $derived(browser && page.url.searchParams.get('controls') !== '0');

	function changeVariant(key: string) {
		current = key;
		const controls = page.url.searchParams.get('controls') === '0' ? '&controls=0' : '';
		replaceState(resolve(`/prototype/box-first?variant=${key}${controls}`), page.state);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (
			event.target instanceof HTMLElement &&
			event.target.matches('input, textarea, [contenteditable="true"]')
		)
			return;
		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

		event.preventDefault();
		const index = variants.findIndex((variant) => variant.key === current);
		const offset = event.key === 'ArrowLeft' ? -1 : 1;
		changeVariant(variants[(index + offset + variants.length) % variants.length].key);
	}
</script>

<svelte:head>
	<title>Box-first surface prototype · PKSX</title>
	<meta
		name="description"
		content="Throwaway prototype comparing single-pane and two-pane Box modes."
	/>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<main class="prototype-canvas">
	<div class="prototype-stage">
		{#if current === 'A'}
			<SidecarVariant />
		{:else if current === 'B'}
			<BookendsVariant />
		{/if}
	</div>
	<button class="main-menu-summon" type="button" aria-label="Open Main Menu">
		<span></span><span></span><span></span>
	</button>
	{#if dev && showControls}
		<PrototypeSwitcher {variants} {current} onChange={changeVariant} />
	{/if}
</main>

<style>
	:global(.app-shell:has(.prototype-canvas)) {
		padding: 0;
		gap: 0;
	}

	.prototype-canvas {
		position: fixed;
		z-index: 3000;
		inset: 0;
		box-sizing: border-box;
		padding: max(4px, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))
			max(4px, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))
			max(4px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))
			max(4px, var(--safe-area-inset-left, env(safe-area-inset-left, 0px)));
		overflow: hidden;
		background:
			radial-gradient(circle at 18% 8%, rgba(255, 255, 255, 0.6), transparent 38%),
			repeating-linear-gradient(45deg, transparent 0 6px, rgba(70, 50, 30, 0.012) 6px 7px),
			var(--paper);
		color: var(--ink);
		font-family: var(--pksx-font-sans);
	}

	.prototype-stage {
		container-name: stage;
		container-type: size;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}

	.main-menu-summon {
		position: fixed;
		z-index: 3050;
		top: max(7px, var(--safe-area-inset-top, env(safe-area-inset-top, 0px)));
		right: max(7px, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)));
		width: 26px;
		height: 26px;
		display: grid;
		place-content: center;
		gap: 2px;
		padding: 0;
		border: 1px solid var(--rule-hi);
		border-radius: 50%;
		background: color-mix(in srgb, var(--paper-hi), transparent 6%);
		box-shadow: var(--shadow-sm);
		cursor: pointer;
	}

	.main-menu-summon span {
		width: 10px;
		height: 1.5px;
		border-radius: 1px;
		background: var(--ink);
	}

	.main-menu-summon:focus-visible {
		outline: 2px solid var(--rust);
		outline-offset: 2px;
	}

	@container style(--pksx-height-band: tall) {
		.prototype-canvas {
			padding: max(8px, var(--pksx-safe-area-top)) max(8px, var(--pksx-safe-area-right))
				max(8px, var(--pksx-safe-area-bottom)) max(8px, var(--pksx-safe-area-left));
		}
	}
</style>
