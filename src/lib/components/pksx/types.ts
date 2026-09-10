import type {
	PokemonBattleFieldProjection,
	PokemonExperienceProjection,
	PokemonAbilityEditConstraints,
	PokemonFriendshipEditConstraints,
	PokemonHeldItemEditConstraints,
	PokemonMetDataEditConstraints,
	PokemonMoveSetEditConstraints,
	PokemonNatureEditConstraints,
	PokemonOriginalTrainerEditConstraints,
	PokemonStatEditConstraints,
	SpriteIdentity
} from '$lib/engine';

export type SlotView = {
	slot: number;
	label: string;
	detail: string;
	level: number | null;
	experience: number | null;
	experienceProjection: PokemonExperienceProjection | null;
	speciesId: number | null;
	form: number | null;
	isEgg: boolean;
	spriteIdentity: SpriteIdentity | null;
	kind: 'pokemon' | 'empty';
	gender?: string;
	nature?: string;
	ability?: string;
	heldItem?: string;
	types?: SlotTypeView[];
	stats?: SlotStatView[];
	moves?: SlotMoveView[];
	natureEditConstraints?: PokemonNatureEditConstraints;
	heldItemEditConstraints?: PokemonHeldItemEditConstraints;
	abilityEditConstraints?: PokemonAbilityEditConstraints;
	metDataEditConstraints?: PokemonMetDataEditConstraints;
	originalTrainerEditConstraints?: PokemonOriginalTrainerEditConstraints;
	statEditConstraints?: PokemonStatEditConstraints;
	moveSetEditConstraints?: PokemonMoveSetEditConstraints;
	friendshipEditConstraints?: PokemonFriendshipEditConstraints;
	battleFields?: PokemonBattleFieldProjection[];
	originalTrainer?: string;
	metLabel?: string;
	entityBytesBase64?: string | null;
};

export type SlotTypeView = {
	name: string;
	hue: number;
	chroma?: number;
};

export type SlotStatView = {
	key: string;
	label: string;
	value: number;
	ev?: number | null;
	iv?: number | null;
	max: number;
};

export type SlotMoveView = {
	slot: number;
	id: number;
	name: string;
	type: string;
	hue: number;
	chroma?: number;
	pp?: number | null;
	maxPp?: number | null;
	ppUps?: number | null;
};

export type MobileTab = {
	key: string;
	label: string;
	glyph: string;
};

export type BoxNavItem = {
	index: number;
	name: string;
	hue: number;
	active: boolean;
	occupied: number | null;
};

export type BoxSourceView = {
	key: 'save-file' | 'pokemon-storage';
	label: string;
	activeBoxLabel: string;
	activeBoxNumber: number;
	boxCount: number;
	occupied: number;
	capacity: number;
	location: 'party' | 'box';
};
