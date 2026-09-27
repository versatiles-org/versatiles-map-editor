import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';

/*
 * The commands for the selected elements, shared by the menu, the sidebar and the keyboard
 * shortcuts. Each change is one undo step.
 */

export function duplicateSelection(manager: GeometryManagerInteractive): void {
	const elements = manager.selection.selectedElements;
	if (elements.length === 0) return;
	manager.duplicateElements(elements, [20, 20]);
	manager.state.log();
}

export function deleteSelection(manager: GeometryManagerInteractive): void {
	const elements = manager.selection.selectedElements;
	if (elements.length === 0) return;
	manager.deleteElements(elements);
	manager.state.log();
}

/** Only the style of one element, since several elements can have different styles. */
export function canCopyStyle(manager: GeometryManagerInteractive): boolean {
	return manager.selection.selectedElements.length === 1;
}

export function copyStyle(manager: GeometryManagerInteractive): void {
	if (!canCopyStyle(manager)) return;
	manager.styleClipboard.copy(manager.selection.selectedElements[0]);
}

export function canPasteStyle(manager: GeometryManagerInteractive): boolean {
	return manager.selection.selectedElements.length > 0 && manager.styleClipboard.style !== undefined;
}

export function pasteStyle(manager: GeometryManagerInteractive): void {
	const style = manager.styleClipboard.style;
	if (!canPasteStyle(manager) || !style) return;
	manager.styleClipboard.paste(manager.selection.selectedElements, style);
	manager.state.log();
}
