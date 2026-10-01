import type { MapDocumentInteractive } from '../map_document_interactive.js';

/*
 * The commands for the selected elements, shared by the menu, the sidebar and the keyboard
 * shortcuts. Each change is one undo step.
 */

export function duplicateSelection(doc: MapDocumentInteractive): void {
	const elements = doc.selection.selectedElements;
	if (elements.length === 0) return;
	doc.duplicateElements(elements, [20, 20]);
	doc.state.log();
}

/**
 * Move the selected elements in the drawing order: to the front, one step forward, one step
 * backward, or to the back. Within their layer: areas stay under lines, lines under markers.
 */
export function moveSelection(doc: MapDocumentInteractive, to: 'front' | 'forward' | 'backward' | 'back'): void {
	const elements = doc.selection.selectedElements;
	if (elements.length === 0) return;
	doc.moveElements(elements, to);
	doc.state.log();
}

export function deleteSelection(doc: MapDocumentInteractive): void {
	const elements = doc.selection.selectedElements;
	if (elements.length === 0) return;
	doc.deleteElements(elements);
	doc.state.log();
}

/** Only the style of one element, since several elements can have different styles. */
export function canCopyStyle(doc: MapDocumentInteractive): boolean {
	return doc.selection.selectedElements.length === 1;
}

export function copyStyle(doc: MapDocumentInteractive): void {
	if (!canCopyStyle(doc)) return;
	doc.styleClipboard.copy(doc.selection.selectedElements[0]);
}

export function canPasteStyle(doc: MapDocumentInteractive): boolean {
	return doc.selection.selectedElements.length > 0 && doc.styleClipboard.style !== undefined;
}

/** Add an entry to the legend, or start a legend. It starts with a color of the map that the legend does not show yet. */
export function addLegendEntry(doc: MapDocumentInteractive): void {
	const entries = doc.legend?.entries ?? [];
	const used = new Set(entries.map((entry) => entry.color.toLowerCase()));
	const color = doc.colors.getColors().find((c) => !used.has(c)) ?? '#ff0000';
	doc.legend = { ...doc.legend, entries: [...entries, { color, label: '' }] };
	doc.state.log();
}

export function pasteStyle(doc: MapDocumentInteractive): void {
	const style = doc.styleClipboard.style;
	if (!canPasteStyle(doc) || !style) return;
	doc.styleClipboard.paste(doc.selection.selectedElements, style);
	doc.state.log();
}
