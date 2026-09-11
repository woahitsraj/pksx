export class WorkspaceRevisionConflictError extends Error {
	constructor() {
		super('The persisted Workspace changed before this write.');
		this.name = 'WorkspaceRevisionConflictError';
	}
}

export function nextWorkspaceRevision(previous: string | undefined, now: string) {
	if (!previous || now > previous) return now;
	const previousTime = Date.parse(previous);
	return Number.isNaN(previousTime) ? now : new Date(previousTime + 1).toISOString();
}
