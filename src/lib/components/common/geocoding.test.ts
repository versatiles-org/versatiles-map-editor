import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatLabel, geocode } from './geocoding.js';
import { config, DEFAULT_CONFIG, DEFAULT_GEOCODER } from '../../background/index.js';

function mockFetch(body: unknown, init: ResponseInit = {}) {
	const fetch = vi.fn(async () => new Response(JSON.stringify(body), init));
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

function requestedParams(fetch: ReturnType<typeof mockFetch>): Record<string, string> {
	const url = new URL((fetch.mock.calls[0] as unknown as [string])[0]);
	expect(url.origin + url.pathname).toBe(config.current.geocoder);
	return Object.fromEntries(url.searchParams);
}

afterEach(() => {
	vi.unstubAllGlobals();
	config.current = DEFAULT_CONFIG;
});

describe('geocode', () => {
	it('asks the geocoder of the configuration', async () => {
		const fetch = mockFetch({ features: [] });
		await geocode('Berlin');
		expect(new URL((fetch.mock.calls[0] as unknown as [string])[0]).origin).toBe(new URL(DEFAULT_GEOCODER).origin);
		config.current = { ...DEFAULT_CONFIG, geocoder: 'https://geocode.example.org/photon' };
		await geocode('Berlin');
		expect((fetch.mock.calls[1] as unknown as [string])[0]).toMatch(/^https:\/\/geocode\.example\.org\/photon\?/);
	});

	const feature = (properties: Record<string, unknown>, coordinates: unknown = [13.4, 52.5]) => ({
		type: 'Feature',
		properties,
		geometry: { type: 'Point', coordinates }
	});

	it('returns labels, points and bounding boxes', async () => {
		mockFetch({
			type: 'FeatureCollection',
			features: [
				feature({ name: 'Berlin', country: 'Deutschland', extent: [13.08, 52.67, 13.76, 52.33] }),
				feature({ name: 'Brandenburger Tor', street: 'Pariser Platz', housenumber: '1' }, [13.37, 52.51])
			]
		});
		expect(await geocode('berlin')).toStrictEqual([
			{ label: 'Berlin, Deutschland', point: [13.4, 52.5], bbox: [13.08, 52.33, 13.76, 52.67] },
			{
				label: 'Brandenburger Tor, Pariser Platz 1',
				point: [13.37, 52.51],
				address: { street: 'Pariser Platz', housenumber: '1' }
			}
		]);
	});

	it('returns the kind of place and the parts of its address', async () => {
		mockFetch({
			type: 'FeatureCollection',
			features: [
				feature({ type: 'house', street: 'Chausseestraße', housenumber: 5, postcode: '10115', city: 'Berlin' })
			]
		});
		const [result] = await geocode('x');
		expect(result.type).toBe('house');
		expect(result.address).toStrictEqual({
			street: 'Chausseestraße',
			housenumber: '5',
			postcode: '10115',
			city: 'Berlin'
		});
	});

	it('keeps only the first of several results with the same label', async () => {
		mockFetch({
			type: 'FeatureCollection',
			features: [feature({ name: 'Stop' }, [1, 2]), feature({ name: 'Stop' }, [1, 2.001]), feature({ name: 'Other' })]
		});
		expect((await geocode('x')).map((r) => r.point)).toStrictEqual([
			[1, 2],
			[13.4, 52.5]
		]);
	});

	it('skips results without a valid point', async () => {
		mockFetch({
			type: 'FeatureCollection',
			features: [feature({ name: 'a' }, [NaN, 1]), { type: 'Feature', properties: {}, geometry: null }]
		});
		expect(await geocode('x')).toStrictEqual([]);
	});

	it('sends the query, limit, language and location bias', async () => {
		const fetch = mockFetch({ type: 'FeatureCollection', features: [] });
		await geocode('Hauptstraße', { limit: 3, language: 'de-AT', near: [11.5755, 48.13714], zoom: 11.6 });
		expect(requestedParams(fetch)).toStrictEqual({
			q: 'Hauptstraße',
			limit: '3',
			lang: 'de',
			lon: '11.57550',
			lat: '48.13714',
			zoom: '12'
		});
	});

	it('uses local names for unsupported languages', async () => {
		const fetch = mockFetch({ type: 'FeatureCollection', features: [] });
		await geocode('x', { language: 'es' });
		expect(requestedParams(fetch)).toMatchObject({ lang: 'default', limit: '5' });
	});

	it('throws if the request fails', async () => {
		mockFetch({}, { status: 500, statusText: 'Internal Server Error' });
		await expect(geocode('x')).rejects.toThrow('Geocoding failed: 500 Internal Server Error');
	});
});

describe('formatLabel', () => {
	it('joins the address parts', () => {
		expect(
			formatLabel({
				name: 'Brandenburger Tor',
				street: 'Pariser Platz',
				housenumber: '1',
				postcode: '10117',
				city: 'Berlin',
				state: 'Berlin',
				country: 'Deutschland'
			})
		).toBe('Brandenburger Tor, Pariser Platz 1, 10117 Berlin, Deutschland');
	});

	it('skips repetitions and missing parts', () => {
		expect(formatLabel({ name: 'Berlin', state: 'Berlin', country: 'Deutschland' })).toBe('Berlin, Deutschland');
		expect(formatLabel({ street: 'Hauptstraße', district: 'Mitte', housenumber: null })).toBe('Hauptstraße, Mitte');
	});

	it('keeps numbers, e.g. a house number or a postcode given as a number', () => {
		expect(formatLabel({ street: 'Hauptstraße', housenumber: 3, postcode: 10115, city: 'Berlin' })).toBe(
			'Hauptstraße 3, 10115 Berlin'
		);
		expect(formatLabel({ street: 'Hauptstraße', housenumber: NaN })).toBe('Hauptstraße');
		expect(formatLabel({})).toBe('');
	});
});
