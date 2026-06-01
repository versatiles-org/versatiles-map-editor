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

/** Encode a map state document into the compact base64 representation. */
export function encodeState(state: StateRoot): string {
	const writer = new StateWriter();
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
