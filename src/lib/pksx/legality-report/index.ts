import type { EngineApi, EngineError, LegalityReport, SaveSlotRef } from '$lib/engine';
import type { SlotView } from '$lib/components/pksx/types';
import type { WorkspaceState } from '$lib/pksx/backup-workflow';

export type LegalityReportState =
	| { status: 'idle' }
	| { status: 'loading'; location: string; pokemonLabel: string }
	| { status: 'ready'; location: string; pokemonLabel: string; report: LegalityReport }
	| { status: 'unavailable'; location: string; pokemonLabel: string; message: string }
	| { status: 'error'; location: string; pokemonLabel: string; message: string };

export type LegalityReportRequest = {
	workspace: WorkspaceState | null;
	engine: EngineApi | null;
	slot: SlotView;
	source: SaveSlotRef;
	location: string;
};

export type LegalityReportRequestResult = {
	state: LegalityReportState;
	dirtyChanged: boolean;
	bytesChanged: boolean;
};

export function createLegalityReportLoadingState(
	slot: SlotView,
	location: string
): LegalityReportState {
	return {
		status: 'loading',
		location,
		pokemonLabel: slot.kind === 'pokemon' ? slot.label : 'Empty Slot'
	};
}

export function createLegalityReportUnavailableState(
	slot: SlotView,
	location: string
): LegalityReportState {
	return {
		status: 'unavailable',
		location,
		pokemonLabel: slot.kind === 'pokemon' ? slot.label : 'Empty Slot',
		message:
			slot.kind === 'pokemon'
				? 'Legality Check is not available for this Pokemon.'
				: 'Legality Check needs an occupied Slot.'
	};
}

export async function requestLegalityReport({
	workspace,
	engine,
	slot,
	source,
	location
}: LegalityReportRequest): Promise<LegalityReportRequestResult> {
	const beforeDirty = workspace?.dirty ?? false;
	const beforeBytes = workspace?.bytes ?? null;
	const pokemonLabel = slot.kind === 'pokemon' ? slot.label : 'Empty Slot';

	if (slot.kind !== 'pokemon') {
		return {
			state: createLegalityReportUnavailableState(slot, location),
			dirtyChanged: false,
			bytesChanged: false
		};
	}

	if (!workspace) {
		return {
			state: {
				status: 'error',
				location,
				pokemonLabel,
				message: 'Load a Save File before checking legality.'
			},
			dirtyChanged: false,
			bytesChanged: false
		};
	}

	if (!engine) {
		return {
			state: {
				status: 'error',
				location,
				pokemonLabel,
				message: 'Legality Check is still loading. Try again.'
			},
			dirtyChanged: false,
			bytesChanged: false
		};
	}

	const result = await engine.checkSlotLegality(
		workspace.bytes,
		workspace.file.originalFileName ?? undefined,
		source
	);

	if (!result.ok) {
		return {
			state: {
				status: isUnavailableError(result.error) ? 'unavailable' : 'error',
				location,
				pokemonLabel,
				message: result.error.message
			},
			dirtyChanged: workspace.dirty !== beforeDirty,
			bytesChanged: workspace.bytes !== beforeBytes
		};
	}

	return {
		state: {
			status: 'ready',
			location,
			pokemonLabel,
			report: result.value
		},
		dirtyChanged: workspace.dirty !== beforeDirty,
		bytesChanged: workspace.bytes !== beforeBytes
	};
}

function isUnavailableError(error: EngineError): boolean {
	return error.code === 'unsupported-save' || error.code === 'empty-source-slot';
}
