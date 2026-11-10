import type { Position } from '../types.js';

/** The mean radius of the Earth, in meters. */
export const EARTH_RADIUS = 6371008.8;

/** The Mercator y of a latitude in degrees, in radians: 0 at the equator, π at 85.05°. */
export function lat2mercator(lat: number): number {
	return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

/** The latitude in degrees of a Mercator y, the inverse of `lat2mercator`. */
export function mercator2lat(y: number): number {
	return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

function degreesToRadians(degrees: number): number {
	return ((degrees % 360) * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
	return ((radians / Math.PI) % 2) * 180;
}

/** The distance between two positions on the Earth's surface, in meters (haversine). */
export function distance(point1: Position, point2: Position): number {
	const lat1 = degreesToRadians(point1[1]);
	const lat2 = degreesToRadians(point2[1]);
	const deltaLat = degreesToRadians(point2[1] - point1[1]);
	const deltaLng = degreesToRadians(point2[0] - point1[0]);

	const a =
		Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return EARTH_RADIUS * c;
}

/**
 * The ring of a circle on the Earth's surface: `steps` positions at `radius` meters from `center`,
 * from north clockwise, without repeating the first one.
 */
export function circle(center: Position, radius: number, steps: number): Position[] {
	const radians = radius / EARTH_RADIUS;
	const lng1 = degreesToRadians(center[0]);
	const lat1 = degreesToRadians(center[1]);

	const result: Position[] = [];
	for (let i = 0; i < steps; i++) {
		const bearingRad = degreesToRadians((i * 360) / steps);
		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(radians) + Math.cos(lat1) * Math.sin(radians) * Math.cos(bearingRad)
		);
		const lng2 =
			lng1 +
			Math.atan2(
				Math.sin(bearingRad) * Math.sin(radians) * Math.cos(lat1),
				Math.cos(radians) - Math.sin(lat1) * Math.sin(lat2)
			);
		result.push([radiansToDegrees(lng2), radiansToDegrees(lat2)]);
	}
	return result;
}
