import { describe, expect, test } from 'vitest';
import {
	applyPokemonEditorSessionAction,
	createPokemonEditorSession,
	enterPokemonEditorContent,
	pagePokemonEditorSection,
	pokemonEditorEditTarget,
	pokemonEditorSections,
	requestPokemonEditorDismiss,
	returnFromPokemonEditorInternalState,
	showPokemonEditorReview,
	type PokemonEditorFocus
} from './session';

describe('Pokemon Editor session', () => {
	test('opens on the first of eleven stable sections and moves within the rail', () => {
		const opened = createPokemonEditorSession();
		expect(pokemonEditorSections.map(({ id }) => id)).toEqual([
			'species-form',
			'nickname',
			'nature',
			'held-item',
			'ability',
			'met-data',
			'original-trainer',
			'level-experience',
			'friendship',
			'move-set',
			'stats'
		]);
		expect(opened).toMatchObject({
			section: 'species-form',
			focus: { zone: 'rail', section: 'species-form' },
			view: 'section'
		});

		const moved = applyPokemonEditorSessionAction(opened, 'nextRail');
		expect(moved).toMatchObject({
			section: 'nickname',
			focus: { zone: 'rail', section: 'nickname' }
		});
	});

	test('enters content by control identity and returns to the active rail entry', () => {
		const entered = enterPokemonEditorContent(
			createPokemonEditorSession(),
			'pokemon-editor-species'
		);
		expect(entered.focus).toEqual({
			zone: 'content',
			section: 'species-form',
			control: 'pokemon-editor-species'
		});

		expect(applyPokemonEditorSessionAction(entered, 'returnToRail').focus).toEqual({
			zone: 'rail',
			section: 'species-form'
		});
	});

	test('pages sections from rail and content targets without losing the zone', () => {
		const states: PokemonEditorFocus[] = [
			{ zone: 'rail', section: 'species-form' },
			{ zone: 'content', section: 'species-form', control: 'pokemon-editor-species' },
			{ zone: 'content', section: 'species-form', control: 'pokemon-editor-apply' }
		];

		for (const focus of states) {
			const paged = pagePokemonEditorSection({ ...createPokemonEditorSession(), focus }, 1);
			expect(paged.section).toBe('nickname');
			expect(paged.focus.zone).toBe(focus.zone === 'content' ? 'content' : focus.zone);
		}

		expect(pagePokemonEditorSection(createPokemonEditorSession(), -1).section).toBe('stats');
	});

	test('pages while review is open and returns to the new section', () => {
		const review = showPokemonEditorReview(
			enterPokemonEditorContent(createPokemonEditorSession(), 'pokemon-editor-species')
		);
		const paged = pagePokemonEditorSection(review, 1);

		expect(paged).toMatchObject({
			section: 'nickname',
			view: 'review',
			focus: { zone: 'review', control: 'pokemon-editor-review-close' },
			returnFocus: {
				zone: 'content',
				section: 'nickname',
				control: 'pokemon-editor-content-nickname'
			}
		});
		expect(returnFromPokemonEditorInternalState(paged).focus).toEqual(paged.returnFocus);
	});

	test('review and discard are internal states with stable return focus', () => {
		const editing = enterPokemonEditorContent(
			createPokemonEditorSession(),
			'pokemon-editor-species'
		);
		const review = showPokemonEditorReview(editing);
		expect(review).toMatchObject({ view: 'review', focus: { zone: 'review' } });
		expect(returnFromPokemonEditorInternalState(review)).toEqual(editing);
		const reviewGuard = requestPokemonEditorDismiss(review, true);
		expect(reviewGuard.session).toMatchObject({
			view: 'discard',
			returnFocus: editing.focus
		});

		expect(requestPokemonEditorDismiss(editing, false)).toEqual({
			session: editing,
			effect: 'dismiss'
		});
		const guarded = requestPokemonEditorDismiss(editing, true);
		expect(guarded.effect).toBe('none');
		expect(guarded.session).toMatchObject({
			view: 'discard',
			focus: { zone: 'discard', control: 'pokemon-editor-keep-editing' }
		});
		expect(returnFromPokemonEditorInternalState(guarded.session)).toEqual(editing);
	});

	test('maps every edit to one of the fixed sections and an offending control', () => {
		expect(pokemonEditorEditTarget('battle-fields')).toEqual({
			section: 'species-form',
			control: 'pokemon-editor-battle-field-tera-type'
		});
		expect(pokemonEditorEditTarget('evs')).toEqual({
			section: 'stats',
			control: 'pokemon-editor-hp-ev'
		});
		expect(pokemonEditorEditTarget('move-set')).toEqual({
			section: 'move-set',
			control: 'pokemon-editor-move-0'
		});
	});
});
