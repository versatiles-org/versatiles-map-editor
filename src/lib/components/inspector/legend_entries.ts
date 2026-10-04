import {
	ARROW_DEFAULTS,
	formatHex,
	LINE_DEFAULTS,
	parseColor,
	removeDefaultFields,
	SYMBOL_DEFAULTS,
	withoutUnusedFields,
	type StateLegend,
	type StateLegendEntry,
	type StateStyle
} from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../../editor/index.js';

// Editing the legend and its entries in the inspector. The changes are not logged unless said, so
// e.g. typing a text is one undo step when the field is left.

/** The legend of the map, or one without entries. */
export function legendOf(doc: MapDocumentInteractive): StateLegend {
	return doc.legend ?? { entries: [] };
}

/** Change the legend. A legend without entries is no legend. */
export function updateLegend(doc: MapDocumentInteractive, change: Partial<StateLegend>) {
	const next = { ...legendOf(doc), ...change };
	doc.legend = next.entries.length > 0 ? next : undefined;
}

/** Change fields of an entry. */
export function updateEntry(doc: MapDocumentInteractive, index: number, change: Partial<StateLegendEntry>) {
	replaceEntry(doc, index, (entry) => ({ ...entry, ...change }));
}

function replaceEntry(
	doc: MapDocumentInteractive,
	index: number,
	replace: (entry: StateLegendEntry) => StateLegendEntry
) {
	const { entries } = legendOf(doc);
	updateLegend(doc, { entries: entries.map((entry, i) => (i === index ? replace(entry) : entry)) });
}

/** The main color of an entry: of its symbol, its line or its area. */
export const colorOf = (entry: StateLegendEntry) => entry.style?.color ?? SYMBOL_DEFAULTS.color;

/**
 * Another type for the entry, in its color: a marker with the default symbol, a line, or an area
 * without an outline, as a new entry is. Logged.
 */
export function setEntryType(doc: MapDocumentInteractive, index: number, type: StateLegendEntry['type']) {
	const entry = legendOf(doc).entries[index];
	if (!entry || type === entry.type) return;
	const style = { color: colorOf(entry) };
	replaceEntry(doc, index, () =>
		type === 'polygon'
			? { type, style, strokeStyle: { visible: false }, label: entry.label }
			: { type, style, label: entry.label }
	);
	doc.state.log();
}

/**
 * Draw the outline of an area entry, or not. An outline without a color of its own gets the
 * color of the fill, opaque, instead of the default red. Logged.
 */
export function setEntryOutline(doc: MapDocumentInteractive, index: number, visible: boolean) {
	const entry = legendOf(doc).entries[index];
	if (!entry) return;
	const outline = entryStyle(doc, index, 'strokeStyle', LINE_DEFAULTS);
	if (visible && !entry.strokeStyle?.color) {
		const fill = parseColor(colorOf(entry));
		if (fill) outline.color = formatHex({ ...fill, alpha: 1 });
	}
	outline.visible = visible;
	doc.state.log();
}

/** The entry with the style (`style` or `strokeStyle`), without it if it is undefined. */
function withStyle(entry: StateLegendEntry, key: 'style' | 'strokeStyle', style: StateStyle | undefined) {
	const result = { ...entry };
	if (style) result[key] = style;
	else delete result[key];
	return result;
}

/**
 * A style of an entry with the properties of the style of an element (see StyleFill and
 * StyleStroke), which edit it like that of an element: a field that gets its default is left out.
 */
export function entryStyle(
	doc: MapDocumentInteractive,
	index: number,
	key: 'style' | 'strokeStyle',
	defaults: StateStyle
) {
	const get = () => ({ ...defaults, ...legendOf(doc).entries[index]?.[key] });
	const set = (field: keyof StateStyle, value: unknown) => {
		// e.g. without the size of arrowheads that are switched off
		const style = removeDefaultFields(withoutUnusedFields({ ...get(), [field]: value }), defaults);
		replaceEntry(doc, index, (entry) => withStyle(entry, key, style));
	};
	return {
		get color() {
			return get().color!;
		},
		set color(value: string) {
			set('color', value);
		},
		get pattern() {
			return get().pattern!;
		},
		set pattern(value: number) {
			set('pattern', value);
		},
		// the name of the pattern of lines in LineStyle
		get dashed() {
			return get().pattern!;
		},
		set dashed(value: number) {
			set('pattern', value);
		},
		get width() {
			return get().width!;
		},
		set width(value: number) {
			set('width', value);
		},
		get visible() {
			return get().visible !== false;
		},
		set visible(value: boolean) {
			set('visible', value);
		},
		// the arrowheads of a line, with `ARROW_DEFAULTS` in `defaults`
		get arrowStart() {
			return get().arrowStart ?? 0;
		},
		set arrowStart(value: number) {
			set('arrowStart', value);
		},
		get arrowEnd() {
			return get().arrowEnd ?? 0;
		},
		set arrowEnd(value: number) {
			set('arrowEnd', value);
		},
		get arrowSize() {
			return get().arrowSize ?? ARROW_DEFAULTS.arrowSize;
		},
		set arrowSize(value: number) {
			set('arrowSize', value);
		}
	};
}
