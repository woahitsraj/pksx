<script lang="ts">
	import SaveFileLedger from '../SaveFileLedger.svelte';
	import { untrack } from 'svelte';
	import type {
		SaveFileLedgerCatalogue,
		SaveFileLedgerCommand,
		SaveFileLedgerDestination,
		SaveFileLedgerView
	} from './types';

	interface Props {
		destination: SaveFileLedgerDestination;
		initialView: SaveFileLedgerView;
		initialCatalogues?: Readonly<Record<string, SaveFileLedgerCatalogue>>;
		pendingTargets?: readonly string[];
		getSessionFocusIdentity?: () => string | null;
	}

	let {
		destination,
		initialView,
		initialCatalogues = {},
		pendingTargets = [],
		getSessionFocusIdentity
	}: Props = $props();
	let view = $state(untrack(() => initialView));
	let command = $state<SaveFileLedgerCommand | null>(null);
	let catalogues = $state(untrack(() => initialCatalogues));
	let pending = $state(untrack(() => pendingTargets));
	let ledger: { handleBack: () => boolean };

	export function setView(next: SaveFileLedgerView) {
		view = next;
	}

	export function setCatalogues(next: Readonly<Record<string, SaveFileLedgerCatalogue>>) {
		catalogues = next;
	}

	export function setPendingTargets(next: readonly string[]) {
		pending = next;
	}

	export function setCommand(next: SaveFileLedgerCommand | null) {
		command = next;
	}

	export function handleBack() {
		return ledger.handleBack();
	}

	function removeItem(removal: Extract<SaveFileLedgerCommand, { kind: 'remove-item' }>) {
		if (view.status !== 'ready') return;
		view = {
			...view,
			projection: {
				...view.projection,
				inventory: {
					...view.projection.inventory,
					pockets: view.projection.inventory.pockets.map((pocket) =>
						pocket.key === removal.pocketKey
							? {
									...pocket,
									items: pocket.items.filter((item) => item.id !== removal.itemId)
								}
							: pocket
					)
				}
			}
		};
		command = null;
	}
</script>

<SaveFileLedger
	bind:this={ledger}
	{destination}
	{view}
	{command}
	{catalogues}
	pendingTargets={pending}
	{getSessionFocusIdentity}
	onCommandChange={(next) => (command = next)}
	onRemoveItem={removeItem}
/>
