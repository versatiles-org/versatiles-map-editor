import { describe, expect, it } from 'vitest';
import { completeStyle, ROLE_DEFAULTS, storedStyle } from './defaults.js';

describe('the defaults of the roles of styles', () => {
	it('give a line arrowheads, but not an outline', () => {
		expect(ROLE_DEFAULTS.line).toMatchObject({ arrowStart: 'none', arrowEnd: 'none', arrowSize: 3, width: 2 });
		expect('arrowStart' in ROLE_DEFAULTS.outline).toBe(false);
	});

	it('complete a style with the defaults of its role', () => {
		expect(completeStyle('fill', { pattern: 1 })).toStrictEqual({ color: '#ff0000', pattern: 1 });
		expect(completeStyle('line').arrowSize).toBe(3);
		expect(completeStyle('symbol', { color: '#0000ff' }).color).toBe('#0000ff');
	});

	it('store a style without its defaults and without fields that have no effect', () => {
		expect(storedStyle('line', completeStyle('line', { width: 4 }))).toStrictEqual({ width: 4 });
		expect(storedStyle('fill', completeStyle('fill'))).toBeUndefined();
		// the size of arrowheads, without one
		expect(storedStyle('line', { arrowSize: 5, color: '#00ff00' })).toStrictEqual({ color: '#00ff00' });
		expect(storedStyle('line', { arrowEnd: 'triangle', arrowSize: 5 })).toStrictEqual({
			arrowEnd: 'triangle',
			arrowSize: 5
		});
		// an outline has no ends
		expect(storedStyle('outline', { arrowEnd: 'triangle', arrowSize: 5, width: 1 })).toStrictEqual({ width: 1 });
	});
});
