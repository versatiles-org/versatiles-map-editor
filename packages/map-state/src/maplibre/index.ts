/**
 * `@versatiles/map-state/maplibre`: what MapLibre needs to draw a map as the viewer of the
 * VersaTiles Map Editor shows it, from a decoded map state, without a browser, e.g. on a server for
 * a preview image. The editor and its viewer draw their maps with the same functions.
 *
 * An entry of its own, so the main entry stays without dependencies for those who only encode and
 * decode maps. The main entry never imports from here.
 *
 * @module
 */

export {
	arrowHeads,
	arrowImage,
	arrowImageName,
	arrowImageOf,
	drawArrowHead,
	endDirection,
	HEAD_WIDTH,
	headDirection,
	headReach,
	ROTATE_ZOOMS,
	rotateProperty,
	type ArrowHead,
	type ArrowHeadCanvas,
	type ArrowProperties
} from './arrow_heads.js';
export {
	fillPatternName,
	parseFillPatternName,
	PATTERN_PIXEL_RATIO,
	PATTERN_SPACING,
	patternImage,
	patternImageOf,
	type FillPatternImage,
	type PatternImage
} from './fill_patterns.js';
export { circle, distance, EARTH_RADIUS, lat2mercator, mercator2lat } from './geometry.js';
export { curvePoint, smoothPath } from './smooth_path.js';
export type { StyleImage } from './types.js';
