import { describe, expect, it, vi } from 'vitest';
import { createMockEngine, type PokemonActionPreview } from '$lib/engine';
import { createCleanWorkspaceState } from '$lib/pksx/backup-workflow';
import {
	applyPokemonAction,
	clearPokemonActionSelection,
	createPokemonActionReadyState,
	selectPokemonAction,
	selectedPokemonActionOperation
} from '.';

const preview: PokemonActionPreview = {
	legalityReport: {
		legal: false,
		judgement: 'Illegal',
		summary: 'PKHeX found legality issues.',
		fixableProblems: ['Move Set'],
		warnings: [],
		messages: []
	},
	actions: [
		{
			kind: 'legality-fix',
			available: true,
			changes: [{ field: 'Moves', before: 'Splash', after: 'Tackle' }],
			choices: [],
			fixes: [
				{
					id: 'move-set',
					token: 'move-set:preview-token',
					label: 'Move Set',
					changes: [{ field: 'Moves', before: 'Splash', after: 'Tackle' }]
				}
			]
		},
		{
			kind: 'evolve',
			available: true,
			changes: [],
			choices: [
				{
					id: '2:0:4:0:16',
					speciesId: 2,
					form: 0,
					speciesName: 'Ivysaur',
					method: 'LevelUp',
					requirement: 'Level 16',
					changes: [{ field: 'Species', before: 'Bulbasaur', after: 'Ivysaur' }]
				}
			],
			fixes: []
		}
	]
};

const workspace = createCleanWorkspaceState({
	file: {
		id: 'save-1',
		originalFileName: 'main.sav',
		byteLength: 3,
		importedAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z'
	},
	bytes: new Uint8Array([1, 2, 3]),
	workspace: {
		summary: {
			saveType: 'SAV3',
			gameVersion: 'E',
			gameVersionId: 3,
			generation: 3,
			trainerId: 1,
			playTime: '',
			playedHours: 0,
			playedMinutes: 0,
			partyCount: 0,
			boxCount: 1,
			boxSlotCount: 30
		},
		partySlots: [],
		boxSlots: []
	}
});

describe('Pokemon Actions', () => {
	it('selects previews and cancels without applying', () => {
		const ready = createPokemonActionReadyState('Box 1', 'Bulbasaur', preview);
		if (ready.status !== 'ready') throw new Error('Expected ready state.');

		const selected = selectPokemonAction(ready, 'evolve', '2:0:4:0:16');
		expect(selected).toMatchObject({
			status: 'ready',
			selection: { kind: 'evolve', choice: { speciesName: 'Ivysaur' } }
		});
		if (selected.status !== 'ready') throw new Error('Expected ready state.');
		expect(selectedPokemonActionOperation(selected)).toEqual({
			kind: 'evolve',
			choiceId: '2:0:4:0:16'
		});
		expect(clearPokemonActionSelection(selected)).toMatchObject({ selection: null });
	});

	it('selects one targeted legality fix', () => {
		const ready = createPokemonActionReadyState('Box 1', 'Bulbasaur', preview);
		if (ready.status !== 'ready') throw new Error('Expected ready state.');

		const selected = selectPokemonAction(ready, 'legality-fix', 'move-set');
		expect(selected).toMatchObject({
			selection: { kind: 'legality-fix', fix: { id: 'move-set', label: 'Move Set' } }
		});
		if (selected.status !== 'ready') throw new Error('Expected ready state.');
		expect(selectedPokemonActionOperation(selected)).toEqual({
			kind: 'legality-fix',
			choiceId: 'move-set:preview-token'
		});
	});

	it('does not select an unavailable action', () => {
		const ready = createPokemonActionReadyState('Box 1', 'Bulbasaur', {
			...preview,
			actions: preview.actions.map((action) =>
				action.kind === 'legality-fix'
					? {
							...action,
							available: false,
							unavailableReason: 'The Legality Report has no supported fixable problems.'
						}
					: action
			)
		});
		if (ready.status !== 'ready') throw new Error('Expected ready state.');

		expect(selectPokemonAction(ready, 'legality-fix', 'move-set')).toBe(ready);
		expect(ready.selection).toBeNull();
	});

	it('backs up and dirties Save File-owned applies', async () => {
		const createAutomaticBackup = vi.fn(async () => undefined);
		const persistWorkspace = vi.fn(async () => undefined);
		const result = await applyPokemonAction(
			createMockEngine(),
			{
				owner: 'save-file',
				workspace,
				source: { zone: 'box', box: 0, slot: 0 },
				activeBox: 0
			},
			{ kind: 'evolve', choiceId: '26:0:7:0:0' },
			{
				createAutomaticBackup,
				persistWorkspace,
				persistStoredPokemon: vi.fn()
			}
		);

		expect(result).toMatchObject({
			ok: true,
			owner: 'save-file',
			workspace: { dirty: true, automaticBackupCreated: true }
		});
		expect(createAutomaticBackup).toHaveBeenCalledWith(workspace, 'evolution');
		expect(persistWorkspace).toHaveBeenCalledOnce();
	});

	it('persists Pokemon Storage applies without creating a Save File Backup', async () => {
		const createAutomaticBackup = vi.fn();
		const persistStoredPokemon = vi.fn(async () => undefined);
		const result = await applyPokemonAction(
			createMockEngine(),
			{ owner: 'pokemon-storage', entityBytesBase64: 'bW9jay1waWthY2h1' },
			{ kind: 'evolve', choiceId: '26:0:7:0:0' },
			{
				createAutomaticBackup,
				persistWorkspace: vi.fn(),
				persistStoredPokemon
			}
		);

		expect(result).toMatchObject({ ok: true, owner: 'pokemon-storage' });
		expect(createAutomaticBackup).not.toHaveBeenCalled();
		expect(persistStoredPokemon).toHaveBeenCalledOnce();
	});

	it('does not persist a failed apply', async () => {
		const persistWorkspace = vi.fn();
		const engine = createMockEngine({
			applyPokemonAction: vi.fn(async () => ({
				ok: false as const,
				value: null,
				error: { code: 'invalid-pokemon-action' as const, message: 'Unavailable.' }
			}))
		});
		const result = await applyPokemonAction(
			engine,
			{
				owner: 'save-file',
				workspace: { ...workspace, automaticBackupCreated: true },
				source: { zone: 'box', box: 0, slot: 0 },
				activeBox: 0
			},
			{ kind: 'evolve', choiceId: 'missing' },
			{
				createAutomaticBackup: vi.fn(),
				persistWorkspace,
				persistStoredPokemon: vi.fn()
			}
		);

		expect(result).toMatchObject({ ok: false, error: { code: 'invalid-pokemon-action' } });
		expect(persistWorkspace).not.toHaveBeenCalled();
	});
});
