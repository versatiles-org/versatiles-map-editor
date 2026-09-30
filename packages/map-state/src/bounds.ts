import type { Bounds, StateElement } from './types.js';

/** Meters per degree of latitude. */
const METERS_PER_DEGREE = 111320;

/**
 * The bounds of the elements: all points of markers, lines and polygons, and circles with their
 * radius. Undefined without elements. A single marker has bounds of zero size.
 */
export function boundsOf(elements: StateElement[]): Bounds | undefined {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	const add = ([lng, lat]: [number, number], dx = 0, dy = 0) => {
		west = Math.min(west, lng - dx);
		east = Math.max(east, lng + dx);
		south = Math.min(south, lat - dy);
		north = Math.max(north, lat + dy);
	};
	for (const element of elements) {
		switch (element.type) {
			case 'marker':
				add(element.point);
				break;
			case 'line':
			case 'polygon':
				element.points.forEach((point) => add(point));
				break;
			case 'circle': {
				const dy = element.radius / METERS_PER_DEGREE;
				const dx = dy / Math.max(Math.cos((element.point[1] * Math.PI) / 180), 1e-6);
				add(element.point, dx, dy);
				break;
			}
		}
	}
	if (!Number.isFinite(west)) return undefined;
	return [west, Math.max(-90, south), east, Math.min(90, north)];
}

/** The center of bounds. */
export function centerOf([west, south, east, north]: Bounds): [number, number] {
	return [(west + east) / 2, (south + north) / 2];
}
