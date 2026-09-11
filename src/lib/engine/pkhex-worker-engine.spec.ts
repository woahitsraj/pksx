import { describe, expect, test } from 'vitest';
import { createPkhexWorkerEngine, type EngineWorkerPort } from './pkhex-worker-engine';
import type { EngineWorkerMessage } from './worker-protocol';

type PostedWorkerMessage = {
	message: EngineWorkerMessage;
	transfer?: Transferable[];
};

class FakeWorker implements EngineWorkerPort {
	readonly posted: PostedWorkerMessage[] = [];
	private readonly messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
	private readonly errorListeners = new Set<(event: ErrorEvent) => void>();
	private readonly messageErrorListeners = new Set<(event: MessageEvent<unknown>) => void>();

	postMessage(message: EngineWorkerMessage, transfer?: Transferable[]) {
		this.posted.push({ message, transfer });
	}

	addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	addEventListener(type: 'messageerror', listener: (event: MessageEvent<unknown>) => void): void;
	addEventListener(
		type: 'message' | 'error' | 'messageerror',
		listener: ((event: MessageEvent<unknown>) => void) | ((event: ErrorEvent) => void)
	) {
		switch (type) {
			case 'message':
				this.messageListeners.add(listener as (event: MessageEvent<unknown>) => void);
				return;
			case 'error':
				this.errorListeners.add(listener as (event: ErrorEvent) => void);
				return;
			case 'messageerror':
				this.messageErrorListeners.add(listener as (event: MessageEvent<unknown>) => void);
				return;
		}
	}

	removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
	removeEventListener(type: 'messageerror', listener: (event: MessageEvent<unknown>) => void): void;
	removeEventListener(
		type: 'message' | 'error' | 'messageerror',
		listener: ((event: MessageEvent<unknown>) => void) | ((event: ErrorEvent) => void)
	) {
		switch (type) {
			case 'message':
				this.messageListeners.delete(listener as (event: MessageEvent<unknown>) => void);
				return;
			case 'error':
				this.errorListeners.delete(listener as (event: ErrorEvent) => void);
				return;
			case 'messageerror':
				this.messageErrorListeners.delete(listener as (event: MessageEvent<unknown>) => void);
				return;
		}
	}

	emit(data: unknown) {
		for (const listener of this.messageListeners) {
			listener({ data } as MessageEvent<unknown>);
		}
	}

	emitError(message = 'Worker chunk failed to load.') {
		for (const listener of this.errorListeners) {
			listener({ message } as ErrorEvent);
		}
	}

	emitMessageError() {
		for (const listener of this.messageErrorListeners) {
			listener({ data: undefined } as MessageEvent<unknown>);
		}
	}
}

describe('createPkhexWorkerEngine', () => {
	test('starts the worker with an explicit engine base path without blocking creation', () => {
		expect.assertions(1);

		const worker = new FakeWorker();

		createPkhexWorkerEngine('/custom-engine', { createWorker: () => worker });

		expect(worker.posted).toEqual([{ message: { type: 'init', basePath: '/custom-engine' } }]);
	});

	test('waits for readiness, routes concurrent requests by id, and normalizes responses', async () => {
		expect.assertions(5);

		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });

		const version = engine.getVersion();
		expect(worker.posted).toHaveLength(1);

		worker.emit({ type: 'status', status: 'ready' });

		const summary = engine.summarizeSave(new Uint8Array([1, 2, 3]), 'main.sav');

		await Promise.resolve();

		const versionRequest = worker.posted[1]?.message;
		const summaryRequest = worker.posted[2]?.message;

		expect(versionRequest).toMatchObject({ type: 'request', method: 'getVersion' });
		expect(summaryRequest).toMatchObject({ type: 'request', method: 'summarizeSave' });

		if (
			versionRequest?.type !== 'request' ||
			summaryRequest?.type !== 'request' ||
			summaryRequest.method !== 'summarizeSave'
		) {
			throw new Error('Expected worker requests to be posted.');
		}

		worker.emit({
			type: 'response',
			id: summaryRequest.id,
			method: 'summarizeSave',
			result: {
				ok: true,
				value: {
					fileName: 'main.sav',
					saveType: 'SAV9SV',
					gameVersion: 'SV',
					gameVersionId: 45,
					generation: 9,
					trainerName: 'PKSX',
					trainerId: 41203,
					playTime: '47:12',
					playedHours: 47,
					playedMinutes: 12,
					partyCount: 1,
					boxCount: 32,
					boxSlotCount: 30
				},
				error: null
			}
		});
		worker.emit({
			type: 'response',
			id: versionRequest.id,
			method: 'getVersion',
			result: {
				ok: true,
				value: { pkhexCoreVersion: '26.5.5.0', facadeVersion: '1.0.0.0' },
				error: null
			}
		});

		await expect(summary).resolves.toMatchObject({
			ok: true,
			value: { fileName: 'main.sav', gameVersion: 'SV' }
		});
		await expect(version).resolves.toMatchObject({
			ok: true,
			value: { pkhexCoreVersion: '26.5.5.0' }
		});
	});

	test('copies save bytes before transferring worker-owned buffers', async () => {
		expect.assertions(5);

		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });
		const bytes = new Uint8Array([1, 2, 3]);

		worker.emit({ type: 'status', status: 'ready' });

		const summary = engine.summarizeSave(bytes, 'main.sav');

		await Promise.resolve();

		const request = worker.posted[1]?.message;

		if (request?.type !== 'request' || request.method !== 'summarizeSave') {
			throw new Error('Expected a summarizeSave request.');
		}

		expect(request.payload.bytes).not.toBe(bytes.buffer);
		expect([...new Uint8Array(request.payload.bytes)]).toEqual([1, 2, 3]);
		expect(worker.posted[1]?.transfer).toEqual([request.payload.bytes]);
		expect([...bytes]).toEqual([1, 2, 3]);

		worker.emit({
			type: 'response',
			id: request.id,
			method: 'summarizeSave',
			result: {
				ok: false,
				value: null,
				error: { code: 'unsupported-save', message: 'Unsupported save.' }
			}
		});

		await expect(summary).resolves.toMatchObject({
			ok: false,
			error: { code: 'unsupported-save' }
		});
	});

	test('normalizes mutated slot operation bytes to Uint8Array for later engine calls', async () => {
		expect.assertions(4);

		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });

		worker.emit({ type: 'status', status: 'ready' });

		const operation = engine.applySlotOperation(
			new Uint8Array([1, 2, 3]),
			'main.sav',
			{
				kind: 'move',
				source: { zone: 'box', box: 0, slot: 0 },
				destination: { zone: 'box', box: 0, slot: 2 }
			},
			0
		);

		await Promise.resolve();

		const request = worker.posted[1]?.message;
		if (request?.type !== 'request' || request.method !== 'applySlotOperation') {
			throw new Error('Expected an applySlotOperation request.');
		}

		const responseBytes = new Uint8Array([4, 5, 6]).buffer;
		worker.emit({
			type: 'response',
			id: request.id,
			method: 'applySlotOperation',
			result: {
				ok: true,
				value: {
					bytes: responseBytes,
					mutated: true,
					workspace: {
						summary: {
							fileName: 'main.sav',
							saveType: 'SAV9SV',
							gameVersion: 'SV',
							gameVersionId: 45,
							generation: 9,
							trainerName: 'PKSX',
							trainerId: 41203,
							playTime: '47:12',
							playedHours: 47,
							playedMinutes: 12,
							partyCount: 1,
							boxCount: 1,
							boxSlotCount: 30
						},
						partySlots: [],
						boxSlots: []
					}
				},
				error: null
			}
		});

		const result = await operation;
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error('Expected slot operation to succeed.');
		}
		expect(result.value.bytes).toBeInstanceOf(Uint8Array);
		expect([...result.value.bytes]).toEqual([4, 5, 6]);

		engine.summarizeSave(result.value.bytes, 'main.sav');
		await Promise.resolve();
		const followUpRequest = worker.posted[2]?.message;
		expect(followUpRequest).toMatchObject({ type: 'request', method: 'summarizeSave' });
	});

	test.each(['applyPokemonEditOperation', 'previewPokemonEditOperation'] as const)(
		'posts $method through the worker and normalizes returned bytes',
		async (method) => {
			expect.assertions(4);

			const worker = new FakeWorker();
			const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });

			worker.emit({ type: 'status', status: 'ready' });

			const operation = engine[method](
				new Uint8Array([1, 2, 3]),
				'main.sav',
				{
					source: { zone: 'box', box: 0, slot: 0 },
					level: 24
				},
				0
			);

			await Promise.resolve();

			const request = worker.posted[1]?.message;
			if (request?.type !== 'request' || request.method !== method) {
				throw new Error(`Expected an ${method} request.`);
			}

			expect(request.payload.operation).toEqual({
				source: { zone: 'box', box: 0, slot: 0 },
				level: 24
			});
			expect(worker.posted[1]?.transfer).toEqual([request.payload.bytes]);

			const responseBytes = new Uint8Array([7, 8, 9]).buffer;
			worker.emit({
				type: 'response',
				id: request.id,
				method,
				result: {
					ok: true,
					value: {
						bytes: responseBytes,
						mutated: true,
						workspace: {
							summary: {
								fileName: 'main.sav',
								saveType: 'SAV9SV',
								gameVersion: 'SV',
								gameVersionId: 45,
								generation: 9,
								trainerName: 'PKSX',
								trainerId: 41203,
								playTime: '47:12',
								playedHours: 47,
								playedMinutes: 12,
								partyCount: 1,
								boxCount: 1,
								boxSlotCount: 30
							},
							partySlots: [],
							boxSlots: []
						}
					},
					error: null
				}
			});

			const result = await operation;
			expect(result.ok).toBe(true);
			if (!result.ok) {
				throw new Error('Expected Pokemon edit operation to succeed.');
			}
			expect([...result.value.bytes]).toEqual([7, 8, 9]);
		}
	);

	test('posts Pokemon edit preview validation with both workspaces and its scope', async () => {
		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });
		worker.emit({ type: 'status', status: 'ready' });

		const validation = engine.validatePokemonEditPreview(
			new Uint8Array([1, 2]),
			new Uint8Array([3, 4]),
			'main.sav',
			{ zone: 'box', box: 0, slot: 1 },
			{ moves: true, metData: false, originalTrainer: false }
		);
		await Promise.resolve();

		const request = worker.posted[1]?.message;
		if (request?.type !== 'request' || request.method !== 'validatePokemonEditPreview') {
			throw new Error('Expected a validatePokemonEditPreview request.');
		}
		expect(request.payload).toMatchObject({
			fileName: 'main.sav',
			source: { zone: 'box', box: 0, slot: 1 },
			scope: { moves: true, metData: false, originalTrainer: false }
		});
		expect(worker.posted[1]?.transfer).toEqual([
			request.payload.baselineBytes,
			request.payload.candidateBytes
		]);

		worker.emit({
			type: 'response',
			id: request.id,
			method: request.method,
			result: { ok: true, value: true, error: null }
		});
		await expect(validation).resolves.toEqual({ ok: true, value: true, error: null });
	});

	test('posts Create Pokemon operations through the worker', async () => {
		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });
		worker.emit({ type: 'status', status: 'ready' });

		const creation = engine.createPokemon(
			new Uint8Array([1, 2, 3]),
			'main.sav',
			{ destination: { zone: 'box', box: 0, slot: 2 }, speciesId: 25, level: 5 },
			0
		);
		await Promise.resolve();

		const request = worker.posted[1]?.message;
		if (request?.type !== 'request' || request.method !== 'createPokemon') {
			throw new Error('Expected a createPokemon request.');
		}
		expect(request.payload.operation).toEqual({
			destination: { zone: 'box', box: 0, slot: 2 },
			speciesId: 25,
			level: 5
		});

		const responseBytes = new Uint8Array([9, 8, 7]).buffer;
		worker.emit({
			type: 'response',
			id: request.id,
			method: 'createPokemon',
			result: {
				ok: true,
				value: {
					bytes: responseBytes,
					mutated: true,
					workspace: {
						summary: {
							fileName: 'main.sav',
							saveType: 'SAV9SV',
							gameVersion: 'SV',
							gameVersionId: 45,
							generation: 9,
							trainerName: 'PKSX',
							trainerId: 41203,
							playTime: '47:12',
							playedHours: 47,
							playedMinutes: 12,
							partyCount: 1,
							boxCount: 1,
							boxSlotCount: 30
						},
						partySlots: [],
						boxSlots: []
					}
				},
				error: null
			}
		});

		const result = await creation;
		expect(result.ok).toBe(true);
		if (!result.ok) throw new Error('Expected Create Pokemon to succeed.');
		expect([...result.value.bytes]).toEqual([9, 8, 7]);
	});

	test('drains pending requests and permanently fails later calls when startup fails', async () => {
		expect.assertions(3);

		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });
		const version = engine.getVersion();

		worker.emit({
			type: 'status',
			status: 'failed',
			error: { code: 'engine-unavailable', message: 'Runtime failed to load.' }
		});

		await expect(version).resolves.toMatchObject({
			ok: false,
			error: { code: 'engine-unavailable', message: 'Runtime failed to load.' }
		});

		await expect(engine.listBoxSlots(new Uint8Array([1]), undefined, 0)).resolves.toMatchObject({
			ok: false,
			error: { code: 'engine-unavailable', message: 'Runtime failed to load.' }
		});
		expect(worker.posted).toHaveLength(1);
	});

	test('returns engine-unavailable when the worker errors before startup status', async () => {
		expect.assertions(2);

		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });
		const version = engine.getVersion();

		worker.emitError('Worker chunk failed to load.');

		await expect(version).resolves.toMatchObject({
			ok: false,
			error: { code: 'engine-unavailable', message: 'Worker chunk failed to load.' }
		});
		await expect(engine.getVersion()).resolves.toMatchObject({
			ok: false,
			error: { code: 'engine-unavailable', message: 'Worker chunk failed to load.' }
		});
	});

	test('returns engine-unavailable when startup messages cannot be deserialized', async () => {
		expect.assertions(1);

		const worker = new FakeWorker();
		const engine = createPkhexWorkerEngine('/pkhex-engine', { createWorker: () => worker });
		const version = engine.getVersion();

		worker.emitMessageError();

		await expect(version).resolves.toMatchObject({
			ok: false,
			error: {
				code: 'engine-unavailable',
				message: 'The PKHeX Engine worker received an unreadable message.'
			}
		});
	});
});
