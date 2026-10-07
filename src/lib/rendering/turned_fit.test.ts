import { describe, expect, it } from 'vitest';
import type { Bounds } from '@versatiles/map-state';
import { fitTurned, projectTurned, type Box, type TurnedWindow } from './turned_fit.js';

const area: Bounds = [13.3, 52.45, 13.5, 52.55];
const corners: [number, number][] = [
	[area[0], area[1]],
	[area[2], area[1]],
	[area[2], area[3]],
	[area[0], area[3]]
];
const rect: Box = { left: 10, top: 10, right: 790, bottom: 590 };
const window = (turn: Partial<TurnedWindow>): TurnedWindow => ({
	bearing: 0,
	pitch: 0,
	fov: 36.87,
	height: 600,
	focus: [400, 300],
	...turn
});

/** The rectangle around the corners of the area in the window. */
function shown(camera: { center: [number, number]; zoom: number }, turned: TurnedWindow): Box {
	const points = corners.map((corner) => projectTurned(corner, camera, turned)!);
	const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
	return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

describe('projectTurned', () => {
	const camera = { center: [13.4, 52.5] as [number, number], zoom: 10 };

	it('shows the center at the focus, and north at the top of a map that is not turned', () => {
		expect(projectTurned(camera.center, camera, window({}))).toStrictEqual([400, 300]);
		const [x, y] = projectTurned([13.4, 52.6], camera, window({}))!;
		expect(x).toBeCloseTo(400);
		expect(y).toBeLessThan(300);
		// a degree of longitude is 512 × 2^10 / 360 pixels wide
		expect(projectTurned([14.4, 52.5], camera, window({}))![0]).toBeCloseTo(400 + (512 * 1024) / 360);
	});

	it('shows the direction of the bearing at the top', () => {
		// east at the top: a point in the east is above the center, one in the north left of it
		const east = projectTurned([13.5, 52.5], camera, window({ bearing: 90 }))!;
		expect(east[0]).toBeCloseTo(400);
		expect(east[1]).toBeLessThan(300);
		expect(projectTurned([13.4, 52.6], camera, window({ bearing: 90 }))![0]).toBeLessThan(400);
	});

	it('shows what is farther away smaller and nearer to the middle on a tilted map', () => {
		const tilted = window({ pitch: 60 });
		const north = projectTurned([13.4, 52.6], camera, tilted)!;
		const south = projectTurned([13.4, 52.4], camera, tilted)!;
		// the far side is squeezed, the near side stretched
		expect(300 - north[1]).toBeLessThan(south[1] - 300);
		const farEast = projectTurned([13.5, 52.6], camera, tilted)!;
		const nearEast = projectTurned([13.5, 52.4], camera, tilted)!;
		expect(farEast[0] - 400).toBeLessThan(nearEast[0] - 400);
		// far behind the viewer: not shown
		expect(projectTurned([13.4, 40], camera, tilted)).toBeUndefined();
	});
});

describe('fitTurned', () => {
	const turns: Partial<TurnedWindow>[] = [
		{},
		{ bearing: 90 },
		{ bearing: -37 },
		{ pitch: 45 },
		{ bearing: 150, pitch: 60 },
		{ bearing: 20, pitch: 30, focus: [300, 330] }
	];

	it('shows the area completely within the rectangle, in its middle, as large as possible', () => {
		for (const turn of turns) {
			const turned = window(turn);
			const camera = fitTurned(area, turned, rect);
			const box = shown(camera, turned);
			const name = JSON.stringify(turn);
			expect(box.left, name).toBeGreaterThanOrEqual(rect.left - 0.1);
			expect(box.top, name).toBeGreaterThanOrEqual(rect.top - 0.1);
			expect(box.right, name).toBeLessThanOrEqual(rect.right + 0.1);
			expect(box.bottom, name).toBeLessThanOrEqual(rect.bottom + 0.1);
			// in the middle
			expect(box.left - rect.left, name).toBeCloseTo(rect.right - box.right, 0);
			expect(box.top - rect.top, name).toBeCloseTo(rect.bottom - box.bottom, 0);
			// as large as possible: it reaches two opposite edges
			const gap = Math.min(box.left - rect.left, box.top - rect.top);
			expect(gap, name).toBeLessThan(1);
		}
	});

	it('is the camera of a map that is not turned', () => {
		// the area is 0.2° wide, and higher than the rectangle at the zoom where its width would fit:
		// 780 pixels at 512 × 2^zoom / 360 pixels per degree
		const camera = fitTurned(area, window({}), rect);
		expect(camera.center[0]).toBeCloseTo(13.4);
		expect(camera.center[1]).toBeCloseTo(52.5, 1);
		expect(camera.zoom).toBeLessThan(Math.log2((780 / 0.2) * (360 / 512)));
		expect(camera.zoom).toBeGreaterThan(11);
	});

	it('fits a rectangle that is not in the middle of the window', () => {
		const part: Box = { left: 410, top: 10, right: 790, bottom: 590 };
		const turned = window({ bearing: 45, pitch: 40 });
		const box = shown(fitTurned(area, turned, part), turned);
		expect(box.left).toBeGreaterThanOrEqual(part.left - 0.1);
		expect(box.right).toBeLessThanOrEqual(part.right + 0.1);
		expect(box.top).toBeGreaterThanOrEqual(part.top - 0.1);
		expect(box.bottom).toBeLessThanOrEqual(part.bottom + 0.1);
	});

	it('is not closer than the maximum zoom, e.g. for a single point', () => {
		const camera = fitTurned([5, 6, 5, 6], window({ bearing: 30, pitch: 20 }), rect, { maxZoom: 15 });
		expect(camera.zoom).toBe(15);
		expect(camera.center[0]).toBeCloseTo(5);
		expect(camera.center[1]).toBeCloseTo(6);
	});
});
