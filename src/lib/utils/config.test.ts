import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFontFaces, type FontFaceInfo } from '@versatiles/style';
import { config, DEFAULT_CONFIG, loadConfig, resolveConfig } from './config.svelte.js';
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

	it('rejects invalid files', () => {
		const invalid = [
			[],
			'text',
			{ colorSchemes: {} },
			{ colorSchemes: [{ name: 'x', colors: ['#000000'] }] },
			{ colorSchemes: [{ id: 'x', name: 'x', colors: [] }] },
			{ colorSchemes: [{ id: 'x', name: 'x', colors: ['red'] }] },
			{ fonts: [1] }
		];
		for (const file of invalid) expect(() => resolveConfig(file)).toThrow();
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

	it('loads the file and the faces of the tile server', async () => {
		respond(new Response(JSON.stringify({ colorSchemes: [ci], replaceDefaultSchemes: true })));
		await loadConfig('https://example.org/map-editor.config.json');
		expect(config.current.colorSchemes.map((s) => s.id)).toStrictEqual(['ci']);
		expect(config.current.fonts).toStrictEqual(server);
	});

	it('offers the faces of the tile server without a file', async () => {
		respond(new Response('not found', { status: 404 }));
		await loadConfig('https://example.org/map-editor.config.json');
		expect(config.current).toStrictEqual({ colorSchemes: COLOR_SCHEMES, fonts: server });
	});

	it('offers a few regular faces without the list of the tile server', async () => {
		vi.mocked(fetchFontFaces).mockResolvedValue(undefined);
		respond(new Response('not found', { status: 404 }));
		await loadConfig('https://example.org/map-editor.config.json');
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
