import type {
	EngineApi,
	EngineError,
	PokemonActionChange,
	PokemonActionKind,
	PokemonActionOperation,
	PokemonActionPreview,
	PokemonActionResult,
	PokemonEvolutionChoice,
	PokemonLegalityFixChoice,
	SaveSlotRef,
	StoredPokemonActionOperation,
	StoredPokemonActionResult
} from '$lib/engine';
import {
	markAutomaticBackupCreated,
	shouldCreateAutomaticBackup,
	type WorkspaceState
} from '$lib/pksx/backup-workflow';

export type PokemonActionSelection = {
	kind: PokemonActionKind;
	choice: PokemonEvolutionChoice | null;
	fix: PokemonLegalityFixChoice | null;
	changes: PokemonActionChange[];
};

export type PokemonActionReadyState = {
	status: 'ready';
	location: string;
	pokemonLabel: string;
	preview: PokemonActionPreview;
	selection: PokemonActionSelection | null;
};

export type PokemonActionApplyingState = Omit<PokemonActionReadyState, 'status'> & {
	status: 'applying';
};

export type PokemonActionState =
	| { status: 'idle' }
	| { status: 'loading'; location: string; pokemonLabel: string }
	| PokemonActionReadyState
	| PokemonActionApplyingState
	| { status: 'error'; location: string; pokemonLabel: string; message: string };

export type PokemonActionTarget =
	| {
			owner: 'save-file';
			workspace: WorkspaceState;
			source: SaveSlotRef;
			activeBox: number;
	  }
	| {
			owner: 'pokemon-storage';
			entityBytesBase64: string;
	  };

export type PokemonActionApplyServices = {
	createAutomaticBackup(state: WorkspaceState, reason: 'legality-fix' | 'evolution'): Promise<void>;
	persistWorkspace(state: WorkspaceState): Promise<void>;
	persistStoredPokemon(result: StoredPokemonActionResult): Promise<void>;
};

export type PokemonActionApplyResult =
	| {
			ok: true;
			owner: 'save-file';
			workspace: WorkspaceState;
			result: PokemonActionResult;
	  }
	| {
			ok: true;
			owner: 'pokemon-storage';
			result: StoredPokemonActionResult;
	  }
	| {
			ok: false;
			error: EngineError;
			workspace?: WorkspaceState;
	  };

export function createPokemonActionLoadingState(
	location: string,
	pokemonLabel: string
): PokemonActionState {
	return { status: 'loading', location, pokemonLabel };
}

export function createPokemonActionReadyState(
	location: string,
	pokemonLabel: string,
	preview: PokemonActionPreview
): PokemonActionState {
	return { status: 'ready', location, pokemonLabel, preview, selection: null };
}

export function selectPokemonAction(
	state: PokemonActionReadyState,
	kind: PokemonActionKind,
	choiceId?: string
): PokemonActionState {
	const action = state.preview.actions.find((candidate) => candidate.kind === kind);
	if (!action?.available) return state;

	const choice =
		kind === 'evolve'
			? (action.choices.find((candidate) => candidate.id === choiceId) ?? null)
			: null;
	if (kind === 'evolve' && !choice) return state;
	const fix =
		kind === 'legality-fix'
			? (action.fixes.find((candidate) => candidate.id === choiceId) ?? null)
			: null;
	if (kind === 'legality-fix' && !fix) return state;

	return {
		...state,
		selection: {
			kind,
			choice,
			fix,
			changes: choice?.changes ?? fix?.changes ?? action.changes
		}
	};
}

export function clearPokemonActionSelection(
	state: PokemonActionReadyState | PokemonActionApplyingState
): PokemonActionState {
	return { ...state, status: 'ready', selection: null };
}

export function selectedPokemonActionOperation(
	state: PokemonActionReadyState | PokemonActionApplyingState
): StoredPokemonActionOperation | null {
	if (!state.selection) return null;
	return {
		kind: state.selection.kind,
		...(state.selection.choice || state.selection.fix
			? { choiceId: state.selection.choice?.id ?? state.selection.fix?.token }
			: {})
	};
}

export async function requestPokemonActionPreview(engine: EngineApi, target: PokemonActionTarget) {
	return target.owner === 'save-file'
		? engine.previewPokemonActions(
				target.workspace.bytes,
				target.workspace.file.originalFileName ?? undefined,
				target.source
			)
		: engine.previewStoredPokemonActions(target.entityBytesBase64);
}

export async function applyPokemonAction(
	engine: EngineApi,
	target: PokemonActionTarget,
	operation: StoredPokemonActionOperation,
	services: PokemonActionApplyServices
): Promise<PokemonActionApplyResult> {
	if (target.owner === 'pokemon-storage') {
		const result = await engine.applyStoredPokemonAction(target.entityBytesBase64, operation);
		if (!result.ok) return result;
		await services.persistStoredPokemon(result.value);
		return { ok: true, owner: 'pokemon-storage', result: result.value };
	}

	let workspace = target.workspace;
	if (shouldCreateAutomaticBackup(workspace)) {
		await services.createAutomaticBackup(
			workspace,
			operation.kind === 'legality-fix' ? 'legality-fix' : 'evolution'
		);
		workspace = markAutomaticBackupCreated(workspace);
	}

	const saveOperation: PokemonActionOperation = {
		...operation,
		source: target.source
	};
	const result = await engine.applyPokemonAction(
		workspace.bytes,
		workspace.file.originalFileName ?? undefined,
		saveOperation,
		target.activeBox
	);
	if (!result.ok) return { ...result, workspace };

	const nextWorkspace = {
		...workspace,
		bytes: result.value.bytes,
		workspace: result.value.workspace,
		dirty: workspace.dirty || result.value.mutated,
		restoredFromBackup: null
	};
	if (nextWorkspace.dirty) await services.persistWorkspace(nextWorkspace);

	return {
		ok: true,
		owner: 'save-file',
		workspace: nextWorkspace,
		result: result.value
	};
}
