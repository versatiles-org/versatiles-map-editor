import type { StateLegendEntry, StateStyle } from '@versatiles/map-state';
import { elementText, LineElement, type AbstractElement } from '../element/index.js';
import type { MapDocumentInteractive } from './map_document_interactive.js';
import { legendEntryOf, lookOf, markerLook } from '../state/index.js';
import { storedStyle, type StyleRole } from '../style/index.js';

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
	// the colors that stand for elements, not e.g. a white halo; the recently used ones first
	const main = doc.elements.flatMap((element) => element.getColors('main').map((c) => c.toLowerCase()));
	const isMain = new Set(main);
	const candidates = [...doc.colors.getColors().filter((c) => isMain.has(c)), ...main.reverse()];
	const color = candidates.find((c) => !used.has(c)) ?? '#ff0000';
	// an area of the color, without an outline
	const entry: StateLegendEntry = { type: 'area', style: { color }, strokeStyle: { visible: false }, label: '' };
	doc.legend = { ...doc.legend, entries: [...entries, entry] };
	doc.state.log();
}

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
		const entry = legendEntryOf(element.getState());
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

/** Whether a style was copied, which an entry of the legend can take. */
export function canPasteStyleToEntry(doc: MapDocumentInteractive): boolean {
	return doc.styleClipboard.style !== undefined;
}

/**
 * Give an entry of the legend the copied style, and the type of the element it was copied from:
 * a marker, a line, or an area. It keeps its text. One undo step.
 */
export function pasteStyleToEntry(doc: MapDocumentInteractive, index: number): void {
	const copied = doc.styleClipboard.style;
	const entries = doc.legend?.entries;
	if (!copied || !entries?.[index]) return;
	const label = entries[index].label;
	// as stored, without the defaults, which the copy has
	const style = (role: StyleRole, s: StateStyle | undefined) => s && storedStyle(role, s);
	const entry: StateLegendEntry = copied.symbol
		? { type: 'marker', style: markerLook(style('symbol', copied.symbol)), label }
		: copied.fill
			? {
					type: 'area',
					style: style('fill', copied.fill),
					strokeStyle: style('outline', copied.stroke),
					label
				}
			: { type: 'line', style: style('line', copied.stroke), label };
	if (!entry.style) delete entry.style;
	if (!entry.strokeStyle) delete entry.strokeStyle;
	doc.legend = { ...doc.legend, entries: entries.map((e, i) => (i === index ? entry : e)) };
	doc.state.log();
}

/**
 * Give an entry of the legend the type and the style of the element, e.g. picked on the map with
 * the pipette. It keeps its text. One undo step.
 */
export function takeStyleForEntry(doc: MapDocumentInteractive, index: number, element: AbstractElement): void {
	const entries = doc.legend?.entries;
	if (!entries?.[index]) return;
	const entry = { ...legendEntryOf(element.getState()), label: entries[index].label };
	doc.legend = { ...doc.legend, entries: entries.map((e, i) => (i === index ? entry : e)) };
	doc.state.log();
}

export function pasteStyle(doc: MapDocumentInteractive): void {
	const style = doc.styleClipboard.style;
	if (!canPasteStyle(doc) || !style) return;
	doc.styleClipboard.paste(doc.selection.selectedElements, style);
	doc.state.log();
}

/** The selected lines, e.g. to reverse them. */
function selectedLines(doc: MapDocumentInteractive): LineElement[] {
	return doc.selection.selectedElements.filter((element) => element instanceof LineElement);
}

/**
 * Reverse the points of the selected lines, so they run the other way: their arrowheads point the
 * other way, e.g. of a line drawn from its end. The style keeps its start and its end. A selected
 * point stays selected. One undo step.
 */
export function reverseLines(doc: MapDocumentInteractive): void {
	const lines = selectedLines(doc);
	if (lines.length === 0) return;
	const node = doc.selection.selectedNode;
	for (const line of lines) line.reverse();
	const single = doc.selection.selectedElement;
	if (node && single instanceof LineElement) doc.selection.selectNode(single.path.length - 1 - node.index);
	doc.state.log();
}
