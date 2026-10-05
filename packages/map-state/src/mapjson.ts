import { sanitizeCamera, sanitizeElement, sanitizeFrame, sanitizeMetadata } from './profile.js';
import type { MapState } from './types.js';

/** The version of the format of .mapjson files, in the name of its JSON Schema. */
export const MAPJSON_VERSION = 1;

/** The JSON Schema of .mapjson files of this version: `$schema` of every file, e.g. for editors. */
export const MAPJSON_SCHEMA_URL = `https://versatiles.org/versatiles-map-editor/schema/mapjson-${MAPJSON_VERSION}.schema.json`;

/** The content of a .mapjson file: a map state with the URL of its schema. */
export type MapJSON = {
	/** The URL of the JSON Schema of the format version of the file, `MAPJSON_SCHEMA_URL`. */
	$schema: string;
} & MapState;

/** A .mapjson file of a newer version than this one can read. */
export class MapJSONVersionError extends Error {
	constructor(public readonly version: number) {
		super(`The map is of version ${version} of the format; this version reads up to ${MAPJSON_VERSION}.`);
		this.name = 'MapJSONVersionError';
	}
}

/** The map state as the content of a .mapjson file, with the URL of its schema first. */
export function stateToMapJSON(state: MapState): MapJSON {
	return { $schema: MAPJSON_SCHEMA_URL, ...state };
}

/**
 * The map state of the content of a .mapjson file. One of a newer version (see `$schema`) throws a
 * `MapJSONVersionError`, and one without elements an error. A file may contain anything, so only
 * its valid parts are kept, as of an imported GeoJSON: e.g. an element that cannot be drawn is
 * left out, and so is a style field with an invalid value.
 */
export function stateFromMapJSON(json: unknown): MapState {
	if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('The file contains no map');
	const { $schema, map, frame, meta, elements } = json as Record<string, unknown>;
	const version = typeof $schema === 'string' ? /mapjson-(\d+)\.schema\.json$/.exec($schema)?.[1] : undefined;
	if (version !== undefined && Number(version) > MAPJSON_VERSION) throw new MapJSONVersionError(Number(version));
	if (!Array.isArray(elements)) throw new Error('The file contains no map elements');

	const state: MapState = { elements: elements.map(sanitizeElement).filter((element) => element !== undefined) };
	const camera = sanitizeCamera(map);
	if (camera) state.map = camera;
	const area = sanitizeFrame(frame);
	if (area) state.frame = area;
	const metadata = sanitizeMetadata(meta);
	if (metadata) state.meta = metadata;
	return state;
}
