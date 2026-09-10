<script lang="ts">
	import SaveFileLedger from '$lib/components/pksx/SaveFileLedger.svelte';
	import type { EngineApi } from '$lib/engine';
	import type { WorkspaceState } from '$lib/pksx/backup-workflow';
	import {
		type PendingSaveFileEdit,
		type SaveFileEditCoordinator
	} from '$lib/pksx/save-file-edit-coordinator';
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
	let workspace = $state.raw(untrack(() => initialWorkspace));
	let origin = untrack(() => coordinatorInstance.openWorkspace(initialWorkspace, activeBox));
	let editingUnavailable = $state.raw<{ message: string; retrying?: boolean } | null>(null);
	let pendingTargets = $state.raw(pendingKeys(coordinatorInstance.listPending(origin)));
	const controller = untrack(() =>
		createSaveFileBagController({
			getWorkspace: () => workspace,
			getOrigin: () => origin,
			subscribeOrigin: (listener) => {
				listener(origin);
				return () => undefined;
			},
			coordinator: coordinatorInstance,
			engine,
			toast,
			acceptWorkspace: (next) => (workspace = next),
			getEditingUnavailable: () => editingUnavailable,
			rejectEditing: (message) => (editingUnavailable = { message })
		})
	);
	const unsubscribePending = coordinatorInstance.subscribePending(origin, (pending) => {
		pendingTargets = pendingKeys(pending);
	});
	let ledger: SaveFileLedger;
	let bindings = $derived(controller.ledgerProps);
	let view = $derived({
		status: 'ready' as const,
		originalFilename: workspace.file.originalFileName ?? 'Untitled Save File',
		summary: workspace.workspace.summary,
		projection: workspace.workspace.saveFile!,
		editingUnavailable
	});

	export function handleBack() {
		return ledger.handleBack();
	}

	export function currentWorkspace() {
		return workspace;
	}

	export function currentLedgerProps() {
		return controller.ledgerProps;
	}

	export function currentPendingTargets() {
		return pendingTargets;
	}

	onDestroy(() => {
		controller.dispose();
		unsubscribePending();
	});

	function pendingKeys(pending: readonly PendingSaveFileEdit[]) {
		return [...new Set(pending.map(({ key }) => key))];
	}
</script>

<SaveFileLedger bind:this={ledger} {...bindings} {view} {pendingTargets} />
