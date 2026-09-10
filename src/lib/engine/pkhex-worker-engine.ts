import type {
	BoxSlotSummary,
	EngineApi,
	EngineError,
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
	SaveWorkspace,
	SlotOperationResult,
	StoredPokemonImportResult,
	StoredPokemonActionResult,
	SerializedSave,
	SaveSummary
} from './types';
import {
	parseEngineWorkerProtocolError,
	parseEngineWorkerResponse,
	parseEngineWorkerStatusMessage,
	type EngineWorkerMessage,
	type EngineWorkerMethod,
	type EngineWorkerRequest,
	type EngineWorkerRequestId,
	type EngineWorkerResponse,
	type EngineWorkerResultForMethod
} from './worker-protocol';

export type EngineWorkerPort = {
	postMessage(message: EngineWorkerMessage, transfer?: Transferable[]): void;
	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	addEventListener(type: 'messageerror', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	removeEventListener(type: 'messageerror', listener: (event: MessageEvent<unknown>) => void): void;
};

export type EngineWorkerFactory = () => EngineWorkerPort;

type PendingRequest = {
	method: EngineWorkerMethod;
	resolve(result: EngineResult<unknown>): void;
};

type WorkerEngineOptions = {
	createWorker?: EngineWorkerFactory;
};

let nextRequestId = 1;

export function createPkhexWorkerEngine(
	basePath = '/pkhex-engine',
	options: WorkerEngineOptions = {}
): EngineApi {
	const worker = (options.createWorker ?? createDefaultWorker)();
	const pending = new Map<EngineWorkerRequestId, PendingRequest>();
	let resolveStartup!: (result: EngineResult<null>) => void;
	let failedError: EngineError | undefined;

	const startupResult = new Promise<EngineResult<null>>((resolve) => {
		resolveStartup = resolve;
	});

	const onMessage = (event: MessageEvent<unknown>) => {
		const response = parseEngineWorkerResponse(event.data);
		if (response.ok) {
			resolvePendingResponse(response.value);
			return;
		}

		const protocolError = parseEngineWorkerProtocolError(event.data);
		if (protocolError.ok) {
			resolveProtocolError(protocolError.value.id, protocolError.value.error);
			return;
		}

		const status = parseEngineWorkerStatusMessage(event.data);
		if (status.ok) {
			if (status.value.status === 'ready') {
				resolveStartup({ ok: true, value: null, error: null });
			}

			if (status.value.status === 'failed') {
				failWorker(status.value.error);
			}
		}
	};

	const onError = (event: ErrorEvent) => {
		failWorker({
			code: 'engine-unavailable',
			message: event.message || 'The PKHeX Engine worker failed to start.'
		});
	};

	const onMessageError = () => {
		failWorker({
			code: 'engine-unavailable',
			message: 'The PKHeX Engine worker received an unreadable message.'
		});
	};

	function failWorker(error: EngineError) {
		failedError = error;
		resolveStartup(engineFailure(error));

		for (const [id, request] of pending) {
			request.resolve(engineFailure(error));
			pending.delete(id);
		}
	}

	worker.addEventListener('message', onMessage);
	worker.addEventListener('error', onError);
	worker.addEventListener('messageerror', onMessageError);
	worker.postMessage({ type: 'init', basePath });

	return {
		getVersion: () => sendRequest('getVersion'),
		summarizeSave: (bytes, fileName) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'summarizeSave',
				{
					type: 'request',
					id: createRequestId(),
					method: 'summarizeSave',
					payload: { bytes: buffer, fileName }
				},
				[buffer]
			);
		},
		listBoxSlots: (bytes, fileName, box) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'listBoxSlots',
				{
					type: 'request',
					id: createRequestId(),
					method: 'listBoxSlots',
					payload: { bytes: buffer, fileName, box }
				},
				[buffer]
			);
		},
		loadSaveWorkspace: (bytes, fileName, box) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'loadSaveWorkspace',
				{
					type: 'request',
					id: createRequestId(),
					method: 'loadSaveWorkspace',
					payload: { bytes: buffer, fileName, box }
				},
				[buffer]
			);
		},
		serializeSave: (bytes, fileName) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'serializeSave',
				{
					type: 'request',
					id: createRequestId(),
					method: 'serializeSave',
					payload: { bytes: buffer, fileName }
				},
				[buffer]
			);
		},
		applySlotOperation: (bytes, fileName, operation, activeBox) => {
			const buffer = copyBytesToArrayBuffer(bytes);
			const payloadOperation = cloneSlotOperation(operation);

			return sendRequest(
				'applySlotOperation',
				{
					type: 'request',
					id: createRequestId(),
					method: 'applySlotOperation',
					payload: { bytes: buffer, fileName, operation: payloadOperation, activeBox }
				},
				[buffer]
			);
		},
		applyPokemonEditOperation: (bytes, fileName, operation, activeBox) => {
			const buffer = copyBytesToArrayBuffer(bytes);
			const payloadOperation = {
				...operation,
				source: cloneSlotRef(operation.source)
			};

			return sendRequest(
				'applyPokemonEditOperation',
				{
					type: 'request',
					id: createRequestId(),
					method: 'applyPokemonEditOperation',
					payload: { bytes: buffer, fileName, operation: payloadOperation, activeBox }
				},
				[buffer]
			);
		},
		createPokemon: (bytes, fileName, operation, activeBox) => {
			const buffer = copyBytesToArrayBuffer(bytes);
			const payloadOperation = {
				...operation,
				destination: cloneSlotRef(operation.destination)
			};

			return sendRequest(
				'createPokemon',
				{
					type: 'request',
					id: createRequestId(),
					method: 'createPokemon',
					payload: { bytes: buffer, fileName, operation: payloadOperation, activeBox }
				},
				[buffer]
			);
		},
		getPokemonCreationCatalogue: (bytes, fileName) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'getPokemonCreationCatalogue',
				{
					type: 'request',
					id: createRequestId(),
					method: 'getPokemonCreationCatalogue',
					payload: { bytes: buffer, fileName }
				},
				[buffer]
			);
		},
		previewPokemonSpeciesFormEdit: (bytes, fileName, source, speciesId, form) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'previewPokemonSpeciesFormEdit',
				{
					type: 'request',
					id: createRequestId(),
					method: 'previewPokemonSpeciesFormEdit',
					payload: {
						bytes: buffer,
						fileName,
						source: cloneSlotRef(source),
						speciesId,
						form
					}
				},
				[buffer]
			);
		},
		applySaveFileEditOperation: (bytes, fileName, operation, activeBox) => {
			const buffer = copyBytesToArrayBuffer(bytes);
			const payloadOperation = structuredClone(operation);

			return sendRequest(
				'applySaveFileEditOperation',
				{
					type: 'request',
					id: createRequestId(),
					method: 'applySaveFileEditOperation',
					payload: { bytes: buffer, fileName, operation: payloadOperation, activeBox }
				},
				[buffer]
			);
		},
		getSaveFileInventoryCatalogue: (bytes, fileName) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'getSaveFileInventoryCatalogue',
				{
					type: 'request',
					id: createRequestId(),
					method: 'getSaveFileInventoryCatalogue',
					payload: { bytes: buffer, fileName }
				},
				[buffer]
			);
		},
		importStoredPokemon: (bytes, fileName, operation, activeBox) => {
			const buffer = copyBytesToArrayBuffer(bytes);
			const payloadOperation = {
				...operation,
				destination: cloneSlotRef(operation.destination)
			};

			return sendRequest(
				'importStoredPokemon',
				{
					type: 'request',
					id: createRequestId(),
					method: 'importStoredPokemon',
					payload: { bytes: buffer, fileName, operation: payloadOperation, activeBox }
				},
				[buffer]
			);
		},
		checkSlotLegality: (bytes, fileName, source) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'checkSlotLegality',
				{
					type: 'request',
					id: createRequestId(),
					method: 'checkSlotLegality',
					payload: { bytes: buffer, fileName, source: cloneSlotRef(source) }
				},
				[buffer]
			);
		},
		previewPokemonActions: (bytes, fileName, source) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'previewPokemonActions',
				{
					type: 'request',
					id: createRequestId(),
					method: 'previewPokemonActions',
					payload: { bytes: buffer, fileName, source: cloneSlotRef(source) }
				},
				[buffer]
			);
		},
		applyPokemonAction: (bytes, fileName, operation, activeBox) => {
			const buffer = copyBytesToArrayBuffer(bytes);

			return sendRequest(
				'applyPokemonAction',
				{
					type: 'request',
					id: createRequestId(),
					method: 'applyPokemonAction',
					payload: {
						bytes: buffer,
						fileName,
						operation: { ...operation, source: cloneSlotRef(operation.source) },
						activeBox
					}
				},
				[buffer]
			);
		},
		previewStoredPokemonActions: (entityBytesBase64) =>
			sendRequest('previewStoredPokemonActions', {
				type: 'request',
				id: createRequestId(),
				method: 'previewStoredPokemonActions',
				payload: { entityBytesBase64 }
			}),
		applyStoredPokemonAction: (entityBytesBase64, operation) =>
			sendRequest('applyStoredPokemonAction', {
				type: 'request',
				id: createRequestId(),
				method: 'applyStoredPokemonAction',
				payload: { entityBytesBase64, operation: structuredClone(operation) }
			})
	};

	async function sendRequest(method: 'getVersion'): Promise<EngineResult<EngineVersion>>;
	async function sendRequest(
		method: 'summarizeSave',
		request: Extract<EngineWorkerRequest, { method: 'summarizeSave' }>,
		transfer: Transferable[]
	): Promise<EngineResult<SaveSummary>>;
	async function sendRequest(
		method: 'listBoxSlots',
		request: Extract<EngineWorkerRequest, { method: 'listBoxSlots' }>,
		transfer: Transferable[]
	): Promise<EngineResult<BoxSlotSummary[]>>;
	async function sendRequest(
		method: 'loadSaveWorkspace',
		request: Extract<EngineWorkerRequest, { method: 'loadSaveWorkspace' }>,
		transfer: Transferable[]
	): Promise<EngineResult<SaveWorkspace>>;
	async function sendRequest(
		method: 'serializeSave',
		request: Extract<EngineWorkerRequest, { method: 'serializeSave' }>,
		transfer: Transferable[]
	): Promise<EngineResult<SerializedSave>>;
	async function sendRequest(
		method: 'applySlotOperation',
		request: Extract<EngineWorkerRequest, { method: 'applySlotOperation' }>,
		transfer: Transferable[]
	): Promise<EngineResult<SlotOperationResult>>;
	async function sendRequest(
		method: 'applyPokemonEditOperation',
		request: Extract<EngineWorkerRequest, { method: 'applyPokemonEditOperation' }>,
		transfer: Transferable[]
	): Promise<EngineResult<PokemonEditOperationResult>>;
	async function sendRequest(
		method: 'createPokemon',
		request: Extract<EngineWorkerRequest, { method: 'createPokemon' }>,
		transfer: Transferable[]
	): Promise<EngineResult<PokemonCreationResult>>;
	async function sendRequest(
		method: 'getPokemonCreationCatalogue',
		request: Extract<EngineWorkerRequest, { method: 'getPokemonCreationCatalogue' }>,
		transfer: Transferable[]
	): Promise<EngineResult<PokemonCreationCatalogue>>;
	async function sendRequest(
		method: 'previewPokemonSpeciesFormEdit',
		request: Extract<EngineWorkerRequest, { method: 'previewPokemonSpeciesFormEdit' }>,
		transfer: Transferable[]
	): Promise<EngineResult<PokemonSpeciesFormEditProjection>>;
	async function sendRequest(
		method: 'applySaveFileEditOperation',
		request: Extract<EngineWorkerRequest, { method: 'applySaveFileEditOperation' }>,
		transfer: Transferable[]
	): Promise<EngineResult<SaveFileEditOperationResult>>;
	async function sendRequest(
		method: 'getSaveFileInventoryCatalogue',
		request: Extract<EngineWorkerRequest, { method: 'getSaveFileInventoryCatalogue' }>,
		transfer: Transferable[]
	): Promise<EngineResult<SaveFileInventoryCatalogue>>;
	async function sendRequest(
		method: 'importStoredPokemon',
		request: Extract<EngineWorkerRequest, { method: 'importStoredPokemon' }>,
		transfer: Transferable[]
	): Promise<EngineResult<StoredPokemonImportResult>>;
	async function sendRequest(
		method: 'checkSlotLegality',
		request: Extract<EngineWorkerRequest, { method: 'checkSlotLegality' }>,
		transfer: Transferable[]
	): Promise<EngineResult<LegalityReport>>;
	async function sendRequest(
		method: 'previewPokemonActions',
		request: Extract<EngineWorkerRequest, { method: 'previewPokemonActions' }>,
		transfer: Transferable[]
	): Promise<EngineResult<PokemonActionPreview>>;
	async function sendRequest(
		method: 'applyPokemonAction',
		request: Extract<EngineWorkerRequest, { method: 'applyPokemonAction' }>,
		transfer: Transferable[]
	): Promise<EngineResult<PokemonActionResult>>;
	async function sendRequest(
		method: 'previewStoredPokemonActions',
		request: Extract<EngineWorkerRequest, { method: 'previewStoredPokemonActions' }>
	): Promise<EngineResult<PokemonActionPreview>>;
	async function sendRequest(
		method: 'applyStoredPokemonAction',
		request: Extract<EngineWorkerRequest, { method: 'applyStoredPokemonAction' }>
	): Promise<EngineResult<StoredPokemonActionResult>>;
	async function sendRequest(
		method: EngineWorkerMethod,
		request: EngineWorkerRequest = { type: 'request', id: createRequestId(), method: 'getVersion' },
		transfer: Transferable[] = []
	): Promise<EngineResult<unknown>> {
		if (failedError !== undefined) {
			return engineFailure(failedError);
		}

		const ready = await startupResult;
		if (!ready.ok) {
			return engineFailure(ready.error);
		}

		return new Promise((resolve) => {
			pending.set(request.id, { method, resolve });
			worker.postMessage(request, transfer);
		});
	}

	function resolvePendingResponse(response: EngineWorkerResponse) {
		const request = pending.get(response.id);
		if (request === undefined) {
			return;
		}

		pending.delete(response.id);

		if (request.method !== response.method) {
			request.resolve(
				engineFailure({
					code: 'invalid-worker-message',
					message: 'The PKHeX Engine worker returned a response for the wrong method.'
				})
			);
			return;
		}

		request.resolve(
			normalizeWorkerResult(response) as EngineWorkerResultForMethod<typeof response.method>
		);
	}

	function resolveProtocolError(id: EngineWorkerRequestId | undefined, error: EngineError) {
		if (id === undefined) {
			failWorker(error);
			return;
		}

		const request = pending.get(id);
		if (request === undefined) {
			return;
		}

		pending.delete(id);
		request.resolve(engineFailure(error));
	}
}

function normalizeWorkerResult(response: EngineWorkerResponse): EngineResult<unknown> {
	if (
		(response.method !== 'applySlotOperation' &&
			response.method !== 'applyPokemonEditOperation' &&
			response.method !== 'createPokemon' &&
			response.method !== 'applySaveFileEditOperation' &&
			response.method !== 'importStoredPokemon' &&
			response.method !== 'applyPokemonAction') ||
		!response.result.ok
	) {
		return response.result;
	}

	return {
		ok: true,
		value: {
			...response.result.value,
			bytes: new Uint8Array(response.result.value.bytes)
		},
		error: null
	};
}

function createDefaultWorker(): EngineWorkerPort {
	return new Worker(new URL('./pkhex-engine.worker.ts', import.meta.url), { type: 'module' });
}

function createRequestId(): EngineWorkerRequestId {
	const id = `engine-${nextRequestId}`;
	nextRequestId += 1;

	return id;
}

function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);

	return copy.buffer;
}

function cloneSlotOperation(
	operation: import('./types').SlotOperation
): import('./types').SlotOperation {
	switch (operation.kind) {
		case 'clear':
			return { kind: 'clear', source: cloneSlotRef(operation.source) };
		case 'move':
			return {
				kind: 'move',
				source: cloneSlotRef(operation.source),
				destination: cloneSlotRef(operation.destination)
			};
		case 'copy':
			return {
				kind: 'copy',
				source: cloneSlotRef(operation.source),
				destination: cloneSlotRef(operation.destination)
			};
	}
}

function cloneSlotRef(ref: import('./types').SaveSlotRef): import('./types').SaveSlotRef {
	return ref.zone === 'party'
		? { zone: 'party', slot: ref.slot }
		: { zone: 'box', box: ref.box, slot: ref.slot };
}

function engineFailure<T>(error: EngineError): EngineResult<T> {
	return { ok: false, value: null, error };
}
