import { describe, expect, it, vi } from 'vitest';
import { importTable } from './table_import.js';
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
});
