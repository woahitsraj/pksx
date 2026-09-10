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
	<button type="button" class="box-arrow" aria-label="Previous box" onclick={onPreviousBox}
		>‹</button
	>

	<div class="box-title">
		<h2>{source.activeBoxLabel}</h2>
		<span>
			<em>BOX {String(source.activeBoxNumber).padStart(2, '0')}/{source.boxCount}</em>
			<b>{source.occupied} / {source.capacity} occupied</b>
		</span>
	</div>

	<button type="button" class="box-arrow" aria-label="Next box" onclick={onNextBox}>›</button>
</div>

<style>
	.box-source-controls {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.box-title {
		min-width: 0;
		display: grid;
		gap: 2px;
		justify-items: center;
		text-align: center;
	}

	.box-title h2 {
		margin: 0;
		font-size: 1.45rem;
		line-height: 1;
	}

	.box-title span {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.04em;
	}

	.box-title em {
		font-style: normal;
	}

	.box-title b {
		font-weight: 700;
	}

	.box-arrow {
		flex: 0 0 auto;
		width: 38px;
		min-height: 38px;
		padding: 0;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-hi);
		box-shadow: var(--shadow-sm);
		color: var(--ink);
		font-size: 1.2rem;
		font-weight: 700;
	}

	.box-arrow:hover {
		background: var(--rust-wash);
		color: var(--rust);
	}
</style>
