<script lang="ts">
	import type { BoxSourceView } from './types';

	interface Props {
		source: BoxSourceView;
		onPreviousBox: () => void;
		onNextBox: () => void;
	}

	let { source, onPreviousBox, onNextBox }: Props = $props();
</script>

<div class="box-source-controls" aria-label="Collection controls">
	<button
		type="button"
		data-pksx-control-category="small"
		class="box-arrow"
		aria-label="Previous Location"
		onpointerdown={(event) => event.preventDefault()}
		onclick={onPreviousBox}>‹</button
	>

	<div class="box-title">
		<h2>{source.activeBoxLabel}</h2>
		<span>
			<em
				>{source.location === 'party'
					? 'PARTY'
					: `BOX ${String(source.activeBoxNumber).padStart(2, '0')}/${source.boxCount}`}</em
			>
			<b>{source.occupied} / {source.capacity} occupied</b>
		</span>
	</div>

	<button
		type="button"
		data-pksx-control-category="small"
		class="box-arrow"
		aria-label="Next Location"
		onpointerdown={(event) => event.preventDefault()}
		onclick={onNextBox}>›</button
	>
</div>

<style>
	.box-source-controls {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--pksx-space-2);
	}

	.box-title {
		min-width: 0;
		display: grid;
		gap: var(--pksx-border-width);
		justify-items: center;
		text-align: center;
	}

	.box-title h2 {
		margin: 0;
		font-size: var(--pksx-type-title);
		line-height: 1.05;
	}

	.box-title span {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--pksx-space-1);
		color: var(--ink-mute);
		font: 650 var(--pksx-type-caption) / 1.05 var(--pksx-font-mono);
		letter-spacing: 0.04em;
	}

	.box-title em {
		font-style: normal;
		white-space: nowrap;
	}

	.box-title b {
		font-weight: 700;
		white-space: nowrap;
	}

	.box-arrow {
		flex: 0 0 auto;
		width: var(--pksx-small-control-height);
		height: var(--pksx-small-control-height);
		min-height: var(--pksx-small-control-height);
		padding: 0;
		border-radius: var(--pksx-radius-medium);
		background: var(--paper-hi);
		box-shadow: var(--shadow-sm);
		color: var(--ink);
		font-size: var(--pksx-type-title);
		font-weight: 700;
	}

	.box-arrow:hover {
		background: var(--rust-wash);
		color: var(--rust);
	}
</style>
