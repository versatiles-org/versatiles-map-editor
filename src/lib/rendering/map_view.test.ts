import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LngLat, MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { MapView, visibleAreaFeatures } from './map_view.js';

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

	describe('fitArea', () => {
		it('shows the frame with a small padding, the elements with a larger one and a maximum zoom', () => {
			view.fitArea([1, 2, 3, 4], []);
			expect(map.fitBounds).toHaveBeenLastCalledWith(
				[
					[1, 2],
					[3, 4]
				],
				{ animate: false, padding: 10 }
			);
			view.fitArea(undefined, [{ type: 'marker', point: [5, 6] }]);
			expect(map.fitBounds).toHaveBeenLastCalledWith(
				[
					[5, 6],
					[5, 6]
				],
				{ animate: false, padding: 30, maxZoom: 15 }
			);
		});

		it('shows the area again when the size changes, until the map is moved', async () => {
			view.fitArea([1, 2, 3, 4], [], { keep: true });
			expect(map.fitBounds).toHaveBeenCalledTimes(1);
			// a resize of MapLibre fires "movestart" before "resize"
			map.emit('movestart');
			map.emit('resize');
			await Promise.resolve();
			expect(map.fitBounds).toHaveBeenCalledTimes(2);
			// e.g. dragged by the visitor: a move without a resize
			map.emit('movestart');
			await Promise.resolve();
			map.emit('resize');
			expect(map.fitBounds).toHaveBeenCalledTimes(2);
		});

		it('does not show it again without keep, e.g. in the editor', () => {
			view.fitArea([1, 2, 3, 4], []);
			map.emit('resize');
			expect(map.fitBounds).toHaveBeenCalledTimes(1);
		});

		it('keeps the area when the view itself moves the map', () => {
			map.fitBounds.mockImplementation(() => map.emit('movestart'));
			view.fitArea([1, 2, 3, 4], [], { keep: true });
			map.emit('resize');
			map.emit('resize');
			expect(map.fitBounds).toHaveBeenCalledTimes(3);
		});

		it('shows the whole world without frame and elements', () => {
			view.fitArea(undefined, []);
			const [[west, south], [east, north]] = map.fitBounds.mock.lastCall?.[0] as [number, number][];
			expect([west, east]).toStrictEqual([-180, 180]);
			expect(south).toBeCloseTo(-85.05);
			expect(north).toBeCloseTo(85.05);
		});
	});

	describe('visible area', () => {
		it('is a veil around the frame, and its border', () => {
			const [veil, border] = visibleAreaFeatures([1, 2, 3, 4], undefined);
			expect(veil.properties).toStrictEqual({ kind: 'veil' });
			const [world, hole] = (veil.geometry as GeoJSON.Polygon).coordinates;
			expect(world[0]).toStrictEqual([-180, -85.051129]);
			// the hole goes the other way round
			expect(hole).toStrictEqual([
				[1, 2],
				[1, 4],
				[3, 4],
				[3, 2],
				[1, 2]
			]);
			expect(border.properties).toStrictEqual({ kind: 'border' });
		});

		it('is the dashed bounds of the elements without a frame, and nothing without both', () => {
			expect(visibleAreaFeatures(undefined, [1, 2, 3, 4]).map((f) => f.properties?.kind)).toStrictEqual(['bounds']);
			expect(visibleAreaFeatures(undefined, undefined)).toStrictEqual([]);
		});

		it('is written to its source, and removed', () => {
			const setData = vi.fn();
			map.getSource.mockReturnValue({ setData } as never);
			view.showVisibleArea([1, 2, 3, 4], undefined);
			// the veil, the border and 8 handles
			expect(setData.mock.lastCall?.[0].features).toHaveLength(10);
			view.hideVisibleArea();
			expect(setData.mock.lastCall?.[0].features).toStrictEqual([]);
		});
	});

	describe('viewBounds', () => {
		it('is the part of the map within its padding', () => {
			map.getPadding.mockReturnValue({ top: 10, right: 20, bottom: 30, left: 40 });
			// 10 pixels per degree, like on the screen: y grows to the south
			map.unproject.mockImplementation((point) => {
				const [x, y] = point as [number, number];
				return new LngLat(x / 10, -y / 10);
			});
			// the mock map is 800 × 600 pixels
			expect(view.viewBounds()).toStrictEqual([4, -57, 78, -1]);
		});
	});
});
