import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, stateFromGeoJSON, stateToGeoJSON } from './index.js';
import type { MapState } from './types.js';

describe('the options of the labels of markers', () => {
	it('round-trip in a link and in GeoJSON', () => {
		for (const meta of [
			{ labels: { overlap: 'hide' } },
			{ labels: { minZoom: 14 } },
			{ labels: { minZoom: 12.5 } },
			{ labels: { overlap: 'hide', minZoom: 0.1 } }
		] as const) {
			const state: MapState = { meta, elements: [] };
			expect(decodeState(encodeState(state))).toStrictEqual(state);
			expect(stateFromGeoJSON(JSON.parse(JSON.stringify(stateToGeoJSON(state)))).meta).toStrictEqual(meta);
		}
	});

	it('are left out without a valid value, like missing metadata', () => {
		const plain = encodeState({ elements: [] });
		for (const labelMinZoom of [0, 0.04, 25, -3, NaN]) {
			expect(encodeState({ meta: { labels: { minZoom: labelMinZoom } }, elements: [] })).toBe(plain);
		}
		const foreign = { labels: { overlap: 'yes', minZoom: '14' } };
		expect(stateFromGeoJSON({ type: 'FeatureCollection', features: [], meta: foreign } as never).meta).toBeUndefined();
	});

	it('keep one decimal place of the zoom level', () => {
		const decoded = decodeState(encodeState({ meta: { labels: { minZoom: 12.55 } }, elements: [] }));
		expect(decoded.meta).toStrictEqual({ labels: { minZoom: 12.6 } });
	});
});
