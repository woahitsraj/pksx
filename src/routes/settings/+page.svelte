<script module lang="ts">
	let rememberedStop = 'theme';
	let rememberedThemeControl = 0;
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { appPlatformLabel, getAppMetadata } from '$lib/pksx/app-metadata';
	import { appChrome } from '$lib/pksx/app-chrome.svelte';
	import { isControllerKeyboardEvent } from '$lib/pksx/controller-input';
	import { getPkhexEngine } from '$lib/pksx/saves-cache';
	import { getSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';
	import { theme } from '$lib/pksx/theme.svelte';

	type ReferenceRow = { action: string; controller: string; keyboard: string };
	type ReferenceGroup = { id: string; title: string; rows: ReferenceRow[] };

	const referenceGroups: ReferenceGroup[] = [
		{
			id: 'everywhere',
			title: 'Everywhere',
			rows: [
				{ action: 'Move focus', controller: 'D-pad', keyboard: 'Arrow keys' },
				{ action: 'Confirm', controller: 'A', keyboard: 'Enter' },
				{ action: 'Back', controller: 'B', keyboard: 'Escape' },
				{ action: 'Main Menu', controller: 'Start', keyboard: 'Cmd/Ctrl+K' }
			]
		},
		{
			id: 'boxes',
			title: 'Boxes',
			rows: [
				{ action: 'Slot Menu', controller: 'A', keyboard: 'Enter' },
				{ action: 'Box Menu', controller: 'X', keyboard: 'X' },
				{
					action: 'Previous / next Location',
					controller: 'L1 / R1',
					keyboard: 'PageUp / PageDown'
				},
				{
					action: 'Start Carry',
					controller: 'A, then Move or Copy',
					keyboard: 'Enter, then Move or Copy'
				}
			]
		},
		{
			id: 'carry',
			title: 'Carry',
			rows: [
				{ action: 'Complete', controller: 'A', keyboard: 'Enter' },
				{ action: 'Toggle Move / Copy', controller: 'Y', keyboard: 'Y' },
				{ action: 'Cancel', controller: 'B', keyboard: 'Escape' }
			]
		},
		{
			id: 'surfaces',
			title: 'Menus and Takeovers',
			rows: [
				{ action: 'Confirm', controller: 'A', keyboard: 'Enter' },
				{ action: 'Back', controller: 'B', keyboard: 'Escape' }
			]
		},
		{
			id: 'editor',
			title: 'Pokemon Editor',
			rows: [
				{ action: 'Move in a Focus Zone', controller: 'D-pad', keyboard: 'Arrow keys' },
				{ action: 'Enter section', controller: 'A', keyboard: 'Enter' },
				{ action: 'Previous / next section', controller: 'L2 / R2', keyboard: 'PageUp / PageDown' }
			]
		}
	];

	let route: HTMLElement;
	const summonedWorkflow = getSummonedWorkflowHost();
	let appVersion = $state('Loading…');
	let platform = $state('Loading…');
	let pkhexCoreVersion = $state('Loading…');

	onMount(() => {
		void loadMetadata();
		queueMicrotask(() => focusStop(rememberedStop, rememberedThemeControl));
	});

	$effect(() => {
		appChrome.controllerInputActive = true;
		appChrome.carryActive = false;
		return () => {
			appChrome.controllerInputActive = false;
		};
	});

	async function loadMetadata() {
		try {
			const metadata = await getAppMetadata();
			appVersion = metadata.version;
			platform = appPlatformLabel(metadata.platform);
		} catch {
			appVersion = 'Unavailable';
			platform = 'Unavailable';
		}

		const result = await getPkhexEngine().getVersion();
		pkhexCoreVersion = result.ok ? result.value.pkhexCoreVersion : 'Unavailable';
	}

	function settingsZone(node: HTMLElement) {
		route = node;
	}

	function controlsFor(row: Element) {
		return Array.from(row.querySelectorAll<HTMLElement>('[data-settings-control]'));
	}

	function rows() {
		return Array.from(route.querySelectorAll<HTMLElement>('[data-settings-row]'));
	}

	function focusStop(id: string, column = 0) {
		const row = route.querySelector<HTMLElement>(`[data-settings-row="${id}"]`) ?? rows()[0];
		if (!row) return;
		const controls = controlsFor(row);
		const target = controls[Math.min(column, controls.length - 1)];
		target?.focus();
		target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function handleFocusIn(event: FocusEvent) {
		if (!(event.target instanceof HTMLElement)) return;
		const row = event.target.closest<HTMLElement>('[data-settings-row]');
		if (!row) return;
		rememberedStop = row.dataset.settingsRow ?? 'theme';
		if (rememberedStop === 'theme') {
			rememberedThemeControl = Math.max(0, controlsFor(row).indexOf(event.target));
		}
		event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function handleKeydown(event: KeyboardEvent) {
		if (summonedWorkflow.active) return;
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (!active || !route.contains(active)) {
			if (isControllerKeyboardEvent(event) && event.key.startsWith('Arrow')) {
				focusStop(rememberedStop, rememberedThemeControl);
				event.preventDefault();
			}
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			if (active instanceof HTMLButtonElement) active.click();
			return;
		}
		if (!event.key.startsWith('Arrow')) return;

		const row = active.closest<HTMLElement>('[data-settings-row]');
		if (!row) return;
		const currentRows = rows();
		const rowIndex = currentRows.indexOf(row);
		const controls = controlsFor(row);
		const column = Math.max(0, controls.indexOf(active));

		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			const offset = event.key === 'ArrowLeft' ? -1 : 1;
			controls[Math.max(0, Math.min(column + offset, controls.length - 1))]?.focus();
		} else {
			const offset = event.key === 'ArrowUp' ? -1 : 1;
			const nextRow = currentRows[Math.max(0, Math.min(rowIndex + offset, currentRows.length - 1))];
			const nextColumn = nextRow?.dataset.settingsRow === 'theme' ? rememberedThemeControl : 0;
			controlsFor(nextRow ?? row)[nextColumn]?.focus();
		}
		event.preventDefault();
	}
</script>

<svelte:head>
	<title>Settings · PKSX</title>
</svelte:head>
<svelte:window onkeydown={handleKeydown} />

<section
	class="settings-route pksx-density-container"
	aria-labelledby="screen-title"
	data-destination-root="settings"
	data-initial-state="ready"
	inert={summonedWorkflow.active !== null}
	onfocusin={handleFocusIn}
	{@attach settingsZone}
>
	<div class="settings-density pksx-density">
		<header class="settings-header">
			<p class="eyebrow">Application</p>
			<h1 id="screen-title">Settings</h1>
			<p>Theme, controls, and build information.</p>
		</header>

		<div class="settings-scrollport">
			<section class="settings-card preferences" aria-labelledby="preferences-title">
				<div class="section-heading">
					<p class="section-number">01</p>
					<div>
						<h2 id="preferences-title">Preferences</h2>
						<p>Choices that belong to PKSX on this device.</p>
					</div>
				</div>
				<div class="preference-row" data-settings-row="theme">
					<div>
						<strong>Theme</strong>
						<span>Choose the application palette.</span>
					</div>
					<div class="segmented" aria-label="Theme">
						<button
							type="button"
							aria-label="Use light theme"
							aria-pressed={!theme.dark}
							data-settings-control
							data-settings-stop
							data-controller-autofocus
							data-destination-initial
							data-destination-focus="theme-light"
							onclick={() => theme.setDark(false)}>Light</button
						>
						<button
							type="button"
							aria-label="Use dark theme"
							aria-pressed={theme.dark}
							data-settings-control
							data-destination-focus="theme-dark"
							onclick={() => theme.setDark(true)}>Dark</button
						>
					</div>
				</div>
			</section>

			<section class="settings-card reference" aria-labelledby="controls-title">
				<div class="section-heading">
					<p class="section-number">02</p>
					<div>
						<h2 id="controls-title">Controls reference</h2>
						<p>Generic controller names and keyboard equivalents.</p>
					</div>
				</div>

				{#each referenceGroups as group (group.id)}
					<div class="reference-group" id={`controls-${group.id}`} data-settings-row={group.id}>
						<h3
							tabindex="-1"
							data-settings-control
							data-settings-stop
							data-destination-focus={`reference-${group.id}`}
						>
							{group.title}
						</h3>
						<div class="reference-table" role="table" aria-label={`${group.title} controls`}>
							{#each group.rows as row (row.action)}
								<div class="reference-row" role="row">
									<span class="action" role="cell">{row.action}</span>
									<kbd role="cell">{row.controller}</kbd>
									<kbd role="cell">{row.keyboard}</kbd>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</section>

			<section
				class="settings-card about"
				aria-labelledby="pksx-settings-about"
				data-settings-row="about"
			>
				<div class="section-heading">
					<p class="section-number">03</p>
					<div>
						<h2
							id="pksx-settings-about"
							tabindex="-1"
							data-settings-control
							data-settings-stop
							data-destination-focus="about"
						>
							About
						</h2>
						<p>Versions reported by this build and its PKHeX Engine.</p>
					</div>
				</div>
				<dl>
					<div>
						<dt>PKSX</dt>
						<dd data-testid="app-version">{appVersion}</dd>
					</div>
					<div>
						<dt>PKHeX.Core</dt>
						<dd data-testid="pkhex-core-version">{pkhexCoreVersion}</dd>
					</div>
					<div>
						<dt>Platform</dt>
						<dd data-testid="app-platform">{platform}</dd>
					</div>
				</dl>
			</section>
		</div>
	</div>
</section>

<style>
	:global(.app-shell:has(.settings-route)) {
		height: 100dvh;
		min-height: 100dvh;
		overflow: hidden;
	}

	.settings-route {
		min-width: 0;
		min-height: 0;
		flex: 1 1 0;
		overflow: hidden;
	}

	.settings-density {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--pksx-space-3);
		font-size: var(--pksx-type-body);
		line-height: 1.25;
	}

	.settings-header {
		padding: var(--pksx-space-1) var(--pksx-space-2) 0;
	}

	.settings-header h1,
	.settings-header p,
	.section-heading h2,
	.section-heading p,
	.reference-group h3 {
		margin: 0;
	}

	.settings-header h1 {
		font-size: var(--pksx-type-display);
		line-height: 1.05;
		letter-spacing: -0.025em;
	}

	.settings-header > p:last-child,
	.section-heading div p,
	.preference-row span {
		color: var(--ink-soft);
		font-size: var(--pksx-type-label);
	}

	.eyebrow,
	.section-number {
		color: var(--rust);
		font: 700 var(--pksx-type-caption) / 1.05 var(--pksx-font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.settings-scrollport {
		min-height: 0;
		overflow: auto;
		overscroll-behavior: contain;
		scroll-padding: var(--pksx-space-2);
		padding: 0 var(--pksx-space-2) var(--pksx-space-2);
	}

	.settings-card {
		padding: var(--pksx-space-3);
		border: var(--pksx-border-width) solid var(--rule);
		border-radius: var(--pksx-radius-large);
		background: color-mix(in srgb, var(--paper-hi), transparent 4%);
		box-shadow: var(--shadow-sm);
	}

	.settings-card + .settings-card {
		margin-top: var(--pksx-space-3);
	}

	.section-heading {
		display: grid;
		grid-template-columns: 24px 1fr;
		gap: var(--pksx-space-2);
		align-items: start;
		margin-bottom: var(--pksx-space-3);
	}

	.section-heading h2 {
		font-size: var(--pksx-type-title);
		line-height: 1.05;
	}

	.preference-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--pksx-space-3);
		padding-top: var(--pksx-space-2);
		border-top: var(--pksx-border-width) solid var(--rule);
	}

	.preference-row > div:first-child {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.segmented {
		display: grid;
		grid-template-columns: repeat(2, minmax(58px, 1fr));
		padding: var(--pksx-space-1);
		border-radius: var(--pksx-radius-medium);
		background: var(--paper-deep);
	}

	.segmented button {
		min-height: var(--pksx-control-height);
		padding: 0 var(--pksx-space-3);
		border: 0;
		border-radius: var(--pksx-radius-small);
		background: transparent;
		color: var(--ink-soft);
		font: 700 var(--pksx-type-body) / 1 var(--pksx-font-sans);
		cursor: pointer;
	}

	.segmented button[aria-pressed='true'] {
		background: var(--paper-hi);
		color: var(--rust);
		box-shadow: var(--shadow-sm);
	}

	.reference-group + .reference-group {
		margin-top: var(--pksx-space-3);
	}

	.reference-group > [data-settings-control] {
		display: block;
		color: inherit;
	}

	.reference-group h3 {
		padding: var(--pksx-space-2) 0;
		color: var(--rust);
		font-size: var(--pksx-type-label);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.reference-table {
		border-top: var(--pksx-border-width) solid var(--rule);
	}

	.reference-row {
		display: grid;
		grid-template-columns: minmax(120px, 1fr) minmax(112px, 0.7fr) minmax(140px, 0.8fr);
		gap: var(--pksx-space-2);
		align-items: center;
		min-height: var(--pksx-small-control-height);
		padding: var(--pksx-space-1) 0;
		border-bottom: var(--pksx-border-width) solid var(--rule);
	}

	.reference-row kbd {
		font: 650 var(--pksx-type-label) / 1.25 var(--pksx-font-mono);
	}

	.about dl {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--pksx-space-2);
		margin: 0;
	}

	.about dl div {
		min-width: 0;
		padding: var(--pksx-space-2);
		border-radius: var(--pksx-radius-medium);
		background: var(--paper-deep);
	}

	.about dt {
		color: var(--ink-soft);
		font-size: var(--pksx-type-caption);
		text-transform: uppercase;
	}

	.about dd {
		margin: var(--pksx-space-1) 0 0;
		overflow-wrap: anywhere;
		font: 700 var(--pksx-type-body) / 1.25 var(--pksx-font-mono);
	}

	.settings-route :focus-visible {
		outline: var(--pksx-focus-ring) solid var(--rust);
		outline-offset: var(--pksx-focus-ring);
	}

	@container pksx-density (max-width: 520px) {
		.preference-row {
			align-items: stretch;
			flex-direction: column;
		}

		.reference-row {
			grid-template-columns: minmax(100px, 1fr) minmax(72px, 0.65fr) minmax(94px, 0.85fr);
		}

		.about dl {
			grid-template-columns: 1fr;
		}
	}

	@container style(--pksx-height-band: tall) {
		.settings-card {
			border-color: var(--rule-hi);
		}
	}
</style>
