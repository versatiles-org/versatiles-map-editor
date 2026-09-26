import { describe, expect, it } from 'vitest';
import { hsvKeeping, hsvToRgb, moveInField, parseHex, rgbToHsv, toHex, toHexKeepingAlpha } from './color.js';

describe('parseHex', () => {
	it('parses long, short and alpha forms', () => {
		expect(parseHex('#ff8000')).toStrictEqual({ r: 255, g: 128, b: 0 });
		expect(parseHex('FF8000')).toStrictEqual({ r: 255, g: 128, b: 0 });
		expect(parseHex('#f80')).toStrictEqual({ r: 255, g: 136, b: 0 });
		expect(parseHex('#ff800080')).toStrictEqual({ r: 255, g: 128, b: 0 });
		expect(parseHex(' #ff8000 ')).toStrictEqual({ r: 255, g: 128, b: 0 });
	});

	it('rejects invalid values', () => {
		for (const value of ['', '#', '#ff80', '#ff80000', 'red', '#gg0000']) {
			expect(parseHex(value)).toBeUndefined();
		}
	});
});

describe('toHex', () => {
	it('formats, rounds and clamps', () => {
		expect(toHex({ r: 255, g: 128, b: 0 })).toBe('#ff8000');
		expect(toHex({ r: 254.6, g: -3, b: 300 })).toBe('#ff00ff');
	});
});

describe('HSV', () => {
	it('converts primary and gray colors', () => {
		expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toStrictEqual({ h: 0, s: 1, v: 1 });
		expect(rgbToHsv({ r: 0, g: 255, b: 0 })).toStrictEqual({ h: 120, s: 1, v: 1 });
		expect(rgbToHsv({ r: 0, g: 0, b: 255 })).toStrictEqual({ h: 240, s: 1, v: 1 });
		expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toStrictEqual({ h: 0, s: 0, v: 0 });
		expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toStrictEqual({ h: 0, s: 0, v: 1 });
	});

	it('round-trips every 7th color of the RGB cube', () => {
		for (let r = 0; r < 256; r += 7) {
			for (let g = 0; g < 256; g += 7) {
				for (let b = 0; b < 256; b += 7) {
					const hex = toHex({ r, g, b });
					expect(toHex(hsvToRgb(rgbToHsv({ r, g, b })))).toBe(hex);
				}
			}
		}
	});
});

describe('hsvKeeping', () => {
	it('keeps hue and saturation where gray and black have none', () => {
		const previous = { h: 120, s: 0.5, v: 0.8 };
		expect(hsvKeeping({ r: 0, g: 0, b: 0 }, previous)).toStrictEqual({ h: 120, s: 0.5, v: 0 });
		expect(hsvKeeping({ r: 128, g: 128, b: 128 }, previous)).toMatchObject({ h: 120, s: 0 });
		expect(hsvKeeping({ r: 255, g: 0, b: 0 }, previous)).toStrictEqual({ h: 0, s: 1, v: 1 });
	});
});

describe('toHexKeepingAlpha', () => {
	it('keeps the alpha channel of the previous value', () => {
		expect(toHexKeepingAlpha({ r: 255, g: 0, b: 0 }, '#00ff0080')).toBe('#ff000080');
		expect(toHexKeepingAlpha({ r: 255, g: 0, b: 0 }, '#00ff00')).toBe('#ff0000');
		expect(toHexKeepingAlpha({ r: 255, g: 0, b: 0 }, undefined)).toBe('#ff0000');
	});
});

describe('moveInField', () => {
	it('moves saturation and brightness with the arrow keys, within 0…1', () => {
		const hsv = { h: 10, s: 0.5, v: 0.995 };
		expect(moveInField(hsv, 'ArrowRight', false)).toStrictEqual({ h: 10, s: 0.51, v: 0.995 });
		expect(moveInField(hsv, 'ArrowLeft', true)).toStrictEqual({ h: 10, s: 0.4, v: 0.995 });
		expect(moveInField(hsv, 'ArrowUp', true)).toStrictEqual({ h: 10, s: 0.5, v: 1 });
		expect(moveInField(hsv, 'Enter', false)).toBeUndefined();
	});
});
