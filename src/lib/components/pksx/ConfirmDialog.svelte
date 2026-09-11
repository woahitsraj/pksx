<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import DelayedSpinner from './DelayedSpinner.svelte';

	type Tone = 'danger' | 'default';

	interface Props {
		open: boolean;
		title: string;
		description?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		tone?: Tone;
		busy?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
		children?: Snippet;
	}

	let {
		open,
		title,
		description,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		tone = 'default',
		busy = false,
		onConfirm,
		onCancel,
		children
	}: Props = $props();

	const uid = $props.id();

	let dialogElement = $state<HTMLDivElement>();
	let cancelButton = $state<HTMLButtonElement>();
	let previouslyFocused: HTMLElement | null = null;
	let wasOpen = false;

	$effect(() => {
		if (open && !wasOpen) {
			previouslyFocused =
				document.activeElement instanceof HTMLElement ? document.activeElement : null;
			void tick().then(() => cancelButton?.focus());
		}

		if (!open && wasOpen) {
			previouslyFocused?.focus();
			previouslyFocused = null;
		}

		wasOpen = open;
	});

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!open) {
			return;
		}

		if (event.key === 'Escape' && !busy) {
			event.preventDefault();
			onCancel();
			return;
		}

		if (event.key !== 'Tab') {
			return;
		}

		const focusableControls = getFocusableControls();
		if (focusableControls.length === 0) {
			return;
		}

		const first = focusableControls[0];
		const last = focusableControls[focusableControls.length - 1];
		const activeElement = document.activeElement;

		if (event.shiftKey && activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	function getFocusableControls() {
		return Array.from(
			dialogElement?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			) ?? []
		).filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if open}
	<div class="dialog-layer" role="presentation" transition:fade={{ duration: 120 }}>
		<button
			type="button"
			class="dialog-scrim"
			aria-label="Cancel"
			disabled={busy}
			onclick={onCancel}
		></button>
		<div
			bind:this={dialogElement}
			class="dialog-panel"
			class:danger={tone === 'danger'}
			role="alertdialog"
			aria-modal="true"
			aria-labelledby={`${uid}-title`}
			aria-describedby={description ? `${uid}-description` : undefined}
			aria-busy={busy}
			tabindex="-1"
			transition:scale={{ duration: 150, start: 0.98 }}
		>
			<div class="dialog-mark" aria-hidden="true">!</div>
			<div class="dialog-copy">
				<h2 id={`${uid}-title`}>{title}</h2>
				{#if description}
					<span id={`${uid}-description`}>{description}</span>
				{/if}
				{@render children?.()}
			</div>
			<div class="dialog-actions">
				<button
					bind:this={cancelButton}
					type="button"
					class="secondary"
					disabled={busy}
					onclick={onCancel}
				>
					{cancelLabel}
				</button>
				<button
					type="button"
					class="primary"
					class:danger={tone === 'danger'}
					disabled={busy}
					onclick={onConfirm}
				>
					{confirmLabel}
				</button>
				<DelayedSpinner active={busy} label="Action in progress" />
			</div>
		</div>
	</div>
{/if}

<style>
	.dialog-layer,
	.dialog-scrim {
		position: fixed;
		inset: 0;
	}

	.dialog-layer {
		z-index: 80;
		display: grid;
		place-items: center;
		padding: 22px;
	}

	.dialog-scrim {
		border: 0;
		border-radius: 0;
		background: color-mix(in srgb, var(--pksx-color-text-primary), transparent 72%);
		backdrop-filter: blur(8px);
		cursor: default;
	}

	.dialog-panel {
		position: relative;
		z-index: 1;
		width: min(480px, 100%);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 16px;
		padding: 22px;
		border: 1px solid var(--pksx-color-border-subtle);
		border-radius: var(--pksx-radius-xl);
		background:
			linear-gradient(
				135deg,
				color-mix(in srgb, var(--pksx-color-accent-wash), transparent 55%),
				transparent 62%
			),
			var(--pksx-color-surface-panel);
		box-shadow: var(--pksx-shadow-panel);
		color: var(--pksx-color-text-primary);
	}

	.dialog-panel.danger {
		border-color: color-mix(in srgb, var(--pksx-color-feedback-danger), transparent 42%);
	}

	.dialog-mark {
		width: 42px;
		height: 42px;
		display: grid;
		place-items: center;
		border-radius: var(--pksx-radius-md);
		background: color-mix(in srgb, var(--pksx-color-feedback-danger), transparent 82%);
		color: var(--pksx-color-feedback-danger);
		font:
			900 1.1rem var(--pksx-font-mono),
			monospace;
	}

	.dialog-copy {
		min-width: 0;
		display: grid;
		gap: 8px;
	}

	.dialog-copy span {
		margin: 0;
		color: var(--pksx-color-text-muted);
	}

	.dialog-copy h2 {
		margin: 0;
		font-size: 1.55rem;
		line-height: 1;
		letter-spacing: 0;
		overflow-wrap: anywhere;
	}

	.dialog-copy span,
	.dialog-copy :global(p) {
		font:
			700 0.95rem var(--pksx-font-body),
			sans-serif;
		line-height: 1.42;
	}

	.dialog-actions {
		grid-column: 1 / -1;
		display: flex;
		justify-content: end;
		gap: 10px;
		padding-top: 6px;
	}

	.dialog-actions button {
		min-height: 42px;
		padding: 0 16px;
		border: 0;
		border-radius: var(--pksx-radius-sm);
		box-shadow: var(--pksx-shadow-subtle);
		font:
			850 0.82rem var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
	}

	.dialog-actions button:focus-visible,
	.dialog-actions button:focus {
		outline: 3px solid color-mix(in srgb, var(--pksx-color-accent-primary), transparent 58%);
		outline-offset: 3px;
	}

	.dialog-actions button[disabled] {
		cursor: not-allowed;
		opacity: 0.58;
	}

	.secondary {
		background: var(--pksx-color-surface-subtle);
		color: var(--pksx-color-text-primary);
	}

	.primary {
		background: var(--pksx-color-accent-primary);
		color: var(--pksx-color-surface-panel);
	}

	.primary.danger {
		background: var(--pksx-color-feedback-danger);
	}

	@media (max-width: 520px) {
		.dialog-layer {
			align-items: end;
			padding: 12px;
		}

		.dialog-panel {
			padding: 18px;
		}

		.dialog-actions {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
</style>
