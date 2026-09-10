<script lang="ts">
	import { tick } from 'svelte';
	import DelayedSpinner from './DelayedSpinner.svelte';
	import type {
		SaveFileLedgerCatalogue,
		SaveFileLedgerCommand,
		SaveFileLedgerCommitReason,
		SaveFileLedgerProps
	} from './save-file-ledger/types';

	let {
		view,
		command = null,
		catalogues = {},
		drafts = {},
		pendingTargets = [],
		errors = {},
		onBackToBoxes,
		onRetryLoad,
		onRetryEditing,
		onRetryCatalogue,
		onTrainerNameInput,
		onTrainerNameCommit,
		onTrainerNameAbandon,
		onTrainerGenderSelect,
		onMoneyInput,
		onMoneyCommit,
		onMoneyAbandon,
		onMoneyStep,
		onItemQuantityInput,
		onItemQuantityCommit,
		onItemQuantityAbandon,
		onItemQuantityStep,
		onCommandChange,
		onAddItem,
		onRemoveItem
	}: SaveFileLedgerProps = $props();

	let root: HTMLElement;
	let rememberedTarget: string | null = null;
	let targetBeforeEditingUnavailable: string | null = null;
	let suppressBlurCommit = false;
	let previousCommand: SaveFileLedgerCommand | null = null;
	let editingWasUnavailable = false;
	let lastItemFocus: { pocketKey: string; itemId: number; index: number } | null = null;

	const ready = $derived(view.status === 'ready' ? view : null);
	const projection = $derived(ready?.projection ?? null);
	const trainerVisible = $derived(
		Boolean(
			projection?.trainerProfile.trainerNameSupported || projection?.trainerProfile.genderSupported
		)
	);
	const moneyVisible = $derived(projection?.money.supported === true);
	const bagVisible = $derived(projection?.inventory.supported === true);
	const pockets = $derived(projection?.inventory.pockets ?? []);
	const hasCapabilities = $derived(trainerVisible || moneyVisible || bagVisible);
	const editingUnavailable = $derived(ready?.editingUnavailable ?? null);
	const targetSignature = $derived.by(() => {
		if (!ready) return view.status;
		return [
			ready.editingUnavailable?.message ?? '',
			command ? commandIdentity(command) : '',
			...pockets.flatMap((pocket) => [
				pocket.key,
				catalogueFor(pocket.key).status,
				...pocket.items.map((item) => String(item.id))
			])
		].join('|');
	});

	function ledgerRoot(node: HTMLElement) {
		root = node;
		window.addEventListener('keydown', handleWindowKeydown, true);
		return () => window.removeEventListener('keydown', handleWindowKeydown, true);
	}

	function reconcileTargets(
		signature: string,
		nextCommand: SaveFileLedgerCommand | null,
		unavailable: boolean
	) {
		void signature;
		return (node: HTMLElement) => {
			root = node;
			void tick().then(() => reconcileFocus(nextCommand, unavailable));
		};
	}

	function reconcileFocus(nextCommand: SaveFileLedgerCommand | null, unavailable: boolean) {
		if (!root) return;

		if (unavailable && !editingWasUnavailable) {
			targetBeforeEditingUnavailable = rememberedTarget;
			focusIdentity('editing-retry');
		} else if (!unavailable && editingWasUnavailable) {
			if (!focusIdentity(targetBeforeEditingUnavailable ?? '')) focusInitial();
			targetBeforeEditingUnavailable = null;
		}
		editingWasUnavailable = unavailable;

		if (nextCommand && commandIdentity(nextCommand) !== commandIdentity(previousCommand)) {
			focusIdentity(commandFirstIdentity(nextCommand));
		} else if (!nextCommand && previousCommand) {
			if (previousCommand.kind === 'add-item') {
				if (!focusIdentity(addIdentity(previousCommand.pocketKey))) {
					focusPocketEntry(previousCommand.pocketKey);
				}
			} else {
				focusAfterRemove(previousCommand.pocketKey, previousCommand.itemId);
			}
		}
		previousCommand = nextCommand;

		if (rememberedTarget && !findIdentity(rememberedTarget)) reconcileMissingTarget();
	}

	function handleFocusIn(event: FocusEvent) {
		if (!(event.target instanceof HTMLElement)) return;
		const identity = event.target.dataset.destinationFocus;
		if (identity) rememberedTarget = identity;

		const pocketKey = event.target.dataset.pocketKey;
		const itemId = Number(event.target.dataset.itemId);
		if (pocketKey && Number.isInteger(itemId)) {
			const pocket = pockets.find((candidate) => candidate.key === pocketKey);
			const index = pocket?.items.findIndex((item) => item.id === itemId) ?? -1;
			if (index >= 0) lastItemFocus = { pocketKey, itemId, index };
		}

		event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const inside = active && root?.contains(active);
		if (!inside) return;

		if (event.key === 'Escape' || event.key === 'Backspace') {
			if (handleBack()) {
				consume(event);
			}
			return;
		}

		if (event.key === 'Enter' && active.matches('[data-ledger-draft]')) {
			consume(event);
			commitDraft(active, 'enter');
			return;
		}

		if (!event.key.startsWith('Arrow')) return;
		const row = active.closest<HTMLElement>('[data-ledger-row]');
		if (!row) return;
		consume(event);

		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const controls = controlsFor(row);
			const index = Math.max(0, controls.indexOf(active));
			const offset = event.key === 'ArrowLeft' ? -1 : 1;
			focusElement(controls[Math.max(0, Math.min(index + offset, controls.length - 1))]);
			return;
		}

		if (event.key === 'ArrowDown' && active.dataset.ledgerJump) {
			focusPocketEntry(active.dataset.ledgerJump);
			return;
		}

		const rows = focusRows();
		const rowIndex = rows.indexOf(row);
		const controls = controlsFor(row);
		const column = Math.max(0, controls.indexOf(active));
		const offset = event.key === 'ArrowUp' ? -1 : 1;
		const nextRow = rows[Math.max(0, Math.min(rowIndex + offset, rows.length - 1))];
		const nextControls = controlsFor(nextRow ?? row);
		focusElement(nextControls[Math.min(column, nextControls.length - 1)]);
	}

	export function handleBack() {
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (!active || !root?.contains(active)) return false;
		if (command && active.closest('[data-ledger-command]')) {
			onCommandChange?.(null);
			return true;
		}
		if (active.matches('[data-ledger-draft]')) {
			abandonDraft(active);
			return true;
		}
		return false;
	}

	function consume(event: KeyboardEvent) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function controlsFor(row: Element) {
		return Array.from(
			row.querySelectorAll<HTMLElement>('[data-ledger-control]:not([disabled])')
		).filter((control) => control.getAttribute('aria-disabled') !== 'true');
	}

	function focusRows() {
		return Array.from(root.querySelectorAll<HTMLElement>('[data-ledger-row]')).filter(
			(row) => controlsFor(row).length > 0
		);
	}

	function focusElement(target: HTMLElement | undefined) {
		if (!target) return false;
		target.focus({ preventScroll: true });
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		return true;
	}

	function findIdentity(identity: string) {
		return identity
			? root.querySelector<HTMLElement>(
					`[data-destination-focus="${CSS.escape(identity)}"]:not([disabled])`
				)
			: null;
	}

	function focusIdentity(identity: string) {
		return focusElement(findIdentity(identity) ?? undefined);
	}

	function focusInitial() {
		return focusElement(
			root.querySelector<HTMLElement>('[data-destination-initial]:not([disabled])') ??
				focusRows().flatMap(controlsFor)[0]
		);
	}

	function reconcileMissingTarget() {
		if (lastItemFocus && rememberedTarget?.includes(`item-${lastItemFocus.pocketKey}-`)) {
			focusAfterRemove(lastItemFocus.pocketKey, lastItemFocus.itemId);
			return;
		}
		const retry = rememberedTarget?.match(/^pocket-(.+)-retry$/);
		if (retry && focusPocketEntry(retry[1])) return;
		focusInitial();
	}

	function focusAfterRemove(pocketKey: string, itemId: number) {
		if (focusIdentity(itemIdentity(pocketKey, itemId, 'remove'))) return true;
		const pocket = pockets.find((candidate) => candidate.key === pocketKey);
		const previousIndex =
			lastItemFocus?.pocketKey === pocketKey && lastItemFocus.itemId === itemId
				? lastItemFocus.index
				: 0;
		const next = pocket?.items[previousIndex] ?? pocket?.items[previousIndex - 1];
		if (next && focusItemRow(pocketKey, next.id)) return true;
		return focusIdentity(addIdentity(pocketKey)) || focusPocketEntry(pocketKey);
	}

	function focusPocketEntry(pocketKey: string) {
		const add = findIdentity(addIdentity(pocketKey));
		if (add) return focusElement(add);
		const retry = findIdentity(retryIdentity(pocketKey));
		if (retry) return focusElement(retry);
		const pocket = pockets.find((candidate) => candidate.key === pocketKey);
		const firstItem = pocket?.items[0];
		if (firstItem) return focusItemRow(pocketKey, firstItem.id);

		const index = pockets.findIndex((candidate) => candidate.key === pocketKey);
		for (const nextPocket of pockets.slice(index + 1)) {
			if (focusPocketEntry(nextPocket.key)) return true;
		}
		return false;
	}

	function focusItemRow(pocketKey: string, itemId: number) {
		const row = root.querySelector<HTMLElement>(
			`[data-ledger-row="${CSS.escape(`item-${pocketKey}-${itemId}`)}"]`
		);
		return focusElement(row ? controlsFor(row)[0] : undefined);
	}

	function activatePocketJump(pocketKey: string) {
		root
			.querySelector<HTMLElement>(`[data-ledger-pocket="${CSS.escape(pocketKey)}"]`)
			?.scrollIntoView({ block: 'start', inline: 'nearest' });
	}

	function openAddItem(pocketKey: string) {
		onCommandChange?.({ kind: 'add-item', pocketKey, itemId: null, quantity: 1 });
	}

	function updateAddCommand(patch: Partial<Extract<SaveFileLedgerCommand, { kind: 'add-item' }>>) {
		if (command?.kind !== 'add-item') return;
		onCommandChange?.({ ...command, ...patch });
	}

	function openRemoveItem(pocketKey: string, itemId: number) {
		onCommandChange?.({ kind: 'remove-item', pocketKey, itemId });
	}

	function catalogueFor(pocketKey: string): SaveFileLedgerCatalogue {
		return catalogues[pocketKey] ?? { status: 'loading' };
	}

	function availableOptions(pocketKey: string) {
		const catalogue = catalogueFor(pocketKey);
		if (catalogue.status !== 'ready') return [];
		const occupied = new Set(
			pockets.find((pocket) => pocket.key === pocketKey)?.items.map((item) => item.id) ?? []
		);
		return catalogue.availableItems.filter((item) => !occupied.has(item.id));
	}

	function itemDraft(pocketKey: string, itemId: number, accepted: number) {
		return drafts.itemQuantities?.[`${pocketKey}:${itemId}`] ?? { value: String(accepted) };
	}

	function isPending(identity: string, direct = false) {
		return direct || pendingTargets.includes(identity);
	}

	function beginOperatorPointer() {
		suppressBlurCommit = true;
		setTimeout(() => (suppressBlurCommit = false), 0);
	}

	function handleDraftBlur(
		event: FocusEvent,
		commit: ((reason: SaveFileLedgerCommitReason) => void) | undefined
	) {
		if (suppressBlurCommit) return;
		const related = event.relatedTarget;
		if (related instanceof HTMLElement && related.hasAttribute('data-ledger-consumes-draft'))
			return;
		commit?.('blur');
	}

	function commitDraft(target: HTMLElement, reason: SaveFileLedgerCommitReason) {
		if (target.dataset.ledgerDraft === 'trainer-name') onTrainerNameCommit?.(reason);
		else if (target.dataset.ledgerDraft === 'money') onMoneyCommit?.(reason);
		else if (target.dataset.pocketKey && target.dataset.itemId) {
			onItemQuantityCommit?.(target.dataset.pocketKey, Number(target.dataset.itemId), reason);
		}
	}

	function abandonDraft(target: HTMLElement) {
		if (target.dataset.ledgerDraft === 'trainer-name') onTrainerNameAbandon?.();
		else if (target.dataset.ledgerDraft === 'money') onMoneyAbandon?.();
		else if (target.dataset.pocketKey && target.dataset.itemId) {
			onItemQuantityAbandon?.(target.dataset.pocketKey, Number(target.dataset.itemId));
		}
	}

	function commandIdentity(value: SaveFileLedgerCommand | null) {
		return value
			? `${value.kind}:${value.pocketKey}:${value.kind === 'remove-item' ? value.itemId : ''}`
			: '';
	}

	function commandFirstIdentity(value: SaveFileLedgerCommand) {
		return value.kind === 'add-item'
			? `pocket-${value.pocketKey}-add-item`
			: itemIdentity(value.pocketKey, value.itemId, 'confirm-remove');
	}

	function addIdentity(pocketKey: string) {
		return `pocket-${pocketKey}-add`;
	}

	function retryIdentity(pocketKey: string) {
		return `pocket-${pocketKey}-retry`;
	}

	function jumpIdentity(pocketKey: string) {
		return `pocket-${pocketKey}-jump`;
	}

	function itemIdentity(pocketKey: string, itemId: number, control: string) {
		return `item-${pocketKey}-${itemId}-${control}`;
	}

	function firstTargetIdentity() {
		if (!projection) return '';
		if (projection.trainerProfile.trainerNameSupported) return 'trainer-name';
		if (projection.trainerProfile.genderSupported) return 'trainer-gender-male';
		if (projection.money.supported) return 'money-decrease';
		for (const pocket of pockets) {
			const catalogue = catalogueFor(pocket.key);
			if (catalogue.status === 'ready' && !pocket.full && availableOptions(pocket.key).length > 0) {
				return addIdentity(pocket.key);
			}
			if (catalogue.status === 'failed') return retryIdentity(pocket.key);
			if (pocket.items[0]) return itemIdentity(pocket.key, pocket.items[0].id, 'decrease');
		}
		return pockets[0] ? jumpIdentity(pockets[0].key) : '';
	}
</script>

<section
	class="save-file-ledger-frame pksx-density-container"
	aria-labelledby="save-file-ledger-title"
	data-destination-root="save-file"
	data-initial-state={view.status === 'loading' ? 'loading' : 'ready'}
	aria-busy={view.status === 'loading'}
	onfocusin={handleFocusIn}
	{@attach ledgerRoot}
	{@attach reconcileTargets(targetSignature, command, editingUnavailable !== null)}
>
	<div class="save-file-ledger-density pksx-density">
		<div class="save-file-ledger-container">
			{#if view.status === 'loading'}
				<div class="route-state" aria-live="polite">
					<h1 id="save-file-ledger-title">Save File</h1>
					<DelayedSpinner active label="Loading Save File" />
				</div>
			{:else if view.status === 'no-active-save'}
				<div class="route-state">
					<h1 id="save-file-ledger-title">Save File</h1>
					<strong>No active Save File</strong>
					<p>Import or select a Save File to edit its supported details.</p>
					<button
						type="button"
						data-ledger-row="no-active-save"
						data-ledger-control
						data-destination-initial
						data-destination-focus="back-boxes"
						onclick={onBackToBoxes}>Back to Boxes</button
					>
				</div>
			{:else if view.status === 'load-failed'}
				<div class="route-state" role="alert">
					<h1 id="save-file-ledger-title">Save File</h1>
					<strong>Could not load this Save File</strong>
					<p>{view.message}</p>
					<div class="state-actions" data-ledger-row="load-failed">
						<button
							type="button"
							data-ledger-control
							data-destination-initial
							data-destination-focus="load-retry"
							aria-busy={view.retrying === true}
							disabled={view.retrying === true}
							onclick={onRetryLoad}
						>
							Retry <DelayedSpinner
								active={view.retrying === true}
								label="Retrying Save File load"
							/>
						</button>
						<button
							type="button"
							data-ledger-control
							data-destination-focus="back-boxes"
							onclick={onBackToBoxes}>Back to Boxes</button
						>
					</div>
				</div>
			{:else}
				<div class="ledger-screen">
					<header class="workspace-identity">
						<div>
							<p class="eyebrow">Save File</p>
							<h1 id="save-file-ledger-title">Ledger</h1>
						</div>
						<p class="workspace-file">
							<span class="filename" title={view.originalFilename}>{view.originalFilename}</span>
							<span aria-hidden="true">·</span>
							<span>{view.summary.gameVersion}</span>
						</p>
					</header>

					{#if view.editingUnavailable}
						<div class="editing-unavailable" role="status">
							<p><strong>Editing unavailable.</strong> {view.editingUnavailable.message}</p>
							<button
								type="button"
								data-ledger-row="editing-retry"
								data-ledger-control
								data-destination-initial
								data-destination-focus="editing-retry"
								aria-busy={view.editingUnavailable.retrying === true}
								disabled={view.editingUnavailable.retrying === true}
								onclick={onRetryEditing}
							>
								Retry
								<DelayedSpinner
									active={view.editingUnavailable.retrying === true}
									label="Retrying Save File editing"
								/>
							</button>
						</div>
					{/if}

					{#if !hasCapabilities}
						<div class="route-state embedded">
							<strong>No editable details are available</strong>
							<p>This game does not expose Trainer, Money, or Bag editing here.</p>
							<button
								type="button"
								data-ledger-row="empty-capabilities"
								data-ledger-control
								data-destination-initial
								data-destination-focus="back-boxes"
								onclick={onBackToBoxes}>Back to Boxes</button
							>
						</div>
					{:else}
						<div class="ledger-layout">
							<div class="details-block" aria-label="Trainer and Money">
								{#if trainerVisible}
									<section class="details-section" aria-labelledby="ledger-trainer-title">
										<header class="details-heading">
											<p class="section-number">01</p>
											<h2 id="ledger-trainer-title">Trainer</h2>
										</header>
										<dl class="trainer-facts">
											<div>
												<dt>Trainer ID</dt>
												<dd>{view.summary.trainerId}</dd>
											</div>
											<div>
												<dt>Play time</dt>
												<dd>{view.summary.playTime}</dd>
											</div>
										</dl>

										{#if view.projection.trainerProfile.trainerNameSupported}
											{@const nameField = drafts.trainerName ?? {
												value: view.projection.trainerProfile.trainerName ?? ''
											}}
											{@const nameError = nameField.error ?? errors['trainer-name']}
											<label class="field-row" data-ledger-row="trainer-name">
												<span>Trainer name</span>
												<input
													type="text"
													value={nameField.value}
													maxlength={view.projection.trainerProfile.trainerNameMaxLength}
													size={Math.max(1, view.projection.trainerProfile.trainerNameMaxLength)}
													data-ledger-control
													data-ledger-draft="trainer-name"
													data-destination-initial={firstTargetIdentity() === 'trainer-name'
														? ''
														: undefined}
													data-destination-focus="trainer-name"
													aria-busy={isPending('trainer-name', nameField.pending)}
													aria-invalid={nameError ? 'true' : undefined}
													aria-describedby={nameError ? 'trainer-name-error' : undefined}
													disabled={Boolean(editingUnavailable) ||
														isPending('trainer-name', nameField.pending)}
													oninput={(event) => onTrainerNameInput?.(event.currentTarget.value)}
													onblur={(event) => handleDraftBlur(event, onTrainerNameCommit)}
												/>
												<DelayedSpinner
													active={isPending('trainer-name', nameField.pending)}
													label="Updating Trainer name"
												/>
												{#if nameError}<small
														id="trainer-name-error"
														class="field-error"
														aria-live="polite">{nameError}</small
													>{/if}
											</label>
										{/if}

										{#if view.projection.trainerProfile.genderSupported}
											<div class="field-row" data-ledger-row="trainer-gender">
												<span>Gender</span>
												<div class="segmented" aria-label="Trainer gender">
													<button
														type="button"
														data-ledger-control
														data-destination-initial={firstTargetIdentity() ===
														'trainer-gender-male'
															? ''
															: undefined}
														data-destination-focus="trainer-gender-male"
														aria-pressed={view.projection.trainerProfile.gender === 'male'}
														disabled={Boolean(editingUnavailable) ||
															isPending('trainer-gender-male')}
														onclick={() => onTrainerGenderSelect?.('male')}>Male</button
													>
													<button
														type="button"
														data-ledger-control
														data-destination-focus="trainer-gender-female"
														aria-pressed={view.projection.trainerProfile.gender === 'female'}
														disabled={Boolean(editingUnavailable) ||
															isPending('trainer-gender-female')}
														onclick={() => onTrainerGenderSelect?.('female')}>Female</button
													>
													<DelayedSpinner
														active={isPending('trainer-gender-male') ||
															isPending('trainer-gender-female')}
														label="Updating Trainer gender"
													/>
												</div>
											</div>
										{/if}
									</section>
								{/if}

								{#if moneyVisible}
									{@const moneyField = drafts.money ?? {
										value: String(view.projection.money.value ?? '')
									}}
									{@const moneyError = moneyField.error ?? errors.money}
									<section
										class="details-section money-section"
										aria-labelledby="ledger-money-title"
									>
										<header class="details-heading">
											<p class="section-number">02</p>
											<div>
												<h2 id="ledger-money-title">Money</h2>
												<p>Maximum {view.projection.money.max.toLocaleString()}</p>
											</div>
										</header>
										<div
											class="money-row"
											data-ledger-row="money"
											aria-busy={isPending('money', moneyField.pending)}
										>
											<button
												type="button"
												aria-label="Decrease Money"
												data-ledger-control
												data-ledger-consumes-draft
												data-destination-initial={firstTargetIdentity() === 'money-decrease'
													? ''
													: undefined}
												data-destination-focus="money-decrease"
												disabled={Boolean(editingUnavailable) ||
													isPending('money', moneyField.pending)}
												onpointerdown={beginOperatorPointer}
												onclick={() => onMoneyStep?.(-1, moneyField.value)}>−</button
											>
											<input
												type="number"
												aria-label="Money"
												value={moneyField.value}
												min={view.projection.money.min}
												max={view.projection.money.max}
												size={String(view.projection.money.max).length}
												data-ledger-control
												data-ledger-draft="money"
												data-destination-focus="money-value"
												aria-invalid={moneyError ? 'true' : undefined}
												aria-describedby={moneyError ? 'money-error' : undefined}
												disabled={Boolean(editingUnavailable) ||
													isPending('money', moneyField.pending)}
												oninput={(event) => onMoneyInput?.(event.currentTarget.value)}
												onblur={(event) => handleDraftBlur(event, onMoneyCommit)}
											/>
											<button
												type="button"
												aria-label="Increase Money"
												data-ledger-control
												data-ledger-consumes-draft
												data-destination-focus="money-increase"
												disabled={Boolean(editingUnavailable) ||
													isPending('money', moneyField.pending)}
												onpointerdown={beginOperatorPointer}
												onclick={() => onMoneyStep?.(1, moneyField.value)}>+</button
											>
											<button
												type="button"
												data-ledger-control
												data-ledger-consumes-draft
												data-destination-focus="money-max"
												disabled={Boolean(editingUnavailable) ||
													isPending('money', moneyField.pending)}
												onpointerdown={beginOperatorPointer}
												onclick={() => onMoneyStep?.('max', moneyField.value)}>Max</button
											>
											<DelayedSpinner
												active={isPending('money', moneyField.pending)}
												label="Updating Money"
											/>
											{#if moneyError}<small id="money-error" class="field-error" aria-live="polite"
													>{moneyError}</small
												>{/if}
										</div>
									</section>
								{/if}
							</div>

							{#if bagVisible}
								<section class="bag-block" aria-labelledby="ledger-bag-title">
									<header class="bag-heading">
										<p class="section-number">03</p>
										<h2 id="ledger-bag-title">Bag</h2>
									</header>

									{#if pockets.length > 0}
										<nav
											class="pocket-jumps"
											aria-label="Bag pockets"
											data-ledger-row="pocket-jumps"
										>
											{#each pockets as pocket (pocket.key)}
												<button
													type="button"
													data-ledger-control
													data-ledger-jump={pocket.key}
													data-destination-focus={jumpIdentity(pocket.key)}
													onclick={() => activatePocketJump(pocket.key)}
												>
													{pocket.label} <span>{pocket.items.length}</span>
												</button>
											{/each}
										</nav>

										<div class="bag-ledger" data-testid="bag-ledger-scrollport">
											{#each pockets as pocket (pocket.key)}
												{@const catalogue = catalogueFor(pocket.key)}
												{@const options = availableOptions(pocket.key)}
												<section
													class="pocket-section"
													aria-labelledby={`pocket-${pocket.key}-title`}
													data-ledger-pocket={pocket.key}
												>
													<header class="pocket-heading">
														<h3 id={`pocket-${pocket.key}-title`}>{pocket.label}</h3>
														<span
															>{pocket.items.length}
															{pocket.items.length === 1 ? 'item' : 'items'}</span
														>
													</header>

													<div
														class="pocket-command"
														data-ledger-row={`pocket-${pocket.key}-command`}
													>
														{#if command?.kind === 'add-item' && command.pocketKey === pocket.key}
															<div class="add-command" data-ledger-command>
																<label>
																	<span>Item</span>
																	<select
																		aria-label={`Item to add to ${pocket.label}`}
																		value={command.itemId ?? ''}
																		data-ledger-control
																		data-destination-focus={`pocket-${pocket.key}-add-item`}
																		disabled={Boolean(editingUnavailable)}
																		onchange={(event) =>
																			updateAddCommand({
																				itemId: Number(event.currentTarget.value)
																			})}
																	>
																		<option value="">Choose an item</option>
																		{#each options as option (option.id)}
																			<option value={option.id}>{option.name}</option>
																		{/each}
																	</select>
																</label>
																<label>
																	<span>Quantity</span>
																	<input
																		type="number"
																		min="1"
																		value={command.quantity}
																		data-ledger-control
																		data-destination-focus={`pocket-${pocket.key}-add-quantity`}
																		disabled={Boolean(editingUnavailable)}
																		oninput={(event) =>
																			updateAddCommand({
																				quantity: Number(event.currentTarget.value)
																			})}
																	/>
																</label>
																<button
																	type="button"
																	data-ledger-control
																	data-destination-focus={`pocket-${pocket.key}-add-confirm`}
																	disabled={command.itemId === null || Boolean(editingUnavailable)}
																	onclick={() => onAddItem?.(command)}>Add Item</button
																>
																<button
																	type="button"
																	data-ledger-control
																	data-controller-back
																	data-destination-focus={`pocket-${pocket.key}-add-cancel`}
																	onclick={() => onCommandChange?.(null)}>Cancel</button
																>
															</div>
														{:else}
															<button
																type="button"
																data-ledger-control
																data-destination-initial={firstTargetIdentity() ===
																addIdentity(pocket.key)
																	? ''
																	: undefined}
																data-destination-focus={addIdentity(pocket.key)}
																disabled={Boolean(editingUnavailable) ||
																	pocket.full ||
																	catalogue.status !== 'ready' ||
																	options.length === 0}
																onclick={() => openAddItem(pocket.key)}>Add Item</button
															>
														{/if}

														<div class="catalogue-status">
															{#if catalogue.status === 'loading'}
																<DelayedSpinner active label={`Loading ${pocket.label} items`} />
															{:else if catalogue.status === 'failed'}
																<span class="field-error">{catalogue.message}</span>
																<button
																	type="button"
																	data-ledger-control
																	data-destination-initial={firstTargetIdentity() ===
																	retryIdentity(pocket.key)
																		? ''
																		: undefined}
																	data-destination-focus={retryIdentity(pocket.key)}
																	onclick={() => onRetryCatalogue?.(pocket.key)}
																	>Retry catalogue</button
																>
															{:else}
																<span>{options.length} available</span>
															{/if}
														</div>
													</div>

													{#if pocket.items.length === 0}
														<p class="empty-pocket">No items in this pocket.</p>
													{:else}
														<ul class="item-list">
															{#each pocket.items as item (item.id)}
																{@const quantityField = itemDraft(
																	pocket.key,
																	item.id,
																	item.quantity
																)}
																{@const quantityIdentity = itemIdentity(
																	pocket.key,
																	item.id,
																	'quantity'
																)}
																{@const quantityError =
																	quantityField.error ?? errors[quantityIdentity]}
																{@const itemBusy = isPending(
																	quantityIdentity,
																	quantityField.pending
																)}
																<li
																	class="item-row"
																	data-ledger-row={`item-${pocket.key}-${item.id}`}
																	aria-busy={itemBusy}
																>
																	<div class="item-copy">
																		<strong title={item.name}>{item.name}</strong>
																		<span>Maximum {item.maxQuantity}</span>
																	</div>
																	{#if command?.kind === 'remove-item' && command.pocketKey === pocket.key && command.itemId === item.id}
																		<div
																			class="remove-command"
																			data-ledger-command
																			role="group"
																			aria-label={`Remove ${item.name}?`}
																		>
																			<span>Remove {item.name}?</span>
																			<button
																				type="button"
																				data-ledger-control
																				data-pocket-key={pocket.key}
																				data-item-id={item.id}
																				data-destination-focus={itemIdentity(
																					pocket.key,
																					item.id,
																					'confirm-remove'
																				)}
																				onclick={() => onRemoveItem?.(command)}>Confirm</button
																			>
																			<button
																				type="button"
																				data-ledger-control
																				data-controller-back
																				data-destination-focus={itemIdentity(
																					pocket.key,
																					item.id,
																					'cancel-remove'
																				)}
																				onclick={() => onCommandChange?.(null)}>Cancel</button
																			>
																		</div>
																	{:else}
																		<div class="quantity-controls">
																			<button
																				type="button"
																				aria-label={`Decrease ${item.name} quantity`}
																				data-ledger-control
																				data-ledger-consumes-draft
																				data-pocket-key={pocket.key}
																				data-item-id={item.id}
																				data-destination-initial={firstTargetIdentity() ===
																				itemIdentity(pocket.key, item.id, 'decrease')
																					? ''
																					: undefined}
																				data-destination-focus={itemIdentity(
																					pocket.key,
																					item.id,
																					'decrease'
																				)}
																				disabled={Boolean(editingUnavailable) ||
																					itemBusy ||
																					Number(quantityField.value) <= 1}
																				onpointerdown={beginOperatorPointer}
																				onclick={() =>
																					onItemQuantityStep?.(
																						pocket.key,
																						item.id,
																						-1,
																						quantityField.value
																					)}>−</button
																			>
																			<input
																				type="number"
																				aria-label={`${item.name} quantity`}
																				value={quantityField.value}
																				min="1"
																				max={item.maxQuantity}
																				size={String(item.maxQuantity).length}
																				data-ledger-control
																				data-ledger-draft="item-quantity"
																				data-pocket-key={pocket.key}
																				data-item-id={item.id}
																				data-destination-focus={quantityIdentity}
																				aria-invalid={quantityError ? 'true' : undefined}
																				aria-describedby={quantityError
																					? `item-${pocket.key}-${item.id}-error`
																					: undefined}
																				disabled={Boolean(editingUnavailable) || itemBusy}
																				oninput={(event) =>
																					onItemQuantityInput?.(
																						pocket.key,
																						item.id,
																						event.currentTarget.value
																					)}
																				onblur={(event) =>
																					handleDraftBlur(event, (reason) =>
																						onItemQuantityCommit?.(pocket.key, item.id, reason)
																					)}
																			/>
																			<button
																				type="button"
																				aria-label={`Increase ${item.name} quantity`}
																				data-ledger-control
																				data-ledger-consumes-draft
																				data-pocket-key={pocket.key}
																				data-item-id={item.id}
																				data-destination-focus={itemIdentity(
																					pocket.key,
																					item.id,
																					'increase'
																				)}
																				disabled={Boolean(editingUnavailable) ||
																					itemBusy ||
																					Number(quantityField.value) >= item.maxQuantity}
																				onpointerdown={beginOperatorPointer}
																				onclick={() =>
																					onItemQuantityStep?.(
																						pocket.key,
																						item.id,
																						1,
																						quantityField.value
																					)}>+</button
																			>
																			<button
																				type="button"
																				data-ledger-control
																				data-pocket-key={pocket.key}
																				data-item-id={item.id}
																				data-destination-focus={itemIdentity(
																					pocket.key,
																					item.id,
																					'remove'
																				)}
																				disabled={Boolean(editingUnavailable) || itemBusy}
																				onclick={() => openRemoveItem(pocket.key, item.id)}
																				>Remove</button
																			>
																			<DelayedSpinner
																				active={itemBusy}
																				label={`Updating ${item.name}`}
																			/>
																		</div>
																		{#if quantityError}<small
																				id={`item-${pocket.key}-${item.id}-error`}
																				class="field-error"
																				aria-live="polite">{quantityError}</small
																			>{/if}
																	{/if}
																</li>
															{/each}
														</ul>
													{/if}
												</section>
											{/each}
										</div>
									{:else}
										<p class="empty-pocket">This Bag has no supported pockets.</p>
									{/if}
								</section>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</section>

<style>
	.save-file-ledger-frame,
	.save-file-ledger-density,
	.save-file-ledger-container,
	.ledger-screen {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
	}

	.save-file-ledger-container {
		container: save-file-ledger / size;
	}

	.ledger-screen {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: var(--pksx-space-2, 8px);
		font-size: var(--pksx-type-body, 13px);
		color: var(--pksx-color-text-primary, #2a241c);
		overflow: hidden;
	}

	.workspace-identity {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--pksx-space-3, 12px);
		min-width: 0;
		padding-inline: var(--pksx-space-1, 4px);
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: var(--pksx-type-display, 24px);
		line-height: 1;
	}

	h2 {
		font-size: var(--pksx-type-title, 16px);
		line-height: 1.15;
	}

	h3 {
		font-size: var(--pksx-type-body, 13px);
	}

	.eyebrow,
	.section-number,
	.field-row > span,
	.add-command label > span,
	.trainer-facts dt {
		font-size: var(--pksx-type-caption, 10px);
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--pksx-color-text-muted, #9b8d76);
	}

	.workspace-file {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
		max-width: min(64%, 48ch);
		color: var(--pksx-color-text-secondary, #6b5d4a);
	}

	.filename {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.editing-unavailable {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--pksx-space-2, 8px);
		padding: var(--pksx-space-2, 8px) var(--pksx-space-3, 12px);
		border: var(--pksx-border-width, 1px) solid var(--pksx-color-feedback-danger, #c93d3d);
		border-radius: var(--pksx-radius-medium, 6px);
		color: var(--pksx-color-feedback-danger, #c93d3d);
	}

	.ledger-layout {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--pksx-space-2, 8px);
		min-height: 0;
		overflow: hidden;
	}

	.details-block {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--pksx-space-2, 8px);
		min-width: 0;
	}

	.details-section,
	.bag-block,
	.route-state {
		border: var(--pksx-border-width, 1px) solid
			var(--pksx-color-border-strong, rgba(42, 36, 28, 0.14));
		border-radius: var(--pksx-radius-large, 9px);
		background: var(--pksx-color-surface-panel, #fbf6ec);
		box-shadow: var(--pksx-shadow-subtle, 0 2px 6px rgba(70, 50, 30, 0.12));
	}

	.details-section {
		display: grid;
		align-content: start;
		gap: var(--pksx-space-2, 8px);
		padding: var(--pksx-space-2, 8px);
		min-width: 0;
	}

	.details-heading,
	.bag-heading,
	.pocket-heading {
		display: flex;
		align-items: baseline;
		gap: var(--pksx-space-2, 8px);
	}

	.details-heading > div p {
		font-size: var(--pksx-type-caption, 10px);
		color: var(--pksx-color-text-secondary, #6b5d4a);
	}

	.trainer-facts {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--pksx-space-2, 8px);
		margin: 0;
	}

	.trainer-facts div {
		min-width: 0;
	}

	.trainer-facts dd {
		margin: 0;
		font-family: var(--pksx-font-mono, monospace);
		font-size: var(--pksx-type-label, 12px);
		font-weight: 650;
	}

	.field-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--pksx-space-1, 4px) var(--pksx-space-2, 8px);
		min-width: 0;
	}

	.field-row input {
		width: min(100%, calc(var(--trainer-name-ch, 10) * 1ch + 2.5rem));
	}

	.segmented {
		display: flex;
		align-items: center;
		gap: var(--pksx-space-1, 4px);
	}

	.money-row {
		display: grid;
		grid-template-columns:
			var(--pksx-control-height, 32px) minmax(7ch, 1fr) var(--pksx-control-height, 32px)
			auto;
		align-items: center;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
	}

	.money-row input,
	.quantity-controls input,
	.add-command input {
		min-width: 0;
		font-family: var(--pksx-font-mono, monospace);
		font-variant-numeric: tabular-nums;
	}

	.field-error {
		grid-column: 1 / -1;
		font-size: var(--pksx-type-caption, 10px);
		color: var(--pksx-color-feedback-danger, #c93d3d);
	}

	.bag-block {
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr);
		gap: var(--pksx-space-2, 8px);
		min-width: 0;
		min-height: 0;
		padding: var(--pksx-space-2, 8px);
		overflow: hidden;
	}

	.pocket-jumps {
		display: flex;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		overscroll-behavior-inline: contain;
		scrollbar-width: thin;
	}

	.pocket-jumps button {
		flex: 0 0 auto;
	}

	.pocket-jumps span,
	.pocket-heading span,
	.item-copy span,
	.catalogue-status {
		font-size: var(--pksx-type-caption, 10px);
		color: var(--pksx-color-text-secondary, #6b5d4a);
	}

	.bag-ledger {
		min-width: 0;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;
		overscroll-behavior-block: contain;
		scroll-padding-block: calc(var(--pksx-control-height, 32px) + var(--pksx-space-2, 8px));
	}

	.pocket-section {
		display: grid;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
		scroll-margin-block-start: var(--pksx-control-height, 32px);
	}

	.pocket-section + .pocket-section {
		margin-block-start: var(--pksx-space-3, 12px);
	}

	.pocket-heading {
		position: sticky;
		z-index: 2;
		top: 0;
		justify-content: space-between;
		min-height: var(--pksx-small-control-height, 24px);
		padding: var(--pksx-space-1, 4px) var(--pksx-space-2, 8px);
		border-bottom: var(--pksx-border-width, 1px) solid
			var(--pksx-color-border-strong, rgba(42, 36, 28, 0.14));
		background: var(--pksx-color-surface-subtle, #ebe2d2);
	}

	.pocket-command {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: var(--pksx-space-2, 8px);
		min-width: 0;
		padding: var(--pksx-space-1, 4px);
		scroll-margin-block: calc(var(--pksx-control-height, 32px) + var(--pksx-space-2, 8px));
	}

	.catalogue-status {
		display: flex;
		align-items: center;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
		white-space: normal;
	}

	.add-command {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) auto auto auto;
		align-items: end;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
	}

	.add-command label {
		display: grid;
		gap: var(--pksx-space-1, 4px);
		min-width: 0;
	}

	.item-list {
		display: grid;
		gap: var(--pksx-space-1, 4px);
		padding: 0;
		margin: 0;
		list-style: none;
	}

	.item-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--pksx-space-1, 4px) var(--pksx-space-2, 8px);
		min-width: 0;
		padding: var(--pksx-space-1, 4px) var(--pksx-space-2, 8px);
		border-bottom: var(--pksx-border-width, 1px) solid
			var(--pksx-color-border-subtle, rgba(42, 36, 28, 0.08));
		scroll-margin-block: calc(var(--pksx-control-height, 32px) + var(--pksx-space-2, 8px));
	}

	.item-copy {
		display: grid;
		min-width: 0;
	}

	.item-copy strong {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		line-height: 1.2;
	}

	.quantity-controls,
	.remove-command {
		display: grid;
		grid-template-columns:
			var(--pksx-control-height, 32px) minmax(5ch, 7ch) var(--pksx-control-height, 32px)
			auto;
		align-items: center;
		gap: var(--pksx-space-1, 4px);
	}

	.remove-command {
		grid-template-columns: minmax(0, 1fr) auto auto;
	}

	.empty-pocket {
		padding: var(--pksx-space-2, 8px);
		color: var(--pksx-color-text-secondary, #6b5d4a);
	}

	.route-state {
		display: grid;
		place-content: center;
		justify-items: start;
		gap: var(--pksx-space-2, 8px);
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: var(--pksx-space-4, 16px);
	}

	.route-state.embedded {
		place-content: start;
		height: auto;
	}

	.state-actions {
		display: flex;
		gap: var(--pksx-space-1, 4px);
	}

	button,
	input,
	select {
		min-height: var(--pksx-control-height, 32px);
		border: var(--pksx-border-width, 1px) solid
			var(--pksx-color-border-strong, rgba(42, 36, 28, 0.14));
		border-radius: var(--pksx-radius-small, 4px);
		background: var(--pksx-color-surface-panel, #fbf6ec);
		color: inherit;
		font: inherit;
	}

	button {
		padding-inline: var(--pksx-space-2, 8px);
		font-size: var(--pksx-type-label, 12px);
		font-weight: 700;
		cursor: pointer;
	}

	button:hover:not(:disabled),
	button[aria-pressed='true'] {
		border-color: var(--pksx-color-accent-primary, #b85838);
		background: var(--pksx-color-accent-wash, rgba(184, 88, 56, 0.1));
	}

	button:disabled,
	input:disabled,
	select:disabled {
		cursor: default;
		opacity: 0.56;
	}

	:is(button, input, select):focus-visible {
		outline: var(--pksx-focus-ring, 2px) solid
			var(--pksx-color-accent-ring, rgba(184, 88, 56, 0.35));
		outline-offset: 1px;
	}

	@container save-file-ledger (min-width: 540px) {
		.details-block {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@container save-file-ledger (aspect-ratio > 1 / 1) {
		.ledger-layout {
			grid-template-columns: 260px minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr);
		}

		.details-block {
			grid-template-columns: minmax(0, 1fr);
			align-content: start;
		}
	}

	@container save-file-ledger (max-width: 430px) {
		.workspace-identity {
			align-items: start;
			flex-direction: column;
			gap: var(--pksx-space-1, 4px);
		}

		.workspace-file {
			justify-content: flex-start;
			max-width: 100%;
			width: 100%;
		}

		.add-command,
		.item-row {
			grid-template-columns: minmax(0, 1fr);
		}

		.quantity-controls,
		.remove-command {
			justify-self: stretch;
		}

		.quantity-controls {
			grid-template-columns:
				var(--pksx-control-height, 32px) minmax(5ch, 1fr) var(--pksx-control-height, 32px)
				auto;
		}
	}
</style>
