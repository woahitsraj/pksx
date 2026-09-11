export function stableAutomaticBackupId(input: {
	saveFileId: string;
	importedAt: string;
	persistedRevision: string;
	bytes: Uint8Array;
}) {
	const owner = hashString(
		`${input.saveFileId}\u0000${input.importedAt}\u0000${input.persistedRevision}`
	);
	const content = hashBytes(input.bytes);
	return `save-file-edit-${owner}-${input.bytes.byteLength}-${content}`;
}

function hashString(value: string) {
	return hashBytes(new TextEncoder().encode(value));
}

function hashBytes(bytes: Uint8Array) {
	let left = 0x811c9dc5;
	let right = 0x9e3779b9;
	for (const byte of bytes) {
		left = Math.imul(left ^ byte, 0x01000193);
		right = Math.imul(right ^ byte, 0x85ebca6b);
	}
	return `${(left >>> 0).toString(36)}${(right >>> 0).toString(36)}`;
}
