/**
 * Where the viewer looks when a map opens, computed without a map: its frame, else all its
 * elements, else the whole world, within the viewer's padding and zoom limits, rotated and tilted
 * as the frame says.
 */
import { boundsOf } from '../bounds.js';
import type { Bounds, MapState, Position } from '../types.js';
import { clampLatitude, lat2mercator, MAX_LATITUDE, mercator2lat } from './geometry.js';
import { fitTurned, type Box } from './turned_fit.js';

/** The padding of the viewer's map on every side, in pixels, besides its bars. */
export const MAP_PADDING = 10;
/** The padding around a frame that the author set, in pixels, within the padding of the map. */
export const FRAME_PADDING = 10;
/** The padding around the elements, which is larger, since the symbols of markers are larger than their points. */
export const ELEMENTS_PADDING = 30;
/** The closest zoom for elements all at one place, e.g. a single marker. A frame has no such limit. */
export const ELEMENTS_MAX_ZOOM = 15;
/** The vertical field of view of MapLibre's camera, in degrees. */
export const DEFAULT_FOV = 36.87;
/** MapLibre's zoom limits, without others. */
const MIN_ZOOM = 0;
const MAX_ZOOM = 22;
/** The size of the world at zoom level 0, in pixels. */
const WORLD_SIZE = 512;

/** Where a map looks: the point in the middle of the window, its zoom, and how it is turned, in degrees. */
export interface MapCamera {
	center: Position;
	zoom: number;
	/** The compass direction at the top, clockwise from north. */
	bearing: number;
	/** The tilt, 0 from straight above. */
	pitch: number;
}

/** On the world as Mercator draws it, from 0 to 1, x to the east and y to the south. */
function toWorld([lon, lat]: Position): [number, number] {
	return [(lon + 180) / 360, (1 - lat2mercator(lat) / Math.PI) / 2];
}

function fromWorld([x, y]: [number, number]): Position {
	return [x * 360 - 180, mercator2lat((1 - 2 * y) * Math.PI)];
}

/**
 * The camera that shows the area as large as possible within the rectangle of a window, in its
 * middle, seen from straight above with north at the top, like MapLibre's `cameraForBounds`:
 * `center` is shown in the middle of the rectangle. Not closer than `maxZoom`, e.g. for an area
 * that is a single point, and not farther than `minZoom`, where the area may not fit.
 */
export function fitFlat(
	[west, south, east, north]: Bounds,
	rect: Box,
	{ minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM } = {}
): { center: Position; zoom: number } {
	const [x0, y0] = toWorld([west, clampLatitude(north)]);
	const [x1, y1] = toWorld([east, clampLatitude(south)]);
	const width = Math.max(0, rect.right - rect.left);
	const height = Math.max(0, rect.bottom - rect.top);
	// as large as both sides fit, in the parts of the world that a pixel of zoom 0 is
	const scale = Math.min(width / ((x1 - x0) * WORLD_SIZE), height / ((y1 - y0) * WORLD_SIZE));
	const zoom = Math.min(maxZoom, Math.max(minZoom, Math.log2(scale)));
	return { center: fromWorld([(x0 + x1) / 2, (y0 + y1) / 2]), zoom };
}

/**
 * The camera as MapLibre keeps it in a single world, without the copies beside it, as the viewer
 * draws its map: zoomed in until the world fills the window's width and height, and else moved
 * until nothing beyond it is shown, see `defaultConstrain` of MapLibre's Mercator transform. The
 * window here is without the padding of the map. On a turned map, it is the same: MapLibre keeps
 * only the center within the world.
 */
export function constrainToWorld(
	{ center, zoom }: { center: Position; zoom: number },
	{ width, height }: { width: number; height: number }
): { center: Position; zoom: number } {
	const worldSize = WORLD_SIZE * 2 ** zoom;
	let [x, y] = toWorld([center[0], clampLatitude(center[1])]).map((value) => value * worldSize);
	const scaleX = worldSize < width ? width / worldSize : 0;
	const scaleY = worldSize < height ? height / worldSize : 0;
	const scale = Math.max(scaleX, scaleY);
	if (scale) {
		// in the middle of the world where it is too small, at the larger zoom
		if (scaleX) x = worldSize / 2;
		if (scaleY) y = worldSize / 2;
		return { center: fromWorld([x / worldSize, y / worldSize]), zoom: zoom + Math.log2(scale) };
	}
	const [w2, h2] = [width / 2, height / 2];
	x = Math.min(Math.max(x, w2), worldSize - w2);
	y = Math.min(Math.max(y, h2), worldSize - h2);
	return { center: fromWorld([x / worldSize, y / worldSize]), zoom };
}

/**
 * Where the viewer looks when it opens the map in a window of `width` × `height` pixels, without
 * bars and without a legend: the frame of the map completely, else all its elements, else the whole
 * world, within the viewer's padding (`MAP_PADDING`, and `FRAME_PADDING` or `ELEMENTS_PADDING`) and
 * zoom limits, rotated and tilted as the frame says, and in a single world (`constrainToWorld`).
 * Fitted on flat ground: on a map with terrain, the viewer fits the area with its heights, and may
 * look a little closer or farther.
 */
export function mapCamera(
	state: Pick<MapState, 'elements' | 'frame' | 'meta'>,
	{ width, height }: { width: number; height: number }
): MapCamera {
	const frame = state.frame?.bounds;
	const [west, south, east, north] = frame ?? boundsOf(state.elements) ?? [-180, -MAX_LATITUDE, 180, MAX_LATITUDE];
	const area: Bounds = [west, clampLatitude(south), east, clampLatitude(north)];
	const padding = MAP_PADDING + (frame ? FRAME_PADDING : ELEMENTS_PADDING);
	const rect: Box = { left: padding, top: padding, right: width - padding, bottom: height - padding };
	const viewer = state.meta?.viewer;
	const limits = {
		minZoom: viewer?.minZoom ?? MIN_ZOOM,
		maxZoom: Math.min(viewer?.maxZoom ?? MAX_ZOOM, frame ? MAX_ZOOM : ELEMENTS_MAX_ZOOM)
	};
	const bearing = state.frame?.bearing ?? 0;
	const pitch = state.frame?.pitch ?? 0;
	const window = { bearing, pitch, fov: DEFAULT_FOV, height, focus: [width / 2, height / 2] as [number, number] };
	const fitted = !bearing && !pitch ? fitFlat(area, rect, limits) : fitTurned(area, window, rect, limits);
	const screen = { width: width - 2 * MAP_PADDING, height: height - 2 * MAP_PADDING };
	return { ...constrainToWorld(fitted, screen), bearing, pitch };
}
