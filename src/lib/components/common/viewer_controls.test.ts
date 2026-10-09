import { describe, expect, it } from 'vitest';
import { LEGEND_POSITIONS, NAVIGATION_POSITIONS, SCALE_POSITIONS, SEARCH_POSITIONS } from '@versatiles/map-state';
import { defaultPlace, PLACES } from './viewer_controls.js';

describe('the places of the controls of the viewer', () => {
	it('are all choices of the format but "none", each in a cell of its own', () => {
		const positions = {
			search: SEARCH_POSITIONS,
			navigation: NAVIGATION_POSITIONS,
			legend: LEGEND_POSITIONS,
			scale: SCALE_POSITIONS
		};
		for (const key of ['search', 'navigation', 'legend', 'scale'] as const) {
			// in the order of the grid, not of the format
			expect(new Set<string>(PLACES[key].map((place) => place.value))).toStrictEqual(new Set<string>(positions[key]));
			const cells = PLACES[key].map((place) => place.cell.join());
			expect(new Set(cells).size).toBe(cells.length);
		}
	});

	it('start at the default place when they are shown again', () => {
		expect(defaultPlace('search')).toBe('top-left');
		expect(defaultPlace('navigation')).toBe('top-right');
		expect(defaultPlace('legend')).toBe('bottom-left');
		expect(defaultPlace('scale')).toBe('bottom-left');
	});
});
