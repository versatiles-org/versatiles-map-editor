import { describe, expect, it } from 'vitest';
import type { MapState } from '@versatiles/map-state';
import { sharedState } from './shared_state.js';

const legend = { entries: [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'Park' }] };
const elements: MapState['elements'] = [{ type: 'marker', point: [13.4, 52.5], label: 'Berlin' }];

describe('sharedState', () => {
	it('leaves out what only the author of a map needs: its title and its color scheme', () => {
		const state: MapState = {
			frame: { bounds: [13.3, 52.45, 13.5, 52.55] },
			meta: { title: 'A walk', colorScheme: 'okabe-ito', background: { theme: 'gray' }, legend },
			elements
		};
		expect(sharedState(state)).toStrictEqual({
			frame: { bounds: [13.3, 52.45, 13.5, 52.55] },
			meta: { background: { theme: 'gray' }, legend },
			elements
		});
		// the map itself keeps them
		expect(state.meta?.title).toBe('A walk');
	});

	it('leaves out a legend that shared maps do not show, and keeps one that they show', () => {
		const hidden: MapState = { meta: { legend, viewer: { legend: 'none', search: 'top-left' } }, elements };
		expect(sharedState(hidden)).toStrictEqual({ meta: { viewer: { search: 'top-left' } }, elements });
		expect(hidden.meta?.legend).toBe(legend);
		const shown: MapState = { meta: { legend, viewer: { legend: 'top' } }, elements };
		expect(sharedState(shown)).toStrictEqual(shown);
	});

	it('has no properties if none is left, like a map without them', () => {
		expect(sharedState({ meta: { title: 'A walk' }, elements })).toStrictEqual({ elements });
		expect(sharedState({ meta: { legend, viewer: { legend: 'none' } }, elements })).toStrictEqual({ elements });
		expect(sharedState({ elements })).toStrictEqual({ elements });
	});
});
