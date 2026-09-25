function formatNumber(value: number): string {
	return value.toLocaleString('en-US', { maximumSignificantDigits: 3 });
}

// Formats a length in meters, e.g. "850 m" or "12.3 km"
export function formatLength(meters: number): string {
	if (meters < 1000) return formatNumber(Math.round(meters)) + ' m';
	return formatNumber(meters / 1000) + ' km';
}

// Formats an area in square meters, e.g. "850 m²", "12.3 ha" or "4.5 km²"
export function formatArea(squareMeters: number): string {
	if (squareMeters < 1e4) return formatNumber(Math.round(squareMeters)) + ' m²';
	if (squareMeters < 1e6) return formatNumber(squareMeters / 1e4) + ' ha';
	return formatNumber(squareMeters / 1e6) + ' km²';
}
