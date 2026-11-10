import { describe, expect, it } from 'vitest';
import { cssColor } from './css_color.js';

describe('cssColor', () => {
	it('gives opaque colors as rgb() and translucent ones as rgba(), with the alpha to three decimals', () => {
		expect(cssColor('#ff0000')).toBe('rgb(255,0,0)');
		expect(cssColor('#abc')).toBe('rgb(170,187,204)');
		expect(cssColor('#ff000080')).toBe('rgba(255,0,0,0.502)');
		expect(cssColor('#12345678')).toBe('rgba(18,52,86,0.471)');
		expect(cssColor('#00ff0000')).toBe('rgba(0,255,0,0)');
	});

	it('keeps a color that it cannot parse', () => {
		expect(cssColor('not a color')).toBe('not a color');
	});
});
