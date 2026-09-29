import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { MapView } from './map_view.js';

describe('MapView', () => {
	let map: MockMap;
	let view: MapView;

	beforeEach(() => {
		map = new MockMap();
		view = new MapView(map as unknown as MaplibreMap);
	});

	describe('fitViewport', () => {
		const shownBounds = () => map.fitBounds.mock.lastCall![0] as [[number, number], [number, number]];

		it('stays within the latitudes of the map near a pole', () => {
			// e.g. a view at zoom 2, centered at 70°N: half its height is about 27.5°
			view.fitViewport({ center: [0, 70], radius: 3_061_000 });
			const [[, south], [, north]] = shownBounds();
			expect(north).toBeCloseTo(85.051129);
			expect(south).toBeCloseTo(42.5, 0);
		});

		it('is at most once around the world wide', () => {
			view.fitViewport({ center: [10, 89.99], radius: 1000 });
			const [[west], [east]] = shownBounds();
			expect(east - west).toBeLessThanOrEqual(360);
		});

		it('does not throw if the map cannot show the viewport', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			map.fitBounds.mockImplementationOnce(() => {
				throw new Error('Invalid LngLat');
			});
			expect(() => view.fitViewport({ center: [0, 0], radius: 1000 })).not.toThrow();
			expect(error).toHaveBeenCalled();
		});
	});
});
