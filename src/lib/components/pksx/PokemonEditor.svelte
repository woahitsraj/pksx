<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type {
		PokemonBattleFieldProjection,
		PokemonSpeciesFormEditProjection,
		SaveSummary
	} from '$lib/engine';
	import Combobox, { type ComboboxOption } from '$lib/components/pksx/Combobox.svelte';
	import type {
		PokemonEditorDraftEdits,
		PokemonMetDataEditPayload,
		PokemonMoveSetEditPayload,
		PokemonSpeciesFormEditPayload,
		PokemonStatEditPayload,
		PokemonEditorState
	} from '$lib/pksx/pokemon-editor';
	import {
		createPokemonEditOperation,
		maxPpForPpUps,
		moveSetEditPayloadFromSlot,
		statEditPayloadFromSlot,
		type PokemonStatKey
	} from '$lib/pksx/pokemon-editor';
	import { stagePokemonEditorDraftEdits } from '$lib/pksx/box-shell';
	import {
		pokemonEditorEditTarget,
		pokemonEditorSections,
		type PokemonEditorDraftSnapshot,
		type PokemonEditorFocus,
		type PokemonEditorSectionId,
		type PokemonEditorSession
	} from '$lib/pksx/pokemon-editor/session';
	import { getSpriteIdentityLabels } from '$lib/pksx/sprite-catalog';

	interface Props {
		editor: PokemonEditorState;
		mode?: 'edit' | 'create';
		saveSummary: SaveSummary | null;
		spriteUrl: string | null;
		slotHueStyle: string;
		feedback: string | null;
		applying: boolean;
		pendingScratch?: boolean;
		session: PokemonEditorSession;
		initialDraft: PokemonEditorDraftSnapshot | null;
		speciesFormProjection: PokemonSpeciesFormEditProjection | null;
		speciesFormLoading: boolean;
		speciesFormError: string | null;
		onApply: (draft: PokemonEditorDraftEdits) => void;
		onDraftChange: (
			draft: PokemonEditorDraftSnapshot,
			dirty: boolean,
			edits: PokemonEditorDraftEdits
		) => void;
		onFocusChange: (focus: PokemonEditorFocus) => void;
		onSelectSection: (section: PokemonEditorSectionId) => void;
		onShowReview: () => void;
		onKeepEditing: () => void;
		onDiscard: () => void;
		onOpenLegality: () => void;
		onPreviewSpeciesForm: (target: PokemonSpeciesFormEditPayload) => void;
		onCancelEdits: () => void;
		onClose: () => void;
	}

	type DraftMoveSlot = {
		slot: number;
		move: number;
		pp: string;
		ppUps: string;
	};

	type DraftStats = Record<PokemonStatKey, string>;
	type DraftFriendship = Record<string, string>;

	let {
		editor,
		mode = 'edit',
		saveSummary,
		spriteUrl,
		slotHueStyle,
		feedback,
		applying,
		pendingScratch = false,
		session,
		initialDraft,
		speciesFormProjection,
		speciesFormLoading,
		speciesFormError,
		onApply,
		onDraftChange,
		onFocusChange,
		onSelectSection,
		onShowReview,
		onKeepEditing,
		onDiscard,
		onOpenLegality,
		onPreviewSpeciesForm,
		onCancelEdits,
		onClose
	}: Props = $props();

	let editMode = $state<'level' | 'experience'>(untrack(() => initialDraft?.editMode ?? 'level'));
	let editingInputId = $state<string | null>(null);
	const slot = $derived(editor.slot);
	let draftSpeciesId = $state(untrack(() => initialDraft?.speciesId ?? slot.speciesId ?? 0));
	let draftForm = $state(untrack(() => initialDraft?.form ?? slot.form ?? 0));
	const speciesFormPreview = $derived(
		speciesFormProjection?.preview.speciesId === draftSpeciesId &&
			speciesFormProjection.preview.form === draftForm
			? speciesFormProjection.preview
			: null
	);
	const statKeys = ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE'] as const satisfies PokemonStatKey[];
	const baseIvs = $derived(statEditPayloadFromSlot(slot, 'iv'));
	const baseEvs = $derived(statEditPayloadFromSlot(slot, 'ev'));
	const baseMoveSet = $derived(moveSetEditPayloadFromSlot(slot));
	const friendshipEditConstraints = $derived(slot.friendshipEditConstraints);
	const baseFriendship = $derived(
		Object.fromEntries(
			(friendshipEditConstraints?.fields ?? []).map((field) => [field.key, String(field.value)])
		) as DraftFriendship
	);
	const battleFields = $derived(slot.battleFields ?? []);
	let draftNickname = $state(untrack(() => initialDraft?.nickname ?? slot.label));
	let draftLevel = $state(untrack(() => initialDraft?.level ?? String(slot.level ?? 1)));
	let draftExperience = $state(
		untrack(() => initialDraft?.experience ?? String(slot.experience ?? 0))
	);
	const originalTrainerEditConstraints = $derived(slot.originalTrainerEditConstraints);
	let draftOriginalTrainerName = $state(
		untrack(
			() =>
				initialDraft?.originalTrainerName ?? slot.originalTrainerEditConstraints?.currentName ?? ''
		)
	);
	let draftTrainerId = $state(
		untrack(
			() =>
				initialDraft?.trainerId ??
				String(slot.originalTrainerEditConstraints?.currentTrainerId ?? 0)
		)
	);
	let draftSecretId = $state(
		untrack(
			() =>
				initialDraft?.secretId ?? String(slot.originalTrainerEditConstraints?.currentSecretId ?? 0)
		)
	);
	let draftTrainerGenderId = $state(
		untrack(
			() =>
				initialDraft?.trainerGenderId ?? slot.originalTrainerEditConstraints?.currentGenderId ?? 0
		)
	);
	let draftLanguageId = $state(
		untrack(
			() => initialDraft?.languageId ?? slot.originalTrainerEditConstraints?.currentLanguageId ?? 0
		)
	);
	let draftNatureId = $state(
		untrack(() => initialDraft?.natureId ?? slot.natureEditConstraints?.currentNatureId ?? -1)
	);
	let draftHeldItemId = $state(
		untrack(() => initialDraft?.heldItemId ?? slot.heldItemEditConstraints?.currentItemId ?? 0)
	);
	let draftAbilityIndex = $state(
		untrack(
			() => initialDraft?.abilityIndex ?? slot.abilityEditConstraints?.currentAbilityIndex ?? -1
		)
	);
	let draftMetLocationId = $state(
		untrack(
			() => initialDraft?.metLocationId ?? slot.metDataEditConstraints?.currentLocationId ?? 0
		)
	);
	let draftMetLevel = $state(
		untrack(
			() => initialDraft?.metLevel ?? String(slot.metDataEditConstraints?.currentMetLevel ?? 0)
		)
	);
	let draftMetDate = $state(
		untrack(() => initialDraft?.metDate ?? slot.metDataEditConstraints?.currentMetDate ?? '')
	);
	let draftOriginGameId = $state(
		untrack(
			() => initialDraft?.originGameId ?? slot.metDataEditConstraints?.currentOriginGameId ?? 0
		)
	);
	let draftBallId = $state(
		untrack(() => initialDraft?.ballId ?? slot.metDataEditConstraints?.currentBallId ?? 0)
	);
	let draftIvs = $state<DraftStats>(
		untrack(() => (initialDraft?.ivs as DraftStats | undefined) ?? statsToDraft(baseIvs))
	);
	let draftEvs = $state<DraftStats>(
		untrack(() => (initialDraft?.evs as DraftStats | undefined) ?? statsToDraft(baseEvs))
	);
	let draftMoves = $state<DraftMoveSlot[]>(
		untrack(() =>
			(initialDraft?.moves ?? baseMoveSet.moves).map((move) => ({
				slot: move.slot,
				move: move.move,
				pp: String(move.pp ?? 0),
				ppUps: String(move.ppUps ?? 0)
			}))
		)
	);
	let draftFriendship = $state<DraftFriendship>(
		untrack(() => initialDraft?.friendship ?? { ...baseFriendship })
	);
	let draftBattleFields = $state<Record<string, number>>(
		untrack(() => initialDraft?.battleFields ?? battleFieldsToDraft(battleFields))
	);
	let lastAppliedDraftSignature = $state('');
	const statEditConstraints = $derived(slot.statEditConstraints);
	const moveSetEditConstraints = $derived(slot.moveSetEditConstraints);
	const natureEditConstraints = $derived(slot.natureEditConstraints);
	const heldItemEditConstraints = $derived(slot.heldItemEditConstraints);
	const abilityEditConstraints = $derived(slot.abilityEditConstraints);
	const metDataEditConstraints = $derived(slot.metDataEditConstraints);
	const canEditStats = $derived(statEditConstraints?.supported ?? false);
	const canEditMoveSet = $derived(moveSetEditConstraints?.supported ?? false);
	const canEditNature = $derived(natureEditConstraints?.supported ?? false);
	const canEditHeldItem = $derived(heldItemEditConstraints?.supported ?? false);
	const canEditAbility = $derived(abilityEditConstraints?.supported ?? false);
	const canEditFriendship = $derived(friendshipEditConstraints?.supported ?? false);
	const canEditMetData = $derived(metDataEditConstraints?.supported ?? false);
	const canEditOriginalTrainer = $derived(originalTrainerEditConstraints?.supported ?? false);
	const unsupportedOriginalTrainerFields = $derived(
		[
			originalTrainerEditConstraints?.supportsSecretId ? null : 'Secret ID',
			originalTrainerEditConstraints?.supportsGender ? null : 'gender',
			originalTrainerEditConstraints?.supportsLanguage ? null : 'language'
		].filter((field): field is string => field !== null)
	);
	const metLocationOptions = $derived(
		metDataEditConstraints?.locationGroups.find((group) => group.originGameId === draftOriginGameId)
			?.options ?? []
	);
	const moveOptions = $derived(moveSetEditConstraints?.availableMoves ?? []);
	const moveComboboxOptions = $derived(
		moveOptions.map(
			(option) =>
				({
					value: String(option.id),
					label: option.name,
					meta: option.type,
					detail: `${option.maxPp} PP`,
					hue: option.hue,
					chroma: option.chroma
				}) satisfies ComboboxOption
		)
	);
	const unavailableHeldItemCount = $derived(
		heldItemEditConstraints?.options.filter((option) => !option.available).length ?? 0
	);
	const unavailableAbilityOptions = $derived(
		abilityEditConstraints?.options.filter((option) => !option.available) ?? []
	);
	const originalNature = $derived(
		natureEditConstraints?.options.find(
			(option) => option.id === natureEditConstraints.originalNatureId
		)
	);
	const statNature = $derived(
		natureEditConstraints?.options.find(
			(option) => option.id === natureEditConstraints.statNatureId
		)
	);
	const totalEvs = $derived(
		statKeys.reduce((total, key) => {
			const value = parseDraftNumber(draftEvs[key]);
			return Number.isFinite(value) ? total + value : total;
		}, 0)
	);
	const draftEditCount = $derived(countDraftEdits());
	const draftDirty = $derived(draftEditCount > 0);
	const currentDraftSignature = $derived(createDraftSignature());
	const stagedDraftEditor = $derived(stagePokemonEditorDraftEdits(editor, buildDraftEdits()));
	const stagedEditIds = $derived(new Set(stagedDraftEditor.stagedEdits.map(({ id }) => id)));
	const draftValidation = $derived(validateDraftEditor(stagedDraftEditor));
	const draftValidationText = $derived(
		draftValidation
			? `${pokemonEditorSections.find(({ id }) => id === draftValidation.section)?.label}, ${controlLabel(draftValidation.control)}: ${draftValidation.message}`
			: null
	);
	const deltaRows = $derived(stagedDraftEditor.stagedEdits.map(deltaForEdit));
	const speciesLabel = $derived(
		slot.speciesId ? `Species #${String(slot.speciesId).padStart(4, '0')}` : 'Unknown species'
	);
	const spriteIdentityLabels = $derived(getSpriteIdentityLabels(slot.spriteIdentity));
	const sourceLabel = $derived(
		mode === 'create'
			? 'New Pokemon'
			: editor.source.owner === 'save-file'
				? 'Save File Pokemon'
				: 'Pokemon Storage Pokemon'
	);
	const statusText = $derived(
		draftValidationText
			? draftValidationText
			: feedback && (!draftDirty || lastAppliedDraftSignature === currentDraftSignature)
				? feedback
				: draftDirty
					? `${draftEditCount} Pokemon edit${draftEditCount === 1 ? '' : 's'} drafted.`
					: pendingScratch
						? 'Quick Fix staged.'
						: (editor.applyOutcome.message ??
							(mode === 'create' ? `Ready to create ${slot.label}.` : 'No Pokemon edits staged.'))
	);
	const experienceProjection = $derived(slot.experienceProjection);
	const canEditLevelExperience = $derived(experienceProjection !== null);
	const levelRangeLabel = $derived(
		experienceProjection
			? `${experienceProjection.minLevel}-${experienceProjection.maxLevel}`
			: 'Unsupported'
	);
	const experienceRangeLabel = $derived(
		experienceProjection
			? `${experienceProjection.minExperience.toLocaleString()}-${experienceProjection.maxExperience.toLocaleString()}`
			: 'Unsupported'
	);
	const currentExperienceLabel = $derived(
		slot.experience === null ? 'Unknown' : slot.experience.toLocaleString()
	);
	const nextLevelLabel = $derived(
		experienceProjection && slot.level !== null && slot.level < experienceProjection.maxLevel
			? experienceProjection.nextLevelMinExperience.toLocaleString()
			: 'Max'
	);
	const identityRows = $derived(
		[
			slot.gender ? { label: 'Gender', value: slot.gender } : null,
			slot.nature
				? {
						label: natureEditConstraints?.usesStatNature ? 'Original Nature' : 'Nature',
						value: slot.nature
					}
				: null,
			natureEditConstraints?.usesStatNature && statNature
				? { label: 'Stat Nature', value: statNature.name }
				: null,
			slot.ability ? { label: 'Ability', value: slot.ability } : null,
			slot.heldItem ? { label: 'Held Item', value: slot.heldItem } : null,
			slot.originalTrainer || saveSummary?.trainerName
				? {
						label: 'Original Trainer',
						value: slot.originalTrainer ?? saveSummary?.trainerName ?? ''
					}
				: null,
			slot.metLabel ? { label: 'Met', value: slot.metLabel } : null
		].filter((row): row is { label: string; value: string } => row !== null)
	);

	function toggleEditMode() {
		editMode = editMode === 'level' ? 'experience' : 'level';
		publishDraftChange();
	}

	function handleNicknameInput(event: Event) {
		const target = event.currentTarget;
		if (target instanceof HTMLInputElement) {
			draftNickname = target.value;
			publishDraftChange();
		}
	}

	function handleSpeciesChange(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLSelectElement)) return;
		draftSpeciesId = Number(target.value);
		draftForm = 0;
		publishDraftChange();
		onPreviewSpeciesForm({ speciesId: draftSpeciesId, form: draftForm });
	}

	function handleFormChange(event: Event) {
		const target = event.currentTarget;
		if (!(target instanceof HTMLSelectElement)) return;
		draftForm = Number(target.value);
		publishDraftChange();
		onPreviewSpeciesForm({ speciesId: draftSpeciesId, form: draftForm });
	}

	function setDraftLevel(value: string) {
		draftLevel = value;
		publishDraftChange();
	}

	function setDraftExperience(value: string) {
		draftExperience = value;
		publishDraftChange();
	}

	function setDraftOriginalTrainerName(value: string) {
		draftOriginalTrainerName = value;
		publishDraftChange();
	}

	function setDraftTrainerId(value: string) {
		draftTrainerId = value;
		publishDraftChange();
	}

	function setDraftSecretId(value: string) {
		draftSecretId = value;
		publishDraftChange();
	}

	function setDraftMetLocation(value: string) {
		draftMetLocationId = Number(value);
		publishDraftChange();
	}

	function setDraftMetLevel(value: string) {
		draftMetLevel = value;
		publishDraftChange();
	}

	function setDraftMetDate(value: string) {
		draftMetDate = value;
		publishDraftChange();
	}

	function setDraftOriginGame(value: string) {
		draftOriginGameId = Number(value);
		const locations =
			metDataEditConstraints?.locationGroups.find(
				(group) => group.originGameId === draftOriginGameId
			)?.options ?? [];
		if (!locations.some((option) => option.id === draftMetLocationId)) {
			draftMetLocationId = locations[0]?.id ?? 0;
		}
		publishDraftChange();
	}

	function setDraftBall(value: string) {
		draftBallId = Number(value);
		publishDraftChange();
	}

	function setDraftNature(value: string) {
		draftNatureId = Number(value);
		publishDraftChange();
	}

	function setDraftHeldItem(value: string) {
		draftHeldItemId = Number(value);
		publishDraftChange();
	}

	function setDraftAbility(value: string) {
		draftAbilityIndex = Number(value);
		publishDraftChange();
	}

	function heldItemOptionLabel(
		option: NonNullable<typeof heldItemEditConstraints>['options'][number]
	) {
		return `${option.name}${option.available ? '' : ' (Unavailable for format)'}`;
	}

	function abilityOptionLabel(
		option: NonNullable<typeof abilityEditConstraints>['options'][number]
	) {
		const slotLabel = option.hidden ? 'Hidden Ability' : `Ability ${option.index + 1}`;
		return `${slotLabel}: ${option.name}${option.available ? '' : ' (Unavailable)'}`;
	}

	function setIv(key: PokemonStatKey, value: string) {
		draftIvs = { ...draftIvs, [key]: value };
		publishDraftChange();
	}

	function setEv(key: PokemonStatKey, value: string) {
		draftEvs = { ...draftEvs, [key]: value };
		publishDraftChange();
	}

	function setFriendship(key: string, value: string) {
		draftFriendship = { ...draftFriendship, [key]: value };
		publishDraftChange();
	}

	function setMove(index: number, value: string) {
		const moveId = Number(value);
		const option = moveOptions.find((candidate) => candidate.id === moveId);
		if (!option) return;

		const moves = draftMoves.map((move) => ({ ...move }));
		moves[index] = {
			slot: index,
			move: option.id,
			pp: String(maxPpForPpUps(option.maxPp, 0)),
			ppUps: '0'
		};
		draftMoves = moves;
		publishDraftChange();
	}

	function setMovePp(index: number, value: string) {
		const moves = draftMoves.map((move) => ({ ...move }));
		moves[index] = { ...moves[index], pp: value };
		draftMoves = moves;
		publishDraftChange();
	}

	function setMovePpUps(index: number, value: string) {
		const moves = draftMoves.map((move) => ({ ...move }));
		moves[index] = { ...moves[index], ppUps: value };
		draftMoves = moves;
		publishDraftChange();
	}

	function setBattleField(key: string, value: string) {
		draftBattleFields = { ...draftBattleFields, [key]: Number(value) };
		publishDraftChange();
	}

	function setTrainerGender(value: string) {
		draftTrainerGenderId = Number(value);
		publishDraftChange();
	}

	function setPokemonLanguage(value: string) {
		draftLanguageId = Number(value);
		publishDraftChange();
	}

	function publishDraftChange() {
		queueMicrotask(() =>
			onDraftChange(createDraftSnapshot(), countDraftEdits() > 0, buildDraftEdits())
		);
	}

	function optionForMove(moveId: number) {
		return moveOptions.find((option) => option.id === moveId);
	}

	function maxPpForMove(move: DraftMoveSlot) {
		const option = optionForMove(move.move);
		const ppUps = parseDraftNumber(move.ppUps);
		return maxPpForPpUps(option?.maxPp ?? 0, Number.isInteger(ppUps) ? ppUps : 0);
	}

	function isInputEditing(id: string) {
		return editingInputId === id;
	}

	function activateDraftInput(id: string, selectValue = true) {
		editingInputId = id;
		void tick().then(() => {
			const input = document.getElementById(id);
			if (input instanceof HTMLElement) {
				input.focus();
				if (selectValue && input instanceof HTMLInputElement) input.select();
			}
		});
	}

	function deactivateDraftInput(id: string) {
		if (editingInputId === id) {
			editingInputId = null;
		}
	}

	function handleDraftInputKeydown(event: KeyboardEvent, id: string) {
		if (!isInputEditing(id) && (event.key === 'Enter' || event.key === ' ')) {
			event.preventDefault();
			event.stopPropagation();
			activateDraftInput(id);
			return;
		}

		if (isInputEditing(id) && event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			deactivateDraftInput(id);
		}
	}

	function handleEditorFieldActivation(event: PointerEvent | MouseEvent) {
		const target = event.target;
		if (target instanceof HTMLSelectElement && target.id && target.closest('.editor-content')) {
			activateDraftInput(target.id, false);
		}
	}

	function handleEditorFocusOut(event: FocusEvent) {
		if (event.target instanceof HTMLSelectElement) deactivateDraftInput(event.target.id);
	}

	function handleEditorFieldKeyup(event: KeyboardEvent) {
		if (
			event.key === 'Escape' &&
			event.target instanceof HTMLSelectElement &&
			isInputEditing(event.target.id)
		) {
			deactivateDraftInput(event.target.id);
		}
	}

	function attachEditorFields(node: HTMLDivElement) {
		node.addEventListener('pointerdown', handleEditorFieldActivation);
		node.addEventListener('click', handleEditorFieldActivation);
		node.addEventListener('focusout', handleEditorFocusOut);
		node.addEventListener('keyup', handleEditorFieldKeyup);
		return () => {
			node.removeEventListener('pointerdown', handleEditorFieldActivation);
			node.removeEventListener('click', handleEditorFieldActivation);
			node.removeEventListener('focusout', handleEditorFocusOut);
			node.removeEventListener('keyup', handleEditorFieldKeyup);
		};
	}

	function attachEditorRail(node: HTMLElement) {
		const revealActiveSection = () =>
			node
				.querySelector<HTMLElement>('[data-editor-rail-section][aria-current="page"]')
				?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		const observer = new ResizeObserver(revealActiveSection);
		observer.observe(node);
		for (const section of node.querySelectorAll('[data-editor-rail-section]')) {
			observer.observe(section);
		}
		return () => observer.disconnect();
	}

	function draftInputEditingValue(id: string) {
		return isInputEditing(id) ? 'true' : 'false';
	}

	function handleApply() {
		if (draftValidation) return;
		lastAppliedDraftSignature = currentDraftSignature;
		onApply(buildDraftEdits());
	}

	function handleCancelEdits() {
		resetDraftsFromSlot();
		lastAppliedDraftSignature = '';
		onCancelEdits();
	}

	function createDraftSignature() {
		return JSON.stringify(buildDraftEdits());
	}

	function createDraftSnapshot(): PokemonEditorDraftSnapshot {
		return {
			editMode,
			speciesId: draftSpeciesId,
			form: draftForm,
			nickname: draftNickname,
			level: draftLevel,
			experience: draftExperience,
			originalTrainerName: draftOriginalTrainerName,
			trainerId: draftTrainerId,
			secretId: draftSecretId,
			trainerGenderId: draftTrainerGenderId,
			languageId: draftLanguageId,
			natureId: draftNatureId,
			heldItemId: draftHeldItemId,
			abilityIndex: draftAbilityIndex,
			metLocationId: draftMetLocationId,
			metLevel: draftMetLevel,
			metDate: draftMetDate,
			originGameId: draftOriginGameId,
			ballId: draftBallId,
			ivs: { ...draftIvs },
			evs: { ...draftEvs },
			moves: draftMoves.map((move) => ({ ...move })),
			friendship: { ...draftFriendship },
			battleFields: { ...draftBattleFields }
		};
	}

	function validateDraftEditor(state: PokemonEditorState) {
		if (!draftDirty) return null;
		for (const edit of state.stagedEdits) {
			const result = createPokemonEditOperation({ ...state, stagedEdits: [edit] });
			if (!result.ok) {
				const target = pokemonEditorEditTarget(edit.id);
				return {
					message: result.message,
					section: target?.section ?? session.section,
					control: invalidEditControl(edit.id, target?.control)
				};
			}
		}
		return null;
	}

	function invalidEditControl(editId: string, fallback?: string) {
		if (editId === 'level-experience') {
			return editMode === 'level' ? 'pokemon-editor-level' : 'pokemon-editor-experience';
		}
		if (editId === 'move-set') {
			return invalidMoveControl() ?? fallback ?? `pokemon-editor-content-${session.section}`;
		}
		if (editId === 'ivs') {
			return invalidStatControl('iv') ?? fallback ?? `pokemon-editor-content-${session.section}`;
		}
		if (editId === 'evs') {
			return invalidStatControl('ev') ?? fallback ?? `pokemon-editor-content-${session.section}`;
		}
		if (editId === 'friendship') {
			const field = (friendshipEditConstraints?.fields ?? []).find((candidate) => {
				const value = parseDraftNumber(draftFriendship[candidate.key]);
				return !Number.isInteger(value) || value < candidate.min || value > candidate.max;
			});
			if (field) return `pokemon-editor-${field.key}`;
		}
		if (editId === 'met-data') {
			return invalidMetDataControl() ?? fallback ?? `pokemon-editor-content-${session.section}`;
		}
		if (editId === 'original-trainer') {
			return (
				invalidOriginalTrainerControl() ?? fallback ?? `pokemon-editor-content-${session.section}`
			);
		}
		if (editId === 'battle-fields') {
			const field = battleFields.find(
				(candidate) => draftBattleFields[candidate.key] !== candidate.value
			);
			if (field) return `pokemon-editor-battle-field-${field.key}`;
		}
		return fallback ?? `pokemon-editor-content-${session.section}`;
	}

	function invalidMoveControl() {
		const constraints = moveSetEditConstraints;
		if (!constraints) return null;
		const options = new Map(constraints.availableMoves.map((option) => [option.id, option]));
		for (const [index, move] of draftMoves.entries()) {
			const option = options.get(move.move);
			if (!option) return `pokemon-editor-move-${index}`;
			const ppUps = parseDraftNumber(move.ppUps);
			if (!Number.isInteger(ppUps) || ppUps < 0 || ppUps > 3) {
				return `pokemon-editor-move-${index}-pp-ups`;
			}
			const pp = parseDraftNumber(move.pp);
			const maxPp = maxPpForPpUps(option.maxPp, ppUps);
			if (!Number.isInteger(pp) || pp < 0 || pp > maxPp) {
				return `pokemon-editor-move-${index}-pp`;
			}
		}
		return null;
	}

	function invalidStatControl(kind: 'iv' | 'ev') {
		const constraints = statEditConstraints;
		if (!constraints) return null;
		const values = kind === 'iv' ? draftIvs : draftEvs;
		const min = kind === 'iv' ? constraints.minIv : constraints.minEv;
		const max = kind === 'iv' ? constraints.maxIv : constraints.maxEv;
		const invalid = statKeys.find((key) => {
			const value = parseDraftNumber(values[key]);
			return !Number.isInteger(value) || value < min || value > max;
		});
		if (invalid) return `pokemon-editor-${invalid.toLowerCase()}-${kind}`;
		if (kind === 'ev' && totalEvs > constraints.maxTotalEv) {
			const changed = statKeys.find((key) => values[key] !== String(baseEvs[key]));
			if (changed) return `pokemon-editor-${changed.toLowerCase()}-ev`;
		}
		return null;
	}

	function invalidMetDataControl() {
		const constraints = metDataEditConstraints;
		if (!constraints) return null;
		const level = parseDraftNumber(draftMetLevel);
		if (
			!Number.isInteger(level) ||
			level < constraints.minMetLevel ||
			level > constraints.maxMetLevel
		) {
			return 'pokemon-editor-met-level';
		}
		if (
			constraints.supportsOriginGame &&
			!constraints.originGames.some(({ id }) => id === draftOriginGameId)
		) {
			return 'pokemon-editor-origin-game';
		}
		const locations = constraints.locationGroups.find(
			({ originGameId }) => originGameId === draftOriginGameId
		)?.options;
		if (
			!Number.isInteger(draftMetLocationId) ||
			!locations?.some(({ id }) => id === draftMetLocationId)
		) {
			return 'pokemon-editor-met-location';
		}
		if (constraints.supportsBall && !constraints.balls.some(({ id }) => id === draftBallId)) {
			return 'pokemon-editor-ball';
		}
		if (constraints.supportsMetDate && draftMetDate.length > 0 && !validMetDate(draftMetDate)) {
			return 'pokemon-editor-met-date';
		}
		return null;
	}

	function invalidOriginalTrainerControl() {
		const constraints = originalTrainerEditConstraints;
		if (!constraints) return null;
		if (
			draftOriginalTrainerName.trim().length === 0 ||
			draftOriginalTrainerName.length > constraints.maxNameLength
		) {
			return 'pokemon-editor-original-trainer-name';
		}
		const trainerId = parseDraftNumber(draftTrainerId);
		if (
			!Number.isInteger(trainerId) ||
			trainerId < constraints.minTrainerId ||
			trainerId > constraints.maxTrainerId
		) {
			return 'pokemon-editor-trainer-id';
		}
		const secretId = parseDraftNumber(draftSecretId);
		if (
			constraints.supportsSecretId &&
			(!Number.isInteger(secretId) ||
				secretId < constraints.minTrainerId ||
				secretId > constraints.maxTrainerId)
		) {
			return 'pokemon-editor-secret-id';
		}
		if (
			constraints.supportsGender &&
			!constraints.genders.some(({ id }) => id === draftTrainerGenderId)
		) {
			return 'pokemon-editor-trainer-gender';
		}
		if (
			constraints.supportsLanguage &&
			!constraints.languages.some(({ id }) => id === draftLanguageId)
		) {
			return 'pokemon-editor-pokemon-language';
		}
		return null;
	}

	function controlLabel(control: string) {
		const stat = control.match(/pokemon-editor-(hp|atk|def|spa|spd|spe)-(iv|ev)$/i);
		if (stat) return `${stat[1].toUpperCase()} ${stat[2].toUpperCase()}`;
		const move = control.match(/pokemon-editor-move-(\d+)(?:-(pp|pp-ups))?$/);
		if (move) {
			const field = move[2] === 'pp-ups' ? ' PP Ups' : move[2] === 'pp' ? ' PP' : '';
			return `Move ${Number(move[1]) + 1}${field}`;
		}
		const friendship = friendshipEditConstraints?.fields.find(
			({ key }) => control === `pokemon-editor-${key}`
		);
		if (friendship) return friendship.label;
		return (
			{
				'pokemon-editor-species': 'Species',
				'pokemon-editor-form': 'Form',
				'pokemon-editor-nickname': 'Nickname',
				'pokemon-editor-nature': 'Nature',
				'pokemon-editor-held-item': 'Held Item',
				'pokemon-editor-ability': 'Ability',
				'pokemon-editor-met-location': 'Met location',
				'pokemon-editor-met-level': 'Met level',
				'pokemon-editor-origin-game': 'Origin game',
				'pokemon-editor-ball': 'Ball',
				'pokemon-editor-met-date': 'Met date',
				'pokemon-editor-original-trainer-name': 'Name',
				'pokemon-editor-trainer-id': 'Trainer ID',
				'pokemon-editor-secret-id': 'Secret ID',
				'pokemon-editor-trainer-gender': 'Gender',
				'pokemon-editor-pokemon-language': 'Pokemon language',
				'pokemon-editor-level': 'Level',
				'pokemon-editor-experience': 'Experience',
				'pokemon-editor-battle-field-tera-type': 'Tera Type'
			}[control] ?? 'Field'
		);
	}

	function deltaForEdit(edit: PokemonEditorState['stagedEdits'][number]) {
		const values = deltaValues(edit.id);
		return {
			id: edit.id,
			label: edit.label,
			before: values.before,
			after: values.after
		};
	}

	function deltaValues(editId: string): { before: string; after: string } {
		switch (editId) {
			case 'species-form':
				return {
					before: `${slot.speciesId ?? 'Unknown'} · form ${slot.form ?? 0}`,
					after: `${draftSpeciesId} · form ${draftForm}`
				};
			case 'nickname':
				return { before: slot.label, after: draftNickname || 'Default nickname' };
			case 'level-experience':
				return editMode === 'level'
					? { before: `Level ${slot.level ?? 'Unknown'}`, after: `Level ${draftLevel}` }
					: { before: `${slot.experience ?? 'Unknown'} EXP`, after: `${draftExperience} EXP` };
			case 'nature':
				return {
					before: slot.nature ?? 'Unknown',
					after:
						natureEditConstraints?.options.find(({ id }) => id === draftNatureId)?.name ??
						String(draftNatureId)
				};
			case 'held-item':
				return {
					before: slot.heldItem ?? 'None',
					after:
						heldItemEditConstraints?.options.find(({ id }) => id === draftHeldItemId)?.name ??
						'None'
				};
			case 'ability':
				return {
					before: slot.ability ?? 'Unknown',
					after:
						abilityEditConstraints?.options.find(({ index }) => index === draftAbilityIndex)
							?.name ?? String(draftAbilityIndex)
				};
			case 'met-data':
				return changedValueSummary([
					[
						'Met location',
						metLocationName(
							metDataEditConstraints?.currentOriginGameId ?? 0,
							metDataEditConstraints?.currentLocationId ?? 0
						),
						metLocationName(draftOriginGameId, draftMetLocationId)
					],
					['Met level', String(metDataEditConstraints?.currentMetLevel ?? 0), draftMetLevel],
					...(metDataEditConstraints?.supportsMetDate
						? ([
								[
									'Met date',
									metDataEditConstraints.currentMetDate ?? 'None',
									draftMetDate || 'None'
								]
							] as [string, string, string][])
						: []),
					...(metDataEditConstraints?.supportsOriginGame
						? ([
								[
									'Origin game',
									optionName(
										metDataEditConstraints.originGames,
										metDataEditConstraints.currentOriginGameId
									),
									optionName(metDataEditConstraints.originGames, draftOriginGameId)
								]
							] as [string, string, string][])
						: []),
					...(metDataEditConstraints?.supportsBall
						? ([
								[
									'Ball',
									optionName(metDataEditConstraints.balls, metDataEditConstraints.currentBallId),
									optionName(metDataEditConstraints.balls, draftBallId)
								]
							] as [string, string, string][])
						: [])
				]);
			case 'original-trainer':
				return changedValueSummary([
					[
						'Name',
						originalTrainerEditConstraints?.currentName ?? 'Unknown',
						draftOriginalTrainerName
					],
					[
						'Trainer ID',
						String(originalTrainerEditConstraints?.currentTrainerId ?? 0),
						draftTrainerId
					],
					...(originalTrainerEditConstraints?.supportsSecretId
						? ([
								['Secret ID', String(originalTrainerEditConstraints.currentSecretId), draftSecretId]
							] as [string, string, string][])
						: []),
					...(originalTrainerEditConstraints?.supportsGender
						? ([
								[
									'Gender',
									optionName(
										originalTrainerEditConstraints.genders,
										originalTrainerEditConstraints.currentGenderId
									),
									optionName(originalTrainerEditConstraints.genders, draftTrainerGenderId)
								]
							] as [string, string, string][])
						: []),
					...(originalTrainerEditConstraints?.supportsLanguage
						? ([
								[
									'Language',
									optionName(
										originalTrainerEditConstraints.languages,
										originalTrainerEditConstraints.currentLanguageId
									),
									optionName(originalTrainerEditConstraints.languages, draftLanguageId)
								]
							] as [string, string, string][])
						: [])
				]);
			case 'ivs':
				return { before: statSummary(baseIvs), after: statSummary(draftIvs) };
			case 'evs':
				return { before: statSummary(baseEvs), after: statSummary(draftEvs) };
			case 'move-set':
				return changedValueSummary(
					draftMoves.flatMap((move, index) => {
						const base = baseMoveSet.moves[index];
						return [
							[
								`Move ${index + 1}`,
								optionForMove(base?.move ?? 0)?.name ?? String(base?.move ?? 0),
								optionForMove(move.move)?.name ?? String(move.move)
							],
							[`Move ${index + 1} PP`, String(base?.pp ?? 0), move.pp],
							[`Move ${index + 1} PP Ups`, String(base?.ppUps ?? 0), move.ppUps]
						] satisfies [string, string, string][];
					})
				);
			case 'friendship':
				return { before: valueSummary(baseFriendship), after: valueSummary(draftFriendship) };
			case 'battle-fields':
				return {
					before: battleFields.map(({ label, value }) => `${label} ${value}`).join(', '),
					after: battleFields
						.map(({ key, label }) => `${label} ${draftBattleFields[key]}`)
						.join(', ')
				};
			default:
				return { before: 'Current value', after: 'Staged value' };
		}
	}

	function statSummary(values: Record<string, string | number>) {
		return statKeys.map((key) => `${key} ${values[key]}`).join(' · ');
	}

	function valueSummary(values: Record<string, string>) {
		return Object.values(values).join(' · ');
	}

	function changedValueSummary(values: [string, string, string][]) {
		const changed = values.filter(([, before, after]) => before !== after);
		return {
			before: changed.map(([label, before]) => `${label}: ${before}`).join(' · '),
			after: changed.map(([label, , after]) => `${label}: ${after}`).join(' · ')
		};
	}

	function optionName(options: { id: number; name: string }[], id: number) {
		return options.find((option) => option.id === id)?.name ?? String(id);
	}

	function metLocationName(originGameId: number, locationId: number) {
		const options = metDataEditConstraints?.locationGroups.find(
			(group) => group.originGameId === originGameId
		)?.options;
		return optionName(options ?? [], locationId);
	}

	function validMetDate(value: string) {
		if (!/^2\d{3}-\d{2}-\d{2}$/.test(value)) return false;
		const parsed = new Date(`${value}T00:00:00Z`);
		const year = Number(value.slice(0, 4));
		return (
			year >= 2000 &&
			year <= 2255 &&
			!Number.isNaN(parsed.valueOf()) &&
			parsed.toISOString().slice(0, 10) === value
		);
	}

	function isEditDirty(id: string) {
		return stagedEditIds.has(id);
	}

	function isSectionDirty(section: PokemonEditorSectionId) {
		return stagedDraftEditor.stagedEdits.some(
			({ id }) => pokemonEditorEditTarget(id)?.section === section
		);
	}

	function isControlInvalid(id: string) {
		return draftValidation?.control === id;
	}

	function isMoveFieldDirty(index: number, field: 'move' | 'pp' | 'ppUps') {
		const move = draftMoves[index];
		const base = baseMoveSet.moves[index];
		if (!move) return false;
		if (field === 'move') return move.move !== base?.move;
		if (field === 'pp') return move.pp !== String(base?.pp ?? 0);
		return move.ppUps !== String(base?.ppUps ?? 0);
	}

	function handleEditorFocus(event: FocusEvent) {
		if (!(event.target instanceof HTMLElement)) return;
		if (session.view === 'discard') {
			if (
				event.target.id === 'pokemon-editor-keep-editing' ||
				event.target.id === 'pokemon-editor-discard-edits'
			) {
				onFocusChange({ zone: 'discard', control: event.target.id });
			}
			return;
		}
		const railSection = event.target.dataset.editorRailSection as
			| PokemonEditorSectionId
			| undefined;
		if (railSection) {
			onFocusChange({ zone: 'rail', section: railSection });
			return;
		}
		if (event.target.closest('.editor-actions') || event.target.id === 'pokemon-editor-close') {
			onFocusChange({ zone: 'content', section: session.section, control: event.target.id });
			return;
		}
		if (session.view === 'review') {
			onFocusChange({ zone: 'review', control: 'pokemon-editor-review-close' });
			return;
		}
		if (event.target.closest('.editor-content')) {
			onFocusChange({ zone: 'content', section: session.section, control: event.target.id });
		}
	}

	function resetDraftsFromSlot() {
		draftSpeciesId = slot.speciesId ?? 0;
		draftForm = slot.form ?? 0;
		draftNickname = slot.label;
		draftLevel = String(slot.level ?? 1);
		draftExperience = String(slot.experience ?? 0);
		draftOriginalTrainerName = originalTrainerEditConstraints?.currentName ?? '';
		draftTrainerId = String(originalTrainerEditConstraints?.currentTrainerId ?? 0);
		draftSecretId = String(originalTrainerEditConstraints?.currentSecretId ?? 0);
		draftTrainerGenderId = originalTrainerEditConstraints?.currentGenderId ?? 0;
		draftLanguageId = originalTrainerEditConstraints?.currentLanguageId ?? 0;
		draftNatureId = slot.natureEditConstraints?.currentNatureId ?? -1;
		draftHeldItemId = slot.heldItemEditConstraints?.currentItemId ?? 0;
		draftAbilityIndex = slot.abilityEditConstraints?.currentAbilityIndex ?? -1;
		draftMetLocationId = metDataEditConstraints?.currentLocationId ?? 0;
		draftMetLevel = String(metDataEditConstraints?.currentMetLevel ?? 0);
		draftMetDate = metDataEditConstraints?.currentMetDate ?? '';
		draftOriginGameId = metDataEditConstraints?.currentOriginGameId ?? 0;
		draftBallId = metDataEditConstraints?.currentBallId ?? 0;
		draftIvs = statsToDraft(baseIvs);
		draftEvs = statsToDraft(baseEvs);
		draftMoves = baseMoveSet.moves.map((move) => ({
			slot: move.slot,
			move: move.move,
			pp: String(move.pp ?? 0),
			ppUps: String(move.ppUps ?? 0)
		}));
		draftFriendship = { ...baseFriendship };
		draftBattleFields = battleFieldsToDraft(battleFields);
		publishDraftChange();
	}

	function countDraftEdits() {
		let count = 0;
		if (isSpeciesFormDirty()) count += 1;
		if (draftNickname !== slot.label) count += 1;
		if (isLevelExperienceDirty()) count += 1;
		if (isNatureDirty()) count += 1;
		if (isHeldItemDirty()) count += 1;
		if (isAbilityDirty()) count += 1;
		if (isMetDataDirty()) count += 1;
		if (isOriginalTrainerDirty()) count += 1;
		if (isDraftStatsDirty(draftIvs, baseIvs)) count += 1;
		if (isDraftStatsDirty(draftEvs, baseEvs)) count += 1;
		if (isDraftMoveSetDirty()) count += 1;
		if (isDraftFriendshipDirty()) count += 1;
		count += changedBattleFields().length;
		return count;
	}

	function buildDraftEdits(): PokemonEditorDraftEdits {
		const draft: PokemonEditorDraftEdits = {};
		if (isSpeciesFormDirty()) {
			draft.speciesForm = { speciesId: draftSpeciesId, form: draftForm };
		}
		if (draftNickname !== slot.label) draft.nickname = draftNickname;
		if (isLevelExperienceDirty()) {
			draft.levelExperience =
				editMode === 'level'
					? { mode: 'level', level: parseDraftNumber(draftLevel) }
					: { mode: 'experience', experience: parseDraftNumber(draftExperience) };
		}
		if (isNatureDirty()) draft.natureId = draftNatureId;
		if (isHeldItemDirty()) draft.heldItemId = draftHeldItemId;
		if (isAbilityDirty()) draft.abilityIndex = draftAbilityIndex;
		if (isMetDataDirty()) draft.metData = draftMetDataToPayload();
		if (isOriginalTrainerDirty() && originalTrainerEditConstraints) {
			draft.originalTrainer = {
				name: draftOriginalTrainerName,
				trainerId: parseDraftNumber(draftTrainerId)
			};
			if (originalTrainerEditConstraints.supportsSecretId) {
				draft.originalTrainer.secretId = parseDraftNumber(draftSecretId);
			}
			if (originalTrainerEditConstraints.supportsGender) {
				draft.originalTrainer.genderId = draftTrainerGenderId;
			}
			if (originalTrainerEditConstraints.supportsLanguage) {
				draft.originalTrainer.languageId = draftLanguageId;
			}
		}
		if (isDraftStatsDirty(draftIvs, baseIvs)) draft.ivs = draftStatsToPayload(draftIvs);
		if (isDraftStatsDirty(draftEvs, baseEvs)) draft.evs = draftStatsToPayload(draftEvs);
		if (isDraftMoveSetDirty()) draft.moveSet = draftMoveSetToPayload();
		if (isDraftFriendshipDirty()) {
			draft.friendship = {
				fields: (friendshipEditConstraints?.fields ?? [])
					.filter((field) => draftFriendship[field.key] !== String(field.value))
					.map((field) => ({ key: field.key, value: parseDraftNumber(draftFriendship[field.key]) }))
			};
		}
		const battleFieldEdits = changedBattleFields();
		if (battleFieldEdits.length > 0) draft.battleFields = { fields: battleFieldEdits };
		return draft;
	}

	function isSpeciesFormDirty() {
		return draftSpeciesId !== slot.speciesId || draftForm !== (slot.form ?? 0);
	}

	function isLevelExperienceDirty() {
		return editMode === 'level'
			? draftLevel !== String(slot.level ?? 1)
			: draftExperience !== String(slot.experience ?? 0);
	}

	function isOriginalTrainerDirty() {
		const constraints = originalTrainerEditConstraints;
		return (
			constraints !== undefined &&
			(draftOriginalTrainerName !== constraints.currentName ||
				draftTrainerId !== String(constraints.currentTrainerId) ||
				(constraints.supportsSecretId && draftSecretId !== String(constraints.currentSecretId)) ||
				(constraints.supportsGender && draftTrainerGenderId !== constraints.currentGenderId) ||
				(constraints.supportsLanguage && draftLanguageId !== constraints.currentLanguageId))
		);
	}

	function isNatureDirty() {
		return draftNatureId !== (natureEditConstraints?.currentNatureId ?? -1);
	}

	function isHeldItemDirty() {
		return draftHeldItemId !== (heldItemEditConstraints?.currentItemId ?? 0);
	}

	function isAbilityDirty() {
		return draftAbilityIndex !== (abilityEditConstraints?.currentAbilityIndex ?? -1);
	}

	function isMetDataDirty() {
		return (
			draftMetLocationId !== (metDataEditConstraints?.currentLocationId ?? 0) ||
			draftMetLevel !== String(metDataEditConstraints?.currentMetLevel ?? 0) ||
			draftMetDate !== (metDataEditConstraints?.currentMetDate ?? '') ||
			draftOriginGameId !== (metDataEditConstraints?.currentOriginGameId ?? 0) ||
			draftBallId !== (metDataEditConstraints?.currentBallId ?? 0)
		);
	}

	function draftMetDataToPayload(): PokemonMetDataEditPayload {
		return {
			locationId: draftMetLocationId,
			metLevel: parseDraftNumber(draftMetLevel),
			...(metDataEditConstraints?.supportsMetDate
				? { metDate: draftMetDate.length > 0 ? draftMetDate : null }
				: {}),
			...(metDataEditConstraints?.supportsOriginGame ? { originGameId: draftOriginGameId } : {}),
			...(metDataEditConstraints?.supportsBall ? { ballId: draftBallId } : {})
		};
	}

	function isDraftStatsDirty(draft: DraftStats, base: PokemonStatEditPayload) {
		return statKeys.some((key) => draft[key] !== String(base[key]));
	}

	function isDraftMoveSetDirty() {
		return draftMoves.some((move, index) => {
			const base = baseMoveSet.moves[index];
			return (
				move.move !== (base?.move ?? 0) ||
				move.pp !== String(base?.pp ?? 0) ||
				move.ppUps !== String(base?.ppUps ?? 0)
			);
		});
	}

	function isDraftFriendshipDirty() {
		return (friendshipEditConstraints?.fields ?? []).some(
			(field) => draftFriendship[field.key] !== String(field.value)
		);
	}

	function changedBattleFields() {
		return battleFields
			.filter((field) => draftBattleFields[field.key] !== field.value)
			.map((field) => ({
				key: field.key,
				value: draftBattleFields[field.key] ?? Number.NaN
			}));
	}

	function draftStatsToPayload(draft: DraftStats): PokemonStatEditPayload {
		return Object.fromEntries(
			statKeys.map((key) => [key, parseDraftNumber(draft[key])])
		) as PokemonStatEditPayload;
	}

	function draftMoveSetToPayload(): PokemonMoveSetEditPayload {
		return {
			moves: draftMoves.map((move, index) => ({
				slot: index,
				move: move.move,
				pp: parseDraftNumber(move.pp),
				ppUps: parseDraftNumber(move.ppUps)
			}))
		};
	}

	function statsToDraft(stats: PokemonStatEditPayload): DraftStats {
		return Object.fromEntries(statKeys.map((key) => [key, String(stats[key])])) as DraftStats;
	}

	function battleFieldsToDraft(fields: PokemonBattleFieldProjection[]) {
		return Object.fromEntries(fields.map((field) => [field.key, field.value]));
	}

	function parseDraftNumber(value: string) {
		if (value.trim() === '') return Number.NaN;
		return Number(value);
	}
</script>

<div
	{@attach attachEditorFields}
	class="pokemon-editor pksx-density"
	style={slotHueStyle}
	data-editor-section={session.section}
	data-editor-entered-field={editingInputId ?? undefined}
	onfocusin={handleEditorFocus}
>
	<header class="editor-header">
		<div class="editor-identity">
			{#if spriteUrl}
				<img src={spriteUrl} alt="" width="48" height="48" />
			{/if}
			<div>
				<p>{sourceLabel}</p>
				<h2 id="pokemon-editor-title">{mode === 'create' ? 'New Pokemon' : slot.label}</h2>
				<div class="identity-line">
					<span>{editor.source.location}</span>
					<strong>{speciesLabel}</strong>
					{#if slot.level !== null}<span>Lv. {slot.level}</span>{/if}
					{#if spriteIdentityLabels.form}<span>{spriteIdentityLabels.form}</span>{/if}
					{#if spriteIdentityLabels.shiny}<span>{spriteIdentityLabels.shiny}</span>{/if}
				</div>
			</div>
		</div>
		<button
			id="pokemon-editor-close"
			type="button"
			class="icon-close"
			aria-label="Close Pokemon Editor"
			onclick={onClose}
		>
			×
		</button>
	</header>

	{#if session.view === 'discard'}
		<section class="editor-internal-state" aria-labelledby="pokemon-editor-discard-title">
			<p>Discard staged edits?</p>
			<h3 id="pokemon-editor-discard-title">Keep this Pokemon Editor session?</h3>
			<span id="pokemon-editor-status">
				{mode === 'create'
					? 'This unpublished Pokemon will be lost.'
					: `${draftEditCount} staged ${draftEditCount === 1 ? 'change' : 'changes'} will be lost.`}
			</span>
			<div class="internal-actions">
				<button id="pokemon-editor-keep-editing" type="button" onclick={onKeepEditing}
					>Keep editing</button
				>
				<button id="pokemon-editor-discard-edits" type="button" class="danger" onclick={onDiscard}
					>Discard edits</button
				>
			</div>
		</section>
	{:else}
		<div class="editor-body">
			<nav {@attach attachEditorRail} class="editor-rail" aria-label="Pokemon Editor sections">
				{#each pokemonEditorSections as section (section.id)}
					<button
						id={`pokemon-editor-section-${section.id}`}
						type="button"
						class:active={session.section === section.id}
						aria-current={session.section === section.id ? 'page' : undefined}
						data-editor-rail-section={section.id}
						onclick={() => onSelectSection(section.id)}
					>
						<span>{section.label}</span>
						{#if isSectionDirty(section.id)}<i aria-label="Staged edits"></i>{/if}
					</button>
				{/each}
			</nav>

			<main class="editor-content">
				{#if session.view === 'review'}
					<section class="delta-review" aria-labelledby="pokemon-editor-review-title">
						<div class="panel-title">
							<h3 id="pokemon-editor-review-title">Staged edit review</h3>
							<button id="pokemon-editor-review-close" type="button" onclick={onKeepEditing}
								>Done</button
							>
						</div>
						<div class="delta-list">
							{#each deltaRows as delta (delta.id)}
								<article>
									<strong>{delta.label}</strong>
									<span>{delta.before}</span>
									<i aria-hidden="true">→</i>
									<b>{delta.after}</b>
								</article>
							{/each}
						</div>
					</section>
				{:else}
					<div
						id={`pokemon-editor-content-${session.section}`}
						class="editor-summary"
						tabindex="-1"
						aria-label={`${pokemonEditorSections.find(({ id }) => id === session.section)?.label} section`}
					>
						{#if session.section === 'species-form' && identityRows.length > 0}
							<div class="field-grid" aria-label="Projected Pokemon fields">
								{#each identityRows as row (row.label)}
									<span>{row.label}</span>
									<strong>{row.value}</strong>
								{/each}
							</div>
						{/if}

						<div
							class="editor-panel"
							aria-label="Species and Form Editing"
							data-editor-active={session.section === 'species-form'}
						>
							<div class="panel-title">
								<span>Species / Form</span>
								<small>{speciesFormProjection ? 'Engine choices' : 'Unavailable'}</small>
							</div>
							{#if speciesFormProjection}
								<div class="species-form-controls">
									<label>
										<span>Species</span>
										<select
											id="pokemon-editor-species"
											class:staged-field={draftSpeciesId !== slot.speciesId}
											aria-invalid={isControlInvalid('pokemon-editor-species')}
											aria-describedby={isControlInvalid('pokemon-editor-species')
												? 'pokemon-editor-status'
												: undefined}
											value={draftSpeciesId}
											disabled={applying || speciesFormLoading}
											onchange={handleSpeciesChange}
										>
											{#each speciesFormProjection.availableSpecies as species (species.id)}
												<option value={species.id}>{species.name}</option>
											{/each}
										</select>
									</label>
									<label>
										<span>Form</span>
										<select
											id="pokemon-editor-form"
											class:staged-field={draftForm !== (slot.form ?? 0)}
											value={draftForm}
											disabled={applying || speciesFormLoading}
											onchange={handleFormChange}
										>
											{#each speciesFormProjection.availableForms as form (form.id)}
												<option value={form.id}>{form.name}</option>
											{/each}
										</select>
									</label>
								</div>
								<div class="species-form-preview" aria-live="polite">
									{#if speciesFormLoading || !speciesFormPreview}
										<p>Loading PKHeX cascade preview...</p>
									{:else}
										<strong>{speciesFormPreview.speciesName} · {speciesFormPreview.formName}</strong
										>
										<span class:illegal={!speciesFormPreview.legal}
											>{speciesFormPreview.legal
												? 'Legal preview'
												: 'Legality issues expected'}</span
										>
										<ul>
											{#each speciesFormPreview.consequences as consequence (consequence)}
												<li>{consequence}</li>
											{/each}
										</ul>
									{/if}
								</div>
							{:else}
								<p class="unsupported-copy">
									{speciesFormError ??
										'Species and Form Editing is not supported for this Pokemon.'}
								</p>
							{/if}
						</div>

						{#if battleFields.length > 0}
							<div
								class="editor-panel"
								aria-label="Generation-Specific Battle Field Editing"
								data-editor-active={session.section === 'species-form'}
							>
								<div class="panel-title">
									<span>Battle Fields</span>
									<small
										>{battleFields.some((field) => field.supported)
											? 'Editable'
											: 'Unsupported'}</small
									>
								</div>
								<div class="battle-field-controls">
									{#each battleFields as field (field.key)}
										<label>
											<span>{field.label}</span>
											<select
												id={`pokemon-editor-battle-field-${field.key}`}
												class:staged-field={draftBattleFields[field.key] !== field.value}
												aria-invalid={isControlInvalid(`pokemon-editor-battle-field-${field.key}`)}
												aria-describedby={isControlInvalid(
													`pokemon-editor-battle-field-${field.key}`
												)
													? 'pokemon-editor-status'
													: undefined}
												value={draftBattleFields[field.key]}
												disabled={!field.supported || applying}
												onchange={(event) => setBattleField(field.key, event.currentTarget.value)}
											>
												{#each field.options as option (option.value)}
													<option value={option.value}>{option.label}</option>
												{/each}
											</select>
										</label>
										{#if !field.supported && field.unsupportedReason}
											<p>{field.unsupportedReason}</p>
										{/if}
									{/each}
								</div>
							</div>
						{/if}

						<div
							class="editor-panel nickname-panel"
							aria-label="Nickname Editing"
							data-editor-active={session.section === 'nickname'}
						>
							<div class="panel-title">
								<span>Nickname</span>
								<small>Engine validated</small>
							</div>
							<label class="nickname-field">
								<span>Nickname</span>
								<input
									id="pokemon-editor-nickname"
									class:staged-field={isEditDirty('nickname')}
									aria-invalid={isControlInvalid('pokemon-editor-nickname')}
									type="text"
									value={draftNickname}
									autocomplete="off"
									disabled={applying}
									readonly={!isInputEditing('pokemon-editor-nickname')}
									data-controller-editing={draftInputEditingValue('pokemon-editor-nickname')}
									aria-describedby={isControlInvalid('pokemon-editor-nickname')
										? 'pokemon-editor-nickname-hint pokemon-editor-status'
										: 'pokemon-editor-nickname-hint'}
									onpointerdown={() => activateDraftInput('pokemon-editor-nickname', false)}
									onclick={() => activateDraftInput('pokemon-editor-nickname', false)}
									onblur={() => deactivateDraftInput('pokemon-editor-nickname')}
									onkeydown={(event) => handleDraftInputKeydown(event, 'pokemon-editor-nickname')}
									oninput={handleNicknameInput}
								/>
							</label>
							<p id="pokemon-editor-nickname-hint">
								Leave empty to restore the default species nickname.
							</p>
						</div>

						<div
							class="editor-panel"
							aria-label="Nature Editing"
							data-editor-active={session.section === 'nature'}
						>
							<div class="panel-title">
								<span>Nature</span>
								<small>{canEditNature ? 'Engine constrained' : 'Unsupported'}</small>
							</div>
							{#if canEditNature}
								<div class="nature-edit-summary">
									<span
										>{natureEditConstraints?.usesStatNature
											? 'Original Nature'
											: 'Current Nature'}</span
									>
									<strong>{originalNature?.name ?? slot.nature ?? 'Unknown'}</strong>
									{#if natureEditConstraints?.usesStatNature}
										<span>Stat Nature</span>
										<strong>{statNature?.name ?? 'Unknown'}</strong>
									{/if}
								</div>
								<label class="nature-edit-controls">
									<span>Nature choice</span>
									<select
										id="pokemon-editor-nature"
										class:staged-field={isEditDirty('nature')}
										aria-invalid={isControlInvalid('pokemon-editor-nature')}
										aria-describedby={isControlInvalid('pokemon-editor-nature')
											? 'pokemon-editor-status'
											: undefined}
										value={draftNatureId}
										disabled={applying}
										onchange={(event) => setDraftNature(event.currentTarget.value)}
									>
										{#each natureEditConstraints?.options ?? [] as option (option.id)}
											<option value={option.id}>{option.name} — {option.effect}</option>
										{/each}
									</select>
								</label>
								<p class="nature-edit-hint">
									{natureEditConstraints?.usesStatNature
										? 'Changes the stat Nature while preserving the original Nature.'
										: 'Changes the underlying Nature for this Pokemon format.'}
								</p>
							{:else}
								<p class="unsupported-copy">
									{natureEditConstraints?.unsupportedReason ??
										'Nature Editing is not supported for this Pokemon format.'}
								</p>
							{/if}
						</div>

						<div
							class="editor-panel"
							aria-label="Held Item Editing"
							data-editor-active={session.section === 'held-item'}
						>
							<div class="panel-title">
								<span>Held Item</span>
								<small>{canEditHeldItem ? 'Engine constrained' : 'Unsupported'}</small>
							</div>
							{#if heldItemEditConstraints && heldItemEditConstraints.options.length > 0}
								<label class="held-item-edit-controls">
									<span>Held Item choice</span>
									<select
										id="pokemon-editor-held-item"
										class:staged-field={isEditDirty('held-item')}
										aria-invalid={isControlInvalid('pokemon-editor-held-item')}
										aria-describedby={isControlInvalid('pokemon-editor-held-item')
											? 'pokemon-editor-status'
											: undefined}
										value={draftHeldItemId}
										disabled={!canEditHeldItem || applying}
										onchange={(event) => setDraftHeldItem(event.currentTarget.value)}
									>
										{#each heldItemEditConstraints.options as option (option.id)}
											<option value={option.id} disabled={!option.available}>
												{heldItemOptionLabel(option)}
											</option>
										{/each}
									</select>
								</label>
								<p class="held-item-restrictions">
									{#if draftHeldItemId === 0}
										No item is selected.
									{:else if unavailableHeldItemCount > 0}
										{unavailableHeldItemCount} item
										{unavailableHeldItemCount === 1 ? 'is' : 'choices are'} unavailable for this Pokemon
										Entity format.
									{:else}
										Choices are limited to the active Save File and Pokemon Entity format.
									{/if}
								</p>
							{:else}
								<p class="unsupported-copy">
									{heldItemEditConstraints?.unsupportedReason ??
										'Held Item Editing is not supported for this Pokemon Entity format.'}
								</p>
							{/if}
						</div>

						<div
							class="editor-panel"
							aria-label="Ability Editing"
							data-editor-active={session.section === 'ability'}
						>
							<div class="panel-title">
								<span>Ability</span>
								<small>{canEditAbility ? 'Engine constrained' : 'Unsupported'}</small>
							</div>
							{#if abilityEditConstraints && abilityEditConstraints.options.length > 0}
								<label class="ability-edit-controls">
									<span>Ability choice</span>
									<select
										id="pokemon-editor-ability"
										class:staged-field={isEditDirty('ability')}
										aria-invalid={isControlInvalid('pokemon-editor-ability')}
										aria-describedby={isControlInvalid('pokemon-editor-ability')
											? 'pokemon-editor-status'
											: undefined}
										value={draftAbilityIndex}
										disabled={!canEditAbility || applying}
										onchange={(event) => setDraftAbility(event.currentTarget.value)}
									>
										{#each abilityEditConstraints.options as option (option.index)}
											<option value={option.index} disabled={!option.available}>
												{abilityOptionLabel(option)}
											</option>
										{/each}
									</select>
								</label>
								{#if unavailableAbilityOptions.length > 0}
									<ul class="ability-restrictions" aria-label="Unavailable Ability choices">
										{#each unavailableAbilityOptions as option (option.index)}
											<li>{option.unavailableReason ?? `${option.name} is unavailable.`}</li>
										{/each}
									</ul>
								{/if}
							{:else}
								<p class="unsupported-copy">
									{abilityEditConstraints?.unsupportedReason ??
										'Ability Editing is not supported for this Pokemon format.'}
								</p>
							{/if}
						</div>

						<div
							class="editor-panel"
							aria-label="Met Data Editing"
							data-editor-active={session.section === 'met-data'}
						>
							<div class="panel-title">
								<span>Met Data</span>
								<small>{canEditMetData ? 'Engine constrained' : 'Unsupported'}</small>
							</div>
							{#if canEditMetData}
								<div class="met-data-edit-controls">
									<label>
										<span>Met location</span>
										<select
											id="pokemon-editor-met-location"
											class:staged-field={draftMetLocationId !==
												metDataEditConstraints?.currentLocationId}
											aria-invalid={isControlInvalid('pokemon-editor-met-location')}
											aria-describedby={isControlInvalid('pokemon-editor-met-location')
												? 'pokemon-editor-status'
												: undefined}
											value={draftMetLocationId}
											disabled={applying || metLocationOptions.length === 0}
											onchange={(event) => setDraftMetLocation(event.currentTarget.value)}
										>
											{#each metLocationOptions as option (option.id)}
												<option value={option.id}>{option.name}</option>
											{/each}
										</select>
									</label>
									<label>
										<span>Met level</span>
										<input
											id="pokemon-editor-met-level"
											class:staged-field={draftMetLevel !==
												String(metDataEditConstraints?.currentMetLevel ?? 0)}
											aria-invalid={isControlInvalid('pokemon-editor-met-level')}
											aria-describedby={isControlInvalid('pokemon-editor-met-level')
												? 'pokemon-editor-status'
												: undefined}
											type="number"
											min={metDataEditConstraints?.minMetLevel ?? 0}
											max={metDataEditConstraints?.maxMetLevel ?? 100}
											step="1"
											value={draftMetLevel}
											disabled={applying}
											readonly={!isInputEditing('pokemon-editor-met-level')}
											data-controller-editing={draftInputEditingValue('pokemon-editor-met-level')}
											onpointerdown={() => activateDraftInput('pokemon-editor-met-level', false)}
											onclick={() => activateDraftInput('pokemon-editor-met-level', false)}
											onblur={() => deactivateDraftInput('pokemon-editor-met-level')}
											onkeydown={(event) =>
												handleDraftInputKeydown(event, 'pokemon-editor-met-level')}
											oninput={(event) => setDraftMetLevel(event.currentTarget.value)}
										/>
									</label>
									{#if metDataEditConstraints?.supportsOriginGame}
										<label>
											<span>Origin game</span>
											<select
												id="pokemon-editor-origin-game"
												class:staged-field={draftOriginGameId !==
													metDataEditConstraints.currentOriginGameId}
												aria-invalid={isControlInvalid('pokemon-editor-origin-game')}
												aria-describedby={isControlInvalid('pokemon-editor-origin-game')
													? 'pokemon-editor-status'
													: undefined}
												value={draftOriginGameId}
												disabled={applying}
												onchange={(event) => setDraftOriginGame(event.currentTarget.value)}
											>
												{#each metDataEditConstraints.originGames as option (option.id)}
													<option value={option.id}>{option.name}</option>
												{/each}
											</select>
										</label>
									{/if}
									{#if metDataEditConstraints?.supportsBall}
										<label>
											<span>Ball</span>
											<select
												id="pokemon-editor-ball"
												class:staged-field={draftBallId !== metDataEditConstraints.currentBallId}
												aria-invalid={isControlInvalid('pokemon-editor-ball')}
												aria-describedby={isControlInvalid('pokemon-editor-ball')
													? 'pokemon-editor-status'
													: undefined}
												value={draftBallId}
												disabled={applying}
												onchange={(event) => setDraftBall(event.currentTarget.value)}
											>
												{#each metDataEditConstraints.balls as option (option.id)}
													<option value={option.id}>{option.name}</option>
												{/each}
											</select>
										</label>
									{/if}
									{#if metDataEditConstraints?.supportsMetDate}
										<label>
											<span>Met date</span>
											<input
												id="pokemon-editor-met-date"
												class:staged-field={draftMetDate !==
													(metDataEditConstraints.currentMetDate ?? '')}
												aria-invalid={isControlInvalid('pokemon-editor-met-date')}
												aria-describedby={isControlInvalid('pokemon-editor-met-date')
													? 'pokemon-editor-status'
													: undefined}
												type="date"
												min="2000-01-01"
												max="2255-12-31"
												value={draftMetDate}
												disabled={applying}
												readonly={!isInputEditing('pokemon-editor-met-date')}
												data-controller-editing={draftInputEditingValue('pokemon-editor-met-date')}
												onpointerdown={() => activateDraftInput('pokemon-editor-met-date', false)}
												onclick={() => activateDraftInput('pokemon-editor-met-date', false)}
												onblur={() => deactivateDraftInput('pokemon-editor-met-date')}
												onkeydown={(event) =>
													handleDraftInputKeydown(event, 'pokemon-editor-met-date')}
												oninput={(event) => setDraftMetDate(event.currentTarget.value)}
											/>
										</label>
									{/if}
								</div>
								<p class="met-data-hint">
									Location, origin game, and ball choices come from the PKHeX Engine. Invalid
									encounter combinations remain staged.
								</p>
							{:else}
								<p class="unsupported-copy">
									{metDataEditConstraints?.unsupportedReason ??
										'Met Data Editing is not supported for this Pokemon Entity format.'}
								</p>
							{/if}
						</div>

						<div
							class="editor-panel"
							aria-label="Original Trainer Data Editing"
							data-editor-active={session.section === 'original-trainer'}
						>
							<div class="panel-title">
								<span>Original Trainer</span>
								<small>{canEditOriginalTrainer ? 'Engine validated' : 'Unsupported'}</small>
							</div>
							{#if canEditOriginalTrainer && originalTrainerEditConstraints}
								<div class="trainer-edit-controls">
									<label class="trainer-name-field">
										<span>Name</span>
										<input
											id="pokemon-editor-original-trainer-name"
											class:staged-field={draftOriginalTrainerName !==
												originalTrainerEditConstraints.currentName}
											aria-invalid={isControlInvalid('pokemon-editor-original-trainer-name')}
											aria-describedby={isControlInvalid('pokemon-editor-original-trainer-name')
												? 'pokemon-editor-status'
												: undefined}
											type="text"
											maxlength={originalTrainerEditConstraints.maxNameLength}
											value={draftOriginalTrainerName}
											disabled={applying}
											readonly={!isInputEditing('pokemon-editor-original-trainer-name')}
											data-controller-editing={draftInputEditingValue(
												'pokemon-editor-original-trainer-name'
											)}
											onpointerdown={() =>
												activateDraftInput('pokemon-editor-original-trainer-name', false)}
											onclick={() =>
												activateDraftInput('pokemon-editor-original-trainer-name', false)}
											onblur={() => deactivateDraftInput('pokemon-editor-original-trainer-name')}
											onkeydown={(event) =>
												handleDraftInputKeydown(event, 'pokemon-editor-original-trainer-name')}
											oninput={(event) => {
												const target = event.currentTarget;
												if (target instanceof HTMLInputElement)
													setDraftOriginalTrainerName(target.value);
											}}
										/>
									</label>
									<label>
										<span>Trainer ID</span>
										<input
											id="pokemon-editor-trainer-id"
											class:staged-field={draftTrainerId !==
												String(originalTrainerEditConstraints.currentTrainerId)}
											aria-invalid={isControlInvalid('pokemon-editor-trainer-id')}
											aria-describedby={isControlInvalid('pokemon-editor-trainer-id')
												? 'pokemon-editor-status'
												: undefined}
											type="number"
											min={originalTrainerEditConstraints.minTrainerId}
											max={originalTrainerEditConstraints.maxTrainerId}
											step="1"
											value={draftTrainerId}
											disabled={applying}
											readonly={!isInputEditing('pokemon-editor-trainer-id')}
											data-controller-editing={draftInputEditingValue('pokemon-editor-trainer-id')}
											onpointerdown={() => activateDraftInput('pokemon-editor-trainer-id', false)}
											onclick={() => activateDraftInput('pokemon-editor-trainer-id', false)}
											onblur={() => deactivateDraftInput('pokemon-editor-trainer-id')}
											onkeydown={(event) =>
												handleDraftInputKeydown(event, 'pokemon-editor-trainer-id')}
											oninput={(event) => {
												const target = event.currentTarget;
												if (target instanceof HTMLInputElement) setDraftTrainerId(target.value);
											}}
										/>
									</label>
									{#if originalTrainerEditConstraints.supportsSecretId}
										<label>
											<span>Secret ID</span>
											<input
												id="pokemon-editor-secret-id"
												class:staged-field={draftSecretId !==
													String(originalTrainerEditConstraints.currentSecretId)}
												aria-invalid={isControlInvalid('pokemon-editor-secret-id')}
												aria-describedby={isControlInvalid('pokemon-editor-secret-id')
													? 'pokemon-editor-status'
													: undefined}
												type="number"
												min={originalTrainerEditConstraints.minTrainerId}
												max={originalTrainerEditConstraints.maxTrainerId}
												step="1"
												value={draftSecretId}
												disabled={applying}
												readonly={!isInputEditing('pokemon-editor-secret-id')}
												data-controller-editing={draftInputEditingValue('pokemon-editor-secret-id')}
												onpointerdown={() => activateDraftInput('pokemon-editor-secret-id', false)}
												onclick={() => activateDraftInput('pokemon-editor-secret-id', false)}
												onblur={() => deactivateDraftInput('pokemon-editor-secret-id')}
												onkeydown={(event) =>
													handleDraftInputKeydown(event, 'pokemon-editor-secret-id')}
												oninput={(event) => {
													const target = event.currentTarget;
													if (target instanceof HTMLInputElement) setDraftSecretId(target.value);
												}}
											/>
										</label>
									{/if}
									{#if originalTrainerEditConstraints.supportsGender}
										<label>
											<span>Gender</span>
											<select
												id="pokemon-editor-trainer-gender"
												class:staged-field={draftTrainerGenderId !==
													originalTrainerEditConstraints.currentGenderId}
												aria-invalid={isControlInvalid('pokemon-editor-trainer-gender')}
												value={draftTrainerGenderId}
												disabled={applying}
												onchange={(event) => setTrainerGender(event.currentTarget.value)}
											>
												{#each originalTrainerEditConstraints.genders as option (option.id)}
													<option value={option.id}>{option.name}</option>
												{/each}
											</select>
										</label>
									{/if}
									{#if originalTrainerEditConstraints.supportsLanguage}
										<label>
											<span>Language</span>
											<select
												id="pokemon-editor-pokemon-language"
												class:staged-field={draftLanguageId !==
													originalTrainerEditConstraints.currentLanguageId}
												aria-invalid={isControlInvalid('pokemon-editor-pokemon-language')}
												value={draftLanguageId}
												disabled={applying}
												onchange={(event) => setPokemonLanguage(event.currentTarget.value)}
											>
												{#each originalTrainerEditConstraints.languages as option (option.id)}
													<option value={option.id}>{option.name}</option>
												{/each}
											</select>
										</label>
									{/if}
								</div>
								{#if unsupportedOriginalTrainerFields.length > 0}
									<p class="unsupported-copy">
										This Pokemon Entity format does not support editing:
										{unsupportedOriginalTrainerFields.join(', ')}.
									</p>
								{/if}
							{:else}
								<p class="unsupported-copy">
									{originalTrainerEditConstraints?.unsupportedReason ??
										'Original Trainer Data Editing is not supported for this Pokemon Entity format.'}
								</p>
							{/if}
						</div>

						<div
							class="editor-panel"
							aria-label="Level and Experience Editing"
							data-editor-active={session.section === 'level-experience'}
						>
							<div class="panel-title">
								<span>Level / Experience</span>
								<small>{canEditLevelExperience ? 'Editable' : 'Unsupported'}</small>
							</div>
							<div class="level-edit-grid">
								<span>Current level</span>
								<strong>{slot.level ?? 'Unknown'}</strong>
								<span>Experience</span>
								<strong>{currentExperienceLabel}</strong>
								<span>Next level</span>
								<strong>{nextLevelLabel}</strong>
							</div>
							<div class="level-edit-controls">
								<button
									id="pokemon-editor-mode"
									type="button"
									class="mode-switch"
									role="switch"
									aria-checked={editMode === 'experience'}
									aria-label={`Editing ${editMode === 'level' ? 'Level' : 'Experience'}`}
									disabled={!canEditLevelExperience || applying}
									onclick={toggleEditMode}
								>
									<span>Level</span>
									<span>EXP</span>
									<i aria-hidden="true"></i>
								</button>
								{#if editMode === 'level'}
									<label>
										<span>Level</span>
										<input
											id="pokemon-editor-level"
											class:staged-field={draftLevel !== String(slot.level ?? 1)}
											aria-invalid={isControlInvalid('pokemon-editor-level')}
											aria-describedby={isControlInvalid('pokemon-editor-level')
												? 'pokemon-editor-status'
												: undefined}
											type="number"
											min={experienceProjection?.minLevel ?? 1}
											max={experienceProjection?.maxLevel ?? 100}
											step="1"
											value={draftLevel}
											disabled={!canEditLevelExperience || applying}
											readonly={!isInputEditing('pokemon-editor-level')}
											data-controller-editing={draftInputEditingValue('pokemon-editor-level')}
											onpointerdown={() => activateDraftInput('pokemon-editor-level', false)}
											onclick={() => activateDraftInput('pokemon-editor-level', false)}
											onblur={() => deactivateDraftInput('pokemon-editor-level')}
											onkeydown={(event) => handleDraftInputKeydown(event, 'pokemon-editor-level')}
											oninput={(event) => {
												const target = event.currentTarget;
												if (target instanceof HTMLInputElement) setDraftLevel(target.value);
											}}
										/>
										<em>{levelRangeLabel}</em>
									</label>
								{:else}
									<label>
										<span>Experience</span>
										<input
											id="pokemon-editor-experience"
											class:staged-field={draftExperience !== String(slot.experience ?? 0)}
											aria-invalid={isControlInvalid('pokemon-editor-experience')}
											aria-describedby={isControlInvalid('pokemon-editor-experience')
												? 'pokemon-editor-status'
												: undefined}
											type="number"
											min={experienceProjection?.minExperience ?? 0}
											max={experienceProjection?.maxExperience ?? 0}
											step="1"
											value={draftExperience}
											disabled={!canEditLevelExperience || applying}
											readonly={!isInputEditing('pokemon-editor-experience')}
											data-controller-editing={draftInputEditingValue('pokemon-editor-experience')}
											onpointerdown={() => activateDraftInput('pokemon-editor-experience', false)}
											onclick={() => activateDraftInput('pokemon-editor-experience', false)}
											onblur={() => deactivateDraftInput('pokemon-editor-experience')}
											onkeydown={(event) =>
												handleDraftInputKeydown(event, 'pokemon-editor-experience')}
											oninput={(event) => {
												const target = event.currentTarget;
												if (target instanceof HTMLInputElement) setDraftExperience(target.value);
											}}
										/>
										<em>{experienceRangeLabel}</em>
									</label>
								{/if}
							</div>
						</div>

						<div
							class="editor-panel"
							aria-label="Friendship Editing"
							data-editor-active={session.section === 'friendship'}
						>
							<div class="panel-title">
								<span>Friendship</span>
								<small>{canEditFriendship ? 'Editable' : 'Unsupported'}</small>
							</div>
							{#if canEditFriendship}
								<div class="stat-edit-controls">
									{#each friendshipEditConstraints?.fields ?? [] as field (field.key)}
										<label>
											<span>{field.label} ({field.min}-{field.max})</span>
											<input
												id={`pokemon-editor-${field.key}`}
												class:staged-field={draftFriendship[field.key] !== String(field.value)}
												aria-invalid={isControlInvalid(`pokemon-editor-${field.key}`)}
												aria-describedby={isControlInvalid(`pokemon-editor-${field.key}`)
													? 'pokemon-editor-status'
													: undefined}
												type="number"
												min={field.min}
												max={field.max}
												step="1"
												value={draftFriendship[field.key]}
												disabled={applying}
												readonly={!isInputEditing(`pokemon-editor-${field.key}`)}
												data-controller-editing={draftInputEditingValue(
													`pokemon-editor-${field.key}`
												)}
												onpointerdown={() =>
													activateDraftInput(`pokemon-editor-${field.key}`, false)}
												onclick={() => activateDraftInput(`pokemon-editor-${field.key}`, false)}
												onblur={() => deactivateDraftInput(`pokemon-editor-${field.key}`)}
												onkeydown={(event) =>
													handleDraftInputKeydown(event, `pokemon-editor-${field.key}`)}
												oninput={(event) => {
													const target = event.currentTarget;
													if (target instanceof HTMLInputElement)
														setFriendship(field.key, target.value);
												}}
											/>
										</label>
									{/each}
								</div>
							{:else}
								<p class="unsupported-copy">
									{friendshipEditConstraints?.unsupportedReason ??
										'Friendship Editing is not supported for this Pokemon format.'}
								</p>
							{/if}
						</div>

						<div
							class="editor-panel"
							aria-label="Move Set Editing"
							data-editor-active={session.section === 'move-set'}
						>
							<div class="panel-title">
								<span>Move Set</span>
								<small>{canEditMoveSet ? 'Editable' : 'Unsupported'}</small>
							</div>
							{#if canEditMoveSet}
								<div class="move-edit-controls">
									{#each draftMoves as move, index (index)}
										{@const maxPp = maxPpForMove(move)}
										<div class="move-edit-row">
											<div
												class="move-picker-field"
												class:staged-field={isMoveFieldDirty(index, 'move')}
											>
												<span id={`pokemon-editor-move-${index}-label`}>Move {index + 1}</span>
												<Combobox
													id={`pokemon-editor-move-${index}`}
													labelledBy={`pokemon-editor-move-${index}-label`}
													value={String(move.move)}
													options={moveComboboxOptions}
													placeholder="Empty"
													searchLabel={`Search moves for Move ${index + 1}`}
													searchPlaceholder="Search moves"
													disabled={applying}
													requireExplicitEntry
													onSelect={(value) => setMove(index, value)}
													onOpenChange={(open) =>
														open
															? activateDraftInput(`pokemon-editor-move-${index}`, false)
															: deactivateDraftInput(`pokemon-editor-move-${index}`)}
												/>
											</div>
											<label>
												<span>PP</span>
												<input
													id={`pokemon-editor-move-${index}-pp`}
													class:staged-field={isMoveFieldDirty(index, 'pp')}
													aria-invalid={isControlInvalid(`pokemon-editor-move-${index}-pp`)}
													aria-describedby={isControlInvalid(`pokemon-editor-move-${index}-pp`)
														? 'pokemon-editor-status'
														: undefined}
													type="number"
													min="0"
													max={maxPp}
													step="1"
													value={move.pp}
													disabled={applying || move.move === 0}
													readonly={!isInputEditing(`pokemon-editor-move-${index}-pp`)}
													data-controller-editing={draftInputEditingValue(
														`pokemon-editor-move-${index}-pp`
													)}
													onpointerdown={() =>
														activateDraftInput(`pokemon-editor-move-${index}-pp`, false)}
													onclick={() =>
														activateDraftInput(`pokemon-editor-move-${index}-pp`, false)}
													onblur={() => deactivateDraftInput(`pokemon-editor-move-${index}-pp`)}
													onkeydown={(event) =>
														handleDraftInputKeydown(event, `pokemon-editor-move-${index}-pp`)}
													oninput={(event) => {
														const target = event.currentTarget;
														if (target instanceof HTMLInputElement) setMovePp(index, target.value);
													}}
												/>
											</label>
											<label>
												<span>PP Ups</span>
												<input
													id={`pokemon-editor-move-${index}-pp-ups`}
													class:staged-field={isMoveFieldDirty(index, 'ppUps')}
													aria-invalid={isControlInvalid(`pokemon-editor-move-${index}-pp-ups`)}
													aria-describedby={isControlInvalid(`pokemon-editor-move-${index}-pp-ups`)
														? 'pokemon-editor-status'
														: undefined}
													type="number"
													min="0"
													max="3"
													step="1"
													value={move.ppUps}
													disabled={applying || move.move === 0}
													readonly={!isInputEditing(`pokemon-editor-move-${index}-pp-ups`)}
													data-controller-editing={draftInputEditingValue(
														`pokemon-editor-move-${index}-pp-ups`
													)}
													onpointerdown={() =>
														activateDraftInput(`pokemon-editor-move-${index}-pp-ups`, false)}
													onclick={() =>
														activateDraftInput(`pokemon-editor-move-${index}-pp-ups`, false)}
													onblur={() => deactivateDraftInput(`pokemon-editor-move-${index}-pp-ups`)}
													onkeydown={(event) =>
														handleDraftInputKeydown(event, `pokemon-editor-move-${index}-pp-ups`)}
													oninput={(event) => {
														const target = event.currentTarget;
														if (target instanceof HTMLInputElement)
															setMovePpUps(index, target.value);
													}}
												/>
											</label>
										</div>
									{/each}
								</div>
							{:else}
								<p class="unsupported-copy">
									{moveSetEditConstraints?.unsupportedReason ??
										'Move Set Editing is not supported for this Pokemon format.'}
								</p>
							{/if}
						</div>

						{#if slot.moves && slot.moves.length > 0}
							<div
								class="editor-panel"
								aria-label="Visible Move Set Projection"
								data-editor-active={session.section === 'move-set'}
							>
								<div class="panel-title">
									<span>Visible Moves</span>
									<small>Projection</small>
								</div>
								<div class="move-grid">
									{#each slot.moves as move, index (`${index}-${move.name}`)}
										<div
											class="move-chip"
											style={`--type-hue: ${move.hue}; --type-chroma: ${move.chroma ?? 0.09}`}
										>
											<strong>{move.name}</strong>
											<span>{move.type}</span>
											{#if move.pp !== null && move.pp !== undefined}
												<em>{move.pp} PP</em>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if slot.stats && slot.stats.length > 0}
							<div
								class="editor-panel"
								aria-label="IV and EV Editing"
								data-editor-active={session.section === 'stats'}
							>
								<div class="panel-title">
									<span>IV / EV</span>
									<small
										>{canEditStats
											? `EV total ${totalEvs}/${statEditConstraints?.maxTotalEv ?? 0}`
											: 'Unsupported'}</small
									>
								</div>
								{#if canEditStats}
									<div class="stat-edit-controls">
										{#each statKeys as key (key)}
											<label>
												<span>{key} IV</span>
												<input
													id={`pokemon-editor-${key.toLowerCase()}-iv`}
													class:staged-field={draftIvs[key] !== String(baseIvs[key])}
													aria-invalid={isControlInvalid(`pokemon-editor-${key.toLowerCase()}-iv`)}
													aria-describedby={isControlInvalid(
														`pokemon-editor-${key.toLowerCase()}-iv`
													)
														? 'pokemon-editor-status'
														: undefined}
													type="number"
													min={statEditConstraints?.minIv ?? 0}
													max={statEditConstraints?.maxIv ?? 31}
													step="1"
													value={draftIvs[key]}
													disabled={applying}
													readonly={!isInputEditing(`pokemon-editor-${key.toLowerCase()}-iv`)}
													data-controller-editing={draftInputEditingValue(
														`pokemon-editor-${key.toLowerCase()}-iv`
													)}
													onpointerdown={() =>
														activateDraftInput(`pokemon-editor-${key.toLowerCase()}-iv`, false)}
													onclick={() =>
														activateDraftInput(`pokemon-editor-${key.toLowerCase()}-iv`, false)}
													onblur={() =>
														deactivateDraftInput(`pokemon-editor-${key.toLowerCase()}-iv`)}
													onkeydown={(event) =>
														handleDraftInputKeydown(
															event,
															`pokemon-editor-${key.toLowerCase()}-iv`
														)}
													oninput={(event) => {
														const target = event.currentTarget;
														if (target instanceof HTMLInputElement) setIv(key, target.value);
													}}
												/>
											</label>
											<label>
												<span>{key} EV</span>
												<input
													id={`pokemon-editor-${key.toLowerCase()}-ev`}
													class:staged-field={draftEvs[key] !== String(baseEvs[key])}
													aria-invalid={isControlInvalid(`pokemon-editor-${key.toLowerCase()}-ev`)}
													aria-describedby={isControlInvalid(
														`pokemon-editor-${key.toLowerCase()}-ev`
													)
														? 'pokemon-editor-status'
														: undefined}
													type="number"
													min={statEditConstraints?.minEv ?? 0}
													max={statEditConstraints?.maxEv ?? 255}
													step="1"
													value={draftEvs[key]}
													disabled={applying}
													readonly={!isInputEditing(`pokemon-editor-${key.toLowerCase()}-ev`)}
													data-controller-editing={draftInputEditingValue(
														`pokemon-editor-${key.toLowerCase()}-ev`
													)}
													onpointerdown={() =>
														activateDraftInput(`pokemon-editor-${key.toLowerCase()}-ev`, false)}
													onclick={() =>
														activateDraftInput(`pokemon-editor-${key.toLowerCase()}-ev`, false)}
													onblur={() =>
														deactivateDraftInput(`pokemon-editor-${key.toLowerCase()}-ev`)}
													onkeydown={(event) =>
														handleDraftInputKeydown(
															event,
															`pokemon-editor-${key.toLowerCase()}-ev`
														)}
													oninput={(event) => {
														const target = event.currentTarget;
														if (target instanceof HTMLInputElement) setEv(key, target.value);
													}}
												/>
											</label>
										{/each}
									</div>
								{:else}
									<p class="unsupported-copy">
										{statEditConstraints?.unsupportedReason ??
											'IV and EV Editing is not supported for this Pokemon format.'}
									</p>
								{/if}
							</div>

							<div
								class="editor-panel"
								aria-label="Stats"
								data-editor-active={session.section === 'stats'}
							>
								<div class="panel-title">
									<span>Stats</span>
									<small>Engine projection</small>
								</div>
								<div class="stat-grid">
									{#each slot.stats as stat (stat.key)}
										<span>{stat.label}</span>
										<strong>{stat.value}</strong>
										<em>IV {stat.iv ?? 0} / EV {stat.ev ?? 0}</em>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</main>
		</div>

		<footer class="editor-actions">
			<p id="pokemon-editor-status">
				{statusText}
			</p>
			{#if draftDirty}
				<button
					id="pokemon-editor-staged-count"
					type="button"
					class="staged-count"
					onclick={onShowReview}>{draftEditCount} staged</button
				>
			{/if}
			<button
				id="pokemon-editor-legality"
				type="button"
				class="secondary-action"
				onclick={onOpenLegality}>Legality</button
			>
			<button
				id="pokemon-editor-apply"
				type="button"
				class="unsupported-apply"
				disabled={(mode === 'edit' && !draftDirty && !pendingScratch) ||
					applying ||
					draftValidation !== null}
				aria-describedby="pokemon-editor-status"
				title={draftValidationText ?? undefined}
				onclick={handleApply}
			>
				{applying ? 'Applying...' : mode === 'create' ? 'Create Pokemon' : 'Apply edits'}
			</button>
			<button
				id="pokemon-editor-cancel"
				type="button"
				class="close-editor"
				disabled={(!draftDirty && !pendingScratch) || applying}
				onclick={handleCancelEdits}
			>
				Cancel edits
			</button>
			<button id="pokemon-editor-close-footer" type="button" class="close-editor" onclick={onClose}>
				Close
			</button>
		</footer>
	{/if}
</div>

<style>
	.pokemon-editor {
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-2);
		overflow: hidden;
		background: var(--pksx-color-surface-panel);
		color: var(--pksx-color-text-primary);
	}

	.editor-header,
	.editor-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.editor-header {
		justify-content: space-between;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--rule);
	}

	.editor-header p,
	.editor-header h2,
	.editor-header span,
	.editor-actions p {
		margin: 0;
	}

	.editor-header p,
	.editor-header span,
	.panel-title small,
	.editor-actions p {
		color: var(--ink-mute);
		font:
			650 0.66rem var(--pksx-font-mono),
			monospace;
		line-height: 1.2;
	}

	.editor-header p {
		color: var(--rust);
		text-transform: uppercase;
	}

	.editor-header h2 {
		margin-top: 2px;
		font-size: 1.22rem;
		line-height: 1.1;
	}

	.icon-close {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-deep);
		color: var(--ink);
		font-size: 1.35rem;
		line-height: 1;
	}

	.icon-close:hover,
	.icon-close:focus-visible,
	.icon-close:focus,
	.close-editor:hover,
	.close-editor:focus-visible,
	.close-editor:focus,
	.unsupported-apply:hover,
	.unsupported-apply:focus-visible,
	.unsupported-apply:focus,
	.pokemon-editor button:focus,
	.pokemon-editor input:focus {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 55%);
		outline-offset: 1px;
	}

	.editor-body {
		min-height: 0;
		display: grid;
		grid-template-columns: 228px minmax(0, 1fr);
		gap: 14px;
		overflow: hidden;
	}

	.editor-summary {
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
		padding-right: 2px;
	}

	.field-grid,
	.stat-grid,
	.level-edit-grid,
	.nature-edit-summary {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: 7px 12px;
		padding: 10px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.field-grid span,
	.level-edit-grid span,
	.nature-edit-summary span,
	.stat-grid span,
	.stat-grid em {
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
	}

	.field-grid strong,
	.level-edit-grid strong,
	.nature-edit-summary strong,
	.stat-grid strong {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: 0.82rem;
	}

	.editor-panel {
		display: grid;
		gap: 8px;
	}

	.nickname-field {
		display: grid;
		gap: 5px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.battle-field-controls {
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.battle-field-controls label {
		display: grid;
		gap: 5px;
	}

	.battle-field-controls span,
	.battle-field-controls p {
		margin: 0;
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		line-height: 1.2;
	}

	.battle-field-controls span {
		text-transform: uppercase;
	}

	.battle-field-controls select {
		width: 100%;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
		font:
			750 0.86rem var(--pksx-font-mono),
			monospace;
	}

	.battle-field-controls select:disabled {
		opacity: 0.55;
	}

	.nickname-field span,
	.nickname-panel p {
		margin: 0;
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		line-height: 1.2;
		text-transform: uppercase;
	}

	.nickname-field input {
		width: 100%;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
		font:
			750 0.86rem var(--pksx-font-mono),
			monospace;
	}

	.nickname-field input:disabled {
		opacity: 0.55;
	}

	.nature-edit-controls,
	.held-item-edit-controls,
	.ability-edit-controls {
		display: grid;
		gap: 5px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.met-data-edit-controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.met-data-edit-controls label {
		min-width: 0;
		display: grid;
		gap: 4px;
	}

	.met-data-edit-controls span,
	.met-data-hint,
	.nature-edit-controls span,
	.nature-edit-hint,
	.held-item-edit-controls span,
	.held-item-restrictions,
	.ability-edit-controls span,
	.ability-restrictions {
		margin: 0;
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		line-height: 1.2;
	}

	.met-data-edit-controls span,
	.nature-edit-controls span,
	.held-item-edit-controls span,
	.ability-edit-controls span {
		text-transform: uppercase;
	}

	.met-data-edit-controls input,
	.met-data-edit-controls select,
	.nature-edit-controls select,
	.held-item-edit-controls select,
	.ability-edit-controls select {
		width: 100%;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
		font:
			750 0.78rem var(--pksx-font-mono),
			monospace;
	}

	.met-data-edit-controls input:disabled,
	.met-data-edit-controls select:disabled,
	.nature-edit-controls select:disabled,
	.held-item-edit-controls select:disabled,
	.ability-edit-controls select:disabled {
		opacity: 0.55;
	}

	.ability-restrictions {
		padding: 0 12px 0 28px;
	}

	.level-edit-controls {
		display: grid;
		grid-template-columns: 154px minmax(160px, 1fr);
		align-items: center;
		gap: 12px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.species-form-controls {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: 12px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.species-form-controls label,
	.species-form-preview {
		display: grid;
		gap: 5px;
	}

	.species-form-controls span,
	.species-form-preview span {
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		text-transform: uppercase;
	}

	.species-form-controls select {
		min-width: 0;
		height: 44px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
	}

	.species-form-preview {
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.species-form-preview p,
	.species-form-preview ul {
		margin: 0;
	}

	.species-form-preview ul {
		display: grid;
		gap: 4px;
		padding-left: 18px;
	}

	.species-form-preview .illegal {
		color: var(--rust);
	}

	.mode-switch {
		min-height: 44px;
		border-radius: var(--pksx-radius-sm);
		font:
			800 0.72rem var(--pksx-font-mono),
			monospace;
		line-height: 1;
		text-transform: uppercase;
	}

	.mode-switch {
		position: relative;
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: center;
		padding: 4px;
		background: var(--paper-hi);
		color: var(--ink-mute);
		overflow: hidden;
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--rust), transparent 56%);
	}

	.mode-switch span {
		position: relative;
		z-index: 1;
		display: grid;
		place-items: center;
		min-height: 36px;
		transition:
			color 140ms ease,
			opacity 140ms ease;
	}

	.mode-switch i {
		position: absolute;
		inset: 4px auto 4px 4px;
		width: calc(50% - 4px);
		border-radius: calc(var(--pksx-radius-sm) - 2px);
		background: var(--rust);
		transition: transform 140ms ease;
	}

	.mode-switch[aria-checked='true'] i {
		transform: translateX(100%);
	}

	.mode-switch[aria-checked='false'] span:first-child,
	.mode-switch[aria-checked='true'] span:nth-child(2) {
		color: white;
		text-shadow: 0 1px 0 color-mix(in srgb, var(--ink), transparent 68%);
	}

	.mode-switch[aria-checked='false'] span:nth-child(2),
	.mode-switch[aria-checked='true'] span:first-child {
		opacity: 0.62;
	}

	.mode-switch:disabled {
		opacity: 0.55;
	}

	.level-edit-controls label {
		min-width: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 4px;
	}

	.stat-edit-controls,
	.trainer-edit-controls,
	.move-edit-controls {
		display: grid;
		gap: 8px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
	}

	.stat-edit-controls {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.trainer-edit-controls {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.trainer-name-field {
		grid-column: 1 / -1;
	}

	.move-edit-row {
		display: grid;
		grid-template-columns: minmax(150px, 1fr) 74px 84px;
		gap: 8px;
		align-items: start;
	}

	.stat-edit-controls label,
	.trainer-edit-controls label,
	.move-edit-controls label,
	.move-picker-field {
		min-width: 0;
		display: grid;
		gap: 4px;
	}

	.stat-edit-controls label span,
	.trainer-edit-controls label span,
	.move-edit-controls label span,
	.move-picker-field > span,
	.unsupported-copy {
		margin: 0;
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		line-height: 1.1;
		text-transform: uppercase;
	}

	.stat-edit-controls input,
	.trainer-edit-controls input,
	.trainer-edit-controls select,
	.move-edit-controls input {
		width: 100%;
		min-width: 0;
		height: 38px;
		padding: 0 8px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
		font:
			750 0.74rem var(--pksx-font-mono),
			monospace;
	}

	.stat-edit-controls input:disabled,
	.trainer-edit-controls input:disabled,
	.trainer-edit-controls select:disabled,
	.move-edit-controls input:disabled {
		opacity: 0.55;
	}

	.unsupported-copy {
		padding: 10px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper-deep);
		text-transform: none;
	}

	.level-edit-controls label span,
	.level-edit-controls label em {
		color: var(--ink-mute);
		font:
			650 0.62rem var(--pksx-font-mono),
			monospace;
		line-height: 1.1;
		text-transform: uppercase;
	}

	.level-edit-controls input {
		width: 100%;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		border: 1px solid var(--rule);
		border-radius: var(--pksx-radius-sm);
		background: var(--paper-hi);
		color: var(--ink);
		font:
			750 0.86rem var(--pksx-font-mono),
			monospace;
	}

	.level-edit-controls button:disabled,
	.level-edit-controls input:disabled {
		opacity: 0.55;
	}

	.panel-title {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		color: var(--ink);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.move-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 6px;
	}

	.move-chip {
		min-width: 0;
		display: grid;
		gap: 3px;
		padding: 8px;
		border-radius: var(--pksx-radius-sm);
		background: oklch(0.9 var(--type-chroma, 0.07) var(--type-hue, 100));
		color: color-mix(in srgb, var(--ink), black 10%);
	}

	.move-chip strong {
		overflow-wrap: anywhere;
		font-size: 0.76rem;
		line-height: 1.1;
	}

	.move-chip span,
	.move-chip em {
		font:
			650 0.58rem var(--pksx-font-mono),
			monospace;
		line-height: 1;
		text-transform: uppercase;
	}

	.stat-grid {
		grid-template-columns: max-content 42px minmax(54px, 1fr);
		align-items: center;
	}

	.editor-actions {
		justify-content: flex-end;
		padding-top: 12px;
		border-top: 1px solid var(--rule);
	}

	.editor-actions p {
		margin-right: auto;
	}

	.unsupported-apply,
	.close-editor {
		min-height: 34px;
		padding: 7px 12px;
		border-radius: var(--pksx-radius-sm);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.unsupported-apply {
		background: var(--paper-deep);
		color: var(--ink-soft);
	}

	.unsupported-apply:disabled {
		cursor: not-allowed;
		opacity: 0.56;
	}

	.close-editor {
		background: var(--rust);
		color: white;
	}

	.editor-header {
		min-width: 0;
		padding: 0 0 var(--pksx-space-1);
		gap: var(--pksx-space-2);
	}

	.editor-identity,
	.identity-line {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--pksx-space-2);
	}

	.editor-identity {
		flex: 1 1 auto;
	}

	.editor-identity > div {
		min-width: 0;
		flex: 1 1 auto;
	}

	.editor-identity img {
		width: var(--pksx-control-height);
		height: var(--pksx-control-height);
		flex: 0 0 auto;
		object-fit: contain;
		image-rendering: pixelated;
	}

	.editor-identity h2 {
		font-size: var(--pksx-type-title);
	}

	.editor-identity p,
	.editor-identity span,
	.editor-identity strong {
		font-size: var(--pksx-type-caption);
	}

	.identity-line {
		white-space: nowrap;
		overflow: hidden;
	}

	.identity-line span,
	.identity-line strong {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.icon-close {
		width: var(--pksx-small-control-height);
		height: var(--pksx-small-control-height);
		font-size: var(--pksx-type-title);
	}

	.editor-body {
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		grid-template-columns: minmax(0, 1fr);
		gap: var(--pksx-space-2);
		overflow: hidden;
	}

	.editor-rail {
		min-width: 0;
		display: flex;
		gap: var(--pksx-space-1);
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: thin;
	}

	.editor-rail button {
		min-width: max-content;
		min-height: var(--pksx-small-control-height);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--pksx-space-2);
		flex: 0 0 auto;
		padding: 0 var(--pksx-space-2);
		border: var(--pksx-border-width) solid var(--pksx-color-border-subtle);
		border-radius: var(--pksx-radius-small);
		background: var(--pksx-color-surface-subtle);
		color: var(--pksx-color-text-secondary);
		font: 700 var(--pksx-type-caption) var(--pksx-font-mono);
		text-align: left;
	}

	.editor-rail button.active {
		border-color: var(--pksx-color-accent-primary);
		background: var(--pksx-color-accent-wash);
		color: var(--pksx-color-text-primary);
	}

	.editor-rail i {
		width: 7px;
		height: 7px;
		flex: 0 0 auto;
		border-radius: 999px;
		background: var(--pksx-color-accent-primary);
	}

	.editor-content,
	.editor-summary,
	.delta-review {
		min-width: 0;
		min-height: 0;
	}

	.editor-content {
		overflow: hidden;
	}

	.editor-summary,
	.delta-review {
		height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--pksx-space-2);
		overflow: auto;
		padding: var(--pksx-focus-ring);
		scrollbar-width: thin;
	}

	.editor-panel[data-editor-active='false'] {
		display: none;
	}

	.editor-panel,
	.field-grid,
	.stat-grid,
	.level-edit-grid,
	.nature-edit-summary,
	.nickname-field,
	.battle-field-controls,
	.nature-edit-controls,
	.held-item-edit-controls,
	.ability-edit-controls,
	.met-data-edit-controls,
	.level-edit-controls,
	.species-form-controls,
	.species-form-preview,
	.stat-edit-controls,
	.trainer-edit-controls,
	.move-edit-controls {
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-2);
		border-radius: var(--pksx-radius-medium);
	}

	.editor-panel {
		padding: 0;
	}

	.editor-panel input,
	.editor-panel select,
	.editor-panel button,
	.editor-panel :global(.pksx-combobox-trigger) {
		min-height: var(--pksx-control-height);
		height: var(--pksx-control-height);
		font-size: var(--pksx-type-body);
	}

	.editor-panel label > span,
	.panel-title,
	.panel-title small {
		font-size: var(--pksx-type-label);
	}

	.stat-edit-controls label > span,
	.stat-grid span,
	.stat-grid em {
		font-size: var(--pksx-type-caption);
	}

	.editor-actions {
		min-width: 0;
		gap: var(--pksx-space-1);
		padding-top: var(--pksx-space-1);
	}

	.editor-actions p {
		min-width: 0;
		flex: 1 1 0;
		margin-right: 0;
		font-size: var(--pksx-type-caption);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.editor-actions button,
	.internal-actions button,
	.delta-review button {
		flex: 0 0 auto;
		min-height: var(--pksx-small-control-height);
		padding: 0 var(--pksx-space-2);
		border-radius: var(--pksx-radius-small);
		font-size: var(--pksx-type-caption);
		font-weight: 800;
		white-space: nowrap;
	}

	.staged-count,
	.secondary-action {
		background: var(--pksx-color-surface-subtle);
		color: var(--pksx-color-text-primary);
	}

	.staged-count {
		box-shadow: inset 0 0 0 var(--pksx-border-width) var(--pksx-color-accent-primary);
		color: var(--pksx-color-accent-primary);
	}

	.delta-review h3,
	.editor-internal-state h3,
	.editor-internal-state p,
	.editor-internal-state span {
		margin: 0;
	}

	.delta-list {
		display: grid;
		gap: var(--pksx-space-1);
	}

	.delta-list article {
		display: grid;
		grid-template-columns: minmax(7rem, 0.7fr) minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: var(--pksx-space-2);
		padding: var(--pksx-space-2);
		border-radius: var(--pksx-radius-medium);
		background: var(--pksx-color-surface-subtle);
		font-size: var(--pksx-type-caption);
	}

	.delta-list span {
		color: var(--pksx-color-text-secondary);
		text-decoration: line-through;
	}

	.editor-internal-state {
		place-self: center;
		max-width: 32rem;
		display: grid;
		gap: var(--pksx-space-3);
		padding: var(--pksx-space-4);
		border-radius: var(--pksx-radius-large);
		background: var(--pksx-color-surface-subtle);
		text-align: center;
	}

	.editor-internal-state p {
		color: var(--pksx-color-accent-primary);
		font: 800 var(--pksx-type-caption) var(--pksx-font-mono);
		text-transform: uppercase;
	}

	.internal-actions {
		display: flex;
		justify-content: center;
		gap: var(--pksx-space-2);
	}

	.internal-actions .danger {
		background: var(--pksx-color-feedback-danger);
		color: white;
	}

	.pokemon-editor :is(button, input, select):focus-visible {
		outline: var(--pksx-focus-ring) solid var(--pksx-color-accent-ring);
		outline-offset: 1px;
	}

	.pokemon-editor :is(input, select)[aria-invalid='true'] {
		border-color: var(--pksx-color-feedback-danger);
		box-shadow: inset 0 0 0 1px var(--pksx-color-feedback-danger);
	}

	.pokemon-editor :is(input, select, button).staged-field,
	.move-picker-field.staged-field {
		box-shadow: inset 3px 0 0 var(--pksx-color-accent-primary);
		background-color: var(--pksx-color-accent-wash);
	}

	.pokemon-editor :is(input, select)[aria-invalid='true'].staged-field {
		box-shadow:
			inset 3px 0 0 var(--pksx-color-accent-primary),
			inset 0 0 0 1px var(--pksx-color-feedback-danger);
	}

	@container pksx-density (aspect-ratio > 1 / 1) {
		.editor-body {
			grid-template: minmax(0, 1fr) / 148px minmax(0, 1fr);
		}

		.editor-rail {
			flex-direction: column;
			overflow-x: hidden;
			overflow-y: auto;
		}

		.editor-rail button {
			width: 100%;
			min-width: 0;
		}
	}

	@container pksx-density (width <= 640px) {
		.identity-line {
			flex-wrap: wrap;
			row-gap: 0;
			white-space: normal;
			overflow: visible;
		}

		.identity-line span,
		.identity-line strong {
			overflow: visible;
			text-overflow: clip;
		}

		.editor-actions {
			gap: 2px;
		}

		.editor-actions button {
			padding-inline: 6px;
		}
	}

	@container pksx-density (aspect-ratio <= 1 / 1) {
		.editor-actions {
			flex-wrap: wrap;
		}

		.editor-actions p {
			flex-basis: 100%;
		}

		.met-data-edit-controls,
		.move-edit-row {
			grid-template-columns: 1fr 1fr;
		}

		.move-edit-row .move-picker-field {
			grid-column: 1 / -1;
		}
	}
</style>
