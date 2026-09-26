import { describe, expect, it, vi } from 'vitest';
import {
	boundsOf,
	columnValues,
	decodeTableFile,
	importTable,
	legendWithCategories,
	markerStyle,
	MAX_CATEGORIES,
	tableCategories
} from './table_import.js';
import { parseTable } from './table.js';
import type { geocode } from './geocoding.js';

describe('importTable', () => {
	it('creates markers from coordinates, with label, popup and style', async () => {
		const table = parseTable('Name;Breite;Länge;Info\nCafé;52,5;13,4;Open **daily**\nNo place;x;13\nFar;95;13');
		const result = await importTable(table, {
			position: { latitude: 1, longitude: 2 },
			label: 0,
			popup: 3,
			style: { color: '#0000ff' }
		});
		expect(result.markers).toStrictEqual([
			{
				type: 'marker',
				point: [13.4, 52.5],
				style: { color: '#0000ff', label: 'Café' },
				popup: { text: 'Open **daily**' }
			}
		]);
		expect(result.failed).toStrictEqual([
			{ row: 2, value: 'x, 13', reason: 'invalid coordinates' },
			{ row: 3, value: '95, 13', reason: 'invalid coordinates' }
		]);
	});

	it('creates markers without style for plain rows', async () => {
		const table = parseTable('lat,lon\n1,2');
		const { markers } = await importTable(table, { position: { latitude: 0, longitude: 1 } });
		expect(markers).toStrictEqual([{ type: 'marker', point: [2, 1] }]);
	});

	it('geocodes addresses, reports progress and rows that cannot be found', async () => {
		const table = parseTable('Address,Name\nMain St 1,A\n,B\nNowhere,C\nError,D');
		const geocoder = vi.fn<typeof geocode>(async (query) => {
			if (query === 'Error') throw new Error('Server down');
			return query === 'Main St 1' ? [{ label: query, point: [10, 20] }] : [];
		});
		const onProgress = vi.fn();
		vi.spyOn(console, 'error').mockImplementation(() => {});

		const result = await importTable(
			table,
			{ position: { address: 0 }, label: 1 },
			{ geocoder, onProgress, language: 'de' }
		);
		expect(result.markers).toStrictEqual([{ type: 'marker', point: [10, 20], style: { label: 'A' } }]);
		expect(result.failed).toStrictEqual([
			{ row: 2, value: '', reason: 'no address' },
			{ row: 3, value: 'Nowhere', reason: 'address not found' },
			{ row: 4, value: 'Error', reason: 'search failed' }
		]);
		expect(geocoder).toHaveBeenCalledWith('Main St 1', expect.objectContaining({ limit: 1, language: 'de' }));
		expect(onProgress).toHaveBeenLastCalledWith(4, 4);
	});

	it('can be cancelled', async () => {
		const table = parseTable('Address\na\nb\nc\nd');
		const controller = new AbortController();
		const geocoder = vi.fn<typeof geocode>(async () => {
			controller.abort();
			return [];
		});
		await expect(
			importTable(table, { position: { address: 0 } }, { geocoder, signal: controller.signal })
		).rejects.toThrow();
		expect(geocoder.mock.calls.length).toBeLessThan(4);
	});

	it('styles the markers by a category column', async () => {
		const table = parseTable('lat,lon,kind\n1,2,Cafe\n3,4,Shop\n5,6, Cafe \n7,8,Other');
		const { markers } = await importTable(table, {
			position: { latitude: 0, longitude: 1 },
			style: { color: '#ff0000', pattern: 38 },
			category: { column: 2, styles: { Cafe: { color: '#0000ff', pattern: 12 }, Shop: { color: '#00ff00' } } }
		});
		expect(markers.map((m) => m.style)).toStrictEqual([
			{ color: '#0000ff', pattern: 12 },
			{ color: '#00ff00', pattern: 38 },
			{ color: '#0000ff', pattern: 12 },
			{ color: '#ff0000', pattern: 38 }
		]);
	});
});

describe('columnValues', () => {
	it('lists the distinct values with their number of rows', () => {
		const table = parseTable('kind\nCafe\nShop\n Cafe\n\u0020\nBar', true);
		expect(columnValues(table, 0)).toStrictEqual([
			{ value: 'Cafe', count: 2 },
			{ value: 'Shop', count: 1 },
			{ value: 'Bar', count: 1 }
		]);
	});
});

describe('boundsOf', () => {
	it('returns the bounding box, also of very many points', () => {
		expect(boundsOf([])).toBeUndefined();
		const points: [number, number][] = Array.from({ length: 300_000 }, (_, i) => [i / 1000, -i / 2000]);
		const [[west, south], [east, north]] = boundsOf(points)!;
		expect([west, north]).toStrictEqual([0, -0]);
		expect(east).toBeCloseTo(299.999);
		expect(south).toBeCloseTo(-149.9995);
	});
});

describe('large tables', () => {
	it('are parsed without overflowing the stack', () => {
		const text = 'lat,lon\n' + '1,2\n'.repeat(300_000);
		expect(parseTable(text).rows.length).toBe(300_000);
	});
});

describe('decodeTableFile', () => {
	it('reads UTF-8, and Windows-1252 from an older Excel', () => {
		expect(decodeTableFile(new TextEncoder().encode('Straße').buffer)).toBe('Straße');
		// "Straße" in Windows-1252 is invalid UTF-8
		expect(decodeTableFile(new Uint8Array([0x53, 0x74, 0x72, 0x61, 0xdf, 0x65]).buffer)).toBe('Straße');
	});
});

describe('categories', () => {
	const table = parseTable('name,kind\nA,cafe\nB,shop\nC,cafe\nD,', true);

	it('give each value of the column the next color and the symbol', () => {
		const { categories, tooMany } = tableCategories(table, 1, ['#111111', '#222222'], 5);
		expect(tooMany).toBe(0);
		expect(categories).toStrictEqual([
			{ value: 'cafe', count: 2, color: '#111111', symbol: 5 },
			{ value: 'shop', count: 1, color: '#222222', symbol: 5 },
			{ value: '', count: 1, color: '#111111', symbol: 5 }
		]);
	});

	it('are none if a column has too many values, e.g. names', () => {
		const names = parseTable(
			['name', ...Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => `N${i}`)].join('\n'),
			true
		);
		expect(tableCategories(names, 0, ['#111111'], undefined)).toStrictEqual({
			categories: [],
			tooMany: MAX_CATEGORIES + 1
		});
	});

	it('are added to the legend after its entries', () => {
		const { categories } = tableCategories(table, 1, ['#111111', '#222222'], undefined);
		const legend = legendWithCategories(
			{ position: 'top-left', entries: [{ color: '#000000', label: 'Old' }] },
			categories
		);
		expect(legend).toStrictEqual({
			position: 'top-left',
			entries: [
				{ color: '#000000', label: 'Old' },
				{ color: '#111111', symbol: undefined, label: 'cafe' },
				{ color: '#222222', symbol: undefined, label: 'shop' },
				{ color: '#111111', symbol: undefined, label: '(empty)' }
			]
		});
		expect(legendWithCategories(undefined, []).entries).toStrictEqual([]);
	});

	it('style markers with the color and the chosen symbol', () => {
		expect(markerStyle('#ff0000', 3)).toStrictEqual({ color: '#ff0000', pattern: 3 });
		expect(markerStyle('#ff0000', undefined)).toStrictEqual({ color: '#ff0000' });
	});
});
