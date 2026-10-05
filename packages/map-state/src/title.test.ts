import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromKML, stateToGeoJSON, stateToKML } from './index.js';

const state: MapState = {
	meta: { title: 'Cafés in Berlin – 2026' },
	elements: [{ type: 'marker', point: [13.4, 52.5], label: 'A' }]
};

describe('title', () => {
	it('is kept in a link, GeoJSON and KML', () => {
		expect(decodeState(encodeState(state)).meta).toStrictEqual(state.meta);
		expect(stateToGeoJSON(state).meta?.title).toBe('Cafés in Berlin – 2026');
		expect(stateFromGeoJSON(stateToGeoJSON(state)).meta).toStrictEqual(state.meta);
		expect(stateFromKML(stateToKML(state)).meta).toStrictEqual(state.meta);
	});

	it('is the name of the KML document, for other tools', () => {
		expect(stateToKML(state)).toContain('<Document><name>Cafés in Berlin – 2026</name>');
		expect(stateToKML({ elements: [] })).toContain('<Document><name>Map</name>');
	});

	it('is not stored when it is empty', () => {
		expect(decodeState(encodeState({ meta: { title: '' }, elements: [] })).meta).toBeUndefined();
		expect(stateToGeoJSON({ meta: { title: '' }, elements: [] }).meta).toBeUndefined();
	});
});
