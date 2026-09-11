<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		label: string;
	}

	let { label }: Props = $props();
	let visible = $state(false);

	onMount(() => {
		const timer = window.setTimeout(() => (visible = true), 500);
		return () => window.clearTimeout(timer);
	});
</script>

<span class:visible class="delayed-spinner" role="status" aria-busy="false">
	{#if visible}
		<span class="spinner-graphic" aria-hidden="true"></span>
		<span class="spinner-label">{label}</span>
	{/if}
</span>

<style>
	.delayed-spinner {
		display: inline-block;
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	.delayed-spinner.visible {
		display: inline-grid;
		position: relative;
		place-items: center;
		width: 1em;
		height: 1em;
		flex: 0 0 auto;
		overflow: visible;
	}

	.spinner-graphic {
		width: 0.72em;
		height: 0.72em;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: delayed-spinner-rotation 650ms linear infinite;
	}

	.spinner-label {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@keyframes delayed-spinner-rotation {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner-graphic {
			animation: none;
		}
	}
</style>
