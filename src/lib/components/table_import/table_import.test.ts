import { describe, expect, it, vi } from 'vitest';
import {
	addressOf,
	isUncertain,
	biasOptions,
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
import type { geocode } from '../common/geocoding.js';

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
				label: 'Café',
				style: { color: '#0000ff' },
				popup: { text: 'Open **daily**' }
			}
		]);
		// numbered like in the spreadsheet, where the header is row 1
		expect(result.failed).toStrictEqual([
			{ row: 3, value: 'x, 13', reason: 'invalid coordinates' },
			{ row: 4, value: '95, 13', reason: 'invalid coordinates' }
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
			{ position: { address: { address: 0 } }, label: 1 },
			{ geocoder, onProgress, language: 'de' }
		);
		expect(result.markers).toStrictEqual([{ type: 'marker', point: [10, 20], label: 'A' }]);
		expect(result.failed).toStrictEqual([
			{ row: 3, value: '', reason: 'no address' },
			{ row: 4, value: 'Nowhere', reason: 'address not found' },
			{ row: 5, value: 'Error', reason: 'search failed' }
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
			importTable(table, { position: { address: { address: 0 } } }, { geocoder, signal: controller.signal })
		).rejects.toThrow();
		expect(geocoder.mock.calls.length).toBeLessThan(4);
	});

	it('styles the markers by a category column', async () => {
		const table = parseTable('lat,lon,kind\n1,2,Cafe\n3,4,Shop\n5,6, Cafe \n7,8,Other');
		const { markers } = await importTable(table, {
			position: { latitude: 0, longitude: 1 },
			style: { color: '#ff0000', symbol: 'extras:pin-teardrop' },
			category: {
				column: 2,
				styles: { Cafe: { color: '#0000ff', symbol: 'base:icon-cafe' }, Shop: { color: '#00ff00' } }
			}
		});
		expect(markers.map((m) => m.style)).toStrictEqual([
			{ color: '#0000ff', symbol: 'base:icon-cafe' },
			{ color: '#00ff00', symbol: 'extras:pin-teardrop' },
			{ color: '#0000ff', symbol: 'base:icon-cafe' },
			{ color: '#ff0000', symbol: 'extras:pin-teardrop' }
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
		const { categories, tooMany } = tableCategories(table, 1, ['#111111', '#222222'], 'icons:anchor');
		expect(tooMany).toBe(0);
		expect(categories).toStrictEqual([
			{ value: 'cafe', count: 2, color: '#111111', symbol: 'icons:anchor' },
			{ value: 'shop', count: 1, color: '#222222', symbol: 'icons:anchor' },
			{ value: '', count: 1, color: '#111111', symbol: 'icons:anchor' }
		]);
	});

	it('are none if a column has too many values, e.g. names', () => {
		const names = parseTable(
			['name', ...Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => `N${i}`)].join('\n'),
			true
		);
		expect(tableCategories(names, 0, ['#111111'], '')).toStrictEqual({
			categories: [],
			tooMany: MAX_CATEGORIES + 1
		});
	});

	it('are added to the legend after its entries', () => {
		const { categories } = tableCategories(table, 1, ['#111111', '#222222'], '');
		categories[1].symbol = 'icons:anchor';
		const legend = legendWithCategories(
			{ layout: 'inline', entries: [{ type: 'polygon', style: { color: '#000000' }, label: 'Old' }] },
			categories
		);
		// with the styles of their markers; "" is no symbol
		expect(legend).toStrictEqual({
			layout: 'inline',
			entries: [
				{ type: 'polygon', style: { color: '#000000' }, label: 'Old' },
				{ type: 'marker', style: { color: '#111111', symbol: '' }, label: 'cafe' },
				{ type: 'marker', style: { color: '#222222', symbol: 'icons:anchor' }, label: 'shop' },
				{ type: 'marker', style: { color: '#111111', symbol: '' }, label: '(empty)' }
			]
		});
		expect(legendWithCategories(undefined, []).entries).toStrictEqual([]);
	});

	it('style markers with the color and the chosen symbol', () => {
		expect(markerStyle('#ff0000', 'icons:anchor')).toStrictEqual({ color: '#ff0000', symbol: 'icons:anchor' });
		expect(markerStyle('#ff0000', '')).toStrictEqual({ color: '#ff0000', symbol: '' });
	});
});

describe('addresses in several columns', () => {
	it('are combined into one search text, leaving out empty parts', () => {
		const columns = { street: 0, housenumber: 1, postcode: 2, city: 3, country: 4 };
		expect(addressOf(['Hauptstraße', '5', '10115', 'Berlin', 'Deutschland'], columns)).toBe(
			'Hauptstraße 5, 10115 Berlin, Deutschland'
		);
		expect(addressOf(['Hauptstraße', '', '', 'Berlin', ''], columns)).toBe('Hauptstraße, Berlin');
		expect(addressOf(['Rathaus, Markt 1', 'Bonn'], { address: 0, city: 1 })).toBe('Rathaus, Markt 1, Bonn');
		expect(addressOf(['', ''], columns)).toBe('');
	});

	it('are searched as one address', async () => {
		const table = parseTable('Straße;Nr;PLZ;Ort\nHauptstraße;5;10115;Berlin\n;;;');
		const geocoder = vi.fn<typeof geocode>(async (query) => [{ label: query, point: [13.4, 52.5] }]);
		const { markers } = await importTable(
			table,
			{ position: { address: { street: 0, housenumber: 1, postcode: 2, city: 3 } } },
			{ geocoder }
		);
		expect(geocoder).toHaveBeenCalledWith('Hauptstraße 5, 10115 Berlin', expect.anything());
		expect(markers).toHaveLength(1);
	});
});

describe('biasOptions', () => {
	it('prefers places near the map view, in its region, or anywhere', () => {
		expect(biasOptions('view', [13.4, 52.5], 14)).toStrictEqual({ near: [13.4, 52.5], zoom: 14 });
		// at most at country level
		expect(biasOptions('region', [13.4, 52.5], 14)).toStrictEqual({ near: [13.4, 52.5], zoom: 5 });
		expect(biasOptions('region', [13.4, 52.5], 3)).toStrictEqual({ near: [13.4, 52.5], zoom: 3 });
		expect(biasOptions('none', [13.4, 52.5], 14)).toStrictEqual({});
	});
});

describe('uncertain matches', () => {
	const columns = { street: 0, housenumber: 1, postcode: 2, city: 3 };
	const row = ['Hauptstraße', '5', '10115', 'Berlin'];
	const found = (type: string, address: Record<string, string>) => ({
		label: 'x',
		point: [0, 0] as [number, number],
		type,
		address
	});

	it('are results with another street, house number or postcode', () => {
		const exact = { street: 'Hauptstraße', housenumber: '5', postcode: '10115', city: 'Berlin' };
		expect(isUncertain(row, columns, found('house', exact))).toBe(false);
		// written differently, the same street and number
		expect(isUncertain(['Hauptstr.', '5a', '10115', 'Berlin'], columns, found('house', exact))).toBe(false);
		expect(isUncertain(row, columns, found('house', { ...exact, street: 'Chausseestraße' }))).toBe(true);
		expect(isUncertain(row, columns, found('house', { ...exact, housenumber: '7' }))).toBe(true);
		expect(isUncertain(row, columns, found('street', { street: 'Hauptstraße', postcode: '10115' }))).toBe(true);
		expect(isUncertain(row, columns, found('house', { ...exact, postcode: '10117' }))).toBe(true);
	});

	it('are areas, e.g. the town, for an address with a street or house number', () => {
		expect(isUncertain(row, columns, found('city', { city: 'Berlin' }))).toBe(true);
		expect(isUncertain(['Hauptstraße 5, Berlin'], { address: 0 }, found('city', { city: 'Berlin' }))).toBe(true);
		// a list of towns
		expect(isUncertain(['Berlin'], { address: 0 }, found('city', { city: 'Berlin' }))).toBe(false);
		expect(isUncertain(['Bonn', 'DE'], { city: 0, country: 1 }, found('city', { city: 'Bonn' }))).toBe(false);
	});

	it('are imported and listed, or reported as failed if the user chooses', async () => {
		const table = parseTable('Straße;Nr;Ort\nHauptstraße;5;Berlin\nMarkt;1;Bonn');
		const geocoder = vi.fn<typeof geocode>(async (query) =>
			query.startsWith('Hauptstraße')
				? [
						{
							label: 'Chausseestraße 5, Berlin',
							point: [13.38, 52.53],
							type: 'house',
							address: { street: 'Chausseestraße', housenumber: '5' }
						}
					]
				: [
						{
							label: 'Markt 1, Bonn',
							point: [7.1, 50.7],
							type: 'house',
							address: { street: 'Markt', housenumber: '1' }
						}
					]
		);
		const mapping = { position: { address: { street: 0, housenumber: 1, city: 2 } } };

		const imported = await importTable(table, mapping, { geocoder });
		expect(imported.markers).toHaveLength(2);
		expect(imported.uncertain).toStrictEqual([
			{ row: 2, value: 'Hauptstraße 5, Berlin', found: 'Chausseestraße 5, Berlin' }
		]);

		const strict = await importTable(table, mapping, { geocoder, importUncertain: false });
		expect(strict.markers).toHaveLength(1);
		expect(strict.uncertain).toStrictEqual([]);
		expect(strict.failed).toStrictEqual([
			{ row: 2, value: 'Hauptstraße 5, Berlin', reason: 'uncertain, found Chausseestraße 5, Berlin' }
		]);
	});
});
