import { describe, it, expect } from 'vitest';

import {
	FILL_PATTERN_NAMES,
	STROKE_STYLE_NAMES,
	LABEL_ALIGN_NAMES,
	legacyMarkerStyle,
	removeDefaultFields
} from './profile.js';
import { LEGACY_SYMBOLS, legacySymbol, symbolFromName } from './symbols.js';
import type { StateStyle } from './types.js';

import { fillPatterns } from '$lib/core/map_layer/fill.svelte.js';
import { dashArrays } from '$lib/core/map_layer/line.svelte.js';
import { labelPositions } from '$lib/core/map_layer/symbol.svelte.js';

// The codec owns the style vocabulary and the editor derives its tables from it.
// These guards ensure the editor has rendering data for every value the codec knows.
describe('profile drift guard', () => {
	it('the editor can render every enum value of the codec', () => {
		expect(FILL_PATTERN_NAMES.map((_, i) => fillPatterns.has(i))).not.toContain(false);
		expect(STROKE_STYLE_NAMES.map((_, i) => dashArrays.get(i)?.array)).not.toContain(undefined);
		expect(labelPositions.map((p) => p.name)).toEqual(LABEL_ALIGN_NAMES);
		// only "auto" (index 0) has no fixed anchor
		expect(labelPositions.filter((p) => p.anchor == null).map((p) => p.index)).toEqual([0]);
	});
});

describe('symbols of older links and files', () => {
	it('reads the old numbers and names as the names of their images', () => {
		for (const [index, name, image] of LEGACY_SYMBOLS) {
			expect(legacySymbol(index)).toBe(image);
			expect(legacySymbol(name)).toBe(image);
		}
		expect(legacySymbol(38)).toBe('base:icon-embassy');
		expect(legacySymbol('flag')).toBe('base:icon-embassy');
		expect(legacySymbol(999)).toBeUndefined();
		expect(legacySymbol('unknown')).toBeUndefined();
	});

	it('keeps the full name of an image', () => {
		expect(symbolFromName('icons:anchor')).toBe('icons:anchor');
		expect(symbolFromName('')).toBe('');
		expect(symbolFromName('bench')).toBe('base:icon-bench');
		expect(symbolFromName('unknown')).toBeUndefined();
	});

	it('moves the number of a marker symbol to its name', () => {
		expect(legacyMarkerStyle({ pattern: 12, size: 2 })).toStrictEqual({ symbol: 'base:icon-bench', size: 2 });
		expect(legacyMarkerStyle({ pattern: 999 })).toStrictEqual({});
		expect(legacyMarkerStyle({ pattern: 12, symbol: 'icons:anchor' })).toStrictEqual({ symbol: 'icons:anchor' });
		expect(legacyMarkerStyle({ size: 2 })).toStrictEqual({ size: 2 });
	});
});

describe('removeDefaultFields', () => {
	const def: StateStyle = { color: 'red', size: 10 };

	it('returns undefined if all fields match the default', () => {
		expect(removeDefaultFields({ color: 'red', size: 10 }, def)).toBeUndefined();
	});

	it('keeps only the fields that differ from the default', () => {
		expect(removeDefaultFields({ color: 'blue', size: 10 }, def)).toEqual({ color: 'blue' });
	});

	it('drops undefined fields', () => {
		expect(removeDefaultFields({ color: undefined, size: 10 }, def)).toBeUndefined();
	});

	it('returns undefined for an empty value', () => {
		expect(removeDefaultFields({}, def)).toBeUndefined();
		expect(removeDefaultFields({}, {})).toBeUndefined();
	});

	it('keeps all fields if there are no defaults', () => {
		expect(removeDefaultFields({ color: 'blue', size: 10 }, {})).toEqual({ color: 'blue', size: 10 });
	});
});
