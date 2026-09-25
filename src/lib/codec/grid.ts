/** Meters per degree of latitude, and of longitude at the equator. */
const METERS_PER_DEGREE = 111320;

/** Decimal places of the coordinates in degrees: 5 ≈ 1.1 m (like version 0), 4 ≈ 11 m, 3 ≈ 111 m, … */
export const MAX_DIGITS = 9;

/** The decimal places that give about this resolution in meters. */
export function digitsForResolution(meters: number): number {
	const digits = Math.round(-Math.log10(meters / METERS_PER_DEGREE));
	return Math.min(MAX_DIGITS, Math.max(0, digits));
}

/** The resolution in meters of these decimal places (in latitude). */
export function resolutionOfDigits(digits: number): number {
	return METERS_PER_DEGREE / Math.pow(10, digits);
}

/**
 * Coordinates as whole steps of 10^-digits degrees from an origin (since version 1): the center
 * of the map, so the numbers stay small. Decoded coordinates have exactly `digits` decimal places.
 */
export class LocalGrid {
	private readonly scale: number;
	private readonly origin: [number, number];

	constructor(center: [number, number], digits: number) {
		this.scale = Math.pow(10, digits);
		this.origin = [Math.round(center[0] * this.scale), Math.round(center[1] * this.scale)];
	}

	toGrid([lng, lat]: [number, number]): [number, number] {
		return [Math.round(lng * this.scale) - this.origin[0], Math.round(lat * this.scale) - this.origin[1]];
	}

	fromGrid([x, y]: [number, number]): [number, number] {
		// a division of integers, so e.g. 1305 / 100 is exactly 13.05
		return [(x + this.origin[0]) / this.scale, (y + this.origin[1]) / this.scale];
	}
}
