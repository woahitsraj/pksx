import type {
	InventoryItemOption,
	SaveFileEditableProjection,
	SaveSummary,
	TrainerGender
} from '$lib/engine';

export type SaveFileLedgerView =
	| { status: 'loading' }
	| { status: 'no-active-save' }
	| { status: 'load-failed'; message: string; retrying?: boolean }
	| {
			status: 'ready';
			originalFilename: string;
			summary: Pick<SaveSummary, 'gameVersion' | 'trainerId' | 'playTime'>;
			projection: SaveFileEditableProjection;
			editingUnavailable?: { message: string; retrying?: boolean } | null;
	  };

export type SaveFileLedgerCatalogue =
	| { status: 'loading'; retrying?: boolean }
	| { status: 'ready'; availableItems: InventoryItemOption[] }
	| { status: 'failed'; message: string };

export type SaveFileLedgerCommand =
	| {
			kind: 'add-item';
			pocketKey: string;
			itemId: number | null;
			quantity: string;
			quantityError?: string | null;
	  }
	| { kind: 'remove-item'; pocketKey: string; itemId: number };

export type SaveFileLedgerFieldView = {
	value: string;
	pending?: boolean;
	error?: string | null;
};

export type SaveFileLedgerDrafts = {
	trainerName?: SaveFileLedgerFieldView;
	money?: SaveFileLedgerFieldView;
	itemQuantities?: Readonly<Record<string, SaveFileLedgerFieldView>>;
};

export type SaveFileLedgerCommitReason = 'enter' | 'blur';

export type SaveFileLedgerFocusFallbacks = readonly string[];

export type SaveFileLedgerProps = {
	view: SaveFileLedgerView;
	command?: SaveFileLedgerCommand | null;
	catalogues?: Readonly<Record<string, SaveFileLedgerCatalogue>>;
	drafts?: SaveFileLedgerDrafts;
	pendingTargets?: readonly string[];
	errors?: Readonly<Record<string, string>>;
	onBackToBoxes?: () => void;
	onRetryLoad?: () => void;
	onRetryEditing?: () => void;
	onRetryCatalogue?: (pocketKey: string) => void;
	onTrainerNameInput?: (value: string) => void;
	onTrainerNameCommit?: (reason: SaveFileLedgerCommitReason) => void;
	onTrainerNameAbandon?: () => void;
	onTrainerGenderSelect?: (gender: TrainerGender) => void;
	onMoneyInput?: (value: string) => void;
	onMoneyCommit?: (reason: SaveFileLedgerCommitReason) => void;
	onMoneyAbandon?: () => void;
	onMoneyStep?: (step: -1 | 1 | 'max', draft: string) => boolean;
	onItemQuantityInput?: (pocketKey: string, itemId: number, value: string) => void;
	onItemQuantityCommit?: (
		pocketKey: string,
		itemId: number,
		reason: SaveFileLedgerCommitReason
	) => void;
	onItemQuantityAbandon?: (pocketKey: string, itemId: number) => void;
	onItemQuantityStep?: (pocketKey: string, itemId: number, step: -1 | 1, draft: string) => boolean;
	onCommandChange?: (command: SaveFileLedgerCommand | null) => void;
	onAddItem?: (command: Extract<SaveFileLedgerCommand, { kind: 'add-item' }>) => void;
	onRemoveItem?: (command: Extract<SaveFileLedgerCommand, { kind: 'remove-item' }>) => void;
};
