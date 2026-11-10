import { roundCoordinate, type Bounds } from '@versatiles/map-state';
import { distance, EARTH_RADIUS, lat2mercator, mercator2lat } from '@versatiles/map-state/maplibre';

// what the map draws, from the package, so a server draws it alike
export {
	circle,
	clampLatitude,
	distance,
	lat2mercator,
	MAX_LATITUDE,
	mercator2lat
} from '@versatiles/map-state/maplibre';

/** A position as [longitude, latitude], in degrees. */
export type GeoPoint = [number, number];
/** A line of positions, e.g. of a line or of the ring of a polygon. */
export type GeoPath = GeoPoint[];

/**
 * A position on the grid of the coordinates of a map: 0.00001°, about 1 m (`COORDINATE_DIGITS`).
 * The editor keeps all positions on it, so a map is the same in the editor, in a file and in a link.
 */
export function snapPoint([x, y]: GeoPoint): GeoPoint {
	return [roundCoordinate(x), roundCoordinate(y)];
}

/** An area whose sides are on the grid of the coordinates, see `snapPoint`. */
export function snapBounds(bounds: Bounds): Bounds {
	return bounds.map(roundCoordinate) as Bounds;
}

export function getMiddlePoint(p0: GeoPoint, p1: GeoPoint): GeoPoint {
	const y0 = lat2mercator(p0[1]);
	const y1 = lat2mercator(p1[1]);
	return [(p0[0] + p1[0]) / 2, mercator2lat((y0 + y1) / 2)];
}

/** Move a point by `dx` degrees of longitude and `dy` in mercator units, so shapes keep their form on the map. */
export function movePoint([x, y]: GeoPoint, dx: number, dy: number): GeoPoint {
	return [x + dx, mercator2lat(lat2mercator(y) + dy)];
}

function degreesToRadians(degrees: number): number {
	return ((degrees % 360) * Math.PI) / 180;
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
