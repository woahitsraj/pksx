<script lang="ts">
	import SaveFileLedger from '$lib/components/pksx/SaveFileLedger.svelte';
	import { onDestroy, untrack } from 'svelte';
	import {
		createSaveFileTrainerMoneyController,
		type SaveFileTrainerMoneyControllerOptions
	} from './index.svelte';

	let options: SaveFileTrainerMoneyControllerOptions = $props();
	const controller = untrack(() => createSaveFileTrainerMoneyController(options));
	let ledger: SaveFileLedger;
	let bindings = $derived(controller.ledgerProps);

	export function handleBack() {
		return ledger.handleBack();
	}

	export function currentWorkspace() {
		return controller.workspace;
	}

	export function currentLedgerProps() {
		return controller.ledgerProps;
	}

	onDestroy(controller.dispose);
</script>

<SaveFileLedger destination="trainer" bind:this={ledger} {...bindings} />
