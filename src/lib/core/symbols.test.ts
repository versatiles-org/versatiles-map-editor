import type * as maplibregl from 'maplibre-gl';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LEGACY_SYMBOLS } from '@versatiles/map-state';
import { MockMap } from '$lib/__mocks__/map.js';
import { filterSymbols, SymbolLibrary } from './symbols.js';
// Icon names of the "base" sprite that @versatiles/style loads. To update:
// curl -s https://tiles.versatiles.org/assets/sprites/base.json | jq 'map_values({sdf: (.sdf == true)})'
import spriteBase from './__fixtures__/sprite-base.json' with { type: 'json' };

vi.unmock('./symbols.js');

// a new module for each test, since it loads the symbols only once
async function symbolsModule() {
	vi.resetModules();
	return await import('./symbols.js');
}

describe('getSymbol', () => {
	it('knows the symbols of older maps before the symbols of the server are loaded', async () => {
		const { getSymbol, spriteSheets } = await symbolsModule();
		expect(getSymbol('base:icon-airfield')).toStrictEqual({
			name: 'base:icon-airfield',
			title: 'airplane',
			aliases: [],
			anchor: 'center'
		});
		expect(spriteSheets()).toStrictEqual([{ id: 'base', url: 'https://tiles.versatiles.org/assets/sprites/base' }]);
	});

	it('names an unknown image by its name, and "" is no symbol', async () => {
		const { getSymbol } = await symbolsModule();
		expect(getSymbol('icons:unknown')).toMatchObject({ name: 'icons:unknown', title: 'unknown' });
		expect(getSymbol('')).toBeUndefined();
	});
});

describe('the symbols of older maps', () => {
	const icons = spriteBase as Record<string, { sdf: boolean }>;

	it('should all exist in the base sprite and be recolorable', () => {
		const invalid = LEGACY_SYMBOLS.filter(([, , image]) => image).filter(([, , image]) => {
			const [sprite, icon] = image.split(':');
			return sprite !== 'base' || !icons[icon]?.sdf;
		});
		expect(invalid).toStrictEqual([]);
	});
});

describe('loadSymbols', () => {
	const files: Record<string, unknown> = {
		'index.json': ['base', 'extras'],
		'base.json': {
			'icon-bench': { sdf: true, title: 'Bench', aliases: ['seat'] },
			'pattern-hatch': { sdf: false, title: 'Hatch' }
		},
		'extras.json': { 'pin-teardrop': { sdf: true, title: 'Map pin', aliases: ['pin', 3], center: [0.5, 1] } }
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
			{ name: 'base:icon-bench', title: 'Bench', aliases: ['seat'], anchor: 'center' },
			{ name: 'extras:pin-teardrop', title: 'Map pin', aliases: ['pin'], anchor: 'bottom' }
		]);
		expect(getSymbol('extras:pin-teardrop')?.anchor).toBe('bottom');
		expect(spriteSheets().map((sheet) => sheet.id)).toStrictEqual(['base', 'extras']);
		vi.unstubAllGlobals();
	});

	it('keeps the symbols of older maps without the server', async () => {
		vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { loadSymbols, allSymbols, spriteSheets } = await symbolsModule();

		await loadSymbols();
		// once per image, without "none"
		expect(allSymbols().length).toBe(new Set(LEGACY_SYMBOLS.map(([, , image]) => image).filter(Boolean)).size);
		expect(new Set(allSymbols().map((symbol) => symbol.name)).size).toBe(allSymbols().length);
		expect(spriteSheets().map((sheet) => sheet.id)).toStrictEqual(['base']);
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

describe('SymbolLibrary', () => {
	let map: MockMap;
	let symbolLibrary: SymbolLibrary;

	beforeEach(() => {
		map = new MockMap();
		symbolLibrary = new SymbolLibrary(map as unknown as maplibregl.Map);
	});

	it('should draw the symbol on the canvas', () => {
		const ctx = {
			putImageData: vi.fn()
		} as unknown as CanvasRenderingContext2D;
		const canvas = {
			getContext: vi.fn(() => ctx),
			width: 100,
			height: 100
		} as unknown as HTMLCanvasElement;

		class MyImageData {
			constructor(data: Uint8ClampedArray, width: number, height: number) {
				expect(data.length).toBe(100 * 100 * 4);
				expect(width).toBe(100);
				expect(height).toBe(100);
			}
		}

		// @ts-expect-error Mocking globalThis
		globalThis.ImageData = MyImageData;

		vi.spyOn(map, 'getImage').mockReturnValue({
			sdf: false,
			data: {
				data: new Uint8ClampedArray(50 * 50 * 4),
				width: 50,
				height: 50
			}
		});

		symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
		expect(map.getImage).toBeCalledWith('base:icon-airfield');
		expect(canvas.getContext).toBeCalledWith('2d');
		expect(ctx.putImageData).toBeCalledWith(expect.any(MyImageData), 0, 0);
	});

	it('should draw an SDF symbol in a color', () => {
		// @ts-expect-error Mocking globalThis
		globalThis.ImageData = class {
			constructor(public data: Uint8ClampedArray) {}
		};
		const ctx = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
		const canvas = { getContext: vi.fn(() => ctx), width: 2, height: 2 } as unknown as HTMLCanvasElement;
		// an opaque SDF icon: every value far inside the shape
		vi.spyOn(map, 'getImage').mockReturnValue({
			sdf: true,
			data: { data: new Uint8ClampedArray(4 * 4 * 4).fill(255), width: 4, height: 4 }
		} as unknown as ReturnType<maplibregl.Map['getImage']>);

		symbolLibrary.drawSymbol(canvas, 'base:icon-airfield', { color: '#0080ff' });
		const data = (vi.mocked(ctx.putImageData).mock.lastCall![0] as unknown as { data: Uint8ClampedArray }).data;
		expect([...data.slice(0, 4)]).toStrictEqual([0, 128, 255, 255]);
	});

	describe('when the sprite is not loaded yet', () => {
		let ctx: CanvasRenderingContext2D;
		let canvas: HTMLCanvasElement;
		const image = {
			sdf: false,
			data: { data: new Uint8ClampedArray(10 * 10 * 4), width: 10, height: 10 }
		};

		beforeEach(() => {
			ctx = { putImageData: vi.fn() } as unknown as CanvasRenderingContext2D;
			canvas = { getContext: vi.fn(() => ctx), width: 20, height: 20 } as unknown as HTMLCanvasElement;
			// @ts-expect-error Mocking globalThis
			globalThis.ImageData = class {};
		});

		it('should not throw and draw nothing', () => {
			expect(() => symbolLibrary.drawSymbol(canvas, 'base:icon-airfield')).not.toThrow();
			expect(ctx.putImageData).not.toHaveBeenCalled();
		});

		it('should draw once the map is idle', () => {
			symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
			vi.spyOn(map, 'getImage').mockReturnValue(image);
			map.emit('idle');
			expect(ctx.putImageData).toHaveBeenCalledTimes(1);
		});

		it('should wait while the map has no style yet', () => {
			map.style = undefined;
			const getImage = vi.spyOn(map, 'getImage');
			expect(() => symbolLibrary.drawSymbol(canvas, 'base:icon-airfield')).not.toThrow();
			expect(getImage).not.toHaveBeenCalled();

			map.style = {};
			getImage.mockReturnValue(image);
			map.emit('idle');
			expect(ctx.putImageData).toHaveBeenCalledTimes(1);
		});

		it('should retry only once', () => {
			symbolLibrary.drawSymbol(canvas, 'base:icon-airfield');
			map.emit('idle');
			expect(map.listenerCount('idle')).toBe(0);
		});
	});
});

describe('filterSymbols', () => {
	const symbols = [
		{ name: 'base:icon-cafe', title: 'Café', aliases: ['coffee'], anchor: 'center' as const },
		{ name: 'base:icon-fire_station', title: 'Fire station', aliases: ['firefighters'], anchor: 'center' as const },
		{ name: 'icons:anchor', title: 'Anchor', aliases: ['harbour'], anchor: 'center' as const }
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
