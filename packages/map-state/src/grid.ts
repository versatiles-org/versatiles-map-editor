import type { Bounds } from './types.js';

/** Meters per degree of latitude, and of longitude at the equator. */
const METERS_PER_DEGREE = 111320;

/** The finest step of the coordinates, in degrees: 0.00001°, about 1.1 m. */
const BASE_STEP = 1e-5;
const STEPS_PER_DEGREE = 1e5;

/** The coarsest step is the finest one times 2^15: 0.32768°, about 36 km. Stored in 4 bits. */
export const MAX_EXPONENT = 15;

/**
 * The exponent of the step (`BASE_STEP` × 2^exponent degrees) that is nearest to this resolution in
 * meters: 0 ≈ 1.1 m, 1 ≈ 2.2 m, 2 ≈ 4.5 m, …, 15 ≈ 36 km.
 */
export function exponentForResolution(meters: number): number {
	const exponent = Math.round(Math.log2(meters / resolutionOfExponent(0)));
	return Math.min(MAX_EXPONENT, Math.max(0, exponent));
}

/** The larger side of an area in meters: its height, or its width at its middle latitude. */
function largerSide([west, south, east, north]: Bounds): number {
	const width = (east - west) * METERS_PER_DEGREE * Math.cos((((south + north) / 2) * Math.PI) / 180);
	return Math.max(width, (north - south) * METERS_PER_DEGREE);
}

/**
 * A resolution in meters fine enough for what a map shows (its frame, else the bounds of its
 * elements), e.g. for sharing: a thousandth of the larger side of the area, about a pixel of an
 * embed 1000 pixels wide.
 */
export function resolutionForArea(bounds: Bounds): number {
	return largerSide(bounds) / 1000;
}

/**
 * The coarsest resolution in meters that is still sensible for what a map shows, e.g. the end of
 * the slider of the share dialog: a hundredth of the larger side of the area, about 10 pixels of an
 * embed 1000 pixels wide.
 */
export function coarsestResolutionForArea(bounds: Bounds): number {
	return largerSide(bounds) / 100;
}

/** The resolution in meters of a step with this exponent (in latitude). */
export function resolutionOfExponent(exponent: number): number {
	return BASE_STEP * 2 ** exponent * METERS_PER_DEGREE;
}

/**
 * Coordinates as whole steps of `BASE_STEP` × 2^exponent degrees from an origin: the center of the
 * map, so the numbers stay small. Steps by powers of 2 halve with each zoom level, like the
 * pixels; and as multiples of 0.00001°, decoded coordinates have at most 5 decimal places.
 */
export class LocalGrid {
	private readonly factor: number;
	private readonly origin: [number, number];

	constructor(center: [number, number], exponent: number) {
		this.factor = 2 ** exponent;
		this.origin = [this.steps(center[0]), this.steps(center[1])];
	}

	/** A coordinate in whole steps. */
	private steps(value: number): number {
		return Math.round((value * STEPS_PER_DEGREE) / this.factor);
	}

	toGrid([lng, lat]: [number, number]): [number, number] {
		return [this.steps(lng) - this.origin[0], this.steps(lat) - this.origin[1]];
	}

	fromGrid([x, y]: [number, number]): [number, number] {
		// a division of integers, so e.g. 1341200 / 100000 is exactly 13.412
		return [
			((x + this.origin[0]) * this.factor) / STEPS_PER_DEGREE,
			((y + this.origin[1]) * this.factor) / STEPS_PER_DEGREE
		];
	}
}
