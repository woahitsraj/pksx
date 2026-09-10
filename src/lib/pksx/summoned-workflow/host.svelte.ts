import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import {
	closeSummonedWorkflows,
	createSummonedWorkflowOwner,
	dismissSummonedWorkflow,
	openRelatedSummonedWorkflow,
	openSummonedWorkflow,
	type SummonedWorkflow,
	type SummonedWorkflowKind,
	type SummonedWorkflowLauncher,
	type SummonedWorkflowOwner
} from './index';

const hostContextKey = Symbol('pksx-summoned-workflow-host');

export type SummonedWorkflowHost = {
	readonly active: SummonedWorkflow | null;
	subscribe(listener: (active: SummonedWorkflow | null) => void): () => void;
	open(kind: SummonedWorkflowKind, launcher: SummonedWorkflowLauncher): boolean;
	openRelated(kind: SummonedWorkflowKind, launcher: SummonedWorkflowLauncher): void;
	dismiss(): SummonedWorkflowLauncher | null;
	closeAll(): void;
};

export function createSummonedWorkflowHost(): SummonedWorkflowHost {
	let owner = $state<SummonedWorkflowOwner>(createSummonedWorkflowOwner());
	const listeners = new SvelteSet<(active: SummonedWorkflow | null) => void>();

	function publish(next: SummonedWorkflowOwner) {
		owner = next;
		for (const listener of listeners) listener(owner.active);
	}

	return {
		get active() {
			return owner.active;
		},
		subscribe(listener) {
			listeners.add(listener);
			listener(owner.active);
			return () => listeners.delete(listener);
		},
		open(kind, launcher) {
			const next = openSummonedWorkflow(owner, kind, launcher);
			if (next === owner) return false;
			publish(next);
			return true;
		},
		openRelated(kind, launcher) {
			publish(openRelatedSummonedWorkflow(owner, kind, launcher));
		},
		dismiss() {
			const dismissed = dismissSummonedWorkflow(owner);
			publish(dismissed.owner);
			return dismissed.returnLauncher;
		},
		closeAll() {
			publish(closeSummonedWorkflows());
		}
	};
}

export function setSummonedWorkflowHost(host: SummonedWorkflowHost) {
	return setContext(hostContextKey, host);
}

export function getSummonedWorkflowHost() {
	return getContext<SummonedWorkflowHost>(hostContextKey);
}
