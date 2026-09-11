<script lang="ts">
	import SaveFileLedger from '$lib/components/pksx/SaveFileLedger.svelte';
	import type { SaveFileLedgerProps } from '$lib/components/pksx/save-file-ledger/types';
	import type { EngineApi } from '$lib/engine';
	import type { WorkspaceState } from '$lib/pksx/backup-workflow';
	import type { SaveFileEditCoordinator } from '$lib/pksx/save-file-edit-coordinator';
	import { createSaveFileTrainerMoneyController } from '$lib/pksx/save-file-trainer-money/index.svelte';
	import type { ToastHost } from '$lib/pksx/toast/host.svelte';
	import { onDestroy, untrack } from 'svelte';
	import { createSaveFileBagController } from './index.svelte';

	interface Props {
		workspace: WorkspaceState;
		activeBox: number;
		coordinator: SaveFileEditCoordinator;
		engine: Pick<EngineApi, 'getSaveFileInventoryCatalogue'>;
		toast: Pick<ToastHost, 'error'>;
	}

	let { workspace: initialWorkspace, activeBox, coordinator, engine, toast }: Props = $props();
	const coordinatorInstance = untrack(() => coordinator);
	const edits = untrack(() =>
		createSaveFileTrainerMoneyController({
			workspace: initialWorkspace,
			activeBox,
			coordinator: coordinatorInstance,
			toast
		})
	);
	const bag = untrack(() =>
		createSaveFileBagController({
			getWorkspace: () => edits.workspace,
			getOrigin: () => edits.origin,
			subscribeOrigin: edits.subscribeOrigin,
			coordinator: coordinatorInstance,
			engine,
			toast,
			acceptWorkspace: edits.acceptWorkspace,
			getEditingUnavailable: () => edits.editingUnavailable,
			rejectEditing: edits.rejectEditing
		})
	);
	let ledger: SaveFileLedger;
	let bindings = $derived.by(currentBindings);

	export function handleBack() {
		return ledger.handleBack();
	}

	export function currentWorkspace() {
		return edits.workspace;
	}

	export function currentLedgerProps() {
		return currentBindings();
	}

	export function currentPendingTargets() {
		return edits.ledgerProps.pendingTargets;
	}

	export function currentOrigin() {
		return edits.origin;
	}

	onDestroy(() => {
		bag.dispose();
		edits.dispose();
	});

	function currentBindings(): SaveFileLedgerProps {
		const shared = edits.ledgerProps;
		return {
			destination: 'bag',
			view: shared.view,
			pendingTargets: shared.pendingTargets,
			onRetryEditing: shared.onRetryEditing,
			...bag.ledgerProps
		};
	}
</script>

<SaveFileLedger bind:this={ledger} {...bindings} />
