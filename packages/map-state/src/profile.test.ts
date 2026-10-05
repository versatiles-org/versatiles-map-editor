import { describe, it, expect } from 'vitest';

import { removeDefaultFields, sanitizeSymbol } from './profile.js';
import type { StateStyle } from './types.js';

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
