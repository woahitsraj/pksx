import { describe, expect, it } from 'vitest';

import { focusActionCommand, focusBoxSlot } from '../box-navigation';
import {
	createSummonedWorkflowOwner,
	dismissSummonedWorkflow,
	dispatchSlotMenuAction,
	getLaunchingSlot,
	isDestinationInputSuspended,
	isSummonedWorkflowPresented,
	openRelatedSummonedWorkflow,
	openSummonedWorkflow
} from './index';

describe('summoned workflow ownership', () => {
	it('owns a related workflow, its launch chain, input suspension, and focus return', () => {
		expect.assertions(14);

		const slotMenu = openSummonedWorkflow(createSummonedWorkflowOwner(), 'slot-menu', {
			type: 'slot',
			id: 'box-2-slot-8',
			paneId: 'pane-active-save',
			box: 2,
			focus: { zone: 'box', slot: 8 }
		});
		expect(slotMenu.active?.kind).toBe('slot-menu');
		expect(isDestinationInputSuspended(slotMenu)).toBe(true);
		expect(getLaunchingSlot(slotMenu)).toMatchObject({
			paneId: 'pane-active-save',
			box: 2,
			focus: focusBoxSlot(8)
		});

		const editor = openRelatedSummonedWorkflow(slotMenu, 'pokemon-editor', {
			type: 'control',
			id: 'slot-action-0'
		});
		expect(editor.active?.kind).toBe('pokemon-editor');
		expect(editor.active?.launcher).toEqual({
			type: 'control',
			id: 'slot-action-0'
		});
		expect(isSummonedWorkflowPresented(editor, 'slot-menu')).toBe(true);
		expect(getLaunchingSlot(editor)?.focus).toEqual(focusBoxSlot(8));

		const report = openRelatedSummonedWorkflow(editor, 'legality-report', {
			type: 'control',
			id: 'pokemon-editor-legality-report'
		});
		const dismissedReport = dismissSummonedWorkflow(report);
		expect(dismissedReport.owner.active?.kind).toBe('pokemon-editor');
		expect(dismissedReport.owner.active).toBe(editor.active);
		expect(dismissedReport.returnLauncher).toEqual({
			type: 'control',
			id: 'pokemon-editor-legality-report'
		});
		expect(isDestinationInputSuspended(dismissedReport.owner)).toBe(true);

		const dismissedEditor = dismissSummonedWorkflow(dismissedReport.owner);
		expect(dismissedEditor.owner.active?.kind).toBe('slot-menu');
		expect(dismissedEditor.returnLauncher).toEqual({ type: 'control', id: 'slot-action-0' });
		expect(isDestinationInputSuspended(dismissedEditor.owner)).toBe(true);
	});

	it('dispatches Slot Menu navigation without moving destination focus', () => {
		expect(dispatchSlotMenuAction(focusActionCommand(0), 'down', 3)).toEqual({
			focus: focusActionCommand(1, 3),
			effect: 'none'
		});
		expect(dispatchSlotMenuAction(focusActionCommand(2, 3), 'confirm', 3)).toEqual({
			focus: focusActionCommand(2, 3),
			effect: 'dismiss'
		});
		expect(dispatchSlotMenuAction(focusActionCommand(1, 3), 'nextBox', 3)).toEqual({
			focus: focusActionCommand(1, 3),
			effect: 'none'
		});
	});

	it('keeps an existing workflow when another root workflow tries to open', () => {
		const sourcePicker = openSummonedWorkflow(createSummonedWorkflowOwner(), 'source-picker', {
			type: 'control',
			id: 'top-control-5'
		});

		expect(
			openSummonedWorkflow(sourcePicker, 'slot-menu', {
				type: 'slot',
				id: 'box-0-slot-0',
				paneId: 'pane-pokemon-storage',
				box: 0,
				focus: { zone: 'box', slot: 0 }
			})
		).toBe(sourcePicker);
	});

	it('opens the route-independent Backup Browser and returns its destination launcher', () => {
		const owner = openSummonedWorkflow(createSummonedWorkflowOwner(), 'backup-browser', {
			type: 'control',
			id: 'browse-backups'
		});

		expect(owner.active?.kind).toBe('backup-browser');
		expect(dismissSummonedWorkflow(owner)).toEqual({
			owner: createSummonedWorkflowOwner(),
			returnLauncher: { type: 'control', id: 'browse-backups' }
		});
	});
});
