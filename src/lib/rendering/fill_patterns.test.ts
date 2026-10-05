import { describe, expect, it } from 'vitest';
import { type FillPatternName } from '@versatiles/map-state';
import { addFillPatternImage, PATTERN_PIXEL_RATIO, PATTERN_SPACING, patternImage } from './fill_patterns.js';
import { fillPatternName } from '../style/index.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';

const SHAPES: FillPatternName[] = [
	'diagonal-up',
	'diagonal-down',
	'horizontal',
	'vertical',
	'cross',
	'diagonal-cross',
	'dots'
];

/** The opacity of each pixel of the image, from 0 to 1, by row and column. */
function opacities(shape: FillPatternName, scale: number, coverage: number): number[][] {
	const { width, height, data } = patternImage(shape, scale, coverage, '#000000');
	return Array.from({ length: height }, (_, y) =>
		Array.from({ length: width }, (_, x) => data[(y * width + x) * 4 + 3] / 255)
	);
}

const mean = (rows: number[][]) => rows.flat().reduce((sum, value) => sum + value, 0) / rows.flat().length;

describe('fill patterns', () => {
	it('cover as much of the area as their coverage says', () => {
		for (const shape of SHAPES) {
			for (const scale of [0.5, 1, 2, 4]) {
				for (const coverage of [0.05, 0.25, 0.5, 0.75, 0.95]) {
					expect(
						Math.abs(mean(opacities(shape, scale, coverage)) - coverage),
						`${shape} ×${scale} ${coverage}`
					).toBeLessThanOrEqual(0.02);
				}
			}
		}
	});

	it('repeat without a seam', () => {
		// the opacity is the same one pixel along the lines, across the edge of the tile
		const along: Partial<Record<FillPatternName, [number, number]>> = {
			horizontal: [1, 0],
			vertical: [0, 1],
			'diagonal-up': [1, -1],
			'diagonal-down': [1, 1]
		};
		for (const [shape, [dx, dy]] of Object.entries(along) as [FillPatternName, [number, number]][]) {
			const rows = opacities(shape, 1.5, 0.3);
			const size = rows.length;
			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					expect(rows[(y + dy + size) % size][(x + dx) % size], `${shape} at ${x}, ${y}`).toBe(rows[y][x]);
				}
			}
		}
	});

	it('are as large as their scale, the diagonals as far apart across their lines', () => {
		const size = (shape: FillPatternName, scale: number) => patternImage(shape, scale, 0.5, '#000000').width;
		expect(size('horizontal', 1)).toBe(PATTERN_SPACING * PATTERN_PIXEL_RATIO);
		expect(size('dots', 2)).toBe(2 * PATTERN_SPACING * PATTERN_PIXEL_RATIO);
		expect(size('diagonal-up', 1)).toBe(Math.round(PATTERN_SPACING * PATTERN_PIXEL_RATIO * Math.SQRT2));
	});

	it('have lines that get wider with the coverage, not denser', () => {
		const transitions = (rows: number[][]) =>
			rows.map((row) => row[0]).filter((v, i, all) => v > 0.5 !== all[(i + 1) % all.length] > 0.5).length;
		const thin = opacities('horizontal', 1, 0.25);
		const thick = opacities('horizontal', 1, 0.75);
		// one line per tile, from one edge into the other
		expect(transitions(thin)).toBe(transitions(thick));
		expect(mean(thick)).toBeGreaterThan(mean(thin));
	});
});

describe('fill pattern images', () => {
	it('are made once per pattern and color, when the map needs them', () => {
		const map = new MockMap();
		const name = fillPatternName({ pattern: 'diagonal-up', scale: 1, coverage: 0.5, color: '#FF0000' });
		expect(addFillPatternImage(map as unknown as MaplibreMap, name)).toBe(true);
		expect(map.addImage).toHaveBeenCalledWith(name, expect.objectContaining({ width: 23, height: 23 }), {
			pixelRatio: 2
		});
		const { data } = map.addImage.mock.calls[0][1] as { data: Uint8ClampedArray };
		// red, half of it covered
		expect([...data.slice(0, 3)]).toStrictEqual([255, 0, 0]);
		const alphas = [...data].filter((_, i) => i % 4 === 3);
		expect(alphas.reduce((sum, a) => sum + a, 0) / alphas.length / 255).toBeCloseTo(0.5, 1);

		map.hasImage.mockReturnValue(true);
		addFillPatternImage(map as unknown as MaplibreMap, name);
		expect(map.addImage).toHaveBeenCalledTimes(1);
	});

	it('have the size and the coverage of their name', () => {
		const map = new MockMap();
		const name = fillPatternName({ pattern: 'dots', scale: 2, coverage: 0.25, color: '#000000' });
		addFillPatternImage(map as unknown as MaplibreMap, name);
		expect(map.addImage).toHaveBeenCalledWith(name, expect.objectContaining({ width: 32, height: 32 }), {
			pixelRatio: 2
		});
		const { data } = map.addImage.mock.calls[0][1] as { data: Uint8ClampedArray };
		const alphas = [...data].filter((_, i) => i % 4 === 3);
		expect(alphas.reduce((sum, a) => sum + a, 0) / alphas.length / 255).toBeCloseTo(0.25, 1);
	});

	it('fill a solid area completely, with the transparency of the color', () => {
		const map = new MockMap();
		addFillPatternImage(
			map as unknown as MaplibreMap,
			fillPatternName({ pattern: 'solid', scale: 1, coverage: 1, color: '#0000ff80' })
		);
		const { data } = map.addImage.mock.calls[0][1] as { data: Uint8ClampedArray };
		expect(new Set([...data].filter((_, i) => i % 4 === 3))).toStrictEqual(new Set([128]));
	});

	it('ignore other images', () => {
		expect(addFillPatternImage(new MockMap() as unknown as MaplibreMap, 'base:icon-airfield')).toBe(false);
	});
});
