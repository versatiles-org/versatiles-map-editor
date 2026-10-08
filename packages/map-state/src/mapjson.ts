import {
	BACKGROUND_COLOR_DEFAULTS,
	BACKGROUND_DEFAULTS,
	BACKGROUND_HALO_WIDTHS,
	LEGEND_DEFAULTS,
	sanitizeElement,
	sanitizeState,
	VIEWER_DEFAULTS
} from './profile.js';
import { LEGEND_ENTRY_TYPES, type MapState, type StateElement, type StateLegendEntry } from './types.js';
import { STYLE_ROLE_FIELDS } from './style_roles.js';

/**
 * The version of the format of .mapjson files, in the name of its JSON Schema.
 * @category Files
 */
export const MAPJSON_VERSION = 1;

/**
 * The JSON Schema of .mapjson files of this version: `$schema` of every file, e.g. for editors.
 * @category Files
 */
export const MAPJSON_SCHEMA_URL = `https://versatiles.org/versatiles-map-editor/schema/mapjson-${MAPJSON_VERSION}.schema.json`;

/**
 * The content of a .mapjson file: a map state with the URL of its schema.
 * @category Files
 */
export type MapJSON = {
	/** The URL of the JSON Schema of the format version of the file, `MAPJSON_SCHEMA_URL`. */
	$schema: string;
} & MapState;

/**
 * A .mapjson file of a newer version than this one can read.
 * @category Files
 */
export class MapJSONVersionError extends Error {
	constructor(public readonly version: number) {
		super(`The map is of version ${version} of the format; this version reads up to ${MAPJSON_VERSION}.`);
		this.name = 'MapJSONVersionError';
	}
}

/**
 * The map state as the content of a .mapjson file, with the URL of its schema first. Only its
 * valid parts, as `stateFromMapJSON` reads them, so reading the file gives the map that was
 * written: e.g. colors in lower case, coordinates with `COORDINATE_DIGITS` decimal places, and
 * no settings with their default value.
 * @category Files
 */
export function stateToMapJSON(state: MapState): MapJSON {
	const { frame, meta, elements } = sanitizeState(state);
	return { $schema: MAPJSON_SCHEMA_URL, ...(frame ? { frame } : {}), ...(meta ? { meta } : {}), elements };
}

/**
 * The map state of the content of a .mapjson file. One of a newer version (see `$schema`) throws a
 * `MapJSONVersionError`, and one without elements an error. A file may contain anything, so only
 * its valid parts are kept, as of an imported GeoJSON: e.g. an element that cannot be drawn is
 * left out, and so is a style field with an invalid value.
 * @category Files
 */
export function stateFromMapJSON(json: unknown): MapState {
	if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('The file contains no map');
	const { $schema, frame, meta, elements } = json as Record<string, unknown>;
	const version = typeof $schema === 'string' ? /mapjson-(\d+)\.schema\.json$/.exec($schema)?.[1] : undefined;
	if (version !== undefined && Number(version) > MAPJSON_VERSION) throw new MapJSONVersionError(Number(version));
	if (!Array.isArray(elements)) throw new Error('The file contains no map elements');

	return sanitizeState({ elements, frame, meta });
}

/**
 * The fields of each object of a .mapjson file, by the name of its definition in the schema (a
 * test compares them), to find the fields that this version does not know.
 */
export const MAPJSON_FIELDS = {
	MapJSON: ['$schema', 'frame', 'meta', 'elements'],
	StateFrame: ['bounds', 'bearing', 'pitch'],
	StateMetadata: ['background', 'legend', 'colorScheme', 'viewer', 'labels', 'title'],
	StateLabels: ['overlap', 'minZoom'],
	StateBackground: [
		'base',
		'theme',
		'streets',
		'borders',
		'labels',
		'language',
		'font',
		'labelSize',
		'haloWidth',
		'labelsOnTop',
		'colors',
		'hillshade',
		'terrain',
		'buildings',
		'options'
	],
	StateBackgroundColors: ['saturation', 'black', 'white'],
	StateLegend: ['layout', 'font', 'bold', 'italic', 'theme', 'entries'],
	StateLegendMarker: ['type', 'style', 'label'],
	StateLegendLine: ['type', 'style', 'label'],
	StateLegendArea: ['type', 'style', 'outlineStyle', 'label'],
	StateViewer: [
		'search',
		'navigation',
		'zoomButtons',
		'legend',
		'scale',
		'reset',
		'fullscreen',
		'locate',
		'canPan',
		'canZoom',
		'canRotate',
		'canTilt',
		'confine',
		'minZoom',
		'maxZoom',
		'scrollZoom'
	],
	StatePopup: ['text'],
	MarkerStyle: STYLE_ROLE_FIELDS.marker,
	LineStyle: STYLE_ROLE_FIELDS.line,
	AreaStyle: STYLE_ROLE_FIELDS.area,
	OutlineStyle: STYLE_ROLE_FIELDS.outline,
	StateElementMarker: ['type', 'point', 'label', 'style', 'popup'],
	StateElementLine: ['type', 'points', 'smooth', 'style', 'popup'],
	StateElementPolygon: ['type', 'points', 'smooth', 'style', 'outlineStyle', 'popup'],
	StateElementCircle: ['type', 'point', 'radius', 'style', 'outlineStyle', 'popup']
} satisfies Record<string, readonly string[]>;

const ELEMENT_FIELDS: Record<StateElement['type'], readonly string[]> = {
	marker: MAPJSON_FIELDS.StateElementMarker,
	line: MAPJSON_FIELDS.StateElementLine,
	polygon: MAPJSON_FIELDS.StateElementPolygon,
	circle: MAPJSON_FIELDS.StateElementCircle
};

const LEGEND_ENTRY_FIELDS: Record<StateLegendEntry['type'], readonly string[]> = {
	marker: MAPJSON_FIELDS.StateLegendMarker,
	line: MAPJSON_FIELDS.StateLegendLine,
	area: MAPJSON_FIELDS.StateLegendArea
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields of the content of a .mapjson file that this version does not know, by their path, e.g.
 * `elements[3].style.shadow`; and elements of an unknown type, e.g. `elements[4]`. They are allowed
 * (e.g. from a newer version, which may add fields), but `stateFromMapJSON` does not keep them, so
 * the editor warns about them. The `options` of the background map are those of `@versatiles/style`,
 * which are not checked here.
 * @category Files
 */
export function unknownMapJSONFields(json: unknown): string[] {
	const unknown: string[] = [];
	/** The object, after noting its unknown fields; undefined if it is none. */
	const check = (value: unknown, known: readonly string[], path: string) => {
		if (!isObject(value)) return undefined;
		for (const key of Object.keys(value)) if (!known.includes(key)) unknown.push(path ? `${path}.${key}` : key);
		return value;
	};
	/** The styles of an element or a legend entry, by its type. */
	const checkStyles = (owner: Record<string, unknown>, path: string) => {
		const role = owner.type === 'marker' ? 'marker' : owner.type === 'line' ? 'line' : 'area';
		check(owner.style, STYLE_ROLE_FIELDS[role], `${path}.style`);
		if (role === 'area') check(owner.outlineStyle, STYLE_ROLE_FIELDS.outline, `${path}.outlineStyle`);
	};

	const root = check(json, MAPJSON_FIELDS.MapJSON, '');
	if (!root) return unknown;
	check(root.frame, MAPJSON_FIELDS.StateFrame, 'frame');
	const meta = check(root.meta, MAPJSON_FIELDS.StateMetadata, 'meta');
	if (meta) {
		const background = check(meta.background, MAPJSON_FIELDS.StateBackground, 'meta.background');
		if (background) check(background.colors, MAPJSON_FIELDS.StateBackgroundColors, 'meta.background.colors');
		check(meta.viewer, MAPJSON_FIELDS.StateViewer, 'meta.viewer');
		check(meta.labels, MAPJSON_FIELDS.StateLabels, 'meta.labels');
		const legend = check(meta.legend, MAPJSON_FIELDS.StateLegend, 'meta.legend');
		if (legend && Array.isArray(legend.entries)) {
			legend.entries.forEach((value, index) => {
				const path = `meta.legend.entries[${index}]`;
				const known = isObject(value) ? LEGEND_ENTRY_FIELDS[value.type as StateLegendEntry['type']] : undefined;
				// e.g. a type of a newer version: the entry is left out
				if (!known) return void unknown.push(path);
				const entry = check(value, known, path);
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

// what a reader leaves out of each object without a loss, since it is what the object has anyway
const NEUTRAL: Record<string, Record<string, unknown>> = {
	meta: { title: '', colorScheme: '' },
	frame: { bearing: 0, pitch: 0 },
	'meta.viewer': VIEWER_DEFAULTS,
	'meta.legend': LEGEND_DEFAULTS,
	'meta.labels': { overlap: 'show', minZoom: 0 },
	'meta.background': { ...BACKGROUND_DEFAULTS, labelsOnTop: false },
	'meta.background.colors': BACKGROUND_COLOR_DEFAULTS,
	element: { smooth: false, label: '' }
};

/** The fields of a style that are left out if they have no effect, e.g. the size of a pattern without one. */
const UNUSED_STYLE_FIELDS = ['arrowSize', 'patternScale', 'patternCoverage'];

/**
 * The values of the content of a .mapjson file that `stateFromMapJSON` does not keep as they are,
 * by their path: a value that is not valid and left out, e.g. `elements[2].style.color` for
 * "red"; one beyond its range, which becomes the nearest valid value, e.g. `frame.pitch` for 80;
 * and an element or a legend entry that cannot be drawn, e.g. `elements[4]` for a line with one
 * point. So the editor can tell that the map is not what the file says.
 *
 * Not among them: the fields that this version does not know (see `unknownMapJSONFields`); a value
 * that is the default, which a map does not store; and a value that is only written in another
 * way, e.g. a color in upper case or a coordinate with more decimal places.
 * @category Files
 */
export function changedMapJSONValues(json: unknown): string[] {
	if (!isObject(json) || !Array.isArray(json.elements)) return [];
	const changed: string[] = [];

	// a color in upper case, the line breaks of Windows
	const sameText = (a: string, b: string) => a.replace(/\r\n?/g, '\n').toLowerCase() === b.toLowerCase();
	/** Whether leaving the value out loses nothing. */
	const isNeutral = (kind: string, key: string, value: unknown, owner: Record<string, unknown>): boolean => {
		if (kind === 'style') return UNUSED_STYLE_FIELDS.includes(key) && typeof value === 'number';
		if (kind === 'popup') return key === 'text' && typeof value === 'string' && value.trim() === '';
		if (kind === 'meta.background' && key === 'haloWidth') {
			return value === BACKGROUND_HALO_WIDTHS[owner.base === 'satellite' ? 'satellite' : 'vector'];
		}
		return key in (NEUTRAL[kind] ?? {}) && NEUTRAL[kind][key] === value;
	};
	/** `kind`: what the object is, for its defaults; e.g. all elements are of the kind "element". */
	const compare = (input: unknown, output: unknown, path: string, kind: string) => {
		if (!isObject(input)) return void changed.push(path);
		const kept = isObject(output) ? output : {};
		for (const [key, value] of Object.entries(input)) {
			const at = path ? `${path}.${key}` : key;
			const result = kept[key];
			// the options of the background are those of @versatiles/style, which are not checked
			if (value === undefined || at === 'meta.background.options') continue;
			if (isObject(value)) {
				const inner = ['style', 'outlineStyle', 'popup'].includes(key) ? key.replace('outlineStyle', 'style') : at;
				compare(value, result, at, inner);
			} else if (Array.isArray(value)) {
				// positions are kept or their owner is not; the lists of entries and elements are compared below
				if (result === undefined && !['entries', 'elements'].includes(key)) changed.push(at);
			} else if (result === undefined) {
				if (!isNeutral(kind, key, value, input)) changed.push(at);
			} else if (
				result !== value &&
				!(typeof value === 'string' && typeof result === 'string' && sameText(value, result))
			) {
				changed.push(at);
			}
		}
	};

	const state = sanitizeState({ elements: [], frame: json.frame, meta: json.meta });
	const { $schema: _schema, elements, ...rest } = json;
	compare(rest, state, '', '');

	// the entries of the legend: those with a type are kept, in their order
	const entries = isObject(json.meta) && isObject(json.meta.legend) ? json.meta.legend.entries : undefined;
	if (Array.isArray(entries)) {
		const kept = [...(state.meta?.legend?.entries ?? [])];
		entries.forEach((entry, index) => {
			const path = `meta.legend.entries[${index}]`;
			const known = isObject(entry) && LEGEND_ENTRY_TYPES.includes(entry.type as StateLegendEntry['type']);
			if (known) compare(entry, kept.shift(), path, 'entry');
			else changed.push(path);
		});
	}
	elements.forEach((element: unknown, index) => {
		const path = `elements[${index}]`;
		const kept = sanitizeElement(element);
		if (kept) compare(element, kept, path, 'element');
		else changed.push(path);
	});

	// the fields that this version does not know are told on their own
	const unknown = unknownMapJSONFields(json);
	return changed.filter((path) => !unknown.some((field) => path === field || path.startsWith(`${field}.`)));
}
