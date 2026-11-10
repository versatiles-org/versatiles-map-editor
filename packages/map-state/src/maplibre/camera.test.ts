import { describe, expect, it } from 'vitest';
import type { Bounds, MapState } from '../types.js';
import { constrainToWorld, fitFlat, mapCamera } from './camera.js';
import { MAX_LATITUDE } from './geometry.js';
import { fitTurned, projectTurned, type Box } from './turned_fit.js';

const berlin: Bounds = [13.3, 52.45, 13.5, 52.55];
const world: Bounds = [-180, -MAX_LATITUDE, 180, MAX_LATITUDE];
const size = { width: 800, height: 600 };

describe('fitFlat', () => {
	it('shows the whole world at zoom 0 in 512 × 512 pixels, the size of its tile', () => {
		const { center, zoom } = fitFlat(world, { left: 0, top: 0, right: 512, bottom: 512 });
		expect(zoom).toBeCloseTo(0, 6);
		expect(center[0]).toBeCloseTo(0, 6);
		expect(center[1]).toBeCloseTo(0, 6);
	});

	it('fits as the turned fit does on a map that is not turned', () => {
		for (const rect of [
			{ left: 20, top: 20, right: 780, bottom: 580 },
			{ left: 300, top: 40, right: 780, bottom: 400 }
		] satisfies Box[]) {
			for (const area of [berlin, [-20, -60, 40, 70] as Bounds, [100, 10, 101, 10.1] as Bounds]) {
				const flat = fitFlat(area, rect);
				const focus: [number, number] = [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2];
				const turned = fitTurned(area, { bearing: 0, pitch: 0, fov: 36.87, height: 600, focus }, rect);
				expect(flat.zoom).toBeCloseTo(turned.zoom, 3);
				expect(flat.center[0]).toBeCloseTo(turned.center[0], 4);
				expect(flat.center[1]).toBeCloseTo(turned.center[1], 4);
			}
		}
	});

	it('keeps to the zoom limits, e.g. for a single point', () => {
		const rect = { left: 0, top: 0, right: 800, bottom: 600 };
		expect(fitFlat([13.4, 52.5, 13.4, 52.5], rect)).toStrictEqual({
			center: [expect.closeTo(13.4, 9), expect.closeTo(52.5, 9)],
			zoom: 22
		});
		expect(fitFlat([13.4, 52.5, 13.4, 52.5], rect, { maxZoom: 15 }).zoom).toBe(15);
		expect(fitFlat(world, rect, { minZoom: 3 }).zoom).toBe(3);
		// a window too small for anything
		expect(fitFlat(berlin, { left: 10, top: 10, right: 5, bottom: 5 }, { minZoom: 1 }).zoom).toBe(1);
	});
});

describe('constrainToWorld', () => {
	const screen = { width: 780, height: 580 };

	it('zooms in until the world fills the window, in its middle where it is too small', () => {
		const { center, zoom } = constrainToWorld({ center: [30, 40], zoom: 0 }, screen);
		expect(zoom).toBeCloseTo(Math.log2(780 / 512), 9);
		// wide enough now, but not high enough to move away from the middle: 780 > 580
		expect(center[0]).toBeCloseTo(0, 9);
		expect(center[1]).toBeCloseTo(0, 9);
		expect(constrainToWorld({ center: [0, 0], zoom: 1 }, { width: 900, height: 1200 }).zoom).toBeCloseTo(
			Math.log2(1200 / 512),
			9
		);
	});

	it('else moves the map until nothing beyond the world is shown', () => {
		const { center, zoom } = constrainToWorld({ center: [179, 85], zoom: 3 }, screen);
		expect(zoom).toBe(3);
		// the window's half width and height from the edges of the world
		const worldSize = 512 * 2 ** 3;
		expect(center[0]).toBeCloseTo(((worldSize - 390) / worldSize) * 360 - 180, 9);
		expect(center[1]).toBeLessThan(85);
		const inside = constrainToWorld({ center: [13.4, 52.5], zoom: 10 }, screen);
		expect(inside.center[0]).toBeCloseTo(13.4, 9);
		expect(inside.center[1]).toBeCloseTo(52.5, 9);
	});
});

describe('mapCamera', () => {
	const marker = (point: [number, number]) => ({ type: 'marker' as const, point });

	it('shows the frame with the padding of the map and of a frame, north up and from above', () => {
		const state: MapState = { frame: { bounds: berlin }, elements: [marker([0, 0])] };
		expect(mapCamera(state, size)).toStrictEqual({
			...fitFlat(berlin, { left: 20, top: 20, right: 780, bottom: 580 }),
			bearing: 0,
			pitch: 0
		});
	});

	it('else all elements, with the larger padding for the symbols, and not closer than zoom 15', () => {
		const elements = [marker([13.3, 52.45]), marker([13.5, 52.55])];
		expect(mapCamera({ elements }, size)).toStrictEqual({
			...fitFlat(berlin, { left: 40, top: 40, right: 760, bottom: 560 }),
			bearing: 0,
			pitch: 0
		});
		const single = mapCamera({ elements: [marker([13.4, 52.5])] }, size);
		expect(single.zoom).toBe(15);
		expect(single.center[0]).toBeCloseTo(13.4, 9);
		expect(single.center[1]).toBeCloseTo(52.5, 9);
	});

	it('else the whole world, as wide as the window without the padding of the map, as MapLibre keeps it', () => {
		const camera = mapCamera({ elements: [] }, size);
		expect(camera.zoom).toBeCloseTo(Math.log2(780 / 512), 9);
		expect(camera.center[0]).toBeCloseTo(0, 9);
		expect(camera.center[1]).toBeCloseTo(0, 9);
	});

	it('within the zoom limits of the viewer', () => {
		const viewer = { minZoom: 3, maxZoom: 12 };
		expect(mapCamera({ elements: [marker([13.4, 52.5])], meta: { viewer } }, size).zoom).toBe(12);
		expect(mapCamera({ elements: [], meta: { viewer } }, size).zoom).toBe(3);
		// a frame may be shown closer than elements, up to the viewer's limit
		const tiny: Bounds = [13.4, 52.5, 13.4001, 52.5001];
		expect(mapCamera({ frame: { bounds: tiny }, elements: [] }, size).zoom).toBeGreaterThan(15);
		expect(mapCamera({ frame: { bounds: tiny }, elements: [], meta: { viewer } }, size).zoom).toBe(12);
	});

	it('rotated and tilted as the frame says, with the area completely in the window, as large as it can be', () => {
		const camera = mapCamera({ frame: { bounds: berlin, bearing: 30, pitch: 45 }, elements: [] }, size);
		expect(camera).toMatchObject({ bearing: 30, pitch: 45 });
		const window = { bearing: 30, pitch: 45, fov: 36.87, height: 600, focus: [400, 300] as [number, number] };
		const [west, south, east, north] = berlin;
		const corners: [number, number][] = [
			[west, south],
			[east, south],
			[east, north],
			[west, north]
		];
		const shown = corners.map((corner) => projectTurned(corner, camera, window)!);
		const [xs, ys] = [shown.map(([x]) => x), shown.map(([, y]) => y)];
		for (const x of xs) expect(x).toBeGreaterThanOrEqual(20 - 0.1);
		for (const x of xs) expect(x).toBeLessThanOrEqual(780 + 0.1);
		for (const y of ys) expect(y).toBeGreaterThanOrEqual(20 - 0.1);
		for (const y of ys) expect(y).toBeLessThanOrEqual(580 + 0.1);
		// touching the padding on two opposite sides
		const touches = (a: number, b: number) => Math.abs(a - b) < 1;
		expect(
			(touches(Math.min(...xs), 20) && touches(Math.max(...xs), 780)) ||
				(touches(Math.min(...ys), 20) && touches(Math.max(...ys), 580))
		).toBe(true);
	});

	it('turns the elements too, for a frame without its area', () => {
		const elements = [marker([13.3, 52.45]), marker([13.5, 52.55])];
		const camera = mapCamera({ frame: { bearing: 90 }, elements }, size);
		expect(camera.bearing).toBe(90);
		// east at the top: the area is taller than wide, so it is shown smaller than north up
		expect(camera.zoom).toBeLessThan(mapCamera({ elements }, size).zoom);
	});
});
