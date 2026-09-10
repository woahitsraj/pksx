<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import type { BackupMetadata, StoredSaveFile } from '$lib/pksx/saves';
	import {
		createManualBackup,
		createRestoredSaveFileName,
		deleteOwnedBackup,
		preserveBackupAsSeparateSave,
		restoreBackupToWorkspace,
		type WorkspaceState
	} from '$lib/pksx/backup-workflow';
	import {
		getActiveWorkspaceService,
		getCachedActiveWorkspaceBox,
		getPkhexEngine,
		getSavesStorage,
		invalidateSavesCache,
		loadActiveWorkspaceFromSaves,
		setCachedActiveWorkspace
	} from '$lib/pksx/saves-cache';
	import { getSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';
	import TakeoverFrame from './TakeoverFrame.svelte';

	type BrowserState =
		| { kind: 'loading' }
		| { kind: 'no-active' }
		| { kind: 'browsing' }
		| { kind: 'confirm-restore'; backup: BackupMetadata }
		| { kind: 'confirm-delete'; backup: BackupMetadata }
		| {
				kind: 'working';
				action: 'create' | 'restore' | 'separate' | 'delete';
				backup: BackupMetadata | null;
		  };

	const reasonLabels: Record<BackupMetadata['reason'], string> = {
		manual: 'Manual',
		'pokemon-movement': 'Pokemon movement',
		'pokemon-editing': 'Pokemon editing',
		'pokemon-creation': 'Pokemon creation',
		'trainer-editing': 'Trainer editing',
		'inventory-editing': 'Inventory editing',
		'legality-fix': 'Legality fix',
		evolution: 'Evolution'
	};

	const storage = getSavesStorage();
	const host = getSummonedWorkflowHost();
	let browserState = $state<BrowserState>({ kind: 'loading' });
	let owner = $state<StoredSaveFile | null>(null);
	let workspace = $state<WorkspaceState | null>(null);
	let backups = $state<BackupMetadata[]>([]);
	let selectedBackupId = $state<string | null>(null);
	let errorMessage = $state<string | null>(null);
	const busy = $derived(browserState.kind === 'working');
	const confirming = $derived(
		browserState.kind === 'confirm-restore' || browserState.kind === 'confirm-delete'
	);

	onMount(() => {
		const unsubscribe = getActiveWorkspaceService().subscribe((next) => {
			if (owner && next?.file.id === owner.id) workspace = next;
		});
		void loadBrowser();
		return unsubscribe;
	});

	async function loadBrowser() {
		browserState = { kind: 'loading' };
		errorMessage = null;
		try {
			const activeId = await storage.getActiveSaveFileId();
			if (!activeId) {
				browserState = { kind: 'no-active' };
				await focusControl('backup-browser-close');
				return;
			}

			const activeOwner = await storage.getSave(activeId);
			if (!activeOwner) {
				browserState = { kind: 'no-active' };
				await focusControl('backup-browser-close');
				return;
			}

			owner = activeOwner;
			workspace = await loadActiveWorkspaceFromSaves();
			await reloadBackups();
			browserState = { kind: 'browsing' };
			selectedBackupId = backups[0]?.id ?? null;
			await focusSelectedBackupOrCreate();
		} catch (error) {
			errorMessage = getErrorMessage(error);
			browserState = { kind: 'browsing' };
			await focusControl('backup-browser-close');
		}
	}

	async function reloadBackups() {
		if (!owner) return;
		backups = [...(await storage.listBackups(owner.id))].sort((left, right) =>
			right.createdAt.localeCompare(left.createdAt)
		);
	}

	async function createBackup() {
		if (!owner || !workspace || busy) return;
		browserState = { kind: 'working', action: 'create', backup: null };
		errorMessage = null;
		try {
			const created = await createManualBackup({
				storage,
				owner,
				workspaceBytes: workspace.bytes
			});
			invalidateSavesCache();
			await reloadBackups();
			selectedBackupId = created.id;
			browserState = { kind: 'browsing' };
			await focusSelectedBackupOrCreate();
		} catch (error) {
			errorMessage = getErrorMessage(error);
			browserState = { kind: 'browsing' };
			await focusControl('backup-browser-create');
		}
	}

	async function restoreBackup(backup: BackupMetadata) {
		if (!owner || busy) return;
		browserState = { kind: 'working', action: 'restore', backup };
		errorMessage = null;
		try {
			await restoreBackupToWorkspace({
				storage,
				engine: getPkhexEngine(),
				owner,
				backup,
				box: getCachedActiveWorkspaceBox(),
				publish: setCachedActiveWorkspace
			});
			invalidateSavesCache();
			dismissBrowser();
		} catch (error) {
			errorMessage = getErrorMessage(error);
			browserState = { kind: 'browsing' };
			selectedBackupId = backup.id;
			await focusSelectedBackupOrCreate();
		}
	}

	async function deleteBackup(backup: BackupMetadata) {
		if (!owner || busy) return;
		const deletedIndex = backups.findIndex(({ id }) => id === backup.id);
		browserState = { kind: 'working', action: 'delete', backup };
		errorMessage = null;
		try {
			await deleteOwnedBackup({ storage, owner, backup });
			invalidateSavesCache();
			await reloadBackups();
			selectedBackupId = backups[deletedIndex]?.id ?? backups[deletedIndex - 1]?.id ?? null;
			browserState = { kind: 'browsing' };
			await focusSelectedBackupOrCreate();
		} catch (error) {
			errorMessage = getErrorMessage(error);
			browserState = { kind: 'browsing' };
			selectedBackupId = backup.id;
			await focusSelectedBackupOrCreate();
		}
	}

	async function keepBackupAsSaveFile(backup: BackupMetadata) {
		if (!owner || busy) return;
		browserState = { kind: 'working', action: 'separate', backup };
		errorMessage = null;
		try {
			const preserved = await preserveBackupAsSeparateSave({
				storage,
				engine: getPkhexEngine(),
				owner,
				backup,
				fileName: createRestoredSaveFileName(owner.originalFileName),
				box: getCachedActiveWorkspaceBox(),
				publish: (state) => {
					host.closeAll();
					setCachedActiveWorkspace(state, getCachedActiveWorkspaceBox(), {
						adoptAsActiveSave: true
					});
				}
			});
			invalidateSavesCache();
			await goto(resolve('/'), { keepFocus: true });
			await new Promise<void>((resolveFocus) => {
				const focusDestination = () => {
					const slot = document.getElementById(`box-${getCachedActiveWorkspaceBox()}-slot-0`);
					const destination = document.querySelector<HTMLElement>(
						'.boxes-route[data-initial-state="ready"]'
					);
					if (!slot || destination?.dataset.activeSaveFileId !== preserved.file.id) return false;
					slot.focus();
					return document.activeElement === slot;
				};
				if (focusDestination()) return resolveFocus();
				const observer = new MutationObserver(() => {
					if (!focusDestination()) return;
					observer.disconnect();
					resolveFocus();
				});
				observer.observe(document.documentElement, {
					childList: true,
					subtree: true,
					attributes: true
				});
				setTimeout(() => {
					observer.disconnect();
					resolveFocus();
				}, 15_000);
			});
		} catch (error) {
			errorMessage = getErrorMessage(error);
			browserState = { kind: 'browsing' };
			selectedBackupId = backup.id;
			await focusSelectedBackupOrCreate();
		}
	}

	function requestRestore(backup: BackupMetadata) {
		selectedBackupId = backup.id;
		browserState = { kind: 'confirm-restore', backup };
		void focusControl('backup-browser-confirm-restore');
	}

	function requestDelete(backup: BackupMetadata) {
		selectedBackupId = backup.id;
		browserState = { kind: 'confirm-delete', backup };
		void focusControl('backup-browser-confirm-delete');
	}

	function confirmRestore() {
		if (browserState.kind === 'confirm-restore') void restoreBackup(browserState.backup);
	}

	function confirmDelete() {
		if (browserState.kind === 'confirm-delete') void deleteBackup(browserState.backup);
	}

	function guardedBack() {
		if (browserState.kind === 'working') return;
		if (browserState.kind === 'confirm-restore' || browserState.kind === 'confirm-delete') {
			browserState = { kind: 'browsing' };
			void focusSelectedBackupOrCreate();
			return;
		}
		dismissBrowser();
	}

	function dismissBrowser() {
		const launcher = host.dismiss();
		if (launcher) queueMicrotask(() => document.getElementById(launcher.id)?.focus());
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!host.active || host.active.kind !== 'backup-browser') return;
		if (event.key === 'Escape' || event.key === 'Backspace') {
			event.preventDefault();
			event.stopPropagation();
			guardedBack();
			return;
		}
		if (
			busy ||
			!['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Enter', ' '].includes(event.key)
		) {
			return;
		}

		const controls = listControls();
		if (controls.length === 0) return;
		const activeIndex =
			document.activeElement instanceof HTMLButtonElement
				? controls.indexOf(document.activeElement)
				: -1;
		const index = Math.max(0, activeIndex);
		const nextIndex =
			event.key === 'ArrowUp' || event.key === 'ArrowLeft'
				? (index + controls.length - 1) % controls.length
				: event.key === 'ArrowDown' || event.key === 'ArrowRight'
					? (index + 1) % controls.length
					: index;
		event.preventDefault();
		event.stopPropagation();
		controls[nextIndex]?.focus();
		controls[nextIndex]?.scrollIntoView({ block: 'nearest' });
		if (event.key === 'Enter' || event.key === ' ') controls[nextIndex]?.click();
	}

	function listControls() {
		const scope = confirming ? '.confirmation ' : '';
		return Array.from(
			document.querySelectorAll<HTMLButtonElement>(
				`${scope}[data-backup-browser-control]:not([disabled])`
			)
		);
	}

	async function focusSelectedBackupOrCreate() {
		await tick();
		const id = selectedBackupId
			? `backup-browser-restore-${selectedBackupId}`
			: 'backup-browser-create';
		document.getElementById(id)?.focus();
	}

	async function focusControl(id: string) {
		await tick();
		document.getElementById(id)?.focus();
	}

	function getErrorMessage(error: unknown) {
		return error instanceof Error && error.message
			? error.message
			: 'PKSX could not complete the operation.';
	}

	function formatTimestamp(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value
			: new Intl.DateTimeFormat(undefined, {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				}).format(date);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<TakeoverFrame
	labelledby="backup-browser-title"
	describedby="backup-browser-description"
	{busy}
	onBack={guardedBack}
>
	<div class="backup-browser">
		<header>
			<div>
				<p>Active Save File</p>
				<h2 id="backup-browser-title">Backup Browser</h2>
				<span id="backup-browser-description">
					{owner?.originalFileName ?? 'Create and restore snapshots of the active Workspace.'}
				</span>
			</div>
			<button
				id="backup-browser-close"
				data-backup-browser-control
				type="button"
				aria-label="Close Backup Browser"
				disabled={busy}
				onclick={guardedBack}>×</button
			>
		</header>

		{#if browserState.kind === 'loading'}
			<div class="empty-state" aria-live="polite">Loading Backups...</div>
		{:else if browserState.kind === 'no-active'}
			<div class="empty-state">
				<strong>No active Save File</strong>
				<p>Import or activate a Save File before browsing Backups.</p>
			</div>
		{:else}
			<div class="backup-toolbar">
				<div>
					<strong>{backups.length} {backups.length === 1 ? 'Backup' : 'Backups'}</strong>
					<span>Newest first</span>
				</div>
				<button
					id="backup-browser-create"
					data-backup-browser-control
					type="button"
					disabled={busy || confirming || !workspace}
					onclick={() => void createBackup()}
				>
					{browserState.kind === 'working' && browserState.action === 'create'
						? 'Creating...'
						: 'Create Backup'}
				</button>
			</div>

			{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}

			<div class="backup-list" aria-label="Backups">
				{#each backups as backup (backup.id)}
					<article class:selected={selectedBackupId === backup.id}>
						<div>
							<strong>{reasonLabels[backup.reason]}</strong>
							<span>{formatTimestamp(backup.createdAt)}</span>
						</div>
						<button
							id={`backup-browser-restore-${backup.id}`}
							data-backup-browser-control
							type="button"
							disabled={busy || confirming}
							onfocus={() => (selectedBackupId = backup.id)}
							onclick={() => requestRestore(backup)}>Restore</button
						>
						<button
							id={`backup-browser-separate-${backup.id}`}
							data-backup-browser-control
							type="button"
							disabled={busy || confirming}
							onfocus={() => (selectedBackupId = backup.id)}
							onclick={() => void keepBackupAsSaveFile(backup)}>Keep as Save File</button
						>
						<button
							id={`backup-browser-delete-${backup.id}`}
							data-backup-browser-control
							type="button"
							class="danger"
							disabled={busy || confirming}
							onfocus={() => (selectedBackupId = backup.id)}
							onclick={() => requestDelete(backup)}>Delete</button
						>
					</article>
				{:else}
					<div class="empty-state compact">
						<strong>No Backups yet</strong>
						<p>Create a Backup to preserve the current Workspace.</p>
					</div>
				{/each}
			</div>

			{#if browserState.kind === 'confirm-restore'}
				<div class="confirmation" aria-live="polite">
					<div>
						<strong>Restore this Backup?</strong>
						<p>
							{workspace?.dirty
								? 'This replaces the Dirty Workspace. The original imported Save File remains unchanged.'
								: 'This replaces the current Workspace. The original imported Save File remains unchanged.'}
						</p>
					</div>
					<button data-backup-browser-control type="button" onclick={guardedBack}
						>Keep current</button
					>
					<button
						id="backup-browser-confirm-restore"
						data-backup-browser-control
						type="button"
						onclick={confirmRestore}>Restore</button
					>
				</div>
			{:else if browserState.kind === 'confirm-delete'}
				<div class="confirmation" aria-live="polite">
					<div>
						<strong>Delete this Backup?</strong>
						<p>This removes the Backup from this device. This cannot be undone.</p>
					</div>
					<button data-backup-browser-control type="button" onclick={guardedBack}>Keep</button>
					<button
						id="backup-browser-confirm-delete"
						data-backup-browser-control
						type="button"
						class="danger"
						onclick={confirmDelete}>Delete</button
					>
				</div>
			{/if}
		{/if}
	</div>
</TakeoverFrame>

<style>
	.backup-browser {
		height: 100%;
		min-height: 0;
		display: grid;
		grid-template-rows: auto auto auto minmax(0, 1fr) auto;
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-3);
		overflow: hidden;
	}

	header {
		grid-row: 1;
	}

	.backup-toolbar {
		grid-row: 2;
	}

	.error {
		grid-row: 3;
	}

	.backup-list,
	.empty-state {
		grid-row: 4;
	}

	.confirmation {
		grid-row: 5;
	}

	header,
	.backup-toolbar,
	article,
	.confirmation {
		display: flex;
		align-items: center;
		gap: var(--pksx-space-2);
	}

	header,
	.backup-toolbar {
		justify-content: space-between;
	}

	header div,
	.backup-toolbar div,
	article div,
	.empty-state,
	.confirmation div {
		display: grid;
		gap: var(--pksx-space-1);
	}

	p,
	h2 {
		margin: 0;
	}

	header p,
	.backup-toolbar span,
	article span {
		color: var(--pksx-color-text-muted);
		font: 700 var(--pksx-type-caption) / 1.2 var(--pksx-font-mono);
		text-transform: uppercase;
	}

	h2 {
		font-size: var(--pksx-type-display);
		line-height: 1;
	}

	header span,
	.empty-state p,
	.confirmation p {
		color: var(--pksx-color-text-secondary);
		font-size: var(--pksx-type-body);
	}

	button {
		min-height: var(--pksx-control-height);
		padding: 0 var(--pksx-space-3);
		border: var(--pksx-border-width) solid var(--pksx-color-border-strong);
		border-radius: var(--pksx-radius-medium);
		background: var(--pksx-color-surface-subtle);
		color: var(--pksx-color-text-primary);
		font: 750 var(--pksx-type-label) / 1 var(--pksx-font-sans);
		cursor: pointer;
	}

	header button {
		width: var(--pksx-control-height);
		padding: 0;
		font-size: var(--pksx-type-title);
	}

	button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	button:focus-visible {
		outline: var(--pksx-focus-ring) solid var(--pksx-color-accent-primary);
		outline-offset: calc(var(--pksx-focus-ring) * -1);
	}

	.backup-toolbar {
		padding-block: var(--pksx-space-1);
		border-block: 1px solid var(--pksx-color-border-subtle);
	}

	.backup-list {
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
	}

	article {
		min-width: 0;
		max-width: 100%;
		overflow: hidden;
		padding: var(--pksx-space-2);
		border-bottom: 1px solid var(--pksx-color-border-subtle);
	}

	article.selected {
		background: var(--pksx-color-accent-wash);
	}

	article div,
	.confirmation div {
		min-width: 0;
		flex: 1;
	}

	.danger {
		color: var(--pksx-color-feedback-danger);
	}

	.error {
		padding: var(--pksx-space-2);
		border-radius: var(--pksx-radius-small);
		background: color-mix(in oklch, var(--pksx-color-feedback-danger) 12%, transparent);
		color: var(--pksx-color-feedback-danger);
		font-size: var(--pksx-type-body);
	}

	.empty-state {
		place-content: center;
		min-height: 0;
		text-align: center;
	}

	.empty-state.compact {
		height: 100%;
	}

	.confirmation {
		padding: var(--pksx-space-2);
		border: 1px solid var(--pksx-color-border-strong);
		border-radius: var(--pksx-radius-medium);
		background: var(--pksx-color-surface-canvas);
	}

	@container pksx-density (max-width: 520px) {
		article {
			flex-wrap: wrap;
		}

		article div {
			flex-basis: 100%;
		}

		.confirmation {
			align-items: stretch;
			flex-wrap: wrap;
		}

		.confirmation div {
			flex-basis: 100%;
		}
	}
</style>
