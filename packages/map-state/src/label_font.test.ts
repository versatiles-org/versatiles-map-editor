import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromKML, stateToGeoJSON, stateToKML } from './index.js';

// one font for the labels of all markers, not the one of the background map
const state: MapState = {
	meta: {
		background: { builder: 'osm', options: { text: { font: 'lato_regular' } } },
		labelFont: 'noto_sans_bold'
	},
	elements: [{ type: 'marker', point: [13.4, 52.5], style: { label: 'A' } }]
};

describe('label font', () => {
	it('is kept in a link, GeoJSON and KML', () => {
		expect(decodeState(encodeState(state)).meta).toStrictEqual(state.meta);
		expect(stateToGeoJSON(state).meta?.labelFont).toBe('noto_sans_bold');
		expect(stateFromGeoJSON(stateToGeoJSON(state)).meta).toStrictEqual(state.meta);
		expect(stateFromKML(stateToKML(state)).meta).toStrictEqual(state.meta);
	});

	it('is the only metadata of a map, e.g. without a background', () => {
		const only: MapState = { meta: { labelFont: 'noto_sans_bold' }, elements: [] };
		expect(decodeState(encodeState(only)).meta).toStrictEqual(only.meta);
	});
});
