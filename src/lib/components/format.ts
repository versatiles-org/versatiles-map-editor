import type { Measurement } from '../element/types.js';

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
