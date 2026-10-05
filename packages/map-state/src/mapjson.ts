import { sanitizeView, sanitizeElement, sanitizeFrame, sanitizeMetadata } from './profile.js';
import { STYLE_FIELDS } from './style_history.js';
import type { MapState, StateElement } from './types.js';

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
	const { $schema, view, frame, meta, elements } = json as Record<string, unknown>;
	const version = typeof $schema === 'string' ? /mapjson-(\d+)\.schema\.json$/.exec($schema)?.[1] : undefined;
	if (version !== undefined && Number(version) > MAPJSON_VERSION) throw new MapJSONVersionError(Number(version));
	if (!Array.isArray(elements)) throw new Error('The file contains no map elements');

	const state: MapState = { elements: elements.map(sanitizeElement).filter((element) => element !== undefined) };
	const camera = sanitizeView(view);
	if (camera) state.view = camera;
	const area = sanitizeFrame(frame);
	if (area) state.frame = area;
	const metadata = sanitizeMetadata(meta);
	if (metadata) state.meta = metadata;
	return state;
}

/**
 * The fields of each object of a .mapjson file, by the name of its definition in the schema (a
 * test compares them), to find the fields that this version does not know.
 */
export const MAPJSON_FIELDS = {
	MapJSON: ['$schema', 'view', 'frame', 'meta', 'elements'],
	// the view, which has no definition of its own
	view: ['center', 'radius'],
	StateMetadata: [
		'background',
		'legend',
		'colorScheme',
		'viewer',
		'labelOverlap',
		'labelMinZoom',
		'mapLabelsOnTop',
		'title'
	],
	StateBackground: ['builder', 'options'],
	StateLegend: ['layout', 'font', 'bold', 'italic', 'theme', 'entries'],
	StateLegendEntry: ['type', 'style', 'strokeStyle', 'label'],
	StateViewer: ['search', 'navigation', 'legend'],
	StatePopup: ['text'],
	StateStyle: STYLE_FIELDS.map((field) => field.name),
	StateElementMarker: ['type', 'point', 'style', 'popup'],
	StateElementLine: ['type', 'points', 'smooth', 'style', 'popup'],
	StateElementPolygon: ['type', 'points', 'smooth', 'style', 'strokeStyle', 'popup'],
	StateElementCircle: ['type', 'point', 'radius', 'style', 'strokeStyle', 'popup']
} satisfies Record<string, readonly string[]>;

const ELEMENT_FIELDS: Record<StateElement['type'], readonly string[]> = {
	marker: MAPJSON_FIELDS.StateElementMarker,
	line: MAPJSON_FIELDS.StateElementLine,
	polygon: MAPJSON_FIELDS.StateElementPolygon,
	circle: MAPJSON_FIELDS.StateElementCircle
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields of the content of a .mapjson file that this version does not know, by their path, e.g.
 * `elements[3].style.shadow`; and elements of an unknown type, e.g. `elements[4]`. They are allowed
 * (e.g. from a newer version, which may add fields), but `stateFromMapJSON` does not keep them, so
 * the editor warns about them. The options of the background map are those of `@versatiles/style`,
 * which are not checked here.
 */
export function unknownMapJSONFields(json: unknown): string[] {
	const unknown: string[] = [];
	/** The object, after noting its unknown fields; undefined if it is none. */
	const check = (value: unknown, known: readonly string[], path: string) => {
		if (!isObject(value)) return undefined;
		for (const key of Object.keys(value)) if (!known.includes(key)) unknown.push(path ? `${path}.${key}` : key);
		return value;
	};
	const checkStyles = (owner: Record<string, unknown>, path: string) => {
		check(owner.style, MAPJSON_FIELDS.StateStyle, `${path}.style`);
		check(owner.strokeStyle, MAPJSON_FIELDS.StateStyle, `${path}.strokeStyle`);
	};

	const root = check(json, MAPJSON_FIELDS.MapJSON, '');
	if (!root) return unknown;
	check(root.view, MAPJSON_FIELDS.view, 'view');
	const meta = check(root.meta, MAPJSON_FIELDS.StateMetadata, 'meta');
	if (meta) {
		check(meta.background, MAPJSON_FIELDS.StateBackground, 'meta.background');
		check(meta.viewer, MAPJSON_FIELDS.StateViewer, 'meta.viewer');
		const legend = check(meta.legend, MAPJSON_FIELDS.StateLegend, 'meta.legend');
		if (legend && Array.isArray(legend.entries)) {
			legend.entries.forEach((value, index) => {
				const path = `meta.legend.entries[${index}]`;
				const entry = check(value, MAPJSON_FIELDS.StateLegendEntry, path);
				if (entry) checkStyles(entry, path);
			});
		}
	}
	if (Array.isArray(root.elements)) {
		root.elements.forEach((value, index) => {
			const path = `elements[${index}]`;
			const known = isObject(value) ? ELEMENT_FIELDS[value.type as StateElement['type']] : undefined;
			// e.g. a type of a newer version: the element is left out
			if (!known) return void unknown.push(path);
			const element = check(value, known, path)!;
			checkStyles(element, path);
			check(element.popup, MAPJSON_FIELDS.StatePopup, `${path}.popup`);
		});
	}
	return unknown;
}
