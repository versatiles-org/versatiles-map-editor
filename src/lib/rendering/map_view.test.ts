import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LngLat, MockMap, Point, type MaplibreMap } from '../__mocks__/map.js';
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

	describe('hold', () => {
		const next = { bearing: 77, pitch: 33 };
		const asked = () => (map.transformCameraUpdate as unknown as (next: object) => object)(next);

		it('keeps the rotation and/or the tilt, whatever moves the map', () => {
			view.hold({ bearing: 30 });
			expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: 30 });
			expect(asked()).toStrictEqual({ bearing: 30 });
			view.hold({ pitch: 0 });
			expect(asked()).toStrictEqual({ pitch: 0 });
			view.hold({ bearing: -20, pitch: 45 });
			expect(map.jumpTo).toHaveBeenLastCalledWith({ bearing: -20, pitch: 45 });
			expect(asked()).toStrictEqual({ bearing: -20, pitch: 45 });
		});

		it('lets the map turn freely again', () => {
			view.hold({ bearing: 30 });
			view.hold({});
			expect(map.transformCameraUpdate).toBeNull();
		});

		it('keeps the center and/or the zoom where the map last showed an area', () => {
			view.fitArea([13.3, 52.45, 13.5, 52.55], []);
			const [center, zoom] = [map.getCenter(), map.getZoom()];
			view.hold({ center: true });
			expect(asked()).toStrictEqual({ center });
			view.hold({ zoom: true });
			expect(asked()).toStrictEqual({ zoom });
			view.hold({ bearing: 10, center: true, zoom: true });
			expect(asked()).toStrictEqual({ bearing: 10, center, zoom });
			view.hold({});
			expect(map.transformCameraUpdate).toBeNull();
		});

		it('lets an area be shown turned', () => {
			view.hold({ bearing: 0, pitch: 0 });
			let whileFitting: object | undefined;
			map.jumpTo.mockImplementationOnce(() => (whileFitting = asked()));
			view.fitArea([13.3, 52.45, 13.5, 52.55], [], { turn: { bearing: 90, pitch: 45 } });
			expect(whileFitting).toStrictEqual({});
			expect(asked()).toStrictEqual({ bearing: 0, pitch: 0 });
		});
	});

	describe('fitArea on a turned map', () => {
		const area: [number, number, number, number] = [13.3, 52.45, 13.5, 52.55];
		const camera = () => map.jumpTo.mock.lastCall![0] as { center: [number, number]; zoom: number };

		it('rotates and tilts the map, and looks at the area', () => {
			view.fitArea(area, [], { turn: { bearing: 90, pitch: 45 } });
			expect(map.fitBounds).not.toHaveBeenCalled();
			expect(map.jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 90, pitch: 45 }));
			const { center, zoom } = camera();
			expect(center[0]).toBeGreaterThan(area[0]);
			expect(center[0]).toBeLessThan(area[2]);
			expect(center[1]).toBeGreaterThan(area[1]);
			expect(center[1]).toBeLessThan(area[3]);
			expect(zoom).toBeGreaterThan(8);
			expect(zoom).toBeLessThan(14);
		});

		it('stays as before on a map that is not turned', () => {
			view.fitArea(area, [], { turn: { bearing: 0, pitch: 0 } });
			expect(map.jumpTo).not.toHaveBeenCalled();
			expect(map.fitBounds).toHaveBeenCalled();
		});

		it('shows the elements not closer than the maximum zoom, and is kept when the map is resized', () => {
			view.fitArea(undefined, [{ type: 'marker', point: [5, 6] }], { keep: true, turn: { bearing: 30 } });
			expect(camera().zoom).toBe(15);
			expect(camera().center[0]).toBeCloseTo(5);
			expect(camera().center[1]).toBeCloseTo(6);
			map.jumpTo.mockClear();
			map.emit('resize');
			expect(map.jumpTo).toHaveBeenLastCalledWith(expect.objectContaining({ bearing: 30, pitch: 0 }));
		});

		it('keeps the area clear of the covered part, e.g. the legend', () => {
			view.fitArea(area, [], { keep: true, turn: { pitch: 30 } });
			const free = camera().zoom;
			// the left half of the window
			view.setCovered({ left: 0, top: 0, right: 400, bottom: 600 });
			expect(camera().zoom).toBeLessThan(free);
		});

		it('stays as large next to a covered part that the turned area does not reach', () => {
			// rotated by an eighth turn, the area is a diamond in the window, with empty corners
			view.fitArea(area, [], { keep: true, turn: { bearing: 45 } });
			const free = camera().zoom;
			view.setCovered({ left: 0, top: 540, right: 80, bottom: 600 });
			expect(camera().zoom).toBe(free);
			// but not next to one that it reaches
			view.setCovered({ left: 0, top: 200, right: 300, bottom: 600 });
			expect(camera().zoom).toBeLessThan(free);
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

		describe('with a covered part, e.g. the legend', () => {
			// the mock map is 800 × 600 pixels; 1 pixel per degree, y to the south
			beforeEach(() => {
				map.project.mockImplementation((lngLat) => {
					const { lng, lat } = LngLat.convert(lngLat);
					return new Point(400 + lng, 300 - lat);
				});
			});
			const lastPadding = () => (map.fitBounds.mock.lastCall![1] as { padding: unknown }).padding;

			it('keeps the area clear of it, beside or below it, whichever shows the area larger', () => {
				// a legend at the left, above the middle, 200 × 90 pixels
				view.setCovered({ left: 10, top: 200, right: 210, bottom: 290 });
				// beside it zooms less than below it
				map.cameraForBounds.mockImplementation((_, options) => ({
					zoom: (options?.padding as { left: number }).left > 10 ? 8 : 9
				}));
				view.fitArea([-300, -80, 300, 80], []);
				expect(map.fitBounds).toHaveBeenCalledTimes(2);
				expect(lastPadding()).toStrictEqual({ top: 300, right: 10, bottom: 10, left: 10 });

				// beside it, if that shows the area larger
				map.cameraForBounds.mockImplementation((_, options) => ({
					zoom: (options?.padding as { left: number }).left > 10 ? 9 : 8
				}));
				view.fitArea([-300, -80, 300, 80], []);
				expect(lastPadding()).toStrictEqual({ top: 10, right: 10, bottom: 10, left: 220 });
			});

			it('fits as usual if the area does not reach under it', () => {
				view.setCovered({ left: 10, top: 10, right: 210, bottom: 110 });
				view.fitArea([0, -50, 50, 50], []);
				expect(map.fitBounds).toHaveBeenCalledTimes(1);
				expect(lastPadding()).toBe(10);
			});

			it('shows a kept area again when it changes', () => {
				view.fitArea([-300, -80, 300, 80], [], { keep: true });
				expect(map.fitBounds).toHaveBeenCalledTimes(1);
				view.setCovered({ left: 590, top: 310, right: 790, bottom: 400 });
				expect(map.fitBounds).toHaveBeenCalledTimes(3);
				// the same again: nothing to do
				view.setCovered({ left: 590, top: 310, right: 790, bottom: 400 });
				expect(map.fitBounds).toHaveBeenCalledTimes(3);
				view.setCovered(undefined);
				expect(map.fitBounds).toHaveBeenCalledTimes(4);
			});
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
