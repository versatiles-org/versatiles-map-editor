import { describe, expect, it } from 'vitest';
import { COLOR_SCHEMES, getColorScheme } from './color_schemes.js';

describe('getColorScheme', () => {
	it('finds a scheme by id, with the first as fallback', () => {
		expect(getColorScheme('dark2').id).toBe('dark2');
		expect(getColorScheme('unknown')).toBe(COLOR_SCHEMES[0]);
		expect(getColorScheme(undefined)).toBe(COLOR_SCHEMES[0]);
		const custom = { id: 'ci', name: 'CI', colors: ['#123456'] };
		expect(getColorScheme(undefined, [custom])).toBe(custom);
	});
});
