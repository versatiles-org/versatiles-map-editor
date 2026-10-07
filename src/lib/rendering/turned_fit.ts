import type { Bounds } from '@versatiles/map-state';
import { lat2mercator, mercator2lat, type GeoPoint } from '../geometry.js';

/*
 * Showing an area on a map that is rotated and tilted: where the camera must look, and how close,
 * so the area is completely within a part of the window. MapLibre fits areas only on a map seen
 * from straight above, so the perspective of the tilted map is computed here, like MapLibre draws
 * a Mercator map without terrain.
 */

/** A rectangle on the map, in pixels from its top left corner. */
export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** A map window and how its map is turned. */
export interface TurnedWindow {
	/** The compass direction at the top, in degrees clockwise from north. */
	bearing: number;
	/** The tilt in degrees, 0 from straight above. */
	pitch: number;
	/** The vertical field of view of the camera, in degrees. */
	fov: number;
	/** The height of the whole window in pixels, which the field of view spans. */
	height: number;
	/** Where the center of the map is shown: the middle of the window without the padding of the map. */
	focus: [number, number];
}

/** Where the map looks: the point at the `focus` of the window, and the zoom level. */
export interface TurnedCamera {
	center: GeoPoint;
	zoom: number;
}

/** The size of the world at zoom level 0, in pixels. */
const WORLD_SIZE = 512;
/** A point must be this far in front of the camera, as a part of its distance to the center, to be shown. */
const MIN_DEPTH = 0.05;

type Point = [number, number];

/** On the world as Mercator draws it, from 0 to 1, x to the east and y to the south. */
function toWorld([lon, lat]: GeoPoint): Point {
	return [(lon + 180) / 360, (1 - lat2mercator(lat) / Math.PI) / 2];
}

function fromWorld([x, y]: Point): GeoPoint {
	return [x * 360 - 180, mercator2lat((1 - 2 * y) * Math.PI)];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Where a point of the world is shown in the window, in pixels; undefined if it is behind the
 * camera or nearly so, e.g. beyond the horizon of a tilted map.
 */
function show(point: Point, center: Point, zoom: number, window: TurnedWindow): Point | undefined {
	const scale = WORLD_SIZE * 2 ** zoom;
	const [dx, dy] = [(point[0] - center[0]) * scale, (point[1] - center[1]) * scale];
	// on the ground as the window is turned: x to the right, y towards the viewer
	const [cos, sin] = [Math.cos(radians(window.bearing)), Math.sin(radians(window.bearing))];
	const [x, y] = [dx * cos + dy * sin, -dx * sin + dy * cos];
	// the camera looks at the center from this distance, tilted: what is nearer to the viewer is closer
	const distance = window.height / 2 / Math.tan(radians(window.fov) / 2);
	const depth = distance - y * Math.sin(radians(window.pitch));
	if (depth < distance * MIN_DEPTH) return undefined;
	const size = distance / depth;
	return [window.focus[0] + x * size, window.focus[1] + y * Math.cos(radians(window.pitch)) * size];
}

/**
 * The place on the ground that is shown at a pixel of the window, as the window is turned (x to
 * the right, y towards the viewer), in pixels from the center of the map; undefined above the
 * horizon of a tilted map.
 */
function ground([sx, sy]: Point, window: TurnedWindow): Point | undefined {
	const distance = window.height / 2 / Math.tan(radians(window.fov) / 2);
	const [cos, sin] = [Math.cos(radians(window.pitch)), Math.sin(radians(window.pitch))];
	const v = sy - window.focus[1];
	const divisor = distance * cos + v * sin;
	if (divisor <= 0) return undefined;
	const y = (v * distance) / divisor;
	return [((sx - window.focus[0]) * (distance - y * sin)) / distance, y];
}

/** Where a point of the map is shown in the window, in pixels; undefined if it is not shown, see `show`. */
export function projectTurned(point: GeoPoint, camera: TurnedCamera, window: TurnedWindow): Point | undefined {
	return show(toWorld(point), toWorld(camera.center), camera.zoom, window);
}

/** The rectangle around the points in the window; undefined if one is not shown. */
function boxOf(points: Point[], center: Point, zoom: number, window: TurnedWindow): Box | undefined {
	const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
	for (const point of points) {
		const shown = show(point, center, zoom, window);
		if (!shown) return undefined;
		box.left = Math.min(box.left, shown[0]);
		box.right = Math.max(box.right, shown[0]);
		box.top = Math.min(box.top, shown[1]);
		box.bottom = Math.max(box.bottom, shown[1]);
	}
	return box;
}

/**
 * The center at which the points are shown in the middle of the rectangle, at a zoom level, and
 * the rectangle around them there; undefined if they cannot all be shown, e.g. too close.
 */
function centered(points: Point[], start: Point, zoom: number, window: TurnedWindow, rect: Box) {
	const scale = WORLD_SIZE * 2 ** zoom;
	const [cos, sin] = [Math.cos(radians(window.bearing)), Math.sin(radians(window.bearing))];
	let center = start;
	// the perspective is not linear, so the center is moved a few times, each by what is left
	for (let i = 0; i < 30; i++) {
		const box = boxOf(points, center, zoom, window);
		if (!box) return undefined;
		const is: Point = [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
		const should: Point = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
		if (Math.hypot(is[0] - should[0], is[1] - should[1]) < 0.01) return { center, box };
		// by what lies between the two places on the ground
		const [from, to] = [ground(should, window), ground(is, window)];
		if (!from || !to) return undefined;
		const [x, y] = [to[0] - from[0], to[1] - from[1]];
		// on the ground as the window is turned, back to the world
		center = [center[0] + (x * cos - y * sin) / scale, center[1] + (x * sin + y * cos) / scale];
	}
	// not in the middle: e.g. so close that the points do not fit, and only far away, towards the
	// horizon of a tilted map, where everything is small
	return undefined;
}

/**
 * The camera that shows the area as large as possible within the rectangle of the window, in its
 * middle, on a map that is rotated and tilted. Not closer than `maxZoom`, e.g. for an area that is
 * a single point, and not farther than `minZoom`, where the area may not fit.
 */
export function fitTurned(
	[west, south, east, north]: Bounds,
	window: TurnedWindow,
	rect: Box,
	{ minZoom = 0, maxZoom = 22 } = {}
): TurnedCamera {
	// the corners: their rectangle in the window is the one of the whole area
	const corners = [toWorld([west, south]), toWorld([east, south]), toWorld([east, north]), toWorld([west, north])];
	const middle: Point = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
	const [width, height] = [rect.right - rect.left, rect.bottom - rect.top];
	const at = (zoom: number, start: Point) => {
		const result = centered(corners, start, zoom, window, rect);
		if (!result) return undefined;
		const { box } = result;
		return box.right - box.left <= width && box.bottom - box.top <= height ? result.center : undefined;
	};

	// the closest zoom at which the area fits, by halving the range
	let center = at(minZoom, middle) ?? middle;
	let [low, high] = [minZoom, maxZoom];
	const closest = at(high, center);
	if (closest) return { center: fromWorld(closest), zoom: high };
	for (let i = 0; i < 30 && high - low > 1e-4; i++) {
		const zoom = (low + high) / 2;
		const fitting = at(zoom, center);
		if (fitting) {
			center = fitting;
			low = zoom;
		} else {
			high = zoom;
		}
	}
	return { center: fromWorld(center), zoom: low };
}
