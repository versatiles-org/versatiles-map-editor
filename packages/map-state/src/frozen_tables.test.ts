import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import * as constants from './constants.js';
import * as grid from './grid.js';
import * as profile from './profile.js';
import { encodeStrings } from './string_coder.js';
import { STRING_PRIMER } from './string_primer.js';
import * as styleHistory from './style_history.js';
import * as types from './types.js';

// The tables of version 1 of the formats, as literals: what a link or a file of version 1 was
// written with. A reader of any later version must read with the same, so this test fails when
// one of them changes. Do not adapt the literals to the code: change the code back, or make a new
// version of the format. What may grow is told below; MAPJSON.md and the README have the rules.

const now: Record<string, unknown> = { ...constants, ...grid, ...profile, ...styleHistory, ...types };

/** What must stay exactly as it is. */
const EXACT: Record<string, unknown> = {
	BASE64_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
	CODEC_VERSION: 1,
	ORIGIN_SCALE: 100,
	END_KEY: 0,
	ELEMENT_END: 2,
	BACKGROUND_THEME_TEXT: 31,
	BACKGROUND_LANGUAGE_TEXT: 15,
	COLOR_INDEX_K: 0,
	STRING_INDEX_K: 2,
	STYLE_KEY_PARAMETER: 0,
	STYLE_REFERENCE_PARAMETER: 0,
	STYLE_HISTORY_SIZE: 32,
	MAX_EXPONENT: 15,
	COORDINATE_DIGITS: 5
};

/**
 * What may grow, and only so: a list by names at its end (a link stores the index of a name), a
 * table of keys by keys with new numbers, the defaults by fields that are new. Nothing of it may be
 * removed, renamed, moved or get another value.
 */
const GROWING: Record<string, unknown> = {
	ELEMENT_KEYS: {
		marker: 0,
		line: 1,
		polygon: 3,
		circle: 4
	},
	METADATA_KEYS: {
		background: 1,
		legend: 2,
		viewer: 3,
		labelOverlap: 4,
		labelMinZoom: 5,
		title: 6,
		colorScheme: 7
	},
	BACKGROUND_KEYS: {
		theme: 1,
		satellite: 2,
		labels: 3,
		language: 4,
		colors: 5,
		haloWidth: 6,
		labelSize: 7,
		font: 8,
		labelsOnTop: 9,
		noStreets: 10,
		noBorders: 11,
		hillshade: 12,
		terrain: 13,
		extruded: 14,
		options: 15
	},
	LEGEND_KEYS: {
		entries: 1,
		theme: 2,
		layout: 3,
		font: 4,
		bold: 5,
		italic: 6
	},
	LEGEND_ENTRY_KEYS: {
		type: 1,
		style: 2,
		label: 3,
		outlineStyle: 4
	},
	FRAME_KEYS: {
		bearing: 1,
		pitch: 2
	},
	VIEWER_KEYS: {
		legend: 1,
		search: 2,
		navigation: 3,
		rotate: 4,
		noZoomButtons: 5,
		scale: 6,
		tilt: 7,
		reset: 8,
		fullscreen: 9,
		confine: 10,
		scrollFree: 11,
		locate: 12,
		maxZoom: 13,
		noZoom: 14,
		noPan: 15,
		minZoom: 16
	},
	ELEMENT_FIELD_KEYS: {
		popupText: 1
	},
	STYLE_KEYS: {
		marker: [
			'color',
			'symbol',
			'labelFont',
			'labelColor',
			'labelSize',
			'size',
			'labelPosition',
			'haloWidth',
			'haloColor',
			'remove',
			'rotation',
			'flat'
		],
		line: ['color', 'width', 'dash', 'arrowStart', 'arrowEnd', 'arrowSize', 'remove'],
		area: ['color', 'pattern', 'patternScale', 'patternCoverage', 'remove'],
		outline: ['color', 'width', 'visible', 'dash', 'remove']
	},
	ARROW_NAMES: ['none', 'triangle', 'chevron', 'circle'],
	LABEL_POSITION_NAMES: [
		'auto',
		'right',
		'left',
		'top',
		'bottom',
		'top-right',
		'top-left',
		'bottom-right',
		'bottom-left'
	],
	FILL_PATTERN_NAMES: [
		'solid',
		'diagonal-up',
		'diagonal-down',
		'horizontal',
		'vertical',
		'cross',
		'diagonal-cross',
		'dots',
		'diagonal-dots'
	],
	DASH_NAMES: ['solid', 'dashed', 'dotted', 'long-dash', 'dash-dot'],
	LEGEND_POSITIONS: ['bottom-left', 'bottom', 'bottom-right', 'right', 'top-right', 'top', 'top-left', 'left'],
	LEGEND_LAYOUTS: ['vertical', 'horizontal', 'inline'],
	LEGEND_THEMES: ['light', 'dark', 'glass'],
	LEGEND_FONTS: ['sans-serif', 'serif', 'monospace'],
	SEARCH_POSITIONS: ['top-left', 'top-right'],
	NAVIGATION_POSITIONS: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
	SCALE_POSITIONS: ['bottom-left', 'bottom-right'],
	LEGEND_ENTRY_TYPES: ['marker', 'line', 'area'],
	BACKGROUND_BASES: ['vector', 'satellite'],
	BACKGROUND_THEMES: [
		'colorful',
		'colorful-dark',
		'natural',
		'natural-dark',
		'muted',
		'muted-dark',
		'gray',
		'gray-dark',
		'toner',
		'toner-dark',
		'positrino',
		'positrino-dark',
		'fnord',
		'protocol',
		'protocol-dark',
		'protostar',
		'protostar-dark',
		'protozoa',
		'classic',
		'googol',
		'freedom',
		'macbob',
		'mactaylor',
		'bingo'
	],
	BACKGROUND_LABELS: ['normal', 'fewer', 'none'],
	BACKGROUND_LANGUAGES: ['user', 'local', 'ar', 'de', 'el', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'uk'],
	BACKGROUND_BUILDINGS: ['flat', 'extruded'],
	SCROLL_ZOOMS: ['protected', 'free'],
	VIEWER_CHOICES: {
		search: ['none', 'top-left', 'top-right'],
		navigation: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
		legend: ['none', 'bottom-left', 'bottom', 'bottom-right', 'right', 'top-right', 'top', 'top-left', 'left'],
		scale: ['none', 'bottom-left', 'bottom-right']
	},
	VIEWER_BUTTONS: ['reset', 'fullscreen', 'locate'],
	KEY_PARAMETERS: {
		version: 2,
		element: 0,
		metadata: 1,
		background: 1,
		frame: 0,
		viewer: 0,
		legend: 0,
		legendEntry: 1,
		elementFields: 0
	},
	BACKGROUND_STEPS: {
		labelSize: 20,
		haloWidth: 4,
		colors: 20
	},
	AREA_DEFAULTS: {
		color: '#ff000040',
		pattern: 'solid',
		patternScale: 1,
		patternCoverage: 0.5
	},
	LINE_DEFAULTS: {
		color: '#ff0000',
		dash: 'solid',
		width: 2,
		arrowStart: 'none',
		arrowEnd: 'none',
		arrowSize: 3
	},
	OUTLINE_DEFAULTS: {
		color: '#ff0000',
		dash: 'solid',
		visible: true,
		width: 2
	},
	MARKER_DEFAULTS: {
		color: '#ff0000',
		rotation: 0,
		size: 1,
		labelSize: 1,
		haloWidth: 1,
		symbol: 'extras:pin-teardrop',
		labelPosition: 'auto',
		labelColor: '#000000',
		labelFont: '',
		haloColor: '#ffffff',
		flat: false
	},
	BACKGROUND_DEFAULTS: {
		base: 'vector',
		theme: 'colorful',
		streets: true,
		borders: true,
		labels: 'normal',
		language: 'user',
		font: 'noto_sans_regular',
		labelSize: 1,
		hillshade: false,
		terrain: false,
		buildings: 'flat'
	},
	BACKGROUND_COLOR_DEFAULTS: {
		saturation: 0,
		black: 0,
		white: 1
	},
	BACKGROUND_HALO_WIDTHS: {
		vector: 2,
		satellite: 1
	},
	LEGEND_DEFAULTS: {
		layout: 'vertical',
		font: 'sans-serif',
		bold: false,
		italic: false,
		theme: 'light'
	},
	VIEWER_DEFAULTS: {
		search: 'none',
		navigation: 'top-right',
		zoomButtons: true,
		legend: 'bottom-left',
		scale: 'none',
		reset: false,
		fullscreen: false,
		locate: false,
		canPan: true,
		canZoom: true,
		canRotate: false,
		canTilt: false,
		confine: false,
		scrollZoom: 'protected'
	}
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether `value` still has all of `frozen`: lists at their start, objects by their fields. */
function expectStillHas(value: unknown, frozen: unknown, name: string) {
	if (Array.isArray(frozen)) {
		expect(Array.isArray(value), name).toBe(true);
		expect((value as unknown[]).slice(0, frozen.length), name).toStrictEqual(frozen);
	} else if (isObject(frozen)) {
		expect(isObject(value), name).toBe(true);
		for (const [key, part] of Object.entries(frozen)) {
			expectStillHas((value as Record<string, unknown>)[key], part, `${name}.${key}`);
		}
	} else expect(value, name).toBe(frozen);
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe('the tables of version 1 of the formats', () => {
	it.each(Object.entries(EXACT))('%s is as it was', (name, frozen) => {
		expect(now[name]).toStrictEqual(frozen);
	});

	it.each(Object.entries(GROWING))('%s has all that it had, where it was', (name, frozen) => {
		expectStillHas(now[name], frozen, name);
	});

	it('have keys that are each used once in their list, also the new ones', () => {
		for (const name of Object.keys(GROWING).filter((name) => name.endsWith('_KEYS') && name !== 'STYLE_KEYS')) {
			const keys = Object.values(now[name] as Record<string, number>);
			expect(new Set(keys).size, name).toBe(keys.length);
		}
	});

	it('have limits that are not lowered: a map within them stays one', () => {
		// a limit may be raised: an older reader then refuses what is beyond its own
		const least = { MAX_PITCH: 60, MAX_ZOOM: 22 };
		for (const [name, limit] of Object.entries(least)) expect(now[name], name).toBeGreaterThanOrEqual(limit);
		const limits = { size: 100, width: 1000, radius: 20_000_000, longitude: 3600 };
		for (const [name, limit] of Object.entries(limits)) {
			expect((now.LIMITS as Record<string, number>)[name], name).toBeGreaterThanOrEqual(limit);
		}
	});

	it('have the words that the string coder knows, which no word may be added to', () => {
		// every word changes what the coder has learned, and with it the bits of every string
		expect(STRING_PRIMER.length).toBe(16);
		expect(sha256(JSON.stringify(STRING_PRIMER))).toBe(
			'51a625ff60ca6764b7c93e605b0ba85fe986afec391ba2e2e805260b96930a38'
		);
	});

	it('have a string coder that writes the same bits for the same strings', () => {
		// its parameters are not exported: the order of its model, its limits and its escapes
		const strings = [
			'noto_sans_bold',
			'{"sky":false}',
			'Brandenburger Tor',
			'**Großer Tiergarten**\nBerlin',
			'東京 🗺️',
			'',
			'Brandenburger Tor 2',
			'a'.repeat(300)
		];
		const bits = encodeStrings(strings, 2)
			.map((bit) => (bit ? '1' : '0'))
			.join('');
		expect(bits.length).toBe(545);
		expect(sha256(bits)).toBe('680e6cbc3620289d33ac19b19d1601492fdc19c8bedcfa2ee2811b90e4f1b547');
	});

	it('are all of the constants of the link format, so a new one is frozen too', () => {
		// the constants of constants.ts and style_history.ts, apart from what is computed from them
		const computed = ['BASE64_CODE2BITS', 'STYLE_REMOVE'];
		const names = Object.keys({ ...constants, ...styleHistory }).filter(
			(name) => /^[A-Z0-9_]+$/.test(name) && !computed.includes(name)
		);
		expect(names.filter((name) => !(name in EXACT) && !(name in GROWING))).toStrictEqual([]);
	});
});
