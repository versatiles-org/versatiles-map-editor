import type { RGBA } from '@versatiles/map-state';

export interface RGB {
	r: number; // 0…255
	g: number;
	b: number;
}

export interface HSV {
	h: number; // hue in degrees, 0…360
	s: number; // saturation, 0…1
	v: number; // value (brightness), 0…1
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d > 0) {
		if (max === r) h = ((g - b) / d + 6) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
	}
	return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * The HSV of a color, keeping hue and saturation of the previous HSV where the color has none:
 * gray has no hue, black neither hue nor saturation. So dragging to black and back keeps the hue.
 */
export function hsvKeeping(color: RGB, previous: HSV): HSV {
	const next = rgbToHsv(color);
	if (next.v === 0) next.s = previous.s;
	if (next.s === 0 || next.v === 0) next.h = previous.h;
	return next;
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
	};
	return { r: f(5), g: f(3), b: f(1) };
}

/** A channel of a color: red, green and blue, hue, saturation and value, or its opacity. */
export type Channel = 'r' | 'g' | 'b' | 'h' | 's' | 'v' | 'alpha';

/**
 * The track of a channel's slider: a gradient through the colors that the channel reaches, with
 * the other channels as they are, e.g. red from 0 to 255 at the current green and blue. The
 * opacity goes from transparent to the opaque color, to be drawn over a checkerboard.
 */
export function channelTrack(channel: Channel, color: RGBA, hsv: HSV): string {
	const css = ({ r, g, b }: RGB, alpha = 1) =>
		`rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}${alpha < 1 ? ` / ${alpha}` : ''})`;
	let stops: string[];
	switch (channel) {
		case 'r':
		case 'g':
		case 'b':
			stops = [0, 255].map((n) => css({ ...color, [channel]: n }));
			break;
		case 'alpha':
			stops = [css(color, 0), css(color)];
			break;
		case 'h':
			// through all hues, at the current saturation and value
			stops = [0, 60, 120, 180, 240, 300, 360].map((h) => css(hsvToRgb({ ...hsv, h })));
			break;
		case 's':
		case 'v':
			stops = [0, 1].map((n) => css(hsvToRgb({ ...hsv, [channel]: n })));
			break;
	}
	return `linear-gradient(to right, ${stops.join(', ')})`;
}

/** The contrast ratio of two colors (WCAG), from 1 (the same) to 21 (black and white). */
export function contrast(a: RGB, b: RGB): number {
	const luminance = ({ r, g, b }: RGB) =>
		[r, g, b]
			.map((channel) => channel / 255)
			.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
			.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light + 0.05) / (dark + 0.05);
}
