import type { StateElementMarker, StateLegend, StateStyle } from '@versatiles/map-state';
import { geocode, type GeocodingOptions } from './geocoding.js';
import { parseNumber, type AddressPart, type Table } from './table.js';

/** Which columns hold the position, the label and the popup of the markers. */
export interface TableMapping {
	/** Coordinates, or an address, possibly spread over several columns (at least one). */
	position: { latitude: number; longitude: number } | { address: AddressColumns };
	label?: number;
	popup?: number;
	/** The style of all markers. */
	style?: StateStyle;
	/** A column whose values get their own style, e.g. a color per kind of place. */
	category?: { column: number; styles: Record<string, StateStyle> };
}

/** The columns of the parts of an address, e.g. `{ street: 0, postcode: 1, city: 2 }`. */
export type AddressColumns = Partial<Record<AddressPart, number>>;

/** The address of a row as one search text, e.g. "Hauptstraße 5, 10115 Berlin, Deutschland". */
export function addressOf(row: string[], columns: AddressColumns): string {
	const cell = (part: AddressPart) => (columns[part] === undefined ? '' : (row[columns[part]] ?? '').trim());
	const join = (separator: string, ...values: string[]) => values.filter((v) => v !== '').join(separator);
	return join(
		', ',
		cell('address'),
		join(' ', cell('street'), cell('housenumber')),
		join(' ', cell('postcode'), cell('city')),
		cell('country')
	);
}

export interface FailedRow {
	/** Number of the row in the table, like in a spreadsheet: counting a header and empty rows. */
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

/** The distinct values of a column, trimmed, in order of appearance, with the number of rows. */
export function columnValues(table: Table, column: number): { value: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const row of table.rows) {
		const value = row[column].trim();
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts].map(([value, count]) => ({ value, count }));
}

/** The text of a table file: UTF-8, or Windows-1252 (e.g. a CSV file from an older Excel). */
export function decodeTableFile(bytes: ArrayBuffer): string {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return new TextDecoder('windows-1252').decode(bytes);
	}
}

/** A value of the category column, with the number of rows and its style. */
export interface Category {
	value: string;
	count: number;
	color: string;
	symbol: number | undefined;
}

// More values are no categories, e.g. names
export const MAX_CATEGORIES = 30;

/**
 * The categories of a column: each value gets the next color of the scheme and the symbol.
 * Returns none, and the number of values, if there are too many for categories.
 */
export function tableCategories(
	table: Table,
	column: number,
	colors: string[],
	symbol: number | undefined
): { categories: Category[]; tooMany: number } {
	const values = columnValues(table, column);
	if (values.length > MAX_CATEGORIES) return { categories: [], tooMany: values.length };
	const categories = values.map(({ value, count }, i) => ({ value, count, color: colors[i % colors.length], symbol }));
	return { categories, tooMany: 0 };
}

/** The style of markers with the color and, if chosen, the symbol. */
export function markerStyle(color: string, symbol: number | undefined): StateStyle {
	return { color, ...(symbol !== undefined ? { pattern: symbol } : {}) };
}

/** The legend with an entry for each category, after its existing entries. */
export function legendWithCategories(legend: StateLegend | undefined, categories: Category[]): StateLegend {
	const entries = categories.map((c) => ({ color: c.color, symbol: c.symbol, label: c.value || '(empty)' }));
	return { ...(legend ?? { entries: [] }), entries: [...(legend?.entries ?? []), ...entries] };
}

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
		const category = mapping.category && mapping.category.styles[row[mapping.category.column].trim()];
		const style = { ...mapping.style, ...category, ...(label ? { label } : {}) };
		if (Object.keys(style).length > 0) element.style = style;
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
				results[i] = { row: table.rowNumbers[i], value, reason: 'invalid coordinates' };
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
				const address = addressOf(row, position.address);
				if (!address) {
					results[i] = { row: table.rowNumbers[i], value: '', reason: 'no address' };
				} else {
					try {
						const [found] = await geocoder(address, { ...geocodingOptions, limit: 1, signal });
						results[i] = found
							? marker(row, found.point)
							: { row: table.rowNumbers[i], value: address, reason: 'address not found' };
					} catch (error) {
						signal?.throwIfAborted();
						console.error(error);
						results[i] = { row: table.rowNumbers[i], value: address, reason: 'search failed' };
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

/** The bounding box [[west, south], [east, north]] of the points, or undefined without points. */
export function boundsOf(points: [number, number][]): [[number, number], [number, number]] | undefined {
	if (points.length === 0) return undefined;
	// a loop, since spreading many points into Math.min overflows the stack
	let [west, south] = points[0];
	let [east, north] = points[0];
	for (const [lng, lat] of points) {
		if (lng < west) west = lng;
		if (lng > east) east = lng;
		if (lat < south) south = lat;
		if (lat > north) north = lat;
	}
	return [
		[west, south],
		[east, north]
	];
}
