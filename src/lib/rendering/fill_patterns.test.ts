import { describe, expect, it } from 'vitest';
import { addFillPatternImage } from './fill_patterns.js';
import { fillPatternName } from '../map_layer/index.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';

describe('fill pattern images', () => {
	it('are made once per pattern and color, when the map needs them', () => {
		const map = new MockMap();
		const name = fillPatternName(1, '#FF0000');
		expect(addFillPatternImage(map as unknown as MaplibreMap, name)).toBe(true);
		expect(map.addImage).toHaveBeenCalledWith(name, expect.objectContaining({ width: 32, height: 32 }));
		const { data } = map.addImage.mock.calls[0][1] as { data: Uint8ClampedArray };
		// red, with transparent gaps of the diagonal pattern
		expect([...data.slice(0, 4)]).toStrictEqual([255, 0, 0, 0]);
		expect(new Set([...data].filter((_, i) => i % 4 === 3))).toStrictEqual(new Set([0, 102, 255]));

		map.hasImage.mockReturnValue(true);
		addFillPatternImage(map as unknown as MaplibreMap, name);
		expect(map.addImage).toHaveBeenCalledTimes(1);
	});

	it('fill a solid area completely, with the transparency of the color', () => {
		const map = new MockMap();
		addFillPatternImage(map as unknown as MaplibreMap, fillPatternName(0, '#0000ff80'));
		const { data } = map.addImage.mock.calls[0][1] as { data: Uint8ClampedArray };
		expect([...data.slice(0, 4)]).toStrictEqual([0, 0, 255, 128]);
	});

	it('ignore other images', () => {
		expect(addFillPatternImage(new MockMap() as unknown as MaplibreMap, 'base:icon-airfield')).toBe(false);
	});
});
