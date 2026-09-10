<script module lang="ts">
	export const MAIN_MENU_SEARCH_INSERTION_INDEX = 1;

	export type MainMenuEntry = {
		key: 'boxes' | 'trainer' | 'bag' | 'saves' | 'settings' | 'backup-browser';
		label: string;
		description: string;
	};
</script>

<script lang="ts">
	import EdgeMenu from './EdgeMenu.svelte';

	interface Props {
		entries: MainMenuEntry[];
		activeDestination: Exclude<MainMenuEntry['key'], 'backup-browser'>;
		activeIndex: number;
		onFocusEntry: (index: number) => void;
		onSelectEntry: (entry: MainMenuEntry) => void;
		onClose: () => void;
	}

	let { entries, activeDestination, activeIndex, onFocusEntry, onSelectEntry, onClose }: Props =
		$props();
</script>

<EdgeMenu label="Main Menu" onDismiss={onClose}>
	<div class="main-menu">
		<header>
			<p>PKSX</p>
			<h2>Main Menu</h2>
		</header>

		<div class="main-menu-entries" role="list" aria-label="Main Menu destinations">
			{#each entries as entry, index (entry.key)}
				<div class="main-menu-row" role="listitem">
					<button
						id={`main-menu-entry-${index}`}
						type="button"
						class:controller-focused={activeIndex === index}
						aria-current={entry.key === activeDestination ? 'page' : undefined}
						onfocus={() => onFocusEntry(index)}
						onclick={() => onSelectEntry(entry)}
					>
						<strong>{entry.label}</strong>
						<span>{entry.description}</span>
					</button>
				</div>
			{/each}
		</div>
	</div>
</EdgeMenu>

<style>
	.main-menu {
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

	header p,
	header h2 {
		margin: 0;
	}

	header p {
		color: var(--rust);
		font: 750 var(--pksx-type-caption) / 1 var(--pksx-font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	header h2 {
		font-size: var(--pksx-type-display);
		line-height: 1;
	}

	.main-menu-entries,
	.main-menu-row {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.main-menu-row button {
		width: 100%;
		min-height: var(--pksx-control-height);
		display: grid;
		grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
		align-items: center;
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-2) var(--pksx-space-3);
		border: var(--pksx-border-width) solid transparent;
		border-radius: var(--pksx-radius-medium);
		background: var(--paper-deep);
		color: var(--ink);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.main-menu-row button:hover,
	.main-menu-row button:focus-visible,
	.main-menu-row button.controller-focused {
		border-color: color-mix(in srgb, var(--rust), transparent 55%);
		background: var(--rust-wash);
		outline: none;
	}

	.main-menu-row button[aria-current='page'] {
		box-shadow: inset var(--pksx-space-1) 0 0 var(--rust);
	}

	.main-menu-row button[aria-current='page'] strong::after {
		content: '';
		display: inline-block;
		width: 0.55em;
		height: 0.55em;
		margin-left: var(--pksx-space-1);
		border: var(--pksx-border-width) solid currentColor;
		border-radius: 50%;
		background: var(--rust);
		color: var(--rust);
		vertical-align: 0.08em;
	}

	.main-menu-row strong {
		font-size: var(--pksx-type-label);
		font-weight: 780;
	}

	.main-menu-row span {
		color: var(--ink-soft);
		font-size: var(--pksx-type-caption);
		line-height: 1.2;
	}
</style>
