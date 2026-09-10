import { afterEach, describe, expect, it } from 'vitest';
import type { BoxSlotSummary, PartySlotSummary, SaveWorkspace } from '$lib/engine';
import type { StoredSaveFile } from '$lib/pksx/saves';
import { createCleanWorkspaceState } from '$lib/pksx/backup-workflow';
import {
	getCachedSavesSnapshot,
	getCachedActiveWorkspaceBox,
	getActiveWorkspaceService,
	countSavePokemon,
	invalidateActiveWorkspaceCache,
	invalidateSavesCache,
	isCachedSavesSnapshotSeeded,
	seedSavesSnapshotFromActiveWorkspace,
	setCachedActiveWorkspace,
	subscribeSavesSnapshot
} from './saves-cache';

const saveFile: StoredSaveFile = {
	id: 'save-1',
	originalFileName: 'emerald.sav',
	byteLength: 4,
	importedAt: '2026-06-01T10:00:00.000Z',
	updatedAt: '2026-06-02T10:00:00.000Z'
};

const summary: SaveWorkspace['summary'] = {
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
	boxCount: 14,
	boxSlotCount: 30
};

const partySlot: PartySlotSummary = {
	slot: 0,
	speciesId: 304,
	form: 0,
	format: 3,
	level: 12,
	experience: 100,
	experienceProjection: null,
	nickname: 'ARON',
	isEgg: false,
	isEmpty: false,
	types: [],
	stats: [],
	moves: [],
	originalTrainerEditConstraints: {
		supported: false,
		currentName: '',
		currentTrainerId: 0,
		currentSecretId: 0,
		currentGenderId: 0,
		currentLanguageId: 0,
		maxNameLength: 0,
		minTrainerId: 0,
		maxTrainerId: 65535,
		supportsSecretId: false,
		supportsGender: false,
		supportsLanguage: false,
		genders: [],
		languages: [],
		unsupportedReason: 'Fixture'
	},
	natureEditConstraints: {
		supported: false,
		currentNatureId: -1,
		originalNatureId: -1,
		statNatureId: -1,
		usesStatNature: false,
		options: [],
		unsupportedReason: 'Nature Editing is unavailable.'
	},
	heldItemEditConstraints: {
		supported: true,
		currentItemId: 0,
		options: [{ id: 0, name: 'No item', available: true }]
	},
	abilityEditConstraints: {
		supported: false,
		currentAbilityIndex: -1,
		options: [],
		unsupportedReason: 'Fixture'
	},
	metDataEditConstraints: {
		supported: false,
		currentLocationId: 0,
		currentMetLevel: 0,
		currentOriginGameId: 0,
		currentBallId: 0,
		minMetLevel: 0,
		maxMetLevel: 100,
		supportsMetDate: false,
		supportsOriginGame: false,
		supportsBall: false,
		locationGroups: [],
		originGames: [],
		balls: [],
		unsupportedReason: 'Fixture'
	},
	statEditConstraints: {
		supported: false,
		minIv: 0,
		maxIv: 31,
		minEv: 0,
		maxEv: 255,
		maxTotalEv: 510,
		unsupportedReason: 'Fixture'
	},
	moveSetEditConstraints: {
		supported: false,
		maxMoveSlots: 4,
		availableMoves: [],
		unsupportedReason: 'Fixture'
	},
	friendshipEditConstraints: {
		supported: true,
		fields: [{ key: 'friendship', label: 'Friendship', value: 70, min: 0, max: 255 }]
	},
	battleFields: [],
	spriteIdentity: {
		speciesId: 304,
		form: 0,
		isEgg: false,
		isShiny: false,
		displaySex: 'default'
	}
};

const boxSlot: BoxSlotSummary = {
	...partySlot,
	box: 0,
	slot: 0
};

const workspace: SaveWorkspace = {
	summary,
	partySlots: [partySlot],
	boxSlots: [boxSlot, { ...boxSlot, slot: 1, isEmpty: true, nickname: '' }]
};

describe('Saves cache', () => {
	afterEach(() => {
		invalidateSavesCache();
		invalidateActiveWorkspaceCache();
	});

	it('seeds a Saves snapshot from the already-loaded active workspace', () => {
		expect.assertions(6);

		const activeWorkspace = createCleanWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([1, 2, 3, 4]),
			workspace
		});

		setCachedActiveWorkspace(activeWorkspace, 0);
		const seeded = seedSavesSnapshotFromActiveWorkspace([saveFile]);

		expect(seeded).not.toBeNull();
		expect(isCachedSavesSnapshotSeeded()).toBe(true);
		expect(getCachedSavesSnapshot()).toBe(seeded);
		expect(seeded?.activeSaveFileId).toBe(saveFile.id);
		expect(seeded?.saveFiles).toEqual([saveFile]);
		expect(seeded?.detailsBySaveFileId[saveFile.id]).toEqual({ status: 'loading' });
	});

	it('replays loading state and later updates to a remounted Saves subscriber', () => {
		const activeWorkspace = createCleanWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([1, 2, 3, 4]),
			workspace
		});
		setCachedActiveWorkspace(activeWorkspace, 0);
		seedSavesSnapshotFromActiveWorkspace([saveFile]);

		const firstUpdates: unknown[] = [];
		const secondUpdates: unknown[] = [];
		const unsubscribeFirst = subscribeSavesSnapshot((snapshot) => firstUpdates.push(snapshot));
		unsubscribeFirst();
		const unsubscribeSecond = subscribeSavesSnapshot((snapshot) => secondUpdates.push(snapshot));

		setCachedActiveWorkspace(activeWorkspace, 0);
		unsubscribeSecond();

		expect(firstUpdates).toHaveLength(1);
		expect(secondUpdates).toHaveLength(2);
		expect(secondUpdates.at(-1)).toBe(getCachedSavesSnapshot());
	});

	it('publishes an active workspace projection with its Box number', () => {
		const boxTwoWorkspace = createCleanWorkspaceState({
			file: saveFile,
			bytes: new Uint8Array([1, 2, 3, 4]),
			workspace: {
				...workspace,
				boxSlots: [{ ...boxSlot, box: 1, nickname: 'MAKUHITA' }]
			}
		});
		const observed: Array<{ box: number; nickname: string }> = [];
		const unsubscribe = getActiveWorkspaceService().subscribe((state) => {
			if (!state) return;
			observed.push({
				box: getCachedActiveWorkspaceBox(),
				nickname: state.workspace.boxSlots[0]?.nickname ?? ''
			});
		});

		setCachedActiveWorkspace(boxTwoWorkspace, 1);
		unsubscribe();

		expect(observed.at(-1)).toEqual({ box: 1, nickname: 'MAKUHITA' });
	});

	it('counts Party and occupied slots across every Box', async () => {
		expect.assertions(1);

		const count = await countSavePokemon(
			{ ...summary, partyCount: 2, boxCount: 3 },
			[boxSlot, { ...boxSlot, slot: 1, isEmpty: true }],
			async (box) =>
				box === 1
					? { ok: true, value: [{ ...boxSlot, box: 1 }], error: null }
					: {
							ok: true,
							error: null,
							value: [
								{ ...boxSlot, box: 2 },
								{ ...boxSlot, box: 2, slot: 1 }
							]
						}
		);

		expect(count).toBe(6);
	});

	it('does not seed when no active workspace is cached', () => {
		expect.assertions(2);

		expect(seedSavesSnapshotFromActiveWorkspace([saveFile])).toBeNull();
		expect(getCachedSavesSnapshot()).toBeNull();
	});
});
