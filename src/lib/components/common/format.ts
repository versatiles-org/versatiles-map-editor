import type { Measurement } from '../../element/index.js';

// Numbers use the browser's locale unless a locale is given
function formatNumber(value: number, locale?: string): string {
	return value.toLocaleString(locale, { maximumSignificantDigits: 3 });
}

// Formats a length in meters, e.g. "850 m" or "12.3 km"
export function formatLength(meters: number, locale?: string): string {
	if (meters < 1000) return formatNumber(Math.round(meters), locale) + ' m';
	return formatNumber(meters / 1000, locale) + ' km';
}

/**
 * A precision, roughly: whole meters below 10 m, else 2 significant digits, e.g. "4 m", "140 m",
 * "1.1 km" or "36 km".
 */
export function formatPrecision(meters: number, locale?: string): string {
	return formatLength(meters < 10 ? Math.round(meters) : Number(meters.toPrecision(2)), locale);
}

// Formats an area in square meters, e.g. "850 m²", "12.3 ha" or "4.5 km²"
export function formatArea(squareMeters: number, locale?: string): string {
	if (squareMeters < 1e4) return formatNumber(Math.round(squareMeters), locale) + ' m²';
	if (squareMeters < 1e6) return formatNumber(squareMeters / 1e4, locale) + ' ha';
	return formatNumber(squareMeters / 1e6, locale) + ' km²';
}

/** The units of lengths and areas that `parseLength` and `parseArea` read, by their names, in meters or square meters. */
const LENGTH_UNITS: Record<string, number> = { m: 1, km: 1000 };
const AREA_UNITS: Record<string, number> = { 'm²': 1, m2: 1, sqm: 1, ha: 1e4, 'km²': 1e6, km2: 1e6 };

/**
 * A number with an optional unit, e.g. "1.5 km" or "1,5 km" in German, in the browser's locale
 * unless a locale is given; without a unit it has `unit`. Undefined if it is no positive number
 * with a known unit.
 */
function parseQuantity(text: string, units: Record<string, number>, unit: string, locale?: string): number | undefined {
	const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
	const group = parts.find((p) => p.type === 'group')?.value ?? ',';
	const decimal = parts.find((p) => p.type === 'decimal')?.value ?? '.';
	const match = /^([\d\s.,\u00a0\u202f']+?)\s*([a-z][a-z²0-9]*)?$/i.exec(text.trim());
	if (!match) return undefined;
	const digits = match[1]
		.replace(/[\s\u00a0\u202f]/g, '')
		.split(group)
		.join('')
		.replace(decimal, '.');
	const factor = units[match[2]?.toLowerCase() ?? unit];
	const value = Number(digits);
	if (!factor || digits === '' || !Number.isFinite(value) || value <= 0) return undefined;
	return value * factor;
}

/** A length in meters from a text like "850", "850 m" or "1.5 km"; `unit` (e.g. "km") without one. */
export function parseLength(text: string, unit = 'm', locale?: string): number | undefined {
	return parseQuantity(text, LENGTH_UNITS, unit, locale);
}

/** An area in square meters from a text like "850 m²", "3 ha" or "2 km2"; `unit` without one. */
export function parseArea(text: string, unit = 'm²', locale?: string): number | undefined {
	return parseQuantity(text, AREA_UNITS, unit, locale);
}

/** The unit of a formatted length or area, e.g. "km" of "1.5 km". */
export function unitOf(text: string): string {
	return text.split(' ').pop() ?? '';
}

const pluralRules = new Intl.PluralRules('en-US');

// Formats a count with the matching English noun, e.g. "1 row" or "3 rows"
export function formatCount(count: number, singular: string, plural = singular + 's'): string {
	return `${count} ${pluralRules.select(count) === 'one' ? singular : plural}`;
}

const MEASUREMENT_LABELS: Record<Measurement['kind'], string> = { length: 'Length', radius: 'Radius', area: 'Area' };

/** A measurement of an element as its label and its formatted value, e.g. "Area" and "4.5 km²". */
export function measurementText({ kind, value }: Measurement, locale?: string): { label: string; value: string } {
	const text = kind === 'area' ? formatArea(value, locale) : formatLength(value, locale);
	return { label: MEASUREMENT_LABELS[kind], value: text };
}
