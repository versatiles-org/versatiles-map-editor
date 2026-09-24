import { describe, it, expect } from 'vitest';
import { circle, distance, getMiddlePoint, lat2mercator, mercator2lat } from './geometry.js';
import type { GeoPoint } from './types.js';
import { degreesToRadians, radiansToDegrees } from './geometry.js';

describe('Geometry Utils', () => {
	it('should convert latitude to Mercator projection correctly', () => {
		expect(lat2mercator(0)).toBeCloseTo(0); // Equator should map to 0
		expect(lat2mercator(85.051128)).toBeCloseTo(Math.PI);
		expect(lat2mercator(-85.051128)).toBeCloseTo(-Math.PI);
	});

	it('should convert Mercator projection back to latitude correctly', () => {
		expect(mercator2lat(0)).toBeCloseTo(0);
		expect(mercator2lat(lat2mercator(45))).toBeCloseTo(45, 5);
		expect(mercator2lat(lat2mercator(-30))).toBeCloseTo(-30, 5);
	});

	it('should get the middle point correctly', () => {
		const p0: GeoPoint = [0, 0];
		const p1: GeoPoint = [10, 10];
		const middle = getMiddlePoint(p0, p1);

		expect(middle[0]).toBeCloseTo(5);
		expect(middle[1]).toBeCloseTo(mercator2lat((lat2mercator(0) + lat2mercator(10)) / 2));
	});

	it('should calculate distance between two points correctly', () => {
		const berlin: GeoPoint = [13.405, 52.52];
		const paris: GeoPoint = [2.3522, 48.8566];
		const d = distance(berlin, paris);
		expect(d).toBeCloseTo(877464.54);
	});

	it('should convert degrees to radians and back', () => {
		expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
		expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
		expect(radiansToDegrees(Math.PI)).toBeCloseTo(180);
		expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90);
	});

	it('should generate a circle with correct number of steps', () => {
		const center: GeoPoint = [0, 0];
		const radius = 1000; // meters
		const steps = 36;
		const points = circle(center, radius, steps);
		expect(points.length).toBe(steps);
		points.forEach((pt) => {
			expect(Array.isArray(pt)).toBe(true);
			expect(pt.length).toBe(2);
		});
	});
});
