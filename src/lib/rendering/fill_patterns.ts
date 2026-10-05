import type * as maplibregl from 'maplibre-gl';
import { parseColor, type FillPatternName } from '@versatiles/map-state';
import { parseFillPatternName } from '../style/index.js';

/** The shapes of fill patterns: lines in one direction, lines in two directions, or dots. */
export type PatternShape =
	'solid' | 'diagonal-up' | 'diagonal-down' | 'horizontal' | 'vertical' | 'cross' | 'diagonal-cross' | 'dots';

/** The shape and the coverage of each fill pattern of the format, at scale 1. */
const PATTERNS: Record<FillPatternName, { shape: PatternShape; coverage: number }> = {
	solid: { shape: 'solid', coverage: 1 },
	diagonal: { shape: 'diagonal-up', coverage: 0.5 },
	'diagonal-thin': { shape: 'diagonal-up', coverage: 0.25 }
};

/** The distance between the lines (across them) or the dots of a pattern at scale 1, in CSS pixels. */
export const PATTERN_SPACING = 8;

/** The pixels of the images per CSS pixel, so thin lines stay sharp on high-resolution screens. */
export const PATTERN_PIXEL_RATIO = 2;

/** The samples per tile at most, for the antialiasing: fewer per pixel in large tiles. */
const MAX_SAMPLES = 2 ** 16;

/** An image of a fill pattern: one tile, which repeats without a seam. */
export interface PatternImage {
	width: number;
	height: number;
	data: Uint8ClampedArray<ArrayBuffer>;
	pixelRatio: number;
}

const isDiagonal = (shape: PatternShape) => shape.startsWith('diagonal');

/** `value` modulo `period`, from 0 to `period`, also for negative values. */
const modulo = (value: number, period: number) => ((value % period) + period) % period;

/** The distance from `value` to the nearest multiple of `period`. */
function distanceToMultiple(value: number, period: number): number {
	const rest = modulo(value, period);
	return Math.min(rest, period - rest);
}

/**
 * The distance of the point x, y of a tile of `size` pixels from the nearest line or dot of the
 * shape, in pixels. The lines run through the corners of the tile, so it repeats without a seam.
 */
function distance(shape: PatternShape, size: number, x: number, y: number): number {
	switch (shape) {
		case 'horizontal':
			return distanceToMultiple(y, size);
		case 'vertical':
			return distanceToMultiple(x, size);
		case 'cross':
			return Math.min(distanceToMultiple(x, size), distanceToMultiple(y, size));
		// "/" on the screen, whose y axis points down
		case 'diagonal-up':
			return distanceToMultiple(x + y, size) / Math.SQRT2;
		case 'diagonal-down':
			return distanceToMultiple(x - y, size) / Math.SQRT2;
		case 'diagonal-cross':
			return Math.min(distanceToMultiple(x + y, size), distanceToMultiple(x - y, size)) / Math.SQRT2;
		case 'dots':
			return Math.hypot(distanceToMultiple(x, size), distanceToMultiple(y, size));
		case 'solid':
			return 0;
	}
}

/** The index of the first value in `sorted` that is not below `value` (or `above`: above it). */
function bound(sorted: Float32Array, value: number, above: boolean): number {
	let [low, high] = [0, sorted.length];
	while (low < high) {
		const middle = (low + high) >> 1;
		if (above ? sorted[middle] <= value : sorted[middle] < value) low = middle + 1;
		else high = middle;
	}
	return low;
}

/**
 * The opacity of each pixel of a tile of the shape, from 0 to 1. The tile is one repeat of the
 * shape: `PATTERN_SPACING` × `scale` CSS pixels, the diagonals √2 times as large, so their lines
 * are as far apart across them. Each pixel is the share of its samples that are within the lines
 * or the dots; the width of the lines (or the radius of the dots) is the distance within which as
 * many samples are as `coverage` asks for, so the mean opacity of the tile is the coverage. That
 * also holds for dots so large that they overlap.
 */
function opacities(shape: PatternShape, scale: number, coverage: number): { size: number; opacity: Float32Array } {
	const spacing = PATTERN_SPACING * scale * PATTERN_PIXEL_RATIO;
	// not a tiny tile: the map would show its edges as faint dots
	if (shape === 'solid') return { size: spacing, opacity: new Float32Array(spacing ** 2).fill(1) };
	const size = Math.max(2, Math.round(isDiagonal(shape) ? spacing * Math.SQRT2 : spacing));
	// samples per pixel along each axis
	const n = Math.max(2, Math.min(8, Math.floor(Math.sqrt(MAX_SAMPLES / size ** 2))));
	const distances = new Float32Array(size * size * n * n);
	let i = 0;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			for (let sy = 0; sy < n; sy++) {
				for (let sx = 0; sx < n; sx++) {
					// on a slightly turned grid, so that no two samples of a pixel share a column, a row
					// or a diagonal, and the coverage can be met in fine steps
					distances[i++] = distance(shape, size, x + (sx + (sy + 0.5) / n) / n, y + (sy + (n - sx - 0.5) / n) / n);
				}
			}
		}
	}

	// the distance within which the share of the samples is closest to the coverage
	const sorted = distances.slice().sort();
	const wanted = Math.round(coverage * sorted.length);
	const limit = sorted[Math.min(wanted, sorted.length - 1)];
	// samples at the same distance are all in or all out, whichever is closer
	const [below, upTo] = [bound(sorted, limit, false), bound(sorted, limit, true)];
	const inside =
		Math.abs(upTo - wanted) < Math.abs(below - wanted) ? (d: number) => d <= limit : (d: number) => d < limit;

	const opacity = new Float32Array(size * size);
	for (let p = 0; p < opacity.length; p++) {
		let count = 0;
		for (let s = p * n * n; s < (p + 1) * n * n; s++) if (inside(distances[s])) count++;
		opacity[p] = count / (n * n);
	}
	return { size, opacity };
}

const cache = new Map<string, { size: number; opacity: Float32Array }>();

/** The image of a pattern of the shape in the color, e.g. for the map and the legend. */
export function patternImage(shape: PatternShape, scale: number, coverage: number, color: string): PatternImage {
	const key = `${shape}:${scale}:${coverage}`;
	let tile = cache.get(key);
	if (!tile) cache.set(key, (tile = opacities(shape, scale, coverage)));
	const { size, opacity } = tile;
	const { r, g, b, alpha } = parseColor(color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	const data = new Uint8ClampedArray(size * size * 4);
	for (let p = 0; p < opacity.length; p++) {
		data.set([r, g, b, 255 * alpha * opacity[p]], p * 4);
	}
	return { width: size, height: size, data, pixelRatio: PATTERN_PIXEL_RATIO };
}

/** The image of a fill pattern of the format in the color. */
export function fillPatternImage(pattern: FillPatternName, color: string): PatternImage {
	const { shape, coverage } = PATTERNS[pattern];
	return patternImage(shape, 1, coverage, color);
}

/**
 * Add the image of a fill pattern, when the map asks for it (e.g. again after a new map style).
 * Returns false for other images.
 */
export function addFillPatternImage(map: maplibregl.Map, name: string): boolean {
	const parsed = parseFillPatternName(name);
	if (!parsed) return false;
	if (!map.hasImage(name)) {
		const { width, height, data, pixelRatio } = fillPatternImage(parsed.pattern, parsed.color);
		map.addImage(name, { width, height, data }, { pixelRatio });
	}
	return true;
}
