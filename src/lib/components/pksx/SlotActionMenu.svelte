<script lang="ts">
	import type { SlotView } from './types';
	import type { SlotMenuCommand, SlotMenuCommandKey } from '$lib/pksx/slot-menu';
	import EdgeMenu from './EdgeMenu.svelte';

	interface Props {
		location: string;
		slot: SlotView;
		commands: SlotMenuCommand[];
		activeIndex: number;
		availabilityPending?: boolean;
		onFocusCommand: (index: number) => void;
		onSelectCommand: (command: SlotMenuCommandKey) => void;
		onClose: () => void;
	}

	let {
		location,
		slot,
		commands,
		activeIndex,
		availabilityPending = false,
		onFocusCommand,
		onSelectCommand,
		onClose
	}: Props = $props();

	const occupied = $derived(slot.kind === 'pokemon');
</script>

<EdgeMenu label="Slot actions" onDismiss={onClose}>
	<div class="slot-context" aria-busy={availabilityPending ? 'true' : undefined}>
		<div class="slot-context-header">
			<p class="slot-context-kicker">{occupied ? 'Edit' : 'Slot Menu'}</p>
			<p class="slot-context-location">{location}</p>
		</div>

		<div class="slot-command-stack" role="list" aria-label="Slot Menu commands">
			{#each commands as command, index (command.label)}
				<div class="slot-command-row" role="listitem">
					<button
						id={`slot-action-${index}`}
						type="button"
						class:controller-focused={activeIndex === index}
						aria-disabled={command.reason ? 'true' : undefined}
						aria-describedby={command.reason ? `slot-action-${index}-reason` : undefined}
						data-availability={command.availability}
						onfocus={(event) => {
							onFocusCommand(index);
							event.currentTarget.parentElement?.scrollIntoView({ block: 'nearest' });
						}}
						onclick={(event) => {
							event.preventDefault();
							onFocusCommand(index);
							if (!command.reason) {
								onSelectCommand(command.key);
							}
						}}
					>
						<strong>{command.label}</strong>
					</button>
					{#if command.reason}
						<span id={`slot-action-${index}-reason`} class="slot-command-reason"
							>{command.reason}</span
						>
					{/if}
				</div>
			{/each}
		</div>

		<button
			id={`slot-action-${commands.length}`}
			type="button"
			class="close-command"
			class:controller-focused={activeIndex === commands.length}
			onfocus={() => onFocusCommand(commands.length)}
			onclick={onClose}>Close</button
		>
	</div>
</EdgeMenu>

<style>
	.slot-context {
		min-height: 0;
		display: grid;
		gap: var(--pksx-space-1);
		padding: var(--pksx-space-2);
		overflow-y: auto;
	}

	.slot-context-header {
		display: grid;
		gap: var(--pksx-space-1);
		padding-bottom: var(--pksx-space-1);
		border-bottom: 1px solid var(--rule);
	}

	.slot-context-kicker,
	.slot-context-location {
		margin: 0;
		color: var(--ink-mute);
		font-family: var(--pksx-font-mono), monospace;
		font-size: var(--pksx-type-caption);
		font-weight: 650;
		line-height: 1.25;
	}

	.slot-context-kicker {
		color: var(--rust);
		text-transform: uppercase;
	}

	.slot-command-stack {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.slot-command-row {
		min-width: 0;
		display: grid;
		gap: 1px;
	}

	.slot-command-row button,
	.close-command {
		width: 100%;
		min-height: var(--pksx-small-control-height);
		padding: var(--pksx-space-1) var(--pksx-space-2);
		border: 0;
		border-radius: var(--pksx-radius-small);
		background: var(--paper-hi);
		box-shadow: none;
		color: var(--ink);
		font: inherit;
		text-align: left;
	}

	.slot-command-row button {
		height: var(--pksx-small-control-height);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: not-allowed;
		opacity: 0.68;
	}

	.slot-command-row button[data-availability='available'] {
		cursor: pointer;
		opacity: 1;
	}

	.slot-command-row button[data-availability='available']:hover,
	.slot-command-row button[data-availability='available']:focus-visible {
		background: var(--rust-wash);
		color: var(--rust);
		outline: none;
	}

	.slot-command-row button.controller-focused,
	.close-command.controller-focused {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 55%);
		outline-offset: 1px;
		opacity: 1;
	}

	.slot-command-row strong,
	.close-command {
		font-size: var(--pksx-type-label);
		font-weight: 750;
		line-height: 1.15;
	}

	.slot-command-row button:not([data-availability='available']) {
		background: var(--paper-deep);
	}

	.slot-command-reason {
		color: var(--ink-soft);
		font-size: var(--pksx-type-caption);
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
	}

	.close-command {
		background: var(--rust);
		color: white;
		cursor: pointer;
		text-align: center;
	}

	.close-command:hover,
	.close-command:focus-visible:not(.controller-focused) {
		background: var(--rust-ring);
		outline: none;
	}
</style>
