import {
	focusActionCommand,
	type ControllerFocus,
	type NavigationAction,
	type SlotFocus
} from '../box-navigation';

export type SummonedWorkflowKind =
	| 'slot-menu'
	| 'box-menu'
	| 'main-menu'
	| 'save-file-menu'
	| 'save-file-delete'
	| 'source-picker'
	| 'clear-slot-confirmation'
	| 'pokemon-editor'
	| 'pokemon-actions'
	| 'legality-report'
	| 'backup-browser';

export type SummonedWorkflowLauncher =
	| {
			type: 'slot';
			id: string;
			paneId: string;
			box: number | null;
			focus: SlotFocus;
	  }
	| {
			type: 'control';
			id: string;
	  };

export type SummonedWorkflow = {
	kind: SummonedWorkflowKind;
	launcher: SummonedWorkflowLauncher;
	returnTo: SummonedWorkflow | null;
};

export type SummonedWorkflowOwner = {
	active: SummonedWorkflow | null;
};

export type SlotMenuDispatch = {
	focus: ControllerFocus;
	effect: 'none' | 'activate' | 'dismiss';
};

export function createSummonedWorkflowOwner(): SummonedWorkflowOwner {
	return { active: null };
}

export function openSummonedWorkflow(
	owner: SummonedWorkflowOwner,
	kind: SummonedWorkflowKind,
	launcher: SummonedWorkflowLauncher
): SummonedWorkflowOwner {
	return owner.active ? owner : { active: { kind, launcher, returnTo: null } };
}

export function openRelatedSummonedWorkflow(
	owner: SummonedWorkflowOwner,
	kind: SummonedWorkflowKind,
	launcher: SummonedWorkflowLauncher
): SummonedWorkflowOwner {
	return { active: { kind, launcher, returnTo: owner.active } };
}

export function dismissSummonedWorkflow(owner: SummonedWorkflowOwner): {
	owner: SummonedWorkflowOwner;
	returnLauncher: SummonedWorkflowLauncher | null;
} {
	if (!owner.active) {
		return { owner, returnLauncher: null };
	}

	return {
		owner: { active: owner.active.returnTo },
		returnLauncher: owner.active.launcher
	};
}

export function closeSummonedWorkflows(): SummonedWorkflowOwner {
	return createSummonedWorkflowOwner();
}

export function dispatchSlotMenuAction(
	focus: ControllerFocus,
	action: NavigationAction,
	commandCount: number
): SlotMenuDispatch {
	const count = Math.max(1, commandCount);
	const index = focus.zone === 'actions' ? focus.index : 0;

	switch (action) {
		case 'left':
		case 'up':
			return { focus: focusActionCommand(index - 1, count), effect: 'none' };
		case 'right':
		case 'down':
			return { focus: focusActionCommand(index + 1, count), effect: 'none' };
		case 'confirm':
			return {
				focus: focusActionCommand(index, count),
				effect: index === count - 1 ? 'dismiss' : 'activate'
			};
		case 'back':
			return { focus: focusActionCommand(index, count), effect: 'dismiss' };
		case 'previousBox':
		case 'nextBox':
		case 'sourceAction':
		case 'carryMode':
		case 'search':
			return { focus: focusActionCommand(index, count), effect: 'none' };
	}
}

export function isDestinationInputSuspended(owner: SummonedWorkflowOwner): boolean {
	return owner.active !== null;
}

export function isSummonedWorkflowPresented(
	owner: SummonedWorkflowOwner,
	kind: SummonedWorkflowKind
): boolean {
	return findWorkflow(owner.active, (workflow) => workflow.kind === kind) !== null;
}

export function getLaunchingSlot(
	owner: SummonedWorkflowOwner
): Extract<SummonedWorkflowLauncher, { type: 'slot' }> | null {
	for (let current = owner.active; current; current = current.returnTo) {
		if (current.launcher.type === 'slot') return current.launcher;
	}

	return null;
}

function findWorkflow(
	workflow: SummonedWorkflow | null,
	predicate: (workflow: SummonedWorkflow) => boolean
): SummonedWorkflow | null {
	for (let current = workflow; current; current = current.returnTo) {
		if (predicate(current)) return current;
	}

	return null;
}
