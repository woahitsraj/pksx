import { describe, expect, it } from 'vitest';
import type { SlotView } from '$lib/components/pksx/types';
import type { StoredPokemonStorage, StoredPokemonStoragePokemon } from '$lib/pksx/saves';
import {
	addBoxPane,
	applyPokemonStorageSlotOperation,
	closeBoxPane,
	createBoxPane,
	createCarryState,
	createSourcePickerCards,
	destinationStateForEvaluation,
	evaluateDestination,
	focusSurvivingPaneAfterClose,
	movePaneFocus,
	refreshSaveFilePaneWorkspaces,
	switchPaneSource,
	toggleCarryMode,
	type BoxSourceRef,
	type WorkbenchSlotRef
} from './index';

const saveSource: BoxSourceRef = {
	type: 'save-file',
	id: 'save-1',
	label: 'emerald.sav',
	dirty: false
};
const storageSource: BoxSourceRef = {
	type: 'pokemon-storage',
	id: 'pokemon-storage',
	label: 'Pokemon Storage'
};

const aron: SlotView = {
	slot: 0,
	label: 'ARON',
	detail: 'Lv. 12',
	level: 12,
	experience: 100,
	experienceProjection: null,
	speciesId: 304,
	form: 0,
	isEgg: false,
	spriteIdentity: null,
	kind: 'pokemon',
	originalTrainer: 'RAJ'
};
const emptySlot: SlotView = {
	slot: 3,
	label: 'Empty',
	detail: '',
	level: null,
	experience: null,
	experienceProjection: null,
	speciesId: null,
	form: null,
	isEgg: false,
	spriteIdentity: null,
	kind: 'empty'
};
const storedAron: StoredPokemonStoragePokemon = {
	label: 'ARON',
	detail: 'Lv. 12',
	level: 12,
	experience: 100,
	speciesId: 304,
	form: 0,
	isEgg: false,
	spriteIdentity: null,
	originalTrainer: 'RAJ',
	origin: {
		entryMode: 'moved-in',
		originSaveFileName: 'emerald.sav',
		originGame: 'Pokemon Emerald',
		originalTrainer: 'RAJ',
		trainerId: null,
		enteredAt: '2026-06-05T10:00:00.000Z'
	}
};
const storedZubat: StoredPokemonStoragePokemon = {
	...storedAron,
	label: 'ZUBAT',
	speciesId: 41,
	origin: {
		...storedAron.origin,
		originalTrainer: 'MAY'
	}
};

function slotRef(paneId: string, slot: number): WorkbenchSlotRef {
	return { paneId, zone: 'box', box: 0, slot };
}

function storageFixture(): StoredPokemonStorage {
	return {
		id: 'pokemon-storage',
		schemaVersion: 1,
		boxCount: 1,
		boxSlotCount: 30,
		updatedAt: '2026-06-05T10:00:00.000Z',
		boxes: [
			{
				index: 0,
				name: 'Box 01',
				slots: Array.from({ length: 30 }, (_, slot) => ({
					box: 0,
					slot,
					pokemon: slot === 0 ? storedAron : slot === 4 ? storedZubat : null
				}))
			}
		]
	};
}

describe('storage workbench panes', () => {
	it('adds, switches, closes, and cycles independent panes', () => {
		const panes = [
			createBoxPane('pane-save', saveSource, { boxCount: 14 }),
			createBoxPane('pane-storage', storageSource, { boxCount: 8 })
		];

		expect(panes[0].activeBox).toBe(0);
		expect(panes[1].boxCount).toBe(8);
		expect(movePaneFocus(panes, 'pane-save', 'next')).toBe('pane-storage');
		expect(movePaneFocus(panes, 'pane-save', 'previous')).toBe('pane-storage');

		const focusedPanes = [
			panes[0],
			{ ...panes[1], activeBox: 6, focus: { zone: 'box' as const, slot: 23 } }
		];
		const switched = switchPaneSource(focusedPanes, 'pane-storage', saveSource, 4);
		expect(switched[1].source.type).toBe('save-file');
		expect(switched[1]).toMatchObject({
			boxCount: 4,
			activeBox: 3,
			focus: { zone: 'box', slot: 23 }
		});

		const added = addBoxPane(switched, storageSource, { id: 'pane-storage-2' });
		expect(added).toHaveLength(3);
		expect(closeBoxPane(added, 'pane-save').map((pane) => pane.id)).toEqual([
			'pane-storage',
			'pane-storage-2'
		]);
	});

	it('keeps the final pane open when close is requested', () => {
		const panes = [createBoxPane('pane-save', saveSource)];

		expect(closeBoxPane(panes, 'pane-save')).toHaveLength(1);
	});

	it('moves a closed pane coordinate to the survivor current Location and clamps it', () => {
		const closing = createBoxPane('pane-storage', storageSource, {
			focus: { zone: 'box', slot: 29 }
		});
		const partySurvivor = createBoxPane('pane-save', saveSource, {
			focus: { zone: 'party', slot: 5 }
		});

		expect(focusSurvivingPaneAfterClose(closing, partySurvivor)).toEqual({
			zone: 'party',
			slot: 5
		});
		expect(focusSurvivingPaneAfterClose(closing, partySurvivor, { partyAvailable: false })).toEqual(
			{ zone: 'box', slot: 29 }
		);

		const switched = switchPaneSource([partySurvivor], 'pane-save', storageSource, 8);
		expect(switched[0].focus).toEqual({ zone: 'box', slot: 8 });
	});

	it('refreshes save pane workspace caches after a slot mutation', () => {
		const panes = [
			createBoxPane('pane-save', saveSource, { boxCount: 14 }),
			createBoxPane('pane-storage', storageSource, { boxCount: 8 })
		];
		const staleState = {
			file: { id: 'save-1', originalFileName: 'emerald.sav' },
			workspace: { summary: { boxCount: 14 } },
			dirty: false
		};
		const nextState = {
			file: { id: 'save-1', originalFileName: 'emerald-edited.sav' },
			workspace: { summary: { boxCount: 15 } },
			dirty: true
		};

		const refreshed = refreshSaveFilePaneWorkspaces(
			panes,
			{ 'pane-save': { state: staleState, loadedBox: 0 } },
			nextState,
			2
		);

		expect(refreshed.workspaces['pane-save']).toEqual({ state: nextState, loadedBox: 2 });
		expect(refreshed.panes[0]).toMatchObject({
			boxCount: 15,
			source: { label: 'emerald-edited.sav', dirty: true }
		});
		expect(refreshed.panes[1]).toEqual(panes[1]);
	});

	it('preserves duplicate pane identities and their own box projections after publication', () => {
		const panes = [
			createBoxPane('pane-a', saveSource, { activeBox: 2, boxCount: 14 }),
			createBoxPane('pane-b', saveSource, { activeBox: 7, boxCount: 14 })
		];
		const stateForBox = (box: number) => ({
			file: { id: 'save-1', originalFileName: 'emerald.sav' },
			workspace: { summary: { boxCount: 14 } },
			dirty: true,
			box
		});
		const states = new Map([
			['pane-a', { state: stateForBox(2), loadedBox: 2 }],
			['pane-b', { state: stateForBox(7), loadedBox: 7 }]
		]);

		const refreshed = refreshSaveFilePaneWorkspaces(
			panes,
			{},
			stateForBox(2),
			(pane) => states.get(pane.id)!
		);

		expect(refreshed.panes.map(({ id, activeBox }) => ({ id, activeBox }))).toEqual([
			{ id: 'pane-a', activeBox: 2 },
			{ id: 'pane-b', activeBox: 7 }
		]);
		expect(refreshed.workspaces['pane-a']).toMatchObject({ loadedBox: 2, state: { box: 2 } });
		expect(refreshed.workspaces['pane-b']).toMatchObject({ loadedBox: 7, state: { box: 7 } });
	});
});

describe('pokemon storage slot operations', () => {
	it('removes the source when moving pokemon between empty storage slots', () => {
		const result = applyPokemonStorageSlotOperation(storageFixture(), {
			kind: 'move',
			source: { zone: 'box', box: 0, slot: 0 },
			destination: { zone: 'box', box: 0, slot: 1 },
			pokemon: storedAron
		});

		const slots = result.boxes[0].slots;
		expect(slots[0].pokemon).toBeNull();
		expect(slots[1].pokemon?.label).toBe('ARON');
	});

	it('swaps occupied storage slots when moving onto another pokemon', () => {
		const result = applyPokemonStorageSlotOperation(storageFixture(), {
			kind: 'move',
			source: { zone: 'box', box: 0, slot: 0 },
			destination: { zone: 'box', box: 0, slot: 4 },
			pokemon: storedAron
		});

		const slots = result.boxes[0].slots;
		expect(slots[0].pokemon?.label).toBe('ZUBAT');
		expect(slots[4].pokemon?.label).toBe('ARON');
	});

	it('leaves the source alone when copying between storage slots', () => {
		const result = applyPokemonStorageSlotOperation(storageFixture(), {
			kind: 'copy',
			source: { zone: 'box', box: 0, slot: 0 },
			destination: { zone: 'box', box: 0, slot: 1 },
			pokemon: storedAron
		});

		const slots = result.boxes[0].slots;
		expect(slots[0].pokemon?.label).toBe('ARON');
		expect(slots[1].pokemon?.label).toBe('ARON');
	});
});

describe('storage workbench carry contract', () => {
	it('creates carry state from an occupied source and toggles copy semantics', () => {
		const pane = createBoxPane('pane-save', saveSource, { boxCount: 14 });
		const carry = createCarryState({
			pane,
			slot: aron,
			source: slotRef('pane-save', 0),
			now: () => '2026-06-05T10:00:00.000Z',
			originGame: 'Pokemon Emerald',
			spriteUrl: '/sprites/304.png'
		});

		expect(carry?.mode).toBe('move');
		expect(carry?.pokemonLabel).toBe('ARON');
		expect(carry?.spriteUrl).toBe('/sprites/304.png');
		expect(carry?.origin).toMatchObject({
			entryMode: 'moved-in',
			originSaveFileName: 'emerald.sav',
			originGame: 'Pokemon Emerald',
			originalTrainer: 'RAJ'
		});

		expect(toggleCarryMode(carry!)).toMatchObject({
			mode: 'copy',
			spriteUrl: '/sprites/304.png',
			origin: { entryMode: 'copied-in' }
		});
	});

	it('returns null when lifting an empty source slot', () => {
		expect(
			createCarryState({
				pane: createBoxPane('pane-save', saveSource),
				slot: emptySlot,
				source: slotRef('pane-save', 3)
			})
		).toBeNull();
	});

	it('evaluates a save to storage move as dirty save mutation plus auto-saved storage insert', () => {
		const sourcePane = createBoxPane('pane-save', saveSource, { boxCount: 14 });
		const destinationPane = createBoxPane('pane-storage', storageSource, { boxCount: 8 });
		const carry = createCarryState({
			pane: sourcePane,
			slot: aron,
			source: slotRef(sourcePane.id, 0)
		})!;

		const result = evaluateDestination({
			carry,
			destinationPane,
			destination: slotRef(destinationPane.id, 4),
			destinationSlot: emptySlot
		});

		expect(result.valid).toBe(true);
		expect(result.consequence).toBe('Move ARON -> Pokemon Storage - Box 01 Slot 05');
		expect(destinationStateForEvaluation(result)).toBe('valid');
		expect(result.mutations).toEqual([
			{
				owner: 'pokemon-storage',
				paneId: 'pane-storage',
				sourceType: 'pokemon-storage',
				mutation: 'insert',
				autoSaved: true
			},
			{
				owner: 'save-file',
				paneId: 'pane-save',
				sourceType: 'save-file',
				mutation: 'clear',
				requiresBackup: true,
				dirtiesWorkspace: true
			}
		]);
	});

	it('blocks copy onto an occupied destination and marks it invalid', () => {
		const sourcePane = createBoxPane('pane-storage', storageSource, { boxCount: 8 });
		const destinationPane = createBoxPane('pane-save', saveSource, { boxCount: 14 });
		const carry = createCarryState({
			mode: 'copy',
			pane: sourcePane,
			slot: aron,
			source: slotRef(sourcePane.id, 0)
		})!;

		const result = evaluateDestination({
			carry,
			destinationPane,
			destination: slotRef(destinationPane.id, 1),
			destinationSlot: { ...aron, slot: 1, label: 'ZUBAT' }
		});

		expect(result.valid).toBe(false);
		expect(destinationStateForEvaluation(result)).toBe('invalid');
		expect(result.consequence).toBe('Choose an empty Slot or switch to Move.');
	});

	it('blocks storage to save moves onto occupied destinations', () => {
		const sourcePane = createBoxPane('pane-storage', storageSource, { boxCount: 8 });
		const destinationPane = createBoxPane('pane-save', saveSource, { boxCount: 14 });
		const carry = createCarryState({
			pane: sourcePane,
			slot: aron,
			source: slotRef(sourcePane.id, 0)
		})!;

		const result = evaluateDestination({
			carry,
			destinationPane,
			destination: slotRef(destinationPane.id, 1),
			destinationSlot: { ...aron, slot: 1, label: 'ZUBAT' }
		});

		expect(result.valid).toBe(false);
		expect(destinationStateForEvaluation(result)).toBe('invalid');
		expect(result.consequence).toBe(
			'Choose an empty Save File Slot before moving from Pokemon Storage.'
		);
	});
});

describe('source picker cards', () => {
	it('includes Pokemon Storage with app-owned metadata before save files', () => {
		const cards = createSourcePickerCards({
			saveFiles: [
				{
					id: 'save-1',
					fileName: 'emerald.sav',
					gameLabel: 'Pokemon Emerald',
					boxCount: 14,
					pokemonCount: 175,
					active: true
				}
			]
		});

		expect(cards[0]).toMatchObject({
			id: 'pokemon-storage',
			label: 'Pokemon Storage',
			metadata: 'Automatically saved by PKSX',
			treatment: 'app-owned'
		});
		expect(cards[1]).toMatchObject({
			label: 'emerald.sav',
			metadata: 'Pokemon Emerald · 14 boxes · 175 Pokemon · active',
			active: true
		});
	});
});
