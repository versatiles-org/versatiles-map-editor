import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { fetchFontFaces, type FontFaceInfo } from '@versatiles/style';
import { config, DEFAULT_CONFIG, loadConfig, resolveConfig } from './config.js';
import { COLOR_SCHEMES } from './color_schemes.js';
import { FONTS } from './background.js';

vi.mock('@versatiles/style', async (importOriginal) => ({
	...(await importOriginal<typeof import('@versatiles/style')>()),
	fetchFontFaces: vi.fn()
}));

const face = (id: string, title: string) => ({ id, title }) as FontFaceInfo;
const ci = { id: 'ci', name: 'Corporate', colors: ['#003366', '#E30613'] };

beforeEach(() => {
	vi.mocked(fetchFontFaces).mockResolvedValue([
		face('open_sans_regular', 'Open Sans Regular'),
		face('lato_bold', 'Lato Bold')
	]);
	config.set(DEFAULT_CONFIG);
});

afterEach(() => vi.unstubAllGlobals());

describe('resolveConfig', () => {
	it('keeps the defaults for an empty file', async () => {
		expect(await resolveConfig({})).toStrictEqual(DEFAULT_CONFIG);
	});

	it('offers the configured color schemes first, or only them', async () => {
		const scheme = { ...ci, colors: ['#003366', '#e30613'] };
		expect((await resolveConfig({ colorSchemes: [ci] })).colorSchemes).toStrictEqual([scheme, ...COLOR_SCHEMES]);
		expect((await resolveConfig({ colorSchemes: [ci], replaceDefaultSchemes: true })).colorSchemes).toStrictEqual([
			scheme
		]);
	});

	it('offers the configured fonts that exist as map glyphs, with their names', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { fonts } = await resolveConfig({ fonts: ['lato_bold', 'comic_sans'], replaceDefaultFonts: true });
		expect(fonts).toStrictEqual([{ id: 'lato_bold', name: 'Lato Bold' }]);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('comic_sans'));

		const merged = (await resolveConfig({ fonts: ['open_sans_regular'] })).fonts;
		expect(merged[0]).toStrictEqual({ id: 'open_sans_regular', name: 'Open Sans Regular' });
		// not twice
		expect(merged.filter((f) => f.id === 'open_sans_regular').length).toBe(1);
		expect(merged.length).toBe(FONTS.length);
	});

	it('offers the fonts unchecked if the list of map fonts is unavailable', async () => {
		vi.mocked(fetchFontFaces).mockResolvedValue(undefined);
		const { fonts } = await resolveConfig({ fonts: ['my_font'], replaceDefaultFonts: true });
		expect(fonts).toStrictEqual([{ id: 'my_font', name: 'my_font' }]);
	});

	it('rejects invalid files', async () => {
		const invalid = [
			[],
			'text',
			{ colorSchemes: {} },
			{ colorSchemes: [{ name: 'x', colors: ['#000000'] }] },
			{ colorSchemes: [{ id: 'x', name: 'x', colors: [] }] },
			{ colorSchemes: [{ id: 'x', name: 'x', colors: ['red'] }] },
			{ fonts: [1] }
		];
		for (const file of invalid) await expect(resolveConfig(file)).rejects.toThrow();
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

	it('loads the file', async () => {
		respond(new Response(JSON.stringify({ colorSchemes: [ci], replaceDefaultSchemes: true })));
		await loadConfig('https://example.org/map-editor.config.json');
		expect(get(config).colorSchemes.map((s) => s.id)).toStrictEqual(['ci']);
	});

	it('keeps the defaults without a file', async () => {
		respond(new Response('not found', { status: 404 }));
		await loadConfig('https://example.org/map-editor.config.json');
		expect(get(config)).toBe(DEFAULT_CONFIG);
	});

	it('keeps the defaults and warns for an invalid or unreachable file', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		respond(new Response('{ invalid json'));
		await loadConfig('https://example.org/a.json');
		respond(new Response('{"fonts": "x"}'));
		await loadConfig('https://example.org/b.json');
		respond(new TypeError('Failed to fetch'));
		await loadConfig('https://example.org/c.json');
		expect(get(config)).toBe(DEFAULT_CONFIG);
		expect(warn).toHaveBeenCalledTimes(3);
	});
});
