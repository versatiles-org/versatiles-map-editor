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
export { sanitizeFrame } from './profile.js';
export {
	MAPJSON_SCHEMA_URL,
	MAPJSON_VERSION,
	MapJSONVersionError,
	stateFromMapJSON,
	stateToMapJSON,
	type MapJSON
} from './mapjson.js';
export { stateFromKML, stateToKML } from './kml.js';

// The style vocabulary: defaults and names of the style values, e.g. for rendering the elements
export {
	FILL_DEFAULTS,
	LINE_DEFAULTS,
	ARROW_DEFAULTS,
	SYMBOL_DEFAULTS,
	FILL_PATTERN_NAMES,
	STROKE_STYLE_NAMES,
	ARROW_NAMES,
	hasArrow,
	withoutUnusedFields,
	LABEL_ALIGN_NAMES,
	removeDefaultFields,
	LEGEND_DEFAULTS,
	removeLegendDefaults,
	VIEWER_DEFAULTS,
	VIEWER_CHOICES,
	removeViewerDefaults,
	sanitizeViewer,
	sanitizeLabelMinZoom
} from './profile.js';

/**
 * Encode a map state document into the compact base64 representation.
 * `resolution`: the precision of the element coordinates in meters. Coarser is shorter,
 * e.g. for sharing. Default: 1 m.
 */
export function encodeState(state: MapState, options: { resolution?: number } = {}): string {
	const writer = new StateWriter(options);
	writer.writeRoot(state);
	return writer.asBase64();
}

/** Decode the compact base64 representation back into a map state document. */
export function decodeState(base64: string): MapState {
	return StateReader.fromBase64(base64).readRoot();
}

/** Compress a GeoJSON FeatureCollection into the compact base64 representation. */
export function encodeGeoJSON(doc: GeoJSONDocument): string {
	return encodeState(stateFromGeoJSON(doc));
}

/** Decompress the base64 representation back into a GeoJSON FeatureCollection. */
export function decodeGeoJSON(base64: string): GeoJSONDocument {
	return stateToGeoJSON(decodeState(base64));
}
