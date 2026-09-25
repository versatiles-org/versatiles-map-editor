import { writable } from 'svelte/store';
import { fetchFontFaces } from '@versatiles/style';
import { COLOR_SCHEMES, type ColorScheme } from './color_schemes.js';
import { FONTS } from './background.js';
import { TILE_SERVER } from './map_style.js';

/**
 * An optional configuration file of an editor instance, next to the page, so an organisation can
 * offer its own color schemes and fonts (e.g. its corporate identity) without rebuilding the editor.
 */
export const CONFIG_URL = 'map-editor.config.json';

/** The content of the configuration file. Every field is optional. */
export interface ConfigFile {
	/** Color schemes offered in the color picker, before the predefined ones. */
	colorSchemes?: { id: string; name: string; colors: string[] }[];
	/** Offer only the configured color schemes. */
	replaceDefaultSchemes?: boolean;
	/** Glyph names of the fonts offered for the map labels, e.g. "open_sans_regular". */
	fonts?: string[];
	/** Offer only the configured fonts. */
	replaceDefaultFonts?: boolean;
}

export interface EditorConfig {
	colorSchemes: ColorScheme[];
	fonts: { id: string; name: string }[];
}

export const DEFAULT_CONFIG: EditorConfig = { colorSchemes: COLOR_SCHEMES, fonts: FONTS };

/** The configuration of this editor instance. Holds the defaults until the file is loaded. */
export const config = writable<EditorConfig>(DEFAULT_CONFIG);

/** Load the configuration file into `config`. A missing file keeps the defaults. */
export async function loadConfig(url = new URL(CONFIG_URL, document.baseURI).href): Promise<void> {
	let file: unknown;
	try {
		const response = await fetch(url);
		// no file: no configuration
		if (!response.ok) return;
		file = await response.json();
	} catch (error) {
		console.warn(`Failed to load the editor configuration from ${url}`, error);
		return;
	}

	try {
		config.set(await resolveConfig(file));
	} catch (error) {
		console.warn(`Invalid editor configuration in ${url}`, error);
	}
}

/** Check the file and merge it with the defaults. Throws if the file is invalid. */
export async function resolveConfig(file: unknown): Promise<EditorConfig> {
	if (typeof file !== 'object' || file === null || Array.isArray(file)) throw new Error('Not an object');
	const { colorSchemes = [], replaceDefaultSchemes, fonts = [], replaceDefaultFonts } = file as ConfigFile;

	if (!Array.isArray(colorSchemes)) throw new Error('"colorSchemes" must be an array');
	const schemes = colorSchemes.map((scheme, i): ColorScheme => {
		const { id, name, colors } = scheme ?? {};
		if (typeof id !== 'string' || !id) throw new Error(`colorSchemes[${i}].id must be a text`);
		if (typeof name !== 'string' || !name) throw new Error(`colorSchemes[${i}].name must be a text`);
		if (!Array.isArray(colors) || colors.length === 0 || !colors.every(isHexColor)) {
			throw new Error(`colorSchemes[${i}].colors must be a list of colors like "#1a2b3c"`);
		}
		return { id, name, colors: colors.map((c) => c.toLowerCase()) };
	});

	if (!Array.isArray(fonts) || !fonts.every((f) => typeof f === 'string')) {
		throw new Error('"fonts" must be a list of glyph names');
	}

	return {
		colorSchemes: replaceDefaultSchemes && schemes.length > 0 ? schemes : [...schemes, ...COLOR_SCHEMES],
		fonts: await resolveFonts(fonts, replaceDefaultFonts === true)
	};
}

/** Only fonts the tile server has as map glyphs can be offered, with their names from the server. */
async function resolveFonts(ids: string[], replace: boolean): Promise<EditorConfig['fonts']> {
	if (ids.length === 0) return FONTS;
	let faces: Awaited<ReturnType<typeof fetchFontFaces>>;
	try {
		faces = await fetchFontFaces({ base: TILE_SERVER });
	} catch (error) {
		console.warn('Failed to load the list of map fonts', error);
	}

	const fonts: EditorConfig['fonts'] = [];
	for (const id of ids) {
		// without a list, the fonts cannot be checked, but are offered anyway
		const face = faces?.find((f) => f.id === id);
		if (faces && !face) {
			console.warn(`The font "${id}" is not available as map glyphs and is not offered`);
			continue;
		}
		fonts.push({ id, name: face?.title ?? id });
	}
	if (replace && fonts.length > 0) return fonts;
	return [...fonts, ...FONTS.filter((font) => !fonts.some((f) => f.id === font.id))];
}

function isHexColor(value: unknown): value is string {
	return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
