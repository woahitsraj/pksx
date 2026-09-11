import type {
	BoxSlotSummary,
	EngineApi,
	EngineError,
	EngineErrorCode,
	EngineResult,
	EngineVersion,
	LegalityReport,
	PokemonActionOperation,
	PokemonActionPreview,
	PokemonActionResult,
	PokemonCreationCatalogue,
	PokemonCreationOperation,
	PokemonCreationResult,
	PokemonEditOperation,
	PokemonEditOperationResult,
	PokemonEditPreviewValidationScope,
	PokemonSpeciesFormEditProjection,
	SaveFileEditOperation,
	SaveFileEditOperationResult,
	SaveFileInventoryCatalogue,
	SaveWorkspace,
	SlotOperation,
	SlotOperationResult,
	StoredPokemonImportResult,
	StoredPokemonActionResult,
	SerializedSave,
	SaveSummary
} from './types';

type RawDotnetModule = {
	dotnet: {
		create(): Promise<{
			getAssemblyExports(assemblyName: string): Promise<{
				Pksx: {
					Pkhex: {
						Engine: {
							PkhexEngineExports: DotnetPkhexEngineExports;
						};
					};
				};
			}>;
			getConfig(): { mainAssemblyName: string };
			runMain(): Promise<void>;
		}>;
	};
};

type DotnetPkhexEngineExports = {
	GetVersionJson(): string;
	ParseSaveSmoke(bytes: Uint8Array, fileName?: string): string;
	ListBoxSmoke(bytes: Uint8Array, fileName: string | undefined, box: number): string;
	LoadSaveWorkspaceJson(bytes: Uint8Array, fileName: string | undefined, box: number): string;
	SerializeSaveJson(bytes: Uint8Array, fileName?: string): string;
	ApplySlotOperationJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		operationJson: string
	): string;
	ApplyPokemonEditOperationJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		operationJson: string
	): string;
	PreviewPokemonEditOperationJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		operationJson: string
	): string;
	ValidatePokemonEditPreviewJson(
		baselineBytes: Uint8Array,
		candidateBytes: Uint8Array,
		fileName: string | undefined,
		requestJson: string
	): string;
	PreviewPokemonSpeciesFormEditJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		requestJson: string
	): string;
	CreatePokemonJson(bytes: Uint8Array, fileName: string | undefined, operationJson: string): string;
	GetPokemonCreationCatalogueJson?(bytes: Uint8Array, fileName: string | undefined): string;
	ApplySaveFileEditOperationJson?(
		bytes: Uint8Array,
		fileName: string | undefined,
		operationJson: string
	): string;
	GetSaveFileInventoryCatalogueJson?(bytes: Uint8Array, fileName: string | undefined): string;
	ImportStoredPokemonJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		importJson: string
	): string;
	CheckSlotLegalityJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		sourceJson: string
	): string;
	PreviewPokemonActionsJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		sourceJson: string
	): string;
	ApplyPokemonActionJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		actionJson: string
	): string;
	PreviewStoredPokemonActionsJson(entityBytesBase64: string): string;
	ApplyStoredPokemonActionJson(entityBytesBase64: string, actionJson: string): string;
};

const knownEngineErrorCodes = new Set<EngineErrorCode>([
	'unsupported-save',
	'invalid-box',
	'invalid-slot',
	'empty-source-slot',
	'occupied-destination-slot',
	'unsupported-slot-operation',
	'invalid-pokemon-edit',
	'unsupported-pokemon-edit',
	'invalid-pokemon-action',
	'unsupported-pokemon-action',
	'stale-pokemon-action-preview',
	'invalid-pokemon-creation',
	'unsupported-pokemon-creation',
	'invalid-pokemon-import',
	'invalid-stored-pokemon',
	'incompatible-stored-pokemon',
	'invalid-save-file-edit',
	'unsupported-save-file-edit',
	'engine-unavailable',
	'invalid-engine-response',
	'invalid-worker-message',
	'unknown-engine-error'
]);

export async function createPkhexEngine(basePath = '/pkhex-engine'): Promise<EngineApi> {
	const module = (await import(
		/* @vite-ignore */ `${basePath}/_framework/dotnet.js`
	)) as RawDotnetModule;
	const runtime = await module.dotnet.create();
	const config = runtime.getConfig();
	const exports = await runtime.getAssemblyExports(config.mainAssemblyName);
	await runtime.runMain();

	const engine = exports.Pksx.Pkhex.Engine.PkhexEngineExports;

	return {
		getVersion: async () => parseEngineResult<EngineVersion>(engine.GetVersionJson()),
		summarizeSave: async (bytes, fileName) =>
			normalizeSaveSummaryResult(
				parseEngineResult<RawSaveSummary>(engine.ParseSaveSmoke(bytes, fileName))
			),
		listBoxSlots: async (bytes, fileName, box) =>
			parseEngineResult<BoxSlotSummary[]>(engine.ListBoxSmoke(bytes, fileName, box)),
		loadSaveWorkspace: async (bytes, fileName, box) =>
			normalizeSaveWorkspaceResult(
				parseEngineResult<RawSaveWorkspace>(engine.LoadSaveWorkspaceJson(bytes, fileName, box))
			),
		serializeSave: async (bytes, fileName) =>
			parseEngineResult<SerializedSave>(engine.SerializeSaveJson(bytes, fileName)),
		applySlotOperation: async (bytes, fileName, operation, activeBox) =>
			decodeMutationResult(
				parseEngineResult<RawSlotOperationResult>(
					engine.ApplySlotOperationJson(
						bytes,
						fileName,
						JSON.stringify({ ...operation, activeBox } satisfies RawSlotOperationRequest)
					)
				)
			),
		applyPokemonEditOperation: async (bytes, fileName, operation, activeBox) =>
			decodeMutationResult(
				parseEngineResult<RawPokemonEditOperationResult>(
					engine.ApplyPokemonEditOperationJson(
						bytes,
						fileName,
						JSON.stringify({
							...operation,
							activeBox
						} satisfies RawPokemonEditOperationRequest)
					)
				)
			),
		previewPokemonEditOperation: async (bytes, fileName, operation, activeBox) =>
			decodeMutationResult(
				parseEngineResult<RawPokemonEditOperationResult>(
					engine.PreviewPokemonEditOperationJson(
						bytes,
						fileName,
						JSON.stringify({
							...operation,
							activeBox
						} satisfies RawPokemonEditOperationRequest)
					)
				)
			),
		validatePokemonEditPreview: async (baselineBytes, candidateBytes, fileName, source, scope) =>
			parseEngineResult<boolean>(
				engine.ValidatePokemonEditPreviewJson(
					baselineBytes,
					candidateBytes,
					fileName,
					JSON.stringify({ source, ...scope } satisfies {
						source: import('./types').SaveSlotRef;
					} & PokemonEditPreviewValidationScope)
				)
			),
		createPokemon: async (bytes, fileName, operation, activeBox) =>
			decodeMutationResult(
				parseEngineResult<RawPokemonCreationResult>(
					engine.CreatePokemonJson(
						bytes,
						fileName,
						JSON.stringify({
							...operation,
							activeBox
						} satisfies RawPokemonCreationRequest)
					)
				)
			),
		getPokemonCreationCatalogue: async (bytes, fileName) => {
			if (!engine.GetPokemonCreationCatalogueJson) {
				return engineFailure(
					'unsupported-pokemon-creation',
					'Pokemon species names are not available in this PKHeX Engine build.'
				);
			}

			return parseEngineResult<PokemonCreationCatalogue>(
				engine.GetPokemonCreationCatalogueJson(bytes, fileName)
			);
		},
		previewPokemonSpeciesFormEdit: async (bytes, fileName, source, speciesId, form) =>
			parseEngineResult<PokemonSpeciesFormEditProjection>(
				engine.PreviewPokemonSpeciesFormEditJson(
					bytes,
					fileName,
					JSON.stringify({ source, speciesId, form })
				)
			),
		applySaveFileEditOperation: async (bytes, fileName, operation, activeBox) => {
			if (!engine.ApplySaveFileEditOperationJson) {
				return engineFailure(
					'unsupported-save-file-edit',
					'Save File field editing is not available in this PKHeX Engine build.'
				);
			}

			return decodeMutationResult(
				parseEngineResult<RawSaveFileEditOperationResult>(
					engine.ApplySaveFileEditOperationJson(
						bytes,
						fileName,
						JSON.stringify({
							...operation,
							activeBox
						} satisfies RawSaveFileEditOperationRequest)
					)
				)
			);
		},
		getSaveFileInventoryCatalogue: async (bytes, fileName) => {
			if (!engine.GetSaveFileInventoryCatalogueJson) {
				return engineFailure(
					'unsupported-save-file-edit',
					'Save File field editing is not available in this PKHeX Engine build.'
				);
			}

			return parseEngineResult<SaveFileInventoryCatalogue>(
				engine.GetSaveFileInventoryCatalogueJson(bytes, fileName)
			);
		},
		importStoredPokemon: async (bytes, fileName, operation, activeBox) =>
			decodeMutationResult(
				parseEngineResult<RawStoredPokemonImportResult>(
					engine.ImportStoredPokemonJson(
						bytes,
						fileName,
						JSON.stringify({
							...operation,
							activeBox
						} satisfies RawStoredPokemonImportRequest)
					)
				)
			),
		checkSlotLegality: async (bytes, fileName, source) =>
			parseEngineResult<LegalityReport>(
				engine.CheckSlotLegalityJson(bytes, fileName, JSON.stringify(source))
			),
		previewPokemonActions: async (bytes, fileName, source) =>
			parseEngineResult<PokemonActionPreview>(
				engine.PreviewPokemonActionsJson(bytes, fileName, JSON.stringify(source))
			),
		applyPokemonAction: async (bytes, fileName, operation, activeBox) =>
			decodeMutationResult(
				parseEngineResult<RawPokemonActionResult>(
					engine.ApplyPokemonActionJson(
						bytes,
						fileName,
						JSON.stringify({
							...operation,
							activeBox
						} satisfies RawPokemonActionRequest)
					)
				)
			),
		previewStoredPokemonActions: async (entityBytesBase64) =>
			parseEngineResult<PokemonActionPreview>(
				engine.PreviewStoredPokemonActionsJson(entityBytesBase64)
			),
		applyStoredPokemonAction: async (entityBytesBase64, operation) =>
			parseEngineResult<StoredPokemonActionResult>(
				engine.ApplyStoredPokemonActionJson(entityBytesBase64, JSON.stringify(operation))
			)
	};
}

type RawSlotOperationRequest = SlotOperation & { activeBox: number };
type RawPokemonEditOperationRequest = PokemonEditOperation & { activeBox: number };
type RawPokemonCreationRequest = PokemonCreationOperation & { activeBox: number };
type RawSaveFileEditOperationRequest = SaveFileEditOperation & { activeBox: number };
type RawStoredPokemonImportRequest = {
	entityBytesBase64: string;
	destination: import('./types').SaveSlotRef;
	activeBox: number;
};
type RawPokemonActionRequest = PokemonActionOperation & { activeBox: number };

type SaveSummaryDefaultedFields = 'trainerId' | 'playTime' | 'playedHours' | 'playedMinutes';
type RawSaveSummary = Omit<SaveSummary, SaveSummaryDefaultedFields> &
	Partial<Pick<SaveSummary, SaveSummaryDefaultedFields>>;
type RawSaveWorkspace = Omit<SaveWorkspace, 'summary'> & { summary: RawSaveSummary };
type RawSlotOperationResult = Omit<SlotOperationResult, 'bytes' | 'workspace'> & {
	bytesBase64: string;
	byteLength: number;
	workspace: RawSaveWorkspace;
};
type RawPokemonEditOperationResult = Omit<PokemonEditOperationResult, 'bytes' | 'workspace'> & {
	bytesBase64: string;
	byteLength: number;
	workspace: RawSaveWorkspace;
};
type RawPokemonCreationResult = Omit<PokemonCreationResult, 'bytes' | 'workspace'> & {
	bytesBase64: string;
	byteLength: number;
	workspace: RawSaveWorkspace;
};
type RawSaveFileEditOperationResult = Omit<SaveFileEditOperationResult, 'bytes' | 'workspace'> & {
	bytesBase64: string;
	byteLength: number;
	workspace: RawSaveWorkspace;
};
type RawStoredPokemonImportResult = Omit<StoredPokemonImportResult, 'bytes' | 'workspace'> & {
	bytesBase64: string;
	byteLength: number;
	workspace: RawSaveWorkspace;
};
type RawPokemonActionResult = Omit<PokemonActionResult, 'bytes' | 'workspace'> & {
	bytesBase64: string;
	byteLength: number;
	workspace: RawSaveWorkspace;
};

export function parseEngineResult<T>(json: string): EngineResult<T> {
	try {
		return normalizeEngineResult(JSON.parse(json));
	} catch {
		return engineFailure('invalid-engine-response', 'The PKHeX Engine returned invalid JSON.');
	}
}

function normalizeEngineResult<T>(value: unknown): EngineResult<T> {
	if (!isRecord(value) || typeof value.ok !== 'boolean') {
		return engineFailure('invalid-engine-response', 'The PKHeX Engine returned an invalid result.');
	}

	if (value.ok) {
		if (!('value' in value)) {
			return engineFailure(
				'invalid-engine-response',
				'The PKHeX Engine returned a success without a value.'
			);
		}

		return { ok: true, value: value.value as T, error: null };
	}

	const error = normalizeEngineError(value.error);

	return { ok: false, value: null, error };
}

function normalizeEngineError(error: unknown): EngineError {
	if (!isRecord(error)) {
		return {
			code: 'invalid-engine-response',
			message: 'The PKHeX Engine returned a failure without an error.'
		};
	}

	const message =
		typeof error.message === 'string' && error.message.length > 0
			? error.message
			: 'The PKHeX Engine failed without an error message.';

	if (typeof error.code !== 'string') {
		return { code: 'invalid-engine-response', message };
	}

	return {
		code: knownEngineErrorCodes.has(error.code as EngineErrorCode)
			? (error.code as EngineErrorCode)
			: 'unknown-engine-error',
		message
	};
}

function engineFailure<T>(code: EngineErrorCode, message: string): EngineResult<T> {
	return { ok: false, value: null, error: { code, message } };
}

function decodeMutationResult<
	T extends {
		bytesBase64: string;
		byteLength: number;
		mutated: boolean;
		workspace: RawSaveWorkspace;
	}
>(
	result: EngineResult<T>
): EngineResult<
	Omit<T, 'bytesBase64' | 'byteLength' | 'workspace'> & {
		bytes: Uint8Array;
		workspace: SaveWorkspace;
	}
> {
	if (!result.ok) {
		return result;
	}

	const { bytesBase64, byteLength, workspace, ...value } = result.value;
	return {
		ok: true,
		value: {
			...value,
			bytes: base64ToBytes(bytesBase64, byteLength),
			workspace: normalizeSaveWorkspace(workspace)
		},
		error: null
	};
}

function normalizeSaveSummaryResult(
	result: EngineResult<RawSaveSummary>
): EngineResult<SaveSummary> {
	if (!result.ok) {
		return result;
	}

	return {
		ok: true,
		value: normalizeSaveSummary(result.value),
		error: null
	};
}

function normalizeSaveWorkspaceResult(
	result: EngineResult<RawSaveWorkspace>
): EngineResult<SaveWorkspace> {
	if (!result.ok) {
		return result;
	}

	return {
		ok: true,
		value: normalizeSaveWorkspace(result.value),
		error: null
	};
}

function normalizeSaveWorkspace(workspace: RawSaveWorkspace): SaveWorkspace {
	return {
		...workspace,
		summary: normalizeSaveSummary(workspace.summary)
	};
}

function normalizeSaveSummary(summary: RawSaveSummary): SaveSummary {
	return {
		...summary,
		trainerId: summary.trainerId ?? 0,
		playTime: summary.playTime ?? '',
		playedHours: summary.playedHours ?? 0,
		playedMinutes: summary.playedMinutes ?? 0
	};
}

function base64ToBytes(base64: string, byteLength: number): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(byteLength);

	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
