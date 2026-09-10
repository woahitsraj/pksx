<script lang="ts">
	import SaveFileLedger from '$lib/components/pksx/SaveFileLedger.svelte';
	import type { SaveFileLedgerView } from '$lib/components/pksx/save-file-ledger/types';
	import { onDestroy, untrack } from 'svelte';
	import {
		createSaveFileTrainerMoneyController,
		type SaveFileTrainerMoneyControllerOptions
	} from './index.svelte';

	let options: SaveFileTrainerMoneyControllerOptions = $props();
	const controller = untrack(() => createSaveFileTrainerMoneyController(options));
	let ledger: SaveFileLedger;
	let bindings = $derived(controller.ledgerProps);
	let trainerMoneyView = $derived.by(() => {
		const view = bindings.view;
		if (view.status !== 'ready') return view;
		return {
			...view,
			projection: {
				...view.projection,
				inventory: {
					supported: false,
					unsupportedReason: 'Bag editing is outside this focused harness.',
					pockets: []
				}
			}
		} satisfies SaveFileLedgerView;
	});

	export function handleBack() {
		return ledger.handleBack();
	}

	export function currentWorkspace() {
		return controller.workspace;
	}

	export function currentLedgerProps() {
		return controller.ledgerProps;
	}

	export function rejectEditing(message: string) {
		controller.rejectEditing(message);
	}

	onDestroy(controller.dispose);
</script>

<SaveFileLedger bind:this={ledger} {...bindings} view={trainerMoneyView} />
