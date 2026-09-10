import type { SaveFileEditOperation, TrainerGender } from '$lib/engine';
import type { SaveFileLedgerProps } from '$lib/components/pksx/save-file-ledger/types';
import type { WorkspaceState } from '$lib/pksx/backup-workflow';
import type {
	SaveFileEditCoordinator,
	SaveFileEditOrigin,
	SaveFileEditResult
} from '$lib/pksx/save-file-edit-coordinator';
import type { ToastHost } from '$lib/pksx/toast/host.svelte';
import { SvelteSet } from 'svelte/reactivity';

export const trainerMoneyPendingKeys = {
	trainerName: 'trainer-name',
	trainerGenderMale: 'trainer-gender-male',
	trainerGenderFemale: 'trainer-gender-female',
	money: 'money'
} as const;

export type SaveFileTrainerMoneyCoordinator = Pick<
	SaveFileEditCoordinator,
	| 'openWorkspace'
	| 'recoverWorkspace'
	| 'listPending'
	| 'isPending'
	| 'subscribePending'
	| 'enqueueEdit'
>;

export type SaveFileTrainerMoneyControllerOptions = {
	workspace: WorkspaceState;
	activeBox: number;
	coordinator: SaveFileTrainerMoneyCoordinator;
	toast: Pick<ToastHost, 'error'>;
	isCurrent?: () => boolean;
};

export type SaveFileTrainerMoneyLedgerProps = Pick<
	SaveFileLedgerProps,
	| 'view'
	| 'drafts'
	| 'errors'
	| 'pendingTargets'
	| 'onRetryEditing'
	| 'onTrainerNameInput'
	| 'onTrainerNameCommit'
	| 'onTrainerNameAbandon'
	| 'onTrainerGenderSelect'
	| 'onMoneyInput'
	| 'onMoneyCommit'
	| 'onMoneyAbandon'
> & {
	onMoneyStep: (step: -1 | 1 | 'max', draft: string) => boolean;
};

type EditableField = 'trainer-name' | 'trainer-gender' | 'money';
type CommitMode = 'enter' | 'blur' | 'immediate' | 'operator';

export type SaveFileTrainerMoneyController = ReturnType<
	typeof createSaveFileTrainerMoneyController
>;

export function createSaveFileTrainerMoneyController(
	options: SaveFileTrainerMoneyControllerOptions
) {
	const initialWorkspace = options.workspace;
	let workspace = $state.raw(initialWorkspace);
	let origin = options.coordinator.openWorkspace(initialWorkspace, options.activeBox);
	let trainerNameDraft = $state(acceptedTrainerName(initialWorkspace));
	let trainerNameDirty = false;
	let trainerNameError = $state<string | null>(null);
	let trainerGenderError = $state<string | null>(null);
	let moneyDraft = $state(acceptedMoney(initialWorkspace));
	let moneyDirty = false;
	let moneyError = $state<string | null>(null);
	let pendingTargets = $state.raw<string[]>([]);
	let editingUnavailable = $state.raw<{ message: string; retrying?: boolean } | null>(null);
	let disposed = false;
	let unsubscribePending: () => void = () => undefined;
	const originListeners = new SvelteSet<(origin: SaveFileEditOrigin) => void>();

	function subscribePending() {
		unsubscribePending();
		pendingTargets = pendingKeys(options.coordinator, origin);
		unsubscribePending = options.coordinator.subscribePending(origin, (pending) => {
			pendingTargets = distinctKeys(pending.map(({ key }) => key));
		});
	}

	function refreshWorkspace(next: WorkspaceState, settledField?: EditableField) {
		workspace = next;
		if (settledField === 'trainer-name' || !trainerNameDirty) {
			trainerNameDraft = acceptedTrainerName(next);
			trainerNameDirty = false;
		}
		if (settledField === 'money' || !moneyDirty) {
			moneyDraft = acceptedMoney(next);
			moneyDirty = false;
		}
	}

	function onTrainerNameInput(value: string) {
		trainerNameDraft = value;
		trainerNameDirty = true;
		trainerNameError = null;
	}

	function onTrainerNameCommit(reason: 'enter' | 'blur') {
		if (options.coordinator.isPending(origin, trainerMoneyPendingKeys.trainerName)) return;
		if (reason === 'blur' && trainerNameError) {
			restoreTrainerName();
			return;
		}
		const profile = projection(workspace).trainerProfile;
		const candidate = trainerNameDraft.trim();
		const error = validateTrainerName(candidate, profile.trainerNameMaxLength);
		if (error) {
			trainerNameError = error;
			if (reason === 'blur') restoreTrainerName();
			return;
		}
		if (candidate === (profile.trainerName ?? '')) {
			restoreTrainerName();
			trainerNameError = null;
			return;
		}
		enqueue(
			{ field: 'trainer-name', label: 'Trainer name', mode: reason },
			trainerMoneyPendingKeys.trainerName,
			{ trainerProfile: { trainerName: candidate } }
		);
	}

	function onTrainerNameAbandon() {
		restoreTrainerName();
	}

	function onTrainerGenderSelect(gender: TrainerGender) {
		if (trainerGenderPending()) return;
		trainerGenderError = null;
		const profile = projection(workspace).trainerProfile;
		if (gender === profile.gender) return;
		enqueue(
			{ field: 'trainer-gender', label: 'Trainer gender', mode: 'immediate' },
			gender === 'male'
				? trainerMoneyPendingKeys.trainerGenderMale
				: trainerMoneyPendingKeys.trainerGenderFemale,
			{ trainerProfile: { gender } }
		);
	}

	function onMoneyInput(value: string) {
		moneyDraft = value;
		moneyDirty = true;
		moneyError = null;
	}

	function onMoneyCommit(reason: 'enter' | 'blur') {
		if (options.coordinator.isPending(origin, trainerMoneyPendingKeys.money)) return;
		if (reason === 'blur' && moneyError) {
			restoreMoney();
			return;
		}
		const parsed = parseMoney(moneyDraft, workspace);
		if (!parsed.ok) {
			moneyError = parsed.message;
			if (reason === 'blur') restoreMoney();
			return;
		}
		commitMoney(parsed.value, reason);
	}

	function onMoneyAbandon() {
		restoreMoney();
	}

	function onMoneyStep(step: -1 | 1 | 'max', draft: string) {
		if (
			editingUnavailable ||
			options.coordinator.isPending(origin, trainerMoneyPendingKeys.money)
		) {
			return false;
		}
		const parsed = parseMoney(draft, workspace);
		if (!parsed.ok) {
			moneyDraft = draft;
			moneyDirty = true;
			moneyError = parsed.message;
			return false;
		}
		const limits = projection(workspace).money;
		const value =
			step === 'max' ? limits.max : Math.max(limits.min, Math.min(limits.max, parsed.value + step));
		return commitMoney(value, 'operator');
	}

	function commitMoney(value: number, mode: CommitMode) {
		const accepted = projection(workspace).money.value;
		if (value === accepted) {
			restoreMoney();
			moneyError = null;
			return true;
		}
		return enqueue({ field: 'money', label: 'Money', mode }, trainerMoneyPendingKeys.money, {
			money: value
		});
	}

	function enqueue(
		context: { field: EditableField; label: string; mode: CommitMode },
		key: string,
		operation: SaveFileEditOperation
	) {
		if (editingUnavailable || options.coordinator.isPending(origin, key)) return false;
		const requestOrigin = origin;
		void options.coordinator
			.enqueueEdit(requestOrigin, { key, operation })
			.then((result) => settle(requestOrigin, context, result))
			.catch((error: unknown) => {
				if (!disposed && sameOrigin(requestOrigin, origin)) {
					rejectEditing(errorMessage(error));
				}
			});
		return true;
	}

	function trainerGenderPending() {
		return (
			options.coordinator.isPending(origin, trainerMoneyPendingKeys.trainerGenderMale) ||
			options.coordinator.isPending(origin, trainerMoneyPendingKeys.trainerGenderFemale)
		);
	}

	function settle(
		requestOrigin: SaveFileEditOrigin,
		context: { field: EditableField; label: string; mode: CommitMode },
		result: SaveFileEditResult
	) {
		if (disposed || !sameOrigin(requestOrigin, origin)) return;

		if (result.ok) {
			refreshWorkspace(result.workspace, context.field);
			clearFieldError(context.field);
			return;
		}

		if (result.code === 'stale-workspace' || result.code === 'save-file-deleted') {
			rejectEditing(result.message);
			return;
		}

		if (result.code === 'invalid-save-file-edit') {
			if (result.workspace) refreshWorkspace(result.workspace);
			setFieldError(context.field, result.message);
			if (context.mode !== 'enter') restoreField(context.field);
			return;
		}

		if (result.workspace) {
			refreshWorkspace(result.workspace, context.field);
		} else {
			rejectEditing(result.message);
			return;
		}

		if (result.code !== 'queued-operation-cancelled') {
			options.toast.error(`${context.label} could not be saved. ${result.message}`);
		}
	}

	async function onRetryEditing() {
		if (editingUnavailable?.retrying) return;
		const previousMessage = editingUnavailable?.message ?? 'Save File editing is unavailable.';
		editingUnavailable = { message: previousMessage, retrying: true };
		try {
			const recovered = await options.coordinator.recoverWorkspace(origin, {
				isCurrent: retryIsCurrent
			});
			if (!retryIsCurrent()) return;
			if (!recovered.ok) {
				editingUnavailable = { message: recovered.message };
				return;
			}
			projection(recovered.workspace);
			origin = recovered.origin;
			workspace = recovered.workspace;
			restoreTrainerName();
			restoreMoney();
			trainerNameError = null;
			trainerGenderError = null;
			moneyError = null;
			editingUnavailable = null;
			subscribePending();
			for (const listener of originListeners) listener(origin);
		} catch (error) {
			if (!retryIsCurrent()) return;
			editingUnavailable = { message: errorMessage(error) };
		}
	}

	function retryIsCurrent() {
		return !disposed && (options.isCurrent?.() ?? true);
	}

	function restoreTrainerName() {
		trainerNameDraft = acceptedTrainerName(workspace);
		trainerNameDirty = false;
	}

	function restoreMoney() {
		moneyDraft = acceptedMoney(workspace);
		moneyDirty = false;
	}

	function restoreField(field: EditableField) {
		if (field === 'trainer-name') restoreTrainerName();
		if (field === 'money') restoreMoney();
	}

	function clearFieldError(field: EditableField) {
		if (field === 'trainer-name') trainerNameError = null;
		if (field === 'trainer-gender') trainerGenderError = null;
		if (field === 'money') moneyError = null;
	}

	function setFieldError(field: EditableField, message: string) {
		if (field === 'trainer-name') trainerNameError = message;
		if (field === 'trainer-gender') trainerGenderError = message;
		if (field === 'money') moneyError = message;
	}

	function dispose() {
		disposed = true;
		unsubscribePending();
		originListeners.clear();
	}

	function acceptWorkspace(next: WorkspaceState) {
		projection(next);
		if (next.file.id !== origin.saveFileId) {
			throw new Error('Cannot accept a Workspace from another Save File edit session.');
		}
		refreshWorkspace(next);
	}

	function rejectEditing(message: string) {
		restoreTrainerName();
		restoreMoney();
		trainerNameError = null;
		trainerGenderError = null;
		moneyError = null;
		editingUnavailable = { message };
	}

	function subscribeOrigin(listener: (origin: SaveFileEditOrigin) => void) {
		originListeners.add(listener);
		listener(origin);
		return () => originListeners.delete(listener);
	}

	subscribePending();

	return {
		get workspace() {
			return workspace;
		},
		get origin() {
			return origin;
		},
		get editingUnavailable() {
			return editingUnavailable;
		},
		get ledgerProps(): SaveFileTrainerMoneyLedgerProps {
			const current = projection(workspace);
			return {
				view: {
					status: 'ready',
					originalFilename: workspace.file.originalFileName ?? 'Untitled Save File',
					summary: workspace.workspace.summary,
					projection: current,
					editingUnavailable
				},
				drafts: {
					...(current.trainerProfile.trainerNameSupported
						? {
								trainerName: {
									value: trainerNameDraft,
									error: trainerNameError
								}
							}
						: {}),
					...(current.money.supported ? { money: { value: moneyDraft, error: moneyError } } : {})
				},
				errors: trainerGenderError ? { 'trainer-gender': trainerGenderError } : {},
				pendingTargets,
				onRetryEditing,
				onTrainerNameInput,
				onTrainerNameCommit,
				onTrainerNameAbandon,
				onTrainerGenderSelect,
				onMoneyInput,
				onMoneyCommit,
				onMoneyAbandon,
				onMoneyStep
			};
		},
		acceptWorkspace,
		rejectEditing,
		subscribeOrigin,
		dispose
	};
}

function projection(workspace: WorkspaceState) {
	const value = workspace.workspace.saveFile;
	if (!value) throw new Error('The Save File has no editable projection.');
	return value;
}

function acceptedTrainerName(workspace: WorkspaceState) {
	return projection(workspace).trainerProfile.trainerName ?? '';
}

function acceptedMoney(workspace: WorkspaceState) {
	return String(projection(workspace).money.value ?? '');
}

function validateTrainerName(value: string, maxLength: number) {
	return value.length >= 1 && value.length <= maxLength
		? null
		: `Trainer name must be between 1 and ${maxLength} characters.`;
}

function parseMoney(
	value: string,
	workspace: WorkspaceState
): { ok: true; value: number } | { ok: false; message: string } {
	const limits = projection(workspace).money;
	const number = /^\d+$/.test(value) ? Number(value) : Number.NaN;
	if (Number.isSafeInteger(number) && number >= limits.min && number <= limits.max) {
		return { ok: true, value: number };
	}
	return {
		ok: false,
		message: `Money must be a whole number between ${limits.min.toLocaleString()} and ${limits.max.toLocaleString()}.`
	};
}

function pendingKeys(coordinator: SaveFileTrainerMoneyCoordinator, origin: SaveFileEditOrigin) {
	return distinctKeys(coordinator.listPending(origin).map(({ key }) => key));
}

function distinctKeys(keys: readonly string[]) {
	return keys.filter((key, index) => keys.indexOf(key) === index);
}

function sameOrigin(left: SaveFileEditOrigin, right: SaveFileEditOrigin) {
	return left.saveFileId === right.saveFileId && left.workspaceId === right.workspaceId;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
