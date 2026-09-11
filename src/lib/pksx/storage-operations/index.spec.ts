import { describe, expect, it, vi } from 'vitest';
import type {
	EngineApi,
	EngineResult,
	SaveSlotRef,
	SaveWorkspace,
	SlotOperationResult
} from '$lib/engine';
import { createMockEngine } from '$lib/engine/mock-engine';
import { createCleanWorkspaceState, type WorkspaceState } from '$lib/pksx/backup-workflow';
import type { StoredSaveFile } from '$lib/pksx/saves';
import {
	applyStorageOperation,
	destinationStateForStorageOperation,
	validateStorageOperation
} from './index';

const saveFile: StoredSaveFile = {
	id: 'save-1',
	originalFileName: 'emerald.sav',
	byteLength: 4,
	importedAt: '2026-05-28T10:00:00.000Z',
	updatedAt: '2026-05-28T10:00:00.000Z'
};

const workspace: SaveWorkspace = {
	summary: {
		fileName: 'emerald.sav',
		saveType: 'SAV3',
		gameVersion: 'E',
		gameVersionId: 3,
		generation: 3,
		trainerName: 'CASS',
		trainerId: 41203,
		playTime: '47:12',
		playedHours: 47,
		playedMinutes: 12,
		partyCount: 1,
		boxCount: 2,
		boxSlotCount: 30
	},
	partySlots: [],
	boxSlots: []
};

const source: SaveSlotRef = { zone: 'box', box: 0, slot: 0 };
const emptyDestination: SaveSlotRef = { zone: 'box', box: 0, slot: 2 };
const occupiedDestination: SaveSlotRef = { zone: 'box', box: 0, slot: 1 };

describe('storage operations', () => {
	it('moves an occupied source into an empty destination', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: emptyDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			message: 'Moved to Box 01 Slot 3.',
			focusRef: emptyDestination,
			effect: 'move',
			createdAutomaticBackup: true,
			dirtyChanged: true,
			mutated: true
		});
		expect(services.prepareAutomaticBackup).toHaveBeenCalledTimes(1);
		expect(services.persistWorkspace).toHaveBeenCalledWith(
			expect.objectContaining({ dirty: true }),
			'revision-1'
		);
	});

	it('copies an occupied source into an empty destination', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'copy', source, destination: emptyDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			message: 'Copied to Box 01 Slot 3.',
			effect: 'copy'
		});
	});

	it('swaps an occupied source with an occupied destination', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: occupiedDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'pokemon' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			message: 'Swapped with Box 01 Slot 2.',
			effect: 'swap'
		});
	});

	it('clears an occupied source and keeps focus on that source', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'clear', source },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			message: 'Cleared Box 01 Slot 1.',
			focusRef: source,
			effect: 'clear'
		});
	});

	it('rejects an empty source before creating a backup', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: emptyDestination },
			activeBox: 0,
			sourceSlot: { kind: 'empty' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toEqual({
			ok: false,
			reason: 'empty-source',
			message: 'Move, Copy, and Clear Slot need an occupied source Slot.'
		});
		expect(services.prepareAutomaticBackup).not.toHaveBeenCalled();
		expect(services.engine.applySlotOperation).not.toHaveBeenCalled();
	});

	it('allows an unknown cross-box source projection so the engine can validate the slot ref', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: {
				kind: 'move',
				source: { zone: 'box', box: 1, slot: 0 },
				destination: emptyDestination
			},
			activeBox: 0,
			sourceSlot: null,
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			message: 'Moved to Box 01 Slot 3.'
		});
		expect(services.engine.applySlotOperation).toHaveBeenCalledWith(
			expect.any(Uint8Array),
			saveFile.originalFileName,
			expect.objectContaining({ source: { zone: 'box', box: 1, slot: 0 } }),
			0
		);
	});

	it('rejects copy to an occupied destination before creating a backup', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'copy', source, destination: occupiedDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'pokemon' },
			partyCount: 1,
			services
		});

		expect(result).toEqual({
			ok: false,
			reason: 'occupied-destination',
			message: 'Copy needs an empty destination Slot.'
		});
		expect(services.prepareAutomaticBackup).not.toHaveBeenCalled();
		expect(services.engine.applySlotOperation).not.toHaveBeenCalled();
	});

	it('rejects invalid party destinations before creating a backup', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: { zone: 'party', slot: 3 } },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toEqual({
			ok: false,
			reason: 'invalid-destination',
			message: 'That Party Slot cannot be used yet.'
		});
		expect(services.prepareAutomaticBackup).not.toHaveBeenCalled();
		expect(services.engine.applySlotOperation).not.toHaveBeenCalled();
	});

	it('treats same source and destination as a no-op without backup or mutation', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: source },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'pokemon' },
			partyCount: 1,
			services
		});

		expect(result).toEqual({
			ok: false,
			reason: 'noop',
			message: 'No Slot change made.'
		});
		expect(services.prepareAutomaticBackup).not.toHaveBeenCalled();
		expect(services.engine.applySlotOperation).not.toHaveBeenCalled();
	});

	it('creates one automatic backup and does not duplicate it for later mutations', async () => {
		const services = createServices();
		const first = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: emptyDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});
		expect(first.ok).toBe(true);

		const second = await applyStorageOperation({
			state: first.ok ? first.state : null,
			operation: { kind: 'copy', source, destination: { zone: 'box', box: 0, slot: 3 } },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(second).toMatchObject({ ok: true, createdAutomaticBackup: false });
		expect(services.prepareAutomaticBackup).toHaveBeenCalledTimes(2);
		expect(services.persistWorkspace).toHaveBeenCalledTimes(2);
	});

	it('marks successful mutations dirty without clearing export state until export', async () => {
		const services = createServices();
		const result = await applyStorageOperation({
			state: createWorkspaceState(),
			operation: { kind: 'move', source, destination: emptyDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			state: expect.objectContaining({
				dirty: true,
				restoredFromBackup: null,
				automaticBackupCreated: true
			})
		});
	});

	it('does not mark an already dirty workspace clean when the engine reports no mutation', async () => {
		const services = createServices({ mutated: false });
		const dirtyState = { ...createWorkspaceState(), dirty: true, automaticBackupCreated: true };
		const result = await applyStorageOperation({
			state: dirtyState,
			operation: { kind: 'copy', source, destination: emptyDestination },
			activeBox: 0,
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1,
			services
		});

		expect(result).toMatchObject({
			ok: true,
			dirtyChanged: false,
			mutated: false,
			state: expect.objectContaining({ dirty: true })
		});
	});

	it('models destination highlighting for source, valid, occupied, and invalid slots', () => {
		const pending = {
			kind: 'copy' as const,
			source,
			sourceLabel: 'Box 01 Slot 1',
			sourcePokemonLabel: 'ARON'
		};

		expect(
			destinationStateForStorageOperation({
				pending,
				destination: source,
				destinationSlot: { kind: 'pokemon' },
				partyCount: 1
			})
		).toBe('source');
		expect(
			destinationStateForStorageOperation({
				pending,
				destination: emptyDestination,
				destinationSlot: { kind: 'empty' },
				partyCount: 1
			})
		).toBe('valid');
		expect(
			destinationStateForStorageOperation({
				pending,
				destination: occupiedDestination,
				destinationSlot: { kind: 'pokemon' },
				partyCount: 1
			})
		).toBe('invalid');
		expect(
			destinationStateForStorageOperation({
				pending,
				destination: { zone: 'party', slot: 3 },
				destinationSlot: { kind: 'empty' },
				partyCount: 1
			})
		).toBe('invalid');
	});

	it('exposes validation without engine services for focused unit coverage', () => {
		const result = validateStorageOperation({
			operation: { kind: 'move', source, destination: { zone: 'party', slot: 1 } },
			sourceSlot: { kind: 'pokemon' },
			destinationSlot: { kind: 'empty' },
			partyCount: 1
		});

		expect(result).toEqual({ ok: true });
	});
});

function createWorkspaceState(): WorkspaceState {
	return createCleanWorkspaceState({
		file: saveFile,
		bytes: new Uint8Array([1, 2, 3, 4]),
		workspace
	});
}

function createServices(options: { mutated?: boolean } = {}) {
	const engine = createMockEngine({
		applySlotOperation: vi.fn(async (bytes, fileName) =>
			success<SlotOperationResult>({
				bytes: new Uint8Array([...bytes, 9]),
				mutated: options.mutated ?? true,
				workspace: {
					...workspace,
					summary: { ...workspace.summary, fileName }
				}
			})
		)
	});

	return {
		engine: engine as EngineApi & { applySlotOperation: ReturnType<typeof vi.fn> },
		prepareAutomaticBackup: vi.fn(async (state: WorkspaceState) => ({
			state: { ...state, automaticBackupCreated: true },
			revision: 'revision-1',
			established: !state.automaticBackupCreated
		})),
		persistWorkspace: vi.fn(async () => undefined),
		locationForSlotRef
	};
}

function success<T>(value: T): EngineResult<T> {
	return { ok: true, value, error: null };
}

function locationForSlotRef(ref: SaveSlotRef): string {
	return ref.zone === 'party'
		? `Party Slot ${ref.slot + 1}`
		: `Box ${String(ref.box + 1).padStart(2, '0')} Slot ${ref.slot + 1}`;
}
