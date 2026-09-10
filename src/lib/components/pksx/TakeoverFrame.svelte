<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		labelledby: string;
		describedby?: string;
		busy?: boolean;
		onBack: () => void;
		children: Snippet;
	}

	let { labelledby, describedby, busy = false, onBack, children }: Props = $props();

	function handleBackdrop(event: MouseEvent) {
		if (!(event.target instanceof Element) || !event.target.closest('.takeover-frame')) onBack();
	}
</script>

<div class="takeover-backdrop" role="presentation" onclick={handleBackdrop}>
	<div class="takeover-safe-canvas">
		<div
			class="takeover-frame pksx-density-container"
			role="dialog"
			aria-modal="true"
			aria-labelledby={labelledby}
			aria-describedby={describedby}
			aria-busy={busy}
		>
			<div class="takeover-content pksx-density">
				{@render children()}
			</div>
		</div>
	</div>
</div>

<style>
	.takeover-backdrop {
		position: fixed;
		z-index: 700;
		inset: 0;
		contain: strict;
		overflow: hidden;
		padding: var(--pksx-safe-area-top) var(--pksx-safe-area-right) var(--pksx-safe-area-bottom)
			var(--pksx-safe-area-left);
		background: color-mix(in oklch, var(--pksx-color-text-primary) 48%, transparent);
	}

	.takeover-safe-canvas {
		container: pksx-takeover / size;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		place-items: center;
		overflow: hidden;
	}

	.takeover-frame {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: visible;
		contain: layout paint;
	}

	.takeover-content {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		background: var(--pksx-color-surface-panel);
		color: var(--pksx-color-text-primary);
		box-shadow:
			inset 0 0 0 1px var(--pksx-color-border-strong),
			var(--pksx-shadow-panel);
	}

	@container pksx-takeover style(--pksx-height-band: tall) {
		.takeover-frame {
			width: min(760px, 100%);
			height: min(560px, 100%);
		}

		.takeover-content {
			border-radius: var(--pksx-radius-large);
		}
	}
</style>
