<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Combobox, { type ComboboxOption } from '$lib/components/pksx/Combobox.svelte';
	import {
		type EngineApi,
		type InventoryItemOption,
		type InventoryItemProjection
	} from '$lib/engine';
	import { onMount } from 'svelte';
	import { updateAppChrome } from '$lib/pksx/app-chrome.svelte';
	import {
		markAutomaticBackupCreated,
		shouldCreateAutomaticBackup,
		type WorkspaceState
	} from '$lib/pksx/backup-workflow';
	import {
		getCachedActiveWorkspaceBox,
		getSavesStorage,
		getPkhexEngine,
		loadActiveWorkspaceFromSaves,
		setCachedActiveWorkspace
	} from '$lib/pksx/saves-cache';
	import {
		applySaveFileEditorEdits,
		cancelSaveFileEditor,
		createSaveFileEditOperation,
		createSaveFileEditorState,
		discardSaveFileEditorEdit,
		getStagedInventoryEdits,
		isSameSaveFileEditorSourceIdentity,
		stageInventoryAddEdit,
		stageInventoryQuantityEdit,
		stageInventoryRemoveEdit,
		stageMoneyEdit,
		stageTrainerGenderEdit,
		stageTrainerNameEdit,
		type SaveFileEditorState
	} from '$lib/pksx/save-file-editor';
	import {
		restoreSaveFileEditorSession,
		updateSaveFileEditorSession
	} from '$lib/pksx/save-file-editor/session';
	import { getSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';

	type SaveEditorSection = 'trainer' | 'money' | 'bag';
	type Destination = 'trainer' | 'bag';
	type Props = { destination: Destination };

	const trainerSections = [
		{ key: 'trainer' as const, label: 'Trainer profile', detail: 'Name & gender', icon: '◎' },
		{ key: 'money' as const, label: 'Money', detail: 'Wallet balance', icon: '¤' }
	];
	const bagSections = [
		{ key: 'bag' as const, label: 'Bag', detail: 'Inventory pockets', icon: '▤' }
	];
	let { destination }: Props = $props();
	const sections = $derived(destination === 'trainer' ? trainerSections : bagSections);
	const storage = getSavesStorage();
	const summonedWorkflow = getSummonedWorkflowHost();
	let engine: EngineApi | null = null;

	let trainerSection = $state<Extract<SaveEditorSection, 'trainer' | 'money'>>('trainer');
	const activeSection = $derived<SaveEditorSection>(destination === 'bag' ? 'bag' : trainerSection);
	let activePocket = $state('');
	let selectedItemId = $state('');
	let trainerNameDraft = $state('');
	let moneyDraft = $state('');
	let workspace = $state<WorkspaceState | null>(null);
	let editor = $state<SaveFileEditorState | null>(null);
	let loading = $state(true);
	let busy = $state(false);
	let loadError = $state<string | null>(null);
	// The available-item catalogue is thousands of entries, so it is fetched only when the Bag opens.
	let itemCatalogue = $state<Record<string, InventoryItemOption[]> | null>(null);
	let catalogueLoading = $state(false);
	let catalogueError = $state<string | null>(null);

	const projection = $derived(editor?.projection ?? null);
	const pockets = $derived(projection?.inventory.pockets ?? []);
	const activePocketProjection = $derived(
		pockets.find((pocket) => pocket.key === activePocket) ?? pockets[0] ?? null
	);
	const activePocketItemCatalogue = $derived(
		activePocketProjection ? (itemCatalogue?.[activePocketProjection.key] ?? []) : []
	);
	const stagedCount = $derived(editor?.stagedEdits.length ?? 0);
	const displayedGender = $derived.by(() => {
		const payload = editor?.stagedEdits.find((edit) => edit.id === 'trainer-gender')?.payload;
		return typeof payload === 'object' && payload && 'gender' in payload
			? payload.gender
			: projection?.trainerProfile.gender;
	});
	const stagedInventory = $derived(editor ? getStagedInventoryEdits(editor, activePocket) : []);
	const stagedAdds = $derived.by(() => {
		if (!activePocketProjection) return [];
		return stagedInventory.flatMap((edit) => {
			if (edit.kind !== 'add') return [];
			const option = activePocketItemCatalogue.find((item) => item.id === edit.itemId);
			return option ? [{ ...option, quantity: edit.quantity ?? 1 }] : [];
		});
	});
	const availableToAdd = $derived.by(() => {
		if (!activePocketProjection) return [];
		const occupied = new Set([
			...activePocketProjection.items.map((item) => item.id),
			...stagedAdds.map((item) => item.id)
		]);
		return activePocketItemCatalogue.filter((item) => !occupied.has(item.id));
	});
	const addItemOptions = $derived(
		availableToAdd.map(
			(item) =>
				({
					value: String(item.id),
					label: item.name,
					meta: `#${item.id}`,
					detail: `Max ${item.maxQuantity}`
				}) satisfies ComboboxOption
		)
	);

	onMount(() => {
		engine = getPkhexEngine();
		syncAppChrome();
		void loadEditor();
	});

	function syncAppChrome() {
		const current = workspace;
		updateAppChrome({
			hasLoadedSave: current !== null,
			carryActive: false,
			controllerInputActive: true
		});
	}

	async function loadEditor() {
		loading = true;
		loadError = null;
		try {
			workspace = await loadActiveWorkspaceFromSaves();
			if (!workspace) return;
			const opened = createSaveFileEditorState(
				{
					saveFileId: workspace.file.id,
					fileName: workspace.file.originalFileName
				},
				workspace.workspace.summary,
				{
					dirty: workspace.dirty,
					automaticBackupCreated: workspace.automaticBackupCreated
				},
				workspace.workspace.saveFile
			);
			if (!opened.ok) throw new Error(opened.reason);
			editor = restoreSaveFileEditorSession(opened.state, workspace.bytes);
			resetDrafts();
			activePocket = opened.state.projection.inventory.pockets[0]?.key ?? '';
			if (destination === 'bag') void loadItemCatalogue();
		} catch (error) {
			loadError = errorMessage(error);
		} finally {
			loading = false;
			syncAppChrome();
		}
	}

	function selectSection(section: SaveEditorSection) {
		if (destination === 'trainer' && section !== 'bag') trainerSection = section;
		if (section === 'bag') void loadItemCatalogue();
	}

	async function loadItemCatalogue() {
		if (itemCatalogue || catalogueLoading || !workspace || !engine) return;
		catalogueLoading = true;
		catalogueError = null;
		try {
			const result = await engine.getSaveFileInventoryCatalogue(
				workspace.bytes,
				workspace.file.originalFileName ?? undefined
			);
			if (!result.ok) {
				catalogueError = result.error.message;
				return;
			}
			itemCatalogue = Object.fromEntries(
				result.value.pockets.map((pocket) => [pocket.key, pocket.availableItems])
			);
		} catch (error) {
			catalogueError = errorMessage(error);
		} finally {
			catalogueLoading = false;
		}
	}

	function resetDrafts() {
		const namePayload = editor?.stagedEdits.find((edit) => edit.id === 'trainer-name')?.payload;
		const moneyPayload = editor?.stagedEdits.find((edit) => edit.id === 'money')?.payload;
		trainerNameDraft =
			typeof namePayload === 'object' && namePayload && 'trainerName' in namePayload
				? String(namePayload.trainerName)
				: (editor?.projection.trainerProfile.trainerName ?? '');
		moneyDraft =
			typeof moneyPayload === 'object' && moneyPayload && 'money' in moneyPayload
				? String(moneyPayload.money)
				: (editor?.projection.money.value?.toString() ?? '');
		selectedItemId = '';
	}

	function stageName(event: Event) {
		trainerNameDraft = (event.currentTarget as HTMLInputElement).value;
		if (editor)
			editor = updateSaveFileEditorSession(stageTrainerNameEdit(editor, trainerNameDraft));
	}

	function stageMoney(event: Event) {
		moneyDraft = (event.currentTarget as HTMLInputElement).value;
		if (!editor) return;
		// An empty field is "no edit", not zero money.
		editor = updateSaveFileEditorSession(
			moneyDraft.trim() === ''
				? discardSaveFileEditorEdit(editor, 'money')
				: stageMoneyEdit(editor, Number(moneyDraft))
		);
	}

	function chooseGender(gender: 'male' | 'female') {
		if (editor) editor = updateSaveFileEditorSession(stageTrainerGenderEdit(editor, gender));
	}

	function setMoney(value: number) {
		if (!editor) return;
		moneyDraft = String(value);
		editor = updateSaveFileEditorSession(stageMoneyEdit(editor, value));
	}

	function addSelectedItem() {
		if (!editor || !activePocketProjection || !selectedItemId) return;
		const option = activePocketItemCatalogue.find((item) => item.id === Number(selectedItemId));
		if (!option) return;
		editor = updateSaveFileEditorSession(
			stageInventoryAddEdit(editor, activePocketProjection.key, option)
		);
		selectedItemId = '';
	}

	function stagedInventoryEdit(pocket: string, itemId: number) {
		return editor
			? getStagedInventoryEdits(editor, pocket).find((edit) => edit.itemId === itemId)
			: undefined;
	}

	function itemQuantity(pocket: string, item: InventoryItemProjection) {
		const edit = stagedInventoryEdit(pocket, item.id);
		return edit?.kind === 'set' ? (edit.quantity ?? item.quantity) : item.quantity;
	}

	function setItemQuantity(pocket: string, item: InventoryItemProjection, quantity: number) {
		if (editor) {
			editor = updateSaveFileEditorSession(
				stageInventoryQuantityEdit(editor, pocket, item.id, quantity)
			);
		}
	}

	function toggleItemRemoval(pocket: string, item: InventoryItemProjection) {
		if (!editor) return;
		editor = updateSaveFileEditorSession(
			stagedInventoryEdit(pocket, item.id)?.kind === 'remove'
				? stageInventoryQuantityEdit(editor, pocket, item.id, item.quantity)
				: stageInventoryRemoveEdit(editor, pocket, item.id)
		);
	}

	function updateAddedItem(pocket: string, option: InventoryItemOption, quantity: number) {
		if (editor) {
			editor = updateSaveFileEditorSession(stageInventoryAddEdit(editor, pocket, option, quantity));
		}
	}

	function discardAddedItem(pocket: string, itemId: number) {
		if (editor) {
			editor = updateSaveFileEditorSession(
				discardSaveFileEditorEdit(editor, 'inventory:' + pocket + ':' + itemId)
			);
		}
	}

	function cancelAll() {
		if (!editor) return;
		editor = updateSaveFileEditorSession(cancelSaveFileEditor(editor));
		resetDrafts();
	}

	function sectionStagedCount(section: SaveEditorSection) {
		if (!editor) return 0;
		const field =
			section === 'trainer' ? 'trainer-profile' : section === 'money' ? 'money' : 'inventory';
		return editor.stagedEdits.filter((edit) => edit.field === field).length;
	}

	async function applyEdits() {
		if (!editor || !workspace || busy) return;
		const activeEngine = engine;
		if (!activeEngine) return;
		busy = true;
		syncAppChrome();
		try {
			const result = await applySaveFileEditorEdits(editor, {
				verifySource: async (state) => ({
					ok: isSameSaveFileEditorSourceIdentity(state, workspace?.workspace.summary ?? null)
				}),
				validate: async (state) => {
					const built = createSaveFileEditOperation(state);
					return built.ok ? { ok: true } : built;
				},
				ensureBackup: async (state) => {
					if (!workspace) {
						return {
							ok: false,
							status: 'failed',
							message: 'Load a Save File before applying edits.'
						};
					}
					if (shouldCreateAutomaticBackup(workspace)) {
						const reason = state.stagedEdits.some((edit) => edit.field === 'inventory')
							? 'inventory-editing'
							: 'trainer-editing';
						await storage.createBackup({
							saveFileId: workspace.file.id,
							bytes: workspace.bytes,
							reason
						});
						workspace = markAutomaticBackupCreated(workspace);
						await storage.putWorkspace({
							saveFileId: workspace.file.id,
							bytes: workspace.bytes,
							dirty: workspace.dirty,
							automaticBackupCreated: true
						});
						setCachedActiveWorkspace(workspace, getCachedActiveWorkspaceBox());
					}
					return {
						ok: true,
						committedWorkspace: {
							dirty: workspace.dirty,
							automaticBackupCreated: workspace.automaticBackupCreated
						}
					};
				},
				mutateSaveFile: async (state) => {
					if (!workspace) {
						return {
							ok: false,
							status: 'failed',
							message: 'Load a Save File before applying edits.'
						};
					}
					const built = createSaveFileEditOperation(state);
					if (!built.ok) return built;
					const mutation = await activeEngine.applySaveFileEditOperation(
						workspace.bytes,
						workspace.file.originalFileName ?? undefined,
						built.operation,
						getCachedActiveWorkspaceBox()
					);
					if (!mutation.ok) {
						return {
							ok: false,
							status:
								mutation.error.code === 'unsupported-save-file-edit'
									? 'unsupported'
									: mutation.error.code === 'invalid-save-file-edit'
										? 'rejected'
										: 'failed',
							message: mutation.error.message,
							reason: mutation.error.code
						};
					}
					const next: WorkspaceState = {
						...workspace,
						bytes: mutation.value.bytes,
						workspace: mutation.value.workspace,
						dirty: workspace.dirty || mutation.value.mutated,
						restoredFromBackup: null
					};
					await storage.putWorkspace({
						saveFileId: next.file.id,
						bytes: next.bytes,
						dirty: next.dirty,
						automaticBackupCreated: next.automaticBackupCreated
					});
					workspace = next;
					setCachedActiveWorkspace(next, getCachedActiveWorkspaceBox());
					return {
						ok: true,
						bytes: next.bytes,
						workspace: next.workspace,
						mutated: mutation.value.mutated,
						projection: next.workspace.saveFile,
						committedWorkspace: {
							dirty: next.dirty,
							automaticBackupCreated: next.automaticBackupCreated
						}
					};
				}
			});
			editor = updateSaveFileEditorSession(result.state, workspace.bytes);
			if (result.outcome.status === 'success') resetDrafts();
		} catch (error) {
			editor = updateSaveFileEditorSession({
				...editor,
				applyOutcome: { status: 'failed', message: errorMessage(error) }
			});
		} finally {
			busy = false;
			syncAppChrome();
		}
	}

	function errorMessage(error: unknown) {
		return error instanceof Error
			? error.message
			: typeof error === 'object' && error && 'message' in error
				? String(error.message)
				: String(error);
	}

	function openBoxes() {
		void goto(resolve('/'));
	}

	function openBackupBrowser() {
		summonedWorkflow.open('backup-browser', {
			type: 'control',
			id: 'browse-backups-from-save-file'
		});
	}
</script>

<svelte:head>
	<title>{destination === 'trainer' ? 'Trainer' : 'Bag'} · PKSX</title>
</svelte:head>

{#if loading}
	<section
		class="empty-editor"
		data-destination-root={destination}
		data-initial-state="loading"
		aria-live="polite"
		inert={summonedWorkflow.active !== null}
	>
		Loading Save File editor…
	</section>
{:else if !workspace || !editor || !projection}
	<section
		class="empty-editor"
		data-destination-root={destination}
		data-initial-state="ready"
		inert={summonedWorkflow.active !== null}
	>
		<strong>No active Save File</strong>
		<p>
			{loadError ??
				(destination === 'trainer'
					? 'Import or select a Save File before editing Trainer data.'
					: 'Import or select a Save File before editing the Bag.')}
		</p>
		<button
			type="button"
			data-destination-initial
			data-destination-focus="back-boxes"
			onclick={openBoxes}>Back to Boxes</button
		>
	</section>
{:else}
	<section
		class="save-file-route"
		aria-label={destination === 'trainer' ? 'Trainer' : 'Bag'}
		data-destination-root={destination}
		data-initial-state="ready"
		inert={summonedWorkflow.active !== null}
	>
		<div class="mobile-heading">
			<button
				type="button"
				aria-label="Back to boxes"
				data-controller-back
				data-destination-focus="back-boxes-mobile"
				onclick={openBoxes}>‹</button
			>
			<div>
				<h1>{destination === 'trainer' ? 'Trainer' : 'Bag'}</h1>
				<p>
					{workspace.file.originalFileName ?? 'Save File'} · {projection.trainerProfile.gameVersion}
				</p>
			</div>
			<span><i aria-hidden="true"></i>{stagedCount} staged</span>
		</div>

		<aside
			class="field-sidebar"
			aria-label={destination === 'trainer' ? 'Trainer fields' : 'Bag fields'}
		>
			<p>{destination === 'trainer' ? 'Trainer Fields' : 'Bag'}</p>
			<nav>
				{#each sections as section (section.key)}
					<button
						type="button"
						data-destination-initial={section.key === activeSection ? '' : undefined}
						data-destination-focus={`section-${section.key}`}
						data-destination-variant="desktop"
						class:active={activeSection === section.key}
						onclick={() => selectSection(section.key)}
					>
						<span class="nav-icon">{section.icon}</span>
						<strong>{section.label}</strong>
						<small>{section.detail}</small>
						{#if sectionStagedCount(section.key) > 0}<em>{sectionStagedCount(section.key)}</em>{/if}
					</button>
				{/each}
			</nav>
			<button
				id="browse-backups-from-save-file"
				type="button"
				class="backup-ready"
				onclick={openBackupBrowser}
			>
				<span>♢</span>
				<strong>Browse Backups</strong>
				<small
					>{workspace.automaticBackupCreated
						? 'automatic Backup created'
						: 'manual and automatic'}</small
				>
			</button>
		</aside>

		<main class="editor-panel" aria-live="polite">
			<div
				class="section-tabs"
				aria-label={destination === 'trainer' ? 'Trainer sections' : 'Bag sections'}
			>
				{#each sections as section (section.key)}
					<button
						type="button"
						data-destination-initial={section.key === activeSection ? '' : undefined}
						data-destination-focus={`section-${section.key}`}
						data-destination-variant="mobile"
						class:active={activeSection === section.key}
						onclick={() => selectSection(section.key)}
					>
						{section.label.replace(' profile', '')}
						{#if sectionStagedCount(section.key) > 0}<span>{sectionStagedCount(section.key)}</span
							>{/if}
					</button>
				{/each}
			</div>

			{#if activeSection === 'trainer'}
				<section class="mock-section" aria-label="Trainer profile">
					<div class="section-copy">
						<p>Save File · Trainer Profile</p>
						<h2>Trainer profile</h2>
						<span>Changes stay staged until Apply writes them through the PKHeX Engine.</span>
					</div>

					<div class="trainer-card">
						<div class="avatar">{(projection.trainerProfile.trainerName ?? '??').slice(0, 2)}</div>
						<div>
							<strong>{projection.trainerProfile.trainerName ?? 'Unknown trainer'}</strong>
							<span>
								ID {projection.trainerProfile.trainerId} · {projection.trainerProfile.gameVersion} · Gen
								{projection.trainerProfile.generation}
							</span>
						</div>
						<div class="playtime">
							<small>Play Time</small>
							<b>{workspace.workspace.summary.playTime}</b>
						</div>
					</div>

					<div class="trainer-grid">
						<label
							class:staged={editor.stagedEdits.some((edit) => edit.id === 'trainer-name')}
							class="mock-field"
						>
							<span>Trainer name</span>
							<input
								id="save-file-trainer-name"
								value={trainerNameDraft}
								maxlength={projection.trainerProfile.trainerNameMaxLength || undefined}
								disabled={!projection.trainerProfile.trainerNameSupported || busy}
								oninput={stageName}
							/>
							<small>
								{projection.trainerProfile.trainerNameSupported
									? 'Maximum ' + projection.trainerProfile.trainerNameMaxLength + ' characters'
									: projection.trainerProfile.trainerNameUnsupportedReason}
							</small>
						</label>
						<div
							class:staged={editor.stagedEdits.some((edit) => edit.id === 'trainer-gender')}
							class="mock-field"
						>
							<span>Gender</span>
							<div class="segmented">
								<button
									type="button"
									data-destination-focus="gender-male"
									class:chosen={displayedGender === 'male'}
									disabled={!projection.trainerProfile.genderSupported || busy}
									onclick={() => chooseGender('male')}>Male</button
								>
								<button
									type="button"
									data-destination-focus="gender-female"
									class:chosen={displayedGender === 'female'}
									disabled={!projection.trainerProfile.genderSupported || busy}
									onclick={() => chooseGender('female')}>Female</button
								>
							</div>
							<small
								>{projection.trainerProfile.genderUnsupportedReason ??
									'Stored by the loaded game.'}</small
							>
						</div>
					</div>
				</section>
			{:else if activeSection === 'money'}
				<section class="mock-section" aria-label="Money">
					<div class="section-copy">
						<p>Save File · Wallet</p>
						<h2>Money</h2>
						<span
							>The PKHeX Engine supplies the supported range for this exact Save File format.</span
						>
					</div>

					{#if projection.money.supported}
						<div class="wallet-grid">
							<div
								class:staged={editor.stagedEdits.some((edit) => edit.id === 'money')}
								class="currency-card"
							>
								<header>
									<span>Money</span>
									<small>max {projection.money.max.toLocaleString()}</small>
								</header>
								<div class="currency-control">
									<button
										type="button"
										data-destination-focus="money-decrement"
										disabled={busy}
										onclick={() => setMoney(Math.max(projection.money.min, Number(moneyDraft) - 1))}
										>−</button
									>
									<input
										id="save-file-money"
										aria-label="Money"
										type="number"
										min={projection.money.min}
										max={projection.money.max}
										value={moneyDraft}
										disabled={busy}
										oninput={stageMoney}
									/>
									<button
										type="button"
										data-destination-focus="money-increment"
										disabled={busy}
										onclick={() => setMoney(Math.min(projection.money.max, Number(moneyDraft) + 1))}
										>+</button
									>
									<button
										type="button"
										data-destination-focus="money-max"
										disabled={busy}
										onclick={() => setMoney(projection.money.max)}>MAX</button
									>
								</div>
								<p>Current balance: ¤{projection.money.value?.toLocaleString()}</p>
							</div>
						</div>
					{:else}
						<div class="notice unsupported">
							<span>×</span>
							<div>
								<strong>Money editing unavailable</strong>
								<p>{projection.money.unsupportedReason}</p>
							</div>
						</div>
					{/if}
				</section>
			{:else}
				<section class="mock-section" aria-label="Bag inventory">
					<div class="section-copy">
						<p>Save File · Bag</p>
						<h2>Inventory</h2>
						<span>Item choices, pocket rules, and quantity limits come from the PKHeX Engine.</span>
					</div>

					{#if projection.inventory.supported}
						<div class="pocket-row" aria-label="Bag pockets">
							{#each pockets as pocket (pocket.key)}
								<button
									type="button"
									data-destination-focus={`pocket-${pocket.key}`}
									class:active={activePocketProjection?.key === pocket.key}
									class:staged={editor.stagedEdits.some(
										(edit) =>
											edit.field === 'inventory' &&
											(edit.payload as { pocket?: string } | undefined)?.pocket === pocket.key
									)}
									onclick={() => {
										activePocket = pocket.key;
										selectedItemId = '';
									}}
								>
									<span>▤</span>
									<strong>{pocket.label}</strong>
									<small>{pocket.items.length}/{pocket.capacity}</small>
								</button>
							{/each}
						</div>

						{#if activePocketProjection}
							<div class="add-item">
								<Combobox
									id="save-file-add-item"
									ariaLabel={'Add an item to ' + activePocketProjection.label}
									value={selectedItemId}
									options={addItemOptions}
									placeholder={'Add an item to ' + activePocketProjection.label + '…'}
									searchLabel={'Search items in ' + activePocketProjection.label}
									searchPlaceholder="Search items"
									disabled={activePocketProjection.full ||
										availableToAdd.length === 0 ||
										catalogueLoading ||
										busy}
									onSelect={(value) => (selectedItemId = value)}
								/>
								<small
									>{catalogueError ??
										(catalogueLoading
											? 'Loading items…'
											: availableToAdd.length + ' available')}</small
								>
								<button
									type="button"
									data-destination-focus={`inventory-${activePocketProjection.key}-add`}
									disabled={!selectedItemId || busy}
									onclick={addSelectedItem}>+ Add</button
								>
							</div>

							<div class="item-list">
								{#each activePocketProjection.items as item (item.id)}
									{@const staged = stagedInventoryEdit(activePocketProjection.key, item.id)}
									<article class:staged class:pending-remove={staged?.kind === 'remove'}>
										<div class="item-icon">✚</div>
										<div>
											<strong>{item.name}</strong>
											<p>Item #{item.id} · max {item.maxQuantity}</p>
											{#if staged}<small>{staged.kind === 'remove' ? 'REMOVE' : '● staged'}</small
												>{/if}
										</div>
										<div class="quantity">
											<button
												type="button"
												data-destination-focus={`item-${activePocketProjection.key}-${item.id}-decrement`}
												disabled={busy ||
													staged?.kind === 'remove' ||
													itemQuantity(activePocketProjection.key, item) <= 1}
												onclick={() =>
													setItemQuantity(
														activePocketProjection.key,
														item,
														itemQuantity(activePocketProjection.key, item) - 1
													)}>−</button
											>
											<input
												aria-label={item.name + ' quantity'}
												data-destination-focus={`item-${activePocketProjection.key}-${item.id}-quantity`}
												type="number"
												min="1"
												max={item.maxQuantity}
												value={itemQuantity(activePocketProjection.key, item)}
												disabled={busy || staged?.kind === 'remove'}
												onchange={(event) =>
													setItemQuantity(
														activePocketProjection.key,
														item,
														Number((event.currentTarget as HTMLInputElement).value)
													)}
											/>
											<button
												type="button"
												data-destination-focus={`item-${activePocketProjection.key}-${item.id}-increment`}
												disabled={busy ||
													staged?.kind === 'remove' ||
													itemQuantity(activePocketProjection.key, item) >= item.maxQuantity}
												onclick={() =>
													setItemQuantity(
														activePocketProjection.key,
														item,
														itemQuantity(activePocketProjection.key, item) + 1
													)}>+</button
											>
											<button
												type="button"
												data-destination-focus={`item-${activePocketProjection.key}-${item.id}-remove`}
												class="remove"
												disabled={busy}
												onclick={() => toggleItemRemoval(activePocketProjection.key, item)}
												>{staged?.kind === 'remove' ? 'Undo' : 'Remove'}</button
											>
										</div>
									</article>
								{/each}

								{#each stagedAdds as item (item.id)}
									<article class="staged new-item">
										<div class="item-icon">＋</div>
										<div>
											<strong>{item.name}</strong>
											<p>Item #{item.id} · max {item.maxQuantity}</p>
											<small>NEW</small>
										</div>
										<div class="quantity">
											<button
												type="button"
												data-destination-focus={`staged-item-${activePocketProjection.key}-${item.id}-decrement`}
												disabled={busy || item.quantity <= 1}
												onclick={() =>
													updateAddedItem(activePocketProjection.key, item, item.quantity - 1)}
												>−</button
											>
											<input
												aria-label={item.name + ' quantity'}
												data-destination-focus={`staged-item-${activePocketProjection.key}-${item.id}-quantity`}
												type="number"
												min="1"
												max={item.maxQuantity}
												value={item.quantity}
												disabled={busy}
												onchange={(event) =>
													updateAddedItem(
														activePocketProjection.key,
														item,
														Number((event.currentTarget as HTMLInputElement).value)
													)}
											/>
											<button
												type="button"
												data-destination-focus={`staged-item-${activePocketProjection.key}-${item.id}-increment`}
												disabled={busy || item.quantity >= item.maxQuantity}
												onclick={() =>
													updateAddedItem(activePocketProjection.key, item, item.quantity + 1)}
												>+</button
											>
											<button
												type="button"
												data-destination-focus={`staged-item-${activePocketProjection.key}-${item.id}-remove`}
												class="remove"
												disabled={busy}
												onclick={() => discardAddedItem(activePocketProjection.key, item.id)}
												>Cancel</button
											>
										</div>
									</article>
								{/each}
							</div>
						{/if}
					{:else}
						<div class="notice unsupported">
							<span>×</span>
							<div>
								<strong>Inventory editing unavailable</strong>
								<p>{projection.inventory.unsupportedReason}</p>
							</div>
						</div>
					{/if}
				</section>
			{/if}

			{#if editor.applyOutcome.message}
				<div class:error-outcome={editor.applyOutcome.status !== 'success'} class="notice outcome">
					<span>{editor.applyOutcome.status === 'success' ? '✓' : '!'}</span>
					<div><strong>{editor.applyOutcome.message}</strong></div>
				</div>
			{/if}
			{#if loadError}<div class="notice unsupported">
					<span>!</span>
					<div><strong>{loadError}</strong></div>
				</div>{/if}
		</main>

		<footer class="apply-bar">
			<div class="stage-badge">{stagedCount}</div>
			<div class="apply-copy">
				<strong>{stagedCount} staged {stagedCount === 1 ? 'edit' : 'edits'}</strong>
				<span
					>{stagedCount
						? 'Save File bytes remain untouched until Apply.'
						: workspace.dirty
							? 'Workspace has unapplied export changes.'
							: 'No staged changes.'}</span
				>
			</div>
			<button
				type="button"
				data-destination-focus="cancel-all"
				disabled={!editor.staged || busy}
				onclick={cancelAll}>Cancel all</button
			>
			<button
				type="button"
				class="apply"
				data-destination-focus="apply-edits"
				disabled={!editor.staged || busy}
				onclick={applyEdits}
			>
				<span class="apply-icon" aria-hidden="true">✓</span>
				{busy ? 'Applying…' : 'Apply edits'}
			</button>
		</footer>
	</section>
{/if}

<style>
	.save-file-route {
		--mock-rust: var(--rust);
		--mock-gold: var(--gold);
		--mock-ink: var(--ink);
		--mock-muted: var(--ink-mute);
		--mock-panel: var(--paper-hi);
		--mock-card: var(--paper-deep);
		--mock-rule: var(--rule-hi);
		min-height: calc(100dvh - 112px);
		display: grid;
		grid-template-columns: 240px minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) auto;
		gap: 14px;
		color: var(--mock-ink);
	}

	.mobile-heading {
		display: none;
	}

	.field-sidebar,
	.editor-panel,
	.apply-bar {
		border: 1px solid var(--mock-rule);
		border-radius: var(--pksx-radius-xl);
		background: var(--mock-panel);
		box-shadow: var(--shadow-deep);
	}

	.field-sidebar {
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 18px;
	}

	.field-sidebar > p,
	.section-copy p,
	.mock-field > span,
	.currency-card header,
	.apply-copy > span {
		margin: 0;
		color: var(--mock-muted);
		font:
			750 0.74rem var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.field-sidebar nav {
		display: grid;
		gap: 10px;
	}

	.field-sidebar nav button {
		position: relative;
		min-height: 58px;
		display: grid;
		grid-template-columns: 34px minmax(0, 1fr) auto;
		grid-template-areas:
			'icon label badge'
			'icon detail badge';
		grid-template-rows: auto auto;
		gap: 3px 10px;
		align-content: center;
		padding: 10px;
		border: 1px solid transparent;
		border-radius: var(--pksx-radius-md);
		background: transparent;
		color: var(--mock-ink);
		text-align: left;
	}

	.field-sidebar nav button.active {
		border-color: color-mix(in srgb, var(--mock-rust), transparent 48%);
		background: color-mix(in srgb, var(--mock-rust), transparent 88%);
		color: var(--mock-rust);
	}

	.nav-icon {
		width: 34px;
		height: 34px;
		display: grid;
		grid-area: icon;
		place-items: center;
		border-radius: 10px;
		background: var(--mock-card);
		color: var(--mock-muted);
		box-shadow: var(--shadow-sm);
	}

	.field-sidebar nav button.active .nav-icon {
		background: var(--mock-rust);
		color: white;
	}

	.field-sidebar nav button strong {
		grid-area: label;
		min-width: 0;
		line-height: 1.1;
	}

	.field-sidebar nav button small {
		grid-area: detail;
		min-width: 0;
		line-height: 1.2;
	}

	.field-sidebar nav button em {
		grid-area: badge;
	}

	.field-sidebar strong,
	.editor-panel strong,
	.apply-bar strong {
		font-weight: 850;
	}

	.field-sidebar small {
		color: var(--mock-muted);
		font-size: 0.78rem;
	}

	.field-sidebar em,
	.section-tabs span,
	.pocket-row button.staged::after {
		min-width: 26px;
		display: inline-grid;
		place-items: center;
		border-radius: 999px;
		background: var(--mock-gold);
		color: white;
		font-style: normal;
		font-weight: 850;
	}

	.backup-ready {
		margin-top: auto;
		display: grid;
		grid-template-columns: 24px minmax(0, 1fr);
		gap: 2px 8px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--mock-card);
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.backup-ready span {
		grid-row: span 2;
	}

	.backup-ready small {
		font-family: var(--pksx-font-mono);
	}

	.editor-panel {
		min-width: 0;
		min-height: 0;
		padding: 22px;
		overflow: auto;
	}

	.section-tabs {
		display: none;
	}

	.mock-section {
		display: grid;
		gap: 18px;
	}

	.section-copy h2 {
		margin: 3px 0 4px;
		font-size: clamp(1.9rem, 3vw, 2.4rem);
		line-height: 1;
	}

	.section-copy span {
		max-width: 760px;
		display: block;
		color: var(--ink-soft);
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.35;
	}

	.trainer-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 14px;
		padding: 14px;
		border-radius: var(--pksx-radius-lg);
		background: var(--mock-card);
		box-shadow: var(--shadow-sm);
	}

	.avatar {
		width: 60px;
		height: 60px;
		display: grid;
		place-items: center;
		border-radius: 16px;
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--mock-rust), transparent 55%),
			color-mix(in srgb, var(--mock-gold), transparent 58%)
		);
		color: var(--mock-rust);
		font-size: 1.4rem;
		font-weight: 900;
	}

	.trainer-card strong {
		display: block;
		font-size: 1.35rem;
	}

	.trainer-card span,
	.mock-field small,
	.currency-card p,
	.notice p,
	.item-list p,
	.apply-copy > span {
		color: var(--mock-muted);
		font-weight: 650;
	}

	.playtime {
		text-align: right;
	}

	.playtime small {
		display: block;
		color: var(--mock-muted);
		font:
			750 0.7rem var(--pksx-font-mono),
			monospace;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	.playtime b {
		font-size: 1.5rem;
	}

	.trainer-grid,
	.wallet-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}

	.mock-field,
	.currency-card {
		display: grid;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--mock-rule);
		border-radius: var(--pksx-radius-lg);
		background: var(--mock-card);
	}

	.mock-field.staged,
	.currency-card.staged {
		border-color: color-mix(in srgb, var(--mock-gold), transparent 28%);
		background: color-mix(in srgb, var(--mock-gold), transparent 91%);
	}

	.mock-field > span,
	.currency-card header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.mock-field input {
		--pksx-type-editable: 1.05rem;
		width: 100%;
		box-sizing: border-box;
		border: 0;
		border-radius: 10px;
		background: var(--mock-panel);
		color: var(--mock-ink);
		font: 850 1.05rem var(--pksx-font-sans);
		padding: 12px;
	}

	.segmented {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
	}

	.segmented button {
		min-height: 42px;
		border-radius: 10px;
		background: var(--mock-panel);
		font-weight: 850;
	}

	.segmented button.chosen {
		background: var(--mock-gold);
		color: white;
	}

	.currency-control {
		display: grid;
		grid-template-columns: 44px minmax(0, 1fr) 44px 64px;
		gap: 10px;
		align-items: center;
	}

	.currency-control button {
		min-height: 44px;
		border-radius: 10px;
		background: var(--mock-panel);
		font-size: 1.2rem;
		font-weight: 900;
	}

	.currency-control button:last-child {
		color: var(--mock-gold);
		font-size: 0.8rem;
	}

	.currency-control input {
		--pksx-type-editable: clamp(1.35rem, 3vw, 2rem);
		min-height: 54px;
		min-width: 0;
		padding: 0 14px;
		border: 1px solid color-mix(in srgb, var(--mock-gold), transparent 28%);
		border-radius: 12px;
		background: var(--mock-panel);
		color: var(--mock-gold);
		font: 850 clamp(1.35rem, 3vw, 2rem) var(--pksx-font-sans);
		text-align: right;
	}

	.notice {
		display: grid;
		grid-template-columns: 36px minmax(0, 1fr);
		gap: 12px;
		align-items: center;
		padding: 14px;
		border-radius: var(--pksx-radius-lg);
	}

	.notice > span {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: var(--mock-gold);
		color: white;
		font-weight: 900;
	}

	.notice p {
		margin: 2px 0 0;
	}

	.unsupported {
		border: 1px solid color-mix(in srgb, var(--err), transparent 48%);
		background: color-mix(in srgb, var(--err), transparent 93%);
	}

	.unsupported > span {
		background: var(--err);
	}

	.pocket-row {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 2px;
	}

	.pocket-row button {
		position: relative;
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		border-radius: 12px;
		background: var(--mock-card);
		white-space: nowrap;
	}

	.pocket-row button.active {
		background: var(--mock-rust);
		color: white;
	}

	.pocket-row button.staged::after {
		content: '';
		position: absolute;
		top: -5px;
		right: -5px;
		width: 11px;
		height: 11px;
		min-width: 11px;
		border: 2px solid var(--mock-panel);
	}

	.add-item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 10px;
		align-items: center;
		min-height: 48px;
		padding: 0 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--mock-card);
		color: var(--ink-soft);
	}

	.add-item button {
		min-height: 34px;
		padding: 0 14px;
		border-radius: 10px;
		background: var(--mock-rust);
		color: white;
		font-weight: 850;
	}

	.add-item small {
		padding: 4px 10px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--mock-rule), transparent 30%);
		color: var(--mock-muted);
	}

	.item-list {
		display: grid;
		gap: 8px;
	}

	.item-list article {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) auto;
		gap: 12px;
		align-items: center;
		min-height: 62px;
		padding: 10px;
		border: 1px solid var(--mock-rule);
		border-radius: var(--pksx-radius-md);
		background: var(--mock-card);
	}

	.item-list article.staged {
		border-color: color-mix(in srgb, var(--mock-gold), transparent 28%);
		background: color-mix(in srgb, var(--mock-gold), transparent 92%);
	}

	.item-list article.new-item {
		border-color: color-mix(in srgb, var(--ok), transparent 36%);
		background: color-mix(in srgb, var(--ok), transparent 92%);
	}

	.item-list article.pending-remove {
		opacity: 0.62;
	}

	.item-icon {
		width: 38px;
		height: 38px;
		display: grid;
		place-items: center;
		border-radius: 10px;
		background: var(--mock-panel);
		font-weight: 900;
	}

	.item-list p {
		margin: 2px 0 0;
	}

	.item-list small {
		display: inline-block;
		margin-top: 3px;
		padding: 2px 8px;
		border: 1px solid currentColor;
		border-radius: 7px;
		color: var(--mock-gold);
		font:
			750 0.72rem var(--pksx-font-mono),
			monospace;
	}

	.quantity {
		display: grid;
		grid-template-columns: 32px 68px 32px auto;
		gap: 8px;
		align-items: center;
		text-align: center;
	}

	.quantity button {
		width: 32px;
		height: 32px;
		border-radius: 9px;
		background: var(--mock-panel);
		font-weight: 900;
	}

	.quantity input {
		width: 68px;
		height: 32px;
		box-sizing: border-box;
		border: 1px solid var(--mock-rule);
		border-radius: 9px;
		background: var(--mock-panel);
		color: var(--mock-ink);
		font-weight: 850;
		font-variant-numeric: tabular-nums;
		text-align: center;
		appearance: textfield;
	}

	.quantity input::-webkit-inner-spin-button,
	.quantity input::-webkit-outer-spin-button {
		margin: 0;
		appearance: none;
	}

	.quantity button.remove {
		width: auto;
		padding: 0 10px;
		color: var(--pksx-color-feedback-danger);
		font-size: 0.72rem;
	}

	.outcome {
		border: 1px solid color-mix(in srgb, var(--pksx-color-feedback-success), transparent 48%);
		background: color-mix(in srgb, var(--pksx-color-feedback-success), transparent 92%);
	}

	.outcome.error-outcome {
		border-color: color-mix(in srgb, var(--pksx-color-feedback-danger), transparent 48%);
		background: color-mix(in srgb, var(--pksx-color-feedback-danger), transparent 93%);
	}

	.empty-editor {
		min-height: calc(100dvh - 140px);
		display: grid;
		place-content: center;
		gap: 10px;
		text-align: center;
	}

	.empty-editor p {
		margin: 0;
		color: var(--pksx-color-text-secondary);
	}

	.empty-editor button {
		justify-self: center;
		padding: 10px 16px;
		border-radius: var(--pksx-radius-md);
		background: var(--pksx-color-accent-primary);
		color: white;
	}

	.apply-bar {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-color: color-mix(in srgb, var(--mock-gold), transparent 28%);
	}

	.apply-copy {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.stage-badge {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 12px;
		background: var(--mock-gold);
		color: white;
		font-weight: 900;
	}

	.apply-bar button {
		min-height: 40px;
		padding: 0 18px;
		border-radius: 12px;
		background: var(--mock-card);
		font-weight: 850;
	}

	.apply-bar button.apply {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: var(--mock-rust);
		color: white;
	}

	.apply-icon {
		width: 22px;
		height: 22px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: color-mix(in srgb, white, transparent 82%);
		font-size: 0.78rem;
		line-height: 1;
	}

	.save-file-route :is(button, input):focus-visible {
		outline: 3px solid color-mix(in srgb, var(--mock-rust), transparent 55%);
		outline-offset: 2px;
	}

	@media (max-width: 980px) {
		.save-file-route {
			grid-template-columns: 1fr;
			grid-template-rows: auto minmax(0, 1fr) auto;
			gap: 12px;
			padding-bottom: 72px;
		}

		.mobile-heading {
			display: grid;
			grid-template-columns: 56px minmax(0, 1fr) auto;
			gap: 12px;
			align-items: center;
		}

		.mobile-heading button {
			width: 56px;
			height: 56px;
			border-radius: 16px;
			background: var(--mock-panel);
			box-shadow: var(--shadow-sm);
			font-size: 2rem;
			font-weight: 900;
		}

		.mobile-heading h1,
		.mobile-heading p {
			margin: 0;
		}

		.mobile-heading h1 {
			font-size: 1.7rem;
			line-height: 1;
		}

		.mobile-heading p {
			color: var(--mock-muted);
			font-weight: 750;
		}

		.mobile-heading > span {
			display: flex;
			align-items: center;
			gap: 8px;
			padding: 10px 14px;
			border-radius: 14px;
			background: var(--mock-panel);
			box-shadow: var(--shadow-sm);
			color: var(--mock-gold);
			font-weight: 900;
		}

		.mobile-heading i {
			width: 10px;
			height: 10px;
			border-radius: 999px;
			background: var(--mock-gold);
		}

		.field-sidebar {
			display: none;
		}

		.editor-panel {
			border: 0;
			border-radius: 0;
			background: transparent;
			box-shadow: none;
			padding: 0;
			overflow: visible;
		}

		.section-copy {
			display: none;
		}

		.section-tabs {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 8px;
			margin-bottom: 14px;
		}

		.section-tabs button {
			position: relative;
			min-height: 56px;
			border-radius: 16px;
			background: var(--mock-panel);
			box-shadow: var(--shadow-sm);
			color: var(--ink-soft);
			font-size: 1.05rem;
			font-weight: 900;
		}

		.section-tabs button.active {
			background: var(--mock-rust);
			color: white;
		}

		.section-tabs span {
			position: absolute;
			top: 8px;
			right: 10px;
			min-width: 25px;
			background: var(--mock-gold);
		}

		.section-tabs button.active span {
			background: color-mix(in srgb, white, transparent 70%);
		}

		.trainer-card,
		.playtime {
			display: none;
		}

		.trainer-grid,
		.wallet-grid {
			grid-template-columns: 1fr;
		}

		.wallet-grid {
			gap: 14px;
		}

		.currency-control {
			grid-template-columns: 44px minmax(0, 1fr) 44px;
		}

		.currency-control button:last-child {
			display: none;
		}

		.item-list article {
			grid-template-columns: 54px minmax(0, 1fr) auto;
			min-height: 74px;
			border-radius: 18px;
		}

		.item-icon {
			width: 50px;
			height: 50px;
			border-radius: 14px;
		}

		.apply-bar {
			position: fixed;
			z-index: 70;
			right: 0;
			bottom: 0;
			left: 0;
			grid-template-columns: auto minmax(0, 1fr) auto;
			border-right: 0;
			border-bottom: 0;
			border-left: 0;
			border-radius: 0;
			padding: 12px max(16px, var(--safe-area-inset-right, env(safe-area-inset-right, 0px)))
				max(12px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))
				max(16px, var(--safe-area-inset-left, env(safe-area-inset-left, 0px)));
		}

		.apply-bar button:not(.apply) {
			display: none;
		}
	}

	@media (max-width: 620px) {
		.save-file-route {
			margin: -4px -4px 0;
		}

		.mobile-heading {
			grid-template-columns: 50px minmax(0, 1fr) auto;
		}

		.mobile-heading button {
			width: 50px;
			height: 50px;
		}

		.mobile-heading > span {
			padding: 8px 11px;
			font-size: 0.86rem;
		}

		.mock-field,
		.currency-card,
		.notice {
			border-radius: 18px;
			padding: 16px;
		}

		.item-list article {
			grid-template-columns: 42px minmax(0, 1fr);
		}

		.item-icon {
			width: 38px;
			height: 38px;
			border-radius: 10px;
		}

		.quantity {
			grid-column: 1 / -1;
			grid-template-columns: 32px 68px 32px auto;
			justify-content: end;
		}

		.add-item {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.add-item small {
			display: none;
		}

		.apply-bar {
			gap: 10px;
		}

		.apply-copy > span {
			letter-spacing: 0;
			text-transform: none;
		}

		.apply-bar button.apply {
			min-width: 112px;
			padding: 0 14px;
		}
	}
</style>
