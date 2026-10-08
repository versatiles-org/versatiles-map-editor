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
 * A map is a {@link MapState}: plain data, without classes.
 *
 * ```text
 * MapState
 * ├─ elements[]   in drawing order, the first one at the back
 * │  ├─ marker    point, label, style, popup
 * │  ├─ line      points, smooth, style, popup
 * │  ├─ polygon   points, smooth, style, strokeStyle, popup
 * │  └─ circle    point, radius, style, strokeStyle, popup
 * ├─ frame        what a shared map shows when it opens:
 * │               bounds, bearing, pitch, canPan, canZoom, …
 * └─ meta         title, background, legend, viewer, labels,
 *                 colorScheme
 * ```
 *
 * Only `elements` is required. Each part has its type: {@link StateElement}, {@link StateFrame},
 * {@link StateMetadata}.
 *
 * ## Examples
 *
 * A link of a map, and the map of a link:
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
 * A shorter link: with a visible area, and positions only as fine as that area needs:
 *
 * ```ts
 * import { encodeState, resolutionForArea, type Bounds } from '@versatiles/map-state';
 *
 * const bounds: Bounds = [13.3, 52.45, 13.5, 52.55]; // west, south, east, north
 * const hash = encodeState({ ...state, frame: { bounds } }, { resolution: resolutionForArea(bounds) });
 * ```
 *
 * A `.mapjson` file, which may come from anywhere:
 *
 * ```ts
 * import { readFileSync } from 'node:fs';
 * import { stateFromMapJSON, unknownMapJSONFields, MapJSONVersionError } from '@versatiles/map-state';
 *
 * const json = JSON.parse(readFileSync('walk.mapjson', 'utf8'));
 * try {
 * 	const map = stateFromMapJSON(json); // only its valid parts
 * 	const unknown = unknownMapJSONFields(json); // e.g. ['elements[0].style.colour']
 * 	if (unknown.length > 0) console.warn('Fields that were not read:', unknown);
 * } catch (error) {
 * 	if (error instanceof MapJSONVersionError) console.error('The file is of a newer version of the format');
 * 	else throw error;
 * }
 * ```
 *
 * A map for other tools:
 *
 * ```ts
 * import { stateToGeoJSON, stateToKML, stateFromGeoJSON } from '@versatiles/map-state';
 *
 * const geojson = stateToGeoJSON(state); // a FeatureCollection, the styles as properties
 * const kml = stateToKML(state); // for Google Earth and GIS tools
 * const back = stateFromGeoJSON(geojson); // also reads the GeoJSON of other tools
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
 * @categoryDescription Links
 * A map as a compact string, e.g. in the address of a shared map: writing and reading it, how
 * accurate its positions are, and what makes it long.
 *
 * @categoryDescription Files
 * A map as a file: `.mapjson`, the format of the editor, and GeoJSON and KML for other tools.
 *
 * @categoryDescription Map state
 * The map as a whole: its type, what a shared map shows of it when it opens, its positions and areas.
 *
 * @categoryDescription Elements
 * What is drawn on the map: markers, lines, polygons and circles, with their popups.
 *
 * @categoryDescription Styles
 * How an element looks: the types of its styles, the values that a field can have, and the
 * defaults, which a style leaves out.
 *
 * @categoryDescription Colors
 * Reading and writing the colors of styles.
 *
 * @categoryDescription Legend
 * The legend of a map: its entries, how it is laid out, and where a shared map shows it.
 *
 * @categoryDescription Background map
 * The map behind the elements: its theme, labels, colors, relief and buildings.
 *
 * @categoryDescription Viewer
 * What a shared map shows over the map, and where: the address search and the zoom buttons.
 *
 * @packageDocumentation
 */
import { StateWriter } from './writer.js';
import { StateReader } from './reader.js';
import type { MapState } from './types.js';

export * from './types.js';
export type { GeoJSONDocument } from './geojson.js';
export { stateFromGeoJSON, stateToGeoJSON } from './geojson.js';
export { CODEC_VERSION } from './constants.js';
export { formatHex, parseColor, type RGBA } from './color.js';
export {
	coarsestResolutionForArea,
	exponentForResolution,
	resolutionForArea,
	resolutionOfExponent,
	MAX_EXPONENT
} from './grid.js';
export { boundsOf } from './bounds.js';
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
	PATTERN_SCALE_RANGE,
	PATTERN_COVERAGE_RANGE,
	withoutUnusedFields,
	removeDefaultFields,
	LEGEND_DEFAULTS,
	removeLegendDefaults,
	VIEWER_DEFAULTS,
	VIEWER_BUTTONS,
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
