import { describe, expect, test } from 'vitest';
import type { EngineResult, EngineVersion, SaveSummary } from './types';
import {
	createEngineWorkerProtocolError,
	createEngineWorkerResponse,
	parseEngineWorkerInitMessage,
	parseEngineWorkerMessage,
	parseEngineWorkerProtocolError,
	parseEngineWorkerRequest,
	parseEngineWorkerResponse,
	parseEngineWorkerStatusMessage,
	pokemonActionPreviewSchema
} from './worker-protocol';
import type { EngineWorkerGetVersionRequest } from './worker-protocol';

describe('parseEngineWorkerInitMessage', () => {
	test('parses worker initialization with an explicit engine base path', () => {
		expect.assertions(1);

		expect(parseEngineWorkerInitMessage({ type: 'init', basePath: '/pkhex-engine' })).toEqual({
			ok: true,
			value: { type: 'init', basePath: '/pkhex-engine' }
		});
	});

	test('rejects malformed initialization messages', () => {
		expect.assertions(1);

		expect(parseEngineWorkerInitMessage({ type: 'init', basePath: '' })).toMatchObject({
			ok: false,
			error: { code: 'invalid-worker-message' }
		});
	});
});

describe('parseEngineWorkerRequest', () => {
	test('parses a version request with a required id', () => {
		expect.assertions(1);

		expect(
			parseEngineWorkerRequest({ type: 'request', id: 'req-1', method: 'getVersion' })
		).toEqual({
			ok: true,
			value: { type: 'request', id: 'req-1', method: 'getVersion' }
		});
	});

	test('parses save summary and box slot requests with ArrayBuffer bytes', () => {
		expect.assertions(3);

		const saveBytes = new ArrayBuffer(3);
		const boxBytes = new ArrayBuffer(4);
		const legalityBytes = new ArrayBuffer(5);

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-2',
				method: 'summarizeSave',
				payload: { bytes: saveBytes, fileName: 'main.sav' }
			})
		).toEqual({
			ok: true,
			value: {
				type: 'request',
				id: 'req-2',
				method: 'summarizeSave',
				payload: { bytes: saveBytes, fileName: 'main.sav' }
			}
		});

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-3',
				method: 'listBoxSlots',
				payload: { bytes: boxBytes, box: 0 }
			})
		).toEqual({
			ok: true,
			value: {
				type: 'request',
				id: 'req-3',
				method: 'listBoxSlots',
				payload: { bytes: boxBytes, box: 0 }
			}
		});

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-3b',
				method: 'checkSlotLegality',
				payload: {
					bytes: legalityBytes,
					fileName: 'main.sav',
					source: { zone: 'box', box: 0, slot: 0 }
				}
			})
		).toEqual({
			ok: true,
			value: {
				type: 'request',
				id: 'req-3b',
				method: 'checkSlotLegality',
				payload: {
					bytes: legalityBytes,
					fileName: 'main.sav',
					source: { zone: 'box', box: 0, slot: 0 }
				}
			}
		});
	});

	test('rejects unknown methods as invalid worker messages and echoes usable ids', () => {
		expect.assertions(1);

		expect(
			parseEngineWorkerRequest({ type: 'request', id: 'req-4', method: 'inspectParty' })
		).toMatchObject({
			ok: false,
			id: 'req-4',
			error: { code: 'invalid-worker-message' }
		});
	});

	test('parses Pokemon edit requests with staged Met Data operations', () => {
		expect.assertions(1);

		const bytes = new ArrayBuffer(4);

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-edit',
				method: 'applyPokemonEditOperation',
				payload: {
					bytes,
					fileName: 'main.sav',
					operation: {
						source: { zone: 'box', box: 0, slot: 0 },
						level: 24,
						metData: {
							locationId: 16,
							metLevel: 10,
							originGameId: 3,
							ballId: 4
						},
						originalTrainer: { name: 'RAJAN', trainerId: 12345 }
					},
					activeBox: 0
				}
			})
		).toEqual({
			ok: true,
			value: {
				type: 'request',
				id: 'req-edit',
				method: 'applyPokemonEditOperation',
				payload: {
					bytes,
					fileName: 'main.sav',
					operation: {
						source: { zone: 'box', box: 0, slot: 0 },
						level: 24,
						metData: {
							locationId: 16,
							metLevel: 10,
							originGameId: 3,
							ballId: 4
						},
						originalTrainer: { name: 'RAJAN', trainerId: 12345 }
					},
					activeBox: 0
				}
			}
		});
	});

	test('parses Create Pokemon requests with Save File defaults', () => {
		const bytes = new ArrayBuffer(4);

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-create',
				method: 'createPokemon',
				payload: {
					bytes,
					fileName: 'main.sav',
					operation: {
						destination: { zone: 'box', box: 0, slot: 2 },
						level: 5
					},
					activeBox: 0
				}
			})
		).toEqual({
			ok: true,
			value: {
				type: 'request',
				id: 'req-create',
				method: 'createPokemon',
				payload: {
					bytes,
					fileName: 'main.sav',
					operation: {
						destination: { zone: 'box', box: 0, slot: 2 },
						level: 5
					},
					activeBox: 0
				}
			}
		});
	});

	test('rejects malformed request payload types without applying domain validation', () => {
		expect.assertions(2);

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-5',
				method: 'summarizeSave',
				payload: { bytes: new Uint8Array([1, 2, 3]) }
			})
		).toMatchObject({
			ok: false,
			id: 'req-5',
			error: { code: 'invalid-worker-message' }
		});

		expect(
			parseEngineWorkerRequest({
				type: 'request',
				id: 'req-6',
				method: 'listBoxSlots',
				payload: { bytes: new ArrayBuffer(1), box: -1 }
			})
		).toMatchObject({
			ok: true,
			value: { payload: { box: -1 } }
		});
	});
});

describe('parseEngineWorkerResponse', () => {
	test('parses correlated responses and preserves shallow result values', () => {
		expect.assertions(1);

		const result: EngineResult<SaveSummary> = {
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
		};

		expect(
			parseEngineWorkerResponse({
				type: 'response',
				id: 'req-7',
				method: 'summarizeSave',
				result
			})
		).toEqual({
			ok: true,
			value: { type: 'response', id: 'req-7', method: 'summarizeSave', result }
		});
	});

	test('rejects malformed response envelopes', () => {
		expect.assertions(2);

		expect(
			parseEngineWorkerResponse({
				type: 'response',
				id: 'req-8',
				method: 'getVersion',
				result: { ok: true, error: null }
			})
		).toMatchObject({
			ok: false,
			id: 'req-8',
			error: { code: 'invalid-worker-message' }
		});

		expect(
			parseEngineWorkerResponse({
				type: 'response',
				id: 'req-9',
				method: 'version',
				result: { ok: true, value: {}, error: null }
			})
		).toMatchObject({
			ok: false,
			id: 'req-9',
			error: { code: 'invalid-worker-message' }
		});
	});

	test('normalizes failed response results with EngineError data', () => {
		expect.assertions(2);

		expect(
			parseEngineWorkerResponse({
				type: 'response',
				id: 'req-10',
				method: 'listBoxSlots',
				result: {
					ok: false,
					value: null,
					error: { code: 'invalid-box', message: 'Box 99 is outside the save range.' }
				}
			})
		).toEqual({
			ok: true,
			value: {
				type: 'response',
				id: 'req-10',
				method: 'listBoxSlots',
				result: {
					ok: false,
					value: null,
					error: { code: 'invalid-box', message: 'Box 99 is outside the save range.' }
				}
			}
		});

		expect(
			parseEngineWorkerResponse({
				type: 'response',
				id: 'req-10b',
				method: 'listBoxSlots',
				result: {
					ok: false,
					value: null,
					error: { code: 'pkhex-exception', message: 'Unexpected PKHeX failure.' }
				}
			})
		).toMatchObject({
			ok: true,
			value: {
				result: {
					ok: false,
					error: { code: 'unknown-engine-error', message: 'Unexpected PKHeX failure.' }
				}
			}
		});
	});

	test('preserves stale Pokemon Action preview errors', () => {
		expect(
			parseEngineWorkerResponse({
				type: 'response',
				id: 'req-stale-action',
				method: 'applyPokemonAction',
				result: {
					ok: false,
					value: null,
					error: {
						code: 'stale-pokemon-action-preview',
						message: 'Refresh the Legality Report and try again.'
					}
				}
			})
		).toMatchObject({
			ok: true,
			value: {
				result: { ok: false, error: { code: 'stale-pokemon-action-preview' } }
			}
		});
	});
});

describe('worker protocol messages', () => {
	test('parses protocol errors with and without ids', () => {
		expect.assertions(2);

		expect(
			parseEngineWorkerProtocolError({
				type: 'protocol-error',
				id: 'req-11',
				error: { code: 'invalid-worker-message', message: 'Bad request.' }
			})
		).toEqual({
			ok: true,
			value: {
				type: 'protocol-error',
				id: 'req-11',
				error: { code: 'invalid-worker-message', message: 'Bad request.' }
			}
		});

		expect(
			parseEngineWorkerProtocolError({
				type: 'protocol-error',
				error: { code: 'invalid-worker-message', message: 'Bad request.' }
			})
		).toEqual({
			ok: true,
			value: {
				type: 'protocol-error',
				error: { code: 'invalid-worker-message', message: 'Bad request.' }
			}
		});
	});

	test('parses worker status messages', () => {
		expect.assertions(2);

		expect(parseEngineWorkerStatusMessage({ type: 'status', status: 'ready' })).toEqual({
			ok: true,
			value: { type: 'status', status: 'ready' }
		});

		expect(
			parseEngineWorkerStatusMessage({
				type: 'status',
				status: 'failed',
				error: { code: 'engine-unavailable', message: 'Runtime failed to load.' }
			})
		).toEqual({
			ok: true,
			value: {
				type: 'status',
				status: 'failed',
				error: { code: 'engine-unavailable', message: 'Runtime failed to load.' }
			}
		});
	});

	test('parses known message categories and rejects unknown categories', () => {
		expect.assertions(4);

		const version: EngineResult<EngineVersion> = {
			ok: true,
			value: { pkhexCoreVersion: '1.0.0', facadeVersion: '1.0.0' },
			error: null
		};

		expect(
			parseEngineWorkerMessage({ type: 'request', id: 'req-12', method: 'getVersion' })
		).toMatchObject({
			ok: true,
			value: { type: 'request' }
		});

		expect(parseEngineWorkerMessage({ type: 'init', basePath: '/pkhex-engine' })).toMatchObject({
			ok: true,
			value: { type: 'init' }
		});

		expect(
			parseEngineWorkerMessage({
				type: 'response',
				id: 'req-12',
				method: 'getVersion',
				result: version
			})
		).toMatchObject({
			ok: true,
			value: { type: 'response' }
		});

		expect(parseEngineWorkerMessage({ type: 'event', id: 'req-13' })).toMatchObject({
			ok: false,
			id: 'req-13',
			error: { code: 'invalid-worker-message' }
		});
	});
});

describe('worker protocol builders', () => {
	test('creates correlated responses and protocol errors', () => {
		expect.assertions(2);

		const request: EngineWorkerGetVersionRequest = {
			type: 'request',
			id: 'req-14',
			method: 'getVersion'
		};
		const result: EngineResult<EngineVersion> = {
			ok: true,
			value: { pkhexCoreVersion: '1.0.0', facadeVersion: '1.0.0' },
			error: null
		};

		expect(createEngineWorkerResponse(request, result)).toEqual({
			type: 'response',
			id: 'req-14',
			method: 'getVersion',
			result
		});

		expect(
			createEngineWorkerProtocolError(
				{ code: 'invalid-worker-message', message: 'Malformed request.' },
				'req-15'
			)
		).toEqual({
			type: 'protocol-error',
			id: 'req-15',
			error: { code: 'invalid-worker-message', message: 'Malformed request.' }
		});
	});
});

describe('pokemonActionPreviewSchema', () => {
	test('keeps fix ids only on fixable report lines and validates targeted fixes', () => {
		const preview = pokemonActionPreviewSchema.parse({
			legalityReport: {
				legal: false,
				judgement: 'Invalid',
				summary: 'One fixable problem.',
				fixableProblems: [],
				warnings: [{ severity: 'Fishy', identifier: 'Encounter', message: 'Review encounter.' }],
				messages: [
					{
						severity: 'Invalid',
						identifier: 'CurrentMove',
						message: 'Invalid move.',
						fixId: 'move-set'
					}
				]
			},
			actions: [
				{
					kind: 'legality-fix',
					available: true,
					unavailableReason: null,
					changes: [],
					choices: [],
					fixes: [
						{
							id: 'move-set',
							token: 'move-set:preview-token',
							label: 'Move Set',
							changes: [{ field: 'Moves', before: 'Tackle', after: 'Headbutt' }]
						}
					]
				}
			]
		});

		expect(preview.legalityReport.warnings[0]).not.toHaveProperty('fixId');
		expect(preview.legalityReport.messages[0]).toHaveProperty('fixId', 'move-set');
		expect(preview.actions[0]?.fixes[0]).toMatchObject({
			id: 'move-set',
			token: 'move-set:preview-token',
			label: 'Move Set'
		});
	});
});
