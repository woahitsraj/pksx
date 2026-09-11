<script lang="ts">
	import type { SlotView } from './types';

	interface Props {
		id: string;
		slot: SlotView;
		zone: 'party' | 'box';
		focused: boolean;
		dualType: boolean;
		style: string;
		rowIndex: number;
		colIndex: number;
		spriteUrl: string | null;
		carried?: { label: string; mode: 'move' | 'copy'; spriteUrl?: string | null } | null;
		destinationState?: 'valid' | 'invalid' | 'source' | null;
		onFocusSlot: () => void;
		onChooseSlot?: () => void;
	}

	let {
		id,
		slot,
		zone,
		focused,
		dualType,
		style,
		rowIndex,
		colIndex,
		spriteUrl,
		carried = null,
		destinationState = null,
		onFocusSlot,
		onChooseSlot
	}: Props = $props();

	const zoneClass = $derived(zone === 'party' ? 'party-slot' : 'box-slot');
	const slotNumber = $derived(zone === 'party' ? `P${slot.slot + 1}` : String(slot.slot + 1));
	const accessibleDetails = $derived(
		[
			slot.label,
			slot.detail || (slot.kind === 'pokemon' && slot.level !== null ? `Level ${slot.level}` : null)
		]
			.filter(Boolean)
			.join(', ')
	);
	const accessibleLabel = $derived(
		`${zone === 'party' ? 'Party' : 'Box'} Slot ${slot.slot + 1}, row ${rowIndex}, column ${colIndex}: ${accessibleDetails}${carried ? `. Carry ${carried.mode === 'move' ? 'Move' : 'Copy'} ${carried.label}` : ''}`
	);
	function handleClick() {
		onFocusSlot();

		if (onChooseSlot) {
			onChooseSlot();
		}
	}
</script>

<button
	{id}
	data-pksx-control-category="slot"
	class={[
		'slot',
		zoneClass,
		slot.kind,
		dualType && 'dual-type',
		focused && 'focused',
		destinationState && `destination-${destinationState}`
	]}
	type="button"
	role="gridcell"
	tabindex="-1"
	{style}
	aria-selected={focused}
	aria-label={accessibleLabel}
	aria-rowindex={rowIndex}
	aria-colindex={colIndex}
	data-destination-state={destinationState ?? undefined}
	onfocus={onFocusSlot}
	onclick={handleClick}
>
	<span class="slot-number">{slotNumber}</span>
	<span class="sprite-stage" aria-hidden="true">
		{#if slot.kind === 'pokemon' && spriteUrl}
			<img class="slot-sprite" src={spriteUrl} alt="" width="96" height="96" />
		{:else if slot.kind === 'pokemon'}
			<span class="slot-sprite missing-sprite"></span>
		{:else}
			<span class="slot-sprite empty-sprite"></span>
		{/if}
	</span>
	<span class="slot-label">
		{#if slot.kind === 'pokemon' && slot.level !== null}<em>Lv {slot.level}</em>{/if}
		<span>{slot.label}</span>
	</span>
	{#if slot.detail}
		<span class="slot-detail">{slot.detail}</span>
	{/if}
	{#if carried}
		<span class="carry-at-focus" aria-label={`${carried.mode} ${carried.label}`}>
			{#if carried.spriteUrl}
				<img src={carried.spriteUrl} alt="" width="48" height="48" />
			{/if}
			<strong>{carried.mode === 'move' ? 'MOVE' : 'COPY'}</strong>
		</span>
	{/if}
</button>

<style>
	.slot {
		--slot-hue: 48;
		--slot-chroma: 0.09;
		--slot-hue-2: var(--slot-hue);
		--slot-chroma-2: var(--slot-chroma);
		--slot-fill: oklch(0.9 var(--slot-chroma) var(--slot-hue));
		--slot-fill-2: oklch(0.9 var(--slot-chroma-2) var(--slot-hue-2));
		position: relative;
		container-type: size;
		width: 100%;
		height: 100%;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border: 0;
		border-radius: var(--pksx-radius-md);
		background: var(--slot-fill);
		box-shadow: var(--shadow-sm);
		color: var(--ink);
		overflow: visible;
		transition:
			transform 120ms ease,
			box-shadow 120ms ease,
			filter 120ms ease;
	}

	.slot.dual-type {
		background: linear-gradient(
			135deg,
			var(--slot-fill) 0%,
			var(--slot-fill) 55%,
			var(--slot-fill-2) 55%,
			var(--slot-fill-2) 100%
		);
	}

	:global(.app-shell.dark) .slot {
		--slot-fill: color-mix(
			in oklch,
			var(--paper-hi) 84%,
			oklch(0.72 calc(var(--slot-chroma) * 0.35) var(--slot-hue)) 16%
		);
		--slot-fill-2: color-mix(
			in oklch,
			var(--paper-hi) 84%,
			oklch(0.72 calc(var(--slot-chroma-2) * 0.35) var(--slot-hue-2)) 16%
		);
	}

	:global(.app-shell.dark) .slot.dual-type {
		background: linear-gradient(
			135deg,
			var(--slot-fill) 0%,
			var(--slot-fill) 55%,
			var(--slot-fill-2) 55%,
			var(--slot-fill-2) 100%
		);
	}

	.slot.pokemon:hover,
	.slot.focused {
		transform: translateY(-1px);
		box-shadow:
			0 0 0 2px var(--rust),
			inset 0 0 0 1px color-mix(in srgb, white, transparent 38%),
			var(--shadow);
	}

	.slot.empty {
		border: 1.5px dashed var(--rule-hi);
		background: color-mix(in srgb, var(--paper-deep), transparent 35%);
		box-shadow: none;
		color: var(--ink-soft);
	}

	.slot.empty.focused {
		border-style: solid;
		border-color: var(--rust);
		box-shadow:
			0 0 0 2px var(--rust),
			var(--shadow);
	}

	.slot.destination-invalid {
		filter: grayscale(0.6);
		opacity: 0.46;
	}

	.slot.destination-valid {
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--ok), transparent 22%),
			var(--shadow-sm);
	}

	.slot.destination-source {
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--gold), transparent 20%),
			var(--shadow-sm);
	}

	.slot.destination-invalid.focused {
		opacity: 0.72;
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--err), transparent 18%),
			var(--shadow);
	}

	.box-slot,
	.party-slot {
		aspect-ratio: 1;
	}

	.slot-number {
		display: none;
		position: absolute;
		top: 4px;
		left: 5px;
		z-index: 3;
		color: color-mix(in srgb, var(--ink), transparent 30%);
		font:
			700 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.04em;
	}

	.sprite-stage {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border-radius: calc(var(--pksx-radius-md) - 2px);
		background: transparent;
		pointer-events: none;
	}

	.slot.empty .sprite-stage {
		inset: 8px;
		background: color-mix(in srgb, var(--paper), transparent 68%);
	}

	.slot-sprite {
		display: block;
		width: auto;
		height: 100%;
		max-width: 100%;
		max-height: 100%;
		min-width: 0;
		min-height: 0;
	}

	img.slot-sprite {
		width: 92%;
		height: 92%;
		aspect-ratio: 1;
		border-radius: 0;
		background: none;
		box-shadow: none;
		object-fit: contain;
		image-rendering: pixelated;
	}

	.empty-sprite,
	.missing-sprite {
		aspect-ratio: 1;
		border-radius: 0;
		background: none;
		box-shadow: none;
	}

	.empty-sprite {
		width: 50%;
		height: 50%;
		max-width: 34px;
		max-height: 34px;
		border: 1.25px dashed var(--rule-hi);
		border-radius: var(--pksx-radius-sm);
		background: color-mix(in srgb, var(--paper-hi), transparent 56%);
	}

	.missing-sprite {
		width: 68%;
		height: 68%;
		max-width: 44px;
		max-height: 44px;
		border: 1px solid color-mix(in srgb, var(--ink), transparent 45%);
		border-radius: var(--pksx-radius-sm);
		background: color-mix(in srgb, var(--paper), transparent 40%);
	}

	.missing-sprite::before {
		content: '?';
		display: grid;
		width: 100%;
		height: 100%;
		place-items: center;
		color: color-mix(in srgb, var(--ink), transparent 35%);
		font:
			800 var(--pksx-type-title) var(--pksx-font-mono),
			monospace;
	}

	.slot-label,
	.slot-detail {
		position: relative;
		z-index: 3;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.box-slot .slot-label,
	.party-slot .slot-label {
		position: absolute;
		left: 4px;
		right: 4px;
		bottom: 4px;
		min-height: 17px;
		display: none;
		align-items: center;
		justify-content: center;
		gap: 3px;
		padding: 2px 3px;
		border-radius: var(--pksx-radius-xs);
		background: color-mix(in srgb, var(--paper-hi), transparent 26%);
		color: color-mix(in srgb, var(--ink), transparent 18%);
		font-size: var(--pksx-type-caption);
		font-weight: 750;
		text-align: center;
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink), transparent 92%);
	}

	.slot.empty .slot-label {
		background: transparent;
		box-shadow: none;
		color: color-mix(in srgb, var(--ink), transparent 46%);
	}

	.box-slot .slot-detail,
	.party-slot .slot-detail {
		display: none;
	}

	.box-slot .slot-label em,
	.party-slot .slot-label em {
		flex: 0 0 auto;
		display: inline;
		margin: 0;
		color: color-mix(in srgb, var(--ink), transparent 45%);
		font:
			700 var(--pksx-type-caption) var(--pksx-font-mono),
			monospace;
		font-style: normal;
		letter-spacing: 0;
	}

	.box-slot .slot-label span,
	.party-slot .slot-label span {
		display: block;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.carry-at-focus {
		position: absolute;
		inset: 3px;
		z-index: 8;
		display: grid;
		place-items: center;
		border: var(--pksx-border-width) solid var(--rust);
		border-radius: var(--pksx-radius-small);
		background: color-mix(in srgb, var(--paper-hi), transparent 12%);
		box-shadow: 0 0 0 var(--pksx-focus-ring) var(--rust-ring);
		pointer-events: none;
	}

	.carry-at-focus img {
		width: 72%;
		height: 72%;
		object-fit: contain;
		image-rendering: pixelated;
	}

	.carry-at-focus strong {
		position: absolute;
		right: var(--pksx-space-1);
		bottom: var(--pksx-space-1);
		padding: var(--pksx-border-width) var(--pksx-space-1);
		border-radius: var(--pksx-radius-small);
		background: var(--rust);
		color: var(--paper-hi);
		font: 800 var(--pksx-type-caption) / 1 var(--pksx-font-mono);
	}

	@container (min-width: 46px) and (min-height: 46px) {
		.slot-number {
			display: block;
		}

		img.slot-sprite {
			width: 88%;
			height: 88%;
			max-width: 88%;
			max-height: 88%;
		}
	}

	@container (min-width: 66px) and (min-height: 66px) {
		.box-slot .slot-label,
		.party-slot .slot-label {
			display: flex;
		}

		img.slot-sprite {
			width: 79%;
			height: 79%;
			max-width: 79%;
			max-height: 79%;
		}
	}
</style>
