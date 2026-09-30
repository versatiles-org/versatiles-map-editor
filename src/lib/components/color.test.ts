import { describe, expect, it } from 'vitest';
import { formatHex } from '@versatiles/map-state';
import { channelTrack, contrast, hsvKeeping, hsvToRgb, rgbToHsv } from './color.js';

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
					const hex = formatHex({ r, g, b, alpha: 1 });
					expect(formatHex({ ...hsvToRgb(rgbToHsv({ r, g, b })), alpha: 1 })).toBe(hex);
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

describe('channelTrack', () => {
	const color = { r: 255, g: 128, b: 0, alpha: 0.5 };
	const hsv = rgbToHsv(color);

	it('goes through the values of a channel, the others as they are', () => {
		expect(channelTrack('g', color, hsv)).toBe('linear-gradient(to right, rgb(255 0 0), rgb(255 255 0))');
		// from transparent to opaque
		expect(channelTrack('alpha', color, hsv)).toBe('linear-gradient(to right, rgb(255 128 0 / 0), rgb(255 128 0))');
		// from black to the brightest color of this hue and saturation
		expect(channelTrack('v', color, hsv)).toBe('linear-gradient(to right, rgb(0 0 0), rgb(255 128 0))');
	});

	it('goes through all hues, at the saturation and value of the color', () => {
		const track = channelTrack('h', color, hsv);
		expect(track.match(/rgb\(/g)).toHaveLength(7);
		expect(track).toMatch(/^linear-gradient\(to right, rgb\(255 0 0\), rgb\(255 255 0\),/);
		expect(track).toMatch(/rgb\(255 0 0\)\)$/);
	});
});

describe('contrast', () => {
	it('is the contrast ratio of WCAG, in either order', () => {
		const white = { r: 255, g: 255, b: 255 };
		expect(contrast(white, { r: 0, g: 0, b: 0 })).toBeCloseTo(21);
		expect(contrast(white, white)).toBe(1);
		expect(contrast({ r: 0, g: 114, b: 178 }, white)).toBeCloseTo(5.19, 2);
	});
});
