<script lang="ts">
	import { asset } from '$app/paths';
	import { page } from '$app/state';
	import { onDestroy, onMount, tick } from 'svelte';
	import {
		type EngineApi,
		type EngineError,
		type PokemonEditOperation,
		type StoredPokemonActionResult,
		type PokemonEditOperationResult,
		type PokemonSpeciesFormEditProjection,
		type SaveSlotRef,
		type SlotOperation
	} from '$lib/engine';
	import {
		applyNavigationAction,
		BOX_COLUMNS,
		BOX_SLOT_COUNT,
		createInitialNavigationState,
		focusBoxSlot,
		focusPaneBoundarySlot,
		focusPaneControl,
		focusPartySlot,
		focusPartyToggle,
		getBoxSlotPosition,
		getFocusId,
		PARTY_SLOT_COUNT,
		selectActiveBox,
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
	import { appChrome, updateAppChrome } from '$lib/pksx/app-chrome.svelte';
	import {
		addBoxPane,
		applyPokemonStorageSlotOperation,
		closeBoxPane,
		createBoxPane,
		createSourcePickerCards,
		destinationStateForEvaluation,
		evaluateDestination,
		refreshSaveFilePaneWorkspaces,
		focusSurvivingPaneAfterClose,
		getStoragePokemon,
		putStoragePokemon,
		removeStoragePokemon,
		setPaneActiveBox,
		setPaneFocus,
		stateTagForPane,
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
	import BoxSidebar from '$lib/components/pksx/BoxSidebar.svelte';
	import BoxMenu from '$lib/components/pksx/BoxMenu.svelte';
	import BoxSourceControls from '$lib/components/pksx/BoxSourceControls.svelte';
	import ClearSlotConfirm from '$lib/components/pksx/ClearSlotConfirm.svelte';
	import DetailRail from '$lib/components/pksx/DetailRail.svelte';
	import LegalityReportDialog from '$lib/components/pksx/LegalityReportDialog.svelte';
	import PokemonActionDialog from '$lib/components/pksx/PokemonActionDialog.svelte';
	import PokemonCreation from '$lib/components/pksx/PokemonCreation.svelte';
	import PokemonEditor from '$lib/components/pksx/PokemonEditor.svelte';
	import SlotActionMenu from '$lib/components/pksx/SlotActionMenu.svelte';
	import StatusStrip from '$lib/components/pksx/StatusStrip.svelte';
	import StorageSlot from '$lib/components/pksx/StorageSlot.svelte';
	import ToastRegion from '$lib/components/pksx/ToastRegion.svelte';
	import type { BoxNavItem, BoxSourceView, SlotView } from '$lib/components/pksx/types';
	import {
		createPokemonCreationOperation,
		pokemonCreationAvailability,
		type PokemonCreationDraft
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
		createLegalityReportLoadingState,
		requestLegalityReport,
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
		briefToolbarStatus,
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
	const topControlCount = 7;
	const mobileTabCount = 3;

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

	function boxHue(box: number): number {
		return slotPalette[box % slotPalette.length];
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
	let importError = $state<string | null>(null);
	let statusMessage = $state('Import a Save File to begin.');
	let busy = $state(false);
	let initialStateReady = $state(false);
	let pokemonCreation = $state<PokemonCreationView | null>(null);
	let pokemonCreationFeedback = $state<string | null>(null);
	let pokemonCreationRequest = 0;
	let pokemonEditor = $state<PokemonEditorState | null>(null);
	let pokemonEditorFeedback = $state<string | null>(null);
	let pokemonEditorApplyRequest = 0;
	let pokemonSpeciesFormProjection = $state<PokemonSpeciesFormEditProjection | null>(null);
	let pokemonSpeciesFormError = $state<string | null>(null);
	let pokemonSpeciesFormLoading = $state(false);
	let pokemonSpeciesFormRequest = 0;
	let legalityReport = $state<LegalityReportState>({ status: 'idle' });
	let legalityReportRequest = 0;
	let pokemonAction = $state<PokemonActionState>({ status: 'idle' });
	let pokemonActionRequest = 0;
	let pokemonActionContext = $state<PokemonActionContext | null>(null);
	let partyCollapsed = $state(false);
	let viewportWidth = $state(1024);
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
	let workspacePublicationRequest = 0;
	let paneSwitchRequest = 0;
	let destroyed = false;

	const controllerConnected = $derived(appChrome.controllerStatus !== null);
	const activeSummonedWorkflow = $derived(summonedWorkflow.active);
	const sourcePickerOpen = $derived(activeSummonedWorkflow?.kind === 'source-picker');
	const slotMenuOpen = $derived(activeSummonedWorkflow?.kind === 'slot-menu');
	const boxMenuOpen = $derived(activeSummonedWorkflow?.kind === 'box-menu');
	const destinationInputSuspended = $derived(isDestinationInputSuspended(summonedWorkflow));
	const summonedSlotLauncher = $derived(getLaunchingSlot(summonedWorkflow));
	const mobileTabsAvailable = $derived(viewportWidth <= 1024);
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
	const activePaneBoxCount = $derived(activePane?.boxCount ?? placeholderBoxCount);
	const partyAvailable = $derived(loadedSave !== null);
	const partySlots = $derived(
		loadedSave ? createPartySlotViews(loadedSave.workspace.partySlots) : placeholderPartySlots
	);
	const activeBoxSlots = $derived(paneBoxSlots(activePane, activePaneBox));
	const activeFocusId = $derived(getFocusId(navigation.focus, activePaneBox));
	const activeSlotFocus = $derived<SlotFocus | null>(
		sourcePickerOpen
			? null
			: (navigation.focus.zone === 'party' && partyAvailable) || navigation.focus.zone === 'box'
				? navigation.focus
				: summonedSlotLauncher && (summonedSlotLauncher.focus.zone !== 'party' || partyAvailable)
					? summonedSlotLauncher.focus
					: null
	);
	const navigationFocusedSlot = $derived(
		activeSlotFocus === null
			? noSelectedSlot
			: activeSlotFocus.zone === 'party'
				? (partySlots[activeSlotFocus.slot] ?? noSelectedSlot)
				: (activeBoxSlots[activeSlotFocus.slot] ?? noSelectedSlot)
	);
	const summonedSlot = $derived(
		summonedSlotLauncher?.focus.zone === 'party'
			? (partySlots[summonedSlotLauncher.focus.slot] ?? noSelectedSlot)
			: summonedSlotLauncher?.focus.zone === 'box' && summonedSlotBox !== null
				? (paneBoxSlots(summonedSlotPane, summonedSlotBox)[summonedSlotLauncher.focus.slot] ??
					noSelectedSlot)
				: null
	);
	const focusedSlot = $derived(summonedSlot ?? navigationFocusedSlot);
	const focusedSlotPane = $derived(summonedSlotLauncher ? summonedSlotPane : activePane);
	const focusedSlotOwner = $derived(
		activeSlotFocus?.zone === 'party'
			? saveFileSource(loadedSave)
			: (focusedSlotPane?.source ?? pokemonStorageSource())
	);
	const createPokemonAvailability = $derived(
		pokemonCreationAvailability(
			focusedSlotOwner.type,
			focusedSlot,
			loadedSave !== null &&
				(activeSlotFocus?.zone === 'party' ||
					(focusedSlotOwner.type === 'save-file' && focusedSlotOwner.id === loadedSave.file.id))
		)
	);
	const slotMenuCommands = $derived(
		createSlotMenuCommands(focusedSlot, createPokemonAvailability.reason)
	);
	const saveSummary = $derived(loadedSave?.workspace.summary ?? null);
	const boxIndices = $derived(Array.from({ length: activePaneBoxCount }, (_, index) => index));
	const boxNavItems = $derived<BoxNavItem[]>(
		boxIndices.map((index) => ({
			index,
			name: boxNameFor(index),
			hue: boxHue(index),
			active: index === activePaneBox,
			occupied:
				index === activePaneBox
					? activeBoxSlots.filter((slot) => slot.kind === 'pokemon').length
					: null
		}))
	);
	const activeBoxSource = $derived<BoxSourceView>({
		key: activePane?.source.type ?? 'pokemon-storage',
		label: activePane?.source.label ?? 'Pokemon Storage',
		activeBoxLabel: boxNameFor(activePaneBox),
		activeBoxNumber: activePaneBox + 1,
		boxCount: activePaneBoxCount,
		occupied: activeBoxSlots.filter((slot) => slot.kind === 'pokemon').length,
		capacity: BOX_SLOT_COUNT
	});
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
	const multiPaneWorkbench = $derived(workbenchPanes.length > 1);
	const activePaneControlCount = $derived(activePane ? paneControlCountFor(activePane) : 0);
	const toolbarStatus = $derived.by(() => {
		if (busy) return 'Working';
		if (carryState) return carryStatusLabel(carryState);
		if (sourcePickerOpen) return 'Choose collection';
		if (importError) return 'Import failed';
		if (loadedSave?.dirty) return 'Unsaved edits';
		if (loadedSave?.restoredFromBackup) return 'Backup restored';

		return briefToolbarStatus(statusMessage, activePane?.source.type ?? 'pokemon-storage');
	});
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
			route: 'boxes',
			saveSummary,
			boxCount: activePaneBoxCount,
			activeBox: activePaneBox,
			fileName: loadedSave?.file.originalFileName ?? null,
			busy,
			hasLoadedSave: loadedSave !== null,
			controllerInputActive: true,
			importSave: (file) => void importSaveFile(file),
			exportSave: exportLoadedSave
		});

		return () => {
			updateAppChrome({ controllerInputActive: false });
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
			case 'pokemon-creation':
				dispatchPokemonCreation(action);
				return true;
			case 'pokemon-actions':
				dispatchPokemonAction(action);
				return true;
			case 'pokemon-editor':
				dispatchPokemonEditor(action);
				return true;
			case 'legality-report':
				if (action === 'back' || action === 'confirm') closeLegalityReport();
				return true;
		}

		if (pendingSlotOperation && action === 'back') {
			cancelPendingSlotOperation();
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
			topControlCount,
			paneControlCount: activePaneControlCount,
			mobileTabCount,
			mobileTabsAvailable,
			partyAvailable,
			partyCollapsed
		});

		if (action === 'confirm') {
			activateFocusedControl(previousFocus);
		}

		if (pane && navigation.activeBox !== previousBox) {
			workbenchPanes = setPaneActiveBox(workbenchPanes, pane.id, navigation.activeBox);
		}
		if (pane && isSlotFocus(navigation.focus)) {
			workbenchPanes = setPaneFocus(workbenchPanes, pane.id, navigation.focus);
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

		if (navigation.focus.zone === 'party') {
			const savePane = workbenchPanes.find(({ id }) => id === activeSavePaneId);
			if (savePane) openBoxMenu(savePane);
			return;
		}

		if (navigation.focus.zone === 'box' || navigation.focus.zone === 'paneControls') {
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
		if ((action !== 'left' && action !== 'right') || navigation.focus.zone !== 'box') {
			return false;
		}

		const position = getBoxSlotPosition(navigation.focus.slot);
		const atPaneEdge =
			(action === 'left' && position.column === 0) ||
			(action === 'right' && position.column === BOX_COLUMNS - 1);
		if (!atPaneEdge || workbenchPanes.length <= 1) {
			return false;
		}

		const currentIndex = workbenchPanes.findIndex((pane) => pane.id === activePaneId);
		const nextIndex =
			action === 'left'
				? Math.max(0, currentIndex - 1)
				: Math.min(workbenchPanes.length - 1, currentIndex + 1);
		const nextPane = workbenchPanes[nextIndex];
		if (!nextPane || nextPane.id === activePaneId) {
			return false;
		}

		activatePane(nextPane);
		navigation = {
			...navigation,
			activeBox: nextPane.activeBox,
			boxCount: Math.max(1, nextPane.boxCount),
			focus: focusPaneBoundarySlot(navigation.focus.slot, action)
		};
		workbenchPanes = setPaneFocus(workbenchPanes, nextPane.id, navigation.focus as SlotFocus);
		return true;
	}

	async function focusActiveControl() {
		await tick();
		document.getElementById(focusIdForNavigation(navigation.focus))?.focus();
	}

	function focusIdForNavigation(focus: ControllerFocus) {
		if (focus.zone !== 'paneControls') return getFocusId(focus, activePaneBox);
		return focus.index === 0 ? collectionControlId(activePaneId) : `close-pane-${activePaneId}`;
	}

	function dispatchPokemonEditor(action: NavigationAction) {
		if (changeFocusedPokemonEditorSelect(action)) {
			return;
		}

		switch (action) {
			case 'left':
			case 'up':
				focusPokemonEditorControl(-1);
				break;
			case 'right':
			case 'down':
				focusPokemonEditorControl(1);
				break;
			case 'confirm':
				activatePokemonEditorControl();
				break;
			case 'back':
				closePokemonEditor();
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
				break;
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
				if (
					(pokemonAction.status === 'ready' || pokemonAction.status === 'applying') &&
					pokemonAction.selection
				) {
					clearPokemonActionPreview();
				} else {
					closePokemonActions();
				}
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
				break;
		}
	}

	function dispatchPokemonCreation(action: NavigationAction) {
		switch (action) {
			case 'left':
			case 'up':
				focusPokemonCreationControl(-1);
				break;
			case 'right':
			case 'down':
				focusPokemonCreationControl(1);
				break;
			case 'confirm':
				activatePokemonCreationControl();
				break;
			case 'back':
				closePokemonCreation();
				break;
			case 'previousBox':
			case 'nextBox':
			case 'sourceAction':
				break;
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

	function pokemonCreationControls() {
		return [
			'#pokemon-creation-close',
			'#pokemon-creation-species',
			'#pokemon-creation-level',
			'#pokemon-creation-cancel',
			'#pokemon-creation-apply'
		]
			.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
			.filter((control) => {
				if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement) {
					return !control.disabled;
				}
				return true;
			});
	}

	function focusPokemonCreationControl(direction: -1 | 1) {
		const controls = pokemonCreationControls();
		if (controls.length === 0) return;

		const activeElement = document.activeElement;
		const currentIndex =
			activeElement instanceof HTMLElement ? controls.indexOf(activeElement) : -1;
		const nextIndex =
			currentIndex >= 0
				? (currentIndex + direction + controls.length) % controls.length
				: direction > 0
					? 0
					: controls.length - 1;
		controls[nextIndex]?.focus();
	}

	function activatePokemonCreationControl() {
		const activeElement = document.activeElement;
		if (activeElement instanceof HTMLButtonElement && !activeElement.disabled) {
			activeElement.click();
			return;
		}

		if (activeElement instanceof HTMLInputElement) {
			focusPokemonCreationControl(1);
		}
	}

	function pokemonEditorControls() {
		const openCombobox = document.querySelector<HTMLElement>(
			'.pokemon-editor [data-combobox-open="true"]'
		);
		if (openCombobox) {
			return Array.from(
				openCombobox.querySelectorAll<HTMLElement>('input, [data-combobox-option]')
			).filter((control) => control.getClientRects().length > 0);
		}

		return [
			'#pokemon-editor-close',
			'.species-form-controls select:not([disabled])',
			'#pokemon-editor-nickname',
			'#pokemon-editor-nature',
			'#pokemon-editor-held-item',
			'#pokemon-editor-ability',
			'#pokemon-editor-met-location',
			'#pokemon-editor-met-level',
			'#pokemon-editor-origin-game',
			'#pokemon-editor-ball',
			'#pokemon-editor-met-date',
			'.trainer-edit-controls input:not([disabled]), .trainer-edit-controls select:not([disabled])',
			'.battle-field-controls select:not([disabled])',
			'#pokemon-editor-mode',
			'.level-edit-controls input:not([disabled])',
			'.stat-edit-controls input:not([disabled])',
			'.move-edit-controls .pksx-combobox-trigger:not([disabled]), .move-edit-controls input:not([disabled])',
			'#pokemon-editor-apply',
			'#pokemon-editor-cancel',
			'#pokemon-editor-close-footer'
		]
			.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
			.filter((control) => {
				if (
					control instanceof HTMLButtonElement ||
					control instanceof HTMLInputElement ||
					control instanceof HTMLSelectElement
				) {
					return !control.disabled;
				}
				return true;
			});
	}

	function changeFocusedPokemonEditorSelect(action: NavigationAction) {
		const select = document.activeElement;
		if (
			!(select instanceof HTMLSelectElement) ||
			!select.closest('.pokemon-editor') ||
			(action !== 'left' && action !== 'right' && action !== 'confirm')
		) {
			return false;
		}

		const options = Array.from(select.options).filter((option) => !option.disabled);
		if (options.length === 0) {
			return true;
		}

		const current = Math.max(
			0,
			options.findIndex((option) => option.value === select.value)
		);
		const direction = action === 'left' ? -1 : 1;
		const next = options[(current + direction + options.length) % options.length];
		if (!next) {
			return true;
		}

		select.value = next.value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	}

	function focusPokemonEditorControl(direction: -1 | 1) {
		const controls = pokemonEditorControls();
		if (controls.length === 0) {
			return;
		}

		const activeElement = document.activeElement;
		const currentIndex =
			activeElement instanceof HTMLElement ? controls.indexOf(activeElement) : -1;
		const nextIndex =
			currentIndex >= 0
				? (currentIndex + direction + controls.length) % controls.length
				: direction > 0
					? 0
					: controls.length - 1;

		const control = controls[nextIndex];
		control.focus();
		control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
			focusPokemonEditorControl(1);
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

		const topControlMatch = activeElement.id.match(/^top-control-(\d+)$/);
		if (topControlMatch) {
			navigation = {
				...navigation,
				focus: { zone: 'topbar', index: Number(topControlMatch[1]) }
			};
			return;
		}

		if (activeElement.id === 'party-toggle') {
			navigation = { ...navigation, focus: focusPartyToggle() };
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

		const mobileTabMatch = activeElement.id.match(/^mobile-tab-(\d+)$/);
		if (mobileTabMatch) {
			navigation = {
				...navigation,
				focus: { zone: 'mobileTabs', index: Number(mobileTabMatch[1]) }
			};
			return;
		}

		const partySlotMatch = activeElement.id.match(/^party-slot-(\d+)$/);
		if (partySlotMatch) {
			navigation = {
				...navigation,
				focus: focusPartySlot(Number(partySlotMatch[1]))
			};
			return;
		}

		const boxSlotMatch = activeElement.id.match(/^box-\d+-slot-(\d+)$/);
		if (boxSlotMatch) {
			navigation = {
				...navigation,
				focus: focusBoxSlot(Number(boxSlotMatch[1]))
			};
		}
	}

	function focusParty(slot: number) {
		navigation = { ...navigation, focus: focusPartySlot(slot) };
		workbenchPanes = setPaneFocus(workbenchPanes, activePaneId, navigation.focus as SlotFocus);
		queueMicrotask(focusActiveControl);
	}

	function focusBox(slot: number) {
		navigation = { ...navigation, focus: focusBoxSlot(slot) };
		workbenchPanes = setPaneFocus(workbenchPanes, activePaneId, navigation.focus as SlotFocus);
		queueMicrotask(focusActiveControl);
	}

	function togglePartyCollapsed() {
		partyCollapsed = !partyCollapsed;
		if (partyCollapsed && navigation.focus.zone === 'party') {
			navigation = { ...navigation, focus: focusPartyToggle() };
			queueMicrotask(focusActiveControl);
		}
	}

	function firstRowFocusForBoxChange(): SlotFocus {
		if (activeSlotFocus?.zone !== 'box') {
			return { zone: 'box', slot: 0 };
		}

		return { zone: 'box', slot: getBoxSlotPosition(activeSlotFocus.slot).column };
	}

	function selectBox(index: number) {
		const pane = activePane;
		if (!pane) {
			return;
		}

		const previousBox = pane.activeBox;
		const nextBox = Math.max(0, Math.min(index, Math.max(1, pane.boxCount) - 1));
		workbenchPanes = setPaneActiveBox(workbenchPanes, pane.id, nextBox);
		navigation = {
			...selectActiveBox({ ...navigation, boxCount: Math.max(1, pane.boxCount) }, nextBox),
			focus: firstRowFocusForBoxChange()
		};
		workbenchPanes = setPaneFocus(workbenchPanes, pane.id, navigation.focus as SlotFocus);

		if (
			loadedSave &&
			pane.source.type === 'save-file' &&
			pane.source.id === loadedSave.file.id &&
			nextBox !== previousBox
		) {
			void loadWorkspaceForSave(loadedSave, nextBox);
		}

		if (pane.source.type === 'save-file' && pane.source.id !== loadedSave?.file.id) {
			void refreshPaneWorkspace(pane.id, nextBox);
		}

		queueMicrotask(focusActiveControl);
	}

	function selectPaneBox(pane: BoxPaneState, index: number) {
		const nextBox = Math.max(0, Math.min(index, Math.max(1, pane.boxCount) - 1));
		workbenchPanes = setPaneActiveBox(workbenchPanes, pane.id, nextBox);
		if (pane.id === activePaneId) {
			navigation = {
				...selectActiveBox({ ...navigation, boxCount: Math.max(1, pane.boxCount) }, nextBox),
				focus: firstRowFocusForBoxChange()
			};
			workbenchPanes = setPaneFocus(workbenchPanes, pane.id, navigation.focus as SlotFocus);
			if (loadedSave && pane.source.type === 'save-file' && pane.source.id === loadedSave.file.id) {
				void loadWorkspaceForSave(loadedSave, nextBox);
			}
		}

		if (pane.source.type === 'save-file' && pane.source.id !== loadedSave?.file.id) {
			void refreshPaneWorkspace(pane.id, nextBox);
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
		navigation = { ...navigation, focus: { zone: 'actions', index: 0 } };
		queueMicrotask(focusActiveControl);
	}

	function openRelatedWorkflow(kind: SummonedWorkflowKind) {
		const launcherFocus = navigation.focus;
		summonedWorkflow.openRelated(kind, controlLauncher(getFocusId(launcherFocus, activePaneBox)));
	}

	function dismissActiveWorkflow() {
		const launcher = summonedWorkflow.dismiss();
		if (!launcher) return;
		if (launcher.type === 'slot') {
			const pane = workbenchPanes.find(({ id }) => id === launcher.paneId);
			if (pane) {
				activePaneId = pane.id;
				navigation = {
					...navigation,
					activeBox: launcher.box ?? pane.activeBox,
					boxCount: pane.boxCount,
					focus: launcher.focus
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
			return partySlots[ref.slot] ?? null;
		}

		if (pane?.source.type === 'pokemon-storage') {
			return storageSlotForRef(ref);
		}

		return paneBoxSlots(pane, ref.box)[ref.slot] ?? null;
	}

	function paneForParty(): BoxPaneState | undefined {
		if (!loadedSave) {
			return undefined;
		}

		const activeSaveFileId = loadedSave.file.id;
		return (
			workbenchPanes.find((pane) => pane.id === activeSavePaneId) ??
			workbenchPanes.find(
				(pane) => pane.source.type === 'save-file' && pane.source.id === activeSaveFileId
			)
		);
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

		const destinationPane = ref.zone === 'party' ? paneForParty() : pane;

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
			partyCount: loadedSave?.workspace.summary.partyCount ?? 0
		});
	}

	function isInvalidPartyAppendDestination(ref: SaveSlotRef, slot: SlotView | null): boolean {
		return (
			ref.zone === 'party' &&
			slot?.kind === 'empty' &&
			loadedSave !== null &&
			ref.slot > loadedSave.workspace.summary.partyCount
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
		const ownerPane = destination.zone === 'party' ? paneForParty() : destinationPane;
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

		if (isInvalidPartyAppendDestination(destination, destinationSlot)) {
			showToast('error', 'That Party Slot cannot be used yet.');
			statusMessage = 'That Party Slot cannot be used yet.';
			return;
		}

		if (ownerPane?.source.type === 'pokemon-storage') {
			await applySaveToStorageOperation(pending, destination, ownerPane);
			return;
		}

		if (
			carryState?.sourceOwner.type === 'save-file' &&
			(ownerPane?.source.id !== loadedSave?.file.id ||
				carryState.sourceOwner.id !== loadedSave?.file.id)
		) {
			showToast('error', 'Moving Pokemon between Save Files needs engine transfer support.');
			statusMessage = 'Cross-save movement is not available yet.';
			return;
		}

		if (carryState?.sourceOwner.type === 'pokemon-storage') {
			await applyStorageToSaveOperation(pending, destination, ownerPane);
			return;
		}

		await applySlotOperation({ kind: pending.kind, source: pending.source, destination });
	}

	async function applyStorageToSaveOperation(
		pending: PendingStorageSlotOperation,
		destination: SaveSlotRef,
		destinationPane: BoxPaneState | undefined
	) {
		if (!loadedSave || !engine) {
			showToast('error', 'Load a Save File before changing Slots.');
			return;
		}

		if (
			destinationPane?.source.type !== 'save-file' ||
			destinationPane.source.id !== loadedSave.file.id
		) {
			showToast('error', 'Moving Pokemon between Save Files needs engine transfer support.');
			statusMessage = 'Cross-save movement is not available yet.';
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
		const operationBox = destination.zone === 'box' ? destination.box : activePaneBox;
		busy = true;
		importError = null;

		try {
			let workingState = loadedSave;
			if (shouldCreateAutomaticBackup(workingState)) {
				statusMessage = 'Creating Backup...';
				await storage.createBackup({
					saveFileId: workingState.file.id,
					bytes: workingState.bytes,
					reason: 'pokemon-movement'
				});
				workingState = markAutomaticBackupCreated(workingState);
				loadedSave = workingState;
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

			loadedSave = nextState;
			const refreshedSavePanes = refreshSaveFilePaneWorkspaces(
				workbenchPanes,
				savePaneWorkspaces,
				nextState,
				operationBox
			);
			workbenchPanes = refreshedSavePanes.panes;
			savePaneWorkspaces = refreshedSavePanes.workspaces;
			setCachedActiveWorkspace(nextState, operationBox);
			invalidateSavesCache();
			pendingSlotOperation = null;
			carryState = null;
			navigation = {
				...navigation,
				activeBox: destination.zone === 'box' ? destination.box : operationBox,
				boxCount: Math.max(1, result.value.workspace.summary.boxCount),
				focus:
					destination.zone === 'party'
						? focusPartySlot(destination.slot)
						: focusBoxSlot(destination.slot)
			};
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
			if (destination.zone === 'box') {
				workbenchPanes = setPaneActiveBox(workbenchPanes, destinationPane.id, destination.box);
			}
			navigation = {
				...navigation,
				activeBox: destination.zone === 'box' ? destination.box : activePaneBox,
				focus:
					destination.zone === 'party'
						? focusPartySlot(destination.slot)
						: focusBoxSlot(destination.slot)
			};
			statusMessage =
				pending.kind === 'move'
					? `Moved ${sourceSlot.label} to Pokemon Storage.`
					: `Copied ${sourceSlot.label} to Pokemon Storage.`;
			showToast('success', statusMessage);
			queueMicrotask(focusActiveControl);
			return;
		}

		if (pending.kind === 'move') {
			await applySlotOperation({ kind: 'clear', source: pending.source });
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
			const refreshedSavePanes = refreshSaveFilePaneWorkspaces(
				workbenchPanes,
				savePaneWorkspaces,
				nextState,
				operationBox
			);
			workbenchPanes = refreshedSavePanes.panes;
			savePaneWorkspaces = refreshedSavePanes.workspaces;
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
			navigation = {
				...navigation,
				activeBox: focusRef.zone === 'box' ? focusRef.box : operationBox,
				boxCount: Math.max(1, result.state.workspace.summary.boxCount),
				focus:
					focusRef.zone === 'party' ? focusPartySlot(focusRef.slot) : focusBoxSlot(focusRef.slot)
			};
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
		const sourcePaneId =
			source.zone === 'party' ? activeSavePaneId : (activePane?.id ?? activePaneId);
		const sourceOwner =
			source.zone === 'party'
				? saveFileSource(loadedSave)
				: (activePane?.source ?? saveFileSource(loadedSave));
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
			sourceLabel: locationForSlotRef(source),
			origin: {
				entryMode: kind === 'copy' ? 'copied-in' : 'moved-in',
				originSaveFileName: loadedSave?.file.originalFileName ?? null,
				originGame: loadedSave?.workspace.summary.gameVersion ?? null,
				originalTrainer: slot.originalTrainer ?? loadedSave?.workspace.summary.trainerName ?? null,
				trainerId: null,
				enteredAt: new Date().toISOString()
			}
		};
		pokemonEditorApplyRequest += 1;
		pokemonEditor = null;
		pokemonEditorFeedback = null;
		const sourceFocus = summonedSlotLauncher?.focus ?? activeSlotFocus ?? focusBoxSlot(0);
		summonedWorkflow.closeAll();
		navigation = {
			...navigation,
			focus: sourceFocus
		};
		queueMicrotask(focusActiveControl);
	}

	function cancelPendingSlotOperation() {
		if (!pendingSlotOperation) {
			return;
		}

		const source = pendingSlotOperation.source;
		pendingSlotOperation = null;
		carryState = null;
		navigation = {
			...navigation,
			focus: source.zone === 'party' ? focusPartySlot(source.slot) : focusBoxSlot(source.slot)
		};
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
		const sourceOwner =
			source.zone === 'party'
				? saveFileSource(loadedSave)
				: (sourcePane?.source ?? pokemonStorageSource());
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
		navigation = {
			...navigation,
			activeBox: pending.source.zone === 'box' ? pending.source.box : navigation.activeBox,
			focus:
				pending.source.zone === 'party'
					? focusPartySlot(pending.source.slot)
					: focusBoxSlot(pending.source.slot)
		};
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
		const workspace =
			pending.source.zone === 'party' ? loadedSave : (saveWorkspaceForPane(pane)?.state ?? null);
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
		if (focus.zone === 'topbar') {
			document.getElementById(`top-control-${focus.index}`)?.click();
		}

		if (focus.zone === 'partyToggle') {
			document.getElementById('party-toggle')?.click();
		}

		if (focus.zone === 'paneControls') {
			document.getElementById(focusIdForNavigation(focus))?.click();
		}

		if (focus.zone === 'mobileTabs') {
			document.getElementById(`mobile-tab-${focus.index}`)?.click();
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
		const fixedPane = createBoxPane(activeSavePaneId, saveFileSource(save), {
			boxCount: save.workspace.summary.boxCount,
			activeBox: clampedBox
		});
		const hadActiveSavePane = workbenchPanes.some((pane) => pane.id === activeSavePaneId);
		const rightPanes = hadActiveSavePane
			? workbenchPanes.filter(
					(pane) =>
						pane.id !== activeSavePaneId &&
						!(pane.source.type === 'save-file' && pane.source.id === save.file.id)
				)
			: [];

		workbenchPanes = [fixedPane, ...rightPanes];
		savePaneWorkspaces = {
			...savePaneWorkspaces,
			[activeSavePaneId]: { state: save, loadedBox: clampedBox }
		};
		activePaneId = activeSavePaneId;
		navigation = selectActiveBox(
			createInitialNavigationState(save.workspace.summary.boxCount),
			clampedBox
		);
	}

	function openSourcePicker(targetPaneId: string | null = null) {
		if (pendingSlotOperation || targetPaneId === activeSavePaneId || activeSummonedWorkflow) {
			return;
		}

		const launcherFocus = navigation.focus;
		sourcePickerTargetPaneId = targetPaneId;
		sourcePickerFocusIndex = 0;
		summonedWorkflow.open('source-picker', launcherForFocus(launcherFocus));
		queueMicrotask(() => focusSourcePickerControl(0));
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
		workbenchPanes = addBoxPane(workbenchPanes, source, {
			id,
			boxCount: type === 'pokemon-storage' ? pokemonStorageBoxCount : boxCount
		});
		const openedPane = workbenchPanes.find((pane) => pane.id === id);
		activePaneId = id;
		navigation = {
			...navigation,
			boxCount: Math.max(1, type === 'pokemon-storage' ? pokemonStorageBoxCount : boxCount),
			activeBox: openedPane?.activeBox ?? 0,
			focus: openedPane?.focus ?? focusBoxSlot(0)
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
			focus: switchedPane?.focus ?? focusBoxSlot(0)
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
		if (paneId === activeSavePaneId) {
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
						partyAvailable,
						partyCollapsed
					})
				: { zone: 'box', slot: 0 };
			activePaneId = nextPane?.id ?? 'pane-pokemon-storage';
			navigation = {
				...navigation,
				activeBox: nextPane?.activeBox ?? 0,
				boxCount: Math.max(1, nextPane?.boxCount ?? placeholderBoxCount),
				focus: nextFocus
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
				focus: pane.focus
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

	function saveWorkspaceForPane(pane: BoxPaneState | undefined): SavePaneWorkspace | null {
		if (!pane || pane.source.type !== 'save-file') {
			return null;
		}

		const cached = savePaneWorkspaces[pane.id];
		if (cached?.state.file.id === pane.source.id) {
			return cached;
		}

		if (loadedSave && pane.source.id === loadedSave.file.id && pane.id === activePaneId) {
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
			case 'pokemon-actions':
				void openPokemonActions();
				break;
			default:
				break;
		}
	}

	async function openPokemonActions() {
		const activeEngine = engine;
		if (
			activeSummonedWorkflow?.kind !== 'slot-menu' ||
			focusedSlot.kind !== 'pokemon' ||
			!activeEngine
		) {
			return;
		}

		const source = slotRefForFocus();
		const location = activeSlotPositionLabel;
		let context: PokemonActionContext | null = null;

		if (source.zone === 'party') {
			if (loadedSave) {
				context = {
					target: {
						owner: 'save-file',
						workspace: loadedSave,
						source,
						activeBox: activePaneBox
					},
					storageRef: null
				};
			}
		} else if (activePane?.source.type === 'pokemon-storage') {
			if (focusedSlot.entityBytesBase64) {
				context = {
					target: {
						owner: 'pokemon-storage',
						entityBytesBase64: focusedSlot.entityBytesBase64
					},
					storageRef: source
				};
			}
		} else {
			const paneWorkspace = saveWorkspaceForPane(activePane);
			if (paneWorkspace) {
				context = {
					target: {
						owner: 'save-file',
						workspace: paneWorkspace.state,
						source,
						activeBox: activePaneBox
					},
					storageRef: null
				};
			}
		}

		if (!context) {
			statusMessage = 'Pokemon Actions are unavailable for this source.';
			showToast('error', statusMessage);
			return;
		}

		const request = (pokemonActionRequest += 1);
		pokemonActionContext = context;
		pokemonAction = createPokemonActionLoadingState(location, focusedSlot.label);
		openRelatedWorkflow('pokemon-actions');
		statusMessage = 'Loading Pokemon Actions...';

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
			statusMessage = result.error.message;
			showToast('error', result.error.message);
			return;
		}

		pokemonAction = createPokemonActionReadyState(location, focusedSlot.label, result.value);
		statusMessage = `Pokemon Actions ready for ${focusedSlot.label}.`;
		await tick();
		focusPokemonActionControl(0);
	}

	function selectPokemonActionPreview(kind: 'legality-fix' | 'evolve', choiceId?: string) {
		if (pokemonAction.status !== 'ready') {
			return;
		}

		pokemonAction = selectPokemonAction(pokemonAction, kind, choiceId);
		void tick().then(() => document.getElementById('pokemon-action-apply')?.focus());
	}

	function clearPokemonActionPreview() {
		if (pokemonAction.status !== 'ready') {
			return;
		}

		pokemonAction = clearPokemonActionSelection(pokemonAction);
		void tick().then(() => focusPokemonActionControl(0));
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

		pokemonAction = { ...pokemonAction, status: 'applying' };
		busy = true;
		statusMessage = 'Applying Pokemon Action...';
		const request = pokemonActionRequest;

		try {
			const result = await applyPokemonAction(activeEngine, context.target, operation, {
				createAutomaticBackup: async (state, reason) => {
					statusMessage = 'Creating Backup...';
					await storage.createBackup({
						saveFileId: state.file.id,
						bytes: state.bytes,
						reason
					});
					statusMessage = 'Applying Pokemon Action...';
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
				statusMessage = result.error.message;
				showToast('error', result.error.message);
				return;
			}

			if (result.owner === 'save-file') {
				installPokemonActionWorkspace(result.workspace, context.target);
				refreshPokemonActionContextWorkspace(context, result.workspace);
			}

			const actionLabel = operation.kind === 'legality-fix' ? 'Legality Fix' : 'Evolution';
			statusMessage = `${actionLabel} applied.`;
			showToast('success', statusMessage);
			if (request === pokemonActionRequest) {
				resetPokemonActions();
			}
		} catch (error) {
			const message = getErrorMessage(error);
			if (request !== pokemonActionRequest) {
				return;
			}
			if (pokemonAction.status === 'applying') {
				pokemonAction = { ...pokemonAction, status: 'ready' };
			}
			statusMessage = message;
			showToast('error', message);
		} finally {
			busy = false;
		}
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

	function installPokemonActionWorkspace(nextState: WorkspaceState, target: PokemonActionTarget) {
		if (target.owner !== 'save-file') {
			return;
		}

		if (loadedSave?.file.id === nextState.file.id) {
			loadedSave = nextState;
			setCachedActiveWorkspace(nextState, target.activeBox);
			invalidateSavesCache();
		}

		const refreshed = refreshSaveFilePaneWorkspaces(
			workbenchPanes,
			savePaneWorkspaces,
			nextState,
			target.activeBox
		);
		workbenchPanes = refreshed.panes;
		savePaneWorkspaces = refreshed.workspaces;
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

	function closePokemonActions() {
		if (busy || pokemonAction.status === 'applying') {
			return;
		}

		resetPokemonActions();
	}

	function resetPokemonActions() {
		pokemonActionRequest += 1;
		pokemonAction = { status: 'idle' };
		pokemonActionContext = null;
		dismissActiveWorkflow();
	}

	function openPokemonCreation() {
		if (activeSummonedWorkflow?.kind !== 'slot-menu' || focusedSlot.kind !== 'empty') {
			return;
		}

		if (!createPokemonAvailability.available) {
			statusMessage = createPokemonAvailability.reason;
			showToast('error', createPokemonAvailability.reason);
			return;
		}

		pokemonCreationRequest += 1;
		pokemonCreation = {
			destination: slotRefForFocus(),
			location: activeSlotPositionLabel
		};
		pokemonCreationFeedback = null;
		openRelatedWorkflow('pokemon-creation');
		void tick().then(() =>
			requestAnimationFrame(() => document.getElementById('pokemon-creation-close')?.focus())
		);
	}

	function closePokemonCreation() {
		if (busy) return;

		pokemonCreationRequest += 1;
		pokemonCreation = null;
		pokemonCreationFeedback = null;
		dismissActiveWorkflow();
	}

	async function applyPokemonCreation(draft: PokemonCreationDraft) {
		const view = pokemonCreation;
		if (!view) return;

		const operation = createPokemonCreationOperation(view.destination, draft);
		if (!operation.ok) {
			pokemonCreationFeedback = operation.reason;
			statusMessage = operation.reason;
			return;
		}

		const activeEngine = engine;
		let workingState = loadedSave;
		if (!workingState) {
			pokemonCreationFeedback = 'Load a Save File before creating Pokemon.';
			return;
		}
		if (!activeEngine) {
			pokemonCreationFeedback = 'The PKHeX Engine is not ready.';
			return;
		}
		if (slotForRef(view.destination)?.kind !== 'empty') {
			pokemonCreationFeedback = 'Create Pokemon needs an empty destination Slot.';
			return;
		}

		busy = true;
		pokemonCreationFeedback = 'Creating Pokemon...';
		const request = (pokemonCreationRequest += 1);

		try {
			if (shouldCreateAutomaticBackup(workingState)) {
				statusMessage = 'Creating Backup...';
				await storage.createBackup({
					saveFileId: workingState.file.id,
					bytes: workingState.bytes,
					reason: 'pokemon-creation'
				});
				workingState = markAutomaticBackupCreated(workingState);
				loadedSave = workingState;
			}

			statusMessage = 'Creating Pokemon...';
			const result = await activeEngine.createPokemon(
				workingState.bytes,
				workingState.file.originalFileName ?? undefined,
				operation.operation,
				activePaneBox
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

			loadedSave = nextState;
			const refreshedSavePanes = refreshSaveFilePaneWorkspaces(
				workbenchPanes,
				savePaneWorkspaces,
				nextState,
				activePaneBox
			);
			workbenchPanes = refreshedSavePanes.panes;
			savePaneWorkspaces = refreshedSavePanes.workspaces;
			setCachedActiveWorkspace(nextState, activePaneBox);
			invalidateSavesCache();

			const createdSlot = slotViewForRefFromWorkspace(
				nextState.workspace,
				operation.operation.destination
			);
			const message = createdSlot
				? `${createdSlot.label} created in ${view.location}.`
				: `Pokemon created in ${view.location}.`;
			if (request === pokemonCreationRequest) {
				pokemonCreation = null;
				pokemonCreationFeedback = null;
				summonedWorkflow.closeAll();
				navigation = {
					...navigation,
					focus:
						view.destination.zone === 'party'
							? focusPartySlot(view.destination.slot)
							: focusBoxSlot(view.destination.slot)
				};
				statusMessage = message;
				showToast('success', message);
				queueMicrotask(focusActiveControl);
			}
		} catch (error) {
			const message = getErrorMessage(error);
			if (request === pokemonCreationRequest) {
				pokemonCreationFeedback = message;
				statusMessage = 'Create Pokemon failed.';
				showToast('error', message);
			}
		} finally {
			if (request === pokemonCreationRequest) {
				busy = false;
				queueMicrotask(() => document.getElementById('pokemon-creation-apply')?.focus());
			}
		}
	}

	function openPokemonEditor() {
		if (activeSummonedWorkflow?.kind !== 'slot-menu' || focusedSlot.kind !== 'pokemon') {
			return;
		}

		const result = createPokemonEditorState(
			{
				owner: 'save-file',
				saveFileId: loadedSave?.file.id ?? null,
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
		pokemonEditorFeedback = null;
		openRelatedWorkflow('pokemon-editor');
		pokemonSpeciesFormProjection = null;
		pokemonSpeciesFormError = null;
		void previewPokemonSpeciesFormEdit({
			speciesId: result.state.slot.speciesId ?? 0,
			form: result.state.slot.form ?? 0
		});
		void tick().then(focusPokemonEditorClose);
	}

	function closePokemonEditor() {
		pokemonEditorApplyRequest += 1;
		pokemonEditor = null;
		pokemonEditorFeedback = null;
		pokemonSpeciesFormRequest += 1;
		pokemonSpeciesFormProjection = null;
		pokemonSpeciesFormError = null;
		pokemonSpeciesFormLoading = false;
		dismissActiveWorkflow();
	}

	async function openLegalityReport() {
		if (activeSummonedWorkflow?.kind !== 'slot-menu') {
			return;
		}

		const request = (legalityReportRequest += 1);
		const slot = focusedSlot;
		const source = slotRefForFocus();
		const location = activeSlotPositionLabel;
		legalityReport = createLegalityReportLoadingState(slot, location);
		openRelatedWorkflow('legality-report');
		statusMessage = 'Checking Pokemon legality...';

		const result = await requestLegalityReport({
			workspace: loadedSave,
			engine,
			slot,
			source,
			location
		});

		if (request !== legalityReportRequest) {
			return;
		}

		legalityReport = result.state;
		if (result.state.status === 'ready') {
			statusMessage = `Legality Check complete for ${result.state.pokemonLabel}.`;
			return;
		}

		if (result.state.status === 'error' || result.state.status === 'unavailable') {
			statusMessage = result.state.message;
		}

		if (result.state.status === 'error') {
			showToast('error', result.state.message);
		}
	}

	function closeLegalityReport() {
		legalityReportRequest += 1;
		legalityReport = { status: 'idle' };
		dismissActiveWorkflow();
	}

	function focusPokemonEditorClose() {
		document.getElementById('pokemon-editor-close')?.focus();
	}

	function focusPokemonEditorApply() {
		const apply = document.getElementById('pokemon-editor-apply');
		if (apply instanceof HTMLButtonElement && !apply.disabled) {
			apply.focus();
			return;
		}

		focusPokemonEditorClose();
	}

	function cancelPokemonEditorEdits() {
		if (!pokemonEditor) {
			return;
		}

		pokemonEditor = cancelPokemonEditor(pokemonEditor);
		pokemonEditorFeedback = null;
		void previewPokemonSpeciesFormEdit({
			speciesId: pokemonEditor.slot.speciesId ?? 0,
			form: pokemonEditor.slot.form ?? 0
		});
		queueMicrotask(focusPokemonEditorApply);
	}

	async function previewPokemonSpeciesFormEdit(target: { speciesId: number; form: number }) {
		const editor = pokemonEditor;
		const activeEngine = engine;
		const workingState = loadedSave;
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

	async function verifyPokemonEditorSource(
		state: PokemonEditorState
	): Promise<PokemonEditorSourceVerification> {
		return {
			ok:
				state.source.owner === 'save-file' &&
				isSamePokemonEditorSourceIdentity(state, slotForRef(state.source.slotRef))
		};
	}

	async function validatePokemonEditor(state: PokemonEditorState) {
		const operation = createPokemonEditOperation(state);
		return operation.ok ? ({ ok: true } as const) : operation;
	}

	async function ensurePokemonEditorBackup() {
		if (!loadedSave) return saveFileUnavailable();
		if (!shouldCreateAutomaticBackup(loadedSave)) return { ok: true } as const;

		statusMessage = 'Creating Backup...';
		await storage.createBackup({
			saveFileId: loadedSave.file.id,
			bytes: loadedSave.bytes,
			reason: 'pokemon-editing'
		});
		loadedSave = markAutomaticBackupCreated(loadedSave);
		return { ok: true } as const;
	}

	async function mutateSaveFilePokemon(
		state: PokemonEditorState
	): Promise<PokemonEditorMutationResult> {
		const operation = createPokemonEditOperation(state);
		if (!operation.ok) return operation;
		if (!loadedSave) return saveFileUnavailable();
		if (!engine) return engineUnavailable();

		statusMessage = 'Applying Pokemon edits...';
		const workingState = loadedSave;
		const mutation = await engine.applyPokemonEditOperation(
			workingState.bytes,
			workingState.file.originalFileName ?? undefined,
			operation.operation,
			activePaneBox
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
		loadedSave = nextState;
		const refreshed = refreshSaveFilePaneWorkspaces(
			workbenchPanes,
			savePaneWorkspaces,
			nextState,
			activePaneBox
		);
		workbenchPanes = refreshed.panes;
		savePaneWorkspaces = refreshed.workspaces;
		setCachedActiveWorkspace(nextState, activePaneBox);
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

	function handleWindowResize() {
		if (viewportWidth > 1024 && navigation.focus.zone === 'mobileTabs') {
			navigation = { ...navigation, focus: focusBoxSlot(BOX_SLOT_COUNT - BOX_COLUMNS + 1) };
			queueMicrotask(focusActiveControl);
		}
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
			if (initialStateReady && adoptAsActiveSave) {
				installActiveSavePane(state, getCachedActiveWorkspaceBox());
				queueMicrotask(focusActiveControl);
				return;
			}
			void refreshPublishedSavePanes(state);
		});
		engine = getPkhexEngine();
		void restoreInitialState();
		return unsubscribe;
	});

	onDestroy(() => {
		destroyed = true;
		if (summonedWorkflow.active?.kind !== 'backup-browser') summonedWorkflow.closeAll();
	});

	async function refreshPublishedSavePanes(state: WorkspaceState) {
		const request = ++workspacePublicationRequest;
		const publishedBox = getCachedActiveWorkspaceBox();
		const panes = workbenchPanes.filter(
			(pane) => pane.source.type === 'save-file' && pane.source.id === state.file.id
		);
		const projections: Record<string, SavePaneWorkspace> = {};

		await Promise.all(
			panes.map(async (pane) => {
				if (pane.activeBox === publishedBox) {
					projections[pane.id] = { state, loadedBox: publishedBox };
					return;
				}
				const paneState = await loadWorkspaceStateForSaveFile(state.file.id, pane.activeBox);
				if (paneState) {
					projections[pane.id] = { state: paneState, loadedBox: pane.activeBox };
				}
			})
		);
		if (request !== workspacePublicationRequest) return;

		const refreshed = refreshSaveFilePaneWorkspaces(
			workbenchPanes,
			savePaneWorkspaces,
			state,
			(pane) => {
				const projection = projections[pane.id];
				return projection?.loadedBox === pane.activeBox ? projection : null;
			}
		);
		workbenchPanes = refreshed.panes;
		savePaneWorkspaces = refreshed.workspaces;
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
		} finally {
			busy = false;
		}
	}

	async function loadWorkspaceForSave(save: WorkspaceState, box: number) {
		const request = (workspaceLoadRequest += 1);
		busy = true;
		importError = null;

		try {
			const workspace = await loadWorkspace(
				save.bytes,
				save.file.originalFileName ?? undefined,
				box
			);
			if (
				request === workspaceLoadRequest &&
				activePaneBox === box &&
				loadedSave?.file.id === save.file.id
			) {
				loadedSave = { ...save, workspace };
				savePaneWorkspaces = {
					...savePaneWorkspaces,
					[activePaneId]: { state: loadedSave, loadedBox: box }
				};
				setCachedActiveWorkspace(loadedSave, box);
			}
		} catch (error) {
			if (request === workspaceLoadRequest) {
				importError = getErrorMessage(error);
			}
		} finally {
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

		if (loadedSave && pane.source.id === loadedSave.file.id && pane.id === activePaneId) {
			savePaneWorkspaces = {
				...savePaneWorkspaces,
				[paneId]: { state: loadedSave, loadedBox: box }
			};
			return;
		}

		try {
			const state = await loadWorkspaceStateForSaveFile(pane.source.id, box);
			if (!state) {
				return;
			}

			savePaneWorkspaces = {
				...savePaneWorkspaces,
				[paneId]: { state, loadedBox: box }
			};
			workbenchPanes = workbenchPanes.map((candidate) =>
				candidate.id === paneId && candidate.source.type === 'save-file'
					? {
							...candidate,
							boxCount: state.workspace.summary.boxCount,
							source: {
								...candidate.source,
								label: state.file.originalFileName ?? candidate.source.label,
								dirty: state.dirty
							}
						}
					: candidate
			);
		} catch (error) {
			showToast('error', getErrorMessage(error));
			statusMessage = 'Could not load that Save File pane.';
		}
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
			}
		} finally {
			if (request === workspaceLoadRequest) {
				busy = false;
			}
		}
	}

	async function exportLoadedSave() {
		if (!loadedSave) {
			return;
		}

		busy = true;
		importError = null;
		statusMessage = 'Serializing Save File...';

		try {
			const activeEngine = engine;
			if (!activeEngine) {
				throw new Error('The PKHeX Engine is not ready.');
			}

			const bytes = await workspaceService.exportBytes(loadedSave);
			downloadBytes(bytes, createExportFileName(loadedSave.file.originalFileName));
			statusMessage = 'Export ready.';
		} catch (error) {
			importError = getErrorMessage(error);
			statusMessage = 'Export failed.';
		} finally {
			busy = false;
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

	function carryStatusLabel(carry: CarryState) {
		const action = carry.mode === 'move' ? 'Move' : 'Copy';
		const label =
			carry.pokemonLabel.length > 18 ? `${carry.pokemonLabel.slice(0, 15)}...` : carry.pokemonLabel;
		return `${action} ${label}`;
	}
</script>

<svelte:head>
	<title>PKSX</title>
</svelte:head>

<svelte:window
	bind:innerWidth={viewportWidth}
	onkeydown={handleAppKeydown}
	onresize={handleWindowResize}
/>

<div class="status-announcer" role="status" aria-live="polite">{toolbarStatus}</div>

<section
	class="boxes-route"
	aria-label="Boxes workspace"
	data-initial-state={initialStateReady ? 'ready' : 'loading'}
	data-active-save-file-id={loadedSave?.file.id ?? ''}
	inert={destinationInputSuspended}
>
	{#if importError}
		<StatusStrip variant="error" label="Import error" message={importError} />
	{/if}

	<section class="storage-workspace" aria-label="Party and box storage">
		<BoxSidebar
			boxes={boxNavItems}
			boxSlotCount={BOX_SLOT_COUNT}
			sourceLabel={activePane?.source.label ?? 'Pokemon Storage'}
			sourceKind={activePane?.source.type ?? 'pokemon-storage'}
			onSelectBox={selectBox}
		/>

		<div class="workspace-column">
			<div class="workbench-toolbar" aria-label="Collection panes">
				<div class="single-source-label">
					<strong
						>{multiPaneWorkbench
							? 'Collections'
							: (activePane?.source.label ?? 'Save File')}</strong
					>
				</div>
				<div class={['toolbar-status-strip', carryState && 'carry-status']}>
					{toolbarStatus}
				</div>
				<button
					id="top-control-5"
					class="add-source-button"
					class:controller-focused={navigation.focus.zone === 'topbar' &&
						navigation.focus.index === 5}
					type="button"
					onfocus={() => (navigation = { ...navigation, focus: { zone: 'topbar', index: 5 } })}
					onclick={() => openSourcePicker()}>Add collection</button
				>
			</div>

			{#if partyAvailable}
				<div
					id="party-grid"
					class={['party-zone', partyCollapsed && 'collapsed']}
					role="grid"
					tabindex="0"
					aria-label="Party"
					aria-activedescendant={navigation.focus.zone === 'party' ? activeFocusId : undefined}
					aria-rowcount={PARTY_SLOT_COUNT}
					aria-colcount="1"
				>
					<div class="zone-header party-header">
						<button
							id="party-toggle"
							class="party-toggle"
							class:controller-focused={navigation.focus.zone === 'partyToggle'}
							type="button"
							aria-expanded={!partyCollapsed}
							aria-controls="party-list"
							onfocus={() => (navigation = { ...navigation, focus: focusPartyToggle() })}
							onclick={togglePartyCollapsed}
						>
							<span class="party-chevron" aria-hidden="true">▾</span>
							<strong>Party</strong>
							<span class="party-meta">6 / 6 · on hand · {partyCollapsed ? 'show' : 'hide'}</span>
						</button>
					</div>
					<div id="party-list" class="party-list">
						{#each partySlots as slot (slot.slot)}
							{@const partyRef = { zone: 'party' as const, slot: slot.slot }}
							<div
								class={['slot-cell', isFocused('party', slot.slot) && 'selected']}
								role="row"
								aria-hidden={partyCollapsed ? 'true' : undefined}
							>
								<StorageSlot
									id={`party-slot-${slot.slot}`}
									{slot}
									zone="party"
									focused={isFocused('party', slot.slot)}
									dualType={slotHasDualType(slot, -1)}
									style={slotStyle(slot, -1)}
									rowIndex={slot.slot + 1}
									colIndex={1}
									spriteUrl={spriteUrlFor(slot)}
									collapsed={partyCollapsed}
									destinationState={destinationStateFor(partyRef, slot)}
									onFocusSlot={() => focusParty(slot.slot)}
									onChooseSlot={pendingSlotOperation
										? () => {
												void completePendingSlotOperation(partyRef);
											}
										: undefined}
								/>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<div
				class="box-pane-strip"
				class:single-pane={workbenchPanes.length === 1}
				class:many-panes={workbenchPanes.length >= 3}
			>
				{#each workbenchPanes as pane (pane.id)}
					{@const paneActive = pane.id === activePaneId}
					{@const paneFixed = pane.id === activeSavePaneId}
					{@const paneControlCount = paneControlCountFor(pane)}
					{@const paneBox = pane.activeBox}
					{@const paneSlots = paneBoxSlots(pane, paneBox)}
					<div
						id={paneActive ? 'box-grid' : `box-grid-${pane.id}`}
						class={['box-zone', paneActive && 'active-pane']}
						role="grid"
						tabindex={paneActive ? 0 : -1}
						aria-label={`${pane.source.label} ${boxNameFor(paneBox)}`}
						aria-activedescendant={paneActive && navigation.focus.zone === 'box'
							? activeFocusId
							: undefined}
						aria-rowcount="5"
						aria-colcount={BOX_COLUMNS}
						onfocus={() => activatePane(pane)}
						onfocusin={() => {
							if (!pendingSlotOperation && pane.id !== activePaneId) activatePane(pane);
						}}
					>
						{#if paneControlCount > 0 || workbenchPanes.length > 1}
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
											focus: focusPaneControl(0, paneControlCount)
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
								{#if stateTagForPane(pane)}
									<span class="pane-state-tag">{stateTagForPane(pane)}</span>
								{/if}
								{#if !paneFixed && workbenchPanes.length > 1}
									<button
										id={`close-pane-${pane.id}`}
										data-pane-control-index="1"
										type="button"
										class="pane-close"
										aria-label={`Close ${pane.source.label} pane`}
										onfocus={() => {
											activatePane(pane);
											navigation = {
												...navigation,
												focus: focusPaneControl(1, paneControlCount)
											};
										}}
										onclick={() => closePane(pane.id)}
									>
										×
									</button>
								{/if}
							</div>
						{/if}
						<div class="zone-header box-header">
							<BoxSourceControls
								source={{
									...activeBoxSource,
									key: pane.source.type,
									label: pane.source.label,
									activeBoxLabel: boxNameFor(paneBox),
									activeBoxNumber: paneBox + 1,
									boxCount:
										pane.source.type === 'pokemon-storage' ? pokemonStorageBoxCount : boxCount,
									occupied: paneSlots.filter((slot) => slot.kind === 'pokemon').length
								}}
								onPreviousBox={() => {
									selectPaneBox(pane, paneBox - 1);
								}}
								onNextBox={() => {
									selectPaneBox(pane, paneBox + 1);
								}}
							/>
						</div>
						<div class="filter-row" aria-hidden="true">
							<span>{pane.source.type === 'pokemon-storage' ? 'storage' : 'workspace'}</span>
							<span>sort · slot</span>
							<span>{pane.source.type === 'pokemon-storage' ? 'auto-saved' : 'local'}</span>
						</div>
						<div class="box-grid">
							{#each paneSlots as slot (slot.slot)}
								{@const position = getBoxSlotPosition(slot.slot)}
								{@const boxRef = { zone: 'box' as const, box: paneBox, slot: slot.slot }}
								<div class={['slot-cell', paneActive && isFocused('box', slot.slot) && 'selected']}>
									<StorageSlot
										id={paneActive
											? `box-${paneBox}-slot-${slot.slot}`
											: `${pane.id}-box-${paneBox}-slot-${slot.slot}`}
										{slot}
										zone="box"
										focused={paneActive && isFocused('box', slot.slot)}
										dualType={slotHasDualType(slot, paneBox)}
										style={slotStyle(slot, paneBox)}
										rowIndex={position.row + 1}
										colIndex={position.column + 1}
										spriteUrl={spriteUrlFor(slot)}
										destinationState={pendingSlotOperation
											? destinationStateFor(boxRef, slot, pane)
											: null}
										onFocusSlot={() => {
											activatePane(pane);
											focusBox(slot.slot);
										}}
										onChooseSlot={pendingSlotOperation
											? () => {
													activatePane(pane);
													void completePendingSlotOperation(boxRef, pane);
												}
											: undefined}
									/>
								</div>
							{/each}
						</div>
						<div class="box-footer">
							{#if controllerConnected || pendingSlotOperation}
								<span><kbd>A</kbd> {pendingSlotOperation ? 'Place here' : 'Pick'}</span>
								{#if pendingSlotOperation}<span><kbd>Y</kbd> Move / Copy</span>{/if}
								<span><kbd>B</kbd> {pendingSlotOperation ? 'Cancel' : 'Back'}</span>
							{/if}
							<strong>
								{#if paneActive && activeSlotFocus?.zone === 'box'}
									{@const pos = getBoxSlotPosition(activeSlotFocus.slot)}
									SLOT {activeSlotFocus.slot + 1} · ROW {String.fromCharCode(65 + pos.row)} / COL
									{pos.column + 1}
								{:else}
									{pane.source.label}
								{/if}
							</strong>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<DetailRail
			{focusedSlot}
			focusZone={activeSlotFocus?.zone ?? null}
			focusSlot={activeSlotFocus?.slot ?? null}
			slotHueStyle={slotStyle(focusedSlot, activePaneBox)}
			spriteUrl={spriteUrlFor(focusedSlot)}
			{saveSummary}
			activeBoxName={boxNameFor(activePaneBox)}
			positionLabel={carryState
				? `${activeSlotPositionLabel} · ${carryState.mode === 'move' ? 'Drop' : 'Copy'} target`
				: activeSlotPositionLabel}
		/>
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

{#if activeSummonedWorkflow?.kind === 'pokemon-creation' && pokemonCreation}
	<PokemonCreation
		location={pokemonCreation.location}
		feedback={pokemonCreationFeedback}
		applying={busy}
		onApply={applyPokemonCreation}
		onClose={closePokemonCreation}
	/>
{/if}

{#if activeSummonedWorkflow?.kind === 'pokemon-editor' && pokemonEditor}
	{#key pokemonEditorDraftResetKey(pokemonEditor)}
		<PokemonEditor
			editor={pokemonEditor}
			{saveSummary}
			spriteUrl={spriteUrlFor(pokemonEditor.slot)}
			slotHueStyle={slotStyle(pokemonEditor.slot, activePaneBox)}
			feedback={pokemonEditorFeedback}
			applying={busy}
			speciesFormProjection={pokemonSpeciesFormProjection}
			speciesFormLoading={pokemonSpeciesFormLoading}
			speciesFormError={pokemonSpeciesFormError}
			onPreviewSpeciesForm={previewPokemonSpeciesFormEdit}
			onApply={applyPokemonEditor}
			onCancelEdits={cancelPokemonEditorEdits}
			onClose={closePokemonEditor}
		/>
	{/key}
{/if}

{#if activeSummonedWorkflow?.kind === 'pokemon-actions' && pokemonAction.status !== 'idle'}
	<PokemonActionDialog
		state={pokemonAction}
		onSelect={selectPokemonActionPreview}
		onClearSelection={clearPokemonActionPreview}
		onApply={applySelectedPokemonAction}
		onClose={closePokemonActions}
	/>
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
	<LegalityReportDialog state={legalityReport} onClose={closeLegalityReport} />
{/if}

<ToastRegion {toasts} onDismiss={dismissToast} />

<style>
	:global(html),
	:global(body) {
		margin: 0;
		background: var(--pksx-color-surface-canvas);
		color: var(--pksx-color-text-primary);
		font-family: var(--pksx-font-sans);
		font-weight: 500;
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
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.storage-workspace {
		flex: 1 1 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: 158px minmax(0, 1fr) 304px;
		align-items: stretch;
		gap: 12px;
		padding: 0;
		overflow: visible;
		background: transparent;
		box-shadow: none;
	}

	.workspace-column {
		position: relative;
		z-index: 10;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-x: hidden;
		overflow-y: auto;
	}

	.workbench-toolbar {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 10px;
		padding: 8px 14px 8px 8px;
		border-radius: var(--pksx-radius-lg);
		background: transparent;
		box-shadow: none;
	}

	.add-source-button {
		margin-left: auto;
		flex: 0 0 auto;
		min-height: 30px;
		padding: 6px 9px;
		border-radius: var(--pksx-radius-sm);
		background: var(--paper);
		color: var(--ink);
		box-shadow: inset 0 0 0 1px var(--rule);
		font-size: 0.72rem;
		font-weight: 750;
	}

	.add-source-button {
		background: var(--rust);
		color: white;
		box-shadow: var(--shadow-sm);
	}

	.add-source-button.controller-focused,
	.add-source-button:focus-visible,
	.add-source-button:focus {
		outline: 3px solid var(--gold);
		outline-offset: 3px;
		box-shadow:
			0 0 0 2px var(--paper-hi),
			0 0 0 6px color-mix(in srgb, var(--rust), transparent 8%),
			var(--shadow);
	}

	.single-source-label {
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--ink-soft);
		font-size: 0.76rem;
	}

	.single-source-label strong {
		color: var(--ink);
	}

	.toolbar-status-strip {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 4px 7px;
		border-radius: var(--pksx-radius-sm);
		background: color-mix(in srgb, var(--paper-hi), var(--gold) 18%);
		box-shadow: inset 0 0 0 1px var(--rule);
		color: var(--ink-soft);
		font:
			750 0.58rem var(--pksx-font-mono),
			monospace;
	}

	.toolbar-status-strip.carry-status {
		background: color-mix(in srgb, var(--ok), var(--paper-hi) 76%);
		color: var(--ink);
	}

	.party-zone,
	.box-zone {
		min-width: 0;
		min-height: 0;
		padding: 12px;
		border: 0;
		border-radius: var(--pksx-radius-xl);
		background: var(--paper-hi);
		box-shadow: var(--shadow-deep);
		color: var(--ink);
		outline: none;
	}

	.box-zone {
		flex: 1 1 auto;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		overflow-x: hidden;
		overflow-y: auto;
	}

	.party-zone {
		flex: 0 0 auto;
		overflow: visible;
	}

	.box-pane-strip {
		flex: 1 1 auto;
		min-height: 0;
		display: flex;
		align-items: stretch;
		gap: 12px;
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: 4px;
		scroll-snap-type: x proximity;
	}

	.box-pane-strip.single-pane {
		display: block;
		overflow-x: visible;
		overflow-y: hidden;
		padding-bottom: 0;
	}

	.box-pane-strip.many-panes {
		padding-right: 2px;
	}

	.box-pane-strip .box-zone {
		flex: 0 0 min(520px, 100%);
		border-radius: var(--pksx-radius-lg);
		box-shadow: var(--shadow);
		scroll-snap-align: start;
	}

	.box-pane-strip.single-pane .box-zone {
		flex: 1 1 auto;
	}

	.box-pane-strip .box-zone:not(.active-pane) {
		background: color-mix(in srgb, var(--paper-hi), var(--paper-deep) 42%);
		box-shadow: var(--shadow-sm);
	}

	.pane-source-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 9px;
	}

	.source-chip {
		min-width: 0;
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 6px 8px;
		border-radius: var(--pksx-radius-md);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--rule);
		color: var(--ink);
		text-align: left;
	}

	.source-chip span,
	.pane-state-tag {
		flex: 0 0 auto;
		font:
			750 0.55rem var(--pksx-font-mono),
			monospace;
	}

	.source-chip span {
		color: var(--rust);
	}

	.source-chip strong {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.78rem;
	}

	.source-chip em {
		color: var(--ink-soft);
		font-style: normal;
	}

	.pane-state-tag {
		padding: 4px 6px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--gold), transparent 68%);
		color: var(--ink);
	}

	.pane-close {
		flex: 0 0 auto;
		width: 28px;
		height: 28px;
		margin-left: auto;
		border-radius: var(--pksx-radius-sm);
		background: var(--paper);
		box-shadow: inset 0 0 0 1px var(--rule);
		color: var(--ink-soft);
		font-size: 1rem;
		font-weight: 800;
	}

	.box-zone:focus-visible,
	.party-zone:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 65%);
		outline-offset: 3px;
	}

	.zone-header {
		min-height: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0;
		margin-bottom: 10px;
	}

	.zone-header span {
		margin: 0;
		color: var(--ink-soft);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.party-header {
		margin-bottom: 9px;
	}

	.party-zone.collapsed .party-header {
		margin-bottom: 0;
	}

	.party-toggle {
		flex: 1 1 auto;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 36px;
		padding: 4px 8px;
		border-radius: var(--pksx-radius-sm);
		background: transparent;
		box-shadow: none;
		color: var(--ink);
		text-align: left;
	}

	.party-toggle .party-chevron {
		display: inline-block;
		color: var(--ink-soft);
		font-size: 0.8rem;
		transition: transform 160ms ease;
	}

	.party-zone.collapsed .party-chevron {
		transform: rotate(-90deg);
	}

	.party-toggle .party-meta {
		margin-left: auto;
		color: var(--ink-soft);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
	}

	.party-list {
		display: grid;
		grid-template-columns: repeat(6, minmax(52px, 80px));
		grid-auto-rows: auto;
		justify-content: center;
		gap: 6px;
	}

	.party-zone.collapsed .party-list {
		display: none;
	}

	.party-toggle:hover {
		background: var(--rust-wash);
		color: var(--rust);
	}

	.party-toggle.controller-focused,
	.party-toggle:focus-visible {
		outline: 3px solid color-mix(in srgb, var(--rust), transparent 55%);
		outline-offset: 1px;
	}

	.filter-row {
		display: flex;
		justify-content: flex-end;
		gap: 5px;
		margin-bottom: 10px;
	}

	.filter-row span {
		padding: 3px 9px;
		border: 1px solid var(--rule);
		border-radius: 6px;
		background: var(--paper-deep);
		color: var(--ink-soft);
		font:
			600 0.62rem var(--pksx-font-mono),
			monospace;
	}

	.box-grid {
		--box-slot-size: clamp(52px, calc((100cqw - 30px) / 6), 80px);
		flex: 0 0 auto;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(6, var(--box-slot-size));
		grid-template-rows: repeat(5, var(--box-slot-size));
		grid-auto-rows: var(--box-slot-size);
		justify-content: center;
		align-content: start;
		gap: 6px;
		overflow: visible;
		padding: 4px;
	}

	.box-pane-strip:not(.single-pane) .box-grid {
		--box-slot-size: clamp(58px, calc((100cqw - 30px) / 6), 80px);
	}

	.slot-cell {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		min-width: 0;
		min-height: 0;
	}

	.slot-cell.selected {
		z-index: 120;
	}

	.box-footer {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--rule);
		color: var(--ink-soft);
		font-size: 0.72rem;
		font-weight: 650;
	}

	.box-footer strong {
		margin-left: auto;
		color: var(--ink-mute);
		font:
			650 0.65rem var(--pksx-font-mono),
			monospace;
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

	@media (max-width: 1120px) {
		.storage-workspace {
			grid-template-columns: minmax(0, 1fr) 280px;
		}
	}

	@media (max-width: 1024px) {
		.storage-workspace,
		.box-zone,
		.box-grid {
			overflow: visible;
			min-height: 0;
		}

		.workspace-column {
			overflow-x: hidden;
			overflow-y: auto;
			min-height: 0;
		}

		.party-zone {
			overflow: visible;
		}

		.box-header {
			justify-content: center;
		}

		.workspace-column {
			order: 1;
			position: static;
			max-height: none;
		}

		.workbench-toolbar {
			flex-wrap: wrap;
		}

		.add-source-button {
			margin-left: auto;
		}

		.storage-workspace {
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		.party-zone,
		.box-zone {
			border-radius: var(--pksx-radius-lg);
			padding: 10px;
		}

		.box-pane-strip .box-zone {
			flex: 0 0 min(92vw, 420px);
			scroll-snap-align: start;
		}

		.box-pane-strip.single-pane .box-zone {
			flex: 1 1 auto;
		}

		.party-list {
			grid-template-columns: repeat(6, minmax(44px, 80px));
			gap: 6px;
		}

		.box-grid {
			--box-slot-size: clamp(42px, calc((100cqw - 30px) / 6), 70px);
			align-content: start;
		}

		.box-grid .slot-cell {
			aspect-ratio: 1;
		}
	}

	@media (max-width: 520px) {
		.filter-row,
		.box-footer span:nth-child(2) {
			display: none;
		}

		.box-grid {
			gap: 6px;
		}
	}
</style>
