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
// (e.g. of the metadata) ends with `END_KEY`; unused keys are free for later fields.

/** The end of a list of fields, and of the elements. */
export const END_KEY = 0;

/** The type of an element, in 3 bits. */
export const ELEMENT_KEYS = { marker: 1, line: 2, polygon: 3, circle: 4 } as const satisfies Record<
	StateElement['type'],
	number
>;

/** The fields of the metadata, in 6 bits; 1, 5, 6 and 8 are free. */
export const METADATA_KEYS = {
	background: 2,
	legend: 3,
	colorScheme: 4,
	mapLabelsOnTop: 7,
	title: 9,
	viewer: 10,
	labelOverlap: 11,
	labelMinZoom: 12
} as const;

/**
 * The fields of the background map, in 4 bits; 15 is free. A key alone is a flag: the satellite
 * map, no streets or no borders over the imagery, the relief shaded, the terrain raised, the
 * buildings extruded.
 */
export const BACKGROUND_KEYS = {
	satellite: 1,
	theme: 2,
	noStreets: 3,
	noBorders: 4,
	labels: 5,
	language: 6,
	font: 7,
	labelSize: 8,
	haloWidth: 9,
	colors: 10,
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

/** The fields of the legend, in 4 bits; 1 is free. */
export const LEGEND_KEYS = { layout: 2, entries: 3, font: 4, bold: 5, italic: 6, theme: 7 } as const;

/** The fields of an entry of the legend, in 4 bits. */
export const LEGEND_ENTRY_KEYS = { label: 3, type: 5, style: 6, strokeStyle: 7 } as const;

/**
 * The settings of a frame besides its area, in 4 bits: how the map is turned when it opens, and
 * what its viewers can do. Each only if it differs from its default; a flag is its key alone.
 */
export const FRAME_KEYS = { bearing: 1, pitch: 2, noPan: 3, noZoom: 4, rotate: 5, tilt: 6 } as const;

/**
 * The settings of the viewer, in 4 bits: of a control the index of its choice follows (see
 * `VIEWER_CHOICES`), a button is its key alone.
 */
export const VIEWER_KEYS = { search: 1, navigation: 2, legend: 3, reset: 4 } as const;

/** The fields of a popup, in 4 bits. */
export const POPUP_KEYS = { text: 1 } as const;

/**
 * The parameters of the Exp-Golomb codes of the indexes that links are full of, which are small
 * (see `StateWriter.writeExpGolomb`; measured on the example maps, 2026-10-08): a color is mostly
 * one of the first of the palette, which has the most frequent ones first, so 0 costs 1 bit; a
 * string that is referenced again is mostly one of the first of its section, so up to 3 costs 3 bits.
 */
export const COLOR_INDEX_K = 0;
export const STRING_INDEX_K = 2;
