import { upgradeState } from './legacy.js';
import type { MapState } from './types.js';

/** The version of the format of .mapjson files, in the name of its JSON Schema. */
export const MAPJSON_VERSION = 1;

/** The JSON Schema of .mapjson files of this version: `$schema` of every file, e.g. for editors. */
export const MAPJSON_SCHEMA_URL = `https://raw.githubusercontent.com/versatiles-org/versatiles-map-editor/main/packages/map-state/schema/mapjson-${MAPJSON_VERSION}.schema.json`;

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
 * The map state of the content of a .mapjson file. A file without `$schema` is of an older
 * version of the editor and is upgraded (see `upgradeState`); one of a newer version throws a
 * `MapJSONVersionError`, and one without elements an error.
 */
export function stateFromMapJSON(json: unknown): MapState {
	if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('The file contains no map');
	const { $schema, ...state } = json as Partial<MapJSON>;
	const version = typeof $schema === 'string' ? /mapjson-(\d+)\.schema\.json$/.exec($schema)?.[1] : undefined;
	if (version !== undefined && Number(version) > MAPJSON_VERSION) throw new MapJSONVersionError(Number(version));
	if (!Array.isArray(state.elements)) throw new Error('The file contains no map elements');
	return upgradeState(state as MapState);
}
