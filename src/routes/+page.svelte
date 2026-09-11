<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		type EngineApi,
		type EngineError,
		type PokemonActionOperation,
		type PokemonActionPreview,
		type PokemonEditOperation,
		type StoredPokemonActionResult,
		type PokemonEditOperationResult,
		type PokemonEditPreviewValidationScope,
		type PokemonSpeciesFormEditProjection,
		type SaveSlotRef,
		type SlotOperation
	} from '$lib/engine';
	import {
		applyNavigationAction,
		BOX_COLUMNS,
		BOX_ROWS,
		BOX_SLOT_COUNT,
		crossPaneSharedEdge,
		createInitialNavigationState,
		focusBoxSlot,
		focusPaneControl,
		focusPartySlot,
		getBoxSlotPosition,
		getPartySlotPosition,
		getFocusId,
		PARTY_SLOT_COUNT,
		PARTY_COLUMNS,
		PARTY_ROWS,
		projectSlotCoordinate,
		selectActiveBox,
		setLocationFocus,
		type BoxNavigationState,
		type ControllerFocus,
		type NavigationAction,
		type SlotFocus
	} from '$lib/pksx/box-navigation';
	import {
		createCleanWorkspaceState,
		createManualBackup,
		markAutomaticBackupCreated,
		shouldCreateAutomaticBackup,
		type WorkspaceState
	} from '$lib/pksx/backup-workflow';
	import {
		applyStorageOperation,
		destinationStateForStorageOperation,
		type PendingStorageSlotOperation
	} from '$lib/pksx/storage-operations';
	import { updateAppChrome } from '$lib/pksx/app-chrome.svelte';
	import {
		addBoxPane,
		applyPokemonStorageSlotOperation,
		closeBoxPane,
		createBoxPane,
		createSourcePickerCards,
		destinationStateForEvaluation,
		evaluateDestination,
		focusSurvivingPaneAfterClose,
		getStoragePokemon,
		putStoragePokemon,
		removeStoragePokemon,
		setPaneActiveBox,
		setPaneFocus,
		switchPaneSource,
		toggleCarryMode,
		type BoxPaneState,
		type BoxSourceRef,
		type BoxSourceType,
		type CarryState,
		type SourcePickerCard,
		type WorkbenchSlotRef
	} from '$lib/pksx/storage-workbench';
	import { resolveSpriteCatalogEntry } from '$lib/pksx/sprite-catalog';
	import {
		createEmptyPokemonStorage,
		type StoredPokemonStorage,
		type StoredPokemonStoragePokemon,
		type StoredSaveFile
	} from '$lib/pksx/saves';
	import {
		getActiveWorkspaceService,
		consumeActiveSaveAdoption,
		getCachedActiveWorkspaceBox,
		getSavesStorage,
		getPkhexEngine,
		invalidateSavesCache,
		loadActiveWorkspaceFromSaves,
		seedSavesSnapshotFromActiveWorkspace,
		setCachedActiveWorkspace
	} from '$lib/pksx/saves-cache';
	import BoxMenu from '$lib/components/pksx/BoxMenu.svelte';
	import BoxSourceControls from '$lib/components/pksx/BoxSourceControls.svelte';
	import ClearSlotConfirm from '$lib/components/pksx/ClearSlotConfirm.svelte';
	import DetailRail from '$lib/components/pksx/DetailRail.svelte';
	import LegalityReportDialog from '$lib/components/pksx/LegalityReportDialog.svelte';
	import PokemonActionDialog from '$lib/components/pksx/PokemonActionDialog.svelte';
	import PokemonEditor from '$lib/components/pksx/PokemonEditor.svelte';
	import SlotActionMenu from '$lib/components/pksx/SlotActionMenu.svelte';
	import StorageSlot from '$lib/components/pksx/StorageSlot.svelte';
	import TakeoverFrame from '$lib/components/pksx/TakeoverFrame.svelte';
	import ToastRegion from '$lib/components/pksx/ToastRegion.svelte';
	import type { SlotView } from '$lib/components/pksx/types';
	import {
		createPokemonCreationOperation,
		pokemonCreationAvailability
	} from '$lib/pksx/pokemon-creation';
	import {
		applyPokemonEditorEdits,
		cancelPokemonEditor,
		createPokemonEditOperation,
		createPokemonEditorState,
		isSamePokemonEditorSourceIdentity,
		type PokemonEditorDraftEdits,
		type PokemonEditorMutationResult,
		type PokemonEditorSourceVerification,
		type PokemonEditorState
	} from '$lib/pksx/pokemon-editor';
	import {
		createPokemonEditorSession,
		enterPokemonEditorContent,
		focusPokemonEditorApply as setPokemonEditorApplyFocus,
		pagePokemonEditorSection,
		pokemonEditorSectionControls,
		requestPokemonEditorDismiss,
		returnFromPokemonEditorInternalState,
		selectPokemonEditorSection,
		showPokemonEditorReview,
		type PokemonEditorDraftSnapshot,
		type PokemonEditorFocus,
		type PokemonEditorSectionId,
		type PokemonEditorSession
	} from '$lib/pksx/pokemon-editor/session';
	import {
		createLegalityReportLoadingState,
		createLegalityReportUnavailableState,
		type LegalityReportState
	} from '$lib/pksx/legality-report';
	import {
		applyPokemonAction,
		clearPokemonActionSelection,
		createPokemonActionLoadingState,
		createPokemonActionReadyState,
		requestPokemonActionPreview,
		selectPokemonAction,
		selectedPokemonActionOperation,
		type PokemonActionState,
		type PokemonActionTarget
	} from '$lib/pksx/pokemon-actions';
	import {
		createBoxSlotViews,
		createPartySlotViews,
		createSlotView,
		isNativeEditorActivation,
		keyboardAction,
		pokemonEditorDraftResetKey,
		pokemonEditSuccessMessage,
		stagePokemonEditorDraftEdits
	} from '$lib/pksx/box-shell';
	import { isControllerKeyboardEvent } from '$lib/pksx/controller-input';
	import {
		dispatchSlotMenuAction,
		getLaunchingSlot,
		isDestinationInputSuspended,
		type SummonedWorkflowKind,
		type SummonedWorkflowLauncher
	} from '$lib/pksx/summoned-workflow';
	import { getSummonedWorkflowHost } from '$lib/pksx/summoned-workflow/host.svelte';
	import { createBoxMenuCommands, type BoxMenuCommandKey } from '$lib/pksx/box-menu';
	import { createSlotMenuCommands, type SlotMenuCommandKey } from '$lib/pksx/slot-menu';

	type ToastView = {
		id: string;
		tone: 'info' | 'success' | 'error';
		message: string;
	};

	type ClearSlotConfirmation = {
		source: SaveSlotRef;
		sourceOwner: BoxSourceRef;
		paneId: string;
		location: string;
		pokemonLabel: string;
	};

	type PokemonCreationView = {
		destination: SaveSlotRef;
		location: string;
		paneId: string;
		baseBytes: Uint8Array;
		workspace: WorkspaceState;
	};

	type SavePaneWorkspace = {
		state: WorkspaceState;
		loadedBox: number;
	};

	type BoxMenuTarget = {
		paneId: string;
		source: BoxSourceRef;
	};

	type PokemonActionContext = {
		target: PokemonActionTarget;
		storageRef: SaveSlotRef | null;
		editorPreviewValidation?: PokemonEditorPreviewValidation;
	};

	type PokemonEditorPreviewValidation = {
		baselineBytes: Uint8Array;
		scope: PokemonEditPreviewValidationScope;
	};

	const noSelectedSlot: SlotView = {
		slot: 0,
		label: 'No slot selected',
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

	const placeholderBoxCount = 3;
	const activeSavePaneId = 'pane-active-save';
	const storage = getSavesStorage();
	const workspaceService = getActiveWorkspaceService();
	const summonedWorkflow = getSummonedWorkflowHost();

	const slotPalette = [16, 28, 48, 100, 140, 180, 195, 210, 220, 260, 280, 295, 330, 52];

	function fallbackSlotHue(box: number, slot: number, speciesId: number | null): number {
		const seed = speciesId && speciesId > 0 ? speciesId : slot * 31 + box * 7;
		return slotPalette[seed % slotPalette.length];
	}

	function fallbackSlotHueSecondary(
		box: number,
		slot: number,
		speciesId: number | null
	): number | null {
		const seed = speciesId && speciesId > 0 ? speciesId : slot * 31 + box * 7;
		if (seed % 3 !== 0) return null;
		const offset = ((seed * 7) % (slotPalette.length - 1)) + 1;
		return slotPalette[(seed + offset) % slotPalette.length];
	}

	function slotTypeHues(
		slot: SlotView,
		box: number
	): {
		primaryHue: number;
		primaryChroma: number;
		secondaryHue: number | null;
		secondaryChroma: number;
	} {
		const [primaryType, secondaryType] = slot.kind === 'pokemon' ? (slot.types ?? []) : [];
		const primaryHue =
			typeof primaryType?.hue === 'number'
				? primaryType.hue
				: fallbackSlotHue(box, slot.slot, slot.speciesId);
		const primaryChroma = primaryType?.chroma ?? 0.09;
		const secondaryHue =
			typeof secondaryType?.hue === 'number' && secondaryType.hue !== primaryHue
				? secondaryType.hue
				: slot.kind === 'pokemon' && primaryType
					? null
					: fallbackSlotHueSecondary(box, slot.slot, slot.speciesId);
		const secondaryChroma = secondaryType?.chroma ?? primaryChroma;

		return { primaryHue, primaryChroma, secondaryHue, secondaryChroma };
	}

	function slotStyle(slot: SlotView, box: number): string {
		const { primaryHue, primaryChroma, secondaryHue, secondaryChroma } = slotTypeHues(slot, box);
		if (secondaryHue === null) {
			return `--slot-hue: ${primaryHue}; --slot-chroma: ${primaryChroma}`;
		}
		return `--slot-hue: ${primaryHue}; --slot-chroma: ${primaryChroma}; --slot-hue-2: ${secondaryHue}; --slot-chroma-2: ${secondaryChroma}`;
	}

	function slotHasDualType(slot: SlotView, box: number): boolean {
		return slot.kind === 'pokemon' && slotTypeHues(slot, box).secondaryHue !== null;
	}

	function boxNameFor(box: number): string {
		return `Box ${String(box + 1).padStart(2, '0')}`;
	}

	const placeholderPokemonDetails = {
		gender: '♂',
		nature: 'Modest',
		ability: 'Static',
		heldItem: 'Light Ball',
		types: [{ name: 'Electric', hue: 94, chroma: 0.16 }],
		stats: [
			{ key: 'HP', label: 'HP', value: 20, max: 31, ev: 0, iv: 31 },
			{ key: 'ATK', label: 'ATK', value: 12, max: 31, ev: 0, iv: 31 },
			{ key: 'DEF', label: 'DEF', value: 10, max: 31, ev: 0, iv: 31 },
			{ key: 'SPA', label: 'SPA', value: 15, max: 31, ev: 0, iv: 31 },
			{ key: 'SPD', label: 'SPD', value: 12, max: 31, ev: 0, iv: 31 },
			{ key: 'SPE', label: 'SPE', value: 18, max: 31, ev: 0, iv: 31 }
		],
		moves: [
			{
				slot: 0,
				id: 84,
				name: 'Thunder Shock',
				type: 'Electric',
				hue: 94,
				chroma: 0.16,
				pp: 30,
				maxPp: 30,
				ppUps: 0
			},
			{
				slot: 1,
				id: 98,
				name: 'Quick Attack',
				type: 'Normal',
				hue: 107,
				chroma: 0.06,
				pp: 30,
				maxPp: 30,
				ppUps: 0
			},
			{
				slot: 2,
				id: 39,
				name: 'Tail Whip',
				type: 'Normal',
				hue: 107,
				chroma: 0.06,
				pp: 30,
				maxPp: 30,
				ppUps: 0
			},
			{
				slot: 3,
				id: 45,
				name: 'Growl',
				type: 'Normal',
				hue: 107,
				chroma: 0.06,
				pp: 40,
				maxPp: 40,
				ppUps: 0
			}
		],
		heldItemEditConstraints: {
			supported: true,
			currentItemId: 236,
			options: [
				{ id: 0, name: 'No item', available: true },
				{ id: 236, name: 'Light Ball', available: true },
				{
					id: 25,
					name: 'Poke Doll',
					available: false,
					unavailableReason: 'Poke Doll is not supported by this Pokemon Entity format.'
				}
			]
		},
		abilityEditConstraints: {
			supported: true,
			currentAbilityIndex: 0,
			options: [
				{ index: 0, id: 9, name: 'Static', hidden: false, available: true },
				{ index: 1, id: 31, name: 'Lightning Rod', hidden: false, available: true }
			]
		},
		metDataEditConstraints: {
			supported: true,
			currentLocationId: 16,
			currentMetLevel: 5,
			currentOriginGameId: 3,
			currentBallId: 4,
			minMetLevel: 0,
			maxMetLevel: 100,
			supportsMetDate: false,
			supportsOriginGame: true,
			supportsBall: true,
			locationGroups: [
				{
					originGameId: 3,
					options: [
						{ id: 16, name: 'Route 101' },
						{ id: 24, name: 'Littleroot Town' }
					]
				}
			],
			originGames: [{ id: 3, name: 'Emerald' }],
			balls: [
				{ id: 4, name: 'Poké Ball' },
				{ id: 3, name: 'Great Ball' }
			]
		},
		statEditConstraints: {
			supported: true,
			minIv: 0,
			maxIv: 31,
			minEv: 0,
			maxEv: 255,
			maxTotalEv: 510
		},
		moveSetEditConstraints: {
			supported: true,
			maxMoveSlots: 4,
			availableMoves: [
				{ id: 0, name: 'Empty', type: 'None', hue: 48, chroma: 0.04, maxPp: 0 },
				{ id: 84, name: 'Thunder Shock', type: 'Electric', hue: 94, chroma: 0.16, maxPp: 30 },
				{ id: 98, name: 'Quick Attack', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 30 },
				{ id: 39, name: 'Tail Whip', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 30 },
				{ id: 45, name: 'Growl', type: 'Normal', hue: 107, chroma: 0.06, maxPp: 40 }
			]
		},
		originalTrainer: 'PKSX',
		metLabel: 'Starter Box',
		spriteIdentity: {
			speciesId: 25,
			form: 0,
			isEgg: false,
			isShiny: false,
			displaySex: 'default'
		}
	} satisfies Partial<SlotView>;

	const placeholderPartySlots: SlotView[] = Array.from({ length: PARTY_SLOT_COUNT }, (_, slot) => ({
		slot,
		label: slot === 0 ? 'Pikachu' : 'Empty',
		detail: slot === 0 ? 'Lv. 5' : '',
		level: slot === 0 ? 5 : null,
		experience: slot === 0 ? 125 : null,
		experienceProjection:
			slot === 0
				? {
						minLevel: 1,
						maxLevel: 100,
						minExperience: 0,
						maxExperience: 1_000_000,
						currentLevelMinExperience: 125,
						nextLevelMinExperience: 216,
						currentLevelProgress: 0
					}
				: null,
		speciesId: slot === 0 ? 25 : null,
		form: slot === 0 ? 0 : null,
		isEgg: false,
		spriteIdentity: null,
		kind: slot === 0 ? 'pokemon' : 'empty',
		...(slot === 0 ? placeholderPokemonDetails : {})
	}));

	let navigation = $state<BoxNavigationState>(createInitialNavigationState(placeholderBoxCount));
	let loadedSave = $state<WorkspaceState | null>(null);
	let pokemonEditorPaneId = $state<string | null>(null);
	let importError = $state<string | null>(null);
	let statusMessage = $state('Import a Save File to begin.');
	let busy = $state(false);
	let initialStateReady = $state(false);
	let pokemonCreation = $state<PokemonCreationView | null>(null);
	let pokemonCreationRequest = 0;
	let pokemonCreationBusyRequest: number | null = null;
	let pokemonEditor = $state<PokemonEditorState | null>(null);
	let pokemonEditorFeedback = $state<string | null>(null);
	let pokemonEditorSession = $state<PokemonEditorSession>(createPokemonEditorSession());
	let pokemonEditorDraft = $state<PokemonEditorDraftSnapshot | null>(null);
	let pokemonEditorDraftEdits = $state<PokemonEditorDraftEdits>({});
	let pokemonEditorDraftDirty = $state(false);
	let pokemonEditorScratchWorkspace = $state<WorkspaceState | null>(null);
	let pokemonEditorBaseBytes = $state<Uint8Array | null>(null);
	let pokemonEditorPreviewValidation = $state<PokemonEditorPreviewValidation | null>(null);
	let pokemonEditorApplyRequest = 0;
	let pokemonSpeciesFormProjection = $state<PokemonSpeciesFormEditProjection | null>(null);
	let pokemonSpeciesFormError = $state<string | null>(null);
	let pokemonSpeciesFormLoading = $state(false);
	let pokemonSpeciesFormRequest = 0;
	let legalityReport = $state<LegalityReportState>({ status: 'idle' });
	let legalityReportRequest = 0;
	let legalityQuickFixLauncherId: string | null = null;
	let pokemonAction = $state<PokemonActionState>({ status: 'idle' });
	let pokemonActionRequest = 0;
	let pokemonActionContext = $state<PokemonActionContext | null>(null);
	let pokemonActionReturnsToEditor = $state(false);
	let slotMenuPokemonActionPreview = $state<PokemonActionPreview | null>(null);
	let slotMenuPokemonActionsLoading = $state(false);
	let slotMenuPokemonActionRequest = 0;
	let pendingSlotOperation = $state<PendingStorageSlotOperation | null>(null);
	let carryState = $state<CarryState | null>(null);
	let clearSlotConfirmation = $state<ClearSlotConfirmation | null>(null);
	let clearSlotConfirmFocusIndex = $state(0);
	let boxMenuTarget = $state<BoxMenuTarget | null>(null);
	let toasts = $state<ToastView[]>([]);
	let workbenchPanes = $state<BoxPaneState[]>([
		createBoxPane('pane-pokemon-storage', pokemonStorageSource(), { boxCount: placeholderBoxCount })
	]);
	let activePaneId = $state('pane-pokemon-storage');
	let sourcePickerTargetPaneId = $state<string | null>(null);
	let sourcePickerFocusIndex = $state(0);
	let saveFiles = $state<StoredSaveFile[]>([]);
	let savePaneWorkspaces = $state<Record<string, SavePaneWorkspace>>({});
	let pokemonStorage = $state<StoredPokemonStorage | null>(null);
	let nextToastId = 1;
	let engine: EngineApi | null = null;
	let workspaceLoadRequest = 0;
	let paneSwitchRequest = 0;
	let installingActiveBoxProjection = false;
	let destroyed = false;
	const paneWorkspaceRequests: Record<string, number> = {};
	let paneWorkspaceLoadingRequests = $state<Record<string, number>>({});

	const activeSummonedWorkflow = $derived(summonedWorkflow.active);
	const sourcePickerOpen = $derived(activeSummonedWorkflow?.kind === 'source-picker');
	const slotMenuOpen = $derived(activeSummonedWorkflow?.kind === 'slot-menu');
	const boxMenuOpen = $derived(activeSummonedWorkflow?.kind === 'box-menu');
	const destinationInputSuspended = $derived(isDestinationInputSuspended(summonedWorkflow));
	const summonedSlotLauncher = $derived(getLaunchingSlot(summonedWorkflow));
	const activePane = $derived(
		workbenchPanes.find((pane) => pane.id === activePaneId) ?? workbenchPanes[0]
	);
	const boxMenuPane = $derived.by(() => {
		const target = boxMenuTarget;
		return target ? workbenchPanes.find((pane) => matchesBoxMenuTarget(pane, target)) : undefined;
	});
	const boxMenuCommands = $derived(
		createBoxMenuCommands({
			source: boxMenuTarget?.source ?? pokemonStorageSource(),
			workspaceReady: saveWorkspaceForPane(boxMenuPane) !== null,
			activeSavePane: boxMenuPane?.id === activeSavePaneId,
			paneCount: workbenchPanes.length
		})
	);
	const activePaneBox = $derived(activePane?.activeBox ?? navigation.activeBox);
	const summonedSlotPane = $derived(
		summonedSlotLauncher
			? workbenchPanes.find((pane) => pane.id === summonedSlotLauncher.paneId)
			: undefined
	);
	const summonedSlotBox = $derived(
		summonedSlotLauncher?.focus.zone === 'box'
			? (summonedSlotLauncher.box ?? summonedSlotPane?.activeBox ?? activePaneBox)
			: null
	);
	const boxCount = $derived(loadedSave?.workspace.summary.boxCount ?? placeholderBoxCount);
	const partyAvailable = $derived(paneHasParty(activePane));
	const activeBoxSlots = $derived(paneBoxSlots(activePane, activePaneBox));
	const activeFocusId = $derived(getFocusId(navigation.focus, activePaneBox));
	const activeSlotFocus = $derived<SlotFocus | null>(
		sourcePickerOpen
			? null
			: (navigation.focus.zone === 'party' && partyAvailable) || navigation.focus.zone === 'box'
				? navigation.focus
				: summonedSlotLauncher &&
					  (summonedSlotLauncher.focus.zone !== 'party' || paneHasParty(summonedSlotPane))
					? summonedSlotLauncher.focus
					: null
	);
	const navigationFocusedSlot = $derived(
		activeSlotFocus === null
			? noSelectedSlot
			: activeSlotFocus.zone === 'party'
				? (panePartySlots(activePane)[activeSlotFocus.slot] ?? noSelectedSlot)
				: (activeBoxSlots[activeSlotFocus.slot] ?? noSelectedSlot)
	);
	const summonedSlot = $derived(
		summonedSlotLauncher?.focus.zone === 'party'
			? (panePartySlots(summonedSlotPane)[summonedSlotLauncher.focus.slot] ?? noSelectedSlot)
			: summonedSlotLauncher?.focus.zone === 'box' && summonedSlotBox !== null
				? (paneBoxSlots(summonedSlotPane, summonedSlotBox)[summonedSlotLauncher.focus.slot] ??
					noSelectedSlot)
				: null
	);
	const focusedSlot = $derived(summonedSlot ?? navigationFocusedSlot);
	const focusedSlotPane = $derived(summonedSlotLauncher ? summonedSlotPane : activePane);
	const carriedSpriteUrl = $derived(carryState?.spriteUrl ?? null);
	const focusedSlotOwner = $derived(focusedSlotPane?.source ?? pokemonStorageSource());
	const focusedPaneWorkspace = $derived(saveWorkspaceForPane(focusedSlotPane));
	const createPokemonAvailability = $derived(
		pokemonCreationAvailability(
			focusedSlotOwner.type,
			focusedSlot,
			focusedPaneWorkspace !== null &&
				focusedSlotOwner.type === 'save-file' &&
				focusedSlotOwner.id === loadedSave?.file.id
		)
	);
	const slotMenuCommands = $derived(
		createSlotMenuCommands(focusedSlot, createPokemonAvailability.reason, {
			edit: focusedSlotOwner.type === 'save-file' && focusedPaneWorkspace !== null,
			legality:
				(focusedSlotOwner.type === 'save-file' && focusedPaneWorkspace !== null) ||
				(focusedSlotOwner.type === 'pokemon-storage' && Boolean(focusedSlot.entityBytesBase64)),
			evolve:
				slotMenuPokemonActionPreview?.actions.some(
					(action) => action.kind === 'evolve' && action.available
				) ?? false
		})
	);
	const saveSummary = $derived(focusedPaneWorkspace?.state.workspace.summary ?? null);
	const activeSlotPositionLabel = $derived(
		activeSlotFocus === null
			? 'No slot selected'
			: activeSlotFocus.zone === 'box'
				? (() => {
						const position = getBoxSlotPosition(activeSlotFocus.slot);
						return `${boxNameFor(summonedSlotBox ?? activePaneBox)} · Slot ${activeSlotFocus.slot + 1} · Row ${String.fromCharCode(65 + position.row)} / Col ${position.column + 1}`;
					})()
				: `Party · Slot ${activeSlotFocus.slot + 1}`
	);
	const activePaneControlCount = $derived(activePane ? paneControlCountFor(activePane) : 0);
	const sourcePickerCards = $derived<SourcePickerCard[]>(
		createSourcePickerCards({
			saveFiles:
				saveFiles.length > 0
					? saveFiles.map((saveFile) => ({
							id: saveFile.id,
							fileName: saveFile.originalFileName,
							gameLabel:
								loadedSave?.file.id === saveFile.id
									? (loadedSave.workspace.summary.gameVersion ?? null)
									: null,
							boxCount:
								loadedSave?.file.id === saveFile.id ? loadedSave.workspace.summary.boxCount : null,
							pokemonCount:
								loadedSave?.file.id === saveFile.id
									? loadedSave.workspace.summary.partyCount +
										activeBoxSlots.filter((slot) => slot.kind === 'pokemon').length
									: null,
							active: loadedSave?.file.id === saveFile.id
						}))
					: loadedSave
						? [
								{
									id: loadedSave.file.id,
									fileName: loadedSave.file.originalFileName,
									gameLabel: loadedSave.workspace.summary.gameVersion ?? null,
									boxCount,
									pokemonCount:
										loadedSave.workspace.summary.partyCount +
										activeBoxSlots.filter((slot) => slot.kind === 'pokemon').length,
									active: true
								}
							]
						: []
		})
	);
	const pokemonStorageBoxCount = $derived(pokemonStorage?.boxCount ?? placeholderBoxCount);

	$effect(syncAppChrome);

	function syncAppChrome() {
		updateAppChrome({
			hasLoadedSave: loadedSave !== null,
			carryActive: carryState !== null,
			controllerInputActive: true
		});

		return () => {
			updateAppChrome({ controllerInputActive: false, carryActive: false });
		};
	}

	function dispatch(action: NavigationAction) {
		if (dispatchToActiveSurface(action)) return;
		dispatchNavigation(action);
	}

	function dispatchToActiveSurface(action: NavigationAction): boolean {
		if (activeSummonedWorkflow?.kind === 'backup-browser') return true;
		if (action === 'sourceAction') {
			if (boxMenuOpen) {
				closeBoxMenu();
				return true;
			}
			handleSourceAction();
			return true;
		}
		if (action === 'carryMode') {
			if (pendingSlotOperation) togglePendingSlotOperationMode();
			return true;
		}

		switch (activeSummonedWorkflow?.kind) {
			case 'box-menu':
				dispatchBoxMenu(action);
				return true;
			case 'slot-menu':
				dispatchSlotMenu(action);
				return true;
			case 'source-picker':
				dispatchSourcePicker(action);
				return true;
			case 'clear-slot-confirmation':
				dispatchClearSlotConfirmation(action);
				return true;
			case 'pokemon-actions':
				dispatchPokemonAction(action);
				return true;
			case 'pokemon-editor':
				dispatchPokemonEditor(action);
				return true;
			case 'legality-report':
				dispatchLegalityReport(action);
				return true;
		}

		if (pendingSlotOperation && action === 'back') {
			void cancelPendingSlotOperation();
			return true;
		}

		if (pendingSlotOperation && action === 'confirm' && isSlotFocus(navigation.focus)) {
			void completePendingSlotOperation(slotRefForFocus(navigation.focus));
			return true;
		}

		return tryNavigateBetweenPanes(action);
	}

	function dispatchNavigation(action: NavigationAction) {
		const previousFocus = navigation.focus;
		if (action === 'confirm' && isSlotFocus(previousFocus)) {
			openSlotMenu(previousFocus);
			return;
		}

		const pane = activePane;
		const previousBox = activePaneBox;
		navigation = applyNavigationAction(navigation, action, {
			paneControlCount: activePaneControlCount,
			partyAvailable,
			carryActive: pendingSlotOperation !== null
		});

		if (action === 'confirm') {
			activateFocusedControl(previousFocus);
		}

		if (pane && navigation.activeBox !== previousBox) {
			workbenchPanes = setPaneActiveBox(workbenchPanes, pane.id, navigation.activeBox);
		}
		if (pane) {
			workbenchPanes = setPaneFocus(workbenchPanes, pane.id, navigation.locationFocus);
		}

		if (
			pane &&
			loadedSave &&
			pane.source.type === 'save-file' &&
			pane.source.id === loadedSave.file.id &&
			navigation.activeBox !== previousBox
		) {
			void loadWorkspaceForSave(loadedSave, navigation.activeBox);
		}

		if (pane?.source.type === 'save-file' && pane.source.id !== loadedSave?.file.id) {
			void refreshPaneWorkspace(pane.id, navigation.activeBox);
		}

		queueMicrotask(focusActiveControl);
	}

	function dispatchSlotMenu(action: NavigationAction) {
		const result = dispatchSlotMenuAction(navigation.focus, action, slotMenuCommands.length + 1);
		navigation = { ...navigation, focus: result.focus };

		if (result.effect === 'dismiss') {
			closeSlotMenu();
		} else if (result.effect === 'activate') {
			activateFocusedControl();
		} else {
			queueMicrotask(focusActiveControl);
		}
	}

	function dispatchBoxMenu(action: NavigationAction) {
		const index = navigation.focus.zone === 'actions' ? navigation.focus.index : 0;
		switch (action) {
			case 'left':
			case 'up':
				focusBoxMenuCommand(index - 1);
				break;
			case 'right':
			case 'down':
				focusBoxMenuCommand(index + 1);
				break;
			case 'confirm': {
				const command = boxMenuCommands[index];
				if (command && !command.reason) selectBoxMenuCommand(command.key);
				break;
			}
			case 'back':
				closeBoxMenu();
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
			case 'carryMode':
				break;
		}
	}

	function dispatchSourcePicker(action: NavigationAction) {
		const controls = sourcePickerControls();

		switch (action) {
			case 'left':
			case 'up':
				focusSourcePickerControl(sourcePickerFocusIndex - 1, controls);
				break;
			case 'right':
			case 'down':
				focusSourcePickerControl(sourcePickerFocusIndex + 1, controls);
				break;
			case 'confirm':
				controls[sourcePickerFocusIndex]?.click();
				break;
			case 'back':
				closeSourcePicker();
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
				break;
		}
	}

	function handleSourceAction() {
		if (pendingSlotOperation || activeSummonedWorkflow || !activePane) {
			return;
		}

		if (
			navigation.focus.zone === 'party' ||
			navigation.focus.zone === 'box' ||
			navigation.focus.zone === 'paneControls'
		) {
			openBoxMenu(activePane);
		}
	}

	function sourcePickerControls() {
		return [
			...Array.from(document.querySelectorAll<HTMLButtonElement>('.source-card-grid button')),
			...Array.from(document.querySelectorAll<HTMLButtonElement>('.source-picker-close'))
		].filter((control) => !control.disabled);
	}

	function focusSourcePickerControl(index: number, controls = sourcePickerControls()) {
		if (controls.length === 0) {
			return;
		}

		sourcePickerFocusIndex = ((index % controls.length) + controls.length) % controls.length;
		controls[sourcePickerFocusIndex]?.focus();
	}

	function tryNavigateBetweenPanes(action: NavigationAction): boolean {
		if (
			(action !== 'left' && action !== 'right' && action !== 'up' && action !== 'down') ||
			!isSlotFocus(navigation.focus) ||
			workbenchPanes.length !== 2
		) {
			return false;
		}

		const paneElements = Array.from(document.querySelectorAll<HTMLElement>('.box-pane'));
		if (paneElements.length !== 2) return false;
		const paneGeometry = workbenchPanes.map((pane, index) => {
			const bounds = paneElements[index]?.getBoundingClientRect();
			return bounds
				? {
						id: pane.id,
						location: pane.focus.zone,
						bounds: {
							top: bounds.top,
							right: bounds.right,
							bottom: bounds.bottom,
							left: bounds.left
						}
					}
				: null;
		});
		if (!paneGeometry[0] || !paneGeometry[1]) return false;
		const crossing = crossPaneSharedEdge({
			panes: [paneGeometry[0], paneGeometry[1]],
			activePaneId,
			direction: action,
			focus: navigation.focus
		});
		if (!crossing) return false;
		const nextPane = workbenchPanes.find((pane) => pane.id === crossing.paneId);
		if (!nextPane) return false;

		activatePane(nextPane);
		navigation = {
			...navigation,
			activeBox: nextPane.activeBox,
			boxCount: Math.max(1, nextPane.boxCount),
			focus: crossing.focus,
			locationFocus: crossing.focus
		};
		workbenchPanes = setPaneFocus(workbenchPanes, nextPane.id, crossing.focus);
		return true;
	}

	async function focusActiveControl() {
		await tick();
		document.getElementById(focusIdForNavigation(navigation.focus))?.focus();
	}

	async function keepFocusedSlotVisible() {
		if (destinationInputSuspended || !isSlotFocus(navigation.focus)) return;
		await tick();
		document
			.getElementById(focusIdForNavigation(navigation.focus))
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function focusIdForNavigation(focus: ControllerFocus) {
		if (focus.zone !== 'paneControls') return getFocusId(focus, activePaneBox);
		return focus.index === 0 ? collectionControlId(activePaneId) : `close-pane-${activePaneId}`;
	}

	function dispatchPokemonEditor(action: NavigationAction) {
		if (action === 'previousBox' || action === 'nextBox') {
			exitPokemonEditorEnteredField();
			pageActivePokemonEditorSection(action === 'previousBox' ? -1 : 1);
			return;
		}

		if (pokemonEditorSession.view === 'discard') {
			dispatchPokemonEditorDiscard(action);
			return;
		}

		if (pokemonEditorSession.view === 'review') {
			if (action === 'back') requestClosePokemonEditor();
			else if (action === 'confirm') {
				const focus = pokemonEditorSession.focus;
				if (focus.zone === 'review') document.getElementById(focus.control)?.click();
			}
			return;
		}

		if (dispatchPokemonEditorEnteredField(action)) {
			return;
		}

		if (action === 'back') {
			requestClosePokemonEditor();
			return;
		}

		if (pokemonEditorSession.focus.zone === 'rail') {
			dispatchPokemonEditorRail(action);
			return;
		}

		if (pokemonEditorSession.focus.zone === 'content') {
			if (
				document.activeElement instanceof HTMLElement &&
				document.activeElement.closest('.editor-actions')
			) {
				dispatchPokemonEditorActions(action);
			} else {
				dispatchPokemonEditorContent(action);
			}
		}
	}

	function dispatchPokemonEditorRail(action: NavigationAction) {
		const sideRail = pokemonEditorUsesSideRail();
		if (
			(sideRail && (action === 'up' || action === 'down')) ||
			(!sideRail && (action === 'left' || action === 'right'))
		) {
			pageActivePokemonEditorSection(action === 'up' || action === 'left' ? -1 : 1);
			return;
		}
		if (action === 'confirm' || (sideRail ? action === 'right' : action === 'down')) {
			focusPokemonEditorContent();
		}
	}

	function dispatchPokemonEditorContent(action: NavigationAction) {
		if (action === 'confirm') {
			activatePokemonEditorControl();
			return;
		}
		if (action !== 'left' && action !== 'right' && action !== 'up' && action !== 'down') return;

		const sideRail = pokemonEditorUsesSideRail();
		const controls = pokemonEditorContentControls();
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		if (!active || !controls.includes(active)) {
			focusPokemonEditorContent();
			return;
		}
		const candidate = closestDirectionalControl(active, controls, action);
		if (candidate) {
			candidate.focus();
			candidate.scrollIntoView({ block: 'nearest', inline: 'nearest' });
			return;
		}
		if ((sideRail && action === 'left') || (!sideRail && action === 'up')) {
			focusPokemonEditorRail();
			return;
		}
		if (action === 'down') focusPokemonEditorActions();
	}

	function dispatchPokemonEditorActions(action: NavigationAction) {
		if (action === 'confirm') {
			activatePokemonEditorControl();
			return;
		}
		const controls = pokemonEditorActionControls();
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const index = active instanceof HTMLButtonElement ? controls.indexOf(active) : -1;
		if (action === 'left' || action === 'right') {
			const offset = action === 'left' ? -1 : 1;
			controls[(Math.max(0, index) + offset + controls.length) % controls.length]?.focus();
		} else if (action === 'up') {
			focusPokemonEditorContent(true);
		}
	}

	function dispatchPokemonEditorDiscard(action: NavigationAction) {
		const controls = ['pokemon-editor-keep-editing', 'pokemon-editor-discard-edits']
			.map((id) => document.getElementById(id))
			.filter((element): element is HTMLButtonElement => element instanceof HTMLButtonElement);
		const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const index = active ? controls.indexOf(active as HTMLButtonElement) : -1;
		if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
			controls[index === 0 ? 1 : 0]?.focus();
		} else if (action === 'confirm') {
			controls[Math.max(0, index)]?.click();
		} else if (action === 'back') {
			keepEditingPokemonEditor();
		}
	}

	function dispatchPokemonAction(action: NavigationAction) {
		const controls = pokemonActionControls();
		const activeElement = document.activeElement;
		const currentIndex =
			activeElement instanceof HTMLButtonElement ? controls.indexOf(activeElement) : -1;

		switch (action) {
			case 'left':
			case 'up':
				focusPokemonActionControl(currentIndex - 1, controls);
				break;
			case 'right':
			case 'down':
				focusPokemonActionControl(currentIndex + 1, controls);
				break;
			case 'confirm':
				if (activeElement instanceof HTMLButtonElement && !activeElement.disabled) {
					activeElement.click();
				} else {
					focusPokemonActionControl(0, controls);
				}
				break;
			case 'back':
				backPokemonActions();
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
				break;
		}
	}

	function dispatchLegalityReport(action: NavigationAction) {
		const controls = Array.from(
			document.querySelectorAll<HTMLButtonElement>('[data-legality-report-control]:not(:disabled)')
		);
		const active = document.activeElement;
		const index = active instanceof HTMLButtonElement ? controls.indexOf(active) : -1;
		if (action === 'left' || action === 'up') {
			controls[(Math.max(0, index) - 1 + controls.length) % controls.length]?.focus();
		} else if (action === 'right' || action === 'down') {
			controls[(Math.max(0, index) + 1) % controls.length]?.focus();
		} else if (action === 'confirm') {
			controls[Math.max(0, index)]?.click();
		} else if (action === 'back') {
			backLegalityReport();
		}
	}

	function pokemonActionControls() {
		return Array.from(
			document.querySelectorAll<HTMLButtonElement>('[data-pokemon-action-control]')
		).filter((control) => !control.disabled);
	}

	function focusPokemonActionControl(index: number, controls = pokemonActionControls()) {
		if (controls.length === 0) {
			return;
		}

		const nextIndex = ((index % controls.length) + controls.length) % controls.length;
		controls[nextIndex]?.focus();
	}

	function pokemonEditorContentControls() {
		const openCombobox = document.querySelector<HTMLElement>(
			'.pokemon-editor [data-combobox-open="true"]'
		);
		if (openCombobox) {
			return Array.from(
				openCombobox.querySelectorAll<HTMLElement>('input, [data-combobox-option]')
			).filter((control) => control.getClientRects().length > 0);
		}

		const controls = Array.from(
			document.querySelectorAll<HTMLElement>(
				'.pokemon-editor .editor-content button:not([disabled]), .pokemon-editor .editor-content input:not([disabled]), .pokemon-editor .editor-content select:not([disabled]), .pokemon-editor .editor-content [tabindex="0"]'
			)
		).filter((control) => {
			return (
				control.getClientRects().length > 0 && !control.closest('[data-editor-active="false"]')
			);
		});
		if (controls.length > 0) return controls;

		const fallback = document.getElementById(
			`pokemon-editor-content-${pokemonEditorSession.section}`
		);
		return fallback instanceof HTMLElement && fallback.getClientRects().length > 0
			? [fallback]
			: [];
	}

	function pokemonEditorActionControls() {
		return Array.from(
			document.querySelectorAll<HTMLButtonElement>(
				'.pokemon-editor .editor-actions button:not([disabled])'
			)
		).filter((control) => control.getClientRects().length > 0);
	}

	function focusPokemonEditorActions() {
		const target = pokemonEditorActionControls()[0];
		if (!target) return;
		target.focus();
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function pokemonEditorUsesSideRail() {
		const editor = document.querySelector<HTMLElement>('.pokemon-editor');
		return editor ? editor.clientWidth > editor.clientHeight : true;
	}

	function closestDirectionalControl(
		origin: HTMLElement,
		controls: HTMLElement[],
		direction: Extract<NavigationAction, 'left' | 'right' | 'up' | 'down'>
	) {
		const source = origin.getBoundingClientRect();
		const sourceX = source.left + source.width / 2;
		const sourceY = source.top + source.height / 2;
		let best: { control: HTMLElement; score: number } | null = null;

		for (const control of controls) {
			if (control === origin) continue;
			const rect = control.getBoundingClientRect();
			const dx = rect.left + rect.width / 2 - sourceX;
			const dy = rect.top + rect.height / 2 - sourceY;
			const primary =
				direction === 'left' ? -dx : direction === 'right' ? dx : direction === 'up' ? -dy : dy;
			if (primary <= 1) continue;
			const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
			const score = primary + cross * 2;
			if (!best || score < best.score) best = { control, score };
		}
		return best?.control ?? null;
	}

	function dispatchPokemonEditorEnteredField(action: NavigationAction) {
		const editor = document.querySelector<HTMLElement>('.pokemon-editor');
		const enteredId = editor?.dataset.editorEnteredField;
		if (!editor || !enteredId) return false;

		const field = document.getElementById(enteredId);
		if (!(field instanceof HTMLElement) || !editor.contains(field)) return false;

		if (action === 'back') {
			exitPokemonEditorEnteredField();
			return true;
		}

		if (
			field instanceof HTMLSelectElement &&
			(action === 'left' || action === 'right' || action === 'up' || action === 'down')
		) {
			changeEnteredPokemonEditorSelect(field, action === 'left' || action === 'up' ? -1 : 1);
			return true;
		}

		if (
			field instanceof HTMLInputElement &&
			field.type === 'number' &&
			(action === 'up' || action === 'down')
		) {
			if (action === 'up') field.stepUp();
			else field.stepDown();
			field.dispatchEvent(new Event('input', { bubbles: true }));
			return true;
		}

		return (
			field instanceof HTMLInputElement &&
			(action === 'left' || action === 'right' || action === 'up' || action === 'down')
		);
	}

	function changeEnteredPokemonEditorSelect(select: HTMLSelectElement, offset: -1 | 1) {
		const options = Array.from(select.options).filter((option) => !option.disabled);
		if (options.length === 0) return;
		const current = Math.max(
			0,
			options.findIndex((option) => option.value === select.value)
		);
		const next = options[(current + offset + options.length) % options.length];
		if (!next) return;
		select.value = next.value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	}

	function exitPokemonEditorEnteredField() {
		const editor = document.querySelector<HTMLElement>('.pokemon-editor');
		const enteredId = editor?.dataset.editorEnteredField;
		const field = enteredId ? document.getElementById(enteredId) : null;
		if (!(field instanceof HTMLElement) || !editor?.contains(field)) return;

		if (field.closest('[data-combobox-open="true"]')) {
			field.click();
			return;
		}

		const active = document.activeElement;
		if (active instanceof HTMLElement && editor.contains(active)) active.blur();
		field.focus();
	}

	function activatePokemonEditorControl() {
		const activeElement = document.activeElement;
		if (
			activeElement instanceof HTMLElement &&
			activeElement.hasAttribute('data-combobox-search')
		) {
			document
				.querySelector<HTMLButtonElement>(
					'.pokemon-editor [data-combobox-open="true"] [data-combobox-option].active'
				)
				?.click();
			return;
		}
		if (activeElement instanceof HTMLButtonElement && !activeElement.disabled) {
			activeElement.click();
			return;
		}

		if (activeElement instanceof HTMLInputElement && activeElement.closest('.pokemon-editor')) {
			if (activeElement.dataset.controllerEditing === 'false') {
				activeElement.click();
				return;
			}
			return;
		}

		if (activeElement instanceof HTMLSelectElement && !activeElement.disabled) {
			try {
				activeElement.showPicker();
			} catch {
				activeElement.focus();
			}
		}

		if (activeElement instanceof HTMLSelectElement && activeElement.closest('.pokemon-editor')) {
			activeElement.click();
		}
	}

	function isSlotFocus(focus: typeof navigation.focus): focus is SlotFocus {
		return focus.zone === 'party' || focus.zone === 'box';
	}

	function dispatchClearSlotConfirmation(action: NavigationAction) {
		switch (action) {
			case 'left':
			case 'up':
				focusClearSlotCommand(clearSlotConfirmFocusIndex - 1);
				break;
			case 'right':
			case 'down':
				focusClearSlotCommand(clearSlotConfirmFocusIndex + 1);
				break;
			case 'confirm':
				if (clearSlotConfirmFocusIndex === 0) {
					cancelClearSlot();
				} else {
					confirmClearSlot();
				}
				break;
			case 'back':
				cancelClearSlot();
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
				break;
		}
	}

	function handleAppKeydown(event: KeyboardEvent) {
		if (activeSummonedWorkflow?.kind === 'backup-browser') return;
		const action = keyboardAction(event);

		if (!action) {
			return;
		}

		if (
			(pokemonEditor || pokemonCreation) &&
			!isControllerKeyboardEvent(event) &&
			isNativeEditorActivation(event, action)
		) {
			return;
		}

		event.preventDefault();
		syncNavigationFocusFromActiveElement();
		if (pokemonEditor || pokemonCreation) {
			dispatch(action);
			return;
		}

		dispatch(action);
	}

	function syncNavigationFocusFromActiveElement() {
		const activeElement = document.activeElement;
		if (!(activeElement instanceof HTMLElement)) {
			return;
		}

		const paneControlIndex = activeElement.dataset.paneControlIndex;
		if (paneControlIndex !== undefined) {
			navigation = {
				...navigation,
				focus: focusPaneControl(Number(paneControlIndex), activePaneControlCount)
			};
			return;
		}

		const partySlotMatch = activeElement.id.match(/^party-slot-(\d+)$/);
		if (partySlotMatch) {
			navigation = setLocationFocus(navigation, focusPartySlot(Number(partySlotMatch[1])));
			return;
		}

		const boxSlotMatch = activeElement.id.match(/^box-\d+-slot-(\d+)$/);
		if (boxSlotMatch) {
			navigation = setLocationFocus(navigation, focusBoxSlot(Number(boxSlotMatch[1])));
		}
	}

	function focusParty(slot: number) {
		navigation = setLocationFocus(navigation, focusPartySlot(slot));
		workbenchPanes = setPaneFocus(workbenchPanes, activePaneId, navigation.locationFocus);
		queueMicrotask(focusActiveControl);
	}

	function focusBox(slot: number) {
		navigation = setLocationFocus(navigation, focusBoxSlot(slot));
		workbenchPanes = setPaneFocus(workbenchPanes, activePaneId, navigation.locationFocus);
		queueMicrotask(focusActiveControl);
	}

	function changePaneLocation(pane: BoxPaneState, action: 'previousBox' | 'nextBox') {
		const previousBox = pane.activeBox;
		const state = applyNavigationAction(
			{
				...navigation,
				activeBox: pane.activeBox,
				boxCount: Math.max(1, pane.boxCount),
				focus: pane.id === activePaneId ? navigation.focus : pane.focus,
				locationFocus: pane.focus
			},
			action,
			{
				paneControlCount: paneControlCountFor(pane),
				partyAvailable: paneHasParty(pane),
				carryActive: pendingSlotOperation !== null
			}
		);
		workbenchPanes = setPaneFocus(
			setPaneActiveBox(workbenchPanes, pane.id, state.activeBox),
			pane.id,
			state.locationFocus
		);
		if (pane.id === activePaneId) navigation = state;

		if (state.locationFocus.zone === 'box' && state.activeBox !== previousBox) {
			if (
				loadedSave &&
				pane.id === activePaneId &&
				pane.source.type === 'save-file' &&
				pane.source.id === loadedSave.file.id
			) {
				void loadWorkspaceForSave(loadedSave, state.activeBox, pane.id);
			} else if (pane.source.type === 'save-file') {
				void refreshPaneWorkspace(pane.id, state.activeBox);
			}
		}
		queueMicrotask(focusActiveControl);
	}

	function slotLauncher(
		focus: SlotFocus,
		pane: BoxPaneState | undefined = activePane
	): SummonedWorkflowLauncher {
		return {
			type: 'slot',
			id:
				focus.zone === 'party'
					? `party-slot-${focus.slot}`
					: `box-${pane?.activeBox ?? activePaneBox}-slot-${focus.slot}`,
			paneId: pane?.id ?? activePaneId,
			box: focus.zone === 'box' ? (pane?.activeBox ?? activePaneBox) : null,
			focus
		};
	}

	function controlLauncher(id: string): SummonedWorkflowLauncher {
		return { type: 'control', id };
	}

	function launcherForFocus(focus: ControllerFocus): SummonedWorkflowLauncher {
		return isSlotFocus(focus) ? slotLauncher(focus) : controlLauncher(focusIdForNavigation(focus));
	}

	function openSlotMenu(focus: SlotFocus) {
		if (!summonedWorkflow.open('slot-menu', slotLauncher(focus))) return;
		slotMenuPokemonActionRequest += 1;
		slotMenuPokemonActionPreview = null;
		slotMenuPokemonActionsLoading = false;
		navigation = { ...navigation, focus: { zone: 'actions', index: 0 } };
		queueMicrotask(focusActiveControl);
		if (focusedSlot.kind === 'pokemon') void loadSlotMenuPokemonActions();
	}

	function currentSlotMenuCommandKey(): SlotMenuCommandKey | 'close' {
		if (navigation.focus.zone !== 'actions') return 'close';
		return slotMenuCommands[navigation.focus.index]?.key ?? 'close';
	}

	function restoreSlotMenuCommandFocus(command: SlotMenuCommandKey | 'close') {
		const index =
			command === 'close'
				? slotMenuCommands.length
				: slotMenuCommands.findIndex((candidate) => candidate.key === command);
		navigation = {
			...navigation,
			focus: { zone: 'actions', index: index < 0 ? slotMenuCommands.length : index }
		};
		queueMicrotask(focusActiveControl);
	}

	async function loadSlotMenuPokemonActions() {
		const activeEngine = engine;
		const context = pokemonActionContextForFocusedSlot();
		if (!activeEngine || !context) return;

		const request = (slotMenuPokemonActionRequest += 1);
		slotMenuPokemonActionsLoading = true;
		try {
			const result = await requestPokemonActionPreview(activeEngine, context.target);
			if (
				request !== slotMenuPokemonActionRequest ||
				activeSummonedWorkflow?.kind !== 'slot-menu'
			) {
				return;
			}
			if (result.ok) {
				const focusedCommand = currentSlotMenuCommandKey();
				slotMenuPokemonActionPreview = result.value;
				await tick();
				restoreSlotMenuCommandFocus(focusedCommand);
			}
		} finally {
			if (request === slotMenuPokemonActionRequest) slotMenuPokemonActionsLoading = false;
		}
	}

	function openRelatedWorkflow(kind: SummonedWorkflowKind, launcherId?: string) {
		const launcherFocus = navigation.focus;
		summonedWorkflow.openRelated(
			kind,
			controlLauncher(launcherId ?? getFocusId(launcherFocus, activePaneBox))
		);
	}

	function slotCommandLauncherId(command: SlotMenuCommandKey) {
		const index = slotMenuCommands.findIndex((candidate) => candidate.key === command);
		return index >= 0 ? `slot-action-${index}` : getFocusId(navigation.focus, activePaneBox);
	}

	function dismissActiveWorkflow() {
		const launcher = summonedWorkflow.dismiss();
		if (!launcher) return;
		if (launcher.type === 'slot') {
			const pane = workbenchPanes.find(({ id }) => id === launcher.paneId);
			if (pane) {
				activePaneId = pane.id;
				workbenchPanes = setPaneFocus(
					setPaneActiveBox(workbenchPanes, pane.id, launcher.box ?? pane.activeBox),
					pane.id,
					launcher.focus
				);
				navigation = {
					...navigation,
					activeBox: launcher.box ?? pane.activeBox,
					boxCount: pane.boxCount,
					focus: launcher.focus,
					locationFocus: launcher.focus
				};
			}
		}
		queueMicrotask(() => {
			const target = document.getElementById(launcher.id);
			if (target) target.focus();
			else focusActiveControl();
		});
	}

	function closeSlotMenu() {
		if (pokemonCreationBusyRequest !== null) {
			busy = false;
			pokemonCreationBusyRequest = null;
		}
		pokemonCreationRequest += 1;
		slotMenuPokemonActionRequest += 1;
		slotMenuPokemonActionPreview = null;
		slotMenuPokemonActionsLoading = false;
		dismissActiveWorkflow();
	}

	function collectionControlId(paneId: string) {
		return `collection-control-${paneId}`;
	}

	function matchesBoxMenuTarget(pane: BoxPaneState, target: BoxMenuTarget) {
		return (
			pane.id === target.paneId &&
			pane.source.type === target.source.type &&
			pane.source.id === target.source.id
		);
	}

	function openBoxMenu(pane: BoxPaneState) {
		if (pendingSlotOperation || activeSummonedWorkflow) return;

		const launcher = isSlotFocus(navigation.focus)
			? slotLauncher(navigation.focus, pane)
			: launcherForFocus(navigation.focus);
		if (!summonedWorkflow.open('box-menu', launcher)) return;
		boxMenuTarget = { paneId: pane.id, source: { ...pane.source } };
		navigation = { ...navigation, focus: { zone: 'actions', index: 0 } };
		queueMicrotask(() => focusBoxMenuCommand(0));
	}

	function closeBoxMenu() {
		boxMenuTarget = null;
		dismissActiveWorkflow();
	}

	function focusBoxMenuCommand(index: number) {
		const clamped = Math.max(0, Math.min(index, boxMenuCommands.length - 1));
		navigation = { ...navigation, focus: { zone: 'actions', index: clamped } };
		queueMicrotask(() => document.getElementById(`box-menu-command-${clamped}`)?.focus());
	}

	function selectBoxMenuCommand(command: BoxMenuCommandKey) {
		if (busy || !boxMenuCommands.some(({ key, reason }) => key === command && !reason)) return;

		switch (command) {
			case 'export':
				void exportBoxMenuSave();
				break;
			case 'save-backup':
				void saveBoxMenuBackup();
				break;
			case 'switch':
				openRelatedSourcePicker(boxMenuTarget?.paneId ?? null);
				break;
			case 'open-another':
				openRelatedSourcePicker(null);
				break;
			case 'close':
				closeBoxMenuPane();
				break;
		}
	}

	function resolveBoxMenuSaveTarget(target: BoxMenuTarget | null = boxMenuTarget) {
		if (!target || target.source.type !== 'save-file' || !target.source.id) return null;
		const pane = workbenchPanes.find((candidate) => matchesBoxMenuTarget(candidate, target));
		const workspace = saveWorkspaceForPane(pane);
		return pane && workspace ? { pane, workspace } : null;
	}

	async function exportBoxMenuSave() {
		const target = boxMenuTarget;
		const resolved = resolveBoxMenuSaveTarget(target);
		if (!target || !resolved) return;

		busy = true;
		importError = null;
		statusMessage = `Serializing ${resolved.workspace.state.file.originalFileName ?? 'Save File'}...`;
		try {
			const bytes = await workspaceService.exportBytes(resolved.workspace.state);
			if (!resolveBoxMenuSaveTarget(target)) return;
			downloadBytes(bytes, createExportFileName(resolved.workspace.state.file.originalFileName));
			statusMessage = `Export ready for ${resolved.workspace.state.file.originalFileName ?? 'Save File'}.`;
			closeBoxMenu();
		} catch (error) {
			importError = getErrorMessage(error);
			statusMessage = 'Export failed.';
			showToast('error', importError);
		} finally {
			busy = false;
		}
	}

	async function saveBoxMenuBackup() {
		const target = boxMenuTarget;
		const resolved = resolveBoxMenuSaveTarget(target);
		if (!target || !resolved) return;

		busy = true;
		statusMessage = `Creating a Backup for ${resolved.workspace.state.file.originalFileName ?? 'Save File'}...`;
		try {
			await createManualBackup({
				storage,
				owner: resolved.workspace.state.file,
				workspaceBytes: resolved.workspace.state.bytes
			});
			if (!resolveBoxMenuSaveTarget(target)) return;
			invalidateSavesCache();
			statusMessage = `Backup saved for ${resolved.workspace.state.file.originalFileName ?? 'Save File'}.`;
			showToast('success', statusMessage);
			closeBoxMenu();
		} catch (error) {
			statusMessage = getErrorMessage(error);
			showToast('error', statusMessage);
		} finally {
			busy = false;
		}
	}

	function closeBoxMenuPane() {
		const target = boxMenuTarget;
		const pane = target
			? workbenchPanes.find((candidate) => matchesBoxMenuTarget(candidate, target))
			: undefined;
		if (!pane || pane.id === activeSavePaneId || workbenchPanes.length <= 1) return;
		boxMenuTarget = null;
		summonedWorkflow.closeAll();
		closePane(pane.id);
	}

	function slotRefForFocus(
		focus: SlotFocus = activeSlotFocus ?? { zone: 'box', slot: 0 }
	): SaveSlotRef {
		return focus.zone === 'party'
			? { zone: 'party', slot: focus.slot }
			: {
					zone: 'box',
					box:
						summonedSlotLauncher?.focus.zone === 'box' &&
						summonedSlotLauncher.focus.slot === focus.slot
							? (summonedSlotLauncher.box ?? activePaneBox)
							: activePaneBox,
					slot: focus.slot
				};
	}

	function slotRefForLauncher(
		launcher: Extract<SummonedWorkflowLauncher, { type: 'slot' }>
	): SaveSlotRef {
		return launcher.focus.zone === 'party'
			? { zone: 'party', slot: launcher.focus.slot }
			: { zone: 'box', box: launcher.box ?? 0, slot: launcher.focus.slot };
	}

	function slotRefKey(ref: SaveSlotRef): string {
		return ref.zone === 'party' ? `party:${ref.slot}` : `box:${ref.box}:${ref.slot}`;
	}

	function isSamePendingDestination(
		source: SaveSlotRef,
		destination: SaveSlotRef,
		destinationPane: BoxPaneState | undefined
	): boolean {
		if (!carryState || !destinationPane) {
			return slotRefKey(source) === slotRefKey(destination);
		}

		return (
			slotRefKey(source) === slotRefKey(destination) &&
			carryState.sourceOwner.type === destinationPane.source.type &&
			carryState.sourceOwner.id === destinationPane.source.id
		);
	}

	function locationForSlotRef(ref: SaveSlotRef): string {
		return ref.zone === 'party'
			? `Party Slot ${ref.slot + 1}`
			: `${boxNameFor(ref.box)} Slot ${ref.slot + 1}`;
	}

	function slotForRef(
		ref: SaveSlotRef,
		pane: BoxPaneState | undefined = activePane
	): SlotView | null {
		if (ref.zone === 'party') {
			return panePartySlots(pane)[ref.slot] ?? null;
		}

		if (pane?.source.type === 'pokemon-storage') {
			return storageSlotForRef(ref);
		}

		return paneBoxSlots(pane, ref.box)[ref.slot] ?? null;
	}

	function storageSlotForRef(ref: SaveSlotRef): SlotView | null {
		if (ref.zone === 'party') {
			return null;
		}

		return storageSlotsForBox(ref.box)[ref.slot] ?? null;
	}

	function destinationStateFor(
		ref: SaveSlotRef,
		slot: SlotView,
		pane: BoxPaneState | undefined = activePane
	): 'valid' | 'invalid' | 'source' | null {
		if (!pendingSlotOperation) {
			return null;
		}

		const destinationPane = pane;

		if (carryState && destinationPane) {
			return destinationStateForEvaluation(
				evaluateDestination({
					carry: carryState,
					destinationPane,
					destination: workbenchSlotRefForSaveRef(destinationPane.id, ref),
					destinationSlot: slot
				})
			);
		}

		if (slotRefKey(ref) === slotRefKey(pendingSlotOperation.source)) {
			return 'source';
		}

		return destinationStateForStorageOperation({
			pending: pendingSlotOperation,
			destination: ref,
			destinationSlot: slot,
			partyCount: saveWorkspaceForPane(pane)?.state.workspace.summary.partyCount ?? 0
		});
	}

	function isInvalidPartyAppendDestination(
		ref: SaveSlotRef,
		slot: SlotView | null,
		pane: BoxPaneState | undefined
	): boolean {
		const partyCount = saveWorkspaceForPane(pane)?.state.workspace.summary.partyCount;
		return (
			ref.zone === 'party' &&
			slot?.kind === 'empty' &&
			partyCount !== undefined &&
			ref.slot > partyCount
		);
	}

	async function completePendingSlotOperation(
		destination: SaveSlotRef,
		destinationPane: BoxPaneState | undefined = activePane
	) {
		if (!pendingSlotOperation) {
			return;
		}

		const pending = pendingSlotOperation;
		const ownerPane = destinationPane;
		const destinationSlot = slotForRef(destination, ownerPane);

		if (isSamePendingDestination(pending.source, destination, ownerPane)) {
			pendingSlotOperation = null;
			carryState = null;
			statusMessage = 'No Slot change made.';
			queueMicrotask(focusActiveControl);
			return;
		}

		if (pending.kind === 'copy' && destinationSlot?.kind === 'pokemon') {
			showToast('error', 'Copy needs an empty destination Slot.');
			statusMessage = 'Copy needs an empty destination Slot.';
			return;
		}

		if (isInvalidPartyAppendDestination(destination, destinationSlot, ownerPane)) {
			showToast('error', 'That Party Slot cannot be used yet.');
			statusMessage = 'That Party Slot cannot be used yet.';
			return;
		}

		const activeSaveId = loadedSave?.file.id;
		const unsupportedSaveOwner =
			(carryState?.sourceOwner.type === 'save-file' &&
				carryState.sourceOwner.id !== activeSaveId) ||
			(ownerPane?.source.type === 'save-file' && ownerPane.source.id !== activeSaveId);
		if (unsupportedSaveOwner) {
			showToast('error', 'Moving Pokemon between Save Files needs engine transfer support.');
			statusMessage = 'Cross-save movement is not available yet.';
			return;
		}

		if (ownerPane?.source.type === 'pokemon-storage') {
			await applySaveToStorageOperation(pending, destination, ownerPane);
			return;
		}

		if (carryState?.sourceOwner.type === 'pokemon-storage') {
			await applyStorageToSaveOperation(pending, destination, ownerPane);
			return;
		}

		if (carryState?.sourceOwner.type === 'save-file' && ownerPane?.source.type === 'save-file') {
			if (carryState.sourceOwner.id !== ownerPane.source.id) {
				showToast('error', 'Moving Pokemon between Save Files needs engine transfer support.');
				statusMessage = 'Cross-save movement is not available yet.';
				return;
			}
			const workspace = saveWorkspaceForPane(ownerPane)?.state;
			if (!workspace) {
				showToast('error', 'The source Save File is no longer available.');
				return;
			}
			await applySlotOperation(
				{ kind: pending.kind, source: pending.source, destination },
				{ state: workspace, paneId: ownerPane.id }
			);
			return;
		}

		await applySlotOperation({ kind: pending.kind, source: pending.source, destination });
	}

	async function applyStorageToSaveOperation(
		pending: PendingStorageSlotOperation,
		destination: SaveSlotRef,
		destinationPane: BoxPaneState | undefined
	) {
		const destinationWorkspace = saveWorkspaceForPane(destinationPane)?.state ?? null;
		if (!destinationWorkspace || !engine) {
			showToast('error', 'Load a Save File before changing Slots.');
			return;
		}

		const sourcePane = workbenchPanes.find((pane) => pane.id === carryState?.source.paneId);
		const sourceSlot = slotForRef(pending.source, sourcePane);
		const destinationSlot = slotForRef(destination, destinationPane);

		if (!sourceSlot || sourceSlot.kind !== 'pokemon') {
			showToast('error', 'Move and Copy need an occupied source Slot.');
			statusMessage = 'Slot change failed.';
			return;
		}

		if (!sourceSlot.entityBytesBase64) {
			showToast('error', 'This Pokemon Storage entry was saved before transfer data existed.');
			statusMessage = 'Pokemon Storage entry cannot be moved back into a Save File.';
			return;
		}

		if (destinationSlot?.kind === 'pokemon') {
			showToast('error', 'Moving from Pokemon Storage needs an empty destination Slot.');
			statusMessage = 'Moving from Pokemon Storage needs an empty destination Slot.';
			return;
		}

		const activeEngine = engine;
		const operationBox =
			destination.zone === 'box' ? destination.box : (destinationPane?.activeBox ?? 0);
		busy = true;
		importError = null;

		try {
			let workingState = destinationWorkspace;
			if (shouldCreateAutomaticBackup(workingState)) {
				statusMessage = 'Creating Backup...';
				await storage.createBackup({
					saveFileId: workingState.file.id,
					bytes: workingState.bytes,
					reason: 'pokemon-movement'
				});
				workingState = markAutomaticBackupCreated(workingState);
				if (loadedSave?.file.id === workingState.file.id) loadedSave = workingState;
			}

			statusMessage = 'Moving Pokemon from Storage...';
			const result = await activeEngine.importStoredPokemon(
				workingState.bytes,
				workingState.file.originalFileName ?? undefined,
				{
					entityBytesBase64: sourceSlot.entityBytesBase64,
					destination
				},
				operationBox
			);

			if (!result.ok) {
				throw result.error;
			}

			const nextState: WorkspaceState = {
				...workingState,
				bytes: result.value.bytes,
				workspace: result.value.workspace,
				dirty: workingState.dirty || result.value.mutated,
				restoredFromBackup: null
			};
			if (nextState.dirty) {
				await persistWorkspace(nextState);
			}

			if (pending.kind === 'move') {
				pokemonStorage = await storage.putPokemonStorage(
					removeStoragePokemon(pokemonStorage ?? createEmptyPokemonStorage(), pending.source)
				);
			}

			if (loadedSave?.file.id === nextState.file.id) loadedSave = nextState;
			installMutatedSaveProjection(nextState, operationBox);
			if (loadedSave?.file.id === nextState.file.id) {
				setCachedActiveWorkspace(nextState, operationBox);
			}
			invalidateSavesCache();
			pendingSlotOperation = null;
			carryState = null;
			if (destinationPane) activePaneId = destinationPane.id;
			navigation = {
				...navigation,
				activeBox: destination.zone === 'box' ? destination.box : operationBox,
				boxCount: Math.max(1, result.value.workspace.summary.boxCount),
				focus:
					destination.zone === 'party'
						? focusPartySlot(destination.slot)
						: focusBoxSlot(destination.slot),
				locationFocus:
					destination.zone === 'party'
						? focusPartySlot(destination.slot)
						: focusBoxSlot(destination.slot)
			};
			if (destinationPane) {
				workbenchPanes = setPaneFocus(workbenchPanes, destinationPane.id, navigation.locationFocus);
			}
			statusMessage =
				pending.kind === 'move'
					? `Moved ${sourceSlot.label} to ${locationForSlotRef(destination)}.`
					: `Copied ${sourceSlot.label} to ${locationForSlotRef(destination)}.`;
			showToast('success', statusMessage);
			queueMicrotask(focusActiveControl);
		} catch (error) {
			const message = getErrorMessage(error);
			importError = null;
			statusMessage = 'Slot change failed.';
			showToast('error', message);
		} finally {
			busy = false;
		}
	}

	async function applySaveToStorageOperation(
		pending: PendingStorageSlotOperation,
		destination: SaveSlotRef,
		destinationPane: BoxPaneState
	) {
		const sourceSlot = slotForRef(
			pending.source,
			workbenchPanes.find((pane) => pane.id === carryState?.source.paneId)
		);
		const destinationSlot = slotForRef(destination, destinationPane);

		if (!sourceSlot || sourceSlot.kind !== 'pokemon') {
			showToast('error', 'Move and Copy need an occupied source Slot.');
			statusMessage = 'Slot change failed.';
			return;
		}

		if (destinationSlot?.kind === 'pokemon' && pending.kind === 'copy') {
			showToast('error', 'Copy needs an empty destination Slot.');
			statusMessage = 'Copy needs an empty destination Slot.';
			return;
		}

		const sourceStorage = pokemonStorage ?? createEmptyPokemonStorage();
		const sourcePokemon = storedPokemonFromSlot(sourceSlot, carryState);
		const nextStorage =
			carryState?.sourceOwner.type === 'pokemon-storage'
				? applyPokemonStorageSlotOperation(sourceStorage, {
						kind: pending.kind,
						source: pending.source,
						destination,
						pokemon: sourcePokemon
					})
				: applyPokemonStorageSlotOperation(sourceStorage, {
						kind: 'copy',
						source: pending.source,
						destination,
						pokemon: sourcePokemon
					});
		pokemonStorage = await storage.putPokemonStorage(nextStorage);

		if (carryState?.sourceOwner.type === 'pokemon-storage') {
			pendingSlotOperation = null;
			carryState = null;
			activePaneId = destinationPane.id;
			if (destination.zone === 'box') {
				workbenchPanes = setPaneActiveBox(workbenchPanes, destinationPane.id, destination.box);
			}
			const destinationFocus =
				destination.zone === 'party'
					? focusPartySlot(destination.slot)
					: focusBoxSlot(destination.slot);
			navigation = {
				...navigation,
				activeBox: destination.zone === 'box' ? destination.box : activePaneBox,
				focus: destinationFocus,
				locationFocus: destinationFocus
			};
			workbenchPanes = setPaneFocus(workbenchPanes, destinationPane.id, destinationFocus);
			statusMessage =
				pending.kind === 'move'
					? `Moved ${sourceSlot.label} to Pokemon Storage.`
					: `Copied ${sourceSlot.label} to Pokemon Storage.`;
			showToast('success', statusMessage);
			queueMicrotask(focusActiveControl);
			return;
		}

		if (pending.kind === 'move') {
			const sourcePane = workbenchPanes.find((pane) => pane.id === carryState?.source.paneId);
			const sourceWorkspace = saveWorkspaceForPane(sourcePane)?.state;
			if (!sourcePane || !sourceWorkspace) {
				showToast('error', 'The source Save File is no longer available.');
				return;
			}
			await applySlotOperation(
				{ kind: 'clear', source: pending.source },
				{ state: sourceWorkspace, paneId: sourcePane.id }
			);
			statusMessage = `Moved ${sourceSlot.label} to Pokemon Storage.`;
			return;
		}

		pendingSlotOperation = null;
		carryState = null;
		statusMessage = `Copied ${sourceSlot.label} to Pokemon Storage.`;
		showToast('success', statusMessage);
		queueMicrotask(focusActiveControl);
	}

	async function applySlotOperation(
		operation: SlotOperation,
		context?: { state: WorkspaceState; paneId: string }
	): Promise<boolean> {
		const operationState = context?.state ?? loadedSave;
		if (!operationState) {
			showToast('error', 'Load a Save File before changing Slots.');
			return false;
		}

		const activeEngine = engine;
		if (!activeEngine) {
			showToast('error', 'The PKHeX Engine is not ready.');
			return false;
		}

		busy = true;
		importError = null;

		try {
			const sourceSlot = slotViewForRefFromWorkspace(operationState.workspace, operation.source);
			const destinationSlot =
				operation.kind === 'clear'
					? null
					: slotViewForRefFromWorkspace(operationState.workspace, operation.destination);
			const operationBox =
				operation.kind !== 'clear' && operation.destination.zone === 'box'
					? operation.destination.box
					: operation.source.zone === 'box'
						? operation.source.box
						: activePaneBox;

			statusMessage = 'Applying Slot change...';
			const result = await applyStorageOperation({
				state: operationState,
				operation,
				activeBox: operationBox,
				sourceSlot,
				destinationSlot,
				partyCount: operationState.workspace.summary.partyCount,
				services: {
					engine: activeEngine,
					createAutomaticBackup: async (state) => {
						statusMessage = 'Creating Backup...';
						await storage.createBackup({
							saveFileId: state.file.id,
							bytes: state.bytes,
							reason: 'pokemon-movement'
						});
						statusMessage = 'Applying Slot change...';
					},
					persistWorkspace,
					locationForSlotRef
				}
			});

			if (!result.ok) {
				statusMessage = result.reason === 'noop' ? result.message : 'Slot change failed.';
				if (result.reason !== 'noop') {
					showToast('error', result.message);
				} else {
					pendingSlotOperation = null;
				}
				queueMicrotask(focusActiveControl);
				return false;
			}

			const nextState: WorkspaceState = result.state;
			if (loadedSave?.file.id === nextState.file.id) {
				loadedSave = nextState;
				setCachedActiveWorkspace(nextState, operationBox);
			}
			installMutatedSaveProjection(nextState, operationBox);
			invalidateSavesCache();
			pendingSlotOperation = null;
			carryState = null;
			const focusRef = result.focusRef;
			if (focusRef.zone === 'box') {
				const focusPane = context?.paneId
					? workbenchPanes.find((pane) => pane.id === context.paneId)
					: (workbenchPanes.find(
							(pane) => pane.source.type === 'save-file' && pane.source.id === nextState.file.id
						) ?? activePane);
				if (focusPane) {
					workbenchPanes = setPaneActiveBox(workbenchPanes, focusPane.id, focusRef.box);
				}
			}
			const resultFocus =
				focusRef.zone === 'party' ? focusPartySlot(focusRef.slot) : focusBoxSlot(focusRef.slot);
			navigation = {
				...navigation,
				activeBox: focusRef.zone === 'box' ? focusRef.box : operationBox,
				boxCount: Math.max(1, result.state.workspace.summary.boxCount),
				focus: resultFocus,
				locationFocus: resultFocus
			};
			const resultPane = context?.paneId
				? workbenchPanes.find((pane) => pane.id === context.paneId)
				: workbenchPanes.find(
						(pane) => pane.source.type === 'save-file' && pane.source.id === nextState.file.id
					);
			if (resultPane) {
				activePaneId = resultPane.id;
				workbenchPanes = setPaneFocus(workbenchPanes, resultPane.id, resultFocus);
			}
			statusMessage = result.message;
			queueMicrotask(focusActiveControl);
			return true;
		} catch (error) {
			const message = getErrorMessage(error);
			importError = null;
			statusMessage = 'Slot change failed.';
			showToast('error', message);
			return false;
		} finally {
			busy = false;
		}
	}

	function beginPendingSlotOperation(kind: 'move' | 'copy') {
		const slot = focusedSlot;

		if (slot.kind !== 'pokemon') {
			return;
		}

		const source = slotRefForFocus();
		const sourcePaneId = activePane?.id ?? activePaneId;
		const sourceOwner = activePane?.source ?? saveFileSource(loadedSave);
		const sourceWorkspace = saveWorkspaceForPane(activePane)?.state ?? null;
		pendingSlotOperation = {
			kind,
			source,
			sourceLabel: locationForSlotRef(source),
			sourcePokemonLabel: slot.label
		};
		carryState = {
			mode: kind,
			source: workbenchSlotRefForSaveRef(sourcePaneId, source),
			sourceOwner,
			pokemonLabel: slot.label,
			spriteUrl: spriteUrlFor(slot),
			sourceLabel: locationForSlotRef(source),
			origin: {
				entryMode: kind === 'copy' ? 'copied-in' : 'moved-in',
				originSaveFileName: sourceWorkspace?.file.originalFileName ?? null,
				originGame: sourceWorkspace?.workspace.summary.gameVersion ?? null,
				originalTrainer:
					slot.originalTrainer ?? sourceWorkspace?.workspace.summary.trainerName ?? null,
				trainerId: null,
				enteredAt: new Date().toISOString()
			}
		};
		pokemonEditorApplyRequest += 1;
		pokemonEditor = null;
		pokemonEditorPaneId = null;
		pokemonEditorFeedback = null;
		const sourceFocus = summonedSlotLauncher?.focus ?? activeSlotFocus ?? focusBoxSlot(0);
		summonedWorkflow.closeAll();
		navigation = {
			...navigation,
			focus: sourceFocus,
			locationFocus: sourceFocus
		};
		queueMicrotask(focusActiveControl);
	}

	async function cancelPendingSlotOperation() {
		if (!pendingSlotOperation) {
			return;
		}

		const source = carryState?.source;
		pendingSlotOperation = null;
		carryState = null;
		const sourcePane = source
			? workbenchPanes.find((pane) => pane.id === source.paneId)
			: undefined;
		const fallbackPane = sourcePane ?? activePane ?? workbenchPanes[0];
		if (fallbackPane) {
			activePaneId = fallbackPane.id;
			const requestedFocus = source
				? source.zone === 'party'
					? focusPartySlot(source.slot)
					: focusBoxSlot(source.slot)
				: fallbackPane.focus;
			const sourceFocus =
				requestedFocus.zone === 'party' && !paneHasParty(fallbackPane)
					? projectSlotCoordinate(requestedFocus, 'box')
					: requestedFocus;
			const sourceBox =
				source?.zone === 'box' ? (source.box ?? fallbackPane.activeBox) : fallbackPane.activeBox;
			workbenchPanes = setPaneFocus(
				setPaneActiveBox(workbenchPanes, fallbackPane.id, sourceBox),
				fallbackPane.id,
				sourceFocus
			);
			navigation = {
				...navigation,
				activeBox: sourceBox,
				boxCount: Math.max(1, fallbackPane.boxCount),
				focus: sourceFocus,
				locationFocus: sourceFocus
			};
			if (fallbackPane.source.type === 'save-file' && source?.zone === 'box') {
				if (loadedSave?.file.id === fallbackPane.source.id) {
					await loadWorkspaceForSave(loadedSave, sourceBox, fallbackPane.id);
				} else {
					await refreshPaneWorkspace(fallbackPane.id, sourceBox);
				}
			}
		}
		statusMessage = 'Slot action cancelled.';
		queueMicrotask(focusActiveControl);
	}

	function togglePendingSlotOperationMode() {
		if (!pendingSlotOperation || !carryState) {
			return;
		}

		pendingSlotOperation = {
			...pendingSlotOperation,
			kind: pendingSlotOperation.kind === 'move' ? 'copy' : 'move'
		};
		carryState = toggleCarryMode(carryState);
		statusMessage =
			pendingSlotOperation.kind === 'copy'
				? 'Carry mode changed to Copy.'
				: 'Carry mode changed to Move.';
	}

	function requestClearFocusedSlot() {
		const slot = focusedSlot;
		const launcher = summonedSlotLauncher;

		if (activeSummonedWorkflow?.kind !== 'slot-menu' || slot.kind !== 'pokemon' || !launcher) {
			return;
		}

		const source = slotRefForLauncher(launcher);
		const sourcePane = workbenchPanes.find((pane) => pane.id === launcher.paneId);
		const sourceOwner = sourcePane?.source ?? pokemonStorageSource();
		clearSlotConfirmation = {
			source,
			sourceOwner,
			paneId: launcher.paneId,
			location: locationForSlotRef(source),
			pokemonLabel: slot.label
		};
		clearSlotConfirmFocusIndex = 0;
		openRelatedWorkflow('clear-slot-confirmation');
		queueMicrotask(focusClearSlotConfirmation);
	}

	async function focusClearSlotConfirmation() {
		await tick();
		document.getElementById(`clear-confirm-${clearSlotConfirmFocusIndex}`)?.focus();
	}

	function focusClearSlotCommand(index: number) {
		clearSlotConfirmFocusIndex = Math.max(0, Math.min(index, 1));
		queueMicrotask(focusClearSlotConfirmation);
	}

	function setClearSlotCommandFocus(index: number) {
		clearSlotConfirmFocusIndex = Math.max(0, Math.min(index, 1));
	}

	function cancelClearSlot() {
		if (busy) return;

		clearSlotConfirmation = null;
		clearSlotConfirmFocusIndex = 0;
		dismissActiveWorkflow();
		refreshReturnedSlotMenuAvailability();
	}

	async function confirmClearSlot() {
		const pending = clearSlotConfirmation;
		if (!pending || busy) {
			return;
		}

		const cleared =
			pending.sourceOwner.type === 'pokemon-storage'
				? await clearPokemonStorageSlot(pending)
				: await clearSaveFileSlot(pending);
		if (!cleared || clearSlotConfirmation !== pending) {
			queueMicrotask(focusClearSlotConfirmation);
			return;
		}

		clearSlotConfirmation = null;
		clearSlotConfirmFocusIndex = 0;
		summonedWorkflow.closeAll();
		activePaneId = pending.paneId;
		if (pending.source.zone === 'box') {
			workbenchPanes = setPaneActiveBox(workbenchPanes, pending.paneId, pending.source.box);
		}
		const clearedFocus =
			pending.source.zone === 'party'
				? focusPartySlot(pending.source.slot)
				: focusBoxSlot(pending.source.slot);
		navigation = {
			...navigation,
			activeBox: pending.source.zone === 'box' ? pending.source.box : navigation.activeBox,
			focus: clearedFocus,
			locationFocus: clearedFocus
		};
		workbenchPanes = setPaneFocus(workbenchPanes, pending.paneId, clearedFocus);
		queueMicrotask(focusActiveControl);
	}

	async function clearPokemonStorageSlot(pending: ClearSlotConfirmation): Promise<boolean> {
		if (pending.source.zone !== 'box') return false;

		busy = true;
		try {
			const nextStorage = removeStoragePokemon(
				pokemonStorage ?? createEmptyPokemonStorage(),
				pending.source
			);
			pokemonStorage = await storage.putPokemonStorage(nextStorage);
			statusMessage = `Cleared ${pending.pokemonLabel} from ${pending.location}.`;
			showToast('success', statusMessage);
			return true;
		} catch (error) {
			statusMessage = 'Slot change failed.';
			showToast('error', getErrorMessage(error));
			return false;
		} finally {
			busy = false;
		}
	}

	async function clearSaveFileSlot(pending: ClearSlotConfirmation): Promise<boolean> {
		const pane = workbenchPanes.find((candidate) => candidate.id === pending.paneId);
		const workspace = saveWorkspaceForPane(pane)?.state ?? null;
		if (!workspace || workspace.file.id !== pending.sourceOwner.id) {
			showToast('error', 'The source Save File is no longer available.');
			return false;
		}

		return applySlotOperation(
			{ kind: 'clear', source: pending.source },
			{ state: workspace, paneId: pending.paneId }
		);
	}

	function showToast(tone: ToastView['tone'], message: string) {
		const id = `toast-${nextToastId}`;
		nextToastId += 1;
		toasts = [...toasts, { id, tone, message }].slice(-3);
		setTimeout(() => dismissToast(id), tone === 'error' ? 5200 : 3400);
	}

	function dismissToast(id: string) {
		toasts = toasts.filter((toast) => toast.id !== id);
	}

	function focusActionCommand(index: number) {
		navigation = { ...navigation, focus: { zone: 'actions', index } };
		queueMicrotask(focusActiveControl);
	}

	function activateFocusedControl(focus = navigation.focus) {
		if (focus.zone === 'paneControls') {
			document.getElementById(focusIdForNavigation(focus))?.click();
		}

		if (focus.zone === 'actions') {
			const command = slotMenuCommands[focus.index];
			if (command && !command.reason) {
				selectSlotActionCommand(command.key);
			}
		}
	}

	function saveFileSource(save: WorkspaceState | null): BoxSourceRef {
		return {
			type: 'save-file',
			id: save?.file.id ?? null,
			label: save?.file.originalFileName ?? 'Save File',
			dirty: save?.dirty ?? false
		};
	}

	function pokemonStorageSource(): BoxSourceRef {
		return { type: 'pokemon-storage', id: 'pokemon-storage', label: 'Pokemon Storage' };
	}

	function paneControlCountFor(pane: BoxPaneState): number {
		return pane.id !== activeSavePaneId && workbenchPanes.length > 1 ? 2 : 1;
	}

	function installActiveSavePane(save: WorkspaceState, activeBox = 0) {
		const clampedBox = Math.min(activeBox, Math.max(0, save.workspace.summary.boxCount - 1));
		const existingPane = workbenchPanes.find((pane) => pane.id === activeSavePaneId);
		const preservedFocus =
			existingPane?.source.type === 'save-file' && existingPane.source.id === save.file.id
				? existingPane.focus
				: focusBoxSlot(0);
		const fixedPane = createBoxPane(activeSavePaneId, saveFileSource(save), {
			boxCount: save.workspace.summary.boxCount,
			activeBox: clampedBox,
			focus: preservedFocus
		});
		const hadActiveSavePane = workbenchPanes.some((pane) => pane.id === activeSavePaneId);
		const rightPanes = hadActiveSavePane
			? workbenchPanes.filter((pane) => pane.id !== activeSavePaneId).slice(0, 1)
			: [];

		workbenchPanes = [fixedPane, ...rightPanes];
		savePaneWorkspaces = {
			...savePaneWorkspaces,
			[activeSavePaneId]: { state: save, loadedBox: clampedBox }
		};
		activePaneId = activeSavePaneId;
		navigation = setLocationFocus(
			selectActiveBox(createInitialNavigationState(save.workspace.summary.boxCount), clampedBox),
			preservedFocus
		);
	}

	function openRelatedSourcePicker(targetPaneId: string | null) {
		if (!boxMenuOpen) return;
		const commandIndex = navigation.focus.zone === 'actions' ? navigation.focus.index : 0;
		sourcePickerTargetPaneId = targetPaneId;
		sourcePickerFocusIndex = 0;
		summonedWorkflow.openRelated(
			'source-picker',
			controlLauncher(`box-menu-command-${commandIndex}`)
		);
		queueMicrotask(() => focusSourcePickerControl(0));
	}

	function closeSourcePicker() {
		sourcePickerTargetPaneId = null;
		sourcePickerFocusIndex = 0;
		dismissActiveWorkflow();
	}

	function closeSourcePickerFromBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeSourcePicker();
		}
	}

	function openImportFromSourcePicker() {
		const returnsToBoxMenu = activeSummonedWorkflow?.returnTo?.kind === 'box-menu';
		closeSourcePicker();
		if (returnsToBoxMenu) closeBoxMenu();
		document.getElementById('quick-save-import')?.click();
	}

	function openSourceAsPane(type: BoxSourceType, saveFileId: string | null = null) {
		if (sourcePickerTargetPaneId) {
			void switchPaneToSource(sourcePickerTargetPaneId, type, saveFileId);
			return;
		}

		const id = `pane-${type}-${Date.now()}-${workbenchPanes.length}`;
		const source = boxSourceForSelection(type, saveFileId);
		const sourceBoxCount =
			type === 'pokemon-storage'
				? pokemonStorageBoxCount
				: loadedSave?.file.id === source.id
					? loadedSave.workspace.summary.boxCount
					: 1;
		workbenchPanes = addBoxPane(workbenchPanes, source, {
			id,
			boxCount: sourceBoxCount
		});
		const openedPane = workbenchPanes.find((pane) => pane.id === id);
		activePaneId = id;
		navigation = {
			...navigation,
			boxCount: Math.max(1, openedPane?.boxCount ?? sourceBoxCount),
			activeBox: openedPane?.activeBox ?? 0,
			focus: openedPane?.focus ?? focusBoxSlot(0),
			locationFocus: openedPane?.focus ?? focusBoxSlot(0)
		};
		sourcePickerTargetPaneId = null;
		boxMenuTarget = null;
		summonedWorkflow.closeAll();
		if (source.type === 'save-file') {
			void refreshPaneWorkspace(id, 0);
		}
		statusMessage = `${source.label} opened in another pane.`;
		queueMicrotask(focusActiveControl);
	}

	async function switchPaneToSource(
		paneId: string,
		type: BoxSourceType,
		saveFileId: string | null = null
	) {
		if (paneId === activeSavePaneId) {
			return;
		}

		const source = boxSourceForSelection(type, saveFileId);
		const pane = workbenchPanes.find((candidate) => candidate.id === paneId);
		if (!pane) return;
		const request = ++paneSwitchRequest;
		const pickerOwner = activeSummonedWorkflow;
		const paneSource = { ...pane.source };
		const selectionIsCurrent = () =>
			request === paneSwitchRequest &&
			activeSummonedWorkflow === pickerOwner &&
			sourcePickerOpen &&
			sourcePickerTargetPaneId === paneId &&
			workbenchPanes.some(
				(candidate) =>
					candidate.id === paneId &&
					candidate.source.type === paneSource.type &&
					candidate.source.id === paneSource.id
			);

		let targetBoxCount = pokemonStorageBoxCount;
		let targetWorkspace: SavePaneWorkspace | null = null;
		if (source.type === 'save-file' && source.id) {
			try {
				const firstBoxState = await loadWorkspaceStateForSaveFile(source.id, 0);
				if (!firstBoxState || !selectionIsCurrent()) return;
				targetBoxCount = firstBoxState.workspace.summary.boxCount;
				const targetBox = Math.min(pane.activeBox, Math.max(0, targetBoxCount - 1));
				const state =
					targetBox === 0
						? firstBoxState
						: await loadWorkspaceStateForSaveFile(source.id, targetBox);
				if (!state) return;
				targetWorkspace = { state, loadedBox: targetBox };
			} catch (error) {
				if (!selectionIsCurrent()) return;
				showToast('error', getErrorMessage(error));
				statusMessage = 'Could not load that Save File pane.';
				return;
			}
		}
		if (!selectionIsCurrent()) return;

		workbenchPanes = switchPaneSource(workbenchPanes, paneId, source, targetBoxCount);
		const switchedPane = workbenchPanes.find((candidate) => candidate.id === paneId);
		activePaneId = paneId;
		navigation = {
			...navigation,
			boxCount: Math.max(1, switchedPane?.boxCount ?? targetBoxCount),
			activeBox: switchedPane?.activeBox ?? 0,
			focus: switchedPane?.focus ?? focusBoxSlot(0),
			locationFocus: switchedPane?.focus ?? focusBoxSlot(0)
		};
		sourcePickerTargetPaneId = null;
		boxMenuTarget = null;
		summonedWorkflow.closeAll();
		if (targetWorkspace) {
			savePaneWorkspaces = { ...savePaneWorkspaces, [paneId]: targetWorkspace };
		} else {
			const remaining = { ...savePaneWorkspaces };
			delete remaining[paneId];
			savePaneWorkspaces = remaining;
		}
		statusMessage = `Pane switched to ${source.label}.`;
		queueMicrotask(focusActiveControl);
	}

	function boxSourceForSelection(type: BoxSourceType, saveFileId: string | null): BoxSourceRef {
		if (type === 'pokemon-storage') {
			return pokemonStorageSource();
		}

		const selectedSave = saveFiles.find((saveFile) => saveFile.id === saveFileId) ?? null;
		return {
			type: 'save-file',
			id: selectedSave?.id ?? loadedSave?.file.id ?? null,
			label: selectedSave?.originalFileName ?? loadedSave?.file.originalFileName ?? 'Save File',
			dirty:
				loadedSave !== null && loadedSave.file.id === selectedSave?.id ? loadedSave.dirty : false
		};
	}

	function closePane(paneId: string) {
		if (pendingSlotOperation || paneId === activeSavePaneId) {
			return;
		}

		const closingPane = workbenchPanes.find((pane) => pane.id === paneId);
		if (!closingPane) return;
		const closingActivePane = paneId === activePaneId;
		workbenchPanes = closeBoxPane(workbenchPanes, paneId);
		if (closingActivePane || !workbenchPanes.some((pane) => pane.id === activePaneId)) {
			const nextPane = workbenchPanes[0];
			const nextFocus: SlotFocus = nextPane
				? focusSurvivingPaneAfterClose(closingPane, nextPane, {
						partyAvailable: paneHasParty(nextPane)
					})
				: { zone: 'box', slot: 0 };
			activePaneId = nextPane?.id ?? 'pane-pokemon-storage';
			navigation = {
				...navigation,
				activeBox: nextPane?.activeBox ?? 0,
				boxCount: Math.max(1, nextPane?.boxCount ?? placeholderBoxCount),
				focus: nextFocus,
				locationFocus: nextFocus
			};
			if (nextPane) workbenchPanes = setPaneFocus(workbenchPanes, nextPane.id, nextFocus);
			queueMicrotask(focusActiveControl);
		}
		const remaining = { ...savePaneWorkspaces };
		delete remaining[paneId];
		savePaneWorkspaces = remaining;
	}

	function activatePane(pane: BoxPaneState) {
		activePaneId = pane.id;
		navigation = selectActiveBox(
			{
				...navigation,
				boxCount: Math.max(1, pane.boxCount),
				focus: pane.focus,
				locationFocus: pane.focus
			},
			Math.min(pane.activeBox, Math.max(1, pane.boxCount) - 1)
		);
		queueMicrotask(focusActiveControl);
	}

	function sourceForCard(card: SourcePickerCard): BoxSourceType {
		return card.type;
	}

	function workbenchSlotRefForSaveRef(paneId: string, ref: SaveSlotRef): WorkbenchSlotRef {
		return {
			paneId,
			zone: ref.zone,
			box: ref.zone === 'box' ? ref.box : null,
			slot: ref.slot
		};
	}

	function storageSlotsForBox(box: number): SlotView[] {
		const stored = pokemonStorage ?? createEmptyPokemonStorage();
		const storedBox = stored.boxes.find((candidate) => candidate.index === box);
		const slots = storedBox?.slots ?? [];
		return Array.from({ length: BOX_SLOT_COUNT }, (_, slotIndex) => {
			const storedSlot = slots.find((candidate) => candidate.slot === slotIndex);
			return slotViewFromStoredPokemon(storedSlot?.pokemon ?? null, slotIndex);
		});
	}

	function paneBoxSlots(pane: BoxPaneState | undefined, box: number): SlotView[] {
		if (pane?.source.type === 'pokemon-storage') {
			return storageSlotsForBox(box);
		}

		const paneWorkspace = saveWorkspaceForPane(pane);
		if (!paneWorkspace || paneWorkspace.loadedBox !== box) {
			return emptyBoxSlots();
		}

		return normalizeBoxSlots(createBoxSlotViews(paneWorkspace.state.workspace.boxSlots));
	}

	function paneHasParty(pane: BoxPaneState | undefined): boolean {
		if (pane?.source.type !== 'save-file') return false;
		return (
			savePaneWorkspaces[pane.id]?.state.file.id === pane.source.id ||
			saveWorkspaceForPane(pane) !== null
		);
	}

	function panePartySlots(pane: BoxPaneState | undefined): SlotView[] {
		const paneWorkspace = saveWorkspaceForPane(pane);
		return paneWorkspace
			? createPartySlotViews(paneWorkspace.state.workspace.partySlots)
			: placeholderPartySlots;
	}

	function saveWorkspaceForPane(pane: BoxPaneState | undefined): SavePaneWorkspace | null {
		if (!pane || pane.source.type !== 'save-file') {
			return null;
		}
		if (paneWorkspaceLoadingRequests[pane.id] !== undefined) {
			return null;
		}

		const cached = savePaneWorkspaces[pane.id];
		if (cached?.state.file.id === pane.source.id) {
			return cached;
		}

		if (
			loadedSave &&
			pane.source.id === loadedSave.file.id &&
			pane.id === activePaneId &&
			getCachedActiveWorkspaceBox() === pane.activeBox
		) {
			return { state: loadedSave, loadedBox: activePaneBox };
		}

		return null;
	}

	function emptyBoxSlots(): SlotView[] {
		return Array.from({ length: BOX_SLOT_COUNT }, (_, slot) => emptySlotView(slot));
	}

	function normalizeBoxSlots(slots: SlotView[]): SlotView[] {
		return slots.length >= BOX_SLOT_COUNT
			? slots.slice(0, BOX_SLOT_COUNT)
			: [
					...slots,
					...Array.from({ length: BOX_SLOT_COUNT - slots.length }, (_, slot) =>
						emptySlotView(slots.length + slot)
					)
				];
	}

	function slotViewFromStoredPokemon(
		pokemon: StoredPokemonStoragePokemon | null,
		slot: number
	): SlotView {
		if (!pokemon) {
			return emptySlotView(slot);
		}

		return {
			slot,
			label: pokemon.label,
			detail: pokemon.detail,
			level: pokemon.level,
			experience: pokemon.experience,
			experienceProjection: null,
			speciesId: pokemon.speciesId,
			form: pokemon.form,
			isEgg: pokemon.isEgg,
			spriteIdentity: pokemon.spriteIdentity,
			kind: 'pokemon',
			gender: pokemon.gender,
			nature: pokemon.nature,
			ability: pokemon.ability,
			heldItem: pokemon.heldItem,
			originalTrainer: pokemon.originalTrainer,
			metLabel: pokemon.metLabel,
			entityBytesBase64: pokemon.entityBytesBase64 ?? null
		};
	}

	function emptySlotView(slot: number): SlotView {
		return {
			slot,
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
	}

	function storedPokemonFromSlot(
		slot: SlotView,
		carry: CarryState | null
	): StoredPokemonStoragePokemon {
		return {
			label: slot.label,
			detail: slot.detail,
			level: slot.level,
			experience: slot.experience,
			speciesId: slot.speciesId,
			form: slot.form,
			isEgg: slot.isEgg,
			spriteIdentity: slot.spriteIdentity,
			gender: slot.gender,
			nature: slot.nature,
			ability: slot.ability,
			heldItem: slot.heldItem,
			originalTrainer: slot.originalTrainer,
			metLabel: slot.metLabel,
			entityBytesBase64: slot.entityBytesBase64 ?? undefined,
			origin: carry?.origin ?? {
				entryMode: 'imported',
				originSaveFileName: loadedSave?.file.originalFileName ?? null,
				originGame: loadedSave?.workspace.summary.gameVersion ?? null,
				originalTrainer: slot.originalTrainer ?? null,
				trainerId: null,
				enteredAt: new Date().toISOString()
			}
		};
	}

	function selectSlotActionCommand(command: SlotMenuCommandKey) {
		switch (command) {
			case 'create-pokemon':
				openPokemonCreation();
				break;
			case 'pokemon-action':
				openPokemonEditor();
				break;
			case 'move':
				beginPendingSlotOperation('move');
				break;
			case 'copy':
				beginPendingSlotOperation('copy');
				break;
			case 'clear':
				requestClearFocusedSlot();
				break;
			case 'legality-check':
				if (focusedSlot.kind === 'pokemon') {
					void openLegalityReport();
				}
				break;
			case 'evolve':
				void openPokemonEvolution();
				break;
			default:
				break;
		}
	}

	function pokemonActionContextForFocusedSlot(): PokemonActionContext | null {
		if (focusedSlot.kind !== 'pokemon') return null;
		const source = slotRefForFocus();
		if (source.zone === 'box' && focusedSlotOwner.type === 'pokemon-storage') {
			return focusedSlot.entityBytesBase64
				? {
						target: { owner: 'pokemon-storage', entityBytesBase64: focusedSlot.entityBytesBase64 },
						storageRef: source
					}
				: null;
		}

		const paneWorkspace = saveWorkspaceForPane(focusedSlotPane);
		return paneWorkspace
			? {
					target: {
						owner: 'save-file',
						workspace: paneWorkspace.state,
						source,
						activeBox: focusedSlotPane?.activeBox ?? activePaneBox
					},
					storageRef: null
				}
			: null;
	}

	async function openPokemonEvolution() {
		const activeEngine = engine;
		if (
			activeSummonedWorkflow?.kind !== 'slot-menu' ||
			focusedSlot.kind !== 'pokemon' ||
			!activeEngine
		) {
			return;
		}

		const location = activeSlotPositionLabel;
		const context = pokemonActionContextForFocusedSlot();

		if (!context) {
			showToast('error', 'Evolution is unavailable for this source.');
			return;
		}

		const request = (pokemonActionRequest += 1);
		pokemonActionContext = context;
		pokemonActionReturnsToEditor = false;
		pokemonAction = createPokemonActionLoadingState(location, focusedSlot.label);
		openRelatedWorkflow('pokemon-actions', slotCommandLauncherId('evolve'));

		const resultPromise = requestPokemonActionPreview(activeEngine, context.target);
		await tick();
		focusPokemonActionControl(0);
		const result = await resultPromise;
		if (request !== pokemonActionRequest) {
			return;
		}

		if (!result.ok) {
			pokemonAction = {
				status: 'error',
				location,
				pokemonLabel: focusedSlot.label,
				message: result.error.message
			};
			showToast('error', result.error.message);
			return;
		}

		pokemonAction = createPokemonActionReadyState(location, focusedSlot.label, result.value);
		await tick();
		focusPokemonActionControl(0);
	}

	function selectPokemonActionPreview(
		kind: 'legality-fix' | 'evolve',
		choiceId?: string,
		launcherId?: string
	) {
		if (pokemonAction.status !== 'ready') {
			return;
		}

		if (kind === 'legality-fix' && activeSummonedWorkflow?.kind === 'legality-report') {
			legalityQuickFixLauncherId = launcherId ?? null;
		}
		pokemonAction = selectPokemonAction(pokemonAction, kind, choiceId);
		void tick().then(() =>
			document
				.getElementById(
					kind === 'legality-fix' ? 'legality-quick-fix-apply' : 'pokemon-action-apply'
				)
				?.focus()
		);
	}

	function clearPokemonActionPreview() {
		if (pokemonAction.status !== 'ready') {
			return;
		}

		const launcherId = legalityQuickFixLauncherId;
		legalityQuickFixLauncherId = null;
		pokemonAction = clearPokemonActionSelection(pokemonAction);
		void tick().then(() => {
			if (activeSummonedWorkflow?.kind === 'legality-report') {
				(
					(launcherId ? document.getElementById(launcherId) : null) ??
					document.getElementById('legality-report-close')
				)?.focus();
			} else {
				focusPokemonActionControl(0);
			}
		});
	}

	async function applySelectedPokemonAction() {
		const activeEngine = engine;
		const context = pokemonActionContext;
		if (!activeEngine || !context || pokemonAction.status !== 'ready') {
			return;
		}

		const operation = selectedPokemonActionOperation(pokemonAction);
		if (!operation) {
			return;
		}
		if (pokemonActionReturnsToEditor) {
			await applyPokemonEditorQuickFix(activeEngine, context, operation);
			return;
		}
		const actionLocation = pokemonAction.location;
		const actionPokemonLabel = pokemonAction.pokemonLabel;

		pokemonAction = { ...pokemonAction, status: 'applying' };
		busy = true;
		const request = pokemonActionRequest;

		try {
			const result = await applyPokemonAction(activeEngine, context.target, operation, {
				createAutomaticBackup: async (state, reason) => {
					await storage.createBackup({
						saveFileId: state.file.id,
						bytes: state.bytes,
						reason
					});
				},
				persistWorkspace,
				persistStoredPokemon: (storedResult) => persistStoredPokemonAction(context, storedResult)
			});

			if (!result.ok) {
				if (result.workspace) {
					installPokemonActionWorkspace(result.workspace, context.target);
					refreshPokemonActionContextWorkspace(context, result.workspace);
				}
				if (request !== pokemonActionRequest) {
					return;
				}
				if (pokemonAction.status === 'applying') {
					pokemonAction = { ...pokemonAction, status: 'ready' };
				}
				showToast('error', result.error.message);
				return;
			}

			if (result.owner === 'save-file') {
				installPokemonActionWorkspace(result.workspace, context.target);
				refreshPokemonActionContextWorkspace(context, result.workspace);
			} else {
				refreshPokemonActionContextStored(context, result.result);
			}

			const actionLabel = operation.kind === 'legality-fix' ? 'Legality Fix' : 'Evolution';
			if (operation.kind === 'legality-fix') {
				await refreshLegalityReportAfterApply(
					request,
					context,
					actionLocation,
					actionPokemonLabel,
					`${actionLabel} applied.`
				);
				return;
			}
			showToast('success', `${actionLabel} applied.`);
			if (request === pokemonActionRequest) {
				await completePokemonActions();
			}
		} catch (error) {
			const message = getErrorMessage(error);
			if (request !== pokemonActionRequest) {
				return;
			}
			if (pokemonAction.status === 'applying') {
				pokemonAction = { ...pokemonAction, status: 'ready' };
			}
			showToast('error', message);
		} finally {
			busy = false;
		}
	}

	async function refreshLegalityReportAfterApply(
		request: number,
		fallbackContext: PokemonActionContext,
		location: string,
		pokemonLabel: string,
		message: string
	) {
		const activeEngine = engine;
		const context = pokemonActionContext ?? fallbackContext;
		if (!activeEngine) return;
		const preview = await requestPokemonActionPreview(activeEngine, context.target);
		if (request !== pokemonActionRequest) return;
		if (!preview.ok) {
			legalityReport = {
				status: 'error',
				location,
				pokemonLabel,
				message: preview.error.message
			};
			pokemonAction = {
				status: 'error',
				location,
				pokemonLabel,
				message: preview.error.message
			};
			showToast('success', message);
			await tick();
			document.getElementById('legality-report-close')?.focus();
			return;
		}
		legalityReport = {
			status: 'ready',
			location,
			pokemonLabel,
			report: preview.value.legalityReport
		};
		pokemonAction = createPokemonActionReadyState(location, pokemonLabel, preview.value);
		showToast('success', message);
		await tick();
		(
			document.querySelector<HTMLButtonElement>('.quick-fix') ??
			document.getElementById('legality-report-close')
		)?.focus();
	}

	async function applyPokemonEditorQuickFix(
		activeEngine: EngineApi,
		context: PokemonActionContext,
		operation: ReturnType<typeof selectedPokemonActionOperation> & {}
	) {
		const editor = pokemonEditor;
		if (!editor || context.target.owner !== 'save-file' || operation.kind !== 'legality-fix') {
			return;
		}

		pokemonAction = { ...pokemonAction, status: 'applying' } as PokemonActionState;
		busy = true;
		const request = pokemonActionRequest;
		try {
			const saveOperation: PokemonActionOperation = {
				...operation,
				source: context.target.source
			};
			const result = await activeEngine.applyPokemonAction(
				context.target.workspace.bytes,
				context.target.workspace.file.originalFileName ?? undefined,
				saveOperation,
				context.target.activeBox
			);
			if (request !== pokemonActionRequest) return;
			if (!result.ok) {
				if (pokemonAction.status === 'applying')
					pokemonAction = { ...pokemonAction, status: 'ready' };
				showToast('error', result.error.message);
				return;
			}

			const scratchWorkspace: WorkspaceState = {
				...context.target.workspace,
				bytes: result.value.bytes,
				workspace: result.value.workspace
			};
			const updatedSlot = slotViewForRefFromWorkspace(
				scratchWorkspace.workspace,
				context.target.source
			);
			if (!updatedSlot) throw new Error('The fixed Pokemon projection was unavailable.');
			const refreshedEditor = createPokemonEditorState(editor.source, updatedSlot);
			if (!refreshedEditor.ok) throw new Error(refreshedEditor.reason);
			const previewValidation = context.editorPreviewValidation ?? null;
			if (previewValidation) {
				const validation = await validatePokemonEditorPreview(
					activeEngine,
					editor,
					scratchWorkspace,
					previewValidation
				);
				if (request !== pokemonActionRequest) return;
				pokemonEditorPreviewValidation = validation.ok ? null : previewValidation;
			}

			pokemonEditor = refreshedEditor.state;
			pokemonEditorScratchWorkspace = scratchWorkspace;
			pokemonEditorDraft = null;
			pokemonEditorDraftEdits = {};
			pokemonEditorDraftDirty = true;
			const nextContext: PokemonActionContext = {
				...context,
				target: { ...context.target, workspace: scratchWorkspace }
			};
			pokemonActionContext = nextContext;
			const preview = await requestPokemonActionPreview(activeEngine, nextContext.target);
			if (request !== pokemonActionRequest) return;
			if (!preview.ok) {
				legalityReport = {
					status: 'error',
					location: editor.source.location,
					pokemonLabel: updatedSlot.label,
					message: preview.error.message
				};
				pokemonAction = {
					status: 'error',
					location: editor.source.location,
					pokemonLabel: updatedSlot.label,
					message: preview.error.message
				};
				showToast('error', preview.error.message);
				await tick();
				document.getElementById('legality-report-close')?.focus();
				return;
			}
			legalityReport = {
				status: 'ready',
				location: editor.source.location,
				pokemonLabel: updatedSlot.label,
				report: preview.value.legalityReport
			};
			pokemonAction = createPokemonActionReadyState(
				editor.source.location,
				updatedSlot.label,
				preview.value
			);
			showToast('success', 'Quick Fix applied to the Editor draft.');
			await tick();
			(
				document.querySelector<HTMLButtonElement>('.quick-fix') ??
				document.getElementById('legality-report-close')
			)?.focus();
		} catch (error) {
			if (request !== pokemonActionRequest) return;
			if (pokemonAction.status === 'applying')
				pokemonAction = { ...pokemonAction, status: 'ready' };
			showToast('error', getErrorMessage(error));
		} finally {
			busy = false;
		}
	}

	function validatePokemonEditorPreview(
		activeEngine: EngineApi,
		editor: PokemonEditorState,
		workspace: WorkspaceState,
		validation: PokemonEditorPreviewValidation
	) {
		if (editor.source.owner !== 'save-file')
			throw new Error('The Pokemon Editor draft source is unavailable.');
		return activeEngine.validatePokemonEditPreview(
			validation.baselineBytes,
			workspace.bytes,
			workspace.file.originalFileName ?? undefined,
			editor.source.slotRef,
			validation.scope
		);
	}

	function refreshPokemonActionContextWorkspace(
		context: PokemonActionContext,
		nextState: WorkspaceState
	) {
		if (context.target.owner !== 'save-file' || pokemonActionContext !== context) {
			return;
		}

		pokemonActionContext = {
			...context,
			target: { ...context.target, workspace: nextState }
		};
	}

	function refreshPokemonActionContextStored(
		context: PokemonActionContext,
		result: StoredPokemonActionResult
	) {
		if (context.target.owner !== 'pokemon-storage' || pokemonActionContext !== context) return;
		pokemonActionContext = {
			...context,
			target: { owner: 'pokemon-storage', entityBytesBase64: result.entityBytesBase64 }
		};
	}

	function installPokemonActionWorkspace(nextState: WorkspaceState, target: PokemonActionTarget) {
		if (target.owner !== 'save-file') {
			return;
		}

		if (loadedSave?.file.id === nextState.file.id) {
			loadedSave = nextState;
			setCachedActiveWorkspace(nextState, target.activeBox);
			invalidateSavesCache();
		}

		installMutatedSaveProjection(nextState, target.activeBox);
	}

	async function persistStoredPokemonAction(
		context: PokemonActionContext,
		result: StoredPokemonActionResult
	) {
		const ref = context.storageRef;
		if (!ref || ref.zone !== 'box' || context.target.owner !== 'pokemon-storage') {
			throw new Error('The Pokemon Storage target is unavailable.');
		}

		const stored = pokemonStorage ?? createEmptyPokemonStorage();
		const existing = getStoragePokemon(stored, ref);
		if (!existing) {
			throw new Error('The Pokemon Storage slot is empty.');
		}

		// The slot may have been reused while the engine ran; only write back the same Pokemon.
		if (existing.entityBytesBase64 !== context.target.entityBytesBase64) {
			throw new Error('The Pokemon Storage Slot changed while the action was applied.');
		}

		const projected = createSlotView(result.projection);
		const nextPokemon = {
			...storedPokemonFromSlot(projected, null),
			origin: existing.origin,
			entityBytesBase64: result.entityBytesBase64
		};
		const nextStorage = {
			...putStoragePokemon(stored, ref, nextPokemon),
			updatedAt: new Date().toISOString()
		};
		pokemonStorage = await storage.putPokemonStorage(nextStorage);
	}

	function backPokemonActions() {
		if (busy || pokemonAction.status === 'applying') {
			return;
		}

		if (pokemonAction.status === 'ready' && pokemonAction.selection) {
			clearPokemonActionPreview();
			return;
		}

		resetPokemonActions();
	}

	async function completePokemonActions() {
		const launcherFocus = summonedSlotLauncher?.focus ?? null;
		const context = pokemonActionContext;
		const request = (slotMenuPokemonActionRequest += 1);
		slotMenuPokemonActionPreview = null;
		if (engine && context) {
			try {
				const preview = await requestPokemonActionPreview(engine, context.target);
				if (
					request !== slotMenuPokemonActionRequest ||
					activeSummonedWorkflow?.kind !== 'pokemon-actions' ||
					pokemonActionContext !== context
				) {
					return;
				}
				if (preview.ok) {
					slotMenuPokemonActionPreview = preview.value;
				}
			} catch {
				// The applied result remains valid even when refreshed availability cannot be loaded.
			}
		}
		await tick();
		const commandIndex = slotMenuCommands.findIndex(
			(command) => command.key === 'evolve' && command.reason === null
		);
		pokemonActionRequest += 1;
		pokemonAction = { status: 'idle' };
		pokemonActionContext = null;
		pokemonActionReturnsToEditor = false;

		if (commandIndex >= 0) {
			dismissActiveWorkflow();
			navigation = {
				...navigation,
				focus: { zone: 'actions', index: commandIndex }
			};
			queueMicrotask(focusActiveControl);
			return;
		}

		summonedWorkflow.closeAll();
		if (launcherFocus) {
			navigation = { ...navigation, focus: launcherFocus };
		}
		queueMicrotask(focusActiveControl);
	}

	function resetPokemonActions() {
		pokemonActionRequest += 1;
		pokemonAction = { status: 'idle' };
		pokemonActionContext = null;
		pokemonActionReturnsToEditor = false;
		dismissActiveWorkflow();
	}

	function openPokemonCreation() {
		if (
			activeSummonedWorkflow?.kind !== 'slot-menu' ||
			focusedSlot.kind !== 'empty' ||
			pokemonCreationBusyRequest !== null
		) {
			return;
		}

		if (!createPokemonAvailability.available) {
			showToast('error', createPokemonAvailability.reason);
			return;
		}

		void initializePokemonCreation();
	}

	async function initializePokemonCreation() {
		const activeEngine = engine;
		const destination = slotRefForFocus();
		const location = activeSlotPositionLabel;
		const paneId = focusedSlotPane?.id ?? activePaneId;
		const workflow = summonedWorkflow.active;
		const destinationPane = workbenchPanes.find((pane) => pane.id === paneId);
		const workingState = saveWorkspaceForPane(destinationPane)?.state ?? null;
		if (!workingState || !activeEngine) {
			showToast(
				'error',
				workingState
					? 'The PKHeX Engine is not ready.'
					: 'Load a Save File before creating Pokemon.'
			);
			return;
		}

		const request = (pokemonCreationRequest += 1);
		pokemonCreationBusyRequest = request;
		busy = true;
		try {
			const catalogue = await activeEngine.getPokemonCreationCatalogue(
				workingState.bytes,
				workingState.file.originalFileName ?? undefined
			);
			if (!isCurrentPokemonCreation(request, workflow)) return;
			if (!catalogue.ok) throw catalogue.error;
			const defaultSpecies = catalogue.value.availableSpecies[0] ?? catalogue.value.defaultSpecies;
			if (!defaultSpecies) throw new Error('This Save File has no supported Pokemon species.');
			const operation = createPokemonCreationOperation(destination, {
				speciesId: defaultSpecies.id,
				level: 5
			});
			if (!operation.ok) throw new Error(operation.reason);
			const result = await activeEngine.createPokemon(
				workingState.bytes,
				workingState.file.originalFileName ?? undefined,
				operation.operation,
				destinationPane?.activeBox ?? activePaneBox
			);
			if (!result.ok) throw result.error;
			if (!isCurrentPokemonCreation(request, workflow)) return;

			const scratchWorkspace: WorkspaceState = {
				...workingState,
				bytes: result.value.bytes,
				workspace: result.value.workspace,
				dirty: workingState.dirty
			};
			const createdSlot = slotViewForRefFromWorkspace(scratchWorkspace.workspace, destination);
			if (!createdSlot) throw new Error('The created Pokemon projection was unavailable.');
			const editorResult = createPokemonEditorState(
				{
					owner: 'save-file',
					saveFileId: workingState.file.id,
					slotRef: destination,
					location
				},
				createdSlot
			);
			if (!editorResult.ok) throw new Error(editorResult.reason);

			pokemonCreation = {
				destination,
				location,
				paneId,
				baseBytes: workingState.bytes,
				workspace: scratchWorkspace
			};
			pokemonEditor = editorResult.state;
			pokemonEditorPaneId = paneId;
			pokemonEditorFeedback = null;
			pokemonEditorSession = createPokemonEditorSession();
			pokemonEditorDraft = null;
			pokemonEditorDraftEdits = {};
			pokemonEditorDraftDirty = true;
			pokemonEditorScratchWorkspace = scratchWorkspace;
			pokemonEditorBaseBytes = workingState.bytes;
			pokemonEditorPreviewValidation = null;
			openRelatedWorkflow('pokemon-editor', slotCommandLauncherId('create-pokemon'));
			pokemonSpeciesFormProjection = null;
			pokemonSpeciesFormError = null;
			void previewPokemonSpeciesFormEdit({
				speciesId: createdSlot.speciesId ?? 0,
				form: createdSlot.form ?? 0
			});
			void tick().then(focusPokemonEditorRail);
		} catch (error) {
			if (isCurrentPokemonCreation(request, workflow)) {
				showToast('error', getErrorMessage(error));
			}
		} finally {
			if (pokemonCreationBusyRequest === request) {
				pokemonCreationBusyRequest = null;
				busy = false;
			}
		}
	}

	function isCurrentPokemonCreation(
		request: number,
		workflow: ReturnType<typeof getSummonedWorkflowHost>['active']
	) {
		return (
			request === pokemonCreationRequest &&
			workflow !== null &&
			summonedWorkflow.active === workflow &&
			workflow.kind === 'slot-menu'
		);
	}

	function openPokemonEditor() {
		if (activeSummonedWorkflow?.kind !== 'slot-menu' || focusedSlot.kind !== 'pokemon') {
			return;
		}

		const paneWorkspace = saveWorkspaceForPane(focusedSlotPane);
		const result = createPokemonEditorState(
			{
				owner: 'save-file',
				saveFileId: paneWorkspace?.state.file.id ?? null,
				slotRef: slotRefForFocus(),
				location: activeSlotPositionLabel
			},
			focusedSlot
		);

		if (!result.ok) {
			statusMessage = result.reason;
			return;
		}

		pokemonEditorApplyRequest += 1;
		pokemonEditor = result.state;
		pokemonEditorPaneId = focusedSlotPane?.id ?? null;
		pokemonEditorFeedback = null;
		pokemonEditorSession = createPokemonEditorSession();
		pokemonEditorDraft = null;
		pokemonEditorDraftEdits = {};
		pokemonEditorDraftDirty = false;
		pokemonEditorScratchWorkspace = null;
		pokemonEditorBaseBytes = null;
		pokemonEditorPreviewValidation = null;
		openRelatedWorkflow('pokemon-editor', slotCommandLauncherId('pokemon-action'));
		pokemonSpeciesFormProjection = null;
		pokemonSpeciesFormError = null;
		void previewPokemonSpeciesFormEdit({
			speciesId: result.state.slot.speciesId ?? 0,
			form: result.state.slot.form ?? 0
		});
		void tick().then(focusPokemonEditorRail);
	}

	function closePokemonEditor() {
		pokemonCreationRequest += 1;
		pokemonCreation = null;
		pokemonEditorApplyRequest += 1;
		pokemonEditor = null;
		pokemonEditorPaneId = null;
		pokemonEditorFeedback = null;
		pokemonEditorSession = createPokemonEditorSession();
		pokemonEditorDraft = null;
		pokemonEditorDraftEdits = {};
		pokemonEditorDraftDirty = false;
		pokemonEditorScratchWorkspace = null;
		pokemonEditorBaseBytes = null;
		pokemonEditorPreviewValidation = null;
		pokemonSpeciesFormRequest += 1;
		pokemonSpeciesFormProjection = null;
		pokemonSpeciesFormError = null;
		pokemonSpeciesFormLoading = false;
		dismissActiveWorkflow();
		refreshReturnedSlotMenuAvailability();
	}

	function requestClosePokemonEditor() {
		const result = requestPokemonEditorDismiss(pokemonEditorSession, pokemonEditorDraftDirty);
		pokemonEditorSession = result.session;
		if (result.effect === 'dismiss') {
			closePokemonEditor();
			return;
		}
		queueMicrotask(focusPokemonEditorSession);
	}

	function discardPokemonEditorEdits() {
		pokemonEditorDraft = null;
		pokemonEditorDraftDirty = false;
		closePokemonEditor();
	}

	function keepEditingPokemonEditor() {
		pokemonEditorSession = returnFromPokemonEditorInternalState(pokemonEditorSession);
		queueMicrotask(focusPokemonEditorSession);
	}

	function showPokemonEditorDeltaReview() {
		pokemonEditorSession = showPokemonEditorReview(pokemonEditorSession);
		queueMicrotask(focusPokemonEditorSession);
	}

	function rememberPokemonEditorDraft(
		draft: PokemonEditorDraftSnapshot,
		dirty: boolean,
		edits: PokemonEditorDraftEdits
	) {
		pokemonEditorDraft = draft;
		pokemonEditorDraftDirty = dirty || pokemonEditorScratchWorkspace !== null;
		pokemonEditorDraftEdits = edits;
	}

	function rememberPokemonEditorFocus(focus: PokemonEditorFocus) {
		pokemonEditorSession = { ...pokemonEditorSession, focus };
	}

	function choosePokemonEditorSection(section: PokemonEditorSectionId) {
		pokemonEditorSession = selectPokemonEditorSection(pokemonEditorSession, section);
		queueMicrotask(focusPokemonEditorSession);
	}

	function pageActivePokemonEditorSection(offset: -1 | 1) {
		pokemonEditorSession = pagePokemonEditorSection(pokemonEditorSession, offset);
		void tick().then(focusPokemonEditorSession);
	}

	function focusPokemonEditorRail() {
		pokemonEditorSession = {
			...pokemonEditorSession,
			focus: { zone: 'rail', section: pokemonEditorSession.section }
		};
		revealPokemonEditorRailSection(pokemonEditorSession.section);
	}

	function focusPokemonEditorContent(preferLast = false) {
		const controls = pokemonEditorContentControls();
		const preferred = pokemonEditorSectionControls[pokemonEditorSession.section]
			.map((id) => document.getElementById(id))
			.find(
				(element): element is HTMLElement =>
					element instanceof HTMLElement && controls.includes(element)
			);
		const control = preferLast ? controls.at(-1) : (preferred ?? controls[0]);
		const fallback = document.getElementById(
			`pokemon-editor-content-${pokemonEditorSession.section}`
		);
		const target = control ?? fallback;
		if (!(target instanceof HTMLElement)) return;
		pokemonEditorSession = enterPokemonEditorContent(pokemonEditorSession, target.id);
		target.focus();
		target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	function focusPokemonEditorSession() {
		const focus = pokemonEditorSession.focus;
		keepPokemonEditorRailSectionVisible(pokemonEditorSession.section);
		if (focus.zone === 'rail') {
			document.getElementById(`pokemon-editor-section-${focus.section}`)?.focus();
			return;
		}
		document.getElementById(focus.control)?.focus();
	}

	function revealPokemonEditorRailSection(section: PokemonEditorSectionId) {
		const target = document.getElementById(`pokemon-editor-section-${section}`);
		target?.focus();
		keepPokemonEditorRailSectionVisible(section);
	}

	function keepPokemonEditorRailSectionVisible(section: PokemonEditorSectionId) {
		const target = document.getElementById(`pokemon-editor-section-${section}`);
		target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	async function openLegalityReport() {
		if (activeSummonedWorkflow?.kind !== 'slot-menu') {
			return;
		}

		legalityQuickFixLauncherId = null;
		const activeEngine = engine;
		const context = pokemonActionContextForFocusedSlot();
		if (!activeEngine || !context) return;
		const request = (legalityReportRequest += 1);
		pokemonActionRequest += 1;
		const slot = focusedSlot;
		const location = activeSlotPositionLabel;
		legalityReport = createLegalityReportLoadingState(slot, location);
		pokemonActionContext = context;
		pokemonActionReturnsToEditor = false;
		pokemonAction = createPokemonActionLoadingState(location, slot.label);
		openRelatedWorkflow('legality-report', slotCommandLauncherId('legality-check'));

		const result = await requestPokemonActionPreview(activeEngine, context.target);

		if (request !== legalityReportRequest) {
			return;
		}

		if (!result.ok) {
			legalityReport = {
				status: 'error',
				location,
				pokemonLabel: slot.label,
				message: result.error.message
			};
			pokemonAction = {
				status: 'error',
				location,
				pokemonLabel: slot.label,
				message: result.error.message
			};
			showToast('error', result.error.message);
			return;
		}

		legalityReport = {
			status: 'ready',
			location,
			pokemonLabel: slot.label,
			report: result.value.legalityReport
		};
		pokemonAction = createPokemonActionReadyState(location, slot.label, result.value);
	}

	async function openPokemonEditorLegalityReport() {
		const editor = pokemonEditor;
		const activeEngine = engine;
		if (activeSummonedWorkflow?.kind !== 'pokemon-editor' || !editor || !activeEngine) return;

		legalityQuickFixLauncherId = null;
		const request = (legalityReportRequest += 1);
		pokemonActionRequest += 1;
		legalityReport = createLegalityReportLoadingState(editor.slot, editor.source.location);
		const focus = pokemonEditorSession.focus;
		const launcherId =
			focus.zone === 'rail'
				? `pokemon-editor-section-${focus.section}`
				: focus.control || `pokemon-editor-content-${pokemonEditorSession.section}`;
		summonedWorkflow.openRelated('legality-report', controlLauncher(launcherId));
		if (editor.source.owner !== 'save-file') {
			legalityReport = createLegalityReportUnavailableState(editor.slot, editor.source.location);
			return;
		}

		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const previewBaseBytes =
			pokemonEditorBaseBytes ?? saveWorkspaceForPane(editorPane)?.state.bytes ?? null;
		const scratch = await createPokemonEditorPreviewWorkspace(editor);
		if (
			request !== legalityReportRequest ||
			summonedWorkflow.active?.kind !== 'legality-report' ||
			pokemonEditor !== editor
		) {
			return;
		}
		if (!scratch.ok) {
			legalityReport = {
				status: 'error',
				location: editor.source.location,
				pokemonLabel: editor.slot.label,
				message: scratch.message
			};
			return;
		}
		if (!pokemonEditorBaseBytes && previewBaseBytes) pokemonEditorBaseBytes = previewBaseBytes;
		const context: PokemonActionContext = {
			target: {
				owner: 'save-file',
				workspace: scratch.workspace,
				source: editor.source.slotRef,
				activeBox: editorPane?.activeBox ?? activePaneBox
			},
			storageRef: null,
			editorPreviewValidation: scratch.validation ?? undefined
		};
		pokemonActionContext = context;
		pokemonActionReturnsToEditor = true;
		pokemonAction = createPokemonActionLoadingState(editor.source.location, editor.slot.label);
		const result = await requestPokemonActionPreview(activeEngine, context.target);

		if (request !== legalityReportRequest) return;
		if (!result.ok) {
			legalityReport = {
				status: 'error',
				location: editor.source.location,
				pokemonLabel: editor.slot.label,
				message: result.error.message
			};
			pokemonAction = {
				status: 'error',
				location: editor.source.location,
				pokemonLabel: editor.slot.label,
				message: result.error.message
			};
			return;
		}
		legalityReport = {
			status: 'ready',
			location: editor.source.location,
			pokemonLabel: editor.slot.label,
			report: result.value.legalityReport
		};
		pokemonAction = createPokemonActionReadyState(
			editor.source.location,
			editor.slot.label,
			result.value
		);
	}

	async function createPokemonEditorPreviewWorkspace(editor: PokemonEditorState) {
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const workspace =
			pokemonEditorScratchWorkspace ?? saveWorkspaceForPane(editorPane)?.state ?? null;
		if (!workspace || !engine)
			return { ok: false as const, message: 'The Pokemon Editor source is unavailable.' };
		if (Object.keys(pokemonEditorDraftEdits).length === 0)
			return {
				ok: true as const,
				workspace,
				validation: pokemonEditorPreviewValidation
			};

		const staged = stagePokemonEditorDraftEdits(editor, pokemonEditorDraftEdits);
		const operation = createPokemonEditOperation(staged);
		if (!operation.ok) return { ok: false as const, message: operation.message };
		const result = await engine.previewPokemonEditOperation(
			workspace.bytes,
			workspace.file.originalFileName ?? undefined,
			operation.operation,
			editorPane?.activeBox ?? activePaneBox
		);
		const scope = previewValidationScope(operation.operation);
		return result.ok
			? {
					ok: true as const,
					workspace: { ...workspace, bytes: result.value.bytes, workspace: result.value.workspace },
					validation: hasPreviewValidationScope(scope)
						? mergePokemonEditorPreviewValidation(
								pokemonEditorPreviewValidation,
								workspace.bytes,
								scope
							)
						: pokemonEditorPreviewValidation
				}
			: { ok: false as const, message: result.error.message };
	}

	function previewValidationScope(
		operation: PokemonEditOperation
	): PokemonEditPreviewValidationScope {
		return {
			moves: operation.moves !== undefined,
			metData: operation.metData !== undefined,
			originalTrainer: operation.originalTrainer !== undefined
		};
	}

	function hasPreviewValidationScope(scope: PokemonEditPreviewValidationScope) {
		return scope.moves || scope.metData || scope.originalTrainer;
	}

	function mergePokemonEditorPreviewValidation(
		pending: PokemonEditorPreviewValidation | null,
		baselineBytes: Uint8Array,
		scope: PokemonEditPreviewValidationScope
	): PokemonEditorPreviewValidation {
		return {
			baselineBytes: pending?.baselineBytes ?? baselineBytes,
			scope: {
				moves: pending?.scope.moves === true || scope.moves,
				metData: pending?.scope.metData === true || scope.metData,
				originalTrainer: pending?.scope.originalTrainer === true || scope.originalTrainer
			}
		};
	}

	function closeLegalityReport() {
		if (pokemonAction.status === 'applying') return;
		legalityReportRequest += 1;
		legalityQuickFixLauncherId = null;
		legalityReport = { status: 'idle' };
		pokemonActionRequest += 1;
		pokemonAction = { status: 'idle' };
		pokemonActionContext = null;
		pokemonActionReturnsToEditor = false;
		dismissActiveWorkflow();
		refreshReturnedSlotMenuAvailability();
	}

	function refreshReturnedSlotMenuAvailability() {
		if (summonedWorkflow.active?.kind !== 'slot-menu') return;
		const focusedCommand = currentSlotMenuCommandKey();
		slotMenuPokemonActionRequest += 1;
		slotMenuPokemonActionPreview = null;
		slotMenuPokemonActionsLoading = false;
		void tick().then(() => {
			restoreSlotMenuCommandFocus(focusedCommand);
			if (focusedSlot.kind === 'pokemon') void loadSlotMenuPokemonActions();
		});
	}

	function backLegalityReport() {
		if (pokemonAction.status === 'ready' && pokemonAction.selection) {
			clearPokemonActionPreview();
			return;
		}
		closeLegalityReport();
	}

	function focusPokemonEditorApply() {
		const apply = document.getElementById('pokemon-editor-apply');
		if (apply instanceof HTMLButtonElement && !apply.disabled) {
			pokemonEditorSession = setPokemonEditorApplyFocus(
				pokemonEditorSession,
				'pokemon-editor-apply'
			);
			apply.focus();
			return;
		}

		document.getElementById('pokemon-editor-close')?.focus();
	}

	function cancelPokemonEditorEdits() {
		if (!pokemonEditor) {
			return;
		}

		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const resetWorkspace = pokemonCreation?.workspace ?? saveWorkspaceForPane(editorPane)?.state;
		const resetSlot =
			resetWorkspace && pokemonEditor.source.owner === 'save-file'
				? slotViewForRefFromWorkspace(resetWorkspace.workspace, pokemonEditor.source.slotRef)
				: null;
		const resetEditor = resetSlot
			? createPokemonEditorState(pokemonEditor.source, resetSlot)
			: null;
		pokemonEditor = resetEditor?.ok ? resetEditor.state : cancelPokemonEditor(pokemonEditor);
		pokemonEditorScratchWorkspace = pokemonCreation?.workspace ?? null;
		pokemonEditorBaseBytes = pokemonCreation?.baseBytes ?? null;
		pokemonEditorPreviewValidation = null;
		pokemonEditorFeedback = null;
		pokemonEditorDraft = null;
		pokemonEditorDraftEdits = {};
		pokemonEditorDraftDirty = pokemonCreation !== null;
		void previewPokemonSpeciesFormEdit({
			speciesId: pokemonEditor.slot.speciesId ?? 0,
			form: pokemonEditor.slot.form ?? 0
		});
		queueMicrotask(focusPokemonEditorApply);
	}

	async function previewPokemonSpeciesFormEdit(target: { speciesId: number; form: number }) {
		const editor = pokemonEditor;
		const activeEngine = engine;
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const workingState =
			pokemonEditorScratchWorkspace ?? saveWorkspaceForPane(editorPane)?.state ?? null;
		if (editor?.source.owner === 'pokemon-storage') {
			pokemonSpeciesFormProjection = null;
			pokemonSpeciesFormError =
				'Species and Form preview is not available for Pokemon Storage Pokemon yet.';
			return;
		}

		if (
			!editor ||
			editor.source.owner !== 'save-file' ||
			!activeEngine ||
			!workingState ||
			target.speciesId <= 0
		) {
			pokemonSpeciesFormProjection = null;
			pokemonSpeciesFormError =
				'Species and Form Editing is unavailable until the PKHeX Engine is ready.';
			return;
		}

		const request = (pokemonSpeciesFormRequest += 1);
		pokemonSpeciesFormLoading = true;
		pokemonSpeciesFormError = null;
		const result = await activeEngine.previewPokemonSpeciesFormEdit(
			workingState.bytes,
			workingState.file.originalFileName ?? undefined,
			editor.source.slotRef,
			target.speciesId,
			target.form
		);

		if (request !== pokemonSpeciesFormRequest || pokemonEditor !== editor) return;
		pokemonSpeciesFormLoading = false;
		if (!result.ok) {
			pokemonSpeciesFormProjection = null;
			pokemonSpeciesFormError = result.error.message;
			return;
		}

		pokemonSpeciesFormProjection = result.value;
	}

	async function applyPokemonEditor(draft: PokemonEditorDraftEdits) {
		const currentEditor = pokemonEditor;
		const editor = currentEditor ? stagePokemonEditorDraftEdits(currentEditor, draft) : null;
		if (!editor) {
			return;
		}

		pokemonEditor = editor;
		busy = true;
		pokemonEditorFeedback = 'Applying Pokemon edits...';
		const applyRequest = (pokemonEditorApplyRequest += 1);

		try {
			if (pokemonEditorScratchWorkspace) {
				await applyPokemonEditorScratch(applyRequest, editor);
				return;
			}
			const result = await applyPokemonEditorEdits(editor, {
				verifySource: verifyPokemonEditorSource,
				validate: validatePokemonEditor,
				ensureSaveFileBackup: ensurePokemonEditorBackup,
				mutateSaveFilePokemon,
				mutateStoragePokemon: async (): Promise<PokemonEditorMutationResult> => ({
					ok: false,
					status: 'unsupported',
					message: 'Pokemon Storage editing is not available yet.',
					reason: 'storage-unavailable'
				})
			});

			settlePokemonEditorApply(applyRequest, result);
		} catch (error) {
			handlePokemonEditorApplyError(applyRequest, error);
		} finally {
			if (applyRequest === pokemonEditorApplyRequest) {
				busy = false;
				queueMicrotask(focusPokemonEditorApply);
			}
		}
	}

	async function applyPokemonEditorScratch(applyRequest: number, editor: PokemonEditorState) {
		const activeEngine = engine;
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		let scratch = pokemonEditorScratchWorkspace;
		if (
			!activeEngine ||
			!editorPane ||
			!scratch ||
			!pokemonEditorBaseBytes ||
			editor.source.owner !== 'save-file'
		) {
			throw new Error('The Pokemon Editor draft source is unavailable.');
		}

		if (editor.stagedEdits.length > 0) {
			const operation = createPokemonEditOperation(editor);
			if (!operation.ok) {
				pokemonEditorFeedback = operation.message;
				showToast('error', operation.message);
				return;
			}
			const result = await activeEngine.applyPokemonEditOperation(
				scratch.bytes,
				scratch.file.originalFileName ?? undefined,
				operation.operation,
				editorPane.activeBox
			);
			if (!result.ok) throw result.error;
			scratch = { ...scratch, bytes: result.value.bytes, workspace: result.value.workspace };
		}
		if (pokemonEditorPreviewValidation) {
			const validation = await validatePokemonEditorPreview(
				activeEngine,
				editor,
				scratch,
				pokemonEditorPreviewValidation
			);
			if (!validation.ok) throw validation.error;
		}
		const updatedSlot = slotViewForRefFromWorkspace(scratch.workspace, editor.source.slotRef);
		if (!updatedSlot) throw new Error('The updated Pokemon projection was unavailable.');
		const refreshed = createPokemonEditorState(
			{
				owner: 'save-file',
				saveFileId: editor.source.saveFileId,
				slotRef: editor.source.slotRef,
				location: editor.source.location
			},
			updatedSlot
		);
		if (!refreshed.ok) throw new Error(refreshed.reason);

		let liveWorkspace = currentPokemonEditorWorkspace(editor, editorPane);
		if (!liveWorkspace) {
			pokemonEditorFeedback = 'Pokemon Editor source changed before Apply.';
			showToast('error', pokemonEditorFeedback);
			return;
		}
		if (shouldCreateAutomaticBackup(liveWorkspace)) {
			statusMessage = 'Creating Backup...';
			await storage.createBackup({
				saveFileId: liveWorkspace.file.id,
				bytes: liveWorkspace.bytes,
				reason: pokemonCreation ? 'pokemon-creation' : 'pokemon-editing'
			});
			liveWorkspace = currentPokemonEditorWorkspace(editor, editorPane);
			if (!liveWorkspace) {
				pokemonEditorFeedback = 'Pokemon Editor source changed before Apply.';
				showToast('error', pokemonEditorFeedback);
				return;
			}
			const backedUpWorkspace = markAutomaticBackupCreated(liveWorkspace);
			if (loadedSave?.file.id === backedUpWorkspace.file.id) loadedSave = backedUpWorkspace;
			savePaneWorkspaces = {
				...savePaneWorkspaces,
				[editorPane.id]: { state: backedUpWorkspace, loadedBox: editorPane.activeBox }
			};
			liveWorkspace = backedUpWorkspace;
		}

		const nextState: WorkspaceState = {
			...liveWorkspace,
			bytes: scratch.bytes,
			workspace: scratch.workspace,
			dirty: true,
			restoredFromBackup: null
		};
		await persistWorkspace(nextState);
		installPokemonEditorWorkspace(nextState);
		if (applyRequest !== pokemonEditorApplyRequest) return;
		if (pokemonCreation) {
			completePokemonCreation(updatedSlot, editorPane.activeBox);
			return;
		}

		pokemonEditor = {
			...refreshed.state,
			applyOutcome: { status: 'success', message: 'Pokemon edits applied.' }
		};
		pokemonEditorFeedback = 'Pokemon edits applied.';
		pokemonEditorDraft = null;
		pokemonEditorDraftEdits = {};
		pokemonEditorDraftDirty = false;
		pokemonEditorScratchWorkspace = null;
		pokemonEditorBaseBytes = null;
		pokemonEditorPreviewValidation = null;
		showToast('success', 'Pokemon edits applied.');
		void previewPokemonSpeciesFormEdit({
			speciesId: updatedSlot.speciesId ?? 0,
			form: updatedSlot.form ?? 0
		});
	}

	function completePokemonCreation(createdSlot: SlotView, destinationBox: number) {
		const view = pokemonCreation;
		if (!view) return;
		const destinationFocus =
			view.destination.zone === 'party'
				? focusPartySlot(view.destination.slot)
				: focusBoxSlot(view.destination.slot);
		pokemonCreation = null;
		pokemonEditor = null;
		pokemonEditorPaneId = null;
		pokemonEditorFeedback = null;
		pokemonEditorDraft = null;
		pokemonEditorDraftEdits = {};
		pokemonEditorDraftDirty = false;
		pokemonEditorScratchWorkspace = null;
		pokemonEditorBaseBytes = null;
		pokemonEditorPreviewValidation = null;
		summonedWorkflow.closeAll();
		activePaneId = view.paneId;
		navigation = {
			...navigation,
			activeBox: view.destination.zone === 'box' ? view.destination.box : destinationBox,
			focus: destinationFocus,
			locationFocus: destinationFocus
		};
		workbenchPanes = setPaneFocus(workbenchPanes, view.paneId, destinationFocus);
		showToast('success', `${createdSlot.label} created in ${view.location}.`);
		queueMicrotask(focusActiveControl);
	}

	function currentPokemonEditorWorkspace(
		editor: PokemonEditorState,
		editorPane: BoxPaneState
	): WorkspaceState | null {
		if (editor.source.owner !== 'save-file') return null;
		const current = saveWorkspaceForPane(editorPane)?.state ?? null;
		if (pokemonCreation) {
			return current &&
				current.file.id === editor.source.saveFileId &&
				current.bytes === pokemonEditorBaseBytes &&
				slotForRef(pokemonCreation.destination, editorPane)?.kind === 'empty'
				? current
				: null;
		}
		return current &&
			current.file.id === editor.source.saveFileId &&
			current.bytes === pokemonEditorBaseBytes &&
			isSamePokemonEditorSourceIdentity(editor, slotForRef(editor.source.slotRef, editorPane))
			? current
			: null;
	}

	async function verifyPokemonEditorSource(
		state: PokemonEditorState
	): Promise<PokemonEditorSourceVerification> {
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		return {
			ok:
				state.source.owner === 'save-file' &&
				state.source.saveFileId === editorPane?.source.id &&
				isSamePokemonEditorSourceIdentity(state, slotForRef(state.source.slotRef, editorPane))
		};
	}

	async function validatePokemonEditor(state: PokemonEditorState) {
		const operation = createPokemonEditOperation(state);
		return operation.ok ? ({ ok: true } as const) : operation;
	}

	async function ensurePokemonEditorBackup() {
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const editorWorkspace = saveWorkspaceForPane(editorPane)?.state ?? null;
		if (!editorPane || !editorWorkspace) return saveFileUnavailable();
		if (!shouldCreateAutomaticBackup(editorWorkspace)) return { ok: true } as const;

		statusMessage = 'Creating Backup...';
		await storage.createBackup({
			saveFileId: editorWorkspace.file.id,
			bytes: editorWorkspace.bytes,
			reason: 'pokemon-editing'
		});
		const backedUpWorkspace = markAutomaticBackupCreated(editorWorkspace);
		if (loadedSave?.file.id === backedUpWorkspace.file.id) loadedSave = backedUpWorkspace;
		savePaneWorkspaces = {
			...savePaneWorkspaces,
			[editorPane.id]: {
				state: backedUpWorkspace,
				loadedBox: editorPane.activeBox
			}
		};
		return { ok: true } as const;
	}

	async function mutateSaveFilePokemon(
		state: PokemonEditorState
	): Promise<PokemonEditorMutationResult> {
		const operation = createPokemonEditOperation(state);
		if (!operation.ok) return operation;
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const workingState = saveWorkspaceForPane(editorPane)?.state ?? null;
		if (!editorPane || !workingState) return saveFileUnavailable();
		if (!engine) return engineUnavailable();

		statusMessage = 'Applying Pokemon edits...';
		const mutation = await engine.applyPokemonEditOperation(
			workingState.bytes,
			workingState.file.originalFileName ?? undefined,
			operation.operation,
			editorPane.activeBox
		);
		if (!mutation.ok) {
			return {
				ok: false,
				status: mutation.error.code === 'unsupported-pokemon-edit' ? 'unsupported' : 'rejected',
				message: mutation.error.message,
				reason: mutation.error.code
			};
		}

		return commitPokemonEditorMutation(workingState, operation.operation, mutation.value);
	}

	async function commitPokemonEditorMutation(
		workingState: WorkspaceState,
		operation: PokemonEditOperation,
		mutation: PokemonEditOperationResult
	): Promise<PokemonEditorMutationResult> {
		const nextState: WorkspaceState = {
			...workingState,
			bytes: mutation.bytes,
			workspace: mutation.workspace,
			dirty: workingState.dirty || mutation.mutated,
			restoredFromBackup: null
		};
		if (nextState.dirty) await persistWorkspace(nextState);
		installPokemonEditorWorkspace(nextState);

		const updatedSlot = slotViewForRefFromWorkspace(nextState.workspace, operation.source);
		if (!updatedSlot) {
			return {
				ok: false,
				status: 'failed',
				message: 'Pokemon edits applied, but the updated Slot projection was unavailable.',
				reason: 'invalid-engine-response'
			};
		}

		return {
			ok: true,
			slot: updatedSlot,
			message: pokemonEditSuccessMessage(operation, mutation.mutated)
		};
	}

	function installPokemonEditorWorkspace(nextState: WorkspaceState) {
		const editorPane = workbenchPanes.find((pane) => pane.id === pokemonEditorPaneId);
		const editorBox = editorPane?.activeBox ?? activePaneBox;
		if (loadedSave?.file.id === nextState.file.id) loadedSave = nextState;
		installMutatedSaveProjection(nextState, editorBox);
		if (loadedSave?.file.id === nextState.file.id) {
			setCachedActiveWorkspace(nextState, editorBox);
		}
		invalidateSavesCache();
	}

	function settlePokemonEditorApply(
		applyRequest: number,
		result: Awaited<ReturnType<typeof applyPokemonEditorEdits>>
	) {
		statusMessage = result.outcome.message ?? statusMessage;
		if (applyRequest !== pokemonEditorApplyRequest) {
			if (result.outcome.status === 'success') showToast('success', result.outcome.message);
			return;
		}

		pokemonEditor = result.state;
		pokemonEditorFeedback = result.outcome.message;
		if (result.outcome.status === 'success') {
			pokemonEditorDraft = null;
			pokemonEditorDraftEdits = {};
			pokemonEditorDraftDirty = false;
			pokemonEditorScratchWorkspace = null;
			pokemonEditorBaseBytes = null;
			pokemonEditorPreviewValidation = null;
			showToast('success', result.outcome.message);
			void previewPokemonSpeciesFormEdit({
				speciesId: result.state.slot.speciesId ?? 0,
				form: result.state.slot.form ?? 0
			});
		} else if (result.outcome.status !== 'noop') {
			showToast('error', result.outcome.message ?? 'Pokemon edit failed.');
		}
	}

	function handlePokemonEditorApplyError(applyRequest: number, error: unknown) {
		const message = getErrorMessage(error);
		if (applyRequest !== pokemonEditorApplyRequest) {
			statusMessage = message;
			return;
		}

		pokemonEditorFeedback = message;
		statusMessage = 'Pokemon edit failed.';
		showToast('error', message);
	}

	function saveFileUnavailable() {
		return {
			ok: false,
			status: 'failed',
			message: 'Load a Save File before applying Pokemon edits.',
			reason: 'save-file-unavailable'
		} as const;
	}

	function engineUnavailable(): PokemonEditorMutationResult {
		return {
			ok: false,
			status: 'failed',
			message: 'The PKHeX Engine is not ready.',
			reason: 'engine-unavailable'
		};
	}

	function isFocused(zone: 'party' | 'box', slot: number) {
		return (
			activeSlotFocus !== null && activeSlotFocus.zone === zone && activeSlotFocus.slot === slot
		);
	}

	onMount(() => {
		const unsubscribe = workspaceService.subscribe((state) => {
			const adoptAsActiveSave = state ? consumeActiveSaveAdoption(state.file.id) : false;
			loadedSave = state;
			if (!state) return;
			if (installingActiveBoxProjection) return;
			if (initialStateReady && adoptAsActiveSave) {
				installActiveSavePane(state, getCachedActiveWorkspaceBox());
				queueMicrotask(focusActiveControl);
				return;
			}
			void refreshPublishedSavePanes(state);
		});
		const boxesRoute = document.querySelector('.boxes-route');
		const resizeObserver = boxesRoute
			? new ResizeObserver(() => queueMicrotask(keepFocusedSlotVisible))
			: null;
		if (boxesRoute) resizeObserver?.observe(boxesRoute);
		engine = getPkhexEngine();
		void restoreInitialState();
		return () => {
			resizeObserver?.disconnect();
			unsubscribe();
		};
	});

	onDestroy(() => {
		destroyed = true;
		if (summonedWorkflow.active?.kind !== 'backup-browser') summonedWorkflow.closeAll();
	});

	function installMutatedSaveProjection(state: WorkspaceState, publishedBox: number) {
		void refreshPublishedSavePanes(state, publishedBox);
	}

	function installActiveBoxProjection(state: WorkspaceState, box: number) {
		installingActiveBoxProjection = true;
		try {
			setCachedActiveWorkspace(state, box);
		} finally {
			installingActiveBoxProjection = false;
		}
	}

	async function refreshPublishedSavePanes(
		state: WorkspaceState,
		publishedBox = getCachedActiveWorkspaceBox()
	) {
		const panes = workbenchPanes.filter(
			(pane) => pane.source.type === 'save-file' && pane.source.id === state.file.id
		);

		await Promise.all(
			panes.map(async (pane) => {
				const needsLoad = pane.activeBox !== publishedBox;
				const request = beginPaneWorkspaceRequest(pane.id, needsLoad);
				if (pane.activeBox === publishedBox) {
					installPaneWorkspace(pane.id, state.file.id, publishedBox, state, request);
					return;
				}

				try {
					const paneState = await loadWorkspaceStateForSaveFile(state.file.id, pane.activeBox);
					if (paneState) {
						installPaneWorkspace(pane.id, state.file.id, pane.activeBox, paneState, request);
					}
				} catch (error) {
					const currentPane = workbenchPanes.find((candidate) => candidate.id === pane.id);
					if (
						paneWorkspaceRequests[pane.id] === request &&
						currentPane?.source.type === 'save-file' &&
						currentPane.source.id === state.file.id &&
						currentPane.activeBox === pane.activeBox
					) {
						const remaining = { ...savePaneWorkspaces };
						delete remaining[pane.id];
						savePaneWorkspaces = remaining;
						showToast('error', getErrorMessage(error));
						statusMessage = 'Could not refresh that Save File pane.';
					}
				} finally {
					finishPaneWorkspaceRequest(pane.id, request);
				}
			})
		);
	}

	async function restoreInitialState() {
		await restorePokemonStorage();
		if (page.url.searchParams.get('source') === 'pokemon-storage') {
			setCachedActiveWorkspace(null, 0);
			saveFiles = await storage.listSaves();
			workbenchPanes = [
				createBoxPane('pane-pokemon-storage', pokemonStorageSource(), {
					boxCount: pokemonStorageBoxCount
				})
			];
			activePaneId = 'pane-pokemon-storage';
			navigation = createInitialNavigationState(pokemonStorageBoxCount);
			statusMessage = 'Pokemon Storage loaded.';
			initialStateReady = true;
			return;
		}
		await restoreMostRecentSave();
		initialStateReady = true;
	}

	async function restorePokemonStorage() {
		const stored = await storage.getPokemonStorage();
		pokemonStorage = stored ?? (await storage.putPokemonStorage(createEmptyPokemonStorage()));
		workbenchPanes = workbenchPanes.map((pane) =>
			pane.source.type === 'pokemon-storage'
				? { ...pane, boxCount: pokemonStorage?.boxCount ?? placeholderBoxCount }
				: pane
		);
		if (activePane?.source.type === 'pokemon-storage') {
			const nextBox = Math.min(activePaneBox, Math.max(0, (pokemonStorage?.boxCount ?? 1) - 1));
			workbenchPanes = setPaneActiveBox(workbenchPanes, activePane.id, nextBox);
			navigation = selectActiveBox(
				createInitialNavigationState(pokemonStorage?.boxCount ?? placeholderBoxCount),
				nextBox
			);
		}
	}

	async function restoreMostRecentSave() {
		busy = true;
		workspaceLoadRequest += 1;
		importError = null;

		try {
			const restored = await loadActiveWorkspaceFromSaves();
			if (!restored) {
				statusMessage = 'Open Saves to import a Save File.';
				return;
			}

			loadedSave = restored;
			saveFiles = await storage.listSaves();
			seedSavesSnapshotFromActiveWorkspace(saveFiles);
			const restoredBox = Math.min(
				getCachedActiveWorkspaceBox(),
				Math.max(0, restored.workspace.summary.boxCount - 1)
			);
			installActiveSavePane(restored, restoredBox);
			statusMessage = restored.dirty
				? `${restored.file.originalFileName ?? 'Save File'} restored from Saves with unexported changes.`
				: `${restored.file.originalFileName ?? 'Save File'} restored from Saves.`;
		} catch (error) {
			importError = getErrorMessage(error);
			statusMessage = 'Could not restore the most recent Save File.';
			showToast('error', importError);
		} finally {
			busy = false;
		}
	}

	async function loadWorkspaceForSave(save: WorkspaceState, box: number, paneId = activePaneId) {
		const request = (workspaceLoadRequest += 1);
		const paneRequest = beginPaneWorkspaceRequest(paneId, true);
		busy = true;
		importError = null;

		try {
			const workspace = await loadWorkspace(
				save.bytes,
				save.file.originalFileName ?? undefined,
				box
			);
			if (
				paneWorkspaceRequests[paneId] === paneRequest &&
				workbenchPanes.some(
					(pane) =>
						pane.id === paneId &&
						pane.source.type === 'save-file' &&
						pane.source.id === save.file.id &&
						pane.activeBox === box
				)
			) {
				const state = { ...save, workspace };
				installPaneWorkspace(paneId, save.file.id, box, state, paneRequest);
				if (
					request === workspaceLoadRequest &&
					activePaneId === paneId &&
					loadedSave?.file.id === save.file.id
				) {
					loadedSave = state;
					installActiveBoxProjection(state, box);
				}
			}
		} catch (error) {
			if (request === workspaceLoadRequest && paneWorkspaceRequests[paneId] === paneRequest) {
				importError = getErrorMessage(error);
				showToast('error', importError);
			}
		} finally {
			finishPaneWorkspaceRequest(paneId, paneRequest);
			if (request === workspaceLoadRequest) {
				busy = false;
			}
		}
	}

	async function refreshPaneWorkspace(paneId: string, box: number) {
		const pane = workbenchPanes.find((candidate) => candidate.id === paneId);
		if (!pane || pane.source.type !== 'save-file' || !pane.source.id) {
			return;
		}
		const sourceId = pane.source.id;

		if (loadedSave && pane.source.id === loadedSave.file.id && pane.id === activePaneId) {
			await loadWorkspaceForSave(loadedSave, box, paneId);
			return;
		}
		const request = beginPaneWorkspaceRequest(paneId, true);
		try {
			const state = await loadWorkspaceStateForSaveFile(sourceId, box);
			if (!state) {
				return;
			}
			const currentPane = workbenchPanes.find((candidate) => candidate.id === paneId);
			if (
				paneWorkspaceRequests[paneId] !== request ||
				currentPane?.source.type !== 'save-file' ||
				currentPane.source.id !== sourceId ||
				currentPane.activeBox !== box
			) {
				return;
			}

			installPaneWorkspace(paneId, sourceId, box, state, request);
		} catch (error) {
			const currentPane = workbenchPanes.find((candidate) => candidate.id === paneId);
			if (
				paneWorkspaceRequests[paneId] === request &&
				currentPane?.source.type === 'save-file' &&
				currentPane.source.id === sourceId &&
				currentPane.activeBox === box
			) {
				showToast('error', getErrorMessage(error));
				statusMessage = 'Could not load that Save File pane.';
			}
		} finally {
			finishPaneWorkspaceRequest(paneId, request);
		}
	}

	function beginPaneWorkspaceRequest(paneId: string, loading: boolean) {
		const request = (paneWorkspaceRequests[paneId] ?? 0) + 1;
		paneWorkspaceRequests[paneId] = request;
		if (loading) {
			paneWorkspaceLoadingRequests = { ...paneWorkspaceLoadingRequests, [paneId]: request };
		} else if (paneWorkspaceLoadingRequests[paneId] !== undefined) {
			const remainingRequests = { ...paneWorkspaceLoadingRequests };
			delete remainingRequests[paneId];
			paneWorkspaceLoadingRequests = remainingRequests;
		}
		return request;
	}

	function finishPaneWorkspaceRequest(paneId: string, request: number) {
		if (paneWorkspaceLoadingRequests[paneId] !== request) return;
		const remaining = { ...paneWorkspaceLoadingRequests };
		delete remaining[paneId];
		paneWorkspaceLoadingRequests = remaining;
	}

	function installPaneWorkspace(
		paneId: string,
		sourceId: string,
		box: number,
		state: WorkspaceState,
		request: number
	) {
		const pane = workbenchPanes.find((candidate) => candidate.id === paneId);
		if (
			destroyed ||
			paneWorkspaceRequests[paneId] !== request ||
			pane?.source.type !== 'save-file' ||
			pane.source.id !== sourceId ||
			pane.activeBox !== box
		) {
			return false;
		}

		const boxCount = Math.max(1, state.workspace.summary.boxCount);
		const activeBox = Math.min(box, boxCount - 1);
		savePaneWorkspaces = {
			...savePaneWorkspaces,
			[paneId]: { state, loadedBox: activeBox }
		};
		workbenchPanes = workbenchPanes.map((candidate) =>
			candidate.id === paneId && candidate.source.type === 'save-file'
				? {
						...candidate,
						activeBox,
						boxCount,
						source: {
							...candidate.source,
							label: state.file.originalFileName ?? candidate.source.label,
							dirty: state.dirty
						}
					}
				: candidate
		);
		if (activePaneId === paneId) {
			navigation = { ...navigation, activeBox, boxCount };
		}
		return true;
	}

	async function loadWorkspaceStateForSaveFile(
		saveFileId: string,
		box: number
	): Promise<WorkspaceState | null> {
		const [saveFile, saveBytes, persistedWorkspace] = await Promise.all([
			storage.getSave(saveFileId),
			storage.getSaveBytes(saveFileId),
			storage.getWorkspace(saveFileId)
		]);

		if (!saveFile || !saveBytes) {
			return null;
		}

		const bytes = persistedWorkspace?.bytes ?? saveBytes;
		const workspace = await loadWorkspace(bytes, saveFile.originalFileName ?? undefined, box);

		return persistedWorkspace
			? {
					file: saveFile,
					bytes,
					workspace,
					dirty: persistedWorkspace.dirty,
					automaticBackupCreated: persistedWorkspace.automaticBackupCreated,
					restoredFromBackup: null
				}
			: createCleanWorkspaceState({ file: saveFile, bytes, workspace });
	}

	async function loadWorkspace(bytes: Uint8Array, fileName: string | undefined, box: number) {
		if (!engine) {
			throw new Error('The PKHeX Engine is not ready.');
		}

		const result = await engine.loadSaveWorkspace(bytes, fileName, box);

		if (!result.ok) {
			throw result.error;
		}

		return result.value;
	}

	async function persistWorkspace(state: WorkspaceState) {
		await storage.putWorkspace({
			saveFileId: state.file.id,
			bytes: state.bytes,
			dirty: state.dirty,
			automaticBackupCreated: state.automaticBackupCreated
		});
	}

	async function importSaveFile(file: File) {
		const request = (workspaceLoadRequest += 1);
		busy = true;
		importError = null;
		statusMessage = `Reading ${file.name}...`;

		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const workspace = await loadWorkspace(bytes, file.name, 0);
			const saveFile = await storage.importSave({ bytes, originalFileName: file.name });
			await storage.clearWorkspace(saveFile.id);

			if (request === workspaceLoadRequest) {
				loadedSave = createCleanWorkspaceState({ file: saveFile, bytes, workspace });
				saveFiles = await storage.listSaves();
				setCachedActiveWorkspace(loadedSave, 0);
				invalidateSavesCache();
				seedSavesSnapshotFromActiveWorkspace(saveFiles);
				installActiveSavePane(loadedSave, 0);
				statusMessage = `${file.name} imported and made active.`;
				queueMicrotask(() => {
					if (
						!destroyed &&
						request === workspaceLoadRequest &&
						loadedSave?.file.id === saveFile.id &&
						activePaneId === activeSavePaneId &&
						navigation.focus.zone === 'box' &&
						navigation.focus.slot === 0
					) {
						void focusActiveControl();
					}
				});
			}
		} catch (error) {
			if (request === workspaceLoadRequest) {
				importError = getErrorMessage(error);
				statusMessage = 'Import failed. Current active Save File was not changed.';
				showToast('error', importError);
			}
		} finally {
			if (request === workspaceLoadRequest) {
				busy = false;
			}
		}
	}

	function downloadBytes(bytes: Uint8Array, fileName: string) {
		const downloadBytes = new Uint8Array(bytes.byteLength);
		downloadBytes.set(bytes);
		const url = URL.createObjectURL(
			new Blob([downloadBytes.buffer], { type: 'application/octet-stream' })
		);
		const link = document.createElement('a');
		link.href = url;
		link.download = fileName;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}

	function createExportFileName(fileName: string | null) {
		if (!fileName) {
			return 'pksx-export.sav';
		}

		const lastDot = fileName.lastIndexOf('.');
		if (lastDot <= 0) {
			return `${fileName}.pksx`;
		}

		return `${fileName.slice(0, lastDot)}.pksx${fileName.slice(lastDot)}`;
	}

	function slotViewForRefFromWorkspace(
		workspace: WorkspaceState['workspace'],
		ref: SaveSlotRef
	): SlotView | null {
		if (ref.zone === 'party') {
			const slot = workspace.partySlots.find((candidate) => candidate.slot === ref.slot);
			return slot ? createSlotView(slot) : null;
		}

		const slot = workspace.boxSlots.find(
			(candidate) => candidate.box === ref.box && candidate.slot === ref.slot
		);
		return slot ? createSlotView(slot) : null;
	}

	function spriteUrlFor(slot: SlotView): string | null {
		const entry = resolveSpriteCatalogEntry(slot.spriteIdentity);
		return entry ? asset(entry.path) : null;
	}

	function getErrorMessage(error: unknown) {
		if (isEngineError(error)) {
			return error.message;
		}

		if (error instanceof Error && error.message.length > 0) {
			return error.message;
		}

		return 'PKSX could not complete the operation.';
	}

	function isEngineError(error: unknown): error is EngineError {
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			'message' in error &&
			typeof error.message === 'string'
		);
	}
</script>

<svelte:head>
	<title>PKSX</title>
</svelte:head>

<svelte:window onkeydown={handleAppKeydown} />

<div class="status-announcer" role="status" aria-live="polite">{statusMessage}</div>
<input
	id="quick-save-import"
	class="source-picker-import"
	type="file"
	accept=".sav,.dat,.bin,application/octet-stream"
	aria-label="Quick save import"
	disabled={busy}
	onchange={(event) => {
		const input = event.currentTarget;
		const file = input.files?.[0];
		input.value = '';
		if (file) void importSaveFile(file);
	}}
/>

<section
	class="boxes-route pksx-density-container"
	aria-label="Boxes workspace"
	data-destination-root="boxes"
	data-initial-state={initialStateReady ? 'ready' : 'loading'}
	data-active-save-file-id={loadedSave?.file.id ?? ''}
	inert={destinationInputSuspended}
>
	<section
		class="storage-workspace pksx-density"
		class:two-pane={workbenchPanes.length === 2}
		aria-label="Party and box storage"
	>
		<div
			class="box-pane-strip"
			class:single-pane={workbenchPanes.length === 1}
			class:many-panes={workbenchPanes.length >= 3}
		>
			{#each workbenchPanes as pane (pane.id)}
				{@const paneActive = pane.id === activePaneId}
				{@const paneBusy =
					(busy && paneActive) || paneWorkspaceLoadingRequests[pane.id] !== undefined}
				{@const paneFixed = pane.id === activeSavePaneId}
				{@const paneControlCount = paneControlCountFor(pane)}
				{@const paneBox = pane.activeBox}
				{@const paneParty = pane.focus.zone === 'party' && paneHasParty(pane)}
				{@const paneSlots = paneParty ? panePartySlots(pane) : paneBoxSlots(pane, paneBox)}
				{@const paneColumns = paneParty ? PARTY_COLUMNS : BOX_COLUMNS}
				{@const paneRows = paneParty ? PARTY_ROWS : BOX_ROWS}
				<section
					class={['box-pane', paneActive && 'active-pane']}
					data-pane-id={pane.id}
					data-source-id={pane.source.id}
					data-location={paneParty ? 'party' : `box-${paneBox}`}
					aria-label={`${pane.source.label}, ${paneParty ? 'Party' : boxNameFor(paneBox)}`}
					aria-busy={paneBusy ? 'true' : undefined}
				>
					<div class="pane-header">
						<div class="pane-source-row">
							<button
								id={collectionControlId(pane.id)}
								data-pane-control-index="0"
								type="button"
								class="source-chip"
								aria-label={`Open Box Menu for ${pane.source.label}`}
								aria-disabled={pendingSlotOperation ? 'true' : undefined}
								tabindex={pendingSlotOperation ? -1 : undefined}
								onpointerdown={(event) => {
									if (pendingSlotOperation) event.preventDefault();
								}}
								onfocus={() => {
									if (pendingSlotOperation) {
										queueMicrotask(focusActiveControl);
										return;
									}
									activatePane(pane);
									navigation = {
										...navigation,
										focus: focusPaneControl(0, paneControlCount),
										locationFocus: pane.focus
									};
								}}
								onclick={() => {
									if (pendingSlotOperation) return;
									activePaneId = pane.id;
									openBoxMenu(pane);
								}}
							>
								<span>{pane.source.type === 'pokemon-storage' ? 'APP' : 'SAVE'}</span>
								<strong>{pane.source.label}</strong>
								<em>▾</em>
							</button>
							{#if paneBusy}<span class="pane-busy">Working</span>{/if}
							{#if !paneFixed && workbenchPanes.length > 1}
								<button
									id={`close-pane-${pane.id}`}
									data-pane-control-index="1"
									type="button"
									class="pane-close"
									aria-label={`Close ${pane.source.label} pane`}
									aria-disabled={pendingSlotOperation ? 'true' : undefined}
									tabindex={pendingSlotOperation ? -1 : undefined}
									onpointerdown={(event) => {
										if (pendingSlotOperation) event.preventDefault();
									}}
									onfocus={() => {
										if (pendingSlotOperation) {
											queueMicrotask(focusActiveControl);
											return;
										}
										activatePane(pane);
										navigation = {
											...navigation,
											focus: focusPaneControl(1, paneControlCount),
											locationFocus: pane.focus
										};
									}}
									onclick={() => {
										if (pendingSlotOperation) return;
										closePane(pane.id);
									}}
								>
									×
								</button>
							{/if}
						</div>
						<div class="location-header">
							<BoxSourceControls
								source={{
									key: pane.source.type,
									label: pane.source.label,
									activeBoxLabel: paneParty ? 'Party' : boxNameFor(paneBox),
									activeBoxNumber: paneBox + 1,
									boxCount:
										pane.source.type === 'pokemon-storage' ? pokemonStorageBoxCount : pane.boxCount,
									occupied: paneSlots.filter((slot) => slot.kind === 'pokemon').length,
									capacity: paneParty ? PARTY_SLOT_COUNT : BOX_SLOT_COUNT,
									location: paneParty ? 'party' : 'box'
								}}
								onPreviousBox={() => changePaneLocation(pane, 'previousBox')}
								onNextBox={() => changePaneLocation(pane, 'nextBox')}
							/>
						</div>
					</div>
					<div
						id={paneActive ? 'box-grid' : `box-grid-${pane.id}`}
						class={['location-grid', paneParty && 'party-grid']}
						role="grid"
						tabindex={paneActive ? 0 : -1}
						aria-label={`${pane.source.label} ${paneParty ? 'Party' : boxNameFor(paneBox)}`}
						aria-activedescendant={paneActive && isSlotFocus(navigation.focus)
							? activeFocusId
							: undefined}
						aria-rowcount={paneRows}
						aria-colcount={paneColumns}
						onfocus={() => activatePane(pane)}
						onfocusin={() => {
							if (!pendingSlotOperation && pane.id !== activePaneId) activatePane(pane);
						}}
					>
						{#each Array.from(Array(paneRows).keys()) as row (row)}
							<div class="slot-row" role="row">
								{#each paneSlots.slice(row * paneColumns, (row + 1) * paneColumns) as slot (slot.slot)}
									{@const position = paneParty
										? getPartySlotPosition(slot.slot)
										: getBoxSlotPosition(slot.slot)}
									{@const slotRef = paneParty
										? { zone: 'party' as const, slot: slot.slot }
										: { zone: 'box' as const, box: paneBox, slot: slot.slot }}
									<div
										class={[
											'slot-cell',
											paneActive && isFocused(slotRef.zone, slot.slot) && 'selected'
										]}
									>
										<StorageSlot
											id={paneActive
												? paneParty
													? `party-slot-${slot.slot}`
													: `box-${paneBox}-slot-${slot.slot}`
												: `${pane.id}-${paneParty ? 'party' : `box-${paneBox}`}-slot-${slot.slot}`}
											{slot}
											zone={slotRef.zone}
											focused={paneActive && isFocused(slotRef.zone, slot.slot)}
											dualType={slotHasDualType(slot, paneParty ? -1 : paneBox)}
											style={slotStyle(slot, paneParty ? -1 : paneBox)}
											rowIndex={position.row + 1}
											colIndex={position.column + 1}
											spriteUrl={spriteUrlFor(slot)}
											carried={paneActive && isFocused(slotRef.zone, slot.slot) && carryState
												? {
														label: carryState.pokemonLabel,
														mode: carryState.mode,
														spriteUrl: carriedSpriteUrl
													}
												: null}
											destinationState={pendingSlotOperation
												? destinationStateFor(slotRef, slot, pane)
												: null}
											onFocusSlot={() => {
												activatePane(pane);
												if (paneParty) focusParty(slot.slot);
												else focusBox(slot.slot);
											}}
											onChooseSlot={pendingSlotOperation
												? () => {
														activatePane(pane);
														void completePendingSlotOperation(slotRef, pane);
													}
												: undefined}
										/>
									</div>
								{/each}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</div>

		<div class="shared-detail" aria-label="Shared Slot summary">
			{#if workbenchPanes.length === 2}
				<div class="transfer-controls" aria-label="Transfer controls">
					<button
						type="button"
						tabindex="-1"
						disabled={focusedSlot.kind !== 'pokemon' || pendingSlotOperation !== null}
						onpointerdown={(event) => event.preventDefault()}
						onclick={() => beginPendingSlotOperation('move')}>Move</button
					>
					<button
						type="button"
						tabindex="-1"
						disabled={focusedSlot.kind !== 'pokemon' || pendingSlotOperation !== null}
						onpointerdown={(event) => event.preventDefault()}
						onclick={() => beginPendingSlotOperation('copy')}>Copy</button
					>
				</div>
			{/if}
			<DetailRail
				{focusedSlot}
				focusZone={activeSlotFocus?.zone ?? null}
				focusSlot={activeSlotFocus?.slot ?? null}
				slotHueStyle={slotStyle(focusedSlot, activePaneBox)}
				spriteUrl={spriteUrlFor(focusedSlot)}
				{saveSummary}
				activeBoxName={boxNameFor(summonedSlotBox ?? focusedSlotPane?.activeBox ?? activePaneBox)}
				positionLabel={carryState
					? `${activeSlotPositionLabel} · ${carryState.mode === 'move' ? 'Drop' : 'Copy'} target`
					: activeSlotPositionLabel}
			/>
		</div>
	</section>
</section>

{#if boxMenuOpen && boxMenuTarget}
	<BoxMenu
		collection={boxMenuTarget.source.label}
		commands={boxMenuCommands}
		activeIndex={navigation.focus.zone === 'actions' ? navigation.focus.index : 0}
		onFocusCommand={focusBoxMenuCommand}
		onSelectCommand={selectBoxMenuCommand}
		onClose={closeBoxMenu}
	/>
{/if}

{#if slotMenuOpen && summonedSlotLauncher}
	<SlotActionMenu
		slot={focusedSlot}
		location={summonedSlotLauncher.focus.zone === 'party'
			? `Party slot ${summonedSlotLauncher.focus.slot + 1}`
			: `${summonedSlotPane?.source.label ?? 'Collection'}, Box ${(summonedSlotBox ?? 0) + 1}, slot ${summonedSlotLauncher.focus.slot + 1}`}
		commands={slotMenuCommands}
		activeIndex={navigation.focus.zone === 'actions' ? navigation.focus.index : 0}
		availabilityPending={slotMenuPokemonActionsLoading}
		onFocusCommand={focusActionCommand}
		onSelectCommand={selectSlotActionCommand}
		onClose={closeSlotMenu}
	/>
{/if}

{#if sourcePickerOpen}
	<div class="source-picker-backdrop" role="presentation" onclick={closeSourcePickerFromBackdrop}>
		<div
			class="source-picker"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label={sourcePickerTargetPaneId ? 'Switch collection' : 'Open another collection'}
		>
			<header>
				<div>
					<h2>{sourcePickerTargetPaneId ? 'Switch collection' : 'Open another collection'}</h2>
					<p>Choose a Save File or Pokemon Storage for this pane.</p>
				</div>
				<button
					type="button"
					class="source-picker-close"
					aria-label="Close source picker"
					onfocus={() => (sourcePickerFocusIndex = sourcePickerControls().length - 1)}
					onclick={closeSourcePicker}>×</button
				>
			</header>
			<div class="source-card-grid">
				{#each sourcePickerCards as card, index (card.id)}
					<button
						id={`source-picker-control-${index}`}
						data-source-picker-control
						type="button"
						class={['source-card', card.treatment === 'app-owned' && 'app-owned']}
						onfocus={() => (sourcePickerFocusIndex = index)}
						onclick={() => openSourceAsPane(sourceForCard(card), card.id)}
					>
						<span>{card.treatment === 'app-owned' ? 'APP-OWNED' : 'SAVE FILE'}</span>
						<strong>{card.label}</strong>
						<em>{card.metadata || 'Saves'}</em>
					</button>
				{/each}
				<button
					id={`source-picker-control-${sourcePickerCards.length}`}
					data-source-picker-control
					type="button"
					class="source-card import-row"
					onfocus={() => (sourcePickerFocusIndex = sourcePickerCards.length)}
					onclick={openImportFromSourcePicker}
				>
					<span>IMPORT</span>
					<strong>Import Save File</strong>
					<em>Add to Saves and open it as a pane.</em>
				</button>
			</div>
		</div>
	</div>
{/if}

{#if activeSummonedWorkflow?.kind === 'pokemon-editor' && pokemonEditor}
	{#key pokemonEditorDraftResetKey(pokemonEditor)}
		<TakeoverFrame
			labelledby="pokemon-editor-title"
			describedby="pokemon-editor-status"
			{busy}
			onBack={requestClosePokemonEditor}
		>
			<PokemonEditor
				editor={pokemonEditor}
				mode={pokemonCreation ? 'create' : 'edit'}
				{saveSummary}
				spriteUrl={spriteUrlFor(pokemonEditor.slot)}
				slotHueStyle={slotStyle(pokemonEditor.slot, activePaneBox)}
				feedback={pokemonEditorFeedback}
				applying={busy}
				pendingScratch={pokemonEditorScratchWorkspace !== null && pokemonCreation === null}
				session={pokemonEditorSession}
				initialDraft={pokemonEditorDraft}
				speciesFormProjection={pokemonSpeciesFormProjection}
				speciesFormLoading={pokemonSpeciesFormLoading}
				speciesFormError={pokemonSpeciesFormError}
				onDraftChange={rememberPokemonEditorDraft}
				onFocusChange={rememberPokemonEditorFocus}
				onSelectSection={choosePokemonEditorSection}
				onShowReview={showPokemonEditorDeltaReview}
				onKeepEditing={keepEditingPokemonEditor}
				onDiscard={discardPokemonEditorEdits}
				onOpenLegality={openPokemonEditorLegalityReport}
				onPreviewSpeciesForm={previewPokemonSpeciesFormEdit}
				onApply={applyPokemonEditor}
				onCancelEdits={cancelPokemonEditorEdits}
				onClose={requestClosePokemonEditor}
			/>
		</TakeoverFrame>
	{/key}
{/if}

{#if activeSummonedWorkflow?.kind === 'pokemon-actions' && pokemonAction.status !== 'idle'}
	<TakeoverFrame
		labelledby="pokemon-action-title"
		busy={pokemonAction.status === 'applying'}
		onBack={backPokemonActions}
	>
		<PokemonActionDialog
			state={pokemonAction}
			onSelect={selectPokemonActionPreview}
			onClearSelection={clearPokemonActionPreview}
			onApply={applySelectedPokemonAction}
			onClose={backPokemonActions}
		/>
	</TakeoverFrame>
{/if}

{#if activeSummonedWorkflow?.kind === 'clear-slot-confirmation' && clearSlotConfirmation}
	<ClearSlotConfirm
		location={clearSlotConfirmation.location}
		pokemonLabel={clearSlotConfirmation.pokemonLabel}
		sourceLabel={clearSlotConfirmation.sourceOwner.label}
		activeIndex={clearSlotConfirmFocusIndex}
		applying={busy}
		onFocusCommand={setClearSlotCommandFocus}
		onCancel={cancelClearSlot}
		onConfirm={confirmClearSlot}
	/>
{/if}

{#if activeSummonedWorkflow?.kind === 'legality-report' && legalityReport.status !== 'idle'}
	<TakeoverFrame
		labelledby="legality-report-title"
		busy={legalityReport.status === 'loading' || pokemonAction.status === 'applying'}
		onBack={backLegalityReport}
	>
		<LegalityReportDialog
			state={legalityReport}
			actionState={pokemonAction}
			onQuickFix={(fixId, launcherId) =>
				selectPokemonActionPreview('legality-fix', fixId, launcherId)}
			onCancelQuickFix={clearPokemonActionPreview}
			onApplyQuickFix={applySelectedPokemonAction}
			onClose={closeLegalityReport}
		/>
	</TakeoverFrame>
{/if}

<ToastRegion {toasts} onDismiss={dismissToast} />

<style>
	.source-picker-import {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}

	:global(html),
	:global(body) {
		margin: 0;
		background: var(--pksx-color-surface-canvas);
		color: var(--pksx-color-text-primary);
		font-family: var(--pksx-font-sans);
		font-weight: 500;
	}

	:global(.app-shell:has(.boxes-route)) {
		height: 100dvh;
		overflow: hidden;
	}

	@media (min-width: 1025px) {
		:global(html),
		:global(body) {
			height: 100%;
			overflow: hidden;
		}
	}

	:global(strong) {
		font-weight: 650;
	}

	button {
		border: 0;
		font: inherit;
		cursor: pointer;
	}

	.status-announcer {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}

	.boxes-route {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 0;
		display: flex;
		container: boxes-route pksx-density / size;
		overflow: hidden;
	}

	.storage-workspace {
		flex: 1 1 auto;
		width: auto;
		height: auto;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-areas:
			'panes'
			'rail';
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: minmax(334px, 1fr) minmax(150px, 260px);
		align-items: stretch;
		justify-content: center;
		gap: var(--pksx-space-1);
		overflow: auto;
	}

	.storage-workspace.two-pane {
		--two-pane-detail-size: clamp(56px, calc(20cqw - 68px), 260px);
		grid-template-areas:
			'leading'
			'trailing';
		grid-template-rows: repeat(2, minmax(0, 1fr));
		margin-inline: auto;
	}

	.box-pane-strip {
		grid-area: panes;
		min-width: 0;
		min-height: 0;
		display: flex;
		align-items: stretch;
		gap: var(--pksx-space-1);
		overflow: auto hidden;
		scroll-snap-type: x proximity;
	}

	.two-pane .box-pane-strip {
		display: contents;
	}

	.two-pane .box-pane:first-child {
		grid-area: leading;
	}

	.two-pane .box-pane:last-child {
		grid-area: trailing;
	}

	.box-pane-strip.single-pane {
		justify-content: center;
		overflow: hidden;
	}

	.box-pane {
		container: box-pane / size;
		flex: 0 0 min(640px, 100%);
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-rows: var(--pksx-control-height) minmax(0, 1fr);
		gap: var(--pksx-space-1);
		padding: var(--pksx-space-1);
		border-radius: var(--pksx-radius-large);
		background: var(--paper-hi);
		box-shadow: var(--shadow-deep);
		color: var(--ink);
		scroll-snap-align: start;
	}

	.single-pane .box-pane {
		flex-basis: min(800px, 100%);
		max-width: 800px;
	}

	.two-pane .box-pane {
		max-width: 640px;
		justify-self: center;
	}

	.two-pane .location-grid {
		align-content: start;
	}

	.box-pane:not(.active-pane) {
		background: color-mix(in srgb, var(--paper-hi), var(--paper-deep) 42%);
		box-shadow: var(--shadow-sm);
	}

	.pane-header {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--pksx-space-1);
	}

	.pane-source-row {
		flex: 1 1 33%;
		max-width: 33%;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--pksx-space-1);
	}

	.source-chip {
		width: 100%;
		min-width: 0;
		height: var(--pksx-control-height);
		display: inline-flex;
		align-items: center;
		gap: var(--pksx-space-1);
		padding: 0 var(--pksx-space-2);
		border-radius: var(--pksx-radius-medium);
		background: var(--paper);
		box-shadow: inset 0 0 0 var(--pksx-border-width) var(--rule);
		color: var(--ink);
		text-align: left;
	}

	.source-chip span,
	.pane-busy {
		flex: 0 0 auto;
		font: 750 var(--pksx-type-caption) / 1.05 var(--pksx-font-mono);
	}

	.source-chip span {
		color: var(--rust);
	}

	.source-chip strong {
		min-width: 0;
		max-width: 18ch;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--pksx-type-label);
	}

	.source-chip em {
		color: var(--ink-soft);
		font-style: normal;
	}

	.pane-busy {
		color: var(--rust);
	}

	.pane-close {
		flex: 0 0 auto;
		width: var(--pksx-small-control-height);
		height: var(--pksx-small-control-height);
		padding: 0;
		border-radius: var(--pksx-radius-small);
		background: var(--paper);
		box-shadow: inset 0 0 0 var(--pksx-border-width) var(--rule);
		color: var(--ink-soft);
		font-size: var(--pksx-type-title);
		font-weight: 800;
	}

	.location-header {
		min-width: 0;
		flex: 1 1 67%;
		display: flex;
	}

	.location-grid {
		--slot-size: max(
			var(--pksx-slot-minimum),
			min(
				calc((100cqw - var(--pksx-border-width) * 5) / 6),
				calc(
					(
							100cqh - var(--pksx-control-height) - var(--pksx-space-unit) -
								var(--pksx-border-width) * 4
						) /
						5
				)
			)
		);
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(6, var(--slot-size));
		grid-template-rows: repeat(5, var(--slot-size));
		align-content: safe center;
		justify-content: safe center;
		gap: var(--pksx-border-width);
		padding: 0;
		overflow: auto;
		outline: none;
	}

	.location-grid.party-grid {
		--slot-size: max(
			var(--pksx-slot-minimum),
			min(
				112px,
				calc((100cqw - var(--pksx-border-width) * 2) / 3),
				calc(
					(
							100cqh - var(--pksx-control-height) - var(--pksx-space-unit) -
								var(--pksx-border-width)
						) /
						2
				)
			)
		);
		grid-template-columns: repeat(3, var(--slot-size));
		grid-template-rows: repeat(2, var(--slot-size));
	}

	.slot-row {
		display: contents;
	}

	.slot-cell {
		position: relative;
		width: var(--slot-size);
		height: var(--slot-size);
		min-width: 0;
		min-height: 0;
	}

	.slot-cell.selected {
		z-index: 2;
	}

	.shared-detail {
		grid-area: rail;
		width: 100%;
		max-width: 260px;
		height: 100%;
		min-width: 0;
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--pksx-space-1);
		justify-self: center;
		overflow: hidden;
	}

	.two-pane .shared-detail {
		display: none;
		max-width: 260px;
	}

	.two-pane .shared-detail :global(.detail-heading h2) {
		font-size: var(--pksx-type-title);
	}

	.transfer-controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--pksx-space-1);
	}

	.transfer-controls button {
		min-width: 0;
		height: var(--pksx-control-height);
		padding: 0 var(--pksx-space-2);
		border-radius: var(--pksx-radius-medium);
		background: var(--rust);
		color: var(--paper-hi);
		font: 800 var(--pksx-type-label) / 1 var(--pksx-font-sans);
	}

	.transfer-controls button:disabled {
		opacity: 0.45;
	}

	.shared-detail :global(.detail-rail) {
		width: 100%;
		height: 100%;
		overflow: auto;
	}

	@container boxes-route (orientation: landscape) {
		.storage-workspace {
			grid-template-areas: 'panes rail';
			grid-template-columns: minmax(360px, 800px) minmax(150px, 260px);
			grid-template-rows: minmax(0, 1fr);
		}

		.storage-workspace.two-pane {
			width: 100%;
			max-width: calc(1280px + 260px + var(--pksx-space-1) * 2);
			grid-template-areas: 'leading rail trailing';
			grid-template-columns: minmax(0, 640px) var(--two-pane-detail-size) minmax(0, 640px);
			grid-template-rows: minmax(0, 1fr);
		}

		.two-pane .box-pane:last-child .pane-header {
			padding-right: calc(var(--pksx-control-height) + var(--pksx-space-2));
		}

		.two-pane .location-grid {
			align-content: safe center;
		}

		.shared-detail {
			max-width: 260px;
		}

		.two-pane .shared-detail {
			display: grid;
		}
	}

	@container boxes-route (orientation: landscape) and (max-width: 1250px) {
		.storage-workspace.two-pane {
			grid-template-areas: 'leading trailing';
			grid-template-columns: repeat(2, minmax(0, 640px));
		}

		.two-pane .shared-detail {
			display: none;
		}
	}

	.source-picker-backdrop {
		position: fixed;
		inset: 0;
		z-index: 500;
		display: grid;
		place-items: center;
		padding: 18px;
		background: color-mix(in srgb, var(--ink), transparent 55%);
	}

	.source-picker {
		width: min(780px, 100%);
		max-height: min(760px, 92vh);
		display: flex;
		flex-direction: column;
		gap: 14px;
		padding: 16px;
		overflow: auto;
		border-radius: var(--pksx-radius-xl);
		background: var(--paper-hi);
		box-shadow: var(--shadow-deep);
		color: var(--ink);
	}

	.source-picker header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.source-picker h2,
	.source-picker p {
		margin: 0;
	}

	.source-picker h2 {
		font-size: 1.3rem;
	}

	.source-picker p {
		color: var(--ink-soft);
		font-size: 0.82rem;
	}

	.source-picker header button {
		padding: 7px 10px;
		border-radius: var(--pksx-radius-sm);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--rule);
		color: var(--ink);
		font-weight: 750;
	}

	.source-picker button:focus {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 48%);
		outline-offset: 2px;
	}

	.source-card-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 10px;
	}

	.source-card {
		min-height: 118px;
		display: grid;
		align-content: start;
		gap: 8px;
		padding: 12px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper);
		box-shadow:
			inset 0 0 0 1px var(--rule),
			var(--shadow-sm);
		color: var(--ink);
		text-align: left;
	}

	.source-card.app-owned {
		background: color-mix(in srgb, var(--gold), var(--paper-hi) 78%);
	}

	.source-card.import-row {
		border: 1px dashed var(--rule-hi);
		background: transparent;
		box-shadow: none;
	}

	.source-card span {
		color: var(--rust);
		font:
			800 0.58rem var(--pksx-font-mono),
			monospace;
	}

	.source-card strong {
		font-size: 1rem;
	}

	.source-card em {
		color: var(--ink-soft);
		font-style: normal;
		font-size: 0.76rem;
		line-height: 1.35;
	}
</style>
