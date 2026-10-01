import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, stateFromGeoJSON, stateToGeoJSON } from './index.js';
import type { MapState } from './types.js';

describe('the options of the labels of markers', () => {
	it('round-trip in a link and in GeoJSON', () => {
		for (const meta of [
			{ labelOverlap: 'hide' },
			{ labelMinZoom: 14 },
			{ labelOverlap: 'hide', labelMinZoom: 1 }
		] as const) {
			const state: MapState = { meta, elements: [] };
			expect(decodeState(encodeState(state))).toStrictEqual(state);
			expect(stateFromGeoJSON(JSON.parse(JSON.stringify(stateToGeoJSON(state)))).meta).toStrictEqual(meta);
		}
	});

	it('are left out without a valid value, like missing metadata', () => {
		const plain = encodeState({ elements: [] });
		for (const labelMinZoom of [0, 25, 12.5, -3]) {
			expect(encodeState({ meta: { labelMinZoom }, elements: [] })).toBe(plain);
		}
		const foreign = { labelOverlap: 'yes', labelMinZoom: '14' };
		expect(stateFromGeoJSON({ type: 'FeatureCollection', features: [], meta: foreign } as never).meta).toBeUndefined();
	});
});
