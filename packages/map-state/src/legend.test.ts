import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, LEGEND_DEFAULTS, removeLegendDefaults, stateFromGeoJSON } from './index.js';
import type { StateLegend } from './types.js';

describe('the defaults of a legend', () => {
	const entries = [{ color: '#ff0000', label: 'A' }];
	const explicit: StateLegend = { ...LEGEND_DEFAULTS, entries };

	it('are left out', () => {
		expect(removeLegendDefaults(explicit)).toStrictEqual({ entries });
		const other: StateLegend = { position: 'top-left', layout: 'inline', font: 'serif', entries };
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
