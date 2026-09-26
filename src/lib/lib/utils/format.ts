// Numbers use the browser's locale unless a locale is given
function formatNumber(value: number, locale?: string): string {
	return value.toLocaleString(locale, { maximumSignificantDigits: 3 });
}

// Formats a length in meters, e.g. "850 m" or "12.3 km"
export function formatLength(meters: number, locale?: string): string {
	if (meters < 1000) return formatNumber(Math.round(meters), locale) + ' m';
	return formatNumber(meters / 1000, locale) + ' km';
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
