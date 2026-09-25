import { describe, expect, it } from 'vitest';
import { COLOR_SCHEMES, DEFAULT_COLOR_SCHEME, getColorScheme } from './color_schemes.js';

describe('COLOR_SCHEMES', () => {
	it('have unique ids and 6 to 10 distinct lowercase hex colors', () => {
		expect(new Set(COLOR_SCHEMES.map((s) => s.id)).size).toBe(COLOR_SCHEMES.length);
		for (const { colors } of COLOR_SCHEMES) {
			expect(colors.length).toBeGreaterThanOrEqual(6);
			expect(colors.length).toBeLessThanOrEqual(10);
			expect(new Set(colors).size).toBe(colors.length);
			for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});

	it('are found by id, with the default as fallback', () => {
		expect(getColorScheme('dark2').id).toBe('dark2');
		expect(getColorScheme('unknown')).toBe(DEFAULT_COLOR_SCHEME);
		expect(getColorScheme(undefined)).toBe(DEFAULT_COLOR_SCHEME);
	});
});
