import type { MapDocumentInteractive } from '../map_document_interactive.js';

/*
 * The commands for the selected elements, shared by the menu, the sidebar and the keyboard
 * shortcuts. Each change is one undo step.
 */

export function duplicateSelection(manager: MapDocumentInteractive): void {
	const elements = manager.selection.selectedElements;
	if (elements.length === 0) return;
	manager.duplicateElements(elements, [20, 20]);
	manager.state.log();
}

export function deleteSelection(manager: MapDocumentInteractive): void {
	const elements = manager.selection.selectedElements;
	if (elements.length === 0) return;
	manager.deleteElements(elements);
	manager.state.log();
}

/** Only the style of one element, since several elements can have different styles. */
export function canCopyStyle(manager: MapDocumentInteractive): boolean {
	return manager.selection.selectedElements.length === 1;
}

export function copyStyle(manager: MapDocumentInteractive): void {
	if (!canCopyStyle(manager)) return;
	manager.styleClipboard.copy(manager.selection.selectedElements[0]);
}

export function canPasteStyle(manager: MapDocumentInteractive): boolean {
	return manager.selection.selectedElements.length > 0 && manager.styleClipboard.style !== undefined;
}

/** Add an entry to the legend, or start a legend. It starts with a color of the map that the legend does not show yet. */
export function addLegendEntry(manager: MapDocumentInteractive): void {
	const entries = manager.legend?.entries ?? [];
	const used = new Set(entries.map((entry) => entry.color.toLowerCase()));
	const color = manager.colors.getColors().find((c) => !used.has(c)) ?? '#ff0000';
	manager.legend = { ...manager.legend, entries: [...entries, { color, label: '' }] };
	manager.state.log();
}

export function pasteStyle(manager: MapDocumentInteractive): void {
	const style = manager.styleClipboard.style;
	if (!canPasteStyle(manager) || !style) return;
	manager.styleClipboard.paste(manager.selection.selectedElements, style);
	manager.state.log();
}
