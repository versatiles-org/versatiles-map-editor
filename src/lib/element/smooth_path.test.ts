import { describe, expect, it } from 'vitest';
import { lat2mercator, mercator2lat, type GeoPath, type GeoPoint } from '../geometry.js';
import { curvePoint, smoothPath } from './smooth_path.js';

/** Whether the curve has a point at the place, within a tiny rounding error. */
function passesThrough(curve: GeoPath, [lon, lat]: GeoPoint): boolean {
	return curve.some(([x, y]) => Math.abs(x - lon) < 1e-9 && Math.abs(y - lat) < 1e-9);
}

/** The direction of each piece, in radians, as the map shows it (Mercator). */
function directions(curve: GeoPath): number[] {
	return curve
		.slice(1)
		.map((point, i) =>
			Math.atan2(lat2mercator(point[1]) - lat2mercator(curve[i][1]), ((point[0] - curve[i][0]) * Math.PI) / 180)
		);
}

/** The largest turn between two pieces in a row, in degrees. */
function largestTurn(curve: GeoPath, closed = false): number {
	const angles = directions(closed ? [...curve, curve[0], curve[1]] : curve);
	const turns = angles.slice(1).map((angle, i) => {
		const turn = Math.abs(angle - angles[i]) % (2 * Math.PI);
		return Math.min(turn, 2 * Math.PI - turn);
	});
	return (Math.max(0, ...turns) * 180) / Math.PI;
}

const zigzag: GeoPath = [
	[13.3, 52.5],
	[13.4, 52.55],
	[13.5, 52.5],
	[13.6, 52.55]
];

describe('smoothPath', () => {
	it('passes through every node of a line, from its first to its last', () => {
		const curve = smoothPath(zigzag, false);
		for (const node of zigzag) expect(passesThrough(curve, node)).toBe(true);
		expect(curve[0][0]).toBeCloseTo(13.3, 12);
		expect(curve.at(-1)![0]).toBeCloseTo(13.6, 12);
		// in many short pieces, but not more than 256 per segment
		expect(curve.length).toBeGreaterThan(20);
		expect(curve.length).toBeLessThanOrEqual(3 * 256 + 1);
	});

	it('turns by about 2° at most from one piece to the next', () => {
		expect(largestTurn(smoothPath(zigzag, false))).toBeLessThan(2.5);
		// also at the first node of a ring, where it closes
		const park: GeoPath = [
			[13.3, 52.5],
			[13.4, 52.48],
			[13.5, 52.52],
			[13.45, 52.58],
			[13.33, 52.56]
		];
		expect(largestTurn(smoothPath(park, true), true)).toBeLessThan(2.5);
	});

	it('closes a ring without repeating its first point', () => {
		const ring = smoothPath(zigzag, true);
		for (const node of zigzag) expect(passesThrough(ring, node)).toBe(true);
		expect(passesThrough(ring.slice(1), zigzag[0])).toBe(false);
	});

	it('keeps straight runs as one piece', () => {
		const straight: GeoPath = [
			[13.3, 52.5],
			[13.4, 52.5],
			[13.5, 52.5]
		];
		expect(smoothPath(straight, false)).toHaveLength(3);
		// two nodes are a straight line
		expect(smoothPath(straight.slice(0, 2), false)).toHaveLength(2);
	});

	it('has no gaps or NaNs at nodes at one place', () => {
		const repeated: GeoPath = [zigzag[0], zigzag[1], zigzag[1], zigzag[2]];
		const curve = smoothPath(repeated, false);
		expect(curve.flat().every(Number.isFinite)).toBe(true);
		expect(passesThrough(curve, zigzag[2])).toBe(true);
		expect(smoothPath([zigzag[0], zigzag[0]], false).flat().every(Number.isFinite)).toBe(true);
	});

	it('bends on to the ends of a line like an arc, where an arrowhead points along it', () => {
		// nodes on a circle as the map shows it (Mercator), a quarter turn apart, counterclockwise from east
		const radius = 0.001;
		const y0 = lat2mercator(52.5);
		const onCircle = (angle: number): GeoPoint => [
			13.4 + (radius * Math.cos(angle) * 180) / Math.PI,
			mercator2lat(y0 + radius * Math.sin(angle))
		];
		for (const count of [3, 4]) {
			const angles = Array.from({ length: count }, (_, i) => (i * Math.PI) / 2);
			const pieces = directions(smoothPath(angles.map(onCircle), false));
			// along the circle at both ends: a quarter turn ahead of the direction from its center
			const turn = (angle: number, expected: number) => Math.abs(Math.sin(angle - expected));
			expect(turn(pieces[0], angles[0] + Math.PI / 2)).toBeLessThan(0.03);
			expect(turn(pieces[pieces.length - 1], angles[count - 1] + Math.PI / 2)).toBeLessThan(0.03);
		}
	});

	it('ends straight after a hairpin, and not in a curl', () => {
		// east, and back west just below: the line turns by nearly a half turn at its second node
		const hairpin: GeoPath = [
			[13.3, 52.5],
			[13.5, 52.5],
			[13.3, 52.49]
		];
		const pieces = directions(smoothPath(hairpin, false));
		// both ends along their segments: east, and west a little south
		expect(Math.abs(pieces[0])).toBeLessThan(0.1);
		const last = Math.atan2(lat2mercator(52.49) - lat2mercator(52.5), (-0.2 * Math.PI) / 180);
		expect(Math.abs(Math.sin(pieces[pieces.length - 1] - last))).toBeLessThan(0.1);
	});

	it('keeps a line of two nodes straight', () => {
		const curve = smoothPath(zigzag.slice(0, 2), false);
		expect(curve).toHaveLength(2);
	});

	it('is a new array, since paths are shared', () => {
		const curve = smoothPath(zigzag, false);
		curve[0][0] = 0;
		expect(zigzag[0][0]).toBe(13.3);
		expect(smoothPath([zigzag[0]], false)).not.toBe(zigzag);
	});
});

describe('curvePoint', () => {
	it('is a point of the curve between two nodes', () => {
		expect(curvePoint(zigzag, false, 1, 0)).toStrictEqual(
			smoothPath(zigzag, false).find((p) => passesThrough([p], zigzag[1]))
		);
		const middle = curvePoint(zigzag, false, 0, 0.5);
		// between the nodes, and off their straight segment, since the curve bends there
		expect(middle[0]).toBeGreaterThan(13.3);
		expect(middle[0]).toBeLessThan(13.4);
		expect(Math.abs(middle[1] - 52.525)).toBeGreaterThan(0.001);
		// the node itself if both are at one place
		expect(curvePoint([zigzag[0], zigzag[0]], false, 0, 0.5)[0]).toBeCloseTo(13.3, 12);
	});
});
