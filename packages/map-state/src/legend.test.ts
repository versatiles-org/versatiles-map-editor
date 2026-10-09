import { describe, expect, it } from 'vitest';
import {
	decodeState,
	encodeState,
	LEGEND_DEFAULTS,
	sanitizeLegend,
	stateFromGeoJSON,
	stateToGeoJSON
} from './index.js';
import type { StateLegend } from './types.js';

describe('the defaults of a legend', () => {
	const entries = [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'A' }];
	const explicit: StateLegend = { ...LEGEND_DEFAULTS, entries };

	it('are left out', () => {
		expect(sanitizeLegend(explicit)).toStrictEqual({ entries });
		const other: StateLegend = {
			layout: 'inline',
			font: 'serif',
			bold: true,
			italic: true,
			entries
		};
		expect(sanitizeLegend(other)).toStrictEqual(other);
		// and what is no setting of a legend
		const { bold: _bold, ...plain } = other;
		expect(sanitizeLegend({ ...other, position: 'top-left', bold: 'yes' })).toStrictEqual(plain);
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
	const entries = [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'A' }];

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

describe('the theme of a legend', () => {
	const entries = [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'A' }];

	it('is kept by a link and by GeoJSON', () => {
		for (const theme of ['dark', 'glass'] as const) {
			const state = { elements: [], meta: { legend: { theme, entries } } };
			expect(decodeState(encodeState(state)).meta?.legend).toStrictEqual({ theme, entries });
			const geojson = JSON.parse(JSON.stringify(stateToGeoJSON(state)));
			expect(stateFromGeoJSON(geojson).meta?.legend).toStrictEqual({ theme, entries });
		}
	});

	it('adds nothing to a link when it is the default, and is only a known theme in GeoJSON', () => {
		const plain = encodeState({ elements: [], meta: { legend: { entries } } });
		expect(encodeState({ elements: [], meta: { legend: { theme: 'light', entries } } })).toBe(plain);
		const meta = { legend: { theme: 'neon', entries } };
		expect(stateFromGeoJSON({ type: 'FeatureCollection', features: [], meta }).meta?.legend).toStrictEqual({
			entries
		});
	});
});
