import { describe, expect, it } from 'vitest';
import type { MapState } from '@versatiles/map-state';
import { hasPopups, sharedState } from './shared_state.js';

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

	it('leaves out the popups if its author chooses so, and keeps the rest of the elements', () => {
		const withPopups: MapState = {
			meta: { title: 'A walk' },
			elements: [
				{ type: 'marker', point: [13.4, 52.5], label: 'Berlin', popup: { text: 'The capital' } },
				{
					type: 'line',
					points: [
						[13.4, 52.5],
						[13.5, 52.6]
					],
					popup: { text: 'A walk' }
				},
				{ type: 'marker', point: [13.5, 52.5] }
			]
		};
		expect(sharedState(withPopups, { popups: false })).toStrictEqual({
			elements: [
				{ type: 'marker', point: [13.4, 52.5], label: 'Berlin' },
				{
					type: 'line',
					points: [
						[13.4, 52.5],
						[13.5, 52.6]
					]
				},
				{ type: 'marker', point: [13.5, 52.5] }
			]
		});
		// by default with them; the map itself keeps them
		expect(sharedState(withPopups).elements).toStrictEqual(withPopups.elements);
		expect(withPopups.elements[0]).toHaveProperty('popup');
	});
});

describe('hasPopups', () => {
	it('tells whether any element has a popup', () => {
		expect(hasPopups({ elements })).toBe(false);
		expect(
			hasPopups({
				elements: [...elements, { type: 'circle', point: [13.4, 52.5], radius: 100, popup: { text: 'Here' } }]
			})
		).toBe(true);
		expect(hasPopups({ elements: [] })).toBe(false);
	});
});
