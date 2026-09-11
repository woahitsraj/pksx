import { describe, expect, it, vi } from 'vitest';
import type { SaveFileEditableProjection, SaveSummary, SaveWorkspace } from '$lib/engine';
import {
	applySaveFileEditorEdits,
	cancelSaveFileEditor,
	createSaveFileEditOperation,
	createSaveFileEditorState,
	getStagedInventoryEdits,
	isSameSaveFileEditorSourceIdentity,
	stageInventoryAddEdit,
	stageInventoryQuantityEdit,
	stageInventoryRemoveEdit,
	stageMoneyEdit,
	stageSaveFileEditorEdit,
	stageTrainerGenderEdit,
	stageTrainerNameEdit,
	type SaveFileEditorApplyServices
} from '.';
import { restoreSaveFileEditorSession, updateSaveFileEditorSession } from './session';

const summary: SaveSummary = {
	fileName: 'emerald.sav',
	saveType: 'SAV3',
	gameVersion: 'E',
	gameVersionId: 3,
	generation: 3,
	trainerName: 'DIXIE',
	trainerId: 12345,
	playTime: '10:22',
	playedHours: 10,
	playedMinutes: 22,
	partyCount: 2,
	boxCount: 14,
	boxSlotCount: 30
};

const updatedSummary: SaveSummary = {
	...summary,
	trainerName: 'RAJ'
};

const workspace: SaveWorkspace = {
	summary,
	partySlots: [],
	boxSlots: []
};

const updatedWorkspace: SaveWorkspace = {
	...workspace,
	summary: updatedSummary
};

const committedWorkspace = {
	dirty: false,
	automaticBackupCreated: false
};

const source = {
	saveFileId: 'save-1',
	fileName: 'emerald.sav'
};

const projection: SaveFileEditableProjection = {
	trainerProfile: {
		trainerName: 'DIXIE',
		trainerNameSupported: true,
		trainerNameMaxLength: 7,
		trainerNameUnsupportedReason: null,
		gender: 'female',
		genderSupported: true,
		genderUnsupportedReason: null,
		trainerId: 12345,
		gameVersion: 'E',
		generation: 3
	},
	money: { value: 3000, min: 0, max: 999999, supported: true, unsupportedReason: null },
	inventory: {
		supported: true,
		unsupportedReason: null,
		pockets: [
			{
				key: 'Medicine',
				label: 'Medicine',
				capacity: 20,
				full: false,
				unsupportedReason: null,
				items: [{ id: 13, name: 'Potion', quantity: 4, maxQuantity: 99 }]
			}
		]
	}
};

const antidote = { id: 14, name: 'Antidote', maxQuantity: 99 };

const stagedEdit = {
	id: 'trainer-name',
	field: 'trainer-profile' as const,
	label: 'Set trainer name',
	payload: { trainerName: 'RAJ' }
};

function openEditor(editableProjection = projection) {
	const opened = createSaveFileEditorState(source, summary, committedWorkspace, editableProjection);
	if (!opened.ok) throw new Error('Expected Save File Editor to open.');
	return opened.state;
}

function applyServices(
	overrides: Partial<SaveFileEditorApplyServices> = {}
): SaveFileEditorApplyServices {
	return {
		validate: vi.fn(async () => ({ ok: true as const })),
		ensureBackup: vi.fn(async () => ({
			ok: true as const,
			committedWorkspace: { dirty: false, automaticBackupCreated: true }
		})),
		mutateSaveFile: vi.fn(async () => ({
			ok: true as const,
			bytes: new Uint8Array([1, 2, 3]),
			workspace: updatedWorkspace,
			mutated: true,
			message: 'Save File trainer profile updated.'
		})),
		...overrides
	};
}

describe('Save File editor state', () => {
	it('keeps staged edits only for the same committed Workspace bytes', () => {
		const revision = new Uint8Array([1, 2, 3]);
		const staged = stageMoneyEdit(restoreSaveFileEditorSession(openEditor(), revision), 12345);
		updateSaveFileEditorSession(staged);

		expect(restoreSaveFileEditorSession(openEditor(), new Uint8Array(revision))).toBe(staged);

		const replacement = openEditor({
			...projection,
			money: { ...projection.money, value: 9000 }
		});
		expect(restoreSaveFileEditorSession(replacement, new Uint8Array([1, 2, 4]))).toBe(replacement);
		expect(replacement.projection.money.value).toBe(9000);
		expect(replacement.stagedEdits).toEqual([]);
	});

	it('opens with source, editable projections, staged edits, and committed workspace state', () => {
		const result = createSaveFileEditorState(source, summary, committedWorkspace);

		expect(result).toMatchObject({
			ok: true,
			state: {
				source: {
					saveFileId: 'save-1',
					fileName: 'emerald.sav'
				},
				projection: {
					trainerProfile: {
						trainerName: 'DIXIE',
						trainerId: 12345,
						gameVersion: 'E',
						generation: 3
					},
					money: {
						value: null,
						supported: false
					},
					inventory: {
						supported: false
					}
				},
				stagedEdits: [],
				staged: false,
				committedWorkspace,
				applyOutcome: { status: 'idle', message: null },
				unsupportedReason: null
			}
		});
	});

	it('stages field edits without mutating projections or dirty workspace state', () => {
		const opened = openEditor();
		const staged = stageTrainerNameEdit(opened, 'RAJ');

		expect(staged.staged).toBe(true);
		expect(staged.stagedEdits).toEqual([stagedEdit]);
		expect(staged.projection).toBe(opened.projection);
		expect(staged.committedWorkspace.dirty).toBe(false);
		expect(createSaveFileEditOperation(staged)).toEqual({
			ok: true,
			operation: {
				trainerProfile: {
					trainerName: 'RAJ'
				}
			}
		});
	});

	it('encodes every supported staged Save File edit into one operation', () => {
		let staged = stageTrainerNameEdit(openEditor(), 'RAJ');
		staged = stageTrainerGenderEdit(staged, 'male');
		staged = stageMoneyEdit(staged, 5000);
		staged = stageInventoryQuantityEdit(staged, 'Medicine', 13, 8);
		staged = stageInventoryAddEdit(staged, 'Medicine', antidote, 2);

		expect(createSaveFileEditOperation(staged)).toEqual({
			ok: true,
			operation: {
				trainerProfile: {
					trainerName: 'RAJ',
					gender: 'male'
				},
				money: 5000,
				inventory: [
					{ kind: 'set', pocket: 'Medicine', itemId: 13, quantity: 8 },
					{ kind: 'add', pocket: 'Medicine', itemId: 14, quantity: 2 }
				]
			}
		});
	});

	it('rejects mixed staged edits when any edit is not encoded by the contract', () => {
		const trainerStaged = stageTrainerNameEdit(openEditor(), 'RAJ');
		const staged = stageSaveFileEditorEdit(trainerStaged, {
			id: 'inventory-add',
			field: 'inventory',
			label: 'Add inventory item',
			payload: { itemId: 25, quantity: 1 }
		});

		expect(createSaveFileEditOperation(staged)).toEqual({
			ok: false,
			status: 'rejected',
			message: 'Inventory edit payload is invalid.',
			reason: 'invalid-save-file-edit'
		});
	});

	it('enforces projected bounds and stages explicit inventory removal', () => {
		const invalidMoney = stageMoneyEdit(openEditor(), 1_000_000);
		const invalidQuantity = stageInventoryQuantityEdit(openEditor(), 'Medicine', 13, 100);
		const removed = stageInventoryRemoveEdit(openEditor(), 'Medicine', 13);

		expect(invalidMoney.applyOutcome.status).toBe('rejected');
		expect(invalidQuantity.applyOutcome.status).toBe('rejected');
		expect(getStagedInventoryEdits(removed)).toEqual([
			{ kind: 'remove', pocket: 'Medicine', itemId: 13 }
		]);
	});

	it('rejects invalid staged input without marking the workspace dirty', () => {
		const invalid = stageTrainerNameEdit(openEditor(), '  ');

		expect(invalid).toMatchObject({
			stagedEdits: [],
			staged: false,
			committedWorkspace: { dirty: false },
			applyOutcome: {
				status: 'rejected',
				message: 'Trainer name must be between 1 and 7 characters.',
				reason: 'invalid-save-file-edit'
			}
		});
	});

	it('cancels staged edits without changing projections or dirty workspace state', () => {
		const staged = stageSaveFileEditorEdit(openEditor(), stagedEdit);
		const cancelled = cancelSaveFileEditor(staged);

		expect(cancelled).toMatchObject({
			projection: staged.projection,
			stagedEdits: [],
			staged: false,
			committedWorkspace: { dirty: false, automaticBackupCreated: false },
			applyOutcome: { status: 'idle', message: null },
			unsupportedReason: null
		});
	});

	it('treats no staged edits as a no-op without backup or mutation', async () => {
		const services = applyServices();

		const result = await applySaveFileEditorEdits(openEditor(), services);

		expect(result.outcome).toEqual({
			status: 'noop',
			message: 'No Save File edits are staged.'
		});
		expect(services.validate).not.toHaveBeenCalled();
		expect(services.ensureBackup).not.toHaveBeenCalled();
		expect(services.mutateSaveFile).not.toHaveBeenCalled();
	});

	it('applies staged edits after validation and backup, then marks committed workspace dirty', async () => {
		const calls: string[] = [];
		const state = stageTrainerNameEdit(openEditor(), 'RAJ');
		const services = applyServices({
			validate: vi.fn(async () => {
				calls.push('validate');
				return { ok: true as const };
			}),
			ensureBackup: vi.fn(async () => {
				calls.push('backup');
				return {
					ok: true as const,
					committedWorkspace: { dirty: false, automaticBackupCreated: true }
				};
			}),
			mutateSaveFile: vi.fn(async () => {
				calls.push('mutate');
				return {
					ok: true as const,
					bytes: new Uint8Array([4, 5, 6]),
					workspace: updatedWorkspace,
					mutated: true,
					message: 'Saved.'
				};
			})
		});

		const result = await applySaveFileEditorEdits(state, services);

		expect(calls).toEqual(['validate', 'backup', 'mutate']);
		expect(result.outcome).toEqual({ status: 'success', message: 'Saved.' });
		expect(result.state.projection.trainerProfile.trainerName).toBe('RAJ');
		expect(result.state.stagedEdits).toEqual([]);
		expect(result.state.committedWorkspace).toEqual({
			dirty: true,
			automaticBackupCreated: true
		});
	});

	it('does not create a backup when validation rejects staged edits', async () => {
		const state = stageTrainerNameEdit(openEditor(), 'RAJ');
		const services = applyServices({
			validate: vi.fn(async () => ({
				ok: false as const,
				status: 'rejected' as const,
				message: 'Trainer name is not valid for this format.',
				reason: 'invalid-save-file-edit'
			}))
		});

		const result = await applySaveFileEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'rejected',
			message: 'Trainer name is not valid for this format.',
			reason: 'invalid-save-file-edit'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
		expect(services.ensureBackup).not.toHaveBeenCalled();
		expect(services.mutateSaveFile).not.toHaveBeenCalled();
	});

	it('keeps staged edits when backup creation fails before mutation', async () => {
		const state = stageTrainerNameEdit(openEditor(), 'RAJ');
		const services = applyServices({
			ensureBackup: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Backup could not be created.',
				reason: 'backup-write-failed'
			}))
		});

		const result = await applySaveFileEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Backup could not be created.',
			reason: 'backup-write-failed'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
		expect(services.mutateSaveFile).not.toHaveBeenCalled();
	});

	it('surfaces unsupported engine behavior explicitly and keeps staged edits', async () => {
		const state = stageTrainerNameEdit(openEditor(), 'RAJ');
		const services = applyServices({
			mutateSaveFile: vi.fn(async () => ({
				ok: false as const,
				status: 'unsupported' as const,
				message: 'Save File editing is not available in this version.',
				reason: 'unsupported-save-file-edit'
			}))
		});

		const result = await applySaveFileEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'unsupported',
			message: 'Save File editing is not available in this version.',
			reason: 'unsupported-save-file-edit'
		});
		expect(result.state.unsupportedReason).toBe(
			'Save File editing is not available in this version.'
		);
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
	});

	it('keeps staged edits when mutation fails', async () => {
		const state = stageTrainerNameEdit(openEditor(), 'RAJ');
		const services = applyServices({
			mutateSaveFile: vi.fn(async () => ({
				ok: false as const,
				status: 'failed' as const,
				message: 'Engine mutation failed.',
				reason: 'engine-unavailable'
			}))
		});

		const result = await applySaveFileEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Engine mutation failed.',
			reason: 'engine-unavailable'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
	});

	it('refuses apply when the source no longer identifies the same Save File', async () => {
		const state = stageTrainerNameEdit(openEditor(), 'RAJ');
		const services = applyServices({
			verifySource: vi.fn(async () => ({
				ok: false,
				message: 'Save File Editor source changed before Apply.'
			}))
		});

		const result = await applySaveFileEditorEdits(state, services);

		expect(result.outcome).toEqual({
			status: 'failed',
			message: 'Save File Editor source changed before Apply.',
			reason: 'stale-source'
		});
		expect(result.state.stagedEdits).toEqual([stagedEdit]);
		expect(services.validate).not.toHaveBeenCalled();
		expect(services.mutateSaveFile).not.toHaveBeenCalled();
	});

	it('compares editor source identity against the current Save File summary', () => {
		const state = openEditor();

		expect(isSameSaveFileEditorSourceIdentity(state, summary)).toBe(true);
		expect(isSameSaveFileEditorSourceIdentity(state, updatedSummary)).toBe(false);
		expect(isSameSaveFileEditorSourceIdentity(state, null)).toBe(false);
	});
});
