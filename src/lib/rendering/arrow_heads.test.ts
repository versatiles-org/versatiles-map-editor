import { describe, expect, it } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import type { ArrowProperties } from '../style/index.js';
import { addArrowImage, arrowHeads, arrowImage, endDirection, HEAD_WIDTH } from './arrow_heads.js';

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
			[[1, 0], true, 'arrow-chevron']
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

	it('is added to the map as an SDF image when the map asks for it', () => {
		const map = new MockMap();
		expect(addArrowImage(map as unknown as MaplibreMap, 'fill-pattern:1:#ff0000')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-none')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-star')).toBe(false);
		expect(addArrowImage(map as unknown as MaplibreMap, 'arrow-chevron')).toBe(true);
		expect(map.addImage).toHaveBeenCalledWith('arrow-chevron', expect.objectContaining({ width: 112, height: 64 }), {
			sdf: true,
			pixelRatio: 2
		});
	});
});
