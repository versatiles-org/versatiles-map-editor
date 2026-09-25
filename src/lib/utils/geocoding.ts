/**
 * Address and place search with our geocoding service (Photon API, see
 * https://github.com/versatiles-org/photon-stack). Shared by the editor's search, the
 * search in embedded maps and the address column of the CSV import, so it must not
 * depend on the editor.
 */

export const GEOCODER_URL = 'https://geocode.versatiles.org/api';

// Languages of the result labels supported by the service; others get the local names
const LANGUAGES = ['de', 'en', 'fr'];

export interface GeocodingResult {
	/** Human-readable description, e.g. "Brandenburger Tor, Pariser Platz 1, 10117 Berlin, Deutschland". */
	label: string;
	/** Position as [lng, lat]. */
	point: [number, number];
	/** Extent of the place (e.g. of a city) as [west, south, east, north], if known. */
	bbox?: [number, number, number, number];
}

export interface GeocodingOptions {
	/** Maximum number of results. */
	limit?: number;
	/** Language of the labels, e.g. "de". Unsupported languages fall back to local names. */
	language?: string;
	/** Prefer results near this position [lng, lat], e.g. the center of the map. */
	near?: [number, number];
	/** Zoom level of `near`: the higher, the stronger results near it are preferred. */
	zoom?: number;
	signal?: AbortSignal;
}

/** Search for an address or place. Throws if the request fails or is aborted. */
export async function geocode(query: string, options: GeocodingOptions = {}): Promise<GeocodingResult[]> {
	const params = new URLSearchParams({ q: query, limit: String(options.limit ?? 5) });
	const language = options.language?.toLowerCase().split('-')[0];
	params.set('lang', language && LANGUAGES.includes(language) ? language : 'default');
	if (options.near) {
		params.set('lon', options.near[0].toFixed(5));
		params.set('lat', options.near[1].toFixed(5));
		if (options.zoom != null) params.set('zoom', String(Math.round(options.zoom)));
	}

	const response = await fetch(`${GEOCODER_URL}?${params}`, { signal: options.signal });
	if (!response.ok) throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`);
	const data = (await response.json()) as GeoJSON.FeatureCollection;
	const results: GeocodingResult[] = [];
	for (const feature of data.features ?? []) {
		const result = toResult(feature);
		// Places with the same label (e.g. a station and a bus stop) cannot be told apart, so keep the best
		if (result && !results.some((r) => r.label === result.label)) results.push(result);
	}
	return results;
}

function toResult(feature: GeoJSON.Feature): GeocodingResult | undefined {
	if (feature.geometry?.type !== 'Point') return undefined;
	const [lng, lat] = feature.geometry.coordinates;
	if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;

	const result: GeocodingResult = { label: formatLabel(feature.properties ?? {}), point: [lng, lat] };
	// Photon's extent is [west, north, east, south]
	const extent = feature.properties?.extent;
	if (Array.isArray(extent) && extent.length === 4 && extent.every(Number.isFinite)) {
		const [west, north, east, south] = extent as number[];
		result.bbox = [west, south, east, north];
	}
	return result;
}

/** A label from the address parts, without repetitions (e.g. a city named like its state). */
export function formatLabel(p: Record<string, unknown>): string {
	const text = (...values: unknown[]) =>
		values
			.filter((v) => typeof v === 'string' && v)
			.join(' ')
			.trim();

	const parts = [
		text(p.name),
		text(p.street, p.housenumber),
		text(p.postcode, p.city ?? p.district ?? p.locality),
		text(p.state),
		text(p.country)
	];

	const result: string[] = [];
	for (const part of parts) {
		if (part && !result.some((r) => r === part || r.endsWith(' ' + part))) result.push(part);
	}
	return result.join(', ');
}
