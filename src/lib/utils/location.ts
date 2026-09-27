/**
 * The country of the user: of the time zone, or else of the browser language (e.g. "de-AT").
 * Null if neither tells.
 */
export function getCountryCode(): string | null {
	try {
		const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
		const countryCode = timeZoneCountry(timeZone) ?? navigator.language.split('-')[1];
		return countryCode || null;
	} catch {
		return null;
	}
}

/**
 * The country of a time zone, among the countries with a bounding box. JavaScript can only list
 * the time zones of a country (Intl.Locale#getTimeZones), not the other way round. The names are
 * those of the browser, like the time zone it reports, e.g. "Asia/Calcutta" or "Asia/Kolkata".
 * Undefined in browsers without getTimeZones.
 */
export function timeZoneCountry(timeZone: string): string | undefined {
	for (const country of Object.keys(countryBoundingBoxes)) {
		if (new Intl.Locale('und-' + country).getTimeZones?.()?.includes(timeZone)) return country;
	}
	return undefined;
}

/**
 * The first view of the map in the user's country, if the link holds no map: only for the
 * countries of the EU and the US, each without distant territories (e.g. France without French
 * Guiana, the US without Alaska and Hawaii). Other users see the whole world.
 */
const countryBoundingBoxes: { [key: string]: [number, number, number, number] } = {
	AT: [9.4, 46.4, 17, 49.1],
	BE: [2.5, 49.5, 6.2, 51.5],
	BG: [22.3, 41.2, 28.6, 44.3],
	CY: [32.2, 34.5, 34.1, 35.2],
	CZ: [12.2, 48.5, 18.9, 51.2],
	DE: [5.9, 47.3, 15.1, 55],
	DK: [8, 54.8, 12.7, 57.8],
	EE: [23.3, 57.4, 28.2, 59.7],
	ES: [-9.4, 35.9, 3.1, 43.8],
	FI: [20.6, 59.8, 31.6, 70.2],
	FR: [-5.2, 41.3, 9.6, 51.1],
	GR: [20.1, 34.9, 26.7, 41.9],
	HR: [13.6, 42.4, 19.4, 46.6],
	HU: [16.2, 45.7, 22.8, 48.7],
	IE: [-10, 51.6, -6, 55.2],
	IT: [6.7, 36.6, 18.5, 47.2],
	LT: [21, 53.9, 26.6, 56.4],
	LU: [5.6, 49.4, 6.3, 50.2],
	LV: [21, 55.6, 28.2, 58],
	MT: [14.18, 35.78, 14.58, 36.09],
	NL: [3.3, 50.8, 7.1, 53.6],
	PL: [14, 49, 24.1, 54.9],
	PT: [-9.6, 36.8, -6.3, 42.3],
	RO: [20.2, 43.6, 29.7, 48.3],
	SE: [11, 55.3, 24, 69.2],
	SI: [13.6, 45.4, 16.6, 46.9],
	SK: [16.8, 47.7, 22.6, 49.6],
	US: [-124.8, 24.4, -66.9, 49.4]
};

export function getCountryBoundingBox(): [number, number, number, number] | null {
	const countryCode = getCountryCode();
	if (!countryCode) return null;
	return countryBoundingBoxes[countryCode] ?? null;
}
