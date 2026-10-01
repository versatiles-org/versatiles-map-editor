import { describe, expect, it } from 'vitest';
import { upgradeState } from './index.js';
import type { MapState } from './types.js';

describe('upgradeState', () => {
	it('makes the opacity of a fill of an older version the alpha of its color', () => {
		const old = {
			elements: [
				{ type: 'polygon', points: [], style: { color: '#0072b2', opacity: 0.3, pattern: 2 } },
				// the default color, with an alpha of its own
				{ type: 'circle', point: [0, 0], radius: 1, style: { opacity: 0.5 } },
				{ type: 'circle', point: [0, 0], radius: 1, style: { color: '#00000080', opacity: 0.5 } },
				{ type: 'marker', point: [0, 0], style: { color: '#123456' } },
				{ type: 'marker', point: [0, 0] }
			]
		} as unknown as MapState;
		expect(upgradeState(old).elements.map((e) => ('style' in e ? e.style : undefined))).toStrictEqual([
			{ color: '#0072b24d', pattern: 2 },
			{ color: '#ff000080' },
			{ color: '#00000040' },
			{ color: '#123456' },
			undefined
		]);
	});

	it('makes the search and the position of the legend of an older version settings of the viewer', () => {
		const old = {
			meta: { search: true, legend: { position: 'right', layout: 'inline', entries: [] }, title: 'T' },
			elements: []
		} as unknown as MapState;
		expect(upgradeState(old).meta).toStrictEqual({
			legend: { layout: 'inline', entries: [] },
			title: 'T',
			viewer: { search: 'top-left', legend: 'right' }
		});
		// without them, nothing changes
		const current: MapState = { meta: { title: 'T', viewer: { navigation: 'none' } }, elements: [] };
		expect(upgradeState(current)).toStrictEqual(current);
	});
});
