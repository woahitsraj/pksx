import { describe, expect, test } from 'vitest';
import type { BoxSlotSummary, SaveSlotRef } from './types';
import colosseumFixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/colosseum/011020251345.gci?url';
import fixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/emerald-011020251345.sav?url';
import moonFixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/moon/011020252257.sav?url';
import sunMoonDemoFixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/sun-moon-demo/181020251439.sav?url';
import ultraMoonFixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/ultra-moon/011020252224.sav?url';
import ultraSunFixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/ultra-sun/011020252224.sav?url';
import xFixtureUrl from '../../../test-fixtures/save-files/bl1ndbeholder-pokemon-saves/x/011020252224.sav?url';
import pocketMonstersWhite2JpFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/nds/pocket-monsters-white-2-jp.sav?url';
import heartGoldFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/nds/pokemon-heartgold.sav?url';
import platinumEuFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/nds/pokemon-platinum-eu.sav?url';
import white2FixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/nds/pokemon-white-2.sav?url';
import whiteFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/nds/pokemon-white.sav?url';
import legendsArceusFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/switch/pokemon-legends-arceus-2025-03-24-main.sav?url';
import letsGoEeveeFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/switch/pokemon-lets-go-eevee-2025-03-24-savedata.bin?url';
import scarletFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/switch/pokemon-scarlet-2025-03-24-main.sav?url';
import swordFixtureUrl from '../../../test-fixtures/save-files/raj-pokemon-save-backups/switch/pokemon-sword-2025-03-24-main.sav?url';
import { createPkhexEngine } from './pkhex-engine';

const supportedFixtureCases = [
	{ name: 'Emerald', fileName: '011020251345.sav', url: fixtureUrl, byteLength: 131088 },
	{ name: 'Colosseum', fileName: '011020251345.gci', url: colosseumFixtureUrl, byteLength: 393280 },
	{ name: 'X', fileName: '011020252224', url: xFixtureUrl, byteLength: 415232 },
	{ name: 'Moon', fileName: '011020252257', url: moonFixtureUrl, byteLength: 441856 },
	{
		name: 'Sun/Moon demo',
		fileName: '181020251439',
		url: sunMoonDemoFixtureUrl,
		byteLength: 441856
	},
	{ name: 'Ultra Sun', fileName: '011020252224', url: ultraSunFixtureUrl, byteLength: 445440 },
	{ name: 'Ultra Moon', fileName: '011020252224', url: ultraMoonFixtureUrl, byteLength: 445440 }
] as const;

const rajSaveFixtureCases = [
	{
		name: 'HeartGold',
		fileName: 'pokemon-heartgold.sav',
		url: heartGoldFixtureUrl,
		byteLength: 524288,
		generation: 4
	},
	{
		name: 'Platinum EU',
		fileName: 'pokemon-platinum-eu.sav',
		url: platinumEuFixtureUrl,
		byteLength: 524288,
		generation: 4
	},
	{
		name: 'White',
		fileName: 'pokemon-white.sav',
		url: whiteFixtureUrl,
		byteLength: 524288,
		generation: 5
	},
	{
		name: 'White 2',
		fileName: 'pokemon-white-2.sav',
		url: white2FixtureUrl,
		byteLength: 524288,
		generation: 5
	},
	{
		name: 'Pocket Monsters White 2 JP',
		fileName: 'pocket-monsters-white-2-jp.sav',
		url: pocketMonstersWhite2JpFixtureUrl,
		byteLength: 524288,
		generation: 5
	},
	{
		name: 'Sword',
		fileName: 'pokemon-sword-2025-03-24-main.sav',
		url: swordFixtureUrl,
		byteLength: 1603146,
		generation: 8
	},
	{
		name: "Let's Go Eevee",
		fileName: 'pokemon-lets-go-eevee-2025-03-24-savedata.bin',
		url: letsGoEeveeFixtureUrl,
		byteLength: 1048576,
		generation: 7
	},
	{
		name: 'Legends Arceus',
		fileName: 'pokemon-legends-arceus-2025-03-24-main.sav',
		url: legendsArceusFixtureUrl,
		byteLength: 1289478,
		generation: 8
	},
	{
		name: 'Scarlet',
		fileName: 'pokemon-scarlet-2025-03-24-main.sav',
		url: scarletFixtureUrl,
		byteLength: 4435304,
		generation: 9
	}
] as const;

describe('PKHeX Engine browser runtime smoke', () => {
	test('parses the Emerald Save File fixture through the published browser-wasm bundle', async () => {
		expect.assertions(17);

		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());

		const version = await engine.getVersion();
		expect(version).toMatchObject({
			ok: true,
			value: { pkhexCoreVersion: expect.stringMatching(/^26\.5\.5\./) }
		});

		const save = await engine.summarizeSave(fixtureBytes, '011020251345.sav');
		expect(save).toStrictEqual({
			ok: true,
			value: {
				fileName: '011020251345.sav',
				saveType: 'SAV3E',
				gameVersion: 'E',
				gameVersionId: 3,
				generation: 3,
				trainerName: 'DIXIE',
				trainerId: expect.any(Number),
				playTime: expect.any(String),
				playedHours: expect.any(Number),
				playedMinutes: expect.any(Number),
				partyCount: 5,
				boxCount: 14,
				boxSlotCount: 30
			},
			error: null
		});

		const slots = await engine.listBoxSlots(fixtureBytes, '011020251345.sav', 0);
		expect(slots.ok).toBe(true);
		if (!slots.ok) {
			throw new Error('Expected fixture box slot summary to succeed.');
		}

		expect(slots.value).toHaveLength(30);
		expect(slots.value[0]).toMatchObject({
			box: 0,
			slot: 0,
			speciesId: 304,
			form: 0,
			format: 3,
			level: 11,
			nickname: 'ARON',
			isEgg: false,
			isEmpty: false
		});
		expect(slots.value[0]).toMatchObject({
			types: expect.arrayContaining([expect.objectContaining({ name: expect.any(String) })]),
			stats: expect.arrayContaining([
				expect.objectContaining({ key: 'HP', value: expect.any(Number) })
			]),
			moves: expect.arrayContaining([expect.objectContaining({ name: expect.any(String) })])
		});
		expect(slots.value[1]).toMatchObject({
			box: 0,
			slot: 1,
			speciesId: 314,
			form: 0,
			format: 3,
			level: 14,
			nickname: 'ILLUMISE',
			isEgg: false,
			isEmpty: false
		});
		expect(slots.value[2]).toMatchObject({
			box: 0,
			slot: 2,
			speciesId: 0,
			level: 0,
			isEmpty: true
		});
		expect(slots.value[29]).toMatchObject({ box: 0, slot: 29 });
		expect(fixtureBytes.byteLength).toBe(131088);

		const legality = await engine.checkSlotLegality(fixtureBytes, '011020251345.sav', {
			zone: 'box',
			box: 0,
			slot: 0
		});
		expect(legality.ok, JSON.stringify(legality.error)).toBe(true);
		if (!legality.ok) {
			throw new Error('Expected fixture legality report to succeed.');
		}
		expect(legality.value.messages.length).toBeGreaterThan(0);
		expect(legality.value.messages[0].message).toContain(': ');
		expect(legality.value.messages[0].message).not.toMatch(/CheckResult\\s*\\{|Result\\s*=/);

		const workspace = await engine.loadSaveWorkspace(fixtureBytes, '011020251345.sav', 0);
		expect(workspace).toMatchObject({
			ok: true,
			value: {
				summary: { saveType: 'SAV3E', partyCount: 5, boxCount: 14 },
				partySlots: expect.arrayContaining([
					expect.objectContaining({ slot: 0, speciesId: expect.any(Number) })
				]),
				boxSlots: expect.arrayContaining([
					expect.objectContaining({ box: 0, slot: 0, speciesId: 304 })
				])
			}
		});

		const serialized = await engine.serializeSave(fixtureBytes, '011020251345.sav');
		expect(serialized).toMatchObject({
			ok: true,
			value: { byteLength: 131088 }
		});
		if (!serialized.ok) {
			throw new Error('Expected fixture serialization to succeed.');
		}
		expect(serialized.value.bytesBase64.length).toBeGreaterThan(0);
	});

	test('projects and applies trainer, money, and inventory edits through PKHeX.Core', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const loaded = await engine.loadSaveWorkspace(fixtureBytes, '011020251345.sav', 0);
		if (!loaded.ok || !loaded.value.saveFile) throw new Error('Expected Save File projection.');

		const projection = loaded.value.saveFile;
		expect(projection.trainerProfile).toMatchObject({
			trainerName: 'DIXIE',
			trainerNameSupported: true,
			genderSupported: true
		});
		expect(projection.money).toMatchObject({ supported: true, min: 0 });
		expect(projection.inventory.supported).toBe(true);

		const catalogue = await engine.getSaveFileInventoryCatalogue(fixtureBytes, '011020251345.sav');
		if (!catalogue.ok) throw new Error('Expected an inventory catalogue.');
		expect(catalogue.value.supported).toBe(true);
		const availableFor = (key: string) =>
			catalogue.value.pockets.find((entry) => entry.key === key)?.availableItems ?? [];

		const pocket = projection.inventory.pockets.find(
			(candidate) =>
				!candidate.full &&
				candidate.items.some((item) => item.maxQuantity > 1) &&
				availableFor(candidate.key).some(
					(option) => !candidate.items.some((item) => item.id === option.id)
				)
		);
		if (!pocket) throw new Error('Expected an editable Emerald inventory pocket.');
		const existing = pocket.items.find((item) => item.maxQuantity > 1);
		const added = availableFor(pocket.key).find(
			(option) => !pocket.items.some((item) => item.id === option.id)
		);
		if (!existing || !added) throw new Error('Expected editable Emerald items.');

		const nextQuantity = existing.quantity < existing.maxQuantity ? existing.quantity + 1 : 1;
		const nextMoney =
			projection.money.value === projection.money.max
				? projection.money.max - 1
				: (projection.money.value ?? 0) + 1;
		const nextGender = projection.trainerProfile.gender === 'male' ? 'female' : 'male';
		const edited = await engine.applySaveFileEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				trainerProfile: { trainerName: 'RAJ', gender: nextGender },
				money: nextMoney,
				inventory: [
					{
						kind: 'set',
						pocket: pocket.key,
						itemId: existing.id,
						quantity: nextQuantity
					},
					{ kind: 'add', pocket: pocket.key, itemId: added.id, quantity: 1 }
				]
			},
			0
		);
		if (!edited.ok || !edited.value.workspace.saveFile) throw new Error('Expected edits to apply.');

		const updated = edited.value.workspace.saveFile;
		expect(edited.value.mutated).toBe(true);
		expect(updated.trainerProfile).toMatchObject({ trainerName: 'RAJ', gender: nextGender });
		expect(updated.money.value).toBe(nextMoney);
		expect(
			updated.inventory.pockets.find((candidate) => candidate.key === pocket.key)?.items
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: existing.id, quantity: nextQuantity }),
				expect.objectContaining({ id: added.id, quantity: 1 })
			])
		);

		const removed = await engine.applySaveFileEditOperation(
			edited.value.bytes,
			'011020251345.sav',
			{ inventory: [{ kind: 'remove', pocket: pocket.key, itemId: added.id }] },
			0
		);
		if (!removed.ok || !removed.value.workspace.saveFile)
			throw new Error('Expected remove to apply.');
		expect(
			removed.value.workspace.saveFile.inventory.pockets
				.find((candidate) => candidate.key === pocket.key)
				?.items.some((item) => item.id === added.id)
		).toBe(false);

		const invalid = await engine.applySaveFileEditOperation(
			fixtureBytes,
			'011020251345.sav',
			{ money: projection.money.max + 1 },
			0
		);
		expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-save-file-edit' } });
		expect(fixtureBytes).toEqual(new Uint8Array(await (await fetch(fixtureUrl)).arrayBuffer()));
	});

	test.each(supportedFixtureCases)(
		'parses and loads the $name Save File fixture',
		async (fixture) => {
			const [engine, fixtureResponse] = await Promise.all([
				createPkhexEngine('/pkhex-engine'),
				fetch(fixture.url)
			]);
			const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
			expect(fixtureBytes.byteLength).toBe(fixture.byteLength);

			const summary = await engine.summarizeSave(fixtureBytes, fixture.fileName);
			expect(summary.ok, JSON.stringify(summary.error)).toBe(true);
			if (!summary.ok) {
				throw new Error(`Expected ${fixture.name} summary to succeed.`);
			}
			expect(summary.value.boxCount).toBeGreaterThan(0);
			expect(summary.value.generation).toBeGreaterThan(0);

			const workspace = await engine.loadSaveWorkspace(fixtureBytes, fixture.fileName, 0);
			expect(workspace.ok, JSON.stringify(workspace.error)).toBe(true);
			if (!workspace.ok) {
				throw new Error(`Expected ${fixture.name} workspace load to succeed.`);
			}
			expect(workspace.value.summary.saveType).toBe(summary.value.saveType);
			expect(workspace.value.boxSlots.length).toBeGreaterThan(0);
		}
	);

	test('projects and applies Affection only for a supporting Pokemon format', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(xFixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const workspace = await engine.loadSaveWorkspace(fixtureBytes, '011020252224', 0);
		expect(workspace.ok, JSON.stringify(workspace.error)).toBe(true);
		if (!workspace.ok) throw new Error('Expected Pokemon X workspace to load.');

		const partySlot = workspace.value.partySlots.find((candidate) => !candidate.isEmpty);
		const boxSlot = workspace.value.boxSlots.find((candidate) => !candidate.isEmpty);
		const slot = partySlot ?? boxSlot;
		const affection = slot?.friendshipEditConstraints.fields.find(
			(field) => field.key === 'affection'
		);
		if (!slot || !affection) throw new Error('Expected an Affection-capable Pokemon.');
		const value = affection.value === 255 ? 254 : affection.value + 1;
		const edited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020252224',
			{
				source: partySlot
					? { zone: 'party', slot: partySlot.slot }
					: { zone: 'box', box: boxSlot!.box, slot: boxSlot!.slot },
				friendshipEdits: [{ key: 'affection', value }]
			},
			0
		);

		expect(edited.ok, JSON.stringify(edited.error)).toBe(true);
		if (!edited.ok) throw new Error('Expected Affection edit to succeed.');
		const updatedSlot = partySlot
			? edited.value.workspace.partySlots[partySlot.slot]
			: edited.value.workspace.boxSlots[boxSlot!.slot];
		expect(updatedSlot?.friendshipEditConstraints.fields).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'affection', value })])
		);
	});

	test.each(rajSaveFixtureCases)(
		"parses and loads Raj's $name Save File fixture",
		async (fixture) => {
			const [engine, fixtureResponse] = await Promise.all([
				createPkhexEngine('/pkhex-engine'),
				fetch(fixture.url)
			]);
			const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
			expect(fixtureBytes.byteLength).toBe(fixture.byteLength);

			const summary = await engine.summarizeSave(fixtureBytes, fixture.fileName);
			expect(summary.ok, JSON.stringify(summary.error)).toBe(true);
			if (!summary.ok) {
				throw new Error(`Expected ${fixture.name} summary to succeed.`);
			}
			expect(summary.value.generation).toBe(fixture.generation);
			expect(summary.value.boxCount).toBeGreaterThan(0);
			expect(summary.value.boxSlotCount).toBeGreaterThan(0);

			const workspace = await engine.loadSaveWorkspace(fixtureBytes, fixture.fileName, 0);
			expect(workspace.ok, JSON.stringify(workspace.error)).toBe(true);
			if (!workspace.ok) {
				throw new Error(`Expected ${fixture.name} workspace load to succeed.`);
			}
			expect(workspace.value.summary.saveType).toBe(summary.value.saveType);
			expect(workspace.value.summary.gameVersion).toBe(summary.value.gameVersion);
			expect(workspace.value.boxSlots).toHaveLength(summary.value.boxSlotCount);

			const serialized = await engine.serializeSave(fixtureBytes, fixture.fileName);
			expect(serialized.ok, JSON.stringify(serialized.error)).toBe(true);
			if (!serialized.ok) {
				throw new Error(`Expected ${fixture.name} serialization to succeed.`);
			}
			expect(serialized.value.byteLength).toBeGreaterThan(0);
		}
	);

	test('previews and applies a Pokemon evolution through the browser-wasm bundle', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const originalBytes = copyBytes(fixtureBytes);
		const source = { zone: 'box' as const, box: 0, slot: 0 };

		const preview = await engine.previewPokemonActions(fixtureBytes, '011020251345.sav', source);
		expect(preview.ok, JSON.stringify(preview.error)).toBe(true);
		if (!preview.ok) throw new Error('Expected Pokemon Action preview to succeed.');

		const evolve = preview.value.actions.find((action) => action.kind === 'evolve');
		const lairon = evolve?.choices.find((choice) => choice.speciesId === 305);
		expect(evolve).toMatchObject({ available: true });
		expect(lairon).toMatchObject({
			speciesName: 'Lairon',
			changes: expect.arrayContaining([
				expect.objectContaining({ field: 'Species', before: 'Aron', after: 'Lairon' })
			])
		});
		expect(fixtureBytes).toEqual(originalBytes);

		const applied = await engine.applyPokemonAction(
			fixtureBytes,
			'011020251345.sav',
			{ kind: 'evolve', source, choiceId: lairon?.id },
			0
		);
		expect(applied.ok, JSON.stringify(applied.error)).toBe(true);
		if (!applied.ok) throw new Error('Expected Pokemon evolution to succeed.');
		expect(applied.value).toMatchObject({
			mutated: true,
			workspace: {
				boxSlots: expect.arrayContaining([
					expect.objectContaining({ box: 0, slot: 0, speciesId: 305, level: 32 })
				])
			},
			changes: expect.arrayContaining([
				expect.objectContaining({ field: 'Species', before: 'Aron', after: 'Lairon' })
			])
		});
		expect(applied.value.bytes).not.toEqual(originalBytes);
		expect(fixtureBytes).toEqual(originalBytes);

		const slots = await engine.listBoxSlots(fixtureBytes, '011020251345.sav', 0);
		if (!slots.ok || !slots.value[0]?.entityBytesBase64) {
			throw new Error('Expected stored Pokemon entity data.');
		}
		const storedPreview = await engine.previewStoredPokemonActions(
			slots.value[0].entityBytesBase64
		);
		if (!storedPreview.ok) throw new Error('Expected stored Pokemon Action preview to succeed.');
		const storedChoice = storedPreview.value.actions
			.find((action) => action.kind === 'evolve')
			?.choices.find((choice) => choice.speciesId === 305);
		const storedApplied = await engine.applyStoredPokemonAction(slots.value[0].entityBytesBase64, {
			kind: 'evolve',
			choiceId: storedChoice?.id
		});
		expect(storedApplied.ok, JSON.stringify(storedApplied.error)).toBe(true);
		if (!storedApplied.ok) throw new Error('Expected stored Pokemon evolution to succeed.');
		expect(storedApplied.value).toMatchObject({
			mutated: true,
			projection: { speciesId: 305, level: 32 },
			changes: expect.arrayContaining([
				expect.objectContaining({ field: 'Species', before: 'Aron', after: 'Lairon' })
			])
		});
		expect(storedApplied.value.entityBytesBase64).not.toBe(slots.value[0].entityBytesBase64);
	});

	test('exposes and applies one targeted move legality fix through the browser-wasm bundle', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(platinumEuFixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const originalBytes = copyBytes(fixtureBytes);
		const source = { zone: 'box' as const, box: 2, slot: 18 };
		const workspace = await engine.loadSaveWorkspace(fixtureBytes, 'pokemon-platinum-eu.sav', 2);
		expect(workspace.ok, JSON.stringify(workspace.error)).toBe(true);
		if (!workspace.ok) throw new Error('Expected Platinum workspace to load.');
		const original = workspace.value.boxSlots[18];
		expect(original).toMatchObject({ nickname: 'MEW' });
		if (!original) throw new Error('Expected the Platinum MEW fixture Slot.');

		const preview = await engine.previewPokemonActions(
			fixtureBytes,
			'pokemon-platinum-eu.sav',
			source
		);
		expect(preview.ok, JSON.stringify(preview.error)).toBe(true);
		if (!preview.ok) throw new Error('Expected targeted legality preview to succeed.');
		const moveFix = preview.value.actions
			.find((action) => action.kind === 'legality-fix')
			?.fixes.find((fix) => fix.id === 'move-set');
		expect(moveFix).toMatchObject({ id: 'move-set', label: 'Move Set' });
		expect(moveFix?.token).toMatch(/^move-set:[0-9a-f]{32}$/);
		if (!moveFix) throw new Error('Expected a targeted Move Set fix.');
		const moveLine = [
			...preview.value.legalityReport.warnings,
			...preview.value.legalityReport.messages
		].find((line) => line.fixId === 'move-set');
		expect(moveLine).toMatchObject({ fixId: 'move-set' });
		expect(moveLine?.severity).not.toBe('Valid');

		const unknownInput = copyBytes(fixtureBytes);
		const unknown = await engine.applyPokemonAction(
			unknownInput,
			'pokemon-platinum-eu.sav',
			{ kind: 'legality-fix', source, choiceId: `move-set:${'0'.repeat(32)}` },
			2
		);
		expect(unknown).toMatchObject({
			ok: false,
			error: {
				code: 'unsupported-pokemon-action',
				message:
					'This Quick Fix preview is no longer available. Refresh the Legality Report and try again.'
			}
		});
		expect(unknownInput).toEqual(originalBytes);
		expect(fixtureBytes).toEqual(originalBytes);

		const applied = await engine.applyPokemonAction(
			fixtureBytes,
			'pokemon-platinum-eu.sav',
			{ kind: 'legality-fix', source, choiceId: moveFix.token },
			2
		);
		expect(applied.ok, JSON.stringify(applied.error)).toBe(true);
		if (!applied.ok) throw new Error('Expected targeted Move Set fix to succeed.');
		const appliedSlot = applied.value.workspace.boxSlots[18];
		if (!appliedSlot) throw new Error('Expected the fixed Platinum MEW Slot.');
		expect(applied.value.changes).toEqual(moveFix.changes);
		expect(moveFix.changes).toEqual([
			{
				field: 'Moves',
				before: original.moves.map((move) => move.name).join(', '),
				after: appliedSlot.moves.map((move) => move.name).join(', ')
			}
		]);
		expect(pokemonActionUnrelatedProjection(applied.value.workspace.boxSlots[18])).toEqual(
			pokemonActionUnrelatedProjection(original)
		);
		expect(applied.value.bytes).not.toEqual(originalBytes);
		expect(fixtureBytes).toEqual(originalBytes);

		// Discard the first result as if persistence failed, then retry the same preview and source.
		const retried = await engine.applyPokemonAction(
			fixtureBytes,
			'pokemon-platinum-eu.sav',
			{ kind: 'legality-fix', source, choiceId: moveFix.token },
			2
		);
		expect(retried.ok, JSON.stringify(retried.error)).toBe(true);
		if (!retried.ok) throw new Error('Expected the targeted Move Set fix retry to succeed.');
		expect(retried.value).toEqual(applied.value);
		expect(fixtureBytes).toEqual(originalBytes);

		const fixedPreview = await engine.previewPokemonActions(
			applied.value.bytes,
			'pokemon-platinum-eu.sav',
			source
		);
		expect(fixedPreview.ok, JSON.stringify(fixedPreview.error)).toBe(true);
		if (!fixedPreview.ok) throw new Error('Expected fixed Move Set preview to succeed.');
		expect(
			fixedPreview.value.actions
				.find((action) => action.kind === 'legality-fix')
				?.fixes.some((fix) => fix.id === 'move-set')
		).toBe(false);

		const staleInput = copyBytes(applied.value.bytes);
		const staleOriginal = copyBytes(staleInput);
		const stale = await engine.applyPokemonAction(
			staleInput,
			'pokemon-platinum-eu.sav',
			{ kind: 'legality-fix', source, choiceId: moveFix?.token },
			2
		);
		expect(stale).toMatchObject({
			ok: false,
			error: {
				code: 'stale-pokemon-action-preview',
				message:
					'This Pokemon changed after the Quick Fix preview. Refresh the Legality Report and try again.'
			}
		});
		expect(staleInput).toEqual(staleOriginal);
	});

	test('applies Save File slot operations through the browser-wasm bundle', async () => {
		expect.assertions(13);

		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());

		const moved = await engine.applySlotOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				kind: 'move',
				source: { zone: 'box', box: 0, slot: 0 },
				destination: { zone: 'box', box: 0, slot: 2 }
			},
			0
		);
		expect(moved.ok).toBe(true);
		if (!moved.ok) throw new Error('Expected move to succeed.');
		expect(moved.value.mutated).toBe(true);
		expect(moved.value.workspace.boxSlots[0]).toMatchObject({ slot: 0, isEmpty: true });
		expect(moved.value.workspace.boxSlots[2]).toMatchObject({ slot: 2, nickname: 'ARON' });

		const copied = await engine.applySlotOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				kind: 'copy',
				source: { zone: 'box', box: 0, slot: 0 },
				destination: { zone: 'box', box: 0, slot: 2 }
			},
			0
		);
		expect(copied.ok).toBe(true);
		if (!copied.ok) throw new Error('Expected copy to succeed.');
		expect(copied.value.mutated).toBe(true);
		expect(copied.value.workspace.boxSlots[0]).toMatchObject({ slot: 0, nickname: 'ARON' });
		expect(copied.value.workspace.boxSlots[2]).toMatchObject({ slot: 2, nickname: 'ARON' });

		const cleared = await engine.applySlotOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				kind: 'clear',
				source: { zone: 'box', box: 0, slot: 0 }
			},
			0
		);
		expect(cleared.ok).toBe(true);
		if (!cleared.ok) throw new Error('Expected clear to succeed.');
		expect(cleared.value.mutated).toBe(true);
		expect(cleared.value.workspace.boxSlots[0]).toMatchObject({ slot: 0, isEmpty: true });

		const occupiedCopy = await engine.applySlotOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				kind: 'copy',
				source: { zone: 'box', box: 0, slot: 0 },
				destination: { zone: 'box', box: 0, slot: 1 }
			},
			0
		);
		expect(occupiedCopy).toMatchObject({
			ok: false,
			error: { code: 'occupied-destination-slot' }
		});

		const emptySource = await engine.applySlotOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				kind: 'move',
				source: { zone: 'box', box: 0, slot: 2 },
				destination: { zone: 'box', box: 0, slot: 3 }
			},
			0
		);
		expect(emptySource).toMatchObject({
			ok: false,
			error: { code: 'empty-source-slot' }
		});
	});

	test('creates a Pokemon in an empty Save File Slot through the browser-wasm bundle', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const catalogue = await engine.getPokemonCreationCatalogue(
			copyBytes(fixtureBytes),
			'011020251345.sav'
		);
		expect(catalogue.ok).toBe(true);
		if (!catalogue.ok) throw new Error('Expected a Create Pokemon catalogue.');
		const defaultSpecies = catalogue.value.defaultSpecies;
		expect(defaultSpecies).not.toBeNull();
		if (!defaultSpecies) throw new Error('Expected the Save File default species.');
		expect(catalogue.value.availableSpecies).toContainEqual(defaultSpecies);
		expect(catalogue.value.availableSpecies).toContainEqual({ id: 25, name: 'Pikachu' });
		expect(catalogue.value.availableSpecies).toContainEqual({ id: 386, name: 'Deoxys' });
		expect(Math.max(...catalogue.value.availableSpecies.map(({ id }) => id))).toBe(386);

		const created = await engine.createPokemon(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				destination: { zone: 'box', box: 0, slot: 2 },
				level: 5
			},
			0
		);
		expect(created.ok).toBe(true);
		if (!created.ok) throw new Error('Expected Create Pokemon to succeed.');
		expect(created.value.mutated).toBe(true);
		expect(created.value.workspace.boxSlots[2]).toMatchObject({
			slot: 2,
			isEmpty: false,
			level: 5,
			speciesId: defaultSpecies.id
		});

		const named = await engine.createPokemon(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				destination: { zone: 'box', box: 0, slot: 2 },
				speciesId: 25,
				level: 5
			},
			0
		);
		expect(named.ok).toBe(true);
		if (!named.ok) throw new Error('Expected named Create Pokemon to succeed.');
		expect(named.value.workspace.boxSlots[2]).toMatchObject({
			nickname: 'PIKACHU',
			speciesId: 25
		});

		const occupied = await engine.createPokemon(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{ destination: { zone: 'box', box: 0, slot: 0 }, level: 5 },
			0
		);
		expect(occupied).toMatchObject({
			ok: false,
			error: { code: 'occupied-destination-slot' }
		});

		const unsupported = await engine.createPokemon(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				destination: { zone: 'box', box: 0, slot: 2 },
				speciesId: 9999,
				level: 5
			},
			0
		);
		expect(unsupported).toMatchObject({
			ok: false,
			error: { code: 'unsupported-pokemon-creation' }
		});
	});

	test('applies Save File Pokemon edits through the browser-wasm bundle', async () => {
		expect.assertions(44);

		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());

		const edited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				level: 25
			},
			0
		);
		expect(edited.ok).toBe(true);
		if (!edited.ok) throw new Error('Expected Pokemon level edit to succeed.');
		expect(edited.value.mutated).toBe(true);
		expect(edited.value.workspace.boxSlots[0]).toMatchObject({
			slot: 0,
			nickname: 'ARON',
			level: 25,
			experience: expect.any(Number),
			experienceProjection: expect.objectContaining({
				minLevel: 1,
				maxLevel: 100,
				currentLevelMinExperience: expect.any(Number)
			}),
			stats: expect.arrayContaining([
				expect.objectContaining({ key: 'HP', value: expect.any(Number) })
			])
		});
		expect(edited.value.workspace.boxSlots[0]?.experience ?? 0).toBeGreaterThan(0);
		const abilityConstraints = edited.value.workspace.boxSlots[0]?.abilityEditConstraints;
		expect(abilityConstraints).toMatchObject({
			supported: true,
			currentAbilityIndex: expect.any(Number),
			options: expect.arrayContaining([
				expect.objectContaining({
					index: expect.any(Number),
					id: expect.any(Number),
					name: expect.any(String),
					available: expect.any(Boolean)
				})
			])
		});
		const nextAbility = abilityConstraints?.options.find(
			(option) => option.available && option.index !== abilityConstraints.currentAbilityIndex
		);
		expect(nextAbility).toBeDefined();
		if (!nextAbility) throw new Error('Expected ARON to expose another legal Ability choice.');
		const abilityEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				abilityIndex: nextAbility.index
			},
			0
		);
		expect(abilityEdited.ok, JSON.stringify(abilityEdited.error)).toBe(true);
		if (!abilityEdited.ok) throw new Error('Expected Pokemon Ability edit to succeed.');
		expect(abilityEdited.value.mutated).toBe(true);
		expect(abilityEdited.value.workspace.boxSlots[0]).toMatchObject({
			ability: nextAbility.name,
			abilityEditConstraints: {
				currentAbilityIndex: nextAbility.index
			}
		});
		const abilityLegality = await engine.checkSlotLegality(
			abilityEdited.value.bytes,
			'011020251345.sav',
			{ zone: 'box', box: 0, slot: 0 }
		);
		expect(abilityLegality.ok, JSON.stringify(abilityLegality.error)).toBe(true);

		const unsupportedAbility = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				abilityIndex: 99
			},
			0
		);
		expect(unsupportedAbility).toMatchObject({
			ok: false,
			error: { code: 'unsupported-pokemon-edit' }
		});

		const invalidLevel = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				level: 101
			},
			0
		);
		expect(invalidLevel).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});

		const currentLevelMinExperience =
			edited.value.workspace.boxSlots[0]?.experienceProjection?.currentLevelMinExperience;
		if (typeof currentLevelMinExperience !== 'number') {
			throw new Error('Expected edited Pokemon experience projection to be available.');
		}
		const explicitExperience = currentLevelMinExperience + 1;
		const experienceEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				experience: explicitExperience
			},
			0
		);
		expect(experienceEdited.ok).toBe(true);
		if (!experienceEdited.ok) {
			throw new Error('Expected Pokemon experience edit to succeed.');
		}
		expect(experienceEdited.value.mutated).toBe(true);
		expect(experienceEdited.value.workspace.boxSlots[0]).toMatchObject({
			slot: 0,
			nickname: 'ARON',
			experience: explicitExperience
		});

		const nicknameEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				nickname: 'RON',
				level: 25
			},
			0
		);
		expect(nicknameEdited.ok).toBe(true);
		if (!nicknameEdited.ok) {
			throw new Error('Expected Pokemon nickname edit to succeed.');
		}
		expect(nicknameEdited.value.mutated).toBe(true);
		expect(nicknameEdited.value.workspace.boxSlots[0]).toMatchObject({
			slot: 0,
			nickname: 'RON',
			level: 25
		});

		const trainerConstraints = edited.value.workspace.boxSlots[0]?.originalTrainerEditConstraints;
		expect(trainerConstraints).toMatchObject({
			supported: true,
			currentName: expect.any(String),
			currentTrainerId: expect.any(Number),
			maxNameLength: expect.any(Number)
		});
		if (!trainerConstraints) throw new Error('Expected Original Trainer edit constraints.');

		const trainerEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				originalTrainer: {
					name: 'RAJAN',
					trainerId: trainerConstraints.currentTrainerId,
					secretId: trainerConstraints.supportsSecretId
						? trainerConstraints.currentSecretId
						: undefined,
					genderId: trainerConstraints.supportsGender
						? trainerConstraints.currentGenderId
						: undefined,
					languageId: trainerConstraints.supportsLanguage
						? trainerConstraints.currentLanguageId
						: undefined
				}
			},
			0
		);
		expect(trainerEdited.ok).toBe(true);
		if (!trainerEdited.ok) throw new Error('Expected Original Trainer data edit to succeed.');
		expect(trainerEdited.value.mutated).toBe(true);
		expect(trainerEdited.value.workspace.boxSlots[0]).toMatchObject({
			originalTrainer: 'RAJAN',
			originalTrainerEditConstraints: {
				currentName: 'RAJAN',
				currentTrainerId: trainerConstraints.currentTrainerId
			}
		});

		const invalidTrainer = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				originalTrainer: {
					name: 'ORIGINAL-TRAINER-NAME-TOO-LONG',
					trainerId: trainerConstraints.currentTrainerId
				}
			},
			0
		);
		expect(invalidTrainer).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});

		const natureConstraints = edited.value.workspace.boxSlots[0]?.natureEditConstraints;
		expect(natureConstraints).toMatchObject({
			supported: true,
			usesStatNature: false
		});
		expect(natureConstraints?.options).toHaveLength(25);
		const nature = natureConstraints?.options.find(
			(option) => option.id !== natureConstraints.currentNatureId
		);
		if (!nature) throw new Error('Expected an alternate Nature choice.');

		const natureEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				natureId: nature.id
			},
			0
		);
		expect(natureEdited.ok).toBe(true);
		if (!natureEdited.ok) throw new Error('Expected Pokemon Nature edit to succeed.');
		expect(natureEdited.value.mutated).toBe(true);
		expect(natureEdited.value.workspace.boxSlots[0]).toMatchObject({
			nature: nature.name,
			natureEditConstraints: {
				currentNatureId: nature.id,
				originalNatureId: nature.id,
				statNatureId: nature.id
			}
		});

		const invalidNature = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				natureId: 99
			},
			0
		);
		expect(invalidNature).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});

		const statEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				ivs: { HP: 31, ATK: 30, DEF: 29, SPA: 28, SPD: 27, SPE: 26 },
				evs: { HP: 252, ATK: 0, DEF: 0, SPA: 0, SPD: 4, SPE: 252 }
			},
			0
		);
		expect(statEdited.ok).toBe(true);
		if (!statEdited.ok) {
			throw new Error('Expected Pokemon stat edit to succeed.');
		}
		expect(statEdited.value.mutated).toBe(true);
		expect(statEdited.value.workspace.boxSlots[0]?.stats).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ key: 'HP', iv: 31, ev: 252 }),
				expect.objectContaining({ key: 'SPE', iv: 26, ev: 252 })
			])
		);
		expect(statEdited.value.workspace.boxSlots[0]?.statEditConstraints).toMatchObject({
			supported: true,
			maxIv: expect.any(Number),
			maxEv: expect.any(Number),
			maxTotalEv: expect.any(Number)
		});

		const firstMove = edited.value.workspace.boxSlots[0]?.moves[0];
		if (!firstMove || firstMove.id === 0 || !firstMove.pp) {
			throw new Error('Expected first move projection to include move id and PP.');
		}
		const moveEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				moves: [{ slot: 0, move: firstMove.id, pp: firstMove.pp - 1, ppUps: firstMove.ppUps ?? 0 }]
			},
			0
		);
		expect(moveEdited.ok).toBe(true);
		if (!moveEdited.ok) {
			throw new Error('Expected Pokemon Move Set edit to succeed.');
		}
		expect(moveEdited.value.mutated).toBe(true);
		expect(moveEdited.value.workspace.boxSlots[0]?.moves[0]).toMatchObject({
			id: firstMove.id,
			pp: firstMove.pp - 1
		});
		expect(moveEdited.value.workspace.boxSlots[0]?.moveSetEditConstraints).toMatchObject({
			supported: true,
			availableMoves: expect.arrayContaining([
				expect.objectContaining({ id: firstMove.id, name: firstMove.name })
			])
		});

		const friendshipField =
			edited.value.workspace.boxSlots[0]?.friendshipEditConstraints.fields.find(
				(field) => field.key === 'friendship'
			);
		if (!friendshipField) throw new Error('Expected Friendship Editing to be supported.');
		const friendship = friendshipField.value === 255 ? 254 : friendshipField.value + 1;
		const friendshipEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				friendshipEdits: [{ key: 'friendship', value: friendship }]
			},
			0
		);
		expect(friendshipEdited.ok).toBe(true);
		if (!friendshipEdited.ok) throw new Error('Expected Friendship edit to succeed.');
		expect(friendshipEdited.value.mutated).toBe(true);
		expect(friendshipEdited.value.workspace.boxSlots[0]?.friendshipEditConstraints.fields).toEqual(
			expect.arrayContaining([expect.objectContaining({ key: 'friendship', value: friendship })])
		);

		const invalidFriendship = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				friendshipEdits: [{ key: 'friendship', value: 256 }]
			},
			0
		);
		expect(invalidFriendship).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});

		const emptySource = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 2 },
				level: 20
			},
			0
		);
		expect(emptySource).toMatchObject({
			ok: false,
			error: { code: 'empty-source-slot' }
		});

		const conflictingPayload = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				level: 20,
				experience: 1000
			},
			0
		);
		expect(conflictingPayload).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});
		expect(fixtureBytes.byteLength).toBe(131088);
	});

	test('previews and applies engine-backed Species and Form edits', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const source = { zone: 'box' as const, box: 0, slot: 0 };

		const preview = await engine.previewPokemonSpeciesFormEdit(
			fixtureBytes,
			'011020251345.sav',
			source,
			305,
			0
		);
		expect(preview.ok).toBe(true);
		if (!preview.ok) throw new Error('Expected Species and Form preview to succeed.');
		expect(preview.value.availableSpecies).toContainEqual({ id: 305, name: 'Lairon' });
		expect(preview.value.availableForms).toContainEqual({ id: 0, name: 'Default' });
		expect(preview.value.preview).toMatchObject({
			speciesId: 305,
			speciesName: 'Lairon',
			form: 0,
			spriteIdentity: { speciesId: 305, form: 0 },
			legalitySummary: expect.stringContaining('PKHeX')
		});
		expect(preview.value.preview.consequences).toEqual(
			expect.arrayContaining([
				expect.stringContaining('Sprite Identity'),
				expect.stringContaining('Move Set')
			])
		);

		const edited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{ source, speciesId: 305, form: 0 },
			0
		);
		expect(edited.ok).toBe(true);
		if (!edited.ok) throw new Error('Expected Species and Form edit to succeed.');
		expect(edited.value.workspace.boxSlots[0]).toMatchObject({
			speciesId: 305,
			form: 0,
			nickname: 'LAIRON',
			spriteIdentity: { speciesId: 305, form: 0 }
		});

		const unsupportedForm = await engine.previewPokemonSpeciesFormEdit(
			fixtureBytes,
			'011020251345.sav',
			source,
			305,
			1
		);
		expect(unsupportedForm).toMatchObject({
			ok: false,
			error: { code: 'unsupported-pokemon-edit' }
		});
	});

	test('projects, changes, and removes generation-safe Held Items', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const workspace = await engine.loadSaveWorkspace(fixtureBytes, '011020251345.sav', 0);
		expect(workspace.ok).toBe(true);
		if (!workspace.ok) throw new Error('Expected Emerald workspace to load.');

		const slot = workspace.value.boxSlots[0];
		expect(slot?.heldItemEditConstraints).toMatchObject({
			supported: true,
			options: expect.arrayContaining([
				expect.objectContaining({ id: 0, name: 'No item', available: true })
			])
		});
		const item = slot?.heldItemEditConstraints.options.find(
			(option) =>
				option.available &&
				option.id !== 0 &&
				option.id !== slot.heldItemEditConstraints.currentItemId
		);
		if (!item) throw new Error('Expected an available Held Item choice.');

		const edited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{ source: { zone: 'box', box: 0, slot: 0 }, heldItemId: item.id },
			0
		);
		expect(edited.ok, JSON.stringify(edited.error)).toBe(true);
		if (!edited.ok) throw new Error('Expected Held Item edit to succeed.');
		expect(edited.value.workspace.boxSlots[0]).toMatchObject({
			heldItem: item.name,
			heldItemEditConstraints: { currentItemId: item.id }
		});

		const unsupported = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{ source: { zone: 'box', box: 0, slot: 0 }, heldItemId: 65_535 },
			0
		);
		expect(unsupported).toMatchObject({
			ok: false,
			error: { code: 'unsupported-pokemon-edit' }
		});

		const removed = await engine.applyPokemonEditOperation(
			edited.value.bytes,
			'011020251345.sav',
			{ source: { zone: 'box', box: 0, slot: 0 }, heldItemId: 0 },
			0
		);
		expect(removed.ok).toBe(true);
		if (!removed.ok) throw new Error('Expected Held Item removal to succeed.');
		expect(removed.value.workspace.boxSlots[0]).toMatchObject({
			heldItem: null,
			heldItemEditConstraints: { currentItemId: 0 }
		});
	});

	test('projects and edits Tera Type only for supported Pokemon formats', async () => {
		const [engine, scarletResponse, emeraldResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(scarletFixtureUrl),
			fetch(fixtureUrl)
		]);
		const scarletBytes = new Uint8Array(await scarletResponse.arrayBuffer());
		const emeraldBytes = new Uint8Array(await emeraldResponse.arrayBuffer());
		const scarlet = await engine.loadSaveWorkspace(
			scarletBytes,
			'pokemon-scarlet-2025-03-24-main.sav',
			0
		);
		expect(scarlet.ok).toBe(true);
		if (!scarlet.ok) throw new Error('Expected Scarlet workspace to load.');

		const slot = [...scarlet.value.partySlots, ...scarlet.value.boxSlots].find((candidate) =>
			candidate.battleFields?.some((field) => field.key === 'tera-type' && field.supported)
		);
		if (!slot) throw new Error('Expected Scarlet fixture to include an editable Tera Type.');
		const teraType = slot.battleFields?.find((field) => field.key === 'tera-type');
		if (!teraType) throw new Error('Expected Tera Type projection.');
		expect(teraType).toMatchObject({
			label: 'Tera Type',
			valueLabel: expect.any(String),
			supported: true
		});
		const nextType = teraType.options.find((option) => option.value !== teraType.value);
		if (!nextType) throw new Error('Expected another Tera Type choice.');

		let source: SaveSlotRef;
		if ('box' in slot && typeof slot.box === 'number') {
			source = { zone: 'box', box: slot.box, slot: slot.slot };
		} else {
			source = { zone: 'party', slot: slot.slot };
		}
		const edited = await engine.applyPokemonEditOperation(
			copyBytes(scarletBytes),
			'pokemon-scarlet-2025-03-24-main.sav',
			{ source, teraType: nextType.value },
			0
		);
		expect(edited.ok).toBe(true);
		if (!edited.ok) throw new Error('Expected Tera Type edit to succeed.');
		expect(edited.value.mutated).toBe(true);
		const updatedSlot =
			source.zone === 'party'
				? edited.value.workspace.partySlots.find((candidate) => candidate.slot === source.slot)
				: edited.value.workspace.boxSlots.find(
						(candidate) => candidate.box === source.box && candidate.slot === source.slot
					);
		expect(updatedSlot?.battleFields?.find((field) => field.key === 'tera-type')).toMatchObject({
			value: nextType.value,
			valueLabel: nextType.label
		});
		const invalid = await engine.applyPokemonEditOperation(
			copyBytes(scarletBytes),
			'pokemon-scarlet-2025-03-24-main.sav',
			{ source, teraType: 19 },
			0
		);
		expect(invalid).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});

		const unsupported = await engine.applyPokemonEditOperation(
			copyBytes(emeraldBytes),
			'011020251345.sav',
			{ source: { zone: 'box', box: 0, slot: 0 }, teraType: nextType.value },
			0
		);
		expect(unsupported).toMatchObject({
			ok: false,
			error: { code: 'unsupported-pokemon-edit' }
		});
	});

	test('projects, applies, and rejects Met Data through the browser-wasm bundle', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(fixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const workspace = await engine.loadSaveWorkspace(fixtureBytes, '011020251345.sav', 0);
		expect(workspace.ok).toBe(true);
		if (!workspace.ok) throw new Error('Expected Emerald workspace to load.');

		const constraints = workspace.value.boxSlots[0]?.metDataEditConstraints;
		expect(constraints).toMatchObject({
			supported: true,
			supportsOriginGame: true,
			supportsBall: true,
			supportsMetDate: false
		});
		if (!constraints) throw new Error('Expected Met Data constraints.');
		expect(constraints.locationGroups).not.toHaveLength(0);
		expect(constraints.originGames).not.toHaveLength(0);
		expect(constraints.balls).not.toHaveLength(0);

		const nextBall = constraints.balls.find((option) => option.id !== constraints.currentBallId);
		if (!nextBall) throw new Error('Expected another supported Ball choice.');
		const edited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				metData: {
					locationId: constraints.currentLocationId,
					metLevel: constraints.currentMetLevel,
					originGameId: constraints.currentOriginGameId,
					ballId: nextBall.id
				}
			},
			0
		);
		expect(edited.ok, JSON.stringify(edited.error)).toBe(true);
		if (!edited.ok) throw new Error('Expected Met Data edit to succeed.');
		expect(edited.value.mutated).toBe(true);
		expect(edited.value.workspace.boxSlots[0]?.metDataEditConstraints.currentBallId).toBe(
			nextBall.id
		);

		const invalid = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'011020251345.sav',
			{
				source: { zone: 'box', box: 0, slot: 0 },
				metData: {
					locationId: constraints.currentLocationId,
					metLevel: 100,
					originGameId: constraints.currentOriginGameId,
					ballId: constraints.currentBallId
				}
			},
			0
		);
		expect(invalid).toMatchObject({
			ok: false,
			error: {
				code: 'invalid-pokemon-edit',
				message: expect.stringContaining('Pokemon encounter')
			}
		});
	});

	test('allows Primarina Ice Beam PP edits and explains real post-edit legality failures', async () => {
		const [engine, fixtureResponse] = await Promise.all([
			createPkhexEngine('/pkhex-engine'),
			fetch(swordFixtureUrl)
		]);
		const fixtureBytes = new Uint8Array(await fixtureResponse.arrayBuffer());
		const summary = await engine.summarizeSave(fixtureBytes, 'pokemon-sword-2025-03-24-main.sav');
		expect(summary.ok, JSON.stringify(summary.error)).toBe(true);
		if (!summary.ok) {
			throw new Error('Expected Sword fixture summary to succeed.');
		}

		let primarina:
			| {
					source: { zone: 'party'; slot: number } | { zone: 'box'; box: number; slot: number };
					moves: NonNullable<
						Awaited<ReturnType<typeof engine.loadSaveWorkspace>>['value']
					>['boxSlots'][number]['moves'];
					moveSetEditConstraints: NonNullable<
						Awaited<ReturnType<typeof engine.loadSaveWorkspace>>['value']
					>['boxSlots'][number]['moveSetEditConstraints'];
					abilityEditConstraints: NonNullable<
						Awaited<ReturnType<typeof engine.loadSaveWorkspace>>['value']
					>['boxSlots'][number]['abilityEditConstraints'];
			  }
			| undefined;

		for (let box = 0; box < summary.value.boxCount && !primarina; box += 1) {
			const workspace = await engine.loadSaveWorkspace(
				fixtureBytes,
				'pokemon-sword-2025-03-24-main.sav',
				box
			);
			expect(workspace.ok, JSON.stringify(workspace.error)).toBe(true);
			if (!workspace.ok) {
				throw new Error('Expected Sword workspace to load.');
			}

			const partySlot = workspace.value.partySlots.find((slot) => slot.speciesId === 730);
			if (partySlot) {
				primarina = {
					source: { zone: 'party', slot: partySlot.slot },
					moves: partySlot.moves,
					moveSetEditConstraints: partySlot.moveSetEditConstraints,
					abilityEditConstraints: partySlot.abilityEditConstraints
				};
				break;
			}

			const boxSlot = workspace.value.boxSlots.find((slot) => slot.speciesId === 730);
			if (boxSlot) {
				primarina = {
					source: { zone: 'box', box: boxSlot.box, slot: boxSlot.slot },
					moves: boxSlot.moves,
					moveSetEditConstraints: boxSlot.moveSetEditConstraints,
					abilityEditConstraints: boxSlot.abilityEditConstraints
				};
			}
		}

		expect(primarina, 'Expected Sword fixture to include Primarina.').toBeDefined();
		if (!primarina) return;
		expect(primarina.abilityEditConstraints.options).toEqual(
			expect.arrayContaining([expect.objectContaining({ hidden: true })])
		);
		const iceBeamSlot = primarina.moves.findIndex((move) => move.id === 58);
		expect(
			iceBeamSlot,
			'Expected Primarina current move set to include Ice Beam.'
		).toBeGreaterThanOrEqual(0);
		const iceBeam = primarina.moves[iceBeamSlot];
		if (!iceBeam) return;
		const iceBeamPp = iceBeam.pp ?? iceBeam.maxPp ?? 0;
		const iceBeamMaxPp = iceBeam.maxPp ?? iceBeamPp;

		const moves = Array.from({ length: 4 }, (_, slot) => {
			const current = primarina.moves[slot];
			return {
				slot,
				move: current?.id ?? 0,
				pp: current?.pp ?? current?.maxPp ?? 0,
				ppUps: current?.ppUps ?? 0
			};
		});
		moves[iceBeamSlot] = {
			slot: iceBeamSlot,
			move: iceBeam.id,
			pp: iceBeamPp > 0 ? iceBeamPp - 1 : Math.min(1, iceBeamMaxPp),
			ppUps: iceBeam.ppUps ?? 0
		};

		const ppEdited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'pokemon-sword-2025-03-24-main.sav',
			{ source: primarina.source, moves },
			0
		);
		expect(ppEdited.ok, JSON.stringify(ppEdited.error)).toBe(true);
		if (!ppEdited.ok) {
			throw new Error('Expected Primarina Ice Beam PP edit to succeed.');
		}
		const updatedPrimarina =
			primarina.source.zone === 'party'
				? ppEdited.value.workspace.partySlots[primarina.source.slot]
				: ppEdited.value.workspace.boxSlots[primarina.source.slot];
		expect(updatedPrimarina?.moves[iceBeamSlot]).toMatchObject({
			id: 58,
			pp: moves[iceBeamSlot]?.pp
		});

		const illegalMoves = moves.map((move) => ({ ...move }));
		const illegalSlot = iceBeamSlot === 0 ? 1 : 0;
		illegalMoves[illegalSlot] = {
			...illegalMoves[illegalSlot],
			slot: illegalSlot,
			move: iceBeam.id,
			pp: iceBeamMaxPp,
			ppUps: iceBeam.ppUps ?? 0
		};

		const edited = await engine.applyPokemonEditOperation(
			copyBytes(fixtureBytes),
			'pokemon-sword-2025-03-24-main.sav',
			{ source: primarina.source, moves: illegalMoves },
			0
		);
		expect(edited).toMatchObject({
			ok: false,
			error: { code: 'invalid-pokemon-edit' }
		});
		if (edited.ok) {
			throw new Error('Expected Primarina Ice Beam edit to fail legality validation.');
		}
		expect(edited.error.message).toContain(
			'Move Set edit makes this Pokemon illegal for its current format.'
		);
		expect(edited.error.message).not.toBe(
			'Move Set edit makes this Pokemon illegal for its current format.'
		);
		expect(edited.error.message).toContain('Ice Beam');
	});
});

function copyBytes(bytes: Uint8Array): Uint8Array {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy;
}

function pokemonActionUnrelatedProjection(slot: BoxSlotSummary | undefined) {
	if (!slot) return null;
	return {
		speciesId: slot.speciesId,
		form: slot.form,
		format: slot.format,
		level: slot.level,
		experience: slot.experience,
		nickname: slot.nickname,
		isEgg: slot.isEgg,
		gender: slot.gender,
		nature: slot.nature,
		ability: slot.ability,
		heldItem: slot.heldItem,
		types: slot.types,
		stats: slot.stats,
		ballId: slot.metDataEditConstraints.currentBallId,
		metLabel: slot.metLabel,
		originalTrainer: slot.originalTrainer,
		spriteIdentity: slot.spriteIdentity
	};
}
