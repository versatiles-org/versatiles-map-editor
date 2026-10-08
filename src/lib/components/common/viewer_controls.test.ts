import { describe, expect, it } from 'vitest';
import { VIEWER_CHOICES } from '@versatiles/map-state';
import { defaultPlace, PLACES } from './viewer_controls.js';

describe('the places of the controls of the viewer', () => {
	it('are all choices of the format but "none", each in a cell of its own', () => {
		for (const key of ['search', 'navigation', 'legend', 'scale'] as const) {
			// in the order of the grid, not of the format
			expect(new Set(PLACES[key].map((place) => place.value))).toStrictEqual(
				new Set(VIEWER_CHOICES[key].filter((c) => c !== 'none'))
			);
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
