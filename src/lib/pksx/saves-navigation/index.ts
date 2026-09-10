import type { SaveFileId } from '$lib/pksx/saves';

export type SavesTarget =
	| { kind: 'save-file'; id: SaveFileId }
	| { kind: 'pokemon-storage' }
	| { kind: 'import' };
export type SavesDirection = 'left' | 'right' | 'up' | 'down';

export function resolveSavesTarget(
	targets: SavesTarget[],
	remembered: SavesTarget | null,
	activeSaveFileId: SaveFileId | null
): SavesTarget {
	if (remembered && targetIndex(targets, remembered) >= 0) return remembered;

	const active = activeSaveFileId
		? targets.find((target) => target.kind === 'save-file' && target.id === activeSaveFileId)
		: null;
	return (
		active ??
		targets.find((target) => target.kind === 'save-file') ??
		targets.find((target) => target.kind === 'import') ?? { kind: 'pokemon-storage' }
	);
}

export function moveSavesTarget(
	targets: SavesTarget[],
	current: SavesTarget,
	columns: number,
	direction: SavesDirection
): SavesTarget {
	const index = targetIndex(targets, current);
	if (index < 0 || targets.length === 0) return current;

	const width = Math.max(1, Math.floor(columns));
	const row = Math.floor(index / width);
	const column = index % width;
	let nextIndex = index;

	switch (direction) {
		case 'left':
			if (column > 0) nextIndex = index - 1;
			break;
		case 'right':
			if (column < width - 1 && index + 1 < targets.length) nextIndex = index + 1;
			break;
		case 'up':
			if (row > 0) nextIndex = index - width;
			break;
		case 'down': {
			const nextRowStart = (row + 1) * width;
			if (nextRowStart < targets.length) {
				nextIndex = Math.min(nextRowStart + column, targets.length - 1);
			}
			break;
		}
	}

	return targets[nextIndex] ?? current;
}

export function deleteSavesTarget(
	preDeleteTargets: SavesTarget[],
	deleted: Extract<SavesTarget, { kind: 'save-file' }>
): SavesTarget {
	const saveFiles = preDeleteTargets.filter(
		(target): target is Extract<SavesTarget, { kind: 'save-file' }> => target.kind === 'save-file'
	);
	const deletedIndex = targetIndex(saveFiles, deleted);
	const remaining = saveFiles.filter((target) => !sameSavesTarget(target, deleted));
	return (
		remaining[deletedIndex] ??
		remaining[deletedIndex - 1] ??
		preDeleteTargets.find((target) => target.kind === 'pokemon-storage') ?? { kind: 'import' }
	);
}

export function sameSavesTarget(left: SavesTarget, right: SavesTarget) {
	if (left.kind !== right.kind) return false;
	if (left.kind !== 'save-file') return true;
	return right.kind === 'save-file' && left.id === right.id;
}

function targetIndex(targets: SavesTarget[], target: SavesTarget) {
	return targets.findIndex((candidate) => sameSavesTarget(candidate, target));
}
