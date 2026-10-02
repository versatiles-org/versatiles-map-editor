import type * as maplibregl from 'maplibre-gl';
import { Color } from '@versatiles/style';
import { parseFillPatternName } from '../style/index.js';

/** A repeating pattern of opacities (0–5 per pixel), shifted by `xf` per column and `yf` per row. */
interface Fill {
	xf: number;
	yf: number;
	pattern: string;
}

/** The pixels of the fill patterns by their index (see `fillPatterns`); undefined is solid. */
export const patternFills: (Fill | undefined)[] = [
	undefined, // solid
	{ xf: 1, yf: 1, pattern: '00002552' }, // diagonal
	{ xf: 1, yf: 1, pattern: '0252' } // diagonal-thin
];

/** The size of the image of a fill pattern, in pixels: 1 pixel of the map per pixel. */
export const PATTERN_SIZE = 32;

/** The pixels of the image of a fill pattern (see `patternFills`) in the color, e.g. for the legend too. */
export function fillPatternPixels(pattern: number, color: string): Uint8ClampedArray<ArrayBuffer> {
	// a solid fill is a pattern without gaps
	const fill = patternFills[pattern] ?? { xf: 1, yf: 1, pattern: '5' };
	const alpha = fill.pattern.split('').map((c) => parseInt(c, 10) / 5);
	const [r, g, b, a = 1] = Color.parse(color).to('srgb').asArray();

	const data = new Uint8ClampedArray(PATTERN_SIZE * PATTERN_SIZE * 4);
	for (let y = 0; y < PATTERN_SIZE; y++) {
		for (let x = 0; x < PATTERN_SIZE; x++) {
			const i = (y * PATTERN_SIZE + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255 * a * alpha[(x * fill.xf + y * fill.yf) % alpha.length];
		}
	}
	return data;
}

/**
 * Add the image of a fill pattern, when the map asks for it (e.g. again after a new map style).
 * Returns false for other images.
 */
export function addFillPatternImage(map: maplibregl.Map, name: string): boolean {
	const parsed = parseFillPatternName(name);
	if (!parsed) return false;
	const data = fillPatternPixels(parsed.pattern, parsed.color);
	if (!map.hasImage(name)) map.addImage(name, { width: PATTERN_SIZE, height: PATTERN_SIZE, data });
	return true;
}
