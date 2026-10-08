/**
 * Reads and writes the maps of the [VersaTiles map editor](https://github.com/versatiles-org/versatiles-map-editor):
 * markers, lines, polygons and circles with their styles and popups, and the properties of a map
 * like its background map and its legend.
 *
 * ```sh
 * npm install @versatiles/map-state
 * ```
 *
 * ## A map
 *
 * A map is a {@link MapState}: plain data, without classes. Its `elements` are in drawing order;
 * its `frame` says what a shared map shows when it opens; its `meta` holds the title, the
 * background map, the legend and what the viewer shows.
 *
 * ```ts
 * import { encodeState, decodeState, type MapState } from '@versatiles/map-state';
 *
 * const state: MapState = {
 * 	elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Berlin', style: { color: '#0000ff' } }]
 * };
 * const link = 'https://versatiles.org/versatiles-map-editor/view/#' + encodeState(state);
 * const again = decodeState(link.split('#')[1]);
 * ```
 *
 * ## What to use
 *
 * | To … | use |
 * | --- | --- |
 * | make or read the link of a map | {@link encodeState}, {@link decodeState} |
 * | make a link shorter, with coarser positions | `encodeState(state, { resolution })`, {@link resolutionForArea} |
 * | see what makes a link long | {@link measureLink} |
 * | read or write a `.mapjson` file | {@link stateFromMapJSON}, {@link stateToMapJSON} |
 * | exchange a map with other tools | {@link stateToGeoJSON}, {@link stateFromGeoJSON}, {@link stateToKML}, {@link stateFromKML} |
 * | check data that comes from elsewhere | {@link stateFromMapJSON} keeps only what is valid; {@link sanitizeFrame}, {@link sanitizeBounds} |
 * | know the values a field can have | the tables of names, e.g. {@link STROKE_STYLE_NAMES}, {@link BACKGROUND_THEMES}, {@link LEGEND_POSITIONS} |
 * | know the default of a field | the defaults, e.g. {@link LINE_DEFAULTS}, {@link SYMBOL_DEFAULTS}, {@link LEGEND_DEFAULTS} |
 *
 * ## Good to know
 *
 * - **Defaults are left out.** A field that is missing has its default value, so a state holds only
 *   what differs. The readers of this package return states without defaults.
 * - **Coordinates** are `[longitude, latitude]` in degrees with 5 decimal places, about 1 m.
 * - **Links are compact, not stable yet.** The package is a release candidate: a later version may
 *   not read the links of an earlier one. `.mapjson` files name the version of their format.
 * - **No dependencies.** It is an ES module for browsers and for Node.js 18 or newer.
 *
 * The file format is explained field by field in
 * [MAPJSON.md](https://github.com/versatiles-org/versatiles-map-editor/blob/main/packages/map-state/MAPJSON.md),
 * the formats of links, GeoJSON and KML in the
 * [README](https://github.com/versatiles-org/versatiles-map-editor/blob/main/packages/map-state/README.md).
 * Below, everything the package exports, by what it is for.
 *
 * @packageDocumentation
 */
import { StateWriter } from './writer.js';
import { StateReader } from './reader.js';
import type { MapState } from './types.js';
import { stateFromGeoJSON, stateToGeoJSON, type GeoJSONDocument } from './geojson.js';

export * from './types.js';
export type { GeoJSONDocument } from './geojson.js';
export { stateFromGeoJSON, stateToGeoJSON } from './geojson.js';
export { CODEC_VERSION } from './constants.js';
export { formatHex, parseColor, type RGBA } from './color.js';
export { COLOR_SCHEMES, type ColorScheme } from './color_schemes.js';
export {
	coarsestResolutionForArea,
	exponentForResolution,
	resolutionForArea,
	resolutionOfExponent,
	MAX_EXPONENT
} from './grid.js';
export { boundsOf, centerOf } from './bounds.js';
export { LINK_KINDS, measureLink, measureState, type LinkKind, type LinkMeasure } from './measure.js';
export { COORDINATE_DIGITS, roundCoordinate, sanitizeBounds, sanitizeFrame } from './profile.js';
export {
	MAPJSON_SCHEMA_URL,
	MAPJSON_VERSION,
	MapJSONVersionError,
	stateFromMapJSON,
	stateToMapJSON,
	unknownMapJSONFields,
	type MapJSON
} from './mapjson.js';
export { stateFromKML, stateToKML } from './kml.js';

// The style vocabulary: defaults and names of the style values, e.g. for rendering the elements
export {
	FILL_DEFAULTS,
	LINE_DEFAULTS,
	ARROW_DEFAULTS,
	SYMBOL_DEFAULTS,
	hasArrow,
	hasPattern,
	PATTERN_SCALE_RANGE,
	PATTERN_COVERAGE_RANGE,
	withoutUnusedFields,
	removeDefaultFields,
	LEGEND_DEFAULTS,
	removeLegendDefaults,
	VIEWER_DEFAULTS,
	VIEWER_CHOICES,
	removeViewerDefaults,
	BACKGROUND_DEFAULTS,
	BACKGROUND_COLOR_DEFAULTS,
	BACKGROUND_HALO_WIDTHS,
	sanitizeBackground
} from './profile.js';

/**
 * Encode a map state document into the compact base64 representation.
 * `resolution`: the precision of the element coordinates in meters. Coarser is shorter,
 * e.g. for sharing. Default: 1 m.
 * @category Links
 */
export function encodeState(state: MapState, options: { resolution?: number } = {}): string {
	const writer = new StateWriter(options);
	writer.writeRoot(state);
	return writer.asBase64();
}

/**
 * Decode the compact base64 representation back into a map state document.
 * @category Links
 */
export function decodeState(base64: string): MapState {
	return StateReader.fromBase64(base64).readRoot();
}

/**
 * Compress a GeoJSON FeatureCollection into the compact base64 representation.
 * @category Links
 */
export function encodeGeoJSON(doc: GeoJSONDocument): string {
	return encodeState(stateFromGeoJSON(doc));
}

/**
 * Decompress the base64 representation back into a GeoJSON FeatureCollection.
 * @category Links
 */
export function decodeGeoJSON(base64: string): GeoJSONDocument {
	return stateToGeoJSON(decodeState(base64));
}
