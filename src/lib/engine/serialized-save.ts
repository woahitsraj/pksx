import type { EngineResult, SerializedSave } from './types';

export function decodeSerializedSave(
	result: EngineResult<SerializedSave>
): EngineResult<Uint8Array> {
	if (!result.ok) {
		return result;
	}

	return {
		ok: true,
		value: base64ToBytes(result.value.bytesBase64, result.value.byteLength),
		error: null
	};
}

export function base64ToBytes(base64: string, expectedLength?: number): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);

	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}

	if (expectedLength !== undefined && bytes.byteLength !== expectedLength) {
		throw new Error('Serialized Save File byte length did not match the response.');
	}

	return bytes;
}
