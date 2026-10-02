import type { StateLegendEntry, StateStyle } from '@versatiles/map-state';
import type { AbstractElement } from '../element/abstract.svelte.js';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { elementText } from './element_names.js';

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
 * backward, or to the back.
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
	const used = new Set(entries.flatMap((entry) => entry.style?.color?.toLowerCase() ?? []));
	const color = doc.colors.getColors().find((c) => !used.has(c)) ?? '#ff0000';
	// an area of the color, without an outline
	const entry: StateLegendEntry = { type: 'polygon', style: { color }, strokeStyle: { visible: false }, label: '' };
	doc.legend = { ...doc.legend, entries: [...entries, entry] };
	doc.state.log();
}

/** The fields of a marker style that a legend entry keeps: not those of its label, whose text is the entry's. */
const MARKER_FIELDS = ['color', 'symbol', 'rotate', 'size'] as const;

function markerLook(style: StateStyle | undefined): StateStyle | undefined {
	const look: StateStyle = {};
	for (const field of MARKER_FIELDS) if (style?.[field] !== undefined) Object.assign(look, { [field]: style[field] });
	return Object.keys(look).length > 0 ? look : undefined;
}

/** A legend entry with the look of the element: a marker, a line, or an area (of a polygon or a circle). */
function legendEntryOf(element: AbstractElement): StateLegendEntry {
	const state = element.getState();
	const entry: StateLegendEntry =
		state.type === 'marker'
			? { type: 'marker', style: markerLook(state.style), label: '' }
			: state.type === 'line'
				? { type: 'line', style: state.style, label: '' }
				: { type: 'polygon', style: state.style, strokeStyle: state.strokeStyle, label: '' };
	if (!entry.style) delete entry.style;
	if (!entry.strokeStyle) delete entry.strokeStyle;
	return entry;
}

/** What an entry shows, without its text, e.g. to find entries that look the same. */
const lookOf = ({ type, style, strokeStyle }: StateLegendEntry) => JSON.stringify([type, style, strokeStyle]);

/**
 * Add an entry to the legend for each look of the selected elements, unless the legend shows it
 * already: its type and style, and the label or popup text that the elements share as its text.
 * Starts a legend if there is none. Returns how many entries were added.
 */
export function addToLegend(doc: MapDocumentInteractive): number {
	const entries = doc.legend?.entries ?? [];
	const known = new Set(entries.map(lookOf));
	const added = new Map<string, { entry: StateLegendEntry; texts: Set<string> }>();
	for (const element of doc.selection.selectedElements) {
		const entry = legendEntryOf(element);
		const look = lookOf(entry);
		if (known.has(look)) continue;
		if (!added.has(look)) added.set(look, { entry, texts: new Set() });
		added.get(look)!.texts.add(elementText(element));
	}
	if (added.size === 0) return 0;
	const news = [...added.values()].map(({ entry, texts }) => ({
		...entry,
		label: texts.size === 1 ? [...texts][0] : ''
	}));
	doc.legend = { ...doc.legend, entries: [...entries, ...news] };
	doc.state.log();
	return news.length;
}

export function pasteStyle(doc: MapDocumentInteractive): void {
	const style = doc.styleClipboard.style;
	if (!canPasteStyle(doc) || !style) return;
	doc.styleClipboard.paste(doc.selection.selectedElements, style);
	doc.state.log();
}
