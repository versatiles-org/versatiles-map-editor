/** A position as [longitude, latitude], in degrees. */
export type GeoPoint = [number, number];
/** A line of positions, e.g. of a line or of the ring of a polygon. */
export type GeoPath = GeoPoint[];

const EARTH_RADIUS = 6371008.8; // Radius of the Earth in meters

/** The northernmost latitude of the Web Mercator projection. */
export const MAX_LATITUDE = 85.051129;

/** A latitude on the map, which MapLibre needs, e.g. of a viewport near a pole. */
export function clampLatitude(lat: number): number {
	return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
}

export function getMiddlePoint(p0: GeoPoint, p1: GeoPoint): GeoPoint {
	const y0 = lat2mercator(p0[1]);
	const y1 = lat2mercator(p1[1]);
	return [(p0[0] + p1[0]) / 2, mercator2lat((y0 + y1) / 2)];
}

export function lat2mercator(lat: number): number {
	return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
}

export function mercator2lat(y: number): number {
	return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
}

/** Move a point by `dx` degrees of longitude and `dy` in mercator units, so shapes keep their form on the map. */
export function movePoint([x, y]: GeoPoint, dx: number, dy: number): GeoPoint {
	return [x + dx, mercator2lat(lat2mercator(y) + dy)];
}

export function distance(point1: GeoPoint, point2: GeoPoint): number {
	const lat1 = degreesToRadians(point1[1]);
	const lat2 = degreesToRadians(point2[1]);
	const deltaLat = degreesToRadians(point2[1] - point1[1]);
	const deltaLng = degreesToRadians(point2[0] - point1[0]);

	const a =
		Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

	return EARTH_RADIUS * c; // Distance in meters
}

function degreesToRadians(degrees: number): number {
	return ((degrees % 360) * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
	return ((radians / Math.PI) % 2) * 180;
}

export function circle(center: GeoPoint, radius: number, steps: number): GeoPath {
	const radians = radius / EARTH_RADIUS;
	const lng1 = degreesToRadians(center[0]);
	const lat1 = degreesToRadians(center[1]);

	const result: GeoPath = [];
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

export function pathLength(path: GeoPath): number {
	let length = 0;
	for (let i = 1; i < path.length; i++) length += distance(path[i - 1], path[i]);
	return length;
}

// Area of a closed ring on a sphere in square meters, see:
// Chamberlain & Duquette, "Some Algorithms for Polygons on a Sphere", JPL Publication 07-03, 2007
export function polygonArea(path: GeoPath): number {
	const n = path.length;
	if (n < 3) return 0;
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const prev = path[(i + n - 1) % n];
		const next = path[(i + 1) % n];
		sum += degreesToRadians(next[0] - prev[0]) * Math.sin(degreesToRadians(path[i][1]));
	}
	return (Math.abs(sum) * EARTH_RADIUS * EARTH_RADIUS) / 2;
}

// Area of a spherical cap, i.e. a circle on the Earth's surface, in square meters
export function circleArea(radius: number): number {
	return 2 * Math.PI * EARTH_RADIUS * EARTH_RADIUS * (1 - Math.cos(radius / EARTH_RADIUS));
}

/** The largest radius of a circle, in meters: a quarter of the Earth's circumference, a hemisphere. */
export const MAX_CIRCLE_RADIUS = (Math.PI / 2) * EARTH_RADIUS;

/** The radius of a circle on the Earth's surface with this area, the inverse of `circleArea`. */
export function radiusForArea(area: number): number {
	return EARTH_RADIUS * Math.acos(1 - area / (2 * Math.PI * EARTH_RADIUS * EARTH_RADIUS));
}

/** All positions of a geometry, e.g. of all rings of a polygon. */
export function coordinatesOf(geometry: GeoJSON.Geometry): GeoJSON.Position[] {
	switch (geometry.type) {
		case 'Point':
			return [geometry.coordinates];
		case 'LineString':
		case 'MultiPoint':
			return geometry.coordinates;
		case 'Polygon':
		case 'MultiLineString':
			return geometry.coordinates.flat();
		case 'MultiPolygon':
			return geometry.coordinates.flat(2);
		case 'GeometryCollection':
			return geometry.geometries.flatMap(coordinatesOf);
	}
}
