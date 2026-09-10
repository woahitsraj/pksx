import { parseEngineResult } from './pkhex-engine';
import type {
	BoxSlotSummary,
	EngineResult,
	EngineVersion,
	LegalityReport,
	PokemonActionPreview,
	PokemonActionResult,
	PokemonCreationCatalogue,
	PokemonCreationResult,
	PokemonEditOperationResult,
	PokemonSpeciesFormEditProjection,
	SaveFileEditOperationResult,
	SaveFileInventoryCatalogue,
	SaveSummary,
	SaveWorkspace,
	SlotOperationResult,
	StoredPokemonImportResult,
	StoredPokemonActionResult,
	SerializedSave
} from './types';
import {
	createEngineWorkerProtocolError,
	createEngineWorkerResponse,
	parseEngineWorkerInitMessage,
	parseEngineWorkerRequest,
	type EngineWorkerApplySlotOperationRequest,
	type EngineWorkerApplyPokemonEditOperationRequest,
	type EngineWorkerCreatePokemonRequest,
	type EngineWorkerGetPokemonCreationCatalogueRequest,
	type EngineWorkerPreviewPokemonSpeciesFormEditRequest,
	type EngineWorkerApplySaveFileEditOperationRequest,
	type EngineWorkerGetSaveFileInventoryCatalogueRequest,
	type EngineWorkerImportStoredPokemonRequest,
	type EngineWorkerCheckSlotLegalityRequest,
	type EngineWorkerPreviewPokemonActionsRequest,
	type EngineWorkerApplyPokemonActionRequest,
	type EngineWorkerPreviewStoredPokemonActionsRequest,
	type EngineWorkerApplyStoredPokemonActionRequest,
	type EngineWorkerLoadSaveWorkspaceRequest,
	type EngineWorkerListBoxSlotsRequest,
	type EngineWorkerMessage,
	type EngineWorkerRequest,
	type EngineWorkerSerializeSaveRequest,
	type EngineWorkerStatusMessage,
	type EngineWorkerSummarizeSaveRequest
} from './worker-protocol';

export type DotnetPkhexEngineExports = {
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
	CreatePokemonJson(bytes: Uint8Array, fileName: string | undefined, operationJson: string): string;
	GetPokemonCreationCatalogueJson?(bytes: Uint8Array, fileName: string | undefined): string;
	PreviewPokemonSpeciesFormEditJson(
		bytes: Uint8Array,
		fileName: string | undefined,
		requestJson: string
	): string;
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

type RawSlotOperationResult = Omit<SlotOperationResult, 'bytes'> & {
	bytesBase64: string;
	byteLength: number;
};
type RawPokemonEditOperationResult = Omit<PokemonEditOperationResult, 'bytes'> & {
	bytesBase64: string;
	byteLength: number;
};
type RawPokemonCreationResult = Omit<PokemonCreationResult, 'bytes'> & {
	bytesBase64: string;
	byteLength: number;
};
type RawSaveFileEditOperationResult = Omit<SaveFileEditOperationResult, 'bytes'> & {
	bytesBase64: string;
	byteLength: number;
};
type RawStoredPokemonImportResult = Omit<StoredPokemonImportResult, 'bytes'> & {
	bytesBase64: string;
	byteLength: number;
};
type RawPokemonActionResult = Omit<PokemonActionResult, 'bytes'> & {
	bytesBase64: string;
	byteLength: number;
};

export type PkhexEngineWorkerRuntimeOptions = {
	loadEngine(basePath: string): Promise<DotnetPkhexEngineExports>;
	postMessage(
		message: EngineWorkerMessage | EngineWorkerStatusMessage,
		transfer?: Transferable[]
	): void;
};

export type PkhexEngineWorkerRuntime = {
	handleMessage(message: unknown): void;
};

export function createPkhexEngineWorkerRuntime({
	loadEngine,
	postMessage
}: PkhexEngineWorkerRuntimeOptions): PkhexEngineWorkerRuntime {
	let startup: Promise<DotnetPkhexEngineExports> | undefined;
	let ready = false;
	let failed = false;
	let callQueue = Promise.resolve();

	function handleMessage(message: unknown) {
		const init = parseEngineWorkerInitMessage(message);
		if (init.ok) {
			startEngine(init.value.basePath);
			return;
		}

		const request = parseEngineWorkerRequest(message);
		if (!request.ok) {
			postMessage(createEngineWorkerProtocolError(request.error, request.id));
			return;
		}

		callQueue = callQueue
			.then(() => handleRequest(request.value))
			.catch((error: unknown) => {
				postFailedStatus(error);
			});
	}

	function startEngine(basePath: string) {
		if (startup !== undefined) {
			return;
		}

		postMessage({ type: 'status', status: 'loading' });
		startup = loadEngine(basePath)
			.then((engine) => {
				ready = true;
				postMessage({ type: 'status', status: 'ready' });

				return engine;
			})
			.catch((error: unknown) => {
				postFailedStatus(error);
				throw error;
			});

		startup.catch(() => {
			// The failed status is the worker protocol surface; keep the rejected startup promise observed.
		});
	}

	async function handleRequest(request: EngineWorkerRequest) {
		if (startup === undefined || failed) {
			postMessage(createEngineWorkerResponse(request, unavailableResult(request)));
			return;
		}

		if (!ready) {
			await startup;
		}

		const engine = await startup;

		switch (request.method) {
			case 'getVersion':
				postMessage(
					createEngineWorkerResponse(
						request,
						parseEngineResult<EngineVersion>(engine.GetVersionJson())
					)
				);
				return;
			case 'summarizeSave':
				postMessage(createEngineWorkerResponse(request, summarizeSave(engine, request)));
				return;
			case 'listBoxSlots':
				postMessage(createEngineWorkerResponse(request, listBoxSlots(engine, request)));
				return;
			case 'loadSaveWorkspace':
				postMessage(createEngineWorkerResponse(request, loadSaveWorkspace(engine, request)));
				return;
			case 'serializeSave':
				postMessage(createEngineWorkerResponse(request, serializeSave(engine, request)));
				return;
			case 'applySlotOperation':
				postSlotOperationResponse(postMessage, request, applySlotOperation(engine, request));
				return;
			case 'applyPokemonEditOperation':
				postPokemonEditOperationResponse(
					postMessage,
					request,
					applyPokemonEditOperation(engine, request)
				);
				return;
			case 'createPokemon':
				postPokemonCreationResponse(postMessage, request, createPokemon(engine, request));
				return;
			case 'getPokemonCreationCatalogue':
				postMessage(
					createEngineWorkerResponse(request, getPokemonCreationCatalogue(engine, request))
				);
				return;
			case 'previewPokemonSpeciesFormEdit':
				postMessage(
					createEngineWorkerResponse(request, previewPokemonSpeciesFormEdit(engine, request))
				);
				return;
			case 'applySaveFileEditOperation':
				postSaveFileEditOperationResponse(
					postMessage,
					request,
					applySaveFileEditOperation(engine, request)
				);
				return;
			case 'getSaveFileInventoryCatalogue':
				postMessage(
					createEngineWorkerResponse(request, getSaveFileInventoryCatalogue(engine, request))
				);
				return;
			case 'importStoredPokemon':
				postStoredPokemonImportResponse(postMessage, request, importStoredPokemon(engine, request));
				return;
			case 'checkSlotLegality':
				postMessage(createEngineWorkerResponse(request, checkSlotLegality(engine, request)));
				return;
			case 'previewPokemonActions':
				postMessage(createEngineWorkerResponse(request, previewPokemonActions(engine, request)));
				return;
			case 'applyPokemonAction':
				postPokemonActionResponse(postMessage, request, applyPokemonAction(engine, request));
				return;
			case 'previewStoredPokemonActions':
				postMessage(
					createEngineWorkerResponse(request, previewStoredPokemonActions(engine, request))
				);
				return;
			case 'applyStoredPokemonAction':
				postMessage(createEngineWorkerResponse(request, applyStoredPokemonAction(engine, request)));
				return;
		}
	}

	function postFailedStatus(error: unknown) {
		if (failed) {
			return;
		}

		failed = true;
		postMessage({
			type: 'status',
			status: 'failed',
			error: {
				code: 'engine-unavailable',
				message: getErrorMessage(error)
			}
		});
	}

	return { handleMessage };
}

function summarizeSave(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerSummarizeSaveRequest
): EngineResult<SaveSummary> {
	return parseEngineResult<SaveSummary>(
		engine.ParseSaveSmoke(new Uint8Array(request.payload.bytes), request.payload.fileName)
	);
}

function listBoxSlots(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerListBoxSlotsRequest
): EngineResult<BoxSlotSummary[]> {
	return parseEngineResult<BoxSlotSummary[]>(
		engine.ListBoxSmoke(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			request.payload.box
		)
	);
}

function loadSaveWorkspace(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerLoadSaveWorkspaceRequest
): EngineResult<SaveWorkspace> {
	return parseEngineResult<SaveWorkspace>(
		engine.LoadSaveWorkspaceJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			request.payload.box
		)
	);
}

function serializeSave(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerSerializeSaveRequest
): EngineResult<SerializedSave> {
	return parseEngineResult<SerializedSave>(
		engine.SerializeSaveJson(new Uint8Array(request.payload.bytes), request.payload.fileName)
	);
}

function applySlotOperation(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerApplySlotOperationRequest
): EngineResult<RawSlotOperationResult> {
	return parseEngineResult<RawSlotOperationResult>(
		engine.ApplySlotOperationJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				...request.payload.operation,
				activeBox: request.payload.activeBox
			})
		)
	);
}

function applyPokemonEditOperation(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerApplyPokemonEditOperationRequest
): EngineResult<RawPokemonEditOperationResult> {
	return parseEngineResult<RawPokemonEditOperationResult>(
		engine.ApplyPokemonEditOperationJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				...request.payload.operation,
				activeBox: request.payload.activeBox
			})
		)
	);
}

function createPokemon(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerCreatePokemonRequest
): EngineResult<RawPokemonCreationResult> {
	return parseEngineResult<RawPokemonCreationResult>(
		engine.CreatePokemonJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				...request.payload.operation,
				activeBox: request.payload.activeBox
			})
		)
	);
}

function getPokemonCreationCatalogue(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerGetPokemonCreationCatalogueRequest
): EngineResult<PokemonCreationCatalogue> {
	if (!engine.GetPokemonCreationCatalogueJson) {
		return {
			ok: false,
			value: null,
			error: {
				code: 'unsupported-pokemon-creation',
				message: 'Pokemon species names are not available in this PKHeX Engine build.'
			}
		};
	}

	return parseEngineResult<PokemonCreationCatalogue>(
		engine.GetPokemonCreationCatalogueJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName
		)
	);
}

function previewPokemonSpeciesFormEdit(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerPreviewPokemonSpeciesFormEditRequest
): EngineResult<PokemonSpeciesFormEditProjection> {
	return parseEngineResult<PokemonSpeciesFormEditProjection>(
		engine.PreviewPokemonSpeciesFormEditJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				source: request.payload.source,
				speciesId: request.payload.speciesId,
				form: request.payload.form
			})
		)
	);
}

function applySaveFileEditOperation(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerApplySaveFileEditOperationRequest
): EngineResult<RawSaveFileEditOperationResult> {
	if (!engine.ApplySaveFileEditOperationJson) {
		return {
			ok: false,
			value: null,
			error: {
				code: 'unsupported-save-file-edit',
				message: 'Save File field editing is not available in this PKHeX Engine build.'
			}
		};
	}

	return parseEngineResult<RawSaveFileEditOperationResult>(
		engine.ApplySaveFileEditOperationJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				...request.payload.operation,
				activeBox: request.payload.activeBox
			})
		)
	);
}

function getSaveFileInventoryCatalogue(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerGetSaveFileInventoryCatalogueRequest
): EngineResult<SaveFileInventoryCatalogue> {
	if (!engine.GetSaveFileInventoryCatalogueJson) {
		return {
			ok: false,
			value: null,
			error: {
				code: 'unsupported-save-file-edit',
				message: 'Save File field editing is not available in this PKHeX Engine build.'
			}
		};
	}

	return parseEngineResult<SaveFileInventoryCatalogue>(
		engine.GetSaveFileInventoryCatalogueJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName
		)
	);
}

function importStoredPokemon(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerImportStoredPokemonRequest
): EngineResult<RawStoredPokemonImportResult> {
	return parseEngineResult<RawStoredPokemonImportResult>(
		engine.ImportStoredPokemonJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				...request.payload.operation,
				activeBox: request.payload.activeBox
			})
		)
	);
}

function checkSlotLegality(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerCheckSlotLegalityRequest
): EngineResult<LegalityReport> {
	return parseEngineResult<LegalityReport>(
		engine.CheckSlotLegalityJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify(request.payload.source)
		)
	);
}

function previewPokemonActions(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerPreviewPokemonActionsRequest
): EngineResult<PokemonActionPreview> {
	return parseEngineResult<PokemonActionPreview>(
		engine.PreviewPokemonActionsJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify(request.payload.source)
		)
	);
}

function applyPokemonAction(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerApplyPokemonActionRequest
): EngineResult<RawPokemonActionResult> {
	return parseEngineResult<RawPokemonActionResult>(
		engine.ApplyPokemonActionJson(
			new Uint8Array(request.payload.bytes),
			request.payload.fileName,
			JSON.stringify({
				...request.payload.operation,
				activeBox: request.payload.activeBox
			})
		)
	);
}

function previewStoredPokemonActions(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerPreviewStoredPokemonActionsRequest
): EngineResult<PokemonActionPreview> {
	return parseEngineResult<PokemonActionPreview>(
		engine.PreviewStoredPokemonActionsJson(request.payload.entityBytesBase64)
	);
}

function applyStoredPokemonAction(
	engine: DotnetPkhexEngineExports,
	request: EngineWorkerApplyStoredPokemonActionRequest
): EngineResult<StoredPokemonActionResult> {
	return parseEngineResult<StoredPokemonActionResult>(
		engine.ApplyStoredPokemonActionJson(
			request.payload.entityBytesBase64,
			JSON.stringify(request.payload.operation)
		)
	);
}

function postSlotOperationResponse(
	postMessage: PkhexEngineWorkerRuntimeOptions['postMessage'],
	request: EngineWorkerApplySlotOperationRequest,
	result: EngineResult<RawSlotOperationResult>
) {
	if (!result.ok) {
		postMessage(createEngineWorkerResponse(request, result));
		return;
	}

	const bytes = base64ToArrayBuffer(result.value.bytesBase64, result.value.byteLength);
	const response = createEngineWorkerResponse(request, {
		ok: true,
		value: {
			bytes,
			mutated: result.value.mutated,
			workspace: result.value.workspace
		},
		error: null
	});

	postMessage(response, [bytes]);
}

function postPokemonEditOperationResponse(
	postMessage: PkhexEngineWorkerRuntimeOptions['postMessage'],
	request: EngineWorkerApplyPokemonEditOperationRequest,
	result: EngineResult<RawPokemonEditOperationResult>
) {
	if (!result.ok) {
		postMessage(createEngineWorkerResponse(request, result));
		return;
	}

	const bytes = base64ToArrayBuffer(result.value.bytesBase64, result.value.byteLength);
	const response = createEngineWorkerResponse(request, {
		ok: true,
		value: {
			bytes,
			mutated: result.value.mutated,
			workspace: result.value.workspace
		},
		error: null
	});

	postMessage(response, [bytes]);
}

function postPokemonCreationResponse(
	postMessage: PkhexEngineWorkerRuntimeOptions['postMessage'],
	request: EngineWorkerCreatePokemonRequest,
	result: EngineResult<RawPokemonCreationResult>
) {
	if (!result.ok) {
		postMessage(createEngineWorkerResponse(request, result));
		return;
	}

	const bytes = base64ToArrayBuffer(result.value.bytesBase64, result.value.byteLength);
	const response = createEngineWorkerResponse(request, {
		ok: true,
		value: {
			bytes,
			mutated: result.value.mutated,
			workspace: result.value.workspace
		},
		error: null
	});

	postMessage(response, [bytes]);
}

function postSaveFileEditOperationResponse(
	postMessage: PkhexEngineWorkerRuntimeOptions['postMessage'],
	request: EngineWorkerApplySaveFileEditOperationRequest,
	result: EngineResult<RawSaveFileEditOperationResult>
) {
	if (!result.ok) {
		postMessage(createEngineWorkerResponse(request, result));
		return;
	}

	const bytes = base64ToArrayBuffer(result.value.bytesBase64, result.value.byteLength);
	const response = createEngineWorkerResponse(request, {
		ok: true,
		value: {
			bytes,
			mutated: result.value.mutated,
			workspace: result.value.workspace
		},
		error: null
	});

	postMessage(response, [bytes]);
}

function postStoredPokemonImportResponse(
	postMessage: PkhexEngineWorkerRuntimeOptions['postMessage'],
	request: EngineWorkerImportStoredPokemonRequest,
	result: EngineResult<RawStoredPokemonImportResult>
) {
	if (!result.ok) {
		postMessage(createEngineWorkerResponse(request, result));
		return;
	}

	const bytes = base64ToArrayBuffer(result.value.bytesBase64, result.value.byteLength);
	const response = createEngineWorkerResponse(request, {
		ok: true,
		value: {
			bytes,
			mutated: result.value.mutated,
			workspace: result.value.workspace
		},
		error: null
	});

	postMessage(response, [bytes]);
}

function postPokemonActionResponse(
	postMessage: PkhexEngineWorkerRuntimeOptions['postMessage'],
	request: EngineWorkerApplyPokemonActionRequest,
	result: EngineResult<RawPokemonActionResult>
) {
	if (!result.ok) {
		postMessage(createEngineWorkerResponse(request, result));
		return;
	}

	const bytes = base64ToArrayBuffer(result.value.bytesBase64, result.value.byteLength);
	const response = createEngineWorkerResponse(request, {
		ok: true,
		value: {
			bytes,
			mutated: result.value.mutated,
			workspace: result.value.workspace,
			changes: result.value.changes
		},
		error: null
	});

	postMessage(response, [bytes]);
}

function unavailableResult(request: EngineWorkerRequest) {
	const result = {
		ok: false,
		value: null,
		error: {
			code: 'engine-unavailable',
			message: 'The PKHeX Engine worker is not ready.'
		}
	} as const;

	switch (request.method) {
		case 'getVersion':
			return result satisfies EngineResult<EngineVersion>;
		case 'summarizeSave':
			return result satisfies EngineResult<SaveSummary>;
		case 'listBoxSlots':
			return result satisfies EngineResult<BoxSlotSummary[]>;
		case 'loadSaveWorkspace':
			return result satisfies EngineResult<SaveWorkspace>;
		case 'serializeSave':
			return result satisfies EngineResult<SerializedSave>;
		case 'applySlotOperation':
			return result satisfies EngineResult<SlotOperationResult>;
		case 'applyPokemonEditOperation':
			return result satisfies EngineResult<PokemonEditOperationResult>;
		case 'createPokemon':
			return result satisfies EngineResult<PokemonCreationResult>;
		case 'getPokemonCreationCatalogue':
			return result satisfies EngineResult<PokemonCreationCatalogue>;
		case 'previewPokemonSpeciesFormEdit':
			return result satisfies EngineResult<PokemonSpeciesFormEditProjection>;
		case 'applySaveFileEditOperation':
			return result satisfies EngineResult<SaveFileEditOperationResult>;
		case 'getSaveFileInventoryCatalogue':
			return result satisfies EngineResult<SaveFileInventoryCatalogue>;
		case 'importStoredPokemon':
			return result satisfies EngineResult<StoredPokemonImportResult>;
		case 'checkSlotLegality':
			return result satisfies EngineResult<LegalityReport>;
		case 'previewPokemonActions':
		case 'previewStoredPokemonActions':
			return result satisfies EngineResult<PokemonActionPreview>;
		case 'applyPokemonAction':
			return result satisfies EngineResult<PokemonActionResult>;
		case 'applyStoredPokemonAction':
			return result satisfies EngineResult<StoredPokemonActionResult>;
	}
}

function base64ToArrayBuffer(base64: string, byteLength: number): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(byteLength);

	for (let index = 0; index < bytes.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	return bytes.buffer;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}

	return 'The PKHeX Engine failed to load.';
}
