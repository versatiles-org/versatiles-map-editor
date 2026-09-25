import { StateWriter } from './writer.js';
import { StateReader } from './reader.js';
import type { StateRoot } from './types.js';
import { stateFromGeoJSON, stateToGeoJSON, type GeoJSONDocument } from './geojson.js';

// Public types of the codec. `MapState` is the preferred public name for the
// document model; `StateRoot` remains exported for internal continuity.
export * from './types.js';
export type { StateRoot as MapState } from './types.js';
export type { GeoJSONDocument } from './geojson.js';
export { stateFromGeoJSON, stateToGeoJSON } from './geojson.js';
export { digitsForResolution, resolutionOfDigits } from './grid.js';
export { stateFromKML, stateToKML } from './kml.js';

/**
 * Encode a map state document into the compact base64 representation.
 * `resolution`: the precision of the element coordinates in meters. Coarser is shorter,
 * e.g. for sharing. Default: 1 m.
 */
export function encodeState(state: StateRoot, options: { resolution?: number } = {}): string {
	const writer = new StateWriter(options);
	writer.writeRoot(state);
	return writer.asBase64();
}

/** Decode the compact base64 representation back into a map state document. */
export function decodeState(base64: string): StateRoot {
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
