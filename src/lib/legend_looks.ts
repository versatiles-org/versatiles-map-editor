import type { StateElement, StateLegendEntry, StateStyle } from '@versatiles/map-state';

/*
 * The look of an element as a legend entry shows it, to compare entries with elements: e.g. to add
 * an entry for a look, and to let entries follow when the elements change their style.
 */

/** The fields of a marker style that a legend entry keeps: not those of its label, whose text is the entry's. */
const MARKER_FIELDS = ['color', 'symbol', 'rotate', 'size'] as const;

export function markerLook(style: StateStyle | undefined): StateStyle | undefined {
	const look: StateStyle = {};
	for (const field of MARKER_FIELDS) if (style?.[field] !== undefined) Object.assign(look, { [field]: style[field] });
	return Object.keys(look).length > 0 ? look : undefined;
}

/** A legend entry with the look of the element: a marker, a line, or an area (of a polygon or a circle). */
export function legendEntryOf(state: StateElement): StateLegendEntry {
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

/** A style with its fields in one order, so equal styles give the same text. */
const sorted = (style: StateStyle | undefined) =>
	style && Object.fromEntries(Object.entries(style).sort(([a], [b]) => (a < b ? -1 : 1)));

/** What an entry shows, without its text, e.g. to find entries that look the same. */
export function lookOf({ type, style, strokeStyle }: StateLegendEntry): string {
	return JSON.stringify([type, sorted(style), sorted(strokeStyle)]);
}

/** The look of an element, see `lookOf`. */
export const elementLook = (state: StateElement): string => lookOf(legendEntryOf(state));

/**
 * The entries of the legend after the elements changed their style in one step, from `before` to
 * `after` (the same elements, in the same order): an entry with the look that the elements had
 * gets their new look, if no element has the old look any more and no entry the new one. It keeps
 * its text. Undefined if no entry changes, e.g. after elements were added or removed.
 */
export function followStyleChanges(
	before: StateElement[],
	after: StateElement[],
	entries: StateLegendEntry[]
): { entries: StateLegendEntry[]; changed: StateLegendEntry[] } | undefined {
	if (before.length !== after.length || before.some((element, i) => element.type !== after[i].type)) return;
	// the new looks of each old look that changed
	const changes = new Map<string, Map<string, StateLegendEntry>>();
	for (let i = 0; i < before.length; i++) {
		const from = elementLook(before[i]);
		const to = legendEntryOf(after[i]);
		if (lookOf(to) === from) continue;
		if (!changes.has(from)) changes.set(from, new Map());
		changes.get(from)!.set(lookOf(to), to);
	}
	if (changes.size === 0) return;
	const kept = new Set(after.map(elementLook));
	const shown = new Set(entries.map(lookOf));
	const changed: StateLegendEntry[] = [];
	const result = entries.map((entry) => {
		const looks = changes.get(lookOf(entry));
		// one new look, and the old one is not left, e.g. not where only some of the elements changed
		if (!looks || looks.size !== 1 || kept.has(lookOf(entry))) return entry;
		const [[look, to]] = looks;
		if (shown.has(look)) return entry;
		const followed = { ...to, label: entry.label };
		changed.push(followed);
		return followed;
	});
	return changed.length > 0 ? { entries: result, changed } : undefined;
}

/** The indices of the entries whose look no element has, e.g. after the elements were restyled one by one. */
export function unusedEntries(elements: StateElement[], entries: StateLegendEntry[]): Set<number> {
	const looks = new Set(elements.map(elementLook));
	return new Set(entries.flatMap((entry, i) => (looks.has(lookOf(entry)) ? [] : [i])));
}

/**
 * How the legend shows the look of an element with this text (its label or popup text): with an
 * entry of this look ("shown"), with an entry of this text but another look ("different"), or not.
 */
export function legendShows(
	state: StateElement,
	text: string,
	entries: StateLegendEntry[]
): 'shown' | 'different' | undefined {
	const look = elementLook(state);
	if (entries.some((entry) => lookOf(entry) === look)) return 'shown';
	const name = text.trim();
	if (name && entries.some((entry) => entry.label.trim() === name)) return 'different';
	return undefined;
}
