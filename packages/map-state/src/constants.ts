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

/**
 * The version of the format, at the start of every hash. Only this version is read. (Version 0,
 * the original format, is not supported any more.)
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

/** The fields of the legend, in 4 bits; 1 is free. */
export const LEGEND_KEYS = { layout: 2, entries: 3, font: 4, bold: 5, italic: 6, theme: 7 } as const;

/** The fields of an entry of the legend, in 4 bits. */
export const LEGEND_ENTRY_KEYS = { label: 3, type: 5, style: 6, strokeStyle: 7 } as const;

/** The fields of a popup, in 4 bits. */
export const POPUP_KEYS = { text: 1 } as const;
