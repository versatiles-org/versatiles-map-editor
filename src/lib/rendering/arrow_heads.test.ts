import { describe, expect, it } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import type { ArrowProperties } from '../style/index.js';
import {
	addArrowImage,
	arrowHeads,
	arrowImage,
	endDirection,
	headDirection,
	HEAD_WIDTH,
	ROTATE_ZOOMS,
	rotateProperty
} from './arrow_heads.js';

const arrows = (properties: Partial<ArrowProperties>): ArrowProperties => ({
	start: 'none',
	end: 'none',
	size: 3,
	width: 4,
	color: 'rgb(255,0,0)',
	...properties
});

describe('endDirection', () => {
	it('points away from the line, clockwise from east, as the map shows it', () => {
		const east: [number, number][] = [
			[0, 0],
			[1, 0]
		];
		expect(endDirection(east, true)).toBeCloseTo(0);
		expect(endDirection(east, false)).toBeCloseTo(180);
		const north: [number, number][] = [
			[0, 0],
			[0, 1]
		];
		// up on the screen
		expect(endDirection(north, true)).toBeCloseTo(-90);
	});

	it('uses Mercator, whose angles are those on the screen', () => {
		// one degree north is longer than one degree east at 60° in Mercator
		const angle = endDirection(
			[
				[0, 60],
				[1, 61]
			],
			true
		)!;
		expect(angle).toBeLessThan(-45);
		expect(angle).toBeCloseTo((-Math.atan(2 * 1.0055) * 180) / Math.PI, 0);
	});

	it('skips points at the same place, and has none if all are', () => {
		expect(
			endDirection(
				[
					[0, 0],
					[1, 0],
					[1, 0]
				],
				true
			)
		).toBeCloseTo(0);
		expect(
			endDirection(
				[
					[1, 1],
					[1, 1]
				],
				true
			)
		).toBeUndefined();
	});
});

describe('headDirection', () => {
	// at the equator, where a degree is as long to the north as to the east: east, then a short piece north
	const bent: [number, number][] = [
		[0, 0],
		[1, 0],
		[1, 0.001]
	];
	const degrees = (value: number) => (value * Math.PI) / 180;

	it('is the direction at the end point if the head is shorter than the last piece', () => {
		expect(headDirection(bent, true, degrees(0.0005))).toBeCloseTo(-90);
		expect(headDirection(bent, false, degrees(0.5))).toBeCloseTo(180);
		expect(headDirection(bent, true, 0)).toBeCloseTo(-90);
	});

	it('is the direction from where the line enters a longer head', () => {
		// the head reaches back around the corner: 0.001° north of a point 0.001° west
		const direction = headDirection(bent, true, degrees(0.001 * Math.SQRT2));
		expect(direction).toBeCloseTo(-45, 1);
		// much longer than the last piece: nearly along the long one
		expect(headDirection(bent, true, degrees(0.5))).toBeCloseTo(-0.11, 1);
	});

	it('is the direction from the other end of a line that is shorter than the head', () => {
		expect(headDirection(bent, true, degrees(10))).toBeCloseTo(-0.06, 1);
		expect(headDirection([bent[0], bent[0]], true, degrees(10))).toBeUndefined();
	});
});

describe('arrowHeads', () => {
	const path: [number, number][] = [
		[0, 0],
		[1, 0]
	];

	it('has a head at each end that has one', () => {
		expect(arrowHeads(path, arrows({}))).toStrictEqual([]);
		const heads = arrowHeads(path, arrows({ start: 'circle', end: 'chevron' }));
		expect(heads.map(({ point, end, properties }) => [point, end, properties.icon])).toStrictEqual([
			[[0, 0], false, 'arrow-circle'],
			[[1, 0], true, 'arrow-chevron-3']
		]);
		expect(heads[0].properties.rotate).toBeCloseTo(180);
		expect(heads.map((head) => head.properties.offset)).toStrictEqual([0, 0]);
	});

	it('is the size times the width of the line wide', () => {
		const [head] = arrowHeads(path, arrows({ end: 'circle', size: 2.5, width: 4 }));
		expect(head.properties.size * HEAD_WIDTH).toBeCloseTo(10);
		expect(arrowHeads(path, arrows({ end: 'circle', width: 0 }))).toStrictEqual([]);
	});

	it('puts the tip of a triangle beyond the end point, so the round cap of the line is within it', () => {
		for (const size of [1.5, 3, 6]) {
			const [head] = arrowHeads(path, arrows({ end: 'triangle', size, width: 4 }));
			// on the screen: the offset is scaled like the image
			const beyond = head.properties.offset * head.properties.size;
			// the sides of the triangle touch the cap (radius 2): its half angle has a sine of 1/√5
			expect(beyond * (1 / Math.sqrt(5))).toBeCloseTo(2);
		}
	});
});

describe('arrowHeads at the zoom levels', () => {
	const zooms = (properties: object) => Object.keys(properties).filter((key) => /^rotate\d+$/.test(key));

	it('has one direction on a straight line, and for a circle', () => {
		const straight: [number, number][] = [
			[0, 0],
			[1, 0],
			[2, 0]
		];
		const [head] = arrowHeads(straight, arrows({ end: 'triangle' }));
		expect(zooms(head.properties)).toStrictEqual([]);
		const bent: [number, number][] = [...straight, [2, 0.001]];
		expect(zooms(arrowHeads(bent, arrows({ end: 'circle' }))[0].properties)).toStrictEqual([]);
	});

	it('has other directions where the line bends within the head: when zoomed out', () => {
		// east, then 0.001° north, about 111 m: longer than the head (7.5 pixels behind the end point) from zoom 12 on
		const bent: [number, number][] = [
			[0, 0],
			[1, 0],
			[1, 0.001]
		];
		const { properties } = arrowHeads(bent, arrows({ end: 'triangle', size: 3, width: 4 }))[0];
		expect(properties.rotate).toBeCloseTo(-90);
		expect(zooms(properties)).toStrictEqual(Array.from({ length: 12 }, (_, zoom) => rotateProperty(zoom)));
		// nearly along the long piece when zoomed far out, turning to the short one
		expect(properties.rotate0).toBeCloseTo(0, 0);
		expect(properties.rotate11).toBeLessThan(-20);
		expect(properties.rotate11).toBeGreaterThan(-90);
		expect(ROTATE_ZOOMS).toBeGreaterThan(22);
	});
});

describe('arrowImage', () => {
	/** The alpha value at a point of the image, in pixels of the map from the end point. */
	function alphaAt(image: { width: number; height: number; data: Uint8Array }, x: number, y: number): number {
		const column = Math.floor((x + image.width / 4) * 2);
		const row = Math.floor((y + image.height / 4) * 2);
		return image.data[(row * image.width + column) * 4 + 3];
	}

	it('is a distance field, high inside the head, 0.75 on its edge, low outside', () => {
		const triangle = arrowImage('triangle');
		expect(alphaAt(triangle, -HEAD_WIDTH / 2, 0)).toBe(255);
		// the middle of the base
		expect(alphaAt(triangle, -HEAD_WIDTH, 0)).toBeGreaterThan(170);
		expect(alphaAt(triangle, -HEAD_WIDTH, 0)).toBeLessThan(220);
		expect(alphaAt(triangle, HEAD_WIDTH / 2, 0)).toBe(0);
		// the circle around the end point, the chevron's tip on it
		expect(alphaAt(arrowImage('circle'), 0, 0)).toBe(255);
		expect(alphaAt(arrowImage('chevron'), 0, 0)).toBe(255);
		expect(alphaAt(arrowImage('chevron'), -HEAD_WIDTH / 2, 0)).toBe(0);
	});

	it('has a chevron as thick as the line, whatever the size of the head', () => {
		// half of it: from the middle line of an arm outwards, away from the other arm, to its edge
		const thickness = (size: number) => {
			const image = arrowImage('chevron', size);
			let inside = 0;
			// in steps of a quarter pixel of the image, from 4 pixels up and left of the end point
			for (let step = 0; step <= 80; step++) {
				const d = step / 4 / Math.SQRT2;
				if (alphaAt(image, -4 + d, -4 - d) >= 191) inside++;
			}
			// in pixels of the map: the image is drawn `size * width / HEAD_WIDTH` times as large
			return ((2 * inside) / 4) * (size / HEAD_WIDTH);
		};
		// of a line 1 pixel wide
		for (const size of [2, 3, 4, 6]) expect(Math.abs(thickness(size) - 1)).toBeLessThan(0.15);
		// the arms together as wide as the head
		const wide = arrowImage('chevron', 6);
		expect(alphaAt(wide, -9, -9)).toBe(255);
		expect(alphaAt(wide, -9, 9)).toBe(255);
		expect(alphaAt(wide, -9, 0)).toBe(0);
	});

	it('is added to the map as an SDF image when the map asks for it', () => {
		const map = new MockMap();
		expect(addArrowImage(map as unknown as MaplibreMap, 'fill-pattern:diagonal:#ff0000')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-none')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-star')).toBe(false);
		// a chevron only with the size of its head
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-chevron')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-chevron-x')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-triangle-3')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-chevron-2.5')).toBe(true);
		expect(map.addImage).toHaveBeenCalledWith(
			'arrow-chevron-2.5',
			expect.objectContaining({ width: 112, height: 64 }),
			{
				sdf: true,
				pixelRatio: 2
			}
		);
	});
});
