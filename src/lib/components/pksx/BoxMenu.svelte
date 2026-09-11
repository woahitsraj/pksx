<script lang="ts">
	import type { BoxMenuCommand, BoxMenuCommandKey } from '$lib/pksx/box-menu';
	import EdgeMenu from './EdgeMenu.svelte';

	interface Props {
		collection: string;
		commands: BoxMenuCommand[];
		activeIndex: number;
		onFocusCommand: (index: number) => void;
		onSelectCommand: (command: BoxMenuCommandKey) => void;
		onClose: () => void;
	}

	let { collection, commands, activeIndex, onFocusCommand, onSelectCommand, onClose }: Props =
		$props();
</script>

<EdgeMenu label="Box Menu" onDismiss={onClose}>
	<div class="box-menu">
		<header>
			<h2>{collection}</h2>
		</header>

		<div class="box-menu-commands" role="list" aria-label="Box Menu commands">
			{#each commands as command, index (command.key)}
				<div class="box-menu-row" role="listitem">
					<button
						id={`box-menu-command-${index}`}
						type="button"
						data-pksx-control-category="small"
						class:controller-focused={activeIndex === index}
						aria-disabled={command.reason ? 'true' : undefined}
						aria-describedby={command.reason ? `box-menu-command-${index}-reason` : undefined}
						data-availability={command.availability}
						onfocus={(event) => {
							onFocusCommand(index);
							event.currentTarget.parentElement?.scrollIntoView({ block: 'nearest' });
						}}
						onclick={(event) => {
							event.preventDefault();
							onFocusCommand(index);
							if (!command.reason) onSelectCommand(command.key);
						}}
					>
						<strong>{command.label}</strong>
					</button>
					{#if command.reason}
						<span id={`box-menu-command-${index}-reason`}>{command.reason}</span>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</EdgeMenu>

<style>
	.box-menu {
		min-height: 0;
		display: grid;
		gap: var(--pksx-space-1);
		padding: var(--pksx-space-2);
		overflow-y: auto;
	}

	header {
		display: grid;
		gap: var(--pksx-space-1);
		padding-bottom: var(--pksx-space-1);
		border-bottom: 1px solid var(--rule);
	}

	header h2 {
		margin: 0;
		font-family: var(--pksx-font-mono), monospace;
		font-size: var(--pksx-type-caption);
		line-height: 1.25;
	}

	header h2 {
		color: var(--ink-mute);
		font-weight: 750;
	}

	.box-menu-commands,
	.box-menu-row {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.box-menu-row {
		min-width: 0;
		gap: 1px;
	}

	.box-menu-row button {
		width: 100%;
		height: var(--pksx-small-control-height);
		min-height: var(--pksx-small-control-height);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--pksx-space-1) var(--pksx-space-2);
		border: 0;
		border-radius: var(--pksx-radius-small);
		background: var(--paper-deep);
		box-shadow: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: not-allowed;
		opacity: 0.68;
	}

	.box-menu-row button[data-availability='available'] {
		background: var(--paper-hi);
		cursor: pointer;
		opacity: 1;
	}

	.box-menu-row button[data-availability='available']:hover,
	.box-menu-row button[data-availability='available']:focus-visible {
		background: var(--rust-wash);
		color: var(--rust);
		outline: none;
	}

	.box-menu-row button.controller-focused {
		outline: var(--pksx-focus-ring) solid color-mix(in srgb, var(--rust), transparent 55%);
		outline-offset: 1px;
		opacity: 1;
	}

	.box-menu-row strong {
		font-size: var(--pksx-type-label);
		font-weight: 750;
		line-height: 1.15;
	}

	.box-menu-row span {
		color: var(--ink-soft);
		font-size: var(--pksx-type-caption);
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
	}
</style>
