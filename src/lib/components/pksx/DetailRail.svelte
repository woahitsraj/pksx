<script lang="ts">
	import type { SaveSummary } from '$lib/engine';
	import { getSpriteIdentityLabels } from '$lib/pksx/sprite-catalog';
	import type { SlotView } from './types';

	interface Props {
		focusedSlot: SlotView;
		focusZone: 'party' | 'box' | null;
		focusSlot: number | null;
		slotHueStyle: string;
		spriteUrl: string | null;
		saveSummary: SaveSummary | null;
		activeBoxName: string;
		positionLabel: string;
	}

	let {
		focusedSlot,
		focusZone,
		focusSlot,
		slotHueStyle,
		spriteUrl,
		saveSummary,
		activeBoxName,
		positionLabel
	}: Props = $props();

	const isPokemon = $derived(focusedSlot.kind === 'pokemon');
	const speciesLabel = $derived(
		isPokemon && focusedSlot.speciesId
			? `Species #${String(focusedSlot.speciesId).padStart(4, '0')}`
			: null
	);
	const identityLabels = $derived(getSpriteIdentityLabels(focusedSlot.spriteIdentity));
	const details = $derived(
		[
			focusedSlot.nature,
			focusedSlot.ability,
			focusedSlot.heldItem ? `holding ${focusedSlot.heldItem}` : null
		].filter((value): value is string => typeof value === 'string' && value.length > 0)
	);
	const footerRows = $derived(
		isPokemon
			? [
					focusedSlot.originalTrainer
						? { label: 'OT', value: focusedSlot.originalTrainer }
						: saveSummary?.trainerName
							? { label: 'OT', value: saveSummary.trainerName }
							: null,
					focusedSlot.heldItem ? { label: 'Item', value: focusedSlot.heldItem } : null,
					focusedSlot.metLabel ? { label: 'Met', value: focusedSlot.metLabel } : null,
					saveSummary?.fileName ? { label: 'Save', value: saveSummary.fileName } : null,
					{ label: 'Pos', value: positionLabel }
				].filter((row): row is { label: string; value: string } => row !== null)
			: []
	);
	const hasStats = $derived(isPokemon && focusedSlot.stats && focusedSlot.stats.length > 0);
	const hasMoves = $derived(isPokemon && focusedSlot.moves && focusedSlot.moves.length > 0);
	const hasSlotFocus = $derived(focusZone !== null && focusSlot !== null);
	const slotHeader = $derived(
		focusZone === null || focusSlot === null
			? 'NO SLOT'
			: focusZone === 'party'
				? `PARTY ${focusSlot + 1}`
				: `SLOT ${focusSlot + 1}`
	);
	const locationLabel = $derived(
		focusZone === 'box' ? activeBoxName : focusZone === 'party' ? 'Party' : 'No selection'
	);
</script>

<aside
	class={['detail-rail', !isPokemon && 'empty-state']}
	aria-label="Active Slot details"
	aria-live="polite"
	data-testid="active-slot-detail-rail"
	style={slotHueStyle}
>
	<div class="portrait-card">
		<small>{slotHeader}</small>
		{#if speciesLabel}
			<span class="species-pill">{speciesLabel.replace('Species ', '')}</span>
		{/if}
		{#if isPokemon && spriteUrl}
			<img src={spriteUrl} alt="" width="180" height="180" />
		{:else if isPokemon}
			<span class="portrait-missing" aria-hidden="true"></span>
		{:else}
			<span class="portrait-empty" aria-hidden="true"></span>
		{/if}
		{#if isPokemon && focusedSlot.types && focusedSlot.types.length > 0}
			<div class="type-row" aria-label="Types">
				{#each focusedSlot.types as type (type.name)}
					<span
						class="type-chip"
						style={`--type-hue: ${type.hue}; --type-chroma: ${type.chroma ?? 0.09}`}
						>{type.name}</span
					>
				{/each}
			</div>
		{/if}
	</div>
	<div class="detail-heading" class:empty-heading={!isPokemon}>
		<div>
			<h2>{isPokemon ? focusedSlot.label : 'Empty slot'}</h2>
			{#if isPokemon && details.length > 0}
				<span>{details.join(' · ')}</span>
			{:else if !hasSlotFocus}
				<span>No slot selected</span>
			{:else if !isPokemon}
				<span>No Pokemon stored here</span>
			{/if}
		</div>
		{#if isPokemon && focusedSlot.level !== null}
			<div class="detail-level">
				<span>LEVEL</span>
				<strong>{focusedSlot.level}</strong>
			</div>
		{/if}
	</div>

	{#if isPokemon}
		<div class="identity-strip" aria-label="Pokemon identity">
			{#if speciesLabel}<span>{speciesLabel}</span>{/if}
			{#if identityLabels.form}<span>{identityLabels.form}</span>{/if}
			{#if identityLabels.shiny}<span>{identityLabels.shiny}</span>{/if}
			{#if identityLabels.displaySex}<span>{identityLabels.displaySex}</span>{/if}
			{#if focusedSlot.gender}<span>{focusedSlot.gender}</span>{/if}
			{#if focusedSlot.isEgg}<span>Egg</span>{/if}
			<span>{locationLabel}</span>
		</div>
	{/if}

	{#if hasStats}
		<div class="stat-panel" aria-label="Stats">
			<div class="panel-title">
				<span>Stats</span>
				<strong>BST {focusedSlot.stats?.reduce((total, stat) => total + stat.value, 0)}</strong>
			</div>
			{#each focusedSlot.stats ?? [] as stat (stat.key)}
				<div class="stat-row">
					<span class="stat-key">{stat.label}</span>
					<span class="stat-bar" aria-hidden="true">
						<i style={`width: ${Math.min(100, Math.round((stat.value / stat.max) * 100))}%`}></i>
					</span>
					<strong>{stat.value}</strong>
					<em>+{stat.ev ?? 0}</em>
				</div>
			{/each}
		</div>
	{/if}

	{#if hasMoves}
		<div class="move-panel" aria-label="Move set">
			<div class="panel-title">
				<span>Move Set</span>
			</div>
			<div class="move-grid">
				{#each focusedSlot.moves ?? [] as move, index (`${index}-${move.id}-${move.name}`)}
					<div
						class="move-chip"
						style={`--type-hue: ${move.hue}; --type-chroma: ${move.chroma ?? 0.09}`}
					>
						<strong>{move.name}</strong>
						<span>{move.type}</span>
						{#if move.pp !== null && move.pp !== undefined}
							<em>{move.pp}</em>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if footerRows.length > 0}
		<div class="detail-footer" aria-label="Storage metadata">
			{#each footerRows as row (row.label)}
				<span>{row.label}</span>
				<strong>{row.value}</strong>
			{/each}
		</div>
	{/if}

	{#if !isPokemon}
		<div class="empty-copy">
			<span>{focusZone === null ? 'Selection' : 'Position'}</span>
			<strong>{positionLabel}</strong>
		</div>
	{/if}
</aside>

<style>
	.detail-rail {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 14px;
		overflow-y: auto;
		border: 0;
		border-radius: var(--pksx-radius-xl);
		background: var(--paper-hi);
		box-shadow: var(--shadow-deep);
		color: var(--ink);
	}

	.detail-rail.empty-state {
		color: var(--ink-soft);
	}

	.portrait-card {
		position: relative;
		height: 232px;
		display: grid;
		place-items: center;
		border-radius: var(--pksx-radius-lg);
		background:
			repeating-radial-gradient(
				circle at 30% 30%,
				transparent 0 34px,
				rgba(42, 36, 28, 0.04) 34px 35px
			),
			radial-gradient(
				circle at 32% 38%,
				color-mix(in srgb, var(--paper-hi), #ffc7c7 42%),
				transparent 46%
			),
			linear-gradient(
				135deg,
				oklch(0.91 var(--slot-chroma, 0.08) calc(var(--slot-hue, 48) + 150)),
				oklch(0.78 var(--slot-chroma, 0.17) var(--slot-hue, 48))
			);
		overflow: hidden;
		box-shadow:
			inset 0 0 0 1px rgba(255, 255, 255, 0.35),
			0 16px 24px -22px color-mix(in srgb, var(--ink), transparent 45%);
	}

	.empty-state .portrait-card {
		height: 180px;
		background:
			repeating-radial-gradient(circle at 50% 45%, transparent 0 26px, var(--rule) 26px 27px),
			var(--paper);
	}

	:global(.app-shell.dark) .portrait-card {
		background:
			repeating-radial-gradient(
				circle at 30% 35%,
				transparent 0 24px,
				rgba(255, 255, 255, 0.04) 24px 25px
			),
			radial-gradient(
				circle at 30% 35%,
				oklch(0.5 var(--slot-chroma, 0.08) var(--slot-hue, 48)),
				oklch(0.28 var(--slot-chroma, 0.08) var(--slot-hue, 48))
			);
	}

	.portrait-card img {
		width: min(62%, 168px);
		height: min(62%, 168px);
		object-fit: contain;
		filter: drop-shadow(0 14px 8px color-mix(in srgb, var(--ink), transparent 72%));
	}

	.portrait-empty {
		width: 68px;
		height: 68px;
		border: 1px dashed var(--rule-hi);
		border-radius: var(--pksx-radius-lg);
		background:
			linear-gradient(
				90deg,
				transparent calc(50% - 0.5px),
				var(--rule-hi) 50%,
				transparent calc(50% + 0.5px)
			),
			linear-gradient(
				0deg,
				transparent calc(50% - 0.5px),
				var(--rule-hi) 50%,
				transparent calc(50% + 0.5px)
			);
	}

	.portrait-missing {
		width: 86px;
		height: 86px;
		border: 1px solid color-mix(in srgb, var(--ink), transparent 45%);
		border-radius: var(--pksx-radius-lg);
		background: color-mix(in srgb, var(--paper), transparent 35%);
	}

	.portrait-missing::before {
		content: '?';
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		color: color-mix(in srgb, var(--ink), transparent 35%);
		font:
			800 var(--pksx-type-display) var(--pksx-font-mono),
			monospace;
	}

	.portrait-card small {
		position: absolute;
		top: 14px;
		left: 16px;
		color: color-mix(in srgb, var(--ink), transparent 38%);
		font:
			750 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.12em;
	}

	.species-pill {
		position: absolute;
		top: 14px;
		right: 16px;
		padding: 4px 10px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--paper-hi), transparent 22%);
		color: color-mix(in srgb, var(--ink), transparent 38%);
		font:
			800 var(--pksx-type-label) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.05em;
	}

	.type-row {
		position: absolute;
		left: 16px;
		right: 16px;
		bottom: 14px;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.type-chip {
		padding: 5px 11px;
		border-radius: 999px;
		background: oklch(0.89 var(--type-chroma, 0.09) var(--type-hue, 52));
		color: oklch(0.31 var(--type-chroma, 0.09) var(--type-hue, 52));
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink), transparent 90%);
		font-size: var(--pksx-type-label);
		font-weight: 850;
	}

	.detail-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.detail-heading h2 {
		margin: 0;
		color: var(--ink);
		font-size: var(--pksx-type-display);
		font-weight: 800;
		line-height: 0.95;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}

	.detail-heading span {
		display: block;
		margin-top: 7px;
		color: var(--ink-soft);
		font:
			750 var(--pksx-type-label) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.05em;
	}

	.detail-heading.empty-heading h2 {
		font-size: var(--pksx-type-title);
	}

	.detail-level {
		min-width: 58px;
		display: grid;
		justify-items: end;
		gap: 2px;
		padding-top: 2px;
	}

	.detail-level span {
		color: var(--ink-mute);
		font:
			750 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.08em;
	}

	.detail-level strong {
		color: var(--rust);
		font-size: var(--pksx-type-display);
		font-weight: 850;
		line-height: 0.9;
	}

	.identity-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 10px;
		color: var(--ink-soft);
		font:
			750 var(--pksx-type-label) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.05em;
	}

	.identity-strip span:not(:last-child)::after {
		content: '·';
		margin-left: 10px;
		color: var(--ink-mute);
	}

	.stat-panel,
	.move-panel {
		display: grid;
		gap: 9px;
	}

	.panel-title {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		color: var(--ink-mute);
		font:
			800 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.panel-title strong {
		color: var(--ok);
		font-weight: 850;
		letter-spacing: 0.06em;
	}

	.stat-row {
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) 28px 42px;
		align-items: center;
		gap: 8px;
	}

	.stat-key {
		color: var(--ink-soft);
		font:
			800 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
	}

	.stat-bar {
		position: relative;
		height: 8px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--paper-deep), transparent 15%);
		overflow: hidden;
	}

	.stat-bar i {
		position: absolute;
		inset: 0 auto 0 0;
		display: block;
		border-radius: inherit;
		background: linear-gradient(90deg, color-mix(in srgb, var(--rust), white 38%), var(--rust));
	}

	.stat-row strong,
	.stat-row em {
		margin: 0;
		font:
			800 var(--pksx-type-label) var(--pksx-font-mono),
			monospace;
		text-align: right;
	}

	.stat-row strong {
		color: var(--ink);
	}

	.stat-row em {
		color: var(--ink-mute);
		font-style: normal;
	}

	.move-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.move-chip {
		position: relative;
		min-width: 0;
		display: grid;
		gap: 3px;
		padding: 10px 28px 10px 12px;
		border-radius: var(--pksx-radius-md);
		background: color-mix(in srgb, var(--paper-deep), transparent 30%);
		box-shadow: var(--shadow-sm);
	}

	.move-chip::before {
		content: '';
		position: absolute;
		top: 13px;
		left: 8px;
		width: 5px;
		height: 5px;
		border-radius: 2px;
		background: oklch(0.55 var(--type-chroma, 0.16) var(--type-hue, 48));
	}

	.move-chip strong {
		min-width: 0;
		padding-left: 10px;
		color: var(--ink);
		font-size: var(--pksx-type-label);
		font-weight: 800;
		line-height: 1.08;
		overflow-wrap: anywhere;
	}

	.move-chip span {
		padding-left: 10px;
		color: var(--ink-mute);
		font:
			700 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
	}

	.move-chip em {
		position: absolute;
		right: 9px;
		top: 10px;
		color: var(--ink-mute);
		font:
			800 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		font-style: normal;
	}

	.detail-footer,
	.empty-copy {
		margin-top: auto;
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		align-items: baseline;
		gap: 7px 12px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: color-mix(in srgb, var(--paper-deep), transparent 30%);
	}

	.detail-footer span,
	.empty-copy span {
		color: var(--ink-mute);
		font:
			700 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.detail-footer strong,
	.empty-copy strong {
		min-width: 0;
		color: var(--ink);
		font:
			750 var(--pksx-type-label) var(--pksx-font-mono),
			monospace;
		font-weight: 750;
		text-align: right;
		overflow-wrap: anywhere;
	}

	@container detail-rail (width < 260px) or (height <= 260px) {
		.detail-rail {
			order: 2;
			position: static;
			max-height: none;
			min-height: 0;
			border-radius: var(--pksx-radius-lg);
			padding: 10px;
			gap: 10px;
		}

		.portrait-card {
			height: 210px;
		}

		.detail-heading {
			align-items: flex-start;
			justify-content: space-between;
			gap: 8px;
		}

		.move-grid {
			grid-template-columns: 1fr 1fr;
		}
	}

	@container detail-rail (height <= 260px) {
		.move-grid {
			grid-template-columns: 1fr;
		}

		.stat-row {
			grid-template-columns: 34px minmax(0, 1fr) 28px;
		}

		.stat-row em {
			display: none;
		}
	}
</style>
