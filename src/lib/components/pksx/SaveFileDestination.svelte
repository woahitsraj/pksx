<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import SaveFileLedger from '$lib/components/pksx/SaveFileLedger.svelte';
	import type {
		SaveFileLedgerDestination,
		SaveFileLedgerProps,
		SaveFileLedgerView
	} from '$lib/components/pksx/save-file-ledger/types';
	import { updateAppChrome } from '$lib/pksx/app-chrome.svelte';
	import { getDestinationFocusIdentityGetter } from '$lib/pksx/destination-focus-context.svelte';
	import { createSaveFileBagController } from '$lib/pksx/save-file-bag/index.svelte';
	import { createSaveFileTrainerMoneyController } from '$lib/pksx/save-file-trainer-money/index.svelte';
	import {
		getActiveWorkspaceService,
		getCachedActiveWorkspaceBox,
		getPkhexEngine,
		getSaveFileEditCoordinator,
		getSavesStorage,
		loadActiveWorkspaceFromSaves
	} from '$lib/pksx/saves-cache';
	import { getRouteBackRegistrar } from '$lib/pksx/route-back-context.svelte';
	import { getToastHost } from '$lib/pksx/toast/host.svelte';
	import type { WorkspaceState } from '$lib/pksx/backup-workflow';
	import type { EngineApi } from '$lib/engine';
	import type { SaveFileEditCoordinator } from '$lib/pksx/save-file-edit-coordinator';

	type Props = { destination: SaveFileLedgerDestination };

	let { destination }: Props = $props();
	const workspaceService = getActiveWorkspaceService();
	const workspaceReader = workspaceService as typeof workspaceService & {
		load: (saveFileId: string, activeBox?: number) => Promise<WorkspaceState | null>;
	};
	const toast = getToastHost();
	const storage = getSavesStorage();
	const getDestinationFocusIdentity = getDestinationFocusIdentityGetter();
	const registerRouteBack = getRouteBackRegistrar();
	let coordinator: SaveFileEditCoordinator | null = null;
	let engine: EngineApi | null = null;
	let ledger: SaveFileLedger;
	let view = $state.raw<SaveFileLedgerView>({ status: 'loading' });
	let session = $state.raw<ReturnType<typeof createSaveFileTrainerMoneyController> | null>(null);
	let bag = $state.raw<ReturnType<typeof createSaveFileBagController> | null>(null);
	let unsubscribeWorkspace: () => void = () => undefined;
	let unsubscribeSessionOrigin: () => void = () => undefined;
	let loadRequest = 0;
	let mounted = false;

	const ledgerProps = $derived.by<SaveFileLedgerProps>(() => {
		const common = {
			destination,
			getSessionFocusIdentity: () => getDestinationFocusIdentity?.(destination) ?? null,
			onBackToBoxes: () => void goto(resolve('/'), { keepFocus: true }),
			onRetryLoad: retryLoad
		};
		if (!session) return { ...common, view };

		const shared = session.ledgerProps;
		if (destination === 'trainer') return { ...common, ...shared, destination };

		const bagBindings = bag?.ledgerProps;
		return bagBindings
			? {
					...common,
					destination,
					view: shared.view,
					pendingTargets: shared.pendingTargets,
					onRetryEditing: shared.onRetryEditing,
					...bagBindings
				}
			: { ...common, view: shared.view };
	});

	onMount(() => {
		mounted = true;
		coordinator = getSaveFileEditCoordinator();
		engine = getPkhexEngine();
		updateAppChrome({ carryActive: false, controllerInputActive: true });
		const unregisterBack = registerRouteBack?.(() => ledger?.handleBack() ?? false);
		void loadWorkspace(false);

		return () => {
			mounted = false;
			loadRequest += 1;
			unsubscribeWorkspace();
			unregisterBack?.();
			disposeSession();
		};
	});

	function retryLoad() {
		if (view.status === 'load-failed' && view.retrying !== true) void loadWorkspace(true);
	}

	async function loadWorkspace(retrying: boolean) {
		const request = ++loadRequest;
		view =
			retrying && view.status === 'load-failed'
				? { ...view, retrying: true }
				: { status: 'loading' };
		try {
			const workspace = await loadActiveWorkspaceFromSaves();
			if (!mounted || request !== loadRequest) return;
			if (!workspace) {
				disposeSession();
				view = { status: 'no-active-save' };
				updateAppChrome({ hasLoadedSave: false });
				return;
			}
			installSession(workspace);
			bindWorkspacePublication();
		} catch (error) {
			if (!mounted || request !== loadRequest) return;
			disposeSession();
			view = { status: 'load-failed', message: errorMessage(error) };
			updateAppChrome({ hasLoadedSave: false });
		}
	}

	function bindWorkspacePublication() {
		unsubscribeWorkspace();
		unsubscribeWorkspace = workspaceService.subscribe((workspace) => {
			if (!mounted) return;
			if (!workspace) {
				disposeSession();
				view = { status: 'no-active-save' };
				updateAppChrome({ hasLoadedSave: false });
				return;
			}
			if (
				!session ||
				session.workspace.file.id !== workspace.file.id ||
				session.workspace.file.importedAt !== workspace.file.importedAt
			) {
				installSession(workspace);
				return;
			}
			session.acceptWorkspace(workspace);
		});
	}

	function installSession(workspace: WorkspaceState) {
		if (!coordinator || !engine) return;
		disposeSession();
		const activeBox = getCachedActiveWorkspaceBox();
		let installedSession: ReturnType<typeof createSaveFileTrainerMoneyController>;
		installedSession = createSaveFileTrainerMoneyController({
			workspace,
			activeBox,
			coordinator,
			toast,
			reloadWorkspace: () => reloadSessionWorkspace(installedSession, workspace, activeBox)
		});
		session = installedSession;
		let initialOrigin = true;
		unsubscribeSessionOrigin = installedSession.subscribeOrigin(() => {
			if (initialOrigin) {
				initialOrigin = false;
				return;
			}
			const accepted = installedSession.workspace;
			const current = workspaceService.current;
			if (
				mounted &&
				session === installedSession &&
				current?.file.id === accepted.file.id &&
				current.file.importedAt === accepted.file.importedAt
			) {
				workspaceService.set(accepted, activeBox);
			}
		});
		if (destination === 'bag') {
			bag = createSaveFileBagController({
				getWorkspace: () => installedSession.workspace,
				getOrigin: () => installedSession.origin,
				subscribeOrigin: installedSession.subscribeOrigin,
				coordinator,
				engine,
				toast,
				acceptWorkspace: installedSession.acceptWorkspace,
				getEditingUnavailable: () => installedSession.editingUnavailable,
				rejectEditing: installedSession.rejectEditing
			});
		}
		view = installedSession.ledgerProps.view;
		updateAppChrome({ hasLoadedSave: true });
	}

	async function reloadSessionWorkspace(
		installedSession: ReturnType<typeof createSaveFileTrainerMoneyController>,
		expected: WorkspaceState,
		activeBox: number
	) {
		const reloaded = await workspaceReader.load(expected.file.id, activeBox);
		const activeSaveFileId = await storage.getActiveSaveFileId();
		const current = workspaceService.current;
		if (
			!mounted ||
			session !== installedSession ||
			activeSaveFileId !== expected.file.id ||
			current?.file.id !== expected.file.id ||
			current.file.importedAt !== expected.file.importedAt ||
			reloaded?.file.importedAt !== expected.file.importedAt
		) {
			return null;
		}
		return reloaded;
	}

	function disposeSession() {
		bag?.dispose();
		bag = null;
		unsubscribeSessionOrigin();
		unsubscribeSessionOrigin = () => undefined;
		session?.dispose();
		session = null;
	}

	function errorMessage(error: unknown) {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<div class="save-file-destination">
	<SaveFileLedger bind:this={ledger} {...ledgerProps} />
</div>

<style>
	:global(.app-shell:has(.save-file-destination)) {
		height: 100dvh;
		min-height: 100dvh;
		overflow: hidden;
	}

	.save-file-destination {
		width: 100%;
		min-width: 0;
		min-height: 0;
		flex: 1 1 0;
		overflow: hidden;
	}
</style>
