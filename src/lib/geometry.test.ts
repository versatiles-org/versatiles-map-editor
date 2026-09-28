import { describe, it, expect } from 'vitest';
import {
	circle,
	circleArea,
	coordinatesOf,
	distance,
	getMiddlePoint,
	lat2mercator,
	movePoint,
	pathLength,
	polygonArea
} from './geometry.js';
import type { GeoPoint } from './types.js';

// the mean radius of the Earth in meters, as in the module
const EARTH_RADIUS = 6371008.8;

describe('Geometry Utils', () => {
	it('should convert latitude to Mercator projection correctly', () => {
		expect(lat2mercator(0)).toBeCloseTo(0); // Equator should map to 0
		expect(lat2mercator(85.051128)).toBeCloseTo(Math.PI);
		expect(lat2mercator(-85.051128)).toBeCloseTo(-Math.PI);
	});

	it('should move a point in Mercator units, and back', () => {
		expect(movePoint([10, 45], 0, 0)).toStrictEqual([10, expect.closeTo(45, 5)]);
		const moved = movePoint([10, -30], 5, lat2mercator(45) - lat2mercator(-30));
		expect(moved[0]).toBe(15);
		expect(moved[1]).toBeCloseTo(45, 5);
		expect(movePoint(moved, -5, lat2mercator(-30) - lat2mercator(45))[1]).toBeCloseTo(-30, 5);
	});

	it('should get the middle point correctly', () => {
		const p0: GeoPoint = [0, 0];
		const p1: GeoPoint = [10, 10];
		const middle = getMiddlePoint(p0, p1);

		expect(middle[0]).toBeCloseTo(5);
		// halfway on the map, i.e. in Mercator units
		expect(lat2mercator(middle[1])).toBeCloseTo((lat2mercator(0) + lat2mercator(10)) / 2);
	});

	it('should calculate distance between two points correctly', () => {
		const berlin: GeoPoint = [13.405, 52.52];
		const paris: GeoPoint = [2.3522, 48.8566];
		const d = distance(berlin, paris);
		expect(d).toBeCloseTo(877464.54);
	});

	it('should generate a circle with correct number of steps', () => {
		const center: GeoPoint = [0, 0];
		const radius = 1000; // meters
		const steps = 36;
		const points = circle(center, radius, steps);
		expect(points.length).toBe(steps);
		// every point at the radius from the center, also away from the equator
		for (const point of points) expect(distance(center, point)).toBeCloseTo(radius, 3);
		for (const point of circle([13.4, 52.5], radius, steps)) {
			expect(distance([13.4, 52.5], point)).toBeCloseTo(radius, 3);
		}
	});

	it('should calculate the length of a path', () => {
		expect(pathLength([])).toBe(0);
		expect(pathLength([[0, 0]])).toBe(0);
		expect(
			pathLength([
				[0, 0],
				[1, 0],
				[1, 1]
			])
		).toBeCloseTo(222390.16, 1);
	});

	it('should calculate the area of a polygon', () => {
		const square: GeoPoint[] = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		];
		expect(polygonArea(square)).toBeCloseTo(12363718145, -1);
		// independent of the winding order
		expect(polygonArea([...square].reverse())).toBeCloseTo(12363718145, -1);
		expect(polygonArea(square.slice(0, 2))).toBe(0);
	});

	it('should calculate the area of a circle', () => {
		expect(circleArea(0)).toBe(0);
		expect(circleArea(1000)).toBeCloseTo(Math.PI * 1000 * 1000, 0);
		// a hemisphere
		expect(circleArea((Math.PI / 2) * EARTH_RADIUS)).toBeCloseTo(2 * Math.PI * EARTH_RADIUS ** 2, -3);
	});
});

describe('coordinatesOf', () => {
	it('returns all positions of a geometry', () => {
		expect(coordinatesOf({ type: 'Point', coordinates: [1, 2] })).toStrictEqual([[1, 2]]);
		expect(
			coordinatesOf({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[0, 1]
					]
				]
			})
		).toStrictEqual([
			[0, 0],
			[1, 0],
			[0, 1]
		]);
	});
});
