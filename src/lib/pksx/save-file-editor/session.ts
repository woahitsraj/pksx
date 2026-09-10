import type { SaveFileEditorState } from '.';
import { bytesEqual } from '$lib/pksx/saves';

let activeSession: { revision: Uint8Array; state: SaveFileEditorState } | null = null;

export function restoreSaveFileEditorSession(fresh: SaveFileEditorState, revision: Uint8Array) {
	if (
		activeSession &&
		bytesEqual(activeSession.revision, revision) &&
		activeSession.state.source.saveFileId === fresh.source.saveFileId &&
		activeSession.state.source.identity.key === fresh.source.identity.key
	) {
		return activeSession.state;
	}

	activeSession = { revision, state: fresh };
	return fresh;
}

export function updateSaveFileEditorSession(state: SaveFileEditorState, revision?: Uint8Array) {
	if (revision) activeSession = { revision, state };
	else if (activeSession) activeSession = { ...activeSession, state };
	return state;
}
