import type * as maplibregl from 'maplibre-gl';
import { ARROW_NAMES } from '@versatiles/map-state';
import { lat2mercator, type GeoPath, type GeoPoint } from '../geometry.js';
import type { ArrowProperties } from '../style/index.js';

/**
 * The arrowheads at the ends of lines: one image per style, an SDF image (a distance field, which
 * the layer colors and scales), pointing to the right, with the end point of the line in its
 * middle. The heads are drawn in pixels, like the width of the line, so they keep their size at
 * every zoom level.
 */

/** The width of a head across the line in its image, in pixels of the map at `icon-size` 1. */
export const HEAD_WIDTH = 24;
/** The room around a head in its image, for the distance field outside of it. */
const PADDING = 4;
/** The image pixels per pixel of the map, for sharp edges on screens with a high density. */
const PIXEL_RATIO = 2;
/** The distance field: the edge has the value 0.75, which falls by 1 per 8 image pixels, as MapLibre's SDF images. */
const SDF_EDGE = 0.75;
const SDF_RADIUS = 8;

/** The size of the images, in pixels of the map: the heads lie left of the middle, where the end point is. */
const IMAGE_WIDTH = 2 * (HEAD_WIDTH + PADDING);
const IMAGE_HEIGHT = HEAD_WIDTH + 2 * PADDING;

/** The triangle as long as it is wide: its tip on the middle, half its width to each side. */
const TRIANGLE_LENGTH = HEAD_WIDTH;
/** The sine of the half angle of the triangle's tip. */
const TRIANGLE_SINE = HEAD_WIDTH / 2 / Math.hypot(TRIANGLE_LENGTH, HEAD_WIDTH / 2);
/** The chevron as thick as the line at the default size (3), its arms at 45°, together as wide as the head. */
const CHEVRON_THICKNESS = HEAD_WIDTH / 3;
const CHEVRON_ARM = (HEAD_WIDTH - CHEVRON_THICKNESS) / 2;

const IMAGE_PREFIX = 'arrow-';

/** The name of the image of an arrowhead, e.g. "arrow-triangle". */
export function arrowImageName(arrow: string): string {
	return IMAGE_PREFIX + arrow;
}

/** The distance from the segment a–b. */
function segmentDistance([px, py]: GeoPoint, [ax, ay]: GeoPoint, [bx, by]: GeoPoint): number {
	const [dx, dy] = [bx - ax, by - ay];
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
	return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** The signed distance from the edge of a head (negative inside), in pixels of the map, from its point on the end point. */
function headDistance(arrow: string, point: GeoPoint): number {
	switch (arrow) {
		case 'triangle': {
			const corners: GeoPoint[] = [
				[0, 0],
				[-TRIANGLE_LENGTH, -HEAD_WIDTH / 2],
				[-TRIANGLE_LENGTH, HEAD_WIDTH / 2]
			];
			const edge = Math.min(...corners.map((a, i) => segmentDistance(point, a, corners[(i + 1) % 3])));
			const [x, y] = point;
			// inside: right of the base and within the slope of both sides
			const inside = x >= -TRIANGLE_LENGTH && x <= 0 && Math.abs(y) <= (-x * HEAD_WIDTH) / 2 / TRIANGLE_LENGTH;
			return inside ? -edge : edge;
		}
		case 'chevron': {
			const arms = [-CHEVRON_ARM, CHEVRON_ARM].map((y) => segmentDistance(point, [0, 0], [-CHEVRON_ARM, y]));
			return Math.min(...arms) - CHEVRON_THICKNESS / 2;
		}
		case 'circle':
			return Math.hypot(...point) - HEAD_WIDTH / 2;
		default:
			return Infinity;
	}
}

/** The pixels of the image of an arrowhead: only the alpha channel counts, the distance field. */
export function arrowImage(arrow: string): { width: number; height: number; data: Uint8Array } {
	const width = IMAGE_WIDTH * PIXEL_RATIO;
	const height = IMAGE_HEIGHT * PIXEL_RATIO;
	const data = new Uint8Array(width * height * 4);
	for (let row = 0; row < height; row++) {
		for (let column = 0; column < width; column++) {
			// the middle of the pixel, from the end point of the line, in pixels of the map
			const point: GeoPoint = [
				(column + 0.5) / PIXEL_RATIO - IMAGE_WIDTH / 2,
				(row + 0.5) / PIXEL_RATIO - IMAGE_HEIGHT / 2
			];
			const value = SDF_EDGE - (headDistance(arrow, point) * PIXEL_RATIO) / SDF_RADIUS;
			data[(row * width + column) * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, value)));
		}
	}
	return { width, height, data };
}

/**
 * Add the image of an arrowhead, when the map asks for it (e.g. again after a new map style).
 * Returns false for other images.
 */
export function addArrowImage(map: maplibregl.Map, name: string): boolean {
	if (!name.startsWith(IMAGE_PREFIX)) return false;
	const arrow = name.slice(IMAGE_PREFIX.length);
	if (arrow === 'none' || !ARROW_NAMES.includes(arrow)) return false;
	if (!map.hasImage(name)) map.addImage(name, arrowImage(arrow), { sdf: true, pixelRatio: PIXEL_RATIO });
	return true;
}

/** An arrowhead as the layer of the arrowheads draws it: at the end point, see `arrowHeadFeatures`. */
export interface ArrowHead {
	point: GeoPoint;
	/** Whether it is at the last point, else at the first one. */
	end: boolean;
	properties: {
		icon: string;
		/** Clockwise in degrees, from pointing east. */
		rotate: number;
		size: number;
		/** Of the image (pointing east), in its pixels: the triangle lies beyond the end point. */
		offset: [number, number];
		color: string;
	};
}

/** On the map as Mercator draws it: angles as on the screen, x to the east and y to the south. */
function screenPoint([lon, lat]: GeoPoint): GeoPoint {
	return [(lon * Math.PI) / 180, -lat2mercator(lat)];
}

/**
 * The direction in which the path leaves its first point (`end` false) or its last point, from the
 * last point before it at another place, clockwise in degrees from east; undefined if all points
 * are at one place.
 */
export function endDirection(path: GeoPath, end: boolean): number | undefined {
	const points = (end ? [...path].reverse() : path).map(screenPoint);
	const [x0, y0] = points[0];
	const other = points.find(([x, y]) => x !== x0 || y !== y0);
	if (!other) return undefined;
	return (Math.atan2(y0 - other[1], x0 - other[0]) * 180) / Math.PI;
}

/** The arrowheads of a line with its arrow properties, see `LineStyle.getArrowProperties`. */
export function arrowHeads(path: GeoPath, arrows: ArrowProperties): ArrowHead[] {
	const size = (arrows.size * arrows.width) / HEAD_WIDTH;
	if (!(size > 0)) return [];
	return [false, true].flatMap((end) => {
		const arrow = end ? arrows.end : arrows.start;
		const rotate = endDirection(path, end);
		if (arrow === 'none' || rotate === undefined) return [];
		// the tip of the triangle so far beyond the end point that the round cap of the line is within
		// it; in pixels of the image, which `icon-size` scales
		const offset = arrow === 'triangle' ? arrows.width / 2 / TRIANGLE_SINE / size : 0;
		return [
			{
				point: path[end ? path.length - 1 : 0],
				end,
				properties: { icon: arrowImageName(arrow), rotate, size, offset: [offset, 0], color: arrows.color }
			}
		];
	});
}
