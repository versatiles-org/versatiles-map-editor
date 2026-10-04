import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFontFaces, type FontFaceInfo } from '@versatiles/style';
import { readFileSync } from 'fs';
import {
	config,
	DEFAULT_CONFIG,
	DEFAULT_GEOCODER,
	DEFAULT_TILE_SERVER,
	loadConfig,
	resolveConfig
} from './config.svelte.js';
import { parseJsonc } from './jsonc.js';
import { COLOR_SCHEMES } from './color_schemes.js';
import { FALLBACK_FONTS, fromFontFaceInfo, unknownFace } from './fonts.js';

vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	fetchFontFaces: vi.fn()
}));

const face = (id: string, family: string, title: string, weight: number) =>
	({ id, family, title, weight, italic: false, width: 'normal', codeblocks: '' }) as FontFaceInfo;
// the faces of the tile server
const SERVER = [
	face('lato_regular', 'Lato', 'Lato Regular', 400),
	face('lato_bold', 'Lato', 'Lato Bold', 700),
	face('open_sans_regular', 'Open Sans', 'Open Sans Regular', 400)
];
const server = SERVER.map(fromFontFaceInfo);
const ci = { id: 'ci', name: 'Corporate', colors: ['#003366', '#E30613'] };

beforeEach(() => {
	vi.mocked(fetchFontFaces).mockResolvedValue(SERVER);
	config.current = DEFAULT_CONFIG;
});

afterEach(() => vi.unstubAllGlobals());

describe('resolveConfig', () => {
	it('keeps the defaults for an empty file', () => {
		expect(resolveConfig({})).toStrictEqual(DEFAULT_CONFIG);
		expect(resolveConfig({}, server)).toStrictEqual({ ...DEFAULT_CONFIG, fonts: server });
	});

	it('offers the configured color schemes first, or only them', () => {
		const scheme = { ...ci, colors: ['#003366', '#e30613'] };
		expect(resolveConfig({ colorSchemes: [ci] }).colorSchemes).toStrictEqual([scheme, ...COLOR_SCHEMES]);
		expect(resolveConfig({ colorSchemes: [ci], replaceDefaultSchemes: true }).colorSchemes).toStrictEqual([scheme]);
	});

	it('offers each color, scheme and face once, which the pickers need', () => {
		const repeated = { ...ci, colors: ['#003366', '#E30613', '#003366', '#e30613'] };
		expect(resolveConfig({ colorSchemes: [repeated] }).colorSchemes[0].colors).toStrictEqual(['#003366', '#e30613']);
		// two schemes with one id: invalid, so the predefined ones are offered
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(resolveConfig({ colorSchemes: [ci, { ...ci, name: 'Other' }] }).colorSchemes).toStrictEqual(COLOR_SCHEMES);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"colorSchemes"'), expect.stringContaining('used twice'));
		// one with the id of a predefined scheme replaces it
		const own = { id: COLOR_SCHEMES[0].id, name: 'Own', colors: ['#000000'] };
		const schemes = resolveConfig({ colorSchemes: [own] }).colorSchemes;
		expect(schemes.filter(({ id }) => id === own.id)).toStrictEqual([own]);
		expect(schemes).toHaveLength(COLOR_SCHEMES.length);
		// a face listed twice
		const fonts = resolveConfig({ fonts: ['lato_bold', 'lato_bold'], replaceDefaultFonts: true }, server).fonts;
		expect(fonts.map((f) => f.id)).toStrictEqual(['lato_bold']);
		const unchecked = resolveConfig({ fonts: ['my_font', 'my_font'], replaceDefaultFonts: true }).fonts;
		expect(unchecked).toStrictEqual([unknownFace('my_font')]);
	});

	it('offers the configured faces that exist as map glyphs first, or only them', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const only = resolveConfig({ fonts: ['lato_bold', 'comic_sans'], replaceDefaultFonts: true }, server).fonts;
		expect(only.map((f) => f.id)).toStrictEqual(['lato_bold']);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('comic_sans'));

		// first, and not twice
		const merged = resolveConfig({ fonts: ['open_sans_regular'] }, server).fonts;
		expect(merged.map((f) => f.id)).toStrictEqual(['open_sans_regular', 'lato_regular', 'lato_bold']);
	});

	it('offers the configured faces unchecked if the list of the server is unavailable', () => {
		const { fonts } = resolveConfig({ fonts: ['my_font'], replaceDefaultFonts: true });
		expect(fonts).toStrictEqual([unknownFace('my_font')]);
	});

	it('ignores invalid fields with a warning, and keeps the valid ones', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const invalid = [
			[],
			'text',
			{ colorSchemes: {} },
			{ colorSchemes: [{ name: 'x', colors: ['#000000'] }] },
			{ colorSchemes: [{ id: 'x', name: 'x', colors: [] }] },
			{ colorSchemes: [{ id: 'x', name: 'x', colors: ['red'] }] },
			{ replaceDefaultSchemes: 'yes' },
			{ fonts: [1] }
		];
		for (const file of invalid) {
			warn.mockClear();
			expect(resolveConfig(file)).toStrictEqual(DEFAULT_CONFIG);
			expect(warn).toHaveBeenCalledTimes(1);
		}
		// one invalid field does not discard the others
		const config = resolveConfig({ colorSchemes: [ci], fonts: 'lato_bold', replaceDefaultSchemes: true });
		expect(config.colorSchemes.map((s) => s.id)).toStrictEqual(['ci']);
		expect(config.fonts).toStrictEqual(FALLBACK_FONTS);
	});

	it('takes the servers, without a slash at the end', () => {
		const config = resolveConfig({ tileServer: 'https://tiles.example.org/', geocoder: 'http://localhost:2322/api' });
		expect(config.tileServer).toBe('https://tiles.example.org');
		expect(config.geocoder).toBe('http://localhost:2322/api');
		expect(resolveConfig({})).toMatchObject({ tileServer: DEFAULT_TILE_SERVER, geocoder: DEFAULT_GEOCODER });
	});

	it('ignores servers that are no http(s) URLs', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		for (const tileServer of ['tiles.example.org', 'ftp://tiles.example.org', 42, '']) {
			expect(resolveConfig({ tileServer }).tileServer).toBe(DEFAULT_TILE_SERVER);
		}
		expect(warn).toHaveBeenCalledTimes(4);
	});

	it('takes the start view, and ignores an invalid one', () => {
		expect(resolveConfig({ startView: [9.7, 53.4, 10.3, 53.7] }).startView).toStrictEqual([9.7, 53.4, 10.3, 53.7]);
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		for (const startView of [[10, 53, 9, 54], [9, 53, 10], 'Hamburg']) {
			expect(resolveConfig({ startView }).startView).toBeUndefined();
		}
		expect(warn).toHaveBeenCalledTimes(3);
	});

	it('gives new maps the starting background, in the default language unless it sets one', () => {
		const start = (file: object) => resolveConfig(file).startBackground;
		// the editor's default background is not stored
		expect(start({})).toBeUndefined();
		expect(start({ defaultLanguage: 'user' })).toBeUndefined();
		expect(start({ defaultLanguage: 'de' })).toStrictEqual({ builder: 'osm', options: { text: { language: 'de' } } });
		expect(start({ startBackground: { builder: 'osm', options: { theme: 'gray' } } })).toStrictEqual({
			builder: 'osm',
			options: { theme: 'gray', text: { language: 'user' } }
		});
		const french = { builder: 'osm', options: { text: { language: 'fr' } } };
		expect(start({ startBackground: french, defaultLanguage: 'de' })).toStrictEqual(french);
		// the imagery alone has no labels
		const imagery = { builder: 'satellite', options: { osmOverlay: false } };
		expect(start({ startBackground: imagery, defaultLanguage: 'de' })).toStrictEqual(imagery);
	});

	it('ignores a starting background or a language that the map cannot have', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		for (const startBackground of [
			'gray',
			{ builder: 'google', options: {} },
			{ builder: 'osm', options: [] },
			{ builder: 'osm', options: { theme: 'no such theme' } }
		]) {
			expect(resolveConfig({ startBackground }).startBackground).toBeUndefined();
		}
		for (const defaultLanguage of ['German', 'DE', 7]) {
			expect(resolveConfig({ defaultLanguage }).startBackground).toBeUndefined();
		}
		expect(warn).toHaveBeenCalledTimes(7);
	});

	it('offers the default color scheme first, which the color picker takes', () => {
		const ids = (file: object) => resolveConfig(file).colorSchemes.map(({ id }) => id);
		expect(ids({ defaultColorScheme: 'dark2' })[0]).toBe('dark2');
		expect(ids({ colorSchemes: [ci], defaultColorScheme: 'muted' }).slice(0, 2)).toStrictEqual(['muted', 'ci']);
		expect(ids({ defaultColorScheme: 'dark2' })).toHaveLength(COLOR_SCHEMES.length);
		// only one that is offered
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(ids({ colorSchemes: [ci], replaceDefaultSchemes: true, defaultColorScheme: 'muted' })).toStrictEqual(['ci']);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"defaultColorScheme"'), expect.stringContaining('ci'));
	});

	it('warns about unknown fields, e.g. misspelled ones', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(resolveConfig({ colourSchemes: [ci] })).toStrictEqual(DEFAULT_CONFIG);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"colourSchemes"'));
	});
});

describe('the default configuration file', () => {
	it('has every field commented out at its default, so it changes nothing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const text = readFileSync('static/map-editor.config.jsonc', 'utf-8');
		expect(resolveConfig(parseJsonc(text))).toStrictEqual(DEFAULT_CONFIG);
		expect(warn).not.toHaveBeenCalled();
		// and every field without its comment marks is valid
		const uncommented = text.replace(/^(\s*)\/\/ ("\w+":.*)$/gm, '$1$2');
		expect(Object.keys(parseJsonc(uncommented) as object)).toStrictEqual([
			'tileServer',
			'geocoder',
			'startView',
			'startBackground',
			'defaultLanguage',
			'colorSchemes',
			'replaceDefaultSchemes',
			'defaultColorScheme',
			'fonts',
			'replaceDefaultFonts'
		]);
		resolveConfig(parseJsonc(uncommented));
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('the guide to running the editor (docs/SELF_HOSTING.md)', () => {
	const guide = readFileSync('docs/SELF_HOSTING.md', 'utf-8');

	it('has an example that the editor takes without a warning', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const example = /```jsonc\n([\s\S]*?)```/.exec(guide)![1];
		const config = resolveConfig(parseJsonc(example));
		expect(warn).not.toHaveBeenCalled();
		expect(config.tileServer).toBe('https://tiles.example.org');
		expect(config.colorSchemes[0].id).toBe('city');
	});

	it('describes every field of the configuration', () => {
		const fields = Object.keys(
			parseJsonc(
				readFileSync('static/map-editor.config.jsonc', 'utf-8').replace(/^(\s*)\/\/ ("\w+":.*)$/gm, '$1$2')
			) as object
		);
		const missing = fields.filter((field) => !guide.includes(`| \`${field}\``));
		expect(missing).toStrictEqual([]);
	});
});

describe('loadConfig', () => {
	const respond = (response: Response | Error) =>
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				if (response instanceof Error) throw response;
				return response;
			})
		);

	it('loads the file, with comments, and the faces of the tile server', async () => {
		const text = `{
			// the corporate colors
			"colorSchemes": ${JSON.stringify([ci])},
			"replaceDefaultSchemes": true, // only them
		}`;
		respond(new Response(text));
		await loadConfig('https://example.org/map-editor.config.jsonc');
		expect(config.current.colorSchemes.map((s) => s.id)).toStrictEqual(['ci']);
		expect(config.current.fonts).toStrictEqual(server);
	});

	it('loads the fonts from the tile server of the file', async () => {
		respond(new Response('{ "tileServer": "https://tiles.example.org" }'));
		await loadConfig('https://example.org/map-editor.config.jsonc');
		expect(fetchFontFaces).toHaveBeenLastCalledWith({ base: 'https://tiles.example.org' });
		expect(config.current.tileServer).toBe('https://tiles.example.org');
	});

	it('loads the file next to the page once, for the editor and the viewer', async () => {
		// the real one, which the setup of the tests replaces
		const { configReady } = await vi.importActual<typeof import('./config.svelte.js')>('./config.svelte.js');
		const fetch = vi.fn(async () => new Response('{ "geocoder": "https://geocode.example.org/api" }'));
		vi.stubGlobal('fetch', fetch);
		const [first, second] = await Promise.all([configReady(), configReady()]);
		expect(first).toBe(second);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/\/map-editor\.config\.jsonc$/);
		expect(config.current.geocoder).toBe('https://geocode.example.org/api');
	});

	it('offers the faces of the tile server without a file', async () => {
		respond(new Response('not found', { status: 404 }));
		await loadConfig('https://example.org/map-editor.config.jsonc');
		expect(config.current).toStrictEqual({ ...DEFAULT_CONFIG, fonts: server });
	});

	it('offers a few regular faces without the list of the tile server', async () => {
		vi.mocked(fetchFontFaces).mockResolvedValue(undefined);
		respond(new Response('not found', { status: 404 }));
		await loadConfig('https://example.org/map-editor.config.jsonc');
		expect(config.current.fonts).toStrictEqual(FALLBACK_FONTS);
	});

	it('keeps the defaults and warns for an invalid or unreachable file', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		respond(new Response('{ invalid json'));
		await loadConfig('https://example.org/a.json');
		respond(new Response('{"fonts": "x"}'));
		await loadConfig('https://example.org/b.json');
		respond(new TypeError('Failed to fetch'));
		await loadConfig('https://example.org/c.json');
		expect(config.current).toStrictEqual({ ...DEFAULT_CONFIG, fonts: server });
		expect(warn).toHaveBeenCalledTimes(3);
	});
});
