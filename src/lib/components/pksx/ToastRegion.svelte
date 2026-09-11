<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import type { ToastView } from '$lib/pksx/toast/host.svelte';

	interface Props {
		toasts: readonly ToastView[];
	}

	let { toasts }: Props = $props();

	function toastSlide(node: Element) {
		void node;

		return {
			duration: 220,
			easing: cubicOut,
			css: (t: number, u: number) => `
				opacity: ${t};
				transform: translateY(${Math.round(u * 18)}px) scale(${0.98 + t * 0.02});
			`
		};
	}
</script>

<div class="toast-region" role="region" aria-label="Notifications">
	<div class="toast-list" role="status" aria-live="polite" aria-relevant="additions text">
		{#each toasts as toast (toast.id)}
			<section class={['toast', `toast-${toast.tone}`]} transition:toastSlide>
				<span class="toast-mark" aria-hidden="true"></span>
				<span>{toast.message}</span>
			</section>
		{/each}
	</div>
</div>

<style>
	.toast-region {
		position: fixed;
		z-index: 900;
		right: calc(var(--pksx-safe-area-right) + var(--pksx-space-2, 8px));
		bottom: calc(var(--pksx-safe-area-bottom) + var(--pksx-space-2, 8px));
		width: min(
			360px,
			calc(
				100% - var(--pksx-safe-area-left) - var(--pksx-safe-area-right) - var(--pksx-space-2, 8px) -
					var(--pksx-space-2, 8px)
			)
		);
		pointer-events: none;
	}

	.toast-list {
		display: grid;
		gap: var(--pksx-space-2, 8px);
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 9px;
		min-height: 42px;
		padding: 9px 8px 9px 10px;
		border: 1px solid color-mix(in srgb, var(--ink), transparent 88%);
		border-radius: var(--pksx-radius-md);
		background: color-mix(in srgb, var(--paper-hi), white 8%);
		box-shadow:
			0 18px 44px color-mix(in srgb, black, transparent 82%),
			0 5px 14px color-mix(in srgb, black, transparent 88%);
		color: var(--ink);
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1.25;
		will-change: opacity, transform;
	}

	:global(.app-shell.dark) .toast {
		background: color-mix(in srgb, var(--paper-hi), white 4%);
		border-color: color-mix(in srgb, white, transparent 88%);
	}

	.toast > span:not(.toast-mark) {
		flex: 1 1 auto;
		min-width: 0;
	}

	.toast-mark {
		flex: 0 0 auto;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--rust);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--rust), transparent 84%);
	}

	.toast-error .toast-mark {
		background: var(--err);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--err), transparent 84%);
	}

	.toast-success .toast-mark {
		background: var(--ok);
		box-shadow: 0 0 0 4px color-mix(in srgb, var(--ok), transparent 84%);
	}
</style>
