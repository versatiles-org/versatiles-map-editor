import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromKML, stateToGeoJSON, stateToKML } from './index.js';

// the labels of the background map over the areas and lines of the elements
const state: MapState = {
	meta: { labels: { mapOnTop: true } },
	elements: [
		{
			type: 'polygon',
			points: [
				[13.4, 52.5],
				[13.5, 52.5],
				[13.5, 52.6]
			],
			style: {}
		}
	]
};

describe('map labels on top', () => {
	it('is kept in a link, GeoJSON and KML', () => {
		expect(decodeState(encodeState(state)).meta).toStrictEqual(state.meta);
		expect(stateToGeoJSON(state).meta?.labels?.mapOnTop).toBe(true);
		expect(stateFromGeoJSON(stateToGeoJSON(state)).meta).toStrictEqual(state.meta);
		expect(stateFromKML(stateToKML(state)).meta).toStrictEqual(state.meta);
	});

	it('is the only metadata of a map', () => {
		const only: MapState = { meta: { labels: { mapOnTop: true } }, elements: [] };
		expect(decodeState(encodeState(only)).meta).toStrictEqual(only.meta);
	});

	it('is not stored when it is off', () => {
		const off: MapState = { meta: { labels: { mapOnTop: false } }, elements: [] };
		expect(decodeState(encodeState(off)).meta).toBeUndefined();
		expect(stateToGeoJSON(off).meta).toBeUndefined();
	});
});
