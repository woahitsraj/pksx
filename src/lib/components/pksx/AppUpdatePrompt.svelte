<script lang="ts">
	import { onMount } from 'svelte';
	import DelayedSpinner from './DelayedSpinner.svelte';

	let updateWorker = $state<ServiceWorker | null>(null);
	let installing = $state(false);

	onMount(() => {
		if (!('serviceWorker' in navigator)) {
			return;
		}

		let registration: ServiceWorkerRegistration | null = null;

		const handleControllerChange = () => {
			if (installing) {
				window.location.reload();
			}
		};

		const watchRegistration = (nextRegistration: ServiceWorkerRegistration) => {
			registration = nextRegistration;

			if (registration.waiting) {
				updateWorker = registration.waiting;
			}

			registration.addEventListener('updatefound', () => {
				const worker = registration?.installing;
				if (!worker) {
					return;
				}

				worker.addEventListener('statechange', () => {
					if (worker.state === 'installed' && navigator.serviceWorker.controller) {
						updateWorker = worker;
					}
				});
			});
		};

		void navigator.serviceWorker.ready.then((readyRegistration) => {
			watchRegistration(readyRegistration);
			return readyRegistration.update();
		});

		navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

		return () => {
			navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
		};
	});

	function installUpdate() {
		if (!updateWorker) {
			return;
		}

		installing = true;
		updateWorker.postMessage({ type: 'PKSX_INSTALL_UPDATE' });
	}
</script>

{#if updateWorker}
	<section class="update-prompt" role="status" aria-live="polite">
		<div>
			<strong>Update ready</strong>
			<span>Install the latest PKSX build and refresh cached app files.</span>
		</div>
		<button type="button" disabled={installing} onclick={installUpdate}>Install update</button>
		<DelayedSpinner active={installing} label="Installing update" />
	</section>
{/if}

<style>
	.update-prompt {
		position: fixed;
		right: 18px;
		bottom: 18px;
		z-index: 1000;
		width: min(420px, calc(100% - 28px));
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 12px;
		border: 1px solid var(--pksx-color-border-strong);
		border-radius: var(--pksx-radius-lg);
		background: var(--pksx-color-surface-panel);
		box-shadow: var(--pksx-shadow-panel);
		color: var(--pksx-color-text-primary);
	}

	.update-prompt div {
		flex: 1 1 240px;
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.update-prompt strong {
		font-size: var(--pksx-type-body);
		font-weight: 800;
	}

	.update-prompt span {
		color: var(--pksx-color-text-secondary);
		font-size: var(--pksx-type-label);
		font-weight: 600;
		line-height: 1.25;
	}

	.update-prompt button {
		flex: 0 0 auto;
		padding: 9px 12px;
		border: 0;
		border-radius: var(--pksx-radius-md);
		background: var(--pksx-color-accent-primary);
		box-shadow: var(--pksx-shadow-subtle);
		color: white;
		font: inherit;
		font-size: var(--pksx-type-label);
		font-weight: 800;
		cursor: pointer;
	}

	.update-prompt button:disabled {
		cursor: wait;
		opacity: 0.72;
	}
</style>
