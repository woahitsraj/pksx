import { describe, expect, test } from 'vitest';
import { parseEngineResult } from './pkhex-engine';

describe('parseEngineResult', () => {
	test('parses valid success results', () => {
		expect.assertions(1);

		const result = parseEngineResult<{ gameVersion: string; gameVersionId: number }>(
			JSON.stringify({
				ok: true,
				value: { gameVersion: 'SV', gameVersionId: 45 },
				error: null
			})
		);

		expect(result).toEqual({
			ok: true,
			value: { gameVersion: 'SV', gameVersionId: 45 },
			error: null
		});
	});

	test('normalizes malformed JSON to an invalid engine response', () => {
		expect.assertions(1);

		expect(parseEngineResult('not json')).toEqual({
			ok: false,
			value: null,
			error: {
				code: 'invalid-engine-response',
				message: 'Pokemon data could not be read.'
			}
		});
	});

	test('normalizes unknown engine error codes', () => {
		expect.assertions(1);

		const result = parseEngineResult(
			JSON.stringify({
				ok: false,
				value: null,
				error: { code: 'pkhex-exception', message: 'Unexpected PKHeX failure.' }
			})
		);

		expect(result).toEqual({
			ok: false,
			value: null,
			error: {
				code: 'unknown-engine-error',
				message: 'Unexpected PKHeX failure.'
			}
		});
	});

	test('preserves known engine error codes', () => {
		expect.assertions(1);

		const result = parseEngineResult(
			JSON.stringify({
				ok: false,
				value: null,
				error: {
					code: 'unsupported-save',
					message: 'PKHeX.Core could not recognize this save file.'
				}
			})
		);

		expect(result).toMatchObject({
			ok: false,
			error: { code: 'unsupported-save' }
		});
	});
});
