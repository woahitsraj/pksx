<script lang="ts">
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import ConfirmDialog from '$lib/components/pksx/ConfirmDialog.svelte';
	import { base64ToBytes, type EngineError, type PartySlotSummary } from '$lib/engine';
	import {
		type BackupMetadata,
		type SaveFileId,
		type StoredPokemonStorage,
		type StoredSaveFile
	} from '$lib/pksx/saves';
	import { appChrome } from '$lib/pksx/app-chrome.svelte';
	import {
		createRestoredSaveFileName,
		createManualBackup as createOwnedManualBackup,
		deleteOwnedBackup,
		preserveBackupAsSeparateSave
	} from '$lib/pksx/backup-workflow';
	import { resolveSpriteCatalogEntry } from '$lib/pksx/sprite-catalog';
	import {
		getCachedActiveWorkspace,
		getCachedActiveWorkspaceBox,
		getCachedSavesSnapshot,
		getSavesStorage,
		getPkhexEngine,
		getSavesSnapshot,
		invalidateActiveWorkspaceCache,
		invalidateSavesCache,
		isCachedSavesSnapshotSeeded,
		setCachedActiveWorkspace,
		type SaveCardDetails,
		type SavesSnapshot
	} from '$lib/pksx/saves-cache';
	import { getSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';

	type BackupMap = Record<SaveFileId, BackupMetadata[]>;
	type SaveDetailsMap = Record<SaveFileId, SaveCardDetails | null>;
	type PokemonStorageSummary = {
		boxCount: number;
		occupied: number;
		updatedAt: string;
	};
	type PendingDelete =
		| { kind: 'save'; saveFile: StoredSaveFile }
		| { kind: 'backup'; saveFile: StoredSaveFile; backup: BackupMetadata };

	const storage = getSavesStorage();
	const summonedWorkflow = getSummonedWorkflowHost();
	const backupReasonLabels: Record<BackupMetadata['reason'], string> = {
		manual: 'Manual',
		'pokemon-movement': 'Pokemon movement',
		'pokemon-editing': 'Pokemon editing',
		'pokemon-creation': 'Pokemon creation',
		'trainer-editing': 'Trainer editing',
		'inventory-editing': 'Inventory editing',
		'legality-fix': 'Legality Fix',
		evolution: 'Evolution'
	};
	const gameNames: Record<string, string> = {
		E: 'Pokemon Emerald',
		COLO: 'Pokemon Colosseum',
		XD: 'Pokemon XD',
		X: 'Pokemon X',
		Y: 'Pokemon Y',
		OR: 'Pokemon Omega Ruby',
		AS: 'Pokemon Alpha Sapphire',
		SN: 'Pokemon Sun',
		MN: 'Pokemon Moon',
		US: 'Pokemon Ultra Sun',
		UM: 'Pokemon Ultra Moon',
		SV: 'Pokemon Scarlet / Violet'
	};

	let saveFiles = $state<StoredSaveFile[]>([]);
	let activeSaveFileId = $state<SaveFileId | null>(null);
	let selectedSaveFileId = $state<SaveFileId | null>(null);
	let storageSelected = $state(true);
	let backupsBySaveFileId = $state<BackupMap>({});
	let detailsBySaveFileId = $state<SaveDetailsMap>({});
	let pokemonStorageSummary = $state<PokemonStorageSummary | null>(null);
	let statusMessage = $state('Loading Saves...');
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);
	let activeControlIndex = $state(0);
	let pendingDelete = $state<PendingDelete | null>(null);
	let savesRefreshRequest = 0;
	let backupBrowserWasActive = false;

	const selectedSaveFile = $derived(
		storageSelected
			? null
			: (saveFiles.find((saveFile) => saveFile.id === selectedSaveFileId) ?? saveFiles[0] ?? null)
	);
	const selectedBackups = $derived(
		selectedSaveFile ? (backupsBySaveFileId[selectedSaveFile.id] ?? []) : []
	);
	const activeSaveFile = $derived(
		saveFiles.find((saveFile) => saveFile.id === activeSaveFileId) ?? null
	);
	const activeDetails = $derived(
		activeSaveFile ? (detailsBySaveFileId[activeSaveFile.id] ?? null) : null
	);
	const importSave = (file: File) => void importSaveFile(file);

	$effect(() => {
		appChrome.route = 'saves';
		appChrome.saveSummary = activeDetails?.summary ?? null;
		appChrome.boxCount = activeDetails?.summary.boxCount ?? 0;
		appChrome.activeBox = 0;
		appChrome.fileName = activeSaveFile?.originalFileName ?? null;
		appChrome.busy = busy;
		appChrome.hasLoadedSave = activeSaveFile !== null;
		appChrome.controllerInputActive = true;
		appChrome.importSave = importSave;
		appChrome.exportSave = exportActiveSave;
	});

	onMount(() => {
		const cachedSnapshot = getCachedSavesSnapshot();
		const cachedSnapshotSeeded = isCachedSavesSnapshotSeeded();
		if (cachedSnapshot) {
			applySavesSnapshot(cachedSnapshot, selectedSaveFileId);
			statusMessage = cachedSnapshot.saveFiles.length > 0 ? 'Saves ready.' : statusMessage;
		}

		void refreshSaves({ force: !cachedSnapshot || cachedSnapshotSeeded });
		return summonedWorkflow.subscribe((active) => {
			if (active?.kind === 'backup-browser') {
				backupBrowserWasActive = true;
				return;
			}
			if (!backupBrowserWasActive) return;
			backupBrowserWasActive = false;
			void refreshSaves({ force: true });
		});
	});

	function handleRouteKeydown(event: KeyboardEvent) {
		if (summonedWorkflow.active) return;
		const action = keyboardAction(event);
		if (!action) {
			return;
		}

		event.preventDefault();
		dispatchControlAction(action);
	}

	function keyboardAction(event: KeyboardEvent): 'previous' | 'next' | 'confirm' | null {
		switch (event.key) {
			case 'ArrowLeft':
			case 'ArrowUp':
				return 'previous';
			case 'ArrowRight':
			case 'ArrowDown':
				return 'next';
			case 'Enter':
			case ' ':
				return 'confirm';
			default:
				return null;
		}
	}

	function dispatchControlAction(action: 'previous' | 'next' | 'confirm') {
		const controls = getFocusableControls();
		if (controls.length === 0) {
			return;
		}

		const activeElement = document.activeElement;
		const focusedIndex =
			activeElement instanceof HTMLElement ? controls.indexOf(activeElement) : -1;
		const currentIndex = focusedIndex >= 0 ? focusedIndex : activeControlIndex;
		const nextIndex =
			action === 'previous'
				? (currentIndex + controls.length - 1) % controls.length
				: action === 'next'
					? (currentIndex + 1) % controls.length
					: currentIndex;
		const control = controls[nextIndex];
		activeControlIndex = nextIndex;
		control.focus();
		control.scrollIntoView({ block: 'nearest', inline: 'nearest' });

		if (action === 'confirm') {
			control.click();
		}
	}

	function getFocusableControls() {
		if (pendingDelete) {
			return Array.from(
				document.querySelectorAll<HTMLElement>('.dialog-panel button:not([disabled])')
			).filter((control) => isFocusableControl(control));
		}

		const selectors = [
			'#top-control-0',
			'#top-control-1',
			'#top-control-2',
			'#top-control-3',
			'#top-control-4',
			'[data-saves-control]',
			'#mobile-tab-0',
			'#mobile-tab-1',
			'#mobile-tab-2'
		];

		return selectors
			.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
			.filter((control) => isFocusableControl(control));
	}

	function isFocusableControl(control: HTMLElement) {
		if (control.hidden || control.getAttribute('aria-disabled') === 'true') {
			return false;
		}

		if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
			return !control.disabled;
		}

		return control.tabIndex >= 0 || control.getAttribute('role') === 'button';
	}

	async function refreshSaves(
		options: { preferredSelection?: SaveFileId | null; force?: boolean } = {}
	) {
		const request = ++savesRefreshRequest;
		const [snapshot, appStorage] = await Promise.all([
			getSavesSnapshot({ force: options.force }),
			storage.getPokemonStorage()
		]);
		if (request !== savesRefreshRequest) {
			return;
		}

		pokemonStorageSummary = summarizePokemonStorage(appStorage);
		applySavesSnapshot(snapshot, options.preferredSelection ?? selectedSaveFileId);
		statusMessage =
			snapshot.saveFiles.length > 0 || pokemonStorageSummary
				? 'Saves ready.'
				: 'Import a Save File to begin.';
	}

	function applySavesSnapshot(
		snapshot: SavesSnapshot,
		preferredSelection: SaveFileId | null = selectedSaveFileId
	) {
		saveFiles = snapshot.saveFiles;
		activeSaveFileId = snapshot.activeSaveFileId;
		const nextSelectedSaveFileId =
			preferredSelection &&
			snapshot.saveFiles.some((saveFile) => saveFile.id === preferredSelection)
				? preferredSelection
				: storageSelected
					? null
					: (snapshot.activeSaveFileId ?? snapshot.saveFiles[0]?.id ?? null);
		selectedSaveFileId = nextSelectedSaveFileId;
		storageSelected = nextSelectedSaveFileId === null;
		backupsBySaveFileId = snapshot.backupsBySaveFileId;
		detailsBySaveFileId = snapshot.detailsBySaveFileId;
	}

	function selectPokemonStorage() {
		storageSelected = true;
		selectedSaveFileId = null;
		statusMessage = 'Pokemon Storage selected.';
	}

	function openPokemonStorage() {
		selectPokemonStorage();
		void goto(resolve('/?source=pokemon-storage'));
	}

	async function openBoxesRoute() {
		await goto(resolve('/'));
	}

	function openBackupBrowser() {
		summonedWorkflow.open('backup-browser', {
			type: 'control',
			id: 'browse-active-backups'
		});
	}

	function selectSaveFile(saveFileId: SaveFileId) {
		storageSelected = false;
		selectedSaveFileId = saveFileId;
	}

	function summarizePokemonStorage(
		storageRecord: StoredPokemonStorage | null
	): PokemonStorageSummary {
		const boxCount = storageRecord?.boxCount ?? 3;
		const occupied =
			storageRecord?.boxes.reduce(
				(total, box) => total + box.slots.filter((slot) => slot.pokemon !== null).length,
				0
			) ?? 0;

		return {
			boxCount,
			occupied,
			updatedAt: storageRecord?.updatedAt ?? new Date().toISOString()
		};
	}

	async function importSaveFile(file: File) {
		busy = true;
		savesRefreshRequest += 1;
		errorMessage = null;
		statusMessage = `Reading ${file.name}...`;

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			await loadWorkspace(bytes, file.name);
			const stored = await storage.importSave({ bytes, originalFileName: file.name });
			invalidateSavesCache();
			invalidateActiveWorkspaceCache();
			await refreshSaves({ preferredSelection: stored.id, force: true });
			statusMessage = `${file.name} imported and made active.`;
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Import failed. Current active Save File was not changed.';
			await refreshSaves();
			statusMessage = 'Import failed. Current active Save File was not changed.';
		} finally {
			busy = false;
		}
	}

	async function handleImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';

		if (file) {
			await importSaveFile(file);
		}
	}

	function openImportPicker() {
		document.getElementById('save-file-input')?.click();
	}

	async function switchActiveSave(saveFile: StoredSaveFile) {
		if (saveFile.id === activeSaveFileId) {
			selectedSaveFileId = saveFile.id;
			statusMessage = `${displayName(saveFile)} is already active.`;
			await openBoxesRoute();
			return;
		}

		busy = true;
		errorMessage = null;
		statusMessage = `Opening ${displayName(saveFile)}...`;

		try {
			const bytes = await storage.getSaveBytes(saveFile.id);
			if (!bytes) {
				throw new Error('The selected Save File is missing its stored bytes.');
			}

			await loadWorkspace(bytes, saveFile.originalFileName ?? undefined);
			const active = await storage.setActiveSaveFileId(saveFile.id);
			invalidateSavesCache();
			invalidateActiveWorkspaceCache();
			await refreshSaves({ preferredSelection: active.id, force: true });
			statusMessage = `${displayName(active)} is active.`;
			await openBoxesRoute();
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Could not switch Save File.';
		} finally {
			busy = false;
		}
	}

	async function createManualBackup(saveFile: StoredSaveFile) {
		busy = true;
		errorMessage = null;
		statusMessage = `Creating Backup for ${displayName(saveFile)}...`;

		try {
			const activeWorkspace = getCachedActiveWorkspace();
			const persistedWorkspace = await storage.getWorkspace(saveFile.id);
			const bytes =
				activeWorkspace?.file.id === saveFile.id
					? activeWorkspace.bytes
					: (persistedWorkspace?.bytes ?? (await storage.getSaveBytes(saveFile.id)));
			if (!bytes) {
				throw new Error('The selected Save File is missing its Workspace bytes.');
			}

			await createOwnedManualBackup({ storage, owner: saveFile, workspaceBytes: bytes });
			invalidateSavesCache();
			await refreshSaves({ preferredSelection: saveFile.id, force: true });
			statusMessage = 'Backup created.';
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Backup failed.';
		} finally {
			busy = false;
		}
	}

	function requestDeleteSaveFile(saveFile: StoredSaveFile) {
		pendingDelete = { kind: 'save', saveFile };
	}

	function requestDeleteBackup(saveFile: StoredSaveFile, backup: BackupMetadata) {
		pendingDelete = { kind: 'backup', saveFile, backup };
	}

	function closeDeleteDialog() {
		if (!busy) {
			pendingDelete = null;
		}
	}

	async function confirmPendingDelete() {
		const deletion = pendingDelete;
		if (!deletion) {
			return;
		}

		if (deletion.kind === 'save') {
			await deleteSaveFile(deletion.saveFile);
		} else {
			await deleteBackup(deletion.saveFile, deletion.backup);
		}
	}

	async function deleteSaveFile(saveFile: StoredSaveFile) {
		busy = true;
		errorMessage = null;
		statusMessage = `Deleting ${displayName(saveFile)}...`;

		try {
			await storage.deleteSave(saveFile.id);
			invalidateSavesCache();
			invalidateActiveWorkspaceCache(saveFile.id);
			await refreshSaves({ force: true });
			pendingDelete = null;
			statusMessage = `${displayName(saveFile)} deleted.`;
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Could not delete Save File.';
		} finally {
			busy = false;
		}
	}

	async function deleteBackup(saveFile: StoredSaveFile, backup: BackupMetadata) {
		busy = true;
		errorMessage = null;
		statusMessage = 'Deleting Backup...';

		try {
			await deleteOwnedBackup({ storage, owner: saveFile, backup });
			invalidateSavesCache();
			await refreshSaves({ preferredSelection: saveFile.id, force: true });
			pendingDelete = null;
			statusMessage = 'Backup deleted.';
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Could not delete Backup.';
		} finally {
			busy = false;
		}
	}

	async function restoreBackup(saveFile: StoredSaveFile, backup: BackupMetadata) {
		busy = true;
		errorMessage = null;
		statusMessage = 'Opening Backup as a Save File...';

		try {
			const restored = await preserveBackupAsSeparateSave({
				storage,
				engine: getPkhexEngine(),
				owner: saveFile,
				backup,
				fileName: createRestoredSaveFileName(saveFile.originalFileName),
				box: getCachedActiveWorkspaceBox(),
				publish: setCachedActiveWorkspace
			});
			invalidateSavesCache();
			await refreshSaves({ preferredSelection: restored.file.id, force: true });
			statusMessage = 'Backup opened as a separate active Save File.';
			await openBoxesRoute();
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Backup restore failed.';
		} finally {
			busy = false;
		}
	}

	async function exportActiveSave() {
		if (!activeSaveFile) {
			return;
		}

		busy = true;
		errorMessage = null;
		statusMessage = 'Serializing Save File...';

		try {
			const bytes = await storage.getSaveBytes(activeSaveFile.id);
			if (!bytes) {
				throw new Error('The active Save File is missing its stored bytes.');
			}

			const result = await getPkhexEngine().serializeSave(
				bytes,
				activeSaveFile.originalFileName ?? undefined
			);
			if (!result.ok) {
				throw result.error;
			}

			const serialized = base64ToBytes(result.value.bytesBase64, result.value.byteLength);
			downloadBytes(serialized, createExportFileName(activeSaveFile.originalFileName));
			statusMessage = 'Export ready.';
		} catch (error) {
			errorMessage = getErrorMessage(error);
			statusMessage = 'Export failed.';
		} finally {
			busy = false;
		}
	}

	async function loadWorkspace(bytes: Uint8Array, fileName: string | undefined) {
		const result = await getPkhexEngine().loadSaveWorkspace(bytes, fileName, 0);
		if (!result.ok) {
			throw result.error;
		}
	}

	function displayName(saveFile: StoredSaveFile) {
		return saveFile.originalFileName ?? 'Save File';
	}

	function gameTitle(details: SaveCardDetails | null, saveFile: StoredSaveFile) {
		if (!details) {
			return displayName(saveFile);
		}

		return gameNames[details.summary.gameVersion] ?? `Pokemon ${details.summary.gameVersion}`;
	}

	function saveSubtitle(details: SaveCardDetails | null, saveFile: StoredSaveFile) {
		const parts = [displayName(saveFile)];
		if (details) {
			parts.push(`Gen ${details.summary.generation}`);
		}
		parts.push(new Date(saveFile.importedAt).getFullYear().toString());
		return parts.join(' · ');
	}

	function formatRelativeTimestamp(value: string) {
		const date = new Date(value);
		const now = Date.now();
		const elapsed = now - date.getTime();
		if (Number.isNaN(elapsed)) {
			return value;
		}

		const minutes = Math.max(0, Math.floor(elapsed / 60000));
		if (minutes < 1) return 'Now';
		if (minutes < 60) return `${minutes}m ago`;

		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h ago`;
		if (hours < 48) return 'Yesterday';

		const days = Math.floor(hours / 24);
		if (days < 7) return `${days} days ago`;
		if (days < 14) return 'Last week';
		if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
		return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
	}

	function formatTimestamp(value: string) {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			return value;
		}

		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(date);
	}

	function formatPlayTime(details: SaveCardDetails | null) {
		if (!details) {
			return '--';
		}

		const hours = details.summary.playedHours;
		const tenths = Math.floor(details.summary.playedMinutes / 6);
		return `${hours}.${tenths}h`;
	}

	function formatTrainer(details: SaveCardDetails | null) {
		if (!details) {
			return '--';
		}

		return `${details.summary.trainerName ?? 'Unknown'} · ${String(details.summary.trainerId).padStart(5, '0')}`;
	}

	function formatBytes(value: number) {
		if (value < 1024) return `${value} bytes`;
		if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
		return `${(value / (1024 * 1024)).toFixed(1)} MB`;
	}

	function partyPreview(details: SaveCardDetails | null) {
		const slots = details?.partySlots ?? [];
		return Array.from({ length: 6 }, (_, index) => slots[index] ?? null);
	}

	function spriteUrlFor(slot: PartySlotSummary | null): string | null {
		if (!slot || slot.isEmpty) {
			return null;
		}

		const entry = resolveSpriteCatalogEntry(
			slot.spriteIdentity ?? {
				speciesId: slot.speciesId,
				form: slot.form,
				isEgg: slot.isEgg,
				isShiny: false,
				displaySex: 'default'
			}
		);
		return entry ? asset(entry.path) : null;
	}

	function createExportFileName(fileName: string | null) {
		if (!fileName) {
			return 'pksx-export.sav';
		}

		const lastDot = fileName.lastIndexOf('.');
		if (lastDot <= 0) {
			return `${fileName}.pksx`;
		}

		return `${fileName.slice(0, lastDot)}.pksx${fileName.slice(lastDot)}`;
	}

	function deleteDialogTitle(deletion: PendingDelete) {
		if (deletion.kind === 'save') {
			return `Delete ${displayName(deletion.saveFile)}?`;
		}

		return `Delete ${backupReasonLabels[deletion.backup.reason]} Backup?`;
	}

	function deleteDialogDescription(deletion: PendingDelete) {
		if (deletion.kind === 'save') {
			return 'This removes the Save File and all of its Backups from this device. This cannot be undone.';
		}

		return `This removes the Backup for ${displayName(deletion.saveFile)} from this device. This cannot be undone.`;
	}

	function downloadBytes(bytes: Uint8Array, fileName: string) {
		const downloadBytes = new Uint8Array(bytes.byteLength);
		downloadBytes.set(bytes);
		const url = URL.createObjectURL(
			new Blob([downloadBytes.buffer], { type: 'application/octet-stream' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	function getErrorMessage(error: unknown) {
		if (isEngineError(error)) {
			return error.message;
		}

		if (error instanceof Error && error.message.length > 0) {
			return error.message;
		}

		return 'PKSX could not complete the operation.';
	}

	function isEngineError(error: unknown): error is EngineError {
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			'message' in error &&
			typeof error.message === 'string'
		);
	}
</script>

<svelte:head>
	<title>Save Files · PKSX</title>
</svelte:head>

<svelte:window onkeydown={handleRouteKeydown} />

<section
	class="saves-page"
	aria-labelledby="saves-title"
	data-controller-status={appChrome.controllerStatus ?? 'No controller detected'}
	inert={summonedWorkflow.active !== null}
>
	<section class="save-picker-panel" aria-labelledby="saves-title">
		<header class="page-bar">
			<div class="page-heading">
				<p>Choose a Save</p>
				<h1 id="saves-title">Save files</h1>
				<span>Manage imported Save Files and app-owned Pokemon Storage.</span>
			</div>
			<input
				id="save-file-input"
				type="file"
				aria-label="Import Save File"
				disabled={busy}
				onchange={handleImport}
			/>
		</header>

		<section class="status-row" aria-live="polite">
			<div>
				<strong
					>{activeSaveFile
						? gameTitle(activeDetails, activeSaveFile)
						: 'No active Save File'}</strong
				>
				<span>{statusMessage}</span>
			</div>
			{#if errorMessage}
				<p>{errorMessage}</p>
			{/if}
		</section>

		<section class="saves-grid" aria-label="Local Save Files">
			<article class={['save-card', 'storage-card', storageSelected && 'selected']}>
				<button
					data-saves-control
					type="button"
					class="save-card-main"
					onclick={selectPokemonStorage}
				>
					<span class="save-title">
						<strong>Pokemon Storage</strong>
						<em>App-owned</em>
					</span>
					<span class="save-subtitle">App-owned local Pokemon boxes</span>
					<span class="stat-strip">
						<span><small>Owner</small>PKSX</span>
						<span><small>Mode</small>Storage</span>
						<span
							><small>Updated</small>{formatRelativeTimestamp(
								pokemonStorageSummary?.updatedAt ?? new Date().toISOString()
							)}</span
						>
					</span>
				</button>

				<div class="storage-preview" aria-label="Pokemon Storage occupancy">
					<span>Storage</span>
					<div>
						<strong>{pokemonStorageSummary?.occupied ?? 0}</strong>
						<small>Pokemon stored</small>
					</div>
				</div>

				<div class="save-footer">
					<span>
						{pokemonStorageSummary?.boxCount ?? 3} boxes · {pokemonStorageSummary?.occupied ?? 0}
						creatures
					</span>
					<div class="card-actions">
						<button
							data-saves-control
							type="button"
							aria-disabled={busy}
							onclick={() => {
								if (!busy) openPokemonStorage();
							}}
						>
							Open →
						</button>
					</div>
				</div>
			</article>

			{#each saveFiles as saveFile (saveFile.id)}
				{@const details = detailsBySaveFileId[saveFile.id] ?? null}
				{@const active = saveFile.id === activeSaveFileId}
				<article
					class={[
						'save-card',
						active && 'active',
						selectedSaveFile?.id === saveFile.id && 'selected'
					]}
					aria-current={active ? 'true' : undefined}
				>
					<button
						data-saves-control
						type="button"
						class="save-card-main"
						onclick={() => selectSaveFile(saveFile.id)}
					>
						<span class="save-title">
							<strong>{gameTitle(details, saveFile)}</strong>
							{#if active}
								<em>Active</em>
							{/if}
						</span>
						<span class="save-subtitle">{saveSubtitle(details, saveFile)}</span>
						<span class="stat-strip">
							<span><small>Trainer</small>{formatTrainer(details)}</span>
							<span><small>Played</small>{formatPlayTime(details)}</span>
							<span><small>Opened</small>{formatRelativeTimestamp(saveFile.updatedAt)}</span>
						</span>
					</button>

					<div class="party-row" aria-label={`${gameTitle(details, saveFile)} party`}>
						<span>Party</span>
						{#each partyPreview(details) as slot, index (index)}
							{@const spriteUrl = spriteUrlFor(slot)}
							<div
								class="party-slot"
								class:empty={!spriteUrl}
								aria-label={`Party slot ${index + 1}`}
							>
								{#if spriteUrl}
									<img src={spriteUrl} alt={slot?.nickname ?? 'Pokemon'} />
								{/if}
							</div>
						{/each}
					</div>

					<div class="save-footer">
						<span>
							{details ? details.summary.boxCount : '--'} boxes · {details
								? details.creatureCount
								: '--'} creatures
						</span>
						<div class="card-actions">
							<button
								data-saves-control
								type="button"
								class="danger-action"
								aria-disabled={busy}
								onclick={() => {
									if (!busy) requestDeleteSaveFile(saveFile);
								}}
							>
								Delete
							</button>
							<button
								data-saves-control
								type="button"
								aria-disabled={busy}
								onclick={() => {
									if (!busy) void switchActiveSave(saveFile);
								}}
							>
								{active ? 'Open' : 'Switch'} →
							</button>
						</div>
					</div>
				</article>
			{/each}

			<button
				data-saves-control
				type="button"
				class="import-card"
				aria-disabled={busy}
				onclick={() => {
					if (!busy) openImportPicker();
				}}
			>
				<span>+</span>
				<h2>Import a Save File</h2>
				<small>Choose a .sav or compatible save file from this device.</small>
			</button>
		</section>

		<section class="backup-panel" aria-label="Save File Backups">
			<header>
				<div>
					<p>Backups</p>
					<h2>
						{selectedSaveFile
							? displayName(selectedSaveFile)
							: storageSelected
								? 'Pokemon Storage'
								: 'No Save File selected'}
					</h2>
				</div>
				<button
					data-saves-control
					type="button"
					aria-disabled={busy || !selectedSaveFile}
					onclick={() => {
						if (!busy && selectedSaveFile) void createManualBackup(selectedSaveFile);
					}}
				>
					Create backup
				</button>
				<button
					id="browse-active-backups"
					data-saves-control
					type="button"
					aria-disabled={busy}
					onclick={() => {
						if (!busy) openBackupBrowser();
					}}
				>
					Browse active Backups
				</button>
			</header>

			<div class="backup-list">
				{#if selectedSaveFile}
					{#each selectedBackups as backup (backup.id)}
						<article class="backup-row">
							<div>
								<strong>{backupReasonLabels[backup.reason]}</strong>
								<span>{formatTimestamp(backup.createdAt)} · {formatBytes(backup.byteLength)}</span>
							</div>
							<button
								data-saves-control
								type="button"
								aria-disabled={busy}
								onclick={() => {
									if (!busy) void restoreBackup(selectedSaveFile, backup);
								}}
							>
								Open
							</button>
							<button
								data-saves-control
								type="button"
								class="danger-action"
								aria-disabled={busy}
								onclick={() => {
									if (!busy) requestDeleteBackup(selectedSaveFile, backup);
								}}
							>
								Delete
							</button>
						</article>
					{:else}
						<p class="empty-backups">No Backups yet.</p>
					{/each}
				{:else}
					<p class="empty-backups">
						{storageSelected
							? 'Pokemon Storage does not use Save File Backups.'
							: 'Import a Save File before creating Backups.'}
					</p>
				{/if}
			</div>
		</section>
	</section>
</section>

{#if pendingDelete}
	<ConfirmDialog
		open={true}
		title={deleteDialogTitle(pendingDelete)}
		description={deleteDialogDescription(pendingDelete)}
		confirmLabel="Delete"
		cancelLabel="Keep"
		tone="danger"
		{busy}
		onCancel={closeDeleteDialog}
		onConfirm={() => void confirmPendingDelete()}
	/>
{/if}

<style>
	.saves-page,
	.saves-page * {
		box-sizing: border-box;
	}

	.saves-page {
		--paper: var(--pksx-color-surface-canvas);
		--paper-hi: var(--pksx-color-surface-panel);
		--paper-deep: var(--pksx-color-surface-subtle);
		--ink: var(--pksx-color-text-primary);
		--ink-soft: var(--pksx-color-text-secondary);
		--ink-mute: var(--pksx-color-text-muted);
		--rule: var(--pksx-color-border-subtle);
		--rust: var(--pksx-color-accent-primary);
		--rust-wash: var(--pksx-color-accent-wash);
		--ok: var(--pksx-color-feedback-success);
		--err: var(--pksx-color-feedback-danger);
		--shadow-sm: var(--pksx-shadow-subtle);
		--shadow-deep: var(--pksx-shadow-panel);
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		gap: 0;
		color: var(--ink);
	}

	.save-picker-panel {
		min-height: 0;
		display: grid;
		gap: 18px;
		padding: 30px;
		overflow-y: auto;
		overscroll-behavior: contain;
		border-radius: var(--pksx-radius-xl);
		background: color-mix(in srgb, var(--paper-hi), transparent 5%);
		box-shadow: var(--shadow-deep);
	}

	.page-bar {
		display: block;
	}

	#save-file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.page-heading {
		display: grid;
		gap: 8px;
	}

	.page-heading p,
	.backup-panel header p,
	.party-row > span,
	.stat-strip small {
		margin: 0;
		color: var(--ink-mute);
		font:
			750 0.72rem var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.16em;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: clamp(2.4rem, 5vw, 4rem);
		line-height: 0.92;
		letter-spacing: 0;
	}

	h2 {
		font-size: 1.15rem;
		line-height: 1.1;
	}

	.page-heading span,
	.status-row span,
	.status-row p,
	.save-subtitle,
	.save-footer span,
	.backup-row span,
	.empty-backups,
	.import-card small {
		color: var(--ink-soft);
		font:
			650 0.78rem var(--pksx-font-mono),
			monospace;
		line-height: 1.4;
	}

	.page-heading span {
		max-width: 620px;
		font:
			700 1rem var(--pksx-font-body),
			sans-serif;
	}

	.status-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 12px;
		padding: 0 2px;
	}

	.status-row div {
		min-width: 0;
		display: grid;
		gap: 3px;
	}

	.status-row p {
		color: var(--err);
	}

	.saves-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}

	.save-card,
	.import-card,
	.backup-panel {
		border-radius: var(--pksx-radius-xl);
		background: var(--paper-hi);
		box-shadow: var(--shadow-sm);
	}

	.save-card {
		min-height: 238px;
		display: grid;
		gap: 14px;
		padding: 18px;
		border: 1px solid var(--rule);
	}

	.save-card.active {
		border-color: var(--rust);
		background:
			linear-gradient(color-mix(in srgb, var(--rust-wash), transparent 42%), transparent 80%),
			var(--paper-hi);
		box-shadow:
			0 0 0 1px color-mix(in srgb, var(--rust), transparent 35%),
			var(--shadow-sm);
	}

	.save-card.storage-card {
		border-color: color-mix(in srgb, var(--ok), var(--rule) 54%);
		background:
			linear-gradient(color-mix(in srgb, var(--ok), transparent 86%), transparent 78%),
			var(--paper-hi);
	}

	.save-card.selected {
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--rust), transparent 70%),
			var(--shadow-sm);
	}

	.save-card-main {
		min-height: 0;
		padding: 0;
		display: grid;
		gap: 9px;
		border: 0;
		background: transparent;
		box-shadow: none;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.save-title {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
	}

	.save-title strong {
		overflow-wrap: anywhere;
		font-size: 1.45rem;
		line-height: 1.02;
		letter-spacing: 0;
	}

	.save-title em {
		flex: 0 0 auto;
		padding: 7px 10px;
		border-radius: var(--pksx-radius-sm);
		background: var(--rust);
		color: var(--paper-hi);
		font:
			850 0.68rem var(--pksx-font-mono),
			monospace;
		font-style: normal;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.stat-strip {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
		box-shadow: var(--shadow-sm);
	}

	.stat-strip > span {
		min-width: 0;
		padding: 10px 12px;
		display: grid;
		gap: 2px;
		border-left: 1px solid var(--rule);
		font:
			850 0.82rem var(--pksx-font-mono),
			monospace;
		overflow-wrap: anywhere;
	}

	.stat-strip > span:first-child {
		border-left: 0;
	}

	.party-row {
		display: grid;
		grid-template-columns: auto repeat(6, minmax(34px, 1fr));
		align-items: center;
		gap: 10px;
	}

	.party-slot {
		aspect-ratio: 1;
		min-width: 0;
		display: grid;
		place-items: center;
		border-radius: var(--pksx-radius-md);
		background: color-mix(in srgb, var(--pksx-color-type-water, #8bd1e8), transparent 78%);
	}

	.party-slot.empty {
		border: 1px dashed var(--rule);
		background: transparent;
	}

	.party-slot img {
		width: min(42px, 86%);
		height: min(42px, 86%);
		object-fit: contain;
		filter: drop-shadow(0 8px 10px rgba(54, 36, 20, 0.14));
	}

	.storage-preview {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 12px;
		padding: 13px 14px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
		box-shadow: var(--shadow-sm);
	}

	.storage-preview > span {
		color: var(--ink-mute);
		font:
			750 0.72rem var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.16em;
	}

	.storage-preview div {
		min-width: 0;
		display: flex;
		align-items: baseline;
		justify-content: flex-end;
		gap: 8px;
	}

	.storage-preview strong {
		font:
			900 1.6rem var(--pksx-font-mono),
			monospace;
		line-height: 1;
	}

	.storage-preview small {
		color: var(--ink-soft);
		font:
			750 0.76rem var(--pksx-font-mono),
			monospace;
	}

	.save-footer,
	.backup-row,
	.backup-panel header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.save-footer {
		padding-top: 12px;
		border-top: 1px solid var(--rule);
	}

	.card-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	button,
	.backup-panel button {
		border: 0;
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-deep);
		color: var(--ink);
		box-shadow: var(--shadow-sm);
		font: inherit;
		font-size: 0.8rem;
		font-weight: 850;
		cursor: pointer;
	}

	.save-footer button,
	.backup-panel button {
		min-height: 34px;
		padding: 0 12px;
		color: var(--rust);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.save-footer button.danger-action,
	.backup-panel button.danger-action {
		color: var(--err);
	}

	button:not([aria-disabled='true']):hover {
		background: var(--rust-wash);
		color: var(--rust);
	}

	button[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.55;
	}

	[data-saves-control]:focus-visible,
	[data-saves-control]:focus {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 58%);
		outline-offset: 3px;
	}

	.import-card {
		min-height: 238px;
		display: grid;
		place-items: center;
		align-content: center;
		gap: 10px;
		padding: 24px;
		border: 1px dashed var(--rule);
		text-align: center;
		cursor: pointer;
	}

	.import-card > span {
		width: 54px;
		height: 54px;
		display: grid;
		place-items: center;
		border-radius: var(--pksx-radius-lg);
		background: var(--paper-deep);
		box-shadow: var(--shadow-sm);
		font-size: 1.45rem;
		font-weight: 850;
	}

	.import-card h2 {
		margin: 0;
		font-size: 1.15rem;
	}

	.import-card small {
		max-width: 290px;
		font-family: var(--pksx-font-body), sans-serif;
	}

	.backup-panel {
		display: grid;
		gap: 12px;
		padding: 16px;
		border: 1px dashed var(--rule);
	}

	.backup-list {
		display: grid;
		gap: 8px;
	}

	.backup-row {
		padding: 12px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-md);
		background: var(--paper-hi);
	}

	.backup-row div {
		min-width: 0;
		display: grid;
		gap: 3px;
		margin-right: auto;
	}

	.empty-backups {
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	@media (max-width: 1180px) {
		.saves-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 1024px) {
		.saves-page {
			flex: 0 0 auto;
			min-height: auto;
			display: block;
		}

		.save-picker-panel {
			min-height: auto;
			padding: 18px;
			overflow: visible;
			overscroll-behavior: auto;
		}

		.saves-grid {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 520px) {
		.save-picker-panel {
			padding: 14px;
			border-radius: var(--pksx-radius-lg);
		}

		.status-row,
		.save-footer,
		.card-actions,
		.backup-row,
		.backup-panel header {
			align-items: stretch;
			grid-template-columns: 1fr;
			flex-direction: column;
		}

		.stat-strip {
			grid-template-columns: 1fr;
		}

		.stat-strip > span {
			border-left: 0;
			border-top: 1px solid var(--rule);
		}

		.stat-strip > span:first-child {
			border-top: 0;
		}
	}
</style>
