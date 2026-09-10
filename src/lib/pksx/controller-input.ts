export type ControllerKey =
	| 'ArrowUp'
	| 'ArrowDown'
	| 'ArrowLeft'
	| 'ArrowRight'
	| 'Enter'
	| 'Escape'
	| 'PageUp'
	| 'PageDown'
	| 'Menu'
	| 'x'
	| 'y';

const controllerEvents = new WeakSet<KeyboardEvent>();

export function isControllerKeyboardEvent(event: KeyboardEvent) {
	return controllerEvents.has(event);
}

export function dispatchControllerKey(key: ControllerKey) {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	controllerEvents.add(event);
	document.documentElement.dataset.inputModality = 'controller';
	if (window.dispatchEvent(event)) handleControllerFallback(key);
}

export function controllerFocusSystem() {
	const handleKeydown = (event: KeyboardEvent) => {
		if (!isControllerKeyboardEvent(event)) {
			if (!event.metaKey && !event.ctrlKey && !event.altKey) {
				document.documentElement.dataset.inputModality = 'keyboard';
			}
			return;
		}
	};
	const handlePointer = () => {
		document.documentElement.dataset.inputModality = 'pointer';
	};
	const handleFocus = (event: FocusEvent) => {
		if (
			document.documentElement.dataset.inputModality === 'controller' &&
			event.target instanceof HTMLElement
		) {
			event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	};

	window.addEventListener('keydown', handleKeydown);
	document.addEventListener('pointerdown', handlePointer, true);
	document.addEventListener('focusin', handleFocus);

	return () => {
		window.removeEventListener('keydown', handleKeydown);
		document.removeEventListener('pointerdown', handlePointer, true);
		document.removeEventListener('focusin', handleFocus);
	};
}

function handleControllerFallback(key: string) {
	if (key === 'Enter' || key === ' ') {
		activateFocusedControl();
		return;
	}

	if (key === 'Escape' || key === 'Backspace') {
		activateBackControl();
		return;
	}

	if (!key.startsWith('Arrow')) return;
	moveFocus(key.slice(5).toLowerCase() as Direction);
}

type Direction = 'up' | 'down' | 'left' | 'right';

function moveFocus(direction: Direction) {
	const scope = controllerScope();
	const controls = focusableControls(scope);
	if (controls.length === 0) return;

	const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	if (!active || !scope.contains(active) || !controls.includes(active)) {
		initialControl(scope, controls).focus();
		return;
	}

	const origin = center(active.getBoundingClientRect());
	const candidates = controls
		.filter((control) => control !== active)
		.map((control) => ({ control, point: center(control.getBoundingClientRect()) }))
		.filter(({ point }) => isInDirection(origin, point, direction))
		.sort(
			(a, b) =>
				directionScore(origin, a.point, direction) - directionScore(origin, b.point, direction)
		);

	(candidates[0]?.control ?? wrappedControl(controls, origin, direction))?.focus();
}

function activateFocusedControl() {
	const scope = controllerScope();
	const controls = focusableControls(scope);
	const active = document.activeElement;
	if (!(active instanceof HTMLElement) || !scope.contains(active) || !controls.includes(active)) {
		initialControl(scope, controls)?.focus();
		return;
	}

	if (active.getAttribute('aria-disabled') !== 'true') active.click();
}

function activateBackControl() {
	const scope = controllerScope();
	const selector =
		scope === document
			? '[data-controller-back]'
			: '[data-controller-back], button[aria-label^="Close"], button[aria-label^="Cancel"], .close-command, .close-editor, .close-report';
	const control = Array.from(scope.querySelectorAll<HTMLElement>(selector)).findLast(isVisible);
	control?.click();
}

function controllerScope(): Document | HTMLElement {
	const dialogs = Array.from(
		document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]')
	).filter(isVisible);
	return dialogs.at(-1) ?? document;
}

function focusableControls(scope: Document | HTMLElement) {
	return Array.from(
		scope.querySelectorAll<HTMLElement>(
			'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
		)
	).filter((control) => isVisible(control) && control.getAttribute('aria-disabled') !== 'true');
}

function initialControl(scope: Document | HTMLElement, controls: HTMLElement[]) {
	const preferred = scope.querySelector<HTMLElement>('[data-controller-autofocus]');
	if (preferred && controls.includes(preferred)) return preferred;
	if (scope === document) {
		const routeControl = document.querySelector<HTMLElement>(
			'.app-shell > section button:not([disabled]), .app-shell > section input:not([disabled]), .app-shell > section select:not([disabled]), .app-shell > section [tabindex]:not([tabindex="-1"])'
		);
		if (routeControl && controls.includes(routeControl)) return routeControl;
	}
	return controls[0];
}

function isVisible(control: HTMLElement) {
	const style = getComputedStyle(control);
	const rect = control.getBoundingClientRect();
	return (
		!control.hidden &&
		style.display !== 'none' &&
		style.visibility !== 'hidden' &&
		rect.width > 0 &&
		rect.height > 0
	);
}

function center(rect: DOMRect) {
	return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function isInDirection(origin: Point, target: Point, direction: Direction) {
	if (direction === 'left') return target.x < origin.x - 1;
	if (direction === 'right') return target.x > origin.x + 1;
	if (direction === 'up') return target.y < origin.y - 1;
	return target.y > origin.y + 1;
}

type Point = { x: number; y: number };

function directionScore(origin: Point, target: Point, direction: Direction) {
	const primary =
		direction === 'left' || direction === 'right'
			? Math.abs(target.x - origin.x)
			: Math.abs(target.y - origin.y);
	const cross =
		direction === 'left' || direction === 'right'
			? Math.abs(target.y - origin.y)
			: Math.abs(target.x - origin.x);
	return primary + cross * 2 + (cross * cross) / Math.max(primary, 1);
}

function wrappedControl(controls: HTMLElement[], origin: Point, direction: Direction) {
	return controls
		.map((control) => ({ control, point: center(control.getBoundingClientRect()) }))
		.sort((a, b) => {
			const aPrimary = direction === 'left' || direction === 'right' ? a.point.x : a.point.y;
			const bPrimary = direction === 'left' || direction === 'right' ? b.point.x : b.point.y;
			const primaryOrder =
				direction === 'left' || direction === 'up' ? bPrimary - aPrimary : aPrimary - bPrimary;
			if (primaryOrder !== 0) return primaryOrder;
			const aCross = direction === 'left' || direction === 'right' ? a.point.y : a.point.x;
			const bCross = direction === 'left' || direction === 'right' ? b.point.y : b.point.x;
			return (
				Math.abs(aCross - (direction === 'left' || direction === 'right' ? origin.y : origin.x)) -
				Math.abs(bCross - (direction === 'left' || direction === 'right' ? origin.y : origin.x))
			);
		})[0]?.control;
}

export function readGamepadKeys(gamepad: Gamepad): ControllerKey[] {
	const keys: ControllerKey[] = [];
	const axisX = gamepad.axes[0] ?? 0;
	const axisY = gamepad.axes[1] ?? 0;

	if (pressed(gamepad, 12) || axisY < -0.55) keys.push('ArrowUp');
	if (pressed(gamepad, 13) || axisY > 0.55) keys.push('ArrowDown');
	if (pressed(gamepad, 14) || axisX < -0.55) keys.push('ArrowLeft');
	if (pressed(gamepad, 15) || axisX > 0.55) keys.push('ArrowRight');

	if (gamepad.mapping !== 'standard' && gamepad.axes.length > 9) {
		for (const key of readHatAxis(gamepad.axes[9] ?? 4)) {
			if (!keys.includes(key)) keys.push(key);
		}
	}

	if (pressed(gamepad, 0)) keys.push('Enter');
	if (pressed(gamepad, 1)) keys.push('Escape');
	if (pressed(gamepad, 2)) keys.push('x');
	if (pressed(gamepad, 3)) keys.push('y');
	if (pressed(gamepad, 4)) keys.push('PageUp');
	if (pressed(gamepad, 5)) keys.push('PageDown');
	if (pressed(gamepad, 9)) keys.push('Menu');

	return keys;
}

function readHatAxis(value: number): ControllerKey[] {
	if (value < -1.05 || value > 1.05) return [];

	const position = Math.round((value + 1) * 3.5) % 8;
	const keys: ControllerKey[] = [];

	if (position === 0 || position === 1 || position === 7) keys.push('ArrowUp');
	if (position >= 1 && position <= 3) keys.push('ArrowRight');
	if (position >= 3 && position <= 5) keys.push('ArrowDown');
	if (position >= 5 && position <= 7) keys.push('ArrowLeft');

	return keys;
}

function pressed(gamepad: Gamepad, index: number) {
	return gamepad.buttons[index]?.pressed === true;
}
