import { describe, expect, it } from 'vitest';
import {
	decodeState,
	encodeState,
	LEGEND_DEFAULTS,
	removeLegendDefaults,
	stateFromGeoJSON,
	stateToGeoJSON
} from './index.js';
import type { StateLegend } from './types.js';

describe('the defaults of a legend', () => {
	const entries = [{ color: '#ff0000', label: 'A' }];
	const explicit: StateLegend = { ...LEGEND_DEFAULTS, entries };

	it('are left out', () => {
		expect(removeLegendDefaults(explicit)).toStrictEqual({ entries });
		const other: StateLegend = {
			position: 'top-left',
			layout: 'inline',
			font: 'serif',
			bold: true,
			italic: true,
			entries
		};
		expect(removeLegendDefaults(other)).toStrictEqual(other);
	});

	it('are left out alike by a link and by GeoJSON', () => {
		const fromLink = decodeState(encodeState({ elements: [], meta: { legend: explicit } })).meta?.legend;
		const fromGeoJSON = stateFromGeoJSON({ type: 'FeatureCollection', features: [], meta: { legend: explicit } }).meta
			?.legend;
		expect(fromLink).toStrictEqual({ entries });
		expect(fromGeoJSON).toStrictEqual({ entries });
	});
});

describe('bold and italic texts of a legend', () => {
	const entries = [{ color: '#ff0000', label: 'A' }];

	it('are kept by a link and by GeoJSON, each on its own', () => {
		for (const legend of [
			{ bold: true, entries },
			{ italic: true, entries },
			{ font: 'serif', bold: true, italic: true, entries }
		] as StateLegend[]) {
			const state = { elements: [], meta: { legend } };
			expect(decodeState(encodeState(state)).meta?.legend).toStrictEqual(legend);
			const geojson = JSON.parse(JSON.stringify(stateToGeoJSON(state)));
			expect(stateFromGeoJSON(geojson).meta?.legend).toStrictEqual(legend);
		}
	});

	it('add nothing to a link when they are off', () => {
		const plain = encodeState({ elements: [], meta: { legend: { entries } } });
		const off = encodeState({ elements: [], meta: { legend: { bold: false, italic: false, entries } } });
		expect(off).toBe(plain);
		expect(decodeState(off).meta?.legend).toStrictEqual({ entries });
	});

	it('are only true in GeoJSON, e.g. not a string', () => {
		const meta = { legend: { bold: 'yes', italic: 1, entries } };
		expect(stateFromGeoJSON({ type: 'FeatureCollection', features: [], meta }).meta?.legend).toStrictEqual({
			entries
		});
	});
});
