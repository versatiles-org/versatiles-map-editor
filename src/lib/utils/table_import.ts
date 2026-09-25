import type { StateElementMarker, StateStyle } from '$lib/codec/types.js';
import { geocode, type GeocodingOptions } from './geocoding.js';
import { parseNumber, type Table } from './table.js';

/** Which columns hold the position, the label and the popup of the markers. */
export interface TableMapping {
	position: { latitude: number; longitude: number } | { address: number };
	label?: number;
	popup?: number;
	/** The style of all markers. */
	style?: StateStyle;
}

export interface FailedRow {
	/** Number of the row in the table, starting at 1 (without the header). */
	row: number;
	/** The address or the coordinates, as in the table. */
	value: string;
	reason: string;
}

export interface ImportResult {
	markers: StateElementMarker[];
	failed: FailedRow[];
}

export interface ImportOptions extends Pick<GeocodingOptions, 'language' | 'near' | 'zoom'> {
	signal?: AbortSignal;
	/** Called after each geocoded row. */
	onProgress?: (done: number, total: number) => void;
	geocoder?: typeof geocode;
}

// Requests at the same time, so a long list is fast without overloading the geocoding service
const GEOCODING_CONCURRENCY = 2;

/** Create a marker for each row. Rows without a valid position are reported, not imported. */
export async function importTable(
	table: Table,
	mapping: TableMapping,
	options: ImportOptions = {}
): Promise<ImportResult> {
	const { signal, onProgress, geocoder = geocode, ...geocodingOptions } = options;
	const results: (StateElementMarker | FailedRow)[] = new Array(table.rows.length);

	const marker = (row: string[], point: [number, number]): StateElementMarker => {
		const element: StateElementMarker = { type: 'marker', point };
		const label = mapping.label != null ? row[mapping.label].trim() : '';
		if (mapping.style || label) element.style = { ...mapping.style, ...(label ? { label } : {}) };
		const popup = mapping.popup != null ? row[mapping.popup].trim() : '';
		if (popup) element.popup = { text: popup };
		return element;
	};

	const position = mapping.position;
	if ('latitude' in position) {
		table.rows.forEach((row, i) => {
			const lat = parseNumber(row[position.latitude]);
			const lng = parseNumber(row[position.longitude]);
			const value = `${row[position.latitude]}, ${row[position.longitude]}`;
			if (lat === undefined || lng === undefined || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
				results[i] = { row: i + 1, value, reason: 'invalid coordinates' };
			} else {
				results[i] = marker(row, [lng, lat]);
			}
		});
	} else {
		let next = 0;
		let done = 0;
		const worker = async () => {
			while (next < table.rows.length) {
				signal?.throwIfAborted();
				const i = next++;
				const row = table.rows[i];
				const address = row[position.address].trim();
				if (!address) {
					results[i] = { row: i + 1, value: '', reason: 'no address' };
				} else {
					try {
						const [found] = await geocoder(address, { ...geocodingOptions, limit: 1, signal });
						results[i] = found ? marker(row, found.point) : { row: i + 1, value: address, reason: 'address not found' };
					} catch (error) {
						signal?.throwIfAborted();
						console.error(error);
						results[i] = { row: i + 1, value: address, reason: 'search failed' };
					}
				}
				onProgress?.(++done, table.rows.length);
			}
		};
		await Promise.all(Array.from({ length: GEOCODING_CONCURRENCY }, worker));
	}

	const markers: StateElementMarker[] = [];
	const failed: FailedRow[] = [];
	for (const result of results) {
		if ('type' in result) markers.push(result);
		else failed.push(result);
	}
	return { markers, failed };
}
