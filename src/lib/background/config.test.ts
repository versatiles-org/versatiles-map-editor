import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFontFaces, type FontFaceInfo } from '@versatiles/style';
import { readFileSync } from 'fs';
import { config, DEFAULT_CONFIG, loadConfig, resolveConfig } from './config.svelte.js';
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
		expect(resolveConfig({}, server)).toStrictEqual({ colorSchemes: COLOR_SCHEMES, fonts: server });
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
			'colorSchemes',
			'replaceDefaultSchemes',
			'fonts',
			'replaceDefaultFonts'
		]);
		resolveConfig(parseJsonc(uncommented));
		expect(warn).not.toHaveBeenCalled();
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

	it('offers the faces of the tile server without a file', async () => {
		respond(new Response('not found', { status: 404 }));
		await loadConfig('https://example.org/map-editor.config.jsonc');
		expect(config.current).toStrictEqual({ colorSchemes: COLOR_SCHEMES, fonts: server });
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
		expect(config.current).toStrictEqual({ colorSchemes: COLOR_SCHEMES, fonts: server });
		expect(warn).toHaveBeenCalledTimes(3);
	});
});
