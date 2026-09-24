import { describe, it, expect } from 'vitest';

import { FILL_PATTERN_NAMES, STROKE_STYLE_NAMES, LABEL_ALIGN_NAMES, removeDefaultFields } from './profile.js';
import { symbolName, symbolIndexByName, symbolEntries } from './symbols.js';
import type { StateStyle } from './types.js';

import { fillPatterns } from '$lib/lib/map_layer/fill.js';
import { dashArrays } from '$lib/lib/map_layer/line.js';
import { labelPositions } from '$lib/lib/map_layer/symbol.js';
import { getSymbol } from '$lib/lib/symbols.js';

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

	it('symbol registry matches the editor symbol names', () => {
		for (const [index, name] of symbolEntries) {
			expect(symbolName(index)).toBe(name);
			expect(symbolIndexByName(name)).toBe(index);
			expect(getSymbol(index).name).toBe(name);
		}
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
