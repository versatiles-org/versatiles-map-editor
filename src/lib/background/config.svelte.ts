import { asset } from '$app/paths';
import { fetchFontFaces, osm, satellite, type OsmOptions, type SatelliteOptions } from '@versatiles/style';
import { COLOR_SCHEMES, type ColorScheme } from './color_schemes.js';
import { FALLBACK_FONTS, fromFontFaceInfo, unknownFace, type FontFace } from './fonts.js';
import { parseJsonc } from './jsonc.js';
import { startingBackground } from './background.js';
import { sanitizeBounds, type Bounds, type StateBackground } from '@versatiles/map-state';

/**
 * An optional configuration file of an editor instance, in its root folder (next to the editor's
 * index.html, also for the viewer in view/), so an organisation can
 * offer its own color schemes and fonts (e.g. its corporate identity) without rebuilding the editor.
 * JSON with comments, see `parseJsonc`.
 */
export const CONFIG_URL = 'map-editor.config.jsonc' as const;

/** The tile server of the background map, its symbols and fonts, unless the configuration sets one. */
export const DEFAULT_TILE_SERVER = 'https://tiles.versatiles.org';
/** The geocoder of the address search, unless the configuration sets one. */
export const DEFAULT_GEOCODER = 'https://geocode.versatiles.org/api';

/** The content of the configuration file. Every field is optional. */
export interface ConfigFile {
	/**
	 * The tile server: vector tiles, satellite imagery, sprites and glyphs, like
	 * tiles.versatiles.org. Absolute, or relative to the configuration file, e.g. "/" for the host
	 * of the editor; the checked file has it absolute, without a slash at the end.
	 */
	tileServer?: string;
	/**
	 * Whether the vector map shows the landcover of low zoom levels (forests, ice, …), which the
	 * vector tiles of the tile server must have, like those of tiles.versatiles.org.
	 */
	landcover?: boolean;
	/**
	 * Whether the background map can show its relief, shaded or as terrain, which needs the
	 * elevation tiles of the tile server, like those of tiles.versatiles.org.
	 */
	elevation?: boolean;
	/** The URL of the geocoder of the address search, like geocode.versatiles.org/api; also relative, as `tileServer`. */
	geocoder?: string;
	/** What a new map shows: [west, south, east, north]. Without it, the country of the user, if known. */
	startView?: Bounds;
	/** The background of a new map, as in .mapjson files. */
	startBackground?: StateBackground;
	/** The language of the labels of the background of a new map, unless `startBackground` sets one. */
	defaultLanguage?: string;
	/** The id of the color scheme that the color picker offers by default. */
	defaultColorScheme?: string;
	/**
	 * Color schemes offered in the color picker, before the predefined ones. Each `id` once; one of
	 * a predefined scheme replaces it. A color twice in a scheme is offered once.
	 */
	colorSchemes?: { id: string; name: string; colors: string[] }[];
	/** Offer only the configured color schemes. */
	replaceDefaultSchemes?: boolean;
	/** Glyph names of the font faces offered first for the map labels, e.g. "open_sans_regular". */
	fonts?: string[];
	/** Offer only the configured fonts. */
	replaceDefaultFonts?: boolean;
}

export interface EditorConfig {
	tileServer: string;
	/** Whether the vector map shows the landcover of low zoom levels, see `ConfigFile`. */
	landcover: boolean;
	/** Whether the background map can show its relief, see `ConfigFile`. */
	elevation: boolean;
	geocoder: string;
	/** What a new map shows, see `ConfigFile`. */
	startView: Bounds | undefined;
	/** The background of a new map, with its language; undefined for the editor's default one. */
	startBackground: StateBackground | undefined;
	/** The default scheme first, which the color picker offers by default. */
	colorSchemes: ColorScheme[];
	/** The font faces offered for the map labels, grouped by family. */
	fonts: FontFace[];
}

export const DEFAULT_CONFIG: EditorConfig = {
	tileServer: DEFAULT_TILE_SERVER,
	landcover: true,
	elevation: true,
	geocoder: DEFAULT_GEOCODER,
	startView: undefined,
	startBackground: undefined,
	colorSchemes: COLOR_SCHEMES,
	fonts: FALLBACK_FONTS
};

/** The configuration of this editor instance: `config.current`. Holds the defaults until the file is loaded. */
export const config = new (class {
	current: EditorConfig = $state.raw(DEFAULT_CONFIG);
})();

let ready: Promise<ConfigFile> | undefined;

/**
 * Load the configuration file next to the page into `config`, once: the editor and the viewer wait
 * for it before they load anything from the tile server. Returns the checked file. The fonts are
 * those that the file names, until `loadConfig` has the list of the tile server.
 */
export function configReady(): Promise<ConfigFile> {
	// the root of the app, also in a subfolder, also from the viewer in view/
	const url = new URL(asset(CONFIG_URL), location.href).href;
	ready ??= loadFile(url).then((file) => {
		const checked = checkConfig(file ?? {}, url);
		config.current = buildConfig(checked);
		return checked;
	});
	return ready;
}

/**
 * Load the configuration file, then the font faces of its tile server, into `config`, e.g. for the
 * pickers of the editor. Without the list of fonts, a few regular faces are offered; without a
 * (valid) file, the defaults. `url`: another file than the one next to the page, e.g. in tests.
 */
export async function loadConfig(url?: string): Promise<void> {
	const file = url ? checkConfig((await loadFile(url)) ?? {}, url) : await configReady();
	const fonts = await loadFonts(buildConfig(file).tileServer);
	config.current = buildConfig(file, fonts);
}

/** The content of the configuration file, or undefined without one. */
async function loadFile(url: string): Promise<unknown> {
	try {
		const response = await fetch(url);
		// no file: no configuration
		if (!response.ok) return undefined;
		return parseJsonc(await response.text());
	} catch (error) {
		console.warn(`Failed to load the editor configuration from ${url}`, error);
		return undefined;
	}
}

/** The font faces of the tile server, or undefined if its list cannot be loaded. */
async function loadFonts(tileServer: string): Promise<FontFace[] | undefined> {
	try {
		return (await fetchFontFaces({ base: tileServer }))?.map(fromFontFaceInfo);
	} catch (error) {
		console.warn('Failed to load the list of map fonts', error);
		return undefined;
	}
}

/** The fields of the configuration file, to warn about unknown ones, e.g. misspelled. */
const FIELDS: (keyof ConfigFile)[] = [
	'tileServer',
	'landcover',
	'elevation',
	'geocoder',
	'startView',
	'startBackground',
	'defaultLanguage',
	'colorSchemes',
	'replaceDefaultSchemes',
	'defaultColorScheme',
	'fonts',
	'replaceDefaultFonts'
];

/**
 * Check the file and merge it with the defaults. `fonts`: the faces of the tile server, if its list
 * could be loaded. `url`: the address of the file, which relative URLs in it are resolved against.
 * A field that is invalid gets its default, with a warning in the console, so one
 * mistake does not discard the whole file.
 */
export function resolveConfig(file: unknown, fonts?: FontFace[], url?: string): EditorConfig {
	return buildConfig(checkConfig(file, url), fonts);
}

/**
 * The valid fields of the file, with a warning in the console for each other one. `url`: the
 * address of the file, which relative URLs in it are resolved against.
 */
function checkConfig(file: unknown, url?: string): ConfigFile {
	if (typeof file !== 'object' || file === null || Array.isArray(file)) {
		console.warn('The editor configuration is not an object and is ignored');
		file = {};
	}
	const fields = file as Record<string, unknown>;
	for (const name of Object.keys(fields)) {
		if (!(FIELDS as string[]).includes(name)) console.warn(`Unknown field "${name}" in the editor configuration`);
	}
	/** The checked value of a field, or undefined if it is missing or invalid. */
	function read<T>(name: keyof ConfigFile, check: (value: unknown) => T): T | undefined {
		if (fields[name] === undefined) return undefined;
		try {
			return check(fields[name]);
		} catch (error) {
			console.warn(`Invalid field "${name}" in the editor configuration, which is ignored:`, (error as Error).message);
			return undefined;
		}
	}

	const checkUrl = (value: unknown) => resolveUrl(value, url);
	const checked: ConfigFile = {
		tileServer: read('tileServer', checkUrl),
		landcover: read('landcover', checkBoolean),
		elevation: read('elevation', checkBoolean),
		geocoder: read('geocoder', checkUrl),
		startView: read('startView', checkStartView),
		startBackground: read('startBackground', checkBackground),
		defaultLanguage: read('defaultLanguage', checkLanguage),
		colorSchemes: read('colorSchemes', checkColorSchemes),
		replaceDefaultSchemes: read('replaceDefaultSchemes', checkBoolean),
		fonts: read('fonts', checkFonts),
		replaceDefaultFonts: read('replaceDefaultFonts', checkBoolean)
	};
	// one of the schemes that are offered
	checked.defaultColorScheme = read('defaultColorScheme', (value) => {
		const offered = buildConfig(checked).colorSchemes.map(({ id }) => id);
		if (typeof value !== 'string' || !offered.includes(value)) {
			throw new Error(`must be the id of an offered color scheme: ${offered.join(', ')}`);
		}
		return value;
	});
	return Object.fromEntries(Object.entries(checked).filter(([, value]) => value !== undefined));
}

/** The configuration of the checked file, see `resolveConfig`. */
function buildConfig(file: ConfigFile, fonts?: FontFace[]): EditorConfig {
	const schemes = file.colorSchemes ?? [];
	const replaceSchemes = file.replaceDefaultSchemes ?? false;
	const configuredFonts = file.fonts ?? [];
	const replaceFonts = file.replaceDefaultFonts ?? false;
	const offered =
		replaceSchemes && schemes.length > 0
			? schemes
			: [...schemes, ...COLOR_SCHEMES.filter((scheme) => !schemes.some(({ id }) => id === scheme.id))];
	// the default first, as the color picker takes the first one
	const first = offered.find(({ id }) => id === file.defaultColorScheme);

	return {
		tileServer: file.tileServer ?? DEFAULT_TILE_SERVER,
		landcover: file.landcover ?? true,
		elevation: file.elevation ?? true,
		geocoder: file.geocoder ?? DEFAULT_GEOCODER,
		startView: file.startView,
		// the vector map, in the language of the browser: the editor's default background
		startBackground: startingBackground(
			file.startBackground ?? { builder: 'osm', options: {} },
			file.defaultLanguage ?? 'user'
		),
		colorSchemes: first ? [first, ...offered.filter((scheme) => scheme !== first)] : offered,
		fonts: resolveFonts(configuredFonts, replaceFonts, fonts)
	};
}

/**
 * An absolute http(s) URL, without a slash at its end, e.g. "https://tiles.example.org". A relative
 * URL, e.g. "/" or "../tiles", is resolved against `base`, the address of the configuration file,
 * so a server need not know its own address, e.g. behind a CDN.
 */
function resolveUrl(value: unknown, base: string | undefined): string {
	if (typeof value !== 'string' || value === '') {
		throw new Error('must be a URL like "https://example.org", or one relative to the configuration file, like "/"');
	}
	let url: URL;
	try {
		url = new URL(value, base);
	} catch {
		throw new Error(`"${value}" is not a URL like "https://example.org", or one relative to the configuration file`);
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`"${value}" is not an http(s) URL`);
	return url.href.replace(/\/+$/, '');
}

function checkStartView(value: unknown): Bounds {
	const bounds = sanitizeBounds(value);
	if (!bounds) throw new Error('must be [west, south, east, north] in degrees, with west < east and south < north');
	return bounds;
}

/** A background as in .mapjson files, which @versatiles/style can build. */
function checkBackground(value: unknown): StateBackground {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('must be an object');
	const { builder, options = {} } = value as Record<string, unknown>;
	if (builder !== 'osm' && builder !== 'satellite') throw new Error('"builder" must be "osm" or "satellite"');
	if (typeof options !== 'object' || options === null || Array.isArray(options)) {
		throw new Error('"options" must be an object');
	}
	const background: StateBackground = { builder, options: options as Record<string, unknown> };
	try {
		// as getMapStyle builds it, which fails e.g. for an unknown theme
		if (builder === 'osm') osm(background.options as OsmOptions);
		else satellite(background.options as SatelliteOptions);
	} catch (error) {
		throw new Error(`invalid options: ${(error as Error).message}`, { cause: error });
	}
	return background;
}

/** "user" (the language of the browser), "local" (local names) or a language code, e.g. "de". */
function checkLanguage(value: unknown): string {
	if (typeof value !== 'string' || !/^(user|local|[a-z]{2,3})$/.test(value)) {
		throw new Error('must be "user", "local" or a language code like "de"');
	}
	return value;
}

function checkBoolean(value: unknown): boolean {
	if (typeof value !== 'boolean') throw new Error('must be true or false');
	return value;
}

function checkColorSchemes(value: unknown): ColorScheme[] {
	if (!Array.isArray(value)) throw new Error('must be a list');
	const colorSchemes = value as Partial<ColorScheme>[];
	return colorSchemes.map((scheme, i): ColorScheme => {
		const { id, name, colors } = scheme ?? {};
		if (typeof id !== 'string' || !id) throw new Error(`colorSchemes[${i}].id must be a text`);
		if (typeof name !== 'string' || !name) throw new Error(`colorSchemes[${i}].name must be a text`);
		if (!Array.isArray(colors) || colors.length === 0 || !colors.every(isHexColor)) {
			throw new Error(`colorSchemes[${i}].colors must be a list of colors like "#1a2b3c"`);
		}
		if (colorSchemes.slice(0, i).some((before) => before?.id === id)) {
			throw new Error(`colorSchemes[${i}].id "${id}" is used twice`);
		}
		// each once, as the picker shows them
		return { id, name, colors: [...new Set(colors.map((c) => c.toLowerCase()))] };
	});
}

function checkFonts(value: unknown): string[] {
	if (!Array.isArray(value) || !value.every((f) => typeof f === 'string')) {
		throw new Error('must be a list of glyph names');
	}
	return value;
}

/**
 * The faces of the tile server, with the configured ones first (and their families), or only them.
 * Only faces the server has as map glyphs can be offered; without its list, they are not checked.
 */
function resolveFonts(ids: string[], replace: boolean, server?: FontFace[]): FontFace[] {
	const available = server ?? FALLBACK_FONTS;
	const configured: FontFace[] = [];
	for (const id of ids) {
		const face = available.find((f) => f.id === id);
		if (server && !face) {
			console.warn(`The font "${id}" is not available as map glyphs and is not offered`);
			continue;
		}
		// e.g. listed twice
		if (configured.some((f) => f.id === id)) continue;
		configured.push(face ?? unknownFace(id));
	}
	if (replace && configured.length > 0) return configured;
	return [...configured, ...available.filter((font) => !configured.includes(font))];
}

function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
