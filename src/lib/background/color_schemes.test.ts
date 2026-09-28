import { describe, expect, it } from 'vitest';
import { COLOR_SCHEMES, getColorScheme } from './color_schemes.js';

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

	it('are found by id, with the first as fallback', () => {
		expect(getColorScheme('dark2').id).toBe('dark2');
		expect(getColorScheme('unknown')).toBe(COLOR_SCHEMES[0]);
		expect(getColorScheme(undefined)).toBe(COLOR_SCHEMES[0]);
		const custom = { id: 'ci', name: 'CI', colors: ['#123456'] };
		expect(getColorScheme(undefined, [custom])).toBe(custom);
	});
});
