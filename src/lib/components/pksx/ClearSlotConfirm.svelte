<script lang="ts">
	import EdgeMenu from './EdgeMenu.svelte';

	interface Props {
		location: string;
		pokemonLabel: string;
		sourceLabel: string;
		activeIndex: number;
		applying?: boolean;
		onFocusCommand: (index: number) => void;
		onCancel: () => void;
		onConfirm: () => void;
	}

	let {
		location,
		pokemonLabel,
		sourceLabel,
		activeIndex,
		applying = false,
		onFocusCommand,
		onCancel,
		onConfirm
	}: Props = $props();
</script>

<EdgeMenu label={`Clear ${pokemonLabel}?`} onDismiss={onCancel}>
	<div class="clear-confirm">
		<div>
			<p>Clear Slot</p>
			<h2>Clear {pokemonLabel}?</h2>
			<span>{location}</span>
		</div>
		<p class="confirm-copy">This removes the Pokemon from {sourceLabel}.</p>
		<div class="confirm-actions">
			<button
				id="clear-confirm-0"
				type="button"
				class:controller-focused={activeIndex === 0}
				disabled={applying}
				onfocus={() => onFocusCommand(0)}
				onclick={onCancel}>Cancel</button
			>
			<button
				id="clear-confirm-1"
				type="button"
				class="danger"
				class:controller-focused={activeIndex === 1}
				disabled={applying}
				onfocus={() => onFocusCommand(1)}
				onclick={onConfirm}>{applying ? 'Clearing...' : 'Confirm Clear'}</button
			>
		</div>
	</div>
</EdgeMenu>

<style>
	.clear-confirm {
		min-height: 0;
		display: grid;
		gap: var(--pksx-space-3);
		padding: var(--pksx-space-3);
		overflow-y: auto;
	}

	.clear-confirm p,
	.clear-confirm h2,
	.clear-confirm span {
		margin: 0;
	}

	.clear-confirm > div:first-child {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.clear-confirm > div:first-child p {
		color: var(--err);
		font-family: var(--pksx-font-mono), monospace;
		font-size: var(--pksx-type-caption);
		font-weight: 750;
		text-transform: uppercase;
	}

	.clear-confirm h2 {
		font-size: var(--pksx-type-title);
		line-height: 1.2;
	}

	.clear-confirm span,
	.confirm-copy {
		color: var(--ink-soft);
		font-size: var(--pksx-type-label);
		font-weight: 650;
	}

	.confirm-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--pksx-space-2);
	}

	.confirm-actions button {
		min-height: var(--pksx-small-control-height);
		border-radius: var(--pksx-radius-small);
		background: var(--paper-deep);
		color: var(--ink);
		font-size: var(--pksx-type-label);
		font-weight: 800;
	}

	.confirm-actions button.danger {
		background: color-mix(in srgb, var(--err), transparent 84%);
		color: var(--err);
	}

	.confirm-actions button.controller-focused {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 52%);
		outline-offset: 2px;
	}
</style>
