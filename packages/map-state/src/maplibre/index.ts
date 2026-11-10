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
export { cssColor } from './css_color.js';
export {
	circleGeometry,
	elementFeatures,
	elementGeometry,
	lineGeometry,
	polygonGeometry,
	type ElementFeature,
	type ElementRole,
	type RoleProperties
} from './features.js';
export { circle, distance, EARTH_RADIUS, lat2mercator, mercator2lat } from './geometry.js';
export { iconBox, LABEL_PLACES, labelPlace, labelPlaceTable, type IconBox, type TextAnchor } from './label_places.js';
export { splitOpacity } from './opacity.js';
export {
	arrowProperties,
	fillProperties,
	strokeProperties,
	symbolProperties,
	type FillProperties,
	type StrokeProperties,
	type SymbolProperties
} from './properties.js';
export { curvePoint, smoothPath } from './smooth_path.js';
export {
	anchorOf,
	fetchSymbolCatalog,
	spriteSheets,
	symbolLookup,
	type FetchJSON,
	type SymbolCatalog
} from './symbols.js';
export type { IconAnchor, StyleImage, SymbolInfo } from './types.js';
