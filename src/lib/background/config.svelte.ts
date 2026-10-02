import { fetchFontFaces } from '@versatiles/style';
import { COLOR_SCHEMES, type ColorScheme } from './color_schemes.js';
import { FALLBACK_FONTS, fromFontFaceInfo, unknownFace, type FontFace } from './fonts.js';
import { TILE_SERVER } from './map_style.js';

/**
 * An optional configuration file of an editor instance, next to the page, so an organisation can
 * offer its own color schemes and fonts (e.g. its corporate identity) without rebuilding the editor.
 */
export const CONFIG_URL = 'map-editor.config.json';

/** The content of the configuration file. Every field is optional. */
export interface ConfigFile {
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
	colorSchemes: ColorScheme[];
	/** The font faces offered for the map labels, grouped by family. */
	fonts: FontFace[];
}

export const DEFAULT_CONFIG: EditorConfig = { colorSchemes: COLOR_SCHEMES, fonts: FALLBACK_FONTS };

/** The configuration of this editor instance: `config.current`. Holds the defaults until the file is loaded. */
export const config = new (class {
	current: EditorConfig = $state.raw(DEFAULT_CONFIG);
})();

/**
 * Load the font faces of the tile server and the configuration file into `config`. Without the
 * list of fonts, a few regular faces are offered; without a (valid) file, the defaults.
 */
export async function loadConfig(url = new URL(CONFIG_URL, document.baseURI).href): Promise<void> {
	const [file, fonts] = await Promise.all([loadFile(url), loadFonts()]);
	try {
		config.current = resolveConfig(file ?? {}, fonts);
	} catch (error) {
		console.warn(`Invalid editor configuration in ${url}`, error);
		config.current = resolveConfig({}, fonts);
	}
}

/** The content of the configuration file, or undefined without one. */
async function loadFile(url: string): Promise<unknown> {
	try {
		const response = await fetch(url);
		// no file: no configuration
		if (!response.ok) return undefined;
		return await response.json();
	} catch (error) {
		console.warn(`Failed to load the editor configuration from ${url}`, error);
		return undefined;
	}
}

/** The font faces of the tile server, or undefined if its list cannot be loaded. */
async function loadFonts(): Promise<FontFace[] | undefined> {
	try {
		return (await fetchFontFaces({ base: TILE_SERVER }))?.map(fromFontFaceInfo);
	} catch (error) {
		console.warn('Failed to load the list of map fonts', error);
		return undefined;
	}
}

/**
 * Check the file and merge it with the defaults. `fonts`: the faces of the tile server, if its list
 * could be loaded. Throws if the file is invalid.
 */
export function resolveConfig(file: unknown, fonts?: FontFace[]): EditorConfig {
	if (typeof file !== 'object' || file === null || Array.isArray(file)) throw new Error('Not an object');
	const {
		colorSchemes = [],
		replaceDefaultSchemes,
		fonts: configuredFonts = [],
		replaceDefaultFonts
	} = file as ConfigFile;

	if (!Array.isArray(colorSchemes)) throw new Error('"colorSchemes" must be an array');
	const schemes = colorSchemes.map((scheme, i): ColorScheme => {
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

	if (!Array.isArray(configuredFonts) || !configuredFonts.every((f) => typeof f === 'string')) {
		throw new Error('"fonts" must be a list of glyph names');
	}

	return {
		colorSchemes:
			replaceDefaultSchemes && schemes.length > 0
				? schemes
				: [...schemes, ...COLOR_SCHEMES.filter((scheme) => !schemes.some(({ id }) => id === scheme.id))],
		fonts: resolveFonts(configuredFonts, replaceDefaultFonts === true, fonts)
	};
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
