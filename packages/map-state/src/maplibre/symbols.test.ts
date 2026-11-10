import { describe, expect, it, vi } from 'vitest';
import { anchorOf, fetchSymbolCatalog, spriteSheets, symbolLookup, type FetchJSON } from './symbols.js';

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

/** A tile server with the files above, at the address of `prefix`. */
function server(prefix: string): FetchJSON & ReturnType<typeof vi.fn> {
	return vi.fn(async (url: string) => {
		const file = url.startsWith(prefix) ? files[url.slice(prefix.length)] : undefined;
		return { ok: file !== undefined, status: file ? 200 : 404, json: async () => file };
	});
}

describe('the symbol catalog of a tile server', () => {
	it('has the SDF images of all its sprite sheets, with their sizes without the pixel ratio', async () => {
		const fetch = server('https://tiles.example.org/assets/sprites/');
		const catalog = await fetchSymbolCatalog({ tileServer: 'https://tiles.example.org/', fetch });
		expect(fetch).toHaveBeenCalledTimes(3);
		expect(catalog).toStrictEqual({
			sheets: ['base', 'extras'],
			symbols: [
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
				{
					name: 'extras:pin-teardrop',
					title: 'Map pin',
					aliases: ['pin'],
					anchor: 'bottom',
					width: 32,
					height: 38,
					center: [0.5, 1]
				}
			]
		});
		expect(spriteSheets(catalog, 'https://tiles.example.org')).toStrictEqual([
			{ id: 'base', url: 'https://tiles.example.org/assets/sprites/base' },
			{ id: 'extras', url: 'https://tiles.example.org/assets/sprites/extras' }
		]);
	});

	it('is refused if the server does not answer', async () => {
		await expect(
			fetchSymbolCatalog({ tileServer: 'https://other.example.org', fetch: server('nowhere') })
		).rejects.toThrow('404 for index.json');
	});

	it('finds a symbol by its name, an unknown one as 32×32 pixels on the point, and "" is none', async () => {
		const symbol = symbolLookup(
			await fetchSymbolCatalog({ tileServer: 'https://t.org', fetch: server('https://t.org/assets/sprites/') })
		);
		expect(symbol('extras:pin-teardrop')?.anchor).toBe('bottom');
		expect(symbol('icons:unknown')).toMatchObject({
			name: 'icons:unknown',
			title: 'unknown',
			width: 32,
			anchor: 'center'
		});
		expect(symbol('')).toBeUndefined();
	});

	it('places the center of an image on the point, or the side that it names', () => {
		expect(anchorOf(undefined)).toBe('center');
		expect(anchorOf([0.5, 0.5])).toBe('center');
		expect(anchorOf([0.5, 1])).toBe('bottom');
		expect(anchorOf([0, 0])).toBe('top-left');
		expect(anchorOf([1, 0.5])).toBe('right');
		expect(anchorOf('nope')).toBe('center');
	});
});
