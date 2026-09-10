<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Capacitor } from '@capacitor/core';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import './layout.css';
	import AppUpdatePrompt from '$lib/components/pksx/AppUpdatePrompt.svelte';
	import MobileTabbar from '$lib/components/pksx/MobileTabbar.svelte';
	import TopBar from '$lib/components/pksx/TopBar.svelte';
	import { appChrome } from '$lib/pksx/app-chrome.svelte';
	import { heightBandLock } from '$lib/pksx/height-band-lock';
	import { theme } from '$lib/pksx/theme.svelte';
	import {
		controllerFocusSystem,
		dispatchControllerKey,
		isControllerKeyboardEvent,
		readGamepadKeys,
		type ControllerKey
	} from '$lib/pksx/controller-input';

	let { children } = $props();

	const sectionPills = ['Boxes', 'Save File', 'Saves'];
	const topBarControlIndices = [0, 1, 2, 3, 4, 6];
	const mobileTabs = [
		{ key: 'boxes', label: 'Boxes', glyph: '▦' },
		{ key: 'save-file', label: 'Save', glyph: '▣' },
		{ key: 'saves', label: 'Saves', glyph: '☁' }
	];

	let chromeFocus = $state<{ zone: 'topbar' | 'mobileTabs'; index: number } | null>(null);
	const activeRoute = $derived(
		page.url.pathname.startsWith('/saves')
			? 'saves'
			: page.url.pathname.startsWith('/save-file')
				? 'save-file'
				: page.url.pathname.startsWith('/settings')
					? 'settings'
					: 'boxes'
	);
	const activeSection = $derived(
		activeRoute === 'saves'
			? 'Saves'
			: activeRoute === 'save-file'
				? 'Save File'
				: activeRoute === 'settings'
					? 'Settings'
					: 'Boxes'
	);

	function openBoxes() {
		void goto(resolve('/'), { keepFocus: true });
	}

	function openSaves() {
		void goto(resolve('/saves'), { keepFocus: true });
	}

	function openSaveFile() {
		void goto(resolve('/save-file'), { keepFocus: true });
	}

	function handleImport(file: File) {
		appChrome.importSave?.(file);
	}

	function handleExport() {
		appChrome.exportSave?.();
	}

	function focusTopControl(index: number) {
		chromeFocus = { zone: 'topbar', index };
	}

	function focusMobileTab(index: number) {
		chromeFocus = { zone: 'mobileTabs', index };
	}

	function handleShellFocusIn(event: FocusEvent) {
		const target = event.target;
		if (!(target instanceof HTMLElement)) {
			chromeFocus = null;
			return;
		}

		const topControlMatch = target.id.match(/^top-control-(\d+)$/);
		if (topControlMatch) {
			chromeFocus = { zone: 'topbar', index: Number(topControlMatch[1]) };
			return;
		}

		const mobileTabMatch = target.id.match(/^mobile-tab-(\d+)$/);
		if (mobileTabMatch) {
			chromeFocus = { zone: 'mobileTabs', index: Number(mobileTabMatch[1]) };
			return;
		}

		chromeFocus = null;
	}

	function selectMobileTab(index: number) {
		chromeFocus = { zone: 'mobileTabs', index };
		const tab = mobileTabs[index];
		if (tab?.key === 'boxes') {
			openBoxes();
		}
		if (tab?.key === 'save-file') {
			openSaveFile();
		}
		if (tab?.key === 'saves') {
			openSaves();
		}
	}

	function handleChromeKeydown(event: KeyboardEvent) {
		if (appChrome.controllerInputActive || isControllerKeyboardEvent(event)) {
			return;
		}

		const action = keyboardAction(event);
		if (!action) {
			return;
		}

		if (!chromeFocus) {
			chromeFocus = { zone: 'topbar', index: 0 };
		}

		event.preventDefault();
		dispatchChromeAction(action);
	}

	function controllerNavigation() {
		if (typeof navigator === 'undefined' || typeof requestAnimationFrame === 'undefined') {
			return;
		}

		const nativeHeld = new SvelteSet<ControllerKey>();
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
				if (detail.pressed) dispatchKey(detail.key);
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

	function dispatchChromeAction(action: 'previous' | 'next' | 'confirm') {
		if (!chromeFocus) {
			chromeFocus = {
				zone: 'mobileTabs',
				index: activeRoute === 'saves' ? 2 : activeRoute === 'save-file' ? 1 : 0
			};
		}

		if (chromeFocus.zone === 'topbar') {
			const currentPosition = Math.max(0, topBarControlIndices.indexOf(chromeFocus.index));
			const nextPosition = nextChromeIndex(currentPosition, action, topBarControlIndices.length);
			const nextIndex = topBarControlIndices[nextPosition] ?? 0;
			chromeFocus = { zone: 'topbar', index: nextIndex };
			focusChromeElement(`top-control-${nextIndex}`);
			if (action === 'confirm') {
				activateTopControl(nextIndex);
			}
			return;
		}

		const nextIndex = nextChromeIndex(chromeFocus.index, action, mobileTabs.length);
		chromeFocus = { zone: 'mobileTabs', index: nextIndex };
		focusChromeElement(`mobile-tab-${nextIndex}`);
		if (action === 'confirm') {
			selectMobileTab(nextIndex);
		}
	}

	function keyboardAction(event: KeyboardEvent) {
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

	function nextChromeIndex(index: number, action: 'previous' | 'next' | 'confirm', count: number) {
		if (action === 'previous') {
			return (index + count - 1) % count;
		}
		if (action === 'next') {
			return (index + 1) % count;
		}
		return index;
	}

	function activateTopControl(index: number) {
		if (index === 0) openBoxes();
		if (index === 1) openSaveFile();
		if (index === 2) openSaves();
		if (index === 3 && !appChrome.busy) document.getElementById('quick-save-import')?.click();
		if (index === 4 && appChrome.hasLoadedSave && !appChrome.busy) handleExport();
		if (index === 6) theme.toggle();
	}

	function focusChromeElement(id: string) {
		queueMicrotask(() => document.getElementById(id)?.focus());
	}
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/icons/icon-192.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
	<meta name="theme-color" content="#2a241c" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
</svelte:head>
<svelte:window onkeydown={handleChromeKeydown} />

<main
	class={['app-shell', 'pksx-density', theme.dark && 'dark']}
	aria-labelledby="screen-title"
	onfocusin={handleShellFocusIn}
	{@attach controllerNavigation}
	{@attach controllerFocusSystem}
	{@attach heightBandLock}
>
	<div class="chrome-inert-owner" inert={appChrome.backgroundInert}>
		<TopBar
			{sectionPills}
			{activeSection}
			saveSummary={appChrome.saveSummary}
			boxCount={appChrome.boxCount}
			activeBox={appChrome.activeBox}
			fileName={appChrome.fileName}
			busy={appChrome.busy}
			hasLoadedSave={appChrome.hasLoadedSave}
			darkMode={theme.dark}
			focusIndex={chromeFocus?.zone === 'topbar' ? chromeFocus.index : null}
			onFocusControl={focusTopControl}
			onOpenBoxes={openBoxes}
			onOpenSaveFile={openSaveFile}
			onOpenSaves={openSaves}
			onImport={handleImport}
			onExport={handleExport}
			onToggleTheme={() => theme.toggle()}
		/>
	</div>

	{@render children()}

	<div class="chrome-inert-owner" inert={appChrome.backgroundInert}>
		<MobileTabbar
			tabs={mobileTabs}
			activeKey={activeRoute}
			focusIndex={chromeFocus?.zone === 'mobileTabs' ? chromeFocus.index : null}
			onFocusTab={focusMobileTab}
			onSelectTab={selectMobileTab}
		/>
	</div>
</main>
<AppUpdatePrompt />

<style>
	.chrome-inert-owner {
		display: contents;
	}
</style>
