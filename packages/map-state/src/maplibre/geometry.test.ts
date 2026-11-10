import { describe, expect, it } from 'vitest';
import type { Position } from '../types.js';
import { circle, distance, lat2mercator, mercator2lat } from './geometry.js';

describe('geometry', () => {
	it('converts a latitude to Mercator and back', () => {
		expect(lat2mercator(0)).toBeCloseTo(0);
		expect(lat2mercator(85.051128)).toBeCloseTo(Math.PI);
		expect(lat2mercator(-85.051128)).toBeCloseTo(-Math.PI);
		expect(mercator2lat(lat2mercator(52.5))).toBeCloseTo(52.5, 10);
	});

	it('measures the distance between two positions', () => {
		const berlin: Position = [13.405, 52.52];
		const paris: Position = [2.3522, 48.8566];
		expect(distance(berlin, paris)).toBeCloseTo(877464.54);
	});

	it('makes the ring of a circle with its number of steps, each at the radius', () => {
		const center: Position = [0, 0];
		const radius = 1000;
		const steps = 36;
		const points = circle(center, radius, steps);
		expect(points.length).toBe(steps);
		// every point at the radius from the center, also away from the equator
		for (const point of points) expect(distance(center, point)).toBeCloseTo(radius, 3);
		for (const point of circle([13.4, 52.5], radius, steps)) {
			expect(distance([13.4, 52.5], point)).toBeCloseTo(radius, 3);
		}
	});
});
