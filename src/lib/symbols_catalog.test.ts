import { describe, it, expect, vi } from 'vitest';
import { filterSymbols } from './symbols_catalog.js';

vi.unmock('./symbols_catalog.js');

// a new module for each test, since it loads the symbols only once
async function symbolsModule() {
	vi.resetModules();
	return await import('./symbols_catalog.js');
}

describe('getSymbol', () => {
	it('has no symbols before the symbols of the server are loaded', async () => {
		const { allSymbols, spriteSheets } = await symbolsModule();
		expect(allSymbols()).toStrictEqual([]);
		expect(spriteSheets()).toStrictEqual([]);
	});

	it('names an unknown image by its name, and "" is no symbol', async () => {
		const { getSymbol } = await symbolsModule();
		expect(getSymbol('icons:unknown')).toMatchObject({ name: 'icons:unknown', title: 'unknown' });
		expect(getSymbol('')).toBeUndefined();
	});
});

describe('loadSymbols', () => {
	const files: Record<string, unknown> = {
		'index.json': ['base', 'extras'],
		'base.json': {
			'icon-bench': { sdf: true, title: 'Bench', aliases: ['seat'] },
			'pattern-hatch': { sdf: false, title: 'Hatch' }
		},
		'extras.json': {
			'pin-teardrop': {
				sdf: true,
				title: 'Map pin',
				aliases: ['pin', 3],
				width: 64,
				height: 76,
				pixelRatio: 2,
				center: [0.5, 1]
			}
		}
	};

	it('loads the symbols of all sheets once, without patterns', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			const file = files[url.replace('https://tiles.versatiles.org/assets/sprites/', '')];
			return new Response(JSON.stringify(file), { status: file ? 200 : 404 });
		});
		vi.stubGlobal('fetch', fetchMock);
		const { loadSymbols, allSymbols, getSymbol, spriteSheets } = await symbolsModule();

		await Promise.all([loadSymbols(), loadSymbols()]);
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(allSymbols()).toStrictEqual([
			// without a size or center: 32×32 pixels, on the point
			{
				name: 'base:icon-bench',
				title: 'Bench',
				aliases: ['seat'],
				anchor: 'center',
				width: 32,
				height: 32,
				center: [0.5, 0.5]
			},
			// the size without the pixel ratio
			{
				name: 'extras:pin-teardrop',
				title: 'Map pin',
				aliases: ['pin'],
				anchor: 'bottom',
				width: 32,
				height: 38,
				center: [0.5, 1]
			}
		]);
		expect(getSymbol('extras:pin-teardrop')?.anchor).toBe('bottom');
		expect(spriteSheets().map((sheet) => sheet.id)).toStrictEqual(['base', 'extras']);
		vi.unstubAllGlobals();
	});

	it('has no symbols without the server', async () => {
		vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { loadSymbols, allSymbols, spriteSheets } = await symbolsModule();

		await loadSymbols();
		expect(allSymbols()).toStrictEqual([]);
		expect(spriteSheets()).toStrictEqual([]);
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});
});

describe('anchorOf', () => {
	it('places the center of the image on the point, or the side that it names', async () => {
		const { anchorOf } = await symbolsModule();
		expect(anchorOf(undefined)).toBe('center');
		expect(anchorOf([0.5, 0.5])).toBe('center');
		expect(anchorOf([0.5, 1])).toBe('bottom');
		expect(anchorOf([0, 0])).toBe('top-left');
		expect(anchorOf([1, 0.5])).toBe('right');
		expect(anchorOf('nope')).toBe('center');
	});
});

describe('filterSymbols', () => {
	const symbols = [
		{
			name: 'base:icon-cafe',
			title: 'Café',
			aliases: ['coffee'],
			anchor: 'center' as const,
			width: 32,
			height: 32,
			center: [0.5, 0.5] as [number, number]
		},
		{
			name: 'base:icon-fire_station',
			title: 'Fire station',
			aliases: ['firefighters'],
			anchor: 'center' as const,
			width: 32,
			height: 32,
			center: [0.5, 0.5] as [number, number]
		},
		{
			name: 'icons:anchor',
			title: 'Anchor',
			aliases: ['harbour'],
			anchor: 'center' as const,
			width: 32,
			height: 32,
			center: [0.5, 0.5] as [number, number]
		}
	];
	const names = (filter: string) => filterSymbols(symbols, filter).map((symbol) => symbol.name);

	it('finds symbols by title, aliases and name, ignoring case and accents', () => {
		expect(names('CAFE')).toStrictEqual(['base:icon-cafe']);
		expect(names('coffee')).toStrictEqual(['base:icon-cafe']);
		expect(names('harb')).toStrictEqual(['icons:anchor']);
		expect(names('icons:')).toStrictEqual(['icons:anchor']);
	});

	it('needs every word of the filter, at the start of a word', () => {
		expect(names('fire st')).toStrictEqual(['base:icon-fire_station']);
		expect(names('fire anchor')).toStrictEqual([]);
		// the start of a word, not any part of it
		expect(names('station')).toStrictEqual(['base:icon-fire_station']);
		expect(names('tation')).toStrictEqual([]);
	});

	it('keeps all symbols without a filter', () => {
		expect(names('  ')).toHaveLength(3);
	});
});
