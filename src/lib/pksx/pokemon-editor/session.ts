export const pokemonEditorSections = [
	{ id: 'species-form', label: 'Species / Form' },
	{ id: 'nickname', label: 'Nickname' },
	{ id: 'nature', label: 'Nature' },
	{ id: 'held-item', label: 'Held Item' },
	{ id: 'ability', label: 'Ability' },
	{ id: 'met-data', label: 'Met Data' },
	{ id: 'original-trainer', label: 'Original Trainer' },
	{ id: 'level-experience', label: 'Level / Exp' },
	{ id: 'friendship', label: 'Friendship' },
	{ id: 'move-set', label: 'Move Set' },
	{ id: 'stats', label: 'Stats · IV / EV' }
] as const;

export type PokemonEditorSectionId = (typeof pokemonEditorSections)[number]['id'];

export type PokemonEditorDraftSnapshot = {
	editMode: 'level' | 'experience';
	speciesId: number;
	form: number;
	nickname: string;
	level: string;
	experience: string;
	originalTrainerName: string;
	trainerId: string;
	secretId: string;
	trainerGenderId: number;
	languageId: number;
	natureId: number;
	heldItemId: number;
	abilityIndex: number;
	metLocationId: number;
	metLevel: string;
	metDate: string;
	originGameId: number;
	ballId: number;
	ivs: Record<string, string>;
	evs: Record<string, string>;
	moves: { slot: number; move: number; pp: string; ppUps: string }[];
	friendship: Record<string, string>;
	battleFields: Record<string, number>;
};

export type PokemonEditorFocus =
	| { zone: 'rail'; section: PokemonEditorSectionId }
	| { zone: 'content'; section: PokemonEditorSectionId; control: string }
	| { zone: 'review'; control: 'pokemon-editor-review-close' }
	| {
			zone: 'discard';
			control: 'pokemon-editor-keep-editing' | 'pokemon-editor-discard-edits';
	  };

type EditingFocus = Extract<PokemonEditorFocus, { zone: 'rail' | 'content' }>;

export type PokemonEditorSession = {
	section: PokemonEditorSectionId;
	focus: PokemonEditorFocus;
	view: 'section' | 'review' | 'discard';
	returnFocus: EditingFocus | null;
};

export type PokemonEditorSessionAction = 'nextRail' | 'previousRail' | 'returnToRail';

const editTargets: Record<string, { section: PokemonEditorSectionId; control: string }> = {
	'species-form': { section: 'species-form', control: 'pokemon-editor-species' },
	'battle-fields': {
		section: 'species-form',
		control: 'pokemon-editor-battle-field-tera-type'
	},
	nickname: { section: 'nickname', control: 'pokemon-editor-nickname' },
	nature: { section: 'nature', control: 'pokemon-editor-nature' },
	'held-item': { section: 'held-item', control: 'pokemon-editor-held-item' },
	ability: { section: 'ability', control: 'pokemon-editor-ability' },
	'met-data': { section: 'met-data', control: 'pokemon-editor-met-location' },
	'original-trainer': {
		section: 'original-trainer',
		control: 'pokemon-editor-original-trainer-name'
	},
	'level-experience': { section: 'level-experience', control: 'pokemon-editor-mode' },
	friendship: { section: 'friendship', control: 'pokemon-editor-friendship' },
	'move-set': { section: 'move-set', control: 'pokemon-editor-move-0' },
	ivs: { section: 'stats', control: 'pokemon-editor-hp-iv' },
	evs: { section: 'stats', control: 'pokemon-editor-hp-ev' }
};

export const pokemonEditorSectionControls: Record<PokemonEditorSectionId, readonly string[]> = {
	'species-form': ['pokemon-editor-species', 'pokemon-editor-form'],
	nickname: ['pokemon-editor-nickname'],
	nature: ['pokemon-editor-nature'],
	'held-item': ['pokemon-editor-held-item'],
	ability: ['pokemon-editor-ability'],
	'met-data': [
		'pokemon-editor-met-location',
		'pokemon-editor-met-level',
		'pokemon-editor-origin-game',
		'pokemon-editor-ball',
		'pokemon-editor-met-date'
	],
	'original-trainer': [
		'pokemon-editor-original-trainer-name',
		'pokemon-editor-trainer-id',
		'pokemon-editor-secret-id',
		'pokemon-editor-trainer-gender',
		'pokemon-editor-pokemon-language'
	],
	'level-experience': ['pokemon-editor-mode', 'pokemon-editor-level', 'pokemon-editor-experience'],
	friendship: [],
	'move-set': [],
	stats: []
};

export function createPokemonEditorSession(): PokemonEditorSession {
	const section = pokemonEditorSections[0].id;
	return {
		section,
		focus: { zone: 'rail', section },
		view: 'section',
		returnFocus: null
	};
}

export function applyPokemonEditorSessionAction(
	session: PokemonEditorSession,
	action: PokemonEditorSessionAction
): PokemonEditorSession {
	if (action === 'returnToRail') {
		return {
			...session,
			focus: { zone: 'rail', section: session.section },
			view: 'section',
			returnFocus: null
		};
	}

	return pagePokemonEditorSection(session, action === 'previousRail' ? -1 : 1);
}

export function pagePokemonEditorSection(
	session: PokemonEditorSession,
	offset: -1 | 1
): PokemonEditorSession {
	const section = adjacentSection(session.section, offset);
	return {
		...session,
		section,
		focus: pageEditingFocus(session.focus, section),
		returnFocus: session.returnFocus ? pageEditingFocus(session.returnFocus, section) : null
	};
}

export function selectPokemonEditorSection(
	session: PokemonEditorSession,
	section: PokemonEditorSectionId
): PokemonEditorSession {
	return {
		...session,
		section,
		focus: { zone: 'rail', section },
		view: 'section',
		returnFocus: null
	};
}

export function enterPokemonEditorContent(
	session: PokemonEditorSession,
	control: string
): PokemonEditorSession {
	return {
		...session,
		focus: { zone: 'content', section: session.section, control },
		view: 'section',
		returnFocus: null
	};
}

export function focusPokemonEditorApply(
	session: PokemonEditorSession,
	control: string
): PokemonEditorSession {
	return {
		...session,
		focus: { zone: 'content', section: session.section, control },
		view: 'section',
		returnFocus: null
	};
}

export function showPokemonEditorReview(session: PokemonEditorSession): PokemonEditorSession {
	return {
		...session,
		focus: { zone: 'review', control: 'pokemon-editor-review-close' },
		view: 'review',
		returnFocus: editingFocus(session.focus, session.section)
	};
}

export function requestPokemonEditorDismiss(
	session: PokemonEditorSession,
	dirty: boolean
): { session: PokemonEditorSession; effect: 'none' | 'dismiss' } {
	if (!dirty) return { session, effect: 'dismiss' };
	if (session.view === 'discard') return { session, effect: 'none' };
	return {
		session: {
			...session,
			focus: { zone: 'discard', control: 'pokemon-editor-keep-editing' },
			view: 'discard',
			returnFocus: session.returnFocus ?? editingFocus(session.focus, session.section)
		},
		effect: 'none'
	};
}

export function returnFromPokemonEditorInternalState(
	session: PokemonEditorSession
): PokemonEditorSession {
	return {
		...session,
		focus: session.returnFocus ?? { zone: 'rail', section: session.section },
		view: 'section',
		returnFocus: null
	};
}

export function pokemonEditorEditTarget(editId: string) {
	return editTargets[editId] ?? null;
}

function adjacentSection(section: PokemonEditorSectionId, offset: -1 | 1) {
	const index = pokemonEditorSections.findIndex((candidate) => candidate.id === section);
	return pokemonEditorSections[
		(index + offset + pokemonEditorSections.length) % pokemonEditorSections.length
	].id;
}

function editingFocus(focus: PokemonEditorFocus, section: PokemonEditorSectionId): EditingFocus {
	return focus.zone === 'rail' || focus.zone === 'content' ? focus : { zone: 'rail', section };
}

function pageEditingFocus(focus: EditingFocus, section: PokemonEditorSectionId): EditingFocus;
function pageEditingFocus(
	focus: PokemonEditorFocus,
	section: PokemonEditorSectionId
): PokemonEditorFocus;
function pageEditingFocus(
	focus: PokemonEditorFocus,
	section: PokemonEditorSectionId
): PokemonEditorFocus {
	if (focus.zone === 'rail') return { zone: 'rail', section };
	if (focus.zone === 'content') {
		return { zone: 'content', section, control: `pokemon-editor-content-${section}` };
	}
	return focus;
}
