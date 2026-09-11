<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { App as CapacitorApp } from '@capacitor/app';
	import { Capacitor } from '@capacitor/core';
	import { onMount, tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import './layout.css';
	import AppUpdatePrompt from '$lib/components/pksx/AppUpdatePrompt.svelte';
	import BackupBrowser from '$lib/components/pksx/BackupBrowser.svelte';
	import MainMenu, {
		MAIN_MENU_SEARCH_INSERTION_INDEX,
		type MainMenuEntry
	} from '$lib/components/pksx/MainMenu.svelte';
	import ToastRegion from '$lib/components/pksx/ToastRegion.svelte';
	import { appChrome } from '$lib/pksx/app-chrome.svelte';
	import { heightBandLock } from '$lib/pksx/height-band-lock';
	import {
		captureDestinationFocus,
		isFocusableTarget,
		resolveDestinationFocus,
		type Destination,
		type DestinationFocus
	} from '$lib/pksx/destination-focus';
	import { setDestinationFocusIdentityGetter } from '$lib/pksx/destination-focus-context.svelte';
	import { getSavesStorage } from '$lib/pksx/saves-cache';
	import { theme } from '$lib/pksx/theme.svelte';
	import { createToastHost, setToastHost } from '$lib/pksx/toast/host.svelte';
	import {
		createSummonedWorkflowHost,
		setSummonedWorkflowHost
	} from '$lib/pksx/summoned-workflow/host.svelte';
	import {
		controllerFocusSystem,
		dispatchControllerKey,
		isControllerKeyboardEvent,
		readGamepadKeys,
		type ControllerKey
	} from '$lib/pksx/controller-input';

	let { children } = $props();
	const summonedWorkflow = setSummonedWorkflowHost(createSummonedWorkflowHost());
	const toastHost = setToastHost(createToastHost());
	const storage = getSavesStorage();
	const destinationFocus = new SvelteMap<Destination, DestinationFocus>();
	setDestinationFocusIdentityGetter(
		(destination) => destinationFocus.get(destination)?.identity ?? null
	);
	let mainMenuIndex = $state(0);
	let firstRunChecked = false;
	let skipNextFocusCapture = false;
	let focusRestoreRequest = 0;
	let cancelPendingFocusWait: (() => void) | null = null;
	let platformHistoryDepth = 0;
	let replaceNextRouteHistory = false;
	let hasActiveSaveFile = $state(false);
	let activeSaveAvailabilityRequest = 0;
	const activeRoute = $derived<Destination>(
		page.url.pathname.startsWith('/saves')
			? 'saves'
			: page.url.pathname.startsWith('/trainer') || page.url.pathname.startsWith('/save-file')
				? 'trainer'
				: page.url.pathname.startsWith('/bag')
					? 'bag'
					: page.url.pathname.startsWith('/settings')
						? 'settings'
						: 'boxes'
	);
	const mainMenuOpen = $derived(summonedWorkflow.active?.kind === 'main-menu');
	const mainMenuEntries = $derived.by<MainMenuEntry[]>(() => {
		const entriesAfterReservedSearch: MainMenuEntry[] = [
			{
				key: 'trainer',
				label: 'Trainer',
				description: hasActiveSaveFile
					? 'Edit Trainer details and money.'
					: 'No active Save File. Open Trainer to see how to continue.'
			},
			{
				key: 'bag',
				label: 'Bag',
				description: hasActiveSaveFile
					? 'Edit the active Save File Bag.'
					: 'No active Save File. Open Bag to see how to continue.'
			},
			{ key: 'saves', label: 'Saves', description: 'Import and choose Save Files.' },
			{ key: 'settings', label: 'Settings', description: 'Theme, controls, and build details.' },
			{
				key: 'backup-browser',
				label: 'Backup Browser',
				description: hasActiveSaveFile
					? 'Create, restore, and delete Backups.'
					: 'No active Save File. Open the empty Backup Browser for next steps.'
			}
		];

		const entries: MainMenuEntry[] = [
			{ key: 'boxes', label: 'Boxes', description: 'Browse the active collections.' }
		];
		entries.splice(MAIN_MENU_SEARCH_INSERTION_INDEX, 0, ...entriesAfterReservedSearch);
		return entries;
	});

	beforeNavigate((navigation) => {
		if (navigation.willUnload) return;
		if (summonedWorkflow.active) {
			navigation.cancel();
			dispatchControllerKey('Escape');
			return;
		}
		if (skipNextFocusCapture) skipNextFocusCapture = false;
		else rememberDestinationFocus();
	});
	afterNavigate((navigation) => {
		if (navigation.type === 'enter') {
			platformHistoryDepth = 0;
		} else if (navigation.type === 'popstate') {
			platformHistoryDepth = Math.max(0, platformHistoryDepth + navigation.delta);
		} else if (replaceNextRouteHistory) {
			replaceNextRouteHistory = false;
		} else {
			platformHistoryDepth += 1;
		}
		queueMicrotask(() => void restoreDestinationFocus(activeRoute));
	});

	onMount(() => {
		window.addEventListener('keydown', handleRootKeydown, true);
		const backListener = Capacitor.isNativePlatform()
			? CapacitorApp.addListener('backButton', ({ canGoBack }) => handlePlatformBack(canGoBack))
			: null;
		void applyFirstRunLanding();
		return () => {
			window.removeEventListener('keydown', handleRootKeydown, true);
			void backListener?.then((listener) => listener.remove());
			toastHost.dispose();
		};
	});

	async function applyFirstRunLanding() {
		if (firstRunChecked) return;
		firstRunChecked = true;
		try {
			const [saveFiles, activeSaveFileId, pokemonStorage] = await Promise.all([
				storage.listSaves(),
				storage.getActiveSaveFileId(),
				storage.getPokemonStorage()
			]);
			hasActiveSaveFile = saveFiles.some(({ id }) => id === activeSaveFileId);
			appChrome.hasLoadedSave = hasActiveSaveFile;
			const hasStoredPokemon =
				pokemonStorage?.boxes.some((box) => box.slots.some((slot) => slot.pokemon !== null)) ??
				false;
			if (activeRoute === 'boxes' && saveFiles.length === 0 && !hasStoredPokemon) {
				replaceNextRouteHistory = true;
				try {
					await goto(resolve('/saves'), { replaceState: true, keepFocus: true });
				} finally {
					replaceNextRouteHistory = false;
				}
			}
		} catch {
			// The destination owns its normal storage failure state.
		}
	}

	function openMainMenu() {
		if (summonedWorkflow.active || appChrome.carryActive) return;
		const launcherId =
			rememberDestinationFocus() ?? ensureDestinationFocus(activeRoute) ?? 'main-menu-opener';
		if (!summonedWorkflow.open('main-menu', { type: 'control', id: launcherId })) return;
		mainMenuIndex = Math.max(
			0,
			mainMenuEntries.findIndex((entry) => entry.key === activeRoute)
		);
		void focusMainMenuEntry(mainMenuIndex);
		void refreshActiveSaveFileAvailability(++activeSaveAvailabilityRequest);
	}

	async function refreshActiveSaveFileAvailability(request: number) {
		try {
			const activeSaveFileId = await storage.getActiveSaveFileId();
			const available = Boolean(activeSaveFileId && (await storage.getSave(activeSaveFileId)));
			if (request === activeSaveAvailabilityRequest) hasActiveSaveFile = available;
		} catch {
			if (request === activeSaveAvailabilityRequest) {
				hasActiveSaveFile = appChrome.hasLoadedSave;
			}
		}
	}

	function closeMainMenu() {
		if (!mainMenuOpen) return;
		const launcher = summonedWorkflow.dismiss();
		queueMicrotask(() => {
			const target = launcher ? document.getElementById(launcher.id) : null;
			const route = destinationRoute(activeRoute);
			if (isFocusableTarget(target) && route?.contains(target)) target.focus();
			else void restoreDestinationFocus(activeRoute);
		});
	}

	async function selectMainMenuEntry(entry: MainMenuEntry) {
		if (!mainMenuOpen) return;
		if (entry.key === activeRoute) {
			closeMainMenu();
			return;
		}

		const launcher = summonedWorkflow.active?.launcher;
		summonedWorkflow.closeAll();
		if (entry.key === 'backup-browser') {
			if (launcher) summonedWorkflow.open('backup-browser', launcher);
			return;
		}

		skipNextFocusCapture = true;
		await goto(destinationPath(entry.key), { keepFocus: true });
		await restoreDestinationFocus(entry.key);
	}

	function destinationPath(destination: Destination) {
		switch (destination) {
			case 'boxes':
				return resolve('/');
			case 'trainer':
				return resolve('/trainer');
			case 'bag':
				return resolve('/bag');
			case 'saves':
				return resolve('/saves');
			case 'settings':
				return resolve('/settings');
		}
	}

	function handleRootKeydown(event: KeyboardEvent) {
		const fromController = isControllerKeyboardEvent(event);
		const shortcut =
			!fromController &&
			(event.metaKey || event.ctrlKey) &&
			!event.altKey &&
			event.key.toLowerCase() === 'k';

		if (shortcut) {
			consumeRootEvent(event);
			if (!summonedWorkflow.active && !appChrome.carryActive) void openMainMenu();
			return;
		}

		if (fromController && event.key === 'Menu') {
			consumeRootEvent(event);
			if (mainMenuOpen) closeMainMenu();
			else if (!summonedWorkflow.active && !appChrome.carryActive) void openMainMenu();
			return;
		}

		if (mainMenuOpen) {
			if (
				![
					'ArrowUp',
					'ArrowDown',
					'ArrowLeft',
					'ArrowRight',
					'Enter',
					' ',
					'Escape',
					'Backspace'
				].includes(event.key)
			)
				return;
			consumeRootEvent(event);
			if (event.key === 'Escape' || event.key === 'Backspace') {
				closeMainMenu();
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				const entry = mainMenuEntries[mainMenuIndex];
				if (entry) void selectMainMenuEntry(entry);
				return;
			}
			const offset = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
			mainMenuIndex = (mainMenuIndex + offset + mainMenuEntries.length) % mainMenuEntries.length;
			void focusMainMenuEntry(mainMenuIndex);
			return;
		}

		if (
			fromController &&
			event.key === 'Escape' &&
			document.querySelector('[data-combobox-open="true"]')
		) {
			return;
		}

		if (
			fromController &&
			event.key === 'Escape' &&
			!summonedWorkflow.active &&
			!appChrome.carryActive &&
			activeRoute !== 'boxes'
		) {
			consumeRootEvent(event);
			void goto(resolve('/'), { keepFocus: true });
		}
	}

	function consumeRootEvent(event: KeyboardEvent) {
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	function handlePlatformBack(canGoBack: boolean) {
		if (summonedWorkflow.active) {
			dispatchControllerKey('Escape');
			return;
		}
		if (canGoBack || platformHistoryDepth > 0) history.back();
		else void CapacitorApp.exitApp();
	}

	async function focusMainMenuEntry(index: number) {
		await tick();
		document.getElementById(`main-menu-entry-${index}`)?.focus();
	}

	function handleShellFocusIn(event: FocusEvent) {
		if (summonedWorkflow.active || !(event.target instanceof HTMLElement)) return;
		const route = event.target.closest<HTMLElement>('[data-destination-root]');
		if (!route) return;
		const id = ensureControlId(event.target, activeRoute);
		if (id) rememberControl(activeRoute, event.target, id);
	}

	function rememberDestinationFocus() {
		const route = destinationRoute(activeRoute);
		if (!route) return null;
		prepareControlIds(route, activeRoute);
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const controllerTarget = route.querySelector<HTMLElement>('.controller-focused');
		const target =
			active && route.contains(active) && isFocusableTarget(active)
				? active
				: isFocusableTarget(controllerTarget)
					? controllerTarget
					: (resolveRememberedControl(route, activeRoute) ??
						(isDestinationReady(route) ? fallbackControl(route, activeRoute) : null));
		if (!target) return null;
		const id = ensureControlId(target, activeRoute);
		if (id) rememberControl(activeRoute, target, id);
		return id;
	}

	function ensureDestinationFocus(destination: Destination) {
		const route = destinationRoute(destination);
		if (!route || !isDestinationReady(route)) return null;
		prepareControlIds(route, destination);
		const target = fallbackControl(route, destination);
		if (!target) return null;
		const id = ensureControlId(target, destination);
		if (id) rememberControl(destination, target, id);
		return id;
	}

	async function restoreDestinationFocus(destination: Destination) {
		const request = ++focusRestoreRequest;
		cancelPendingFocusWait?.();
		cancelPendingFocusWait = null;
		await tick();
		await new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame()));
		const route = await waitForDestinationReady(destination, request);
		if (!route || request !== focusRestoreRequest || summonedWorkflow.active) return;
		prepareControlIds(route, destination);
		const rememberedTarget = resolveRememberedControl(route, destination);
		const target =
			rememberedTarget && route.contains(rememberedTarget) && isFocusableTarget(rememberedTarget)
				? rememberedTarget
				: fallbackControl(route, destination);
		if (!target) return;
		const id = ensureControlId(target, destination);
		if (id) rememberControl(destination, target, id);
		target.focus();
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function waitForDestinationReady(destination: Destination, request: number) {
		const current = destinationRoute(destination);
		if (current && isDestinationReady(current)) return Promise.resolve(current);

		const shell = document.querySelector<HTMLElement>('.app-shell');
		if (!shell) return Promise.resolve(null);
		return new Promise<HTMLElement | null>((resolveReady) => {
			let observer: MutationObserver;
			const finish = (route: HTMLElement | null) => {
				observer.disconnect();
				if (cancelPendingFocusWait === cancel) cancelPendingFocusWait = null;
				resolveReady(route);
			};
			const cancel = () => finish(null);
			const settle = () => {
				if (request !== focusRestoreRequest || activeRoute !== destination) {
					finish(null);
					return;
				}
				const route = destinationRoute(destination);
				if (!route || !isDestinationReady(route)) return;
				finish(route);
			};
			observer = new MutationObserver(settle);
			cancelPendingFocusWait = cancel;
			observer.observe(shell, {
				subtree: true,
				childList: true,
				attributes: true,
				attributeFilter: ['data-initial-state']
			});
			settle();
		});
	}

	function destinationRoute(destination: Destination) {
		return document.querySelector<HTMLElement>(`[data-destination-root="${destination}"]`);
	}

	function isDestinationReady(route: HTMLElement) {
		return route.dataset.initialState === 'ready';
	}

	function prepareControlIds(route: HTMLElement, destination: Destination) {
		focusableControls(route).forEach((control) => ensureControlId(control, destination));
	}

	function ensureControlId(control: HTMLElement, destination: Destination) {
		const identity = control.dataset.destinationFocus;
		if (identity) {
			const variant = control.dataset.destinationVariant;
			control.id = `pksx-${destination}-${identity}${variant ? `-${variant}` : ''}`;
			return control.id;
		}
		if (control.id) return control.id;
		return null;
	}

	function rememberControl(destination: Destination, control: HTMLElement, id: string) {
		const captured = captureDestinationFocus(
			control,
			id,
			destinationFocus.get(destination) ?? null
		);
		if (captured) destinationFocus.set(destination, captured);
	}

	function resolveRememberedControl(route: HTMLElement, destination: Destination) {
		const remembered = destinationFocus.get(destination);
		if (!remembered) return null;
		return resolveDestinationFocus(route, remembered);
	}

	function fallbackControl(route: HTMLElement, destination: Destination) {
		const requested =
			Array.from(route.querySelectorAll<HTMLElement>('[data-destination-initial]')).find(
				isFocusableTarget
			) ?? null;
		if (isFocusableTarget(requested)) return requested;
		if (destination === 'boxes') {
			const firstSlot =
				route
					.querySelector<HTMLElement>('#box-grid')
					?.querySelector<HTMLElement>('[id$="-slot-0"]') ?? null;
			if (isFocusableTarget(firstSlot)) return firstSlot;
		}
		return focusableControls(route).find(isFocusableTarget) ?? null;
	}

	function focusableControls(route: HTMLElement) {
		return Array.from(
			route.querySelectorAll<HTMLElement>(
				'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-destination-focus]'
			)
		);
	}

	function controllerNavigation() {
		if (typeof navigator === 'undefined' || typeof requestAnimationFrame === 'undefined') {
			return;
		}

		const nativeHeld = new SvelteSet<ControllerKey>();
		const nativeDiscretePressed = new SvelteSet<ControllerKey>();
		let nativeControllerId: string | null = null;
		let previousPressed = new SvelteSet<ControllerKey>();
		const repeatAt = new SvelteMap<ControllerKey, number>();
		let frame = 0;
		const repeatDelay = 280;
		const repeatInterval = 110;
		const nativePlatform = Capacitor.isNativePlatform();

		const dispatchKey = dispatchControllerKey;

		const handleNativeInput = (event: Event) => {
			const detail = (event as CustomEvent<NativeControllerInput>).detail;
			if (!detail || !isControllerKey(detail.key)) return;

			nativeControllerId = detail.id || 'Controller';
			appChrome.controllerStatus = nativeControllerId;
			if (detail.discrete) {
				if (!detail.pressed) {
					nativeDiscretePressed.delete(detail.key);
				} else if (!nativeDiscretePressed.has(detail.key)) {
					nativeDiscretePressed.add(detail.key);
					dispatchKey(detail.key);
				}
				return;
			}

			if (!detail.pressed) {
				nativeHeld.delete(detail.key);
				return;
			}

			// Dispatch held directions immediately; the frame loop only owns key repeat.
			if (!nativeHeld.has(detail.key)) {
				nativeHeld.add(detail.key);
				previousPressed.add(detail.key);
				repeatAt.set(detail.key, performance.now() + repeatDelay);
				dispatchKey(detail.key);
			}
		};

		const handleNativeConnection = (event: Event) => {
			const detail = (event as CustomEvent<NativeControllerConnection>).detail;
			nativeHeld.clear();
			nativeDiscretePressed.clear();
			previousPressed.clear();
			repeatAt.clear();
			nativeControllerId = detail?.id || 'Controller';
			appChrome.controllerStatus = nativeControllerId;
		};

		const read = (time: number) => {
			frame = requestAnimationFrame(read);

			// The native bridge is authoritative once seen; on iOS the same controller
			// also surfaces through the Gamepad API and would double every press.
			let gamepad: Gamepad | null = null;
			if (!nativePlatform && nativeControllerId === null) {
				try {
					gamepad = navigator.getGamepads?.().find((pad) => pad) ?? null;
				} catch {
					gamepad = null;
				}
			}

			const pressed = new SvelteSet<ControllerKey>([
				...nativeHeld,
				...(gamepad ? readGamepadKeys(gamepad) : [])
			]);
			appChrome.controllerStatus = nativeControllerId ?? gamepad?.id ?? null;

			for (const key of pressed) {
				const firstPress = !previousPressed.has(key);
				const nextRepeat = repeatAt.get(key) ?? 0;
				if (firstPress || (isRepeatable(key) && time >= nextRepeat)) {
					dispatchKey(key);
					repeatAt.set(key, time + (firstPress ? repeatDelay : repeatInterval));
				}
			}

			for (const key of previousPressed) {
				if (!pressed.has(key)) repeatAt.delete(key);
			}
			previousPressed = pressed;
		};

		window.addEventListener('pksxcontroller', handleNativeInput);
		window.addEventListener('pksxcontrollerconnection', handleNativeConnection);
		frame = requestAnimationFrame(read);

		return () => {
			window.removeEventListener('pksxcontroller', handleNativeInput);
			window.removeEventListener('pksxcontrollerconnection', handleNativeConnection);
			cancelAnimationFrame(frame);
		};
	}

	function isRepeatable(key: ControllerKey) {
		return key.startsWith('Arrow');
	}

	function isControllerKey(key: string): key is ControllerKey {
		return [
			'ArrowUp',
			'ArrowDown',
			'ArrowLeft',
			'ArrowRight',
			'Enter',
			'Escape',
			'PageUp',
			'PageDown',
			'Menu',
			'x',
			'y'
		].includes(key);
	}

	type NativeControllerInput = {
		key: string;
		pressed: boolean;
		discrete?: boolean;
		id?: string;
	};

	type NativeControllerConnection = {
		id?: string;
	};
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/icons/icon-192.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" content="#2a241c" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>

<main
	class={[
		'app-shell',
		'pksx-density',
		theme.dark && 'dark',
		summonedWorkflow.active?.kind === 'backup-browser' && 'takeover-active'
	]}
	aria-labelledby="screen-title"
	onfocusin={handleShellFocusIn}
	{@attach controllerNavigation}
	{@attach controllerFocusSystem}
	{@attach heightBandLock}
>
	{@render children()}

	{#if !summonedWorkflow.active && !appChrome.carryActive}
		<button
			id="main-menu-opener"
			class="main-menu-opener"
			type="button"
			tabindex="-1"
			aria-label="Open Main Menu"
			onpointerdown={(event) => event.preventDefault()}
			onclick={() => void openMainMenu()}
		>
			<svg class="main-menu-icon" aria-hidden="true" viewBox="3 3 18 18">
				<path d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>
	{/if}

	{#if mainMenuOpen}
		<MainMenu
			entries={mainMenuEntries}
			activeDestination={activeRoute}
			activeIndex={mainMenuIndex}
			onFocusEntry={(index) => (mainMenuIndex = index)}
			onSelectEntry={(entry) => void selectMainMenuEntry(entry)}
			onClose={closeMainMenu}
		/>
	{:else if summonedWorkflow.active?.kind === 'backup-browser'}
		<BackupBrowser />
	{/if}

	<ToastRegion toasts={toastHost.toasts} />
</main>
<AppUpdatePrompt />

<style>
	.main-menu-opener {
		position: fixed;
		z-index: 400;
		top: calc(var(--pksx-safe-area-top) + var(--pksx-space-2, 8px));
		right: calc(var(--pksx-safe-area-right) + var(--pksx-space-2, 8px));
		width: var(--pksx-control-height, 40px);
		height: var(--pksx-control-height, 40px);
		display: grid;
		place-items: center;
		padding: 0;
		border: var(--pksx-border-width, 1px) solid var(--pksx-color-border-strong);
		border-radius: 50%;
		background: var(--pksx-color-surface-panel);
		box-shadow: var(--pksx-shadow-raised);
		color: var(--pksx-color-accent-primary);
		cursor: pointer;
	}

	.main-menu-opener:hover,
	.main-menu-opener:active {
		background: var(--pksx-color-accent-wash);
	}

	.main-menu-icon {
		width: var(--pksx-icon-size, 16px);
		height: var(--pksx-icon-size, 16px);
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}
</style>
