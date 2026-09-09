<script lang="ts">
	import type { PokemonActionKind } from '$lib/engine';
	import type { PokemonActionState } from '$lib/pksx/pokemon-actions';
	import DelayedSpinner from './DelayedSpinner.svelte';

	interface Props {
		state: Exclude<PokemonActionState, { status: 'idle' }>;
		onSelect: (kind: PokemonActionKind, choiceId?: string) => void;
		onClearSelection: () => void;
		onApply: () => void;
		onClose: () => void;
	}

	let { state, onSelect, onClearSelection, onApply, onClose }: Props = $props();

	const preview = $derived(
		state.status === 'ready' || state.status === 'applying' ? state.preview : null
	);
	const evolve = $derived(preview?.actions.find((action) => action.kind === 'evolve') ?? null);
</script>

<div class="pokemon-action-dialog">
	<header>
		<div>
			<p>{state.location}</p>
			<h2 id="pokemon-action-title">Evolve</h2>
		</div>
		<button
			id="pokemon-action-close"
			data-pokemon-action-control
			type="button"
			aria-label="Close Evolve"
			disabled={state.status === 'applying'}
			onclick={onClose}>×</button
		>
	</header>

	<div class="action-scroll">
		<section class="subject" aria-label="Evolution source">
			<strong>{state.pokemonLabel}</strong>
			{#if state.status !== 'loading'}
				<span>
					{state.status === 'error'
						? 'Evolution unavailable'
						: 'Choose a direct evolution to preview.'}
				</span>
			{/if}
		</section>

		{#if state.status === 'loading'}
			<div class="message"><DelayedSpinner active label="Loading evolutions" /></div>
		{:else if state.status === 'error'}
			<p class="message error" role="alert">{state.message}</p>
		{:else if state.selection}
			<section class="preview" aria-label="Evolution preview">
				<div>
					<h3>
						Evolve to {state.selection.choice?.speciesName ?? 'selected evolution'}
					</h3>
				</div>
				{#if state.selection.changes.length > 0}
					<ul>
						{#each state.selection.changes as change (change.field)}
							<li>
								<strong>{change.field}</strong>
								<span>{change.before}</span>
								<b aria-hidden="true">→</b>
								<span>{change.after}</span>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="message">No visible changes.</p>
				{/if}
			</section>
		{:else}
			<div class="action-list">
				<section>
					<div>
						<h3>Evolve</h3>
					</div>
					{#if evolve?.available}
						<div class="evolution-list">
							{#each evolve.choices as choice (choice.id)}
								<button
									data-pokemon-action-control
									type="button"
									disabled={state.status === 'applying'}
									onclick={() => onSelect('evolve', choice.id)}
								>
									<strong>{choice.speciesName}</strong>
									<span>{choice.requirement}</span>
								</button>
							{/each}
						</div>
					{:else}
						<p>{evolve?.unavailableReason ?? 'No direct evolution is available.'}</p>
					{/if}
				</section>
			</div>
		{/if}
	</div>

	<footer>
		{#if state.status !== 'loading' && state.status !== 'error' && state.selection}
			<button
				data-pokemon-action-control
				type="button"
				disabled={state.status === 'applying'}
				onclick={onClearSelection}>Cancel</button
			>
			<button
				id="pokemon-action-apply"
				data-pokemon-action-control
				class="primary"
				type="button"
				disabled={state.status === 'applying'}
				onclick={onApply}
			>
				Apply evolution
			</button>
			<DelayedSpinner active={state.status === 'applying'} label="Applying evolution" />
		{:else}
			<button data-pokemon-action-control class="primary" type="button" onclick={onClose}>
				Close
			</button>
		{/if}
	</footer>
</div>

<style>
	.pokemon-action-dialog {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-3);
		overflow: hidden;
	}

	.action-scroll {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--pksx-space-2);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	header,
	footer,
	.subject,
	.action-list section,
	.preview {
		display: flex;
		gap: var(--pksx-space-2);
	}

	header,
	footer,
	.subject {
		align-items: center;
		justify-content: space-between;
	}

	header p,
	header h2,
	h3,
	.action-list p,
	.preview p {
		margin: 0;
	}

	header p {
		color: var(--rust);
		font:
			700 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
	}

	h2 {
		color: var(--ink);
		font: 760 var(--pksx-type-title)/1.1 var(--pksx-font-sans);
	}

	h3 {
		color: var(--ink);
		font: 740 var(--pksx-type-title)/1.2 var(--pksx-font-sans);
	}

	button {
		min-height: var(--pksx-control-height);
		padding: var(--pksx-space-1) var(--pksx-space-2);
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-medium);
		background: var(--paper);
		color: var(--ink);
		font: inherit;
		font-weight: 720;
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	button:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 50%);
		outline-offset: 2px;
	}

	header button {
		width: var(--pksx-control-height);
		padding: 0;
		font-size: var(--pksx-icon-size);
		line-height: 1;
	}

	.subject,
	.message,
	.action-list section,
	.preview {
		padding: var(--pksx-space-2);
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-medium);
		background: var(--paper);
	}

	.subject {
		flex-wrap: wrap;
	}

	.subject span,
	.action-list section > p,
	.message {
		color: var(--ink-mute);
		font-size: var(--pksx-type-body);
		line-height: 1.25;
	}

	.message.error {
		color: var(--pksx-color-feedback-danger);
	}

	.action-list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--pksx-space-2);
	}

	.action-list section,
	.preview {
		flex-direction: column;
		align-items: stretch;
	}

	.evolution-list {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.evolution-list button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		text-align: left;
	}

	.evolution-list span {
		color: var(--ink-mute);
		font-size: var(--pksx-type-label);
	}

	.preview ul {
		display: grid;
		gap: var(--pksx-space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.preview li {
		display: grid;
		grid-template-columns: minmax(90px, 0.7fr) 1fr auto 1fr;
		align-items: center;
		gap: var(--pksx-space-1);
		padding: var(--pksx-space-2);
		border-radius: var(--pksx-radius-medium);
		background: var(--paper-deep);
		font-size: var(--pksx-type-label);
	}

	.preview li span {
		overflow-wrap: anywhere;
		color: var(--ink-mute);
	}

	footer {
		justify-content: flex-end;
	}

	button.primary {
		border-color: var(--rust);
		background: var(--rust);
		color: white;
	}

	@container pksx-density (max-width: 640px) {
		.action-list {
			grid-template-columns: 1fr;
		}

		.preview li {
			grid-template-columns: 1fr;
		}

		.preview li b {
			display: none;
		}
	}
</style>
