<script lang="ts">
	import EdgeMenu from './EdgeMenu.svelte';
	import DelayedSpinner from './DelayedSpinner.svelte';

	interface Props {
		mode: 'commands' | 'delete';
		fileName: string;
		description?: string;
		activeIndex: number;
		busy?: boolean;
		onFocusCommand: (index: number) => void;
		onOpenTrainer: () => void;
		onOpenBag: () => void;
		onDelete: () => void;
		onCancelDelete: () => void;
		onClose: () => void;
	}

	let {
		mode,
		fileName,
		description,
		activeIndex,
		busy = false,
		onFocusCommand,
		onOpenTrainer,
		onOpenBag,
		onDelete,
		onCancelDelete,
		onClose
	}: Props = $props();
</script>

<EdgeMenu
	label={mode === 'commands' ? 'Save File Menu' : 'Delete ' + fileName + '?'}
	onDismiss={onClose}
>
	<div class="save-file-menu" class:confirmation={mode === 'delete'} aria-busy={busy}>
		<header>
			<h2>{mode === 'commands' ? fileName : 'Delete ' + fileName + '?'}</h2>
			{#if description}<span>{description}</span>{/if}
		</header>

		<div class="commands">
			{#if mode === 'commands'}
				<button
					id="save-file-menu-command-0"
					type="button"
					class:controller-focused={activeIndex === 0}
					onfocus={() => onFocusCommand(0)}
					onclick={onOpenTrainer}
				>
					<strong>Open Trainer</strong>
				</button>
				<button
					id="save-file-menu-command-1"
					type="button"
					class:controller-focused={activeIndex === 1}
					onfocus={() => onFocusCommand(1)}
					onclick={onOpenBag}
				>
					<strong>Open Bag</strong>
				</button>
				<button
					id="save-file-menu-command-2"
					type="button"
					class="danger"
					class:controller-focused={activeIndex === 2}
					onfocus={() => onFocusCommand(2)}
					onclick={onDelete}
				>
					<strong>Delete from Saves</strong>
				</button>
				<DelayedSpinner active={busy} label="Opening Save File" />
			{:else}
				<button
					id="save-file-delete-command-0"
					type="button"
					class:controller-focused={activeIndex === 0}
					disabled={busy}
					onfocus={() => onFocusCommand(0)}
					onclick={onCancelDelete}
				>
					<strong>Keep Save File</strong>
				</button>
				<button
					id="save-file-delete-command-1"
					type="button"
					class="danger"
					class:controller-focused={activeIndex === 1}
					disabled={busy}
					onfocus={() => onFocusCommand(1)}
					onclick={onDelete}
				>
					<strong>Delete</strong>
				</button>
				<DelayedSpinner active={busy} label="Deleting Save File" />
			{/if}
		</div>
	</div>
</EdgeMenu>

<style>
	.save-file-menu {
		min-height: 0;
		display: grid;
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-3);
		overflow-y: auto;
	}

	header {
		display: grid;
		gap: var(--pksx-space-1);
		padding-bottom: var(--pksx-space-2);
		border-bottom: var(--pksx-border-width) solid var(--rule);
	}

	header h2,
	header span {
		margin: 0;
	}

	header h2 {
		font-size: var(--pksx-type-display);
		line-height: 1;
		overflow-wrap: anywhere;
	}

	header span {
		color: var(--ink-soft);
		font-size: var(--pksx-type-label);
		line-height: 1.35;
	}

	.commands {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.commands button {
		width: 100%;
		min-height: var(--pksx-control-height);
		padding: var(--pksx-space-2) var(--pksx-space-3);
		border: var(--pksx-border-width) solid transparent;
		border-radius: var(--pksx-radius-medium);
		background: var(--paper-deep);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.commands button:hover,
	.commands button:focus-visible,
	.commands button.controller-focused {
		border-color: color-mix(in srgb, var(--rust), transparent 55%);
		background: var(--rust-wash);
		outline: none;
	}

	.commands button.danger {
		color: var(--err);
	}

	.commands button:disabled {
		cursor: not-allowed;
		opacity: 0.58;
	}

	.commands strong {
		font-size: var(--pksx-type-label);
		font-weight: 750;
	}
</style>
