<script module lang="ts">
	let rememberedTargetKey: string | null = null;
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import DelayedSpinner from '$lib/components/pksx/DelayedSpinner.svelte';
	import SaveFileMenu from '$lib/components/pksx/SaveFileMenu.svelte';
	import type { EngineError } from '$lib/engine';
	import { appChrome } from '$lib/pksx/app-chrome.svelte';
	import { isControllerKeyboardEvent } from '$lib/pksx/controller-input';
	import {
		deleteSavesTarget,
		moveSavesTarget,
		resolveSavesTarget,
		sameSavesTarget,
		type SavesDirection,
		type SavesTarget
	} from '$lib/pksx/saves-navigation';
	import type { SaveFileId, StoredPokemonStorage, StoredSaveFile } from '$lib/pksx/saves';
	import {
		getCachedActiveWorkspace,
		getCachedSavesSnapshot,
		getPkhexEngine,
		getSavesSnapshot,
		getSavesStorage,
		invalidateActiveWorkspaceCache,
		invalidateSavesCache,
		isCachedSavesSnapshotSeeded,
		subscribeSavesSnapshot,
		type SaveCardDetailsState,
		type SavesSnapshot
	} from '$lib/pksx/saves-cache';
	import { getSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';
	import { getToastHost } from '$lib/pksx/toast/host.svelte';

	type PokemonStorageSummary = { boxCount: number; pokemonCount: number };
	type SavesGridEntry =
		| { kind: 'save-file'; saveFile: StoredSaveFile; index: number }
		| { kind: 'pokemon-storage'; index: number }
		| { kind: 'import'; index: number };
	const storage = getSavesStorage();
	const summonedWorkflow = getSummonedWorkflowHost();
	const toastHost = getToastHost();
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
	let detailsBySaveFileId = $state<Record<SaveFileId, SaveCardDetailsState>>({});
	let pokemonStorage = $state<PokemonStorageSummary>({ boxCount: 3, pokemonCount: 0 });
	let target = $state<SavesTarget>({ kind: 'import' });
	let gridElement = $state<HTMLElement>();
	let gridList = $state<HTMLElement>();
	let columnCount = $state(1);
	let catalogLoading = $state(true);
	let busyTarget = $state<SaveFileId | 'import' | null>(null);
	let menuSaveFileId = $state<SaveFileId | null>(null);
	let menuReturnTarget = $state<SavesTarget | null>(null);
	let menuIndex = $state(0);
	let deleteDescription = $state<string | null>(null);
	let refreshRequest = 0;

	const targets = $derived<SavesTarget[]>([
		...saveFiles.map((saveFile) => ({ kind: 'save-file' as const, id: saveFile.id })),
		{ kind: 'pokemon-storage' },
		{ kind: 'import' }
	]);
	const menuSaveFile = $derived(
		saveFiles.find((saveFile) => saveFile.id === menuSaveFileId) ?? null
	);
	const menuOpen = $derived(summonedWorkflow.active?.kind === 'save-file-menu');
	const deleteOpen = $derived(summonedWorkflow.active?.kind === 'save-file-delete');
	const activeTargetId = $derived(targetDomId(target));
	const rowCount = $derived(Math.max(1, Math.ceil(targets.length / columnCount)));
	const gridEntries = $derived<SavesGridEntry[]>([
		...saveFiles.map((saveFile, index) => ({ kind: 'save-file' as const, saveFile, index })),
		{ kind: 'pokemon-storage', index: saveFiles.length },
		{ kind: 'import', index: saveFiles.length + 1 }
	]);
	const gridRows = $derived.by(() => {
		const rows: SavesGridEntry[][] = [];
		for (let index = 0; index < gridEntries.length; index += columnCount) {
			rows.push(gridEntries.slice(index, index + columnCount));
		}
		return rows;
	});

	$effect(() => {
		appChrome.hasLoadedSave = activeSaveFileId !== null;
		appChrome.carryActive = false;
		appChrome.controllerInputActive = true;
		return () => {
			appChrome.controllerInputActive = false;
		};
	});

	onMount(() => {
		const cached = getCachedSavesSnapshot();
		const seeded = isCachedSavesSnapshotSeeded();
		let hasReceivedSnapshot = false;
		const unsubscribe = subscribeSavesSnapshot((snapshot) => {
			applySnapshot(snapshot, hasReceivedSnapshot ? target : rememberedTarget());
			hasReceivedSnapshot = true;
		});

		void refreshSaves({ force: !cached || seeded }).then(() => focusGrid());
		return unsubscribe;
	});

	function savesGridOwner(node: HTMLElement) {
		gridElement = node;
		return () => {
			if (gridElement === node) gridElement = undefined;
		};
	}

	function savesGridContent(node: HTMLElement) {
		gridList = node;
		const observer = new ResizeObserver(() => {
			updateColumnCount();
			void scrollTargetIntoView();
		});
		observer.observe(node);
		updateColumnCount();
		return () => {
			observer.disconnect();
			if (gridList === node) gridList = undefined;
		};
	}

	function targetKey(value: SavesTarget) {
		return value.kind === 'save-file' ? 'save-file:' + value.id : value.kind;
	}

	function gridRowKey(row: SavesGridEntry[]) {
		return row
			.map((entry) => (entry.kind === 'save-file' ? 'save-file:' + entry.saveFile.id : entry.kind))
			.join('|');
	}

	function rememberedTarget(): SavesTarget | null {
		if (rememberedTargetKey === 'import') return { kind: 'import' };
		if (rememberedTargetKey === 'pokemon-storage') return { kind: 'pokemon-storage' };
		return rememberedTargetKey?.startsWith('save-file:')
			? { kind: 'save-file', id: rememberedTargetKey.slice('save-file:'.length) }
			: null;
	}

	function rememberTarget(value: SavesTarget) {
		rememberedTargetKey = targetKey(value);
	}

	function targetDomId(value: SavesTarget) {
		return value.kind === 'save-file'
			? 'saves-target-' + encodeURIComponent(value.id)
			: 'saves-target-' + value.kind;
	}

	function currentTargets(saveFileList = saveFiles): SavesTarget[] {
		return [
			...saveFileList.map((saveFile) => ({ kind: 'save-file' as const, id: saveFile.id })),
			{ kind: 'pokemon-storage' },
			{ kind: 'import' }
		];
	}

	function applySnapshot(
		snapshot: SavesSnapshot,
		preferredTarget: SavesTarget | null,
		shouldFocus = false
	) {
		if (menuSaveFileId && !snapshot.saveFiles.some((file) => file.id === menuSaveFileId)) {
			if (menuOpen || deleteOpen) {
				summonedWorkflow.closeAll();
				shouldFocus = true;
			}
			menuSaveFileId = null;
			menuReturnTarget = null;
			deleteDescription = null;
		}
		saveFiles = snapshot.saveFiles;
		activeSaveFileId = snapshot.activeSaveFileId;
		detailsBySaveFileId = snapshot.detailsBySaveFileId;
		const nextTargets = currentTargets(snapshot.saveFiles);
		target = resolveSavesTarget(
			nextTargets,
			preferredTarget ?? rememberedTarget(),
			snapshot.activeSaveFileId
		);
		rememberTarget(target);
		catalogLoading = false;
		if (shouldFocus) void focusGrid();
	}

	async function refreshSaves(
		options: { force?: boolean; preferredTarget?: SavesTarget; focus?: boolean } = {}
	) {
		const request = ++refreshRequest;
		try {
			const storageSummary = storage.getPokemonStorage().catch(() => null);
			const snapshot = await getSavesSnapshot({ force: options.force });
			if (request !== refreshRequest) return;
			applySnapshot(snapshot, options.preferredTarget ?? rememberedTarget(), options.focus);
			const resolvedStorageSummary = await storageSummary;
			if (request !== refreshRequest) return;
			pokemonStorage = summarizePokemonStorage(resolvedStorageSummary);
		} catch (error) {
			if (request !== refreshRequest) return;
			catalogLoading = false;
			toastHost.error(getErrorMessage(error));
			if (options.focus) await focusGrid();
		}
	}

	function summarizePokemonStorage(value: StoredPokemonStorage | null): PokemonStorageSummary {
		return {
			boxCount: value?.boxCount ?? 3,
			pokemonCount:
				value?.boxes.reduce(
					(total, box) => total + box.slots.filter((slot) => slot.pokemon !== null).length,
					0
				) ?? 0
		};
	}

	function chooseTarget(next: SavesTarget, focus = true) {
		target = next;
		rememberTarget(next);
		if (focus) void focusGrid();
		else void scrollTargetIntoView();
	}

	async function focusGrid() {
		await tick();
		gridElement?.focus();
		await scrollTargetIntoView();
	}

	async function scrollTargetIntoView() {
		await tick();
		document
			.getElementById(targetDomId(target))
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function updateColumnCount() {
		if (!gridList) return;
		const columns = getComputedStyle(gridList)
			.gridTemplateColumns.split(' ')
			.filter(Boolean).length;
		columnCount = Math.max(1, columns);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.shiftKey ||
			isTextEntryTarget(event.target)
		) {
			return;
		}
		if (menuOpen || deleteOpen) {
			handleMenuKeydown(event);
			return;
		}
		if (summonedWorkflow.active) return;
		if (
			!isControllerKeyboardEvent(event) &&
			(!gridElement || !event.composedPath().includes(gridElement)) &&
			event
				.composedPath()
				.some(
					(node) =>
						node instanceof HTMLElement &&
						(node.tabIndex >= 0 ||
							node.matches(
								'button, a[href], input, select, textarea, summary, [role="button"], [role="link"]'
							))
				)
		) {
			return;
		}

		const direction = directionForKey(event.key);
		if (direction) {
			event.preventDefault();
			chooseTarget(moveSavesTarget(targets, target, columnCount, direction));
			return;
		}

		if (event.key.toLowerCase() === 'x') {
			if (target.kind === 'save-file') {
				event.preventDefault();
				openSaveFileMenu(target.id);
			}
			return;
		}

		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		activateTarget();
	}

	function isTextEntryTarget(value: EventTarget | null) {
		return (
			value instanceof HTMLInputElement ||
			value instanceof HTMLTextAreaElement ||
			value instanceof HTMLSelectElement ||
			(value instanceof HTMLElement && value.isContentEditable)
		);
	}

	function directionForKey(key: string): SavesDirection | null {
		switch (key) {
			case 'ArrowLeft':
				return 'left';
			case 'ArrowRight':
				return 'right';
			case 'ArrowUp':
				return 'up';
			case 'ArrowDown':
				return 'down';
			default:
				return null;
		}
	}

	function activateTarget() {
		if (busyTarget) return;
		const currentTarget = target;
		if (currentTarget.kind === 'import') {
			openImportPicker();
			return;
		}
		if (currentTarget.kind === 'pokemon-storage') {
			void openPokemonStorage();
			return;
		}
		const saveFile = saveFiles.find((candidate) => candidate.id === currentTarget.id);
		if (saveFile) void activateSaveFile(saveFile, 'boxes');
	}

	async function openPokemonStorage() {
		if (busyTarget) return;
		chooseTarget({ kind: 'pokemon-storage' }, false);
		await goto(resolve('/?source=pokemon-storage'));
	}

	function openImportPicker() {
		if (busyTarget) return;
		chooseTarget({ kind: 'import' });
		document.getElementById('save-file-input')?.click();
	}

	function handleImportCancel() {
		chooseTarget({ kind: 'import' });
	}

	async function handleImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) {
			handleImportCancel();
			return;
		}

		busyTarget = 'import';
		refreshRequest += 1;
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const validation = await getPkhexEngine().loadSaveWorkspace(bytes, file.name, 0);
			if (!validation.ok) throw validation.error;
			const stored = await storage.importSave({ bytes, originalFileName: file.name });
			invalidateSavesCache();
			invalidateActiveWorkspaceCache();
			await refreshSaves({
				force: true,
				preferredTarget: { kind: 'save-file', id: stored.id },
				focus: true
			});
			toastHost.success(file.name + ' imported and made active.');
		} catch (error) {
			await refreshSaves({
				preferredTarget: { kind: 'import' },
				focus: true
			});
			toastHost.error(
				'Import failed. Current active Save File was not changed. ' + getErrorMessage(error)
			);
		} finally {
			busyTarget = null;
		}
	}

	async function activateSaveFile(
		saveFile: StoredSaveFile,
		destination: 'boxes' | 'trainer' | 'bag'
	) {
		if (busyTarget) return;
		busyTarget = saveFile.id;
		try {
			const [current, importedBytes, persistedWorkspace] = await Promise.all([
				storage.getSave(saveFile.id),
				storage.getSaveBytes(saveFile.id),
				storage.getWorkspace(saveFile.id)
			]);
			if (!current || !importedBytes) {
				throw new Error('The selected Save File is no longer available.');
			}
			const bytes = persistedWorkspace?.bytes ?? importedBytes;
			const validation = await getPkhexEngine().loadSaveWorkspace(
				bytes,
				current.originalFileName ?? undefined,
				0
			);
			if (!validation.ok) throw validation.error;

			if (current.id !== activeSaveFileId) {
				await storage.setActiveSaveFileId(current.id);
				invalidateActiveWorkspaceCache();
				invalidateSavesCache();
			}
			chooseTarget({ kind: 'save-file', id: current.id }, false);
			summonedWorkflow.closeAll();
			menuSaveFileId = null;
			menuReturnTarget = null;
			const path =
				destination === 'boxes'
					? resolve('/')
					: destination === 'trainer'
						? resolve('/trainer')
						: resolve('/bag');
			await goto(path, {
				keepFocus: true
			});
		} catch (error) {
			toastHost.error('Could not open Save File. ' + getErrorMessage(error));
			if (menuOpen) void focusMenuCommand(menuIndex);
			else void focusGrid();
		} finally {
			busyTarget = null;
		}
	}

	function openSaveFileMenu(saveFileId: SaveFileId) {
		if (busyTarget || !saveFiles.some((saveFile) => saveFile.id === saveFileId)) return;
		if (
			!summonedWorkflow.open('save-file-menu', {
				type: 'control',
				id: gridElement?.id ?? 'saves-grid'
			})
		) {
			return;
		}
		menuSaveFileId = saveFileId;
		menuReturnTarget = target;
		menuIndex = 0;
		deleteDescription = null;
		void focusMenuCommand(0);
	}

	async function requestDelete() {
		const saveFile = menuSaveFile;
		const launchingWorkflow = summonedWorkflow.active;
		if (!saveFile || busyTarget || launchingWorkflow?.kind !== 'save-file-menu') return;
		try {
			const current = await storage.getSave(saveFile.id);
			if (summonedWorkflow.active !== launchingWorkflow || menuSaveFileId !== saveFile.id) return;
			if (!current) throw new Error('The selected Save File is no longer available.');
			const cachedWorkspace = getCachedActiveWorkspace();
			const persistedWorkspace =
				cachedWorkspace?.file.id === current.id
					? cachedWorkspace
					: await storage.getWorkspace(current.id);
			if (summonedWorkflow.active !== launchingWorkflow || menuSaveFileId !== saveFile.id) return;
			deleteDescription = deletionWarning(
				current,
				current.id === activeSaveFileId,
				persistedWorkspace?.dirty === true
			);
			summonedWorkflow.openRelated('save-file-delete', {
				type: 'control',
				id: 'save-file-menu-command-2'
			});
			menuIndex = 0;
			void focusMenuCommand(0);
		} catch (error) {
			if (summonedWorkflow.active !== launchingWorkflow || menuSaveFileId !== saveFile.id) return;
			toastHost.error(getErrorMessage(error));
		}
	}

	function deletionWarning(saveFile: StoredSaveFile, active: boolean, dirty: boolean) {
		const parts = [
			'This removes ' + displayName(saveFile) + ' and all of its Backups from this device.'
		];
		if (active) parts.push('Its active Workspace will also be removed.');
		if (dirty) parts.push('The Dirty Workspace contains unexported changes, which will be lost.');
		parts.push('This cannot be undone.');
		return parts.join(' ');
	}

	async function confirmDelete() {
		const saveFile = menuSaveFile;
		if (!saveFile || busyTarget) return;
		const preDeleteTargets = currentTargets();
		const fallback = deleteSavesTarget(preDeleteTargets, {
			kind: 'save-file',
			id: saveFile.id
		});
		busyTarget = saveFile.id;
		try {
			if (!(await storage.getSave(saveFile.id))) {
				throw new Error('The selected Save File is no longer available.');
			}
			await storage.deleteSave(saveFile.id);
			invalidateSavesCache();
			invalidateActiveWorkspaceCache(saveFile.id);
			summonedWorkflow.closeAll();
			menuSaveFileId = null;
			menuReturnTarget = null;
			deleteDescription = null;
			await refreshSaves({ force: true, preferredTarget: fallback, focus: true });
			toastHost.success(displayName(saveFile) + ' deleted.');
		} catch (error) {
			toastHost.error('Could not delete Save File. ' + getErrorMessage(error));
			void focusMenuCommand(menuIndex);
		} finally {
			busyTarget = null;
		}
	}

	function handleMenuKeydown(event: KeyboardEvent) {
		if (
			!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Escape'].includes(
				event.key
			)
		) {
			return;
		}
		event.preventDefault();
		if (event.key === 'Escape') {
			dismissSaveFileWorkflow();
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			if (deleteOpen) {
				if (menuIndex === 0) cancelDelete();
				else void confirmDelete();
			} else if (menuOpen) {
				if (menuIndex === 0 && menuSaveFile) void activateSaveFile(menuSaveFile, 'trainer');
				else if (menuIndex === 1 && menuSaveFile) void activateSaveFile(menuSaveFile, 'bag');
				else void requestDelete();
			}
			return;
		}
		const offset = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
		menuIndex = Math.max(0, Math.min(deleteOpen ? 1 : 2, menuIndex + offset));
		void focusMenuCommand(menuIndex);
	}

	function dismissSaveFileWorkflow() {
		if (busyTarget) return;
		if (deleteOpen) {
			cancelDelete();
			return;
		}
		if (!menuOpen) return;
		const returnTarget = menuReturnTarget;
		summonedWorkflow.dismiss();
		menuSaveFileId = null;
		menuReturnTarget = null;
		deleteDescription = null;
		chooseTarget(resolveSavesTarget(targets, returnTarget, activeSaveFileId));
	}

	function cancelDelete() {
		if (busyTarget || !deleteOpen) return;
		summonedWorkflow.dismiss();
		deleteDescription = null;
		menuIndex = 2;
		void focusMenuCommand(2);
	}

	async function focusMenuCommand(index: number) {
		await tick();
		const prefix = deleteOpen ? 'save-file-delete-command-' : 'save-file-menu-command-';
		document.getElementById(prefix + index)?.focus();
	}

	function displayName(saveFile: StoredSaveFile) {
		return saveFile.originalFileName ?? 'Save File';
	}

	function gameTitle(details: SaveCardDetailsState, saveFile: StoredSaveFile) {
		if (details.status !== 'ready') return displayName(saveFile);
		return (
			gameNames[details.details.summary.gameVersion] ??
			'Pokemon ' + details.details.summary.gameVersion
		);
	}

	function getErrorMessage(error: unknown) {
		if (isEngineError(error)) return error.message;
		if (error instanceof Error && error.message) return error.message;
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

<svelte:window onkeydown={handleKeydown} />

<section
	class="saves-route pksx-density-container"
	aria-labelledby="saves-title"
	data-destination-root="saves"
	data-initial-state={catalogLoading ? 'loading' : 'ready'}
	inert={summonedWorkflow.active !== null}
>
	<div class="saves-density pksx-density">
		<header class="saves-header">
			<div>
				<p>On this device</p>
				<h1 id="saves-title">Saves</h1>
			</div>
			<input
				id="save-file-input"
				type="file"
				aria-label="Import Save File"
				disabled={busyTarget !== null}
				onchange={handleImport}
				oncancel={handleImportCancel}
			/>
		</header>

		<div
			id="saves-grid"
			{@attach savesGridOwner}
			class="saves-scrollport"
			role="grid"
			tabindex="0"
			aria-label="Saves collections"
			aria-rowcount={rowCount}
			aria-colcount={columnCount}
			aria-activedescendant={activeTargetId}
			aria-busy={catalogLoading || busyTarget !== null}
			data-destination-focus="saves-grid"
			data-destination-initial
			onfocus={() => void scrollTargetIntoView()}
		>
			<div class="saves-grid" {@attach savesGridContent}>
				{#each gridRows as row, rowIndex (gridRowKey(row))}
					<div class="saves-grid-row" role="row" aria-rowindex={rowIndex + 1}>
						{#each row as entry (entry.kind === 'save-file' ? entry.saveFile.id : entry.kind)}
							{#if entry.kind === 'save-file'}
								{@const saveFile = entry.saveFile}
								{@const index = entry.index}
								{@const details = detailsBySaveFileId[saveFile.id] ?? { status: 'loading' }}
								{@const selected = sameSavesTarget(target, { kind: 'save-file', id: saveFile.id })}
								<div
									id={targetDomId({ kind: 'save-file', id: saveFile.id })}
									class={[
										'save-card',
										(index + 1) % 2 === 0 && 'spine-even',
										(index + 1) % 3 === 0 && 'spine-third',
										selected && 'controller-focused',
										saveFile.id === activeSaveFileId && 'active'
									]}
									role="gridcell"
									aria-colindex={(index % columnCount) + 1}
									aria-current={saveFile.id === activeSaveFileId ? 'true' : undefined}
									aria-busy={busyTarget === saveFile.id || details.status === 'loading'}
								>
									<button
										type="button"
										class="card-main"
										tabindex="-1"
										aria-label={'Open ' + displayName(saveFile) + ' in Boxes'}
										onclick={() => {
											chooseTarget({ kind: 'save-file', id: saveFile.id }, false);
											void activateSaveFile(saveFile, 'boxes');
										}}
									>
										<span class="cartridge-spine" aria-hidden="true"></span>
										<span class="card-heading">
											<strong>{gameTitle(details, saveFile)}</strong>
											{#if saveFile.id === activeSaveFileId}<em>Active</em>{/if}
										</span>
										{#if details.status === 'ready'}
											<span class="trainer"
												>{details.details.summary.trainerName ?? 'Unknown Trainer'}</span
											>
											<span class="file-name">{displayName(saveFile)}</span>
											<span class="card-stats">
												<b>{details.details.summary.boxCount}</b> boxes
												<i aria-hidden="true"></i>
												<b>{details.details.creatureCount}</b> Pokemon
											</span>
										{:else}
											<span class="file-name">{displayName(saveFile)}</span>
											<span class="detail-state">
												{#if details.status === 'loading'}
													<DelayedSpinner active label={`Reading ${displayName(saveFile)}`} />
												{:else}
													Details unavailable
												{/if}
											</span>
										{/if}
									</button>
									<button
										type="button"
										class="save-menu-control"
										aria-label={'Open Save File Menu for ' + displayName(saveFile)}
										onpointerdown={(event) => event.preventDefault()}
										onclick={() => openSaveFileMenu(saveFile.id)}
									>
										•••
									</button>
									<DelayedSpinner
										active={busyTarget === saveFile.id}
										label={`Opening ${displayName(saveFile)}`}
									/>
								</div>
							{:else if entry.kind === 'pokemon-storage'}
								{@const selected = target.kind === 'pokemon-storage'}
								<div
									id="saves-target-pokemon-storage"
									class={['storage-card', selected && 'controller-focused']}
									role="gridcell"
									aria-colindex={(entry.index % columnCount) + 1}
								>
									<button
										type="button"
										class="card-main storage-main"
										tabindex="-1"
										aria-label="Open Pokemon Storage in Boxes"
										onclick={() => void openPokemonStorage()}
									>
										<span class="cartridge-spine" aria-hidden="true"></span>
										<span class="card-heading"><strong>Pokemon Storage</strong></span>
										<span class="storage-persistence">Automatically saved by PKSX</span>
										<span class="card-stats">
											<b>{pokemonStorage.pokemonCount}</b> Pokemon
											<i aria-hidden="true"></i>
											<b>{pokemonStorage.boxCount}</b> Storage
											{pokemonStorage.boxCount === 1 ? 'Box' : 'Boxes'}
										</span>
									</button>
								</div>
							{:else}
								<div
									id="saves-target-import"
									class={['import-cell', target.kind === 'import' && 'controller-focused']}
									role="gridcell"
									aria-colindex={(entry.index % columnCount) + 1}
									aria-busy={busyTarget === 'import'}
								>
									<button
										type="button"
										tabindex="-1"
										aria-label="Import a Save File"
										onclick={openImportPicker}
									>
										<span>+</span>
										<strong>Import a Save File</strong>
										<DelayedSpinner active={busyTarget === 'import'} label="Importing Save File" />
										<small>Choose a compatible file from this device.</small>
									</button>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</section>

{#if (menuOpen || deleteOpen) && menuSaveFile}
	<SaveFileMenu
		mode={deleteOpen ? 'delete' : 'commands'}
		fileName={displayName(menuSaveFile)}
		description={deleteOpen ? (deleteDescription ?? undefined) : undefined}
		activeIndex={menuIndex}
		busy={busyTarget === menuSaveFile.id}
		onFocusCommand={(index) => (menuIndex = index)}
		onOpenTrainer={() => void activateSaveFile(menuSaveFile, 'trainer')}
		onOpenBag={() => void activateSaveFile(menuSaveFile, 'bag')}
		onDelete={() => (deleteOpen ? void confirmDelete() : void requestDelete())}
		onCancelDelete={cancelDelete}
		onClose={dismissSaveFileWorkflow}
	/>
{/if}

<style>
	:global(.app-shell:has(.saves-route)) {
		height: 100dvh;
		min-height: 100dvh;
		overflow: hidden;
	}

	.saves-route {
		min-width: 0;
		min-height: 0;
		flex: 1 1 0;
		overflow: hidden;
	}

	.saves-density {
		width: min(1200px, 100%);
		height: 100%;
		min-height: 0;
		margin: 0 auto;
		padding: var(--pksx-space-2);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--pksx-space-2);
	}

	.saves-header {
		min-height: 36px;
		display: flex;
		align-items: end;
		justify-content: space-between;
	}

	.saves-header div {
		display: grid;
		gap: 2px;
	}

	.saves-header p,
	.saves-header h1 {
		margin: 0;
	}

	.saves-header p {
		color: var(--rust);
		font: 750 var(--pksx-type-caption) / 1 var(--pksx-font-mono);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.saves-header h1 {
		font-size: var(--pksx-type-display);
		line-height: 1;
	}

	#save-file-input {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.saves-scrollport {
		min-width: 0;
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.saves-scrollport:focus {
		outline: none;
	}

	.saves-grid {
		display: grid;
		grid-template-columns: minmax(240px, 1fr);
		gap: var(--pksx-space-2);
		align-content: start;
	}

	.saves-grid-row {
		display: contents;
	}

	.save-card,
	.storage-card,
	.import-cell {
		position: relative;
		min-width: 240px;
		min-height: 112px;
		border: var(--pksx-border-width) solid var(--rule);
		border-radius: var(--pksx-radius-small) var(--pksx-radius-large) var(--pksx-radius-large)
			var(--pksx-radius-small);
		background: var(--paper-hi);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}

	.save-card.active {
		border-color: color-mix(in srgb, var(--rust), transparent 25%);
		background:
			linear-gradient(color-mix(in srgb, var(--rust-wash), transparent 38%), transparent 80%),
			var(--paper-hi);
	}

	.storage-card {
		border-color: color-mix(in srgb, var(--ok), var(--rule) 38%);
		background:
			linear-gradient(color-mix(in srgb, var(--ok), transparent 90%), transparent 82%),
			var(--paper-hi);
	}

	.save-card.controller-focused,
	.storage-card.controller-focused,
	.import-cell.controller-focused {
		outline: var(--pksx-focus-ring) solid var(--rust-ring);
		outline-offset: calc(-1 * var(--pksx-focus-ring));
	}

	.card-main,
	.import-cell > button {
		width: 100%;
		min-height: 110px;
		border: 0;
		background: transparent;
		color: var(--ink);
		font: inherit;
		cursor: pointer;
	}

	.card-main {
		padding: var(--pksx-space-2) calc(var(--pksx-control-height) + var(--pksx-space-2))
			var(--pksx-space-2) calc(var(--pksx-space-3) + 5px);
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-rows: auto auto auto 1fr;
		gap: 2px var(--pksx-space-2);
		text-align: left;
	}

	.card-main.storage-main {
		padding-right: calc(var(--pksx-space-3) + 5px);
	}

	.card-main:hover,
	.import-cell > button:hover {
		background: var(--rust-wash);
	}

	.cartridge-spine {
		position: absolute;
		inset: -1px auto -1px -1px;
		width: 7px;
		background: color-mix(in srgb, var(--ok), var(--ink) 28%);
	}

	.save-card.spine-even .cartridge-spine {
		background: color-mix(in srgb, var(--rust), #7563a8 52%);
	}

	.save-card.spine-third .cartridge-spine {
		background: color-mix(in srgb, var(--gold), var(--rust) 25%);
	}

	.storage-card .cartridge-spine {
		background: color-mix(in srgb, var(--ok), var(--ink) 12%);
	}

	.card-heading {
		grid-column: 1 / -1;
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: var(--pksx-space-2);
	}

	.card-heading strong {
		overflow: hidden;
		font-size: var(--pksx-type-title);
		line-height: 1.1;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-heading em {
		flex: 0 0 auto;
		padding: 3px 5px;
		border-radius: var(--pksx-radius-small);
		background: var(--rust);
		color: var(--paper-hi);
		font: 800 var(--pksx-type-caption) / 1 var(--pksx-font-mono);
		font-style: normal;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.trainer {
		font: 800 var(--pksx-type-label) / 1.1 var(--pksx-font-mono);
		letter-spacing: 0.06em;
	}

	.file-name,
	.card-stats,
	.detail-state,
	.storage-persistence {
		grid-column: 1 / -1;
		color: var(--ink-soft);
		font: 650 var(--pksx-type-caption) / 1.2 var(--pksx-font-mono);
	}

	.file-name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-stats,
	.detail-state {
		align-self: end;
		padding-top: var(--pksx-space-1);
		border-top: var(--pksx-border-width) solid var(--rule);
	}

	.card-stats b {
		color: var(--ink);
	}

	.card-stats i {
		display: inline-block;
		width: 3px;
		height: 3px;
		margin: 0 5px 2px;
		border-radius: 50%;
		background: var(--rust);
	}

	.save-menu-control {
		position: absolute;
		top: var(--pksx-space-2);
		right: var(--pksx-space-2);
		width: var(--pksx-small-control-height);
		height: var(--pksx-small-control-height);
		padding: 0;
		border: 0;
		border-radius: var(--pksx-radius-small);
		background: var(--paper-deep);
		color: var(--ink-soft);
		font: 800 var(--pksx-type-label) / 1 var(--pksx-font-mono);
		letter-spacing: 1px;
		cursor: pointer;
	}

	.save-menu-control:hover,
	.save-menu-control:focus-visible {
		background: var(--rust-wash);
		color: var(--rust);
	}

	.import-cell {
		border-style: dashed;
		border-radius: var(--pksx-radius-large);
		box-shadow: none;
	}

	.import-cell > button {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 3px;
		padding: var(--pksx-space-2);
		text-align: center;
	}

	.import-cell span {
		font-size: var(--pksx-type-display);
		line-height: 1;
	}

	.import-cell strong {
		font-size: var(--pksx-type-label);
	}

	.import-cell small {
		color: var(--ink-soft);
		font: 650 var(--pksx-type-caption) / 1.2 var(--pksx-font-mono);
	}

	@container pksx-density (min-width: 520px) {
		.saves-grid {
			grid-template-columns: repeat(2, minmax(240px, 1fr));
		}
	}

	@container pksx-density (min-width: 780px) {
		.saves-grid {
			grid-template-columns: repeat(3, minmax(240px, 1fr));
		}
	}

	@container pksx-density (min-width: 1040px) {
		.saves-grid {
			grid-template-columns: repeat(4, minmax(240px, 1fr));
		}
	}
</style>
