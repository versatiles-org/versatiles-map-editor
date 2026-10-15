import type { Bounds } from '@versatiles/map-state';
import { lat2mercator, mercator2lat, type GeoPoint } from '../geometry.js';

/*
 * Showing an area on a map that is rotated and tilted: where the camera must look, and how close,
 * so the area is completely within a part of the window. MapLibre fits areas only on a map seen
 * from straight above, so the perspective of the tilted map is computed here, like MapLibre draws
 * a Mercator map. With terrain, MapLibre puts the center on the ground and the camera at its usual
 * distance from there, and draws every place at its height: so the heights count from the one of
 * the center. But the ground under the center goes up and down as the center moves, and the camera
 * with it, which makes it hard to find the center: so the area is fitted with the camera looking
 * at one height, and then the center is put where it looks at the ground, as MapLibre does when
 * it puts the center on the ground, keeping the camera where it is.
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
	/** The height of the ground at a place in meters, as the map draws it (e.g. exaggerated); none for a flat map. */
	heightOf?: (point: GeoPoint) => number;
}

/** Where the map looks: the point at the `focus` of the window, and the zoom level. */
export interface TurnedCamera {
	center: GeoPoint;
	zoom: number;
}

/** The size of the world at zoom level 0, in pixels. */
const WORLD_SIZE = 512;
/** The length of the equator in meters, as MapLibre measures heights. */
const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;
/** The points along each side of an area on terrain, whose heights make its sides curves. */
const SIDE_STEPS = 16;
/** A point must be this far in front of the camera, as a part of its distance to the center, to be shown. */
const MIN_DEPTH = 0.05;

type Point = [number, number];

/** A place of the world (see `toWorld`) and its height as a part of the world (as `toWorld` measures), 0 on a flat map. */
interface Place {
	point: Point;
	height: number;
}

/** On the world as Mercator draws it, from 0 to 1, x to the east and y to the south. */
function toWorld([lon, lat]: GeoPoint): Point {
	return [(lon + 180) / 360, (1 - lat2mercator(lat) / Math.PI) / 2];
}

function fromWorld([x, y]: Point): GeoPoint {
	return [x * 360 - 180, mercator2lat((1 - 2 * y) * Math.PI)];
}

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** A place of the world and its height, see `Place`. */
function place(point: Point, window: TurnedWindow): Place {
	if (!window.heightOf) return { point, height: 0 };
	const geo = fromWorld(point);
	// the meters of a height as a part of the world, as MapLibre does: by its latitude
	return { point, height: window.heightOf(geo) / (EARTH_CIRCUMFERENCE * Math.cos(radians(geo[1]))) };
}

/**
 * Where a place of the world is shown in the window, in pixels; undefined if it is behind the
 * camera or nearly so, e.g. beyond the horizon of a tilted map. `center`: the center of the map,
 * on the ground.
 */
function show({ point, height }: Place, center: Place, zoom: number, window: TurnedWindow): Point | undefined {
	const scale = WORLD_SIZE * 2 ** zoom;
	const [dx, dy] = [(point[0] - center.point[0]) * scale, (point[1] - center.point[1]) * scale];
	// above the center, in pixels
	const up = (height - center.height) * scale;
	// on the ground as the window is turned: x to the right, y towards the viewer
	const [cos, sin] = [Math.cos(radians(window.bearing)), Math.sin(radians(window.bearing))];
	const [x, y] = [dx * cos + dy * sin, -dx * sin + dy * cos];
	// the camera looks at the center from this distance, tilted: what is nearer to the viewer, or
	// higher, is closer
	const distance = window.height / 2 / Math.tan(radians(window.fov) / 2);
	const [cosPitch, sinPitch] = [Math.cos(radians(window.pitch)), Math.sin(radians(window.pitch))];
	const depth = distance - y * sinPitch - up * cosPitch;
	if (depth < distance * MIN_DEPTH) return undefined;
	const size = distance / depth;
	return [window.focus[0] + x * size, window.focus[1] + (y * cosPitch - up * sinPitch) * size];
}

/** Where a point of the map is shown in the window, in pixels; undefined if it is not shown, see `show`. */
export function projectTurned(point: GeoPoint, camera: TurnedCamera, window: TurnedWindow): Point | undefined {
	return show(place(toWorld(point), window), place(toWorld(camera.center), window), camera.zoom, window);
}

/**
 * Whether a convex shape in the window, by its corners in order, overlaps a rectangle: e.g. an
 * area on a tilted map, which is no rectangle there, and the legend. They do not if a line along a
 * side of one of them separates them.
 */
export function overlapsBox(corners: Point[], box: Box): boolean {
	const rect: Point[] = [
		[box.left, box.top],
		[box.right, box.top],
		[box.right, box.bottom],
		[box.left, box.bottom]
	];
	// the directions across the sides of the rectangle and of the shape
	const across: Point[] = [
		[1, 0],
		[0, 1],
		...corners.map((corner, i): Point => {
			const next = corners[(i + 1) % corners.length];
			return [corner[1] - next[1], next[0] - corner[0]];
		})
	];
	return across.every(([x, y]) => {
		const shape = corners.map((corner) => corner[0] * x + corner[1] * y);
		const other = rect.map((corner) => corner[0] * x + corner[1] * y);
		return Math.max(...shape) > Math.min(...other) && Math.max(...other) > Math.min(...shape);
	});
}

/**
 * The rectangle around the places in the window, with the camera looking at the center at the
 * height `pivot`; undefined if one is not shown.
 */
function boxOf(places: Place[], center: Point, pivot: number, zoom: number, window: TurnedWindow): Box | undefined {
	const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
	for (const one of places) {
		const shown = show(one, { point: center, height: pivot }, zoom, window);
		if (!shown) return undefined;
		box.left = Math.min(box.left, shown[0]);
		box.right = Math.max(box.right, shown[0]);
		box.top = Math.min(box.top, shown[1]);
		box.bottom = Math.max(box.bottom, shown[1]);
	}
	return box;
}

/**
 * The center at which the places are shown in the middle of the rectangle, at a zoom level, and
 * the rectangle around them there; undefined if they cannot all be shown, e.g. too close.
 */
function centered(places: Place[], start: Point, pivot: number, zoom: number, window: TurnedWindow, rect: Box) {
	const should: Point = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
	/** The rectangle around the places at a center, and how far its middle is from the one of `rect`. */
	const at = (center: Point) => {
		const box = boxOf(places, center, pivot, zoom, window);
		if (!box) return undefined;
		const off: Point = [(box.left + box.right) / 2 - should[0], (box.top + box.bottom) / 2 - should[1]];
		return { center, box, off, distance: Math.hypot(...off) };
	};
	// a pixel, in parts of the world
	const pixel = 1 / (WORLD_SIZE * 2 ** zoom);
	let now = at(start);
	if (!now) return undefined;
	// The perspective is not linear, and the places are at their heights: so each pass measures how
	// the rectangle moves with the center, and moves the center by what is left (Newton's method), or
	// by a part of it if that is closer.
	for (let i = 0; i < 30; i++) {
		if (now.distance < 0.01) return now;
		const [east, south] = [at([now.center[0] + pixel, now.center[1]]), at([now.center[0], now.center[1] + pixel])];
		if (!east || !south) return undefined;
		// how far the middle moves for a pixel of the center to the east and to the south, and the
		// move of the center that undoes the offset
		const [a, c] = [(east.off[0] - now.off[0]) / pixel, (east.off[1] - now.off[1]) / pixel];
		const [b, d] = [(south.off[0] - now.off[0]) / pixel, (south.off[1] - now.off[1]) / pixel];
		const determinant = a * d - b * c;
		if (!determinant) return undefined;
		const step: Point = [
			(d * now.off[0] - b * now.off[1]) / determinant,
			(a * now.off[1] - c * now.off[0]) / determinant
		];
		let next;
		for (let part = 1; part > 1 / 64 && !next; part /= 2) {
			const tried = at([now.center[0] - step[0] * part, now.center[1] - step[1] * part]);
			if (tried && tried.distance < now.distance) next = tried;
		}
		// no move comes closer: in the middle as far as anyone can see, or not at all
		if (!next) return now.distance < 0.5 ? now : undefined;
		now = next;
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
	// the corners: on a flat map, their rectangle in the window is the one of the whole area; on
	// terrain, the sides go up and down between them
	const corners = [toWorld([west, south]), toWorld([east, south]), toWorld([east, north]), toWorld([west, north])];
	const steps = window.heightOf ? SIDE_STEPS : 1;
	const places = corners.flatMap((corner, i) => {
		const next = corners[(i + 1) % corners.length];
		return Array.from({ length: steps }, (_, k): Place => {
			const t = k / steps;
			return place([corner[0] + (next[0] - corner[0]) * t, corner[1] + (next[1] - corner[1]) * t], window);
		});
	});
	const middle: Point = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
	// the camera looks at this height, the one of the ground in the middle of the area (see above)
	const pivot = place(middle, window).height;
	const [width, height] = [rect.right - rect.left, rect.bottom - rect.top];
	const at = (zoom: number, start: Point) => {
		// from the center at the zoom before, or else from the middle of the area: e.g. the center
		// at zoom 0, far away for a rectangle that is not in the middle of the window, shows the area
		// at the horizon at a closer zoom, where moving the center hardly moves it
		const result =
			centered(places, start, pivot, zoom, window, rect) ?? centered(places, middle, pivot, zoom, window, rect);
		if (!result) return undefined;
		const { box } = result;
		return box.right - box.left <= width && box.bottom - box.top <= height ? result.center : undefined;
	};

	// the closest zoom at which the area fits, by halving the range
	let center = at(minZoom, middle) ?? middle;
	let [low, high] = [minZoom, maxZoom];
	const closest = at(high, center);
	if (closest) return onGround(closest, high, pivot, window);
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
	return onGround(center, low, pivot, window);
}

/**
 * The camera that looks at the center at the height `pivot` as MapLibre has it with terrain: the
 * same camera, which looks at the center on the ground where its view meets it, from closer or
 * farther, so at another zoom (see `recalculateZoomAndCenter` of MapLibre).
 */
function onGround(center: Point, zoom: number, pivot: number, window: TurnedWindow): TurnedCamera {
	if (!window.heightOf) return { center: fromWorld(center), zoom };
	// from the center to the camera, in parts of the world: back towards the viewer, and up
	const distance = window.height / 2 / Math.tan(radians(window.fov) / 2) / (WORLD_SIZE * 2 ** zoom);
	const [sinPitch, cosPitch] = [Math.sin(radians(window.pitch)), Math.cos(radians(window.pitch))];
	const back = [-Math.sin(radians(window.bearing)) * sinPitch, Math.cos(radians(window.bearing)) * sinPitch, cosPitch];
	const camera = [center[0] + back[0] * distance, center[1] + back[1] * distance, pivot + back[2] * distance];
	/** On the view from the camera, `t` away from it: the place there, and how high it is above the ground. */
	const along = (t: number) => {
		const point: Point = [camera[0] - back[0] * t, camera[1] - back[1] * t];
		return { point, above: camera[2] - back[2] * t - place(point, window).height };
	};
	// the first place on the view that is not above the ground, in steps, then by halving the last
	const steps = 400;
	let [near, far] = [0, NaN];
	for (let i = 1; i <= steps; i++) {
		const t = (4 * distance * i) / steps;
		if (along(t).above <= 0) {
			far = t;
			break;
		}
		near = t;
	}
	// e.g. a map tilted so far that its view meets no ground nearby: MapLibre keeps the camera as it is
	if (Number.isNaN(far)) return { center: fromWorld(center), zoom };
	for (let i = 0; i < 40; i++) {
		const t = (near + far) / 2;
		if (along(t).above > 0) near = t;
		else far = t;
	}
	return { center: fromWorld(along(far).point), zoom: zoom + Math.log2(distance / far) };
}
