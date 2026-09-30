import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

// The accent of theme.css is derived from a hue, a chroma and a lightness per mode (OKLCH). These
// tests compute its colors as the browser does, so a change of the numbers keeps text readable.

const css = readFileSync('src/lib/app/theme.css', 'utf-8');
const [lightCss, darkCss] = css.split('@media (prefers-color-scheme: dark)');

/** The value of a variable in a part of the stylesheet, as a number; percentages as fractions. */
function variable(text: string, name: string): number | undefined {
	const match = new RegExp(`${name}:\\s*(-?[\\d.]+)(%?)`).exec(text);
	if (!match) return undefined;
	return Number(match[1]) / (match[2] ? 100 : 1);
}

/** The accent of a mode: the light values, changed by the dark ones in the dark mode. */
function accent(dark: boolean) {
	const read = (name: string) => (dark ? variable(darkCss, name) : undefined) ?? variable(lightCss, name)!;
	return {
		hue: read('--accent-hue'),
		chroma: read('--accent-chroma'),
		lightness: read('--accent-lightness'),
		hoverStep: read('--accent-hover-step')
	};
}

/** An OKLCH color as sRGB channels 0…1, clipped to the gamut, as browsers show it. */
function oklchToRgb(lightness: number, chroma: number, hue: number): number[] {
	const a = chroma * Math.cos((hue * Math.PI) / 180);
	const b = chroma * Math.sin((hue * Math.PI) / 180);
	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	return linear.map((v) => Math.max(0, Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)));
}

function luminance(rgb: number[]): number {
	const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
	return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: number[], b: number[]): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}

const white = [1, 1, 1];
const hex = (value: string) => [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
const darkBackground = hex(/--color-bg:\s*(#[0-9a-f]{6})/.exec(darkCss)![1]);

describe('the accent of the theme', () => {
	it('is defined by a hue, a chroma, and a lightness in both modes', () => {
		for (const dark of [false, true]) {
			const { hue, chroma, lightness, hoverStep } = accent(dark);
			expect([hue, chroma, lightness, hoverStep].every(Number.isFinite)).toBe(true);
		}
		expect(accent(true).lightness).toBeLessThan(accent(false).lightness);
	});

	for (const dark of [false, true]) {
		it(`keeps white text readable on buttons and chosen options, ${dark ? 'dark' : 'light'} mode`, () => {
			const { hue, chroma, lightness, hoverStep } = accent(dark);
			expect(contrast(white, oklchToRgb(lightness, chroma, hue))).toBeGreaterThanOrEqual(4.5);
			expect(contrast(white, oklchToRgb(lightness + hoverStep, chroma, hue))).toBeGreaterThanOrEqual(4.5);
		});
	}

	it('has a line (e.g. the focus ring) that is seen on both backgrounds', () => {
		const { hue, chroma } = accent(false);
		const line = oklchToRgb(0.6, chroma, hue);
		expect(css).toContain('--color-accent-line: oklch(60% var(--accent-chroma) var(--accent-hue));');
		// 3:1, the least for parts of controls
		expect(contrast(line, white)).toBeGreaterThanOrEqual(3);
		expect(contrast(line, darkBackground)).toBeGreaterThanOrEqual(3);
	});
});
