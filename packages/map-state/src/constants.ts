import type { StateElement } from './types.js';

export const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const BASE64_CODE2BITS: [boolean, boolean, boolean, boolean, boolean, boolean][] = [];

for (let i = 0; i < BASE64_CHARS.length; i++) {
	BASE64_CODE2BITS[BASE64_CHARS.charCodeAt(i)] = [
		(i & 32) > 0,
		(i & 16) > 0,
		(i & 8) > 0,
		(i & 4) > 0,
		(i & 2) > 0,
		(i & 1) > 0
	];
}

/** The bits as base64 characters, 6 bits each; the last ones filled up with zeros. */
export function bitsToBase64(bits: boolean[]): string {
	const chars: string[] = [];
	for (let i = 0; i < bits.length; i += 6) {
		let value = 0;
		for (let j = i; j < i + 6; j++) value = 2 * value + (bits[j] ? 1 : 0);
		chars.push(BASE64_CHARS[value]);
	}
	return chars.join('');
}

/**
 * The version of the format, at the start of every hash. Only this version is read. (Version 0,
 * the original format, is not supported any more.)
 * @category Links
 */
export const CODEC_VERSION = 1;

/** The origin of the coordinates is rounded to 1/100 degree, which is short and near enough. */
export const ORIGIN_SCALE = 100;

// The keys of the fields in the base64 format, the same for writer and reader. A list of fields
// (e.g. of the metadata) ends with `END_KEY`. A key is an Exp-Golomb code (see
// `StateWriter.writeKey`), so no list has a last key: a field that is added later gets the next
// number. The numbers are in the order of how often the fields are expected, the frequent ones
// first, since a small number is a short code; they are part of the format and never change.

/** The end of a list of fields. */
export const END_KEY = 0;

/**
 * The parameter k of the Exp-Golomb code of the keys of each list, and of the version: with 0,
 * the key 0 costs 1 bit, 1 and 2 cost 3 bits, 3 to 6 cost 5 bits; with 1, the keys 0 and 1 cost 2
 * bits, 2 to 5 cost 4 bits, 6 to 13 cost 6 bits; with 2, 0 to 3 cost 3 bits, 4 to 11 cost 5 bits.
 * Chosen by measuring the example maps (2026-10-08).
 */
export const KEY_PARAMETERS = {
	version: 2,
	element: 0,
	metadata: 1,
	background: 1,
	frame: 0,
	viewer: 0,
	legend: 0,
	legendEntry: 1,
	elementFields: 0
} as const;

/**
 * The type of an element. Markers are the most of the elements of most maps, so theirs is the
 * shortest; `ELEMENT_END` is among them, since it is written once per map.
 */
export const ELEMENT_KEYS = { marker: 0, line: 1, polygon: 3, circle: 4 } as const satisfies Record<
	StateElement['type'],
	number
>;
/** The end of the elements, in place of the type of a next one. */
export const ELEMENT_END = 2;

/** The fields of the metadata. A link for viewing has neither a title nor a color scheme. */
export const METADATA_KEYS = {
	background: 1,
	legend: 2,
	viewer: 3,
	labelOverlap: 4,
	labelMinZoom: 5,
	mapLabelsOnTop: 6,
	title: 7,
	colorScheme: 8
} as const;

/**
 * The fields of the background map. A key alone is a flag: the satellite map, no streets or no
 * borders over the imagery, the relief shaded, the terrain raised, the buildings extruded.
 */
export const BACKGROUND_KEYS = {
	theme: 1,
	satellite: 2,
	labels: 3,
	language: 4,
	colors: 5,
	haloWidth: 6,
	labelSize: 7,
	font: 8,
	noStreets: 9,
	noBorders: 10,
	hillshade: 11,
	terrain: 12,
	extruded: 13,
	options: 14
} as const;

/** A theme of the background map is its index in `BACKGROUND_THEMES` in 5 bits; this one is followed by its name. */
export const BACKGROUND_THEME_TEXT = 31;
/** A language of the labels is its index in `BACKGROUND_LANGUAGES` in 4 bits; this one is followed by its name. */
export const BACKGROUND_LANGUAGE_TEXT = 15;
/** The steps of the numbers of the background map in a link, as its sliders have them: per 1. */
export const BACKGROUND_STEPS = { labelSize: 20, haloWidth: 4, colors: 20 } as const;

/** The fields of the legend. */
export const LEGEND_KEYS = { entries: 1, theme: 2, layout: 3, font: 4, bold: 5, italic: 6 } as const;

/** The fields of an entry of the legend. */
export const LEGEND_ENTRY_KEYS = { type: 1, style: 2, label: 3, outlineStyle: 4 } as const;

/**
 * The settings of a frame besides its area: how the map is turned when it opens, and what its
 * viewers can do. Each only if it differs from its default; a flag is its key alone.
 */
export const FRAME_KEYS = {
	bearing: 1,
	rotate: 2,
	pitch: 3,
	tilt: 4,
	confine: 5,
	scrollFree: 6,
	noZoom: 7,
	noPan: 8,
	maxZoom: 9,
	minZoom: 10
} as const;

/**
 * The settings of the viewer: of a control the index of its choice follows (see `VIEWER_CHOICES`),
 * a button is its key alone, and so is that the buttons for zooming are hidden.
 */
export const VIEWER_KEYS = {
	legend: 1,
	search: 2,
	navigation: 3,
	noZoom: 4,
	scale: 5,
	reset: 6,
	fullscreen: 7,
	locate: 8
} as const;

/**
 * The fields of an element besides its geometry, its styles and the label of a marker, which each
 * type has in a fixed order: a list, so that elements can get fields later.
 */
export const ELEMENT_FIELD_KEYS = { popupText: 1 } as const;

/**
 * The parameters of the Exp-Golomb codes of the indexes that links are full of, which are small
 * (see `StateWriter.writeExpGolomb`; measured on the example maps, 2026-10-08): a color is mostly
 * one of the first of the palette, which has the most frequent ones first, so 0 costs 1 bit; a
 * string that is referenced again is mostly one of the first of its section, so up to 3 costs 3 bits.
 */
export const COLOR_INDEX_K = 0;
export const STRING_INDEX_K = 2;
