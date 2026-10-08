import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromKML, stateToGeoJSON, stateToKML } from './index.js';

// the labels of the background map over the areas and lines of the elements
const state: MapState = {
	meta: { background: { labelsOnTop: true } },
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
		expect(stateToGeoJSON(state).meta?.background?.labelsOnTop).toBe(true);
		expect(stateFromGeoJSON(stateToGeoJSON(state)).meta).toStrictEqual(state.meta);
		expect(stateFromKML(stateToKML(state)).meta).toStrictEqual(state.meta);
	});

	it('is a setting of the background, with its others', () => {
		const more: MapState = {
			meta: { background: { theme: 'gray', labelsOnTop: true, hillshade: true } },
			elements: []
		};
		expect(decodeState(encodeState(more)).meta).toStrictEqual(more.meta);
	});

	it('is the only metadata of a map', () => {
		const only: MapState = { meta: { background: { labelsOnTop: true } }, elements: [] };
		expect(decodeState(encodeState(only)).meta).toStrictEqual(only.meta);
	});

	it('is not stored when it is off', () => {
		const off: MapState = { meta: { background: { labelsOnTop: false } }, elements: [] };
		expect(decodeState(encodeState(off)).meta).toBeUndefined();
		expect(stateToGeoJSON(off).meta).toBeUndefined();
	});
});
