import { describe, it, expect } from 'vitest';

import { FILL_PATTERN_NAMES, STROKE_STYLE_NAMES, removeDefaultFields, sanitizeSymbol } from './profile.js';
import type { StateStyle } from './types.js';

import { patternFills } from '../../../src/lib/rendering/fill_patterns.js';
import { dashArrays } from '../../../src/lib/style/line.svelte.js';

// The codec owns the style vocabulary and the editor derives its tables from it.
// These guards ensure the editor has rendering data for every value the codec knows. (The tables
// by name, e.g. of the positions of labels, are records of the name types, which TypeScript checks.)
describe('profile drift guard', () => {
	it('the editor can render every enum value of the codec', () => {
		expect(patternFills).toHaveLength(FILL_PATTERN_NAMES.length);
		expect(STROKE_STYLE_NAMES.map((_, i) => dashArrays.get(i)?.array)).not.toContain(undefined);
	});
});

describe('sanitizeSymbol', () => {
	it('keeps the name of an image, or "" for no symbol', () => {
		expect(sanitizeSymbol('icons:anchor')).toBe('icons:anchor');
		expect(sanitizeSymbol('')).toBe('');
		expect(sanitizeSymbol('bench')).toBeUndefined();
		expect(sanitizeSymbol(12)).toBeUndefined();
		expect(sanitizeSymbol(undefined)).toBeUndefined();
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
