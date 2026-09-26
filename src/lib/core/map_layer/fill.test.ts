import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { get } from 'svelte/store';
import { addFillPatternImage, fillPatternName, MapLayerFill } from './fill.js';
import { MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';

describe('MapLayerFill', () => {
	let onChange: Mock<() => void>;
	let layer: MapLayerFill;

	beforeEach(() => {
		onChange = vi.fn();
		layer = new MapLayerFill(onChange);
	});

	it('should have the correct keys in default style', () => {
		const keys = Object.keys(MapLayerFill.defaultStyle).sort();
		expect(keys).toStrictEqual(['color', 'opacity', 'pattern']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(get(layer.color)).toBe('#ff0000');
		expect(get(layer.opacity)).toBe(1);
		expect(get(layer.pattern)).toBe(0);
	});

	it('gives the pattern image and the opacity as feature properties', () => {
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:0:#ff0000', opacity: 1 });
		layer.color.set('#00FF00');
		layer.pattern.set(1);
		layer.opacity.set(0.5);
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:1:#00ff00', opacity: 0.5 });
	});

	it('reports every change, but not the initial values', () => {
		expect(onChange).not.toHaveBeenCalled();
		layer.color.set('#00ff00');
		layer.pattern.set(2);
		layer.opacity.set(0.3);
		expect(onChange).toHaveBeenCalledTimes(3);
	});

	it('should return correct state object', () => {
		layer.color.set('#00ff00');
		layer.opacity.set(0.5);
		layer.pattern.set(1);

		expect(layer.getState()).toEqual({ color: '#00ff00', opacity: 0.5, pattern: 1 });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ff', opacity: 0.8, pattern: 2 });

		expect(get(layer.color)).toBe('#0000ff');
		expect(get(layer.opacity)).toBe(0.8);
		expect(get(layer.pattern)).toBe(2);
	});

	it('should restore falsy values', () => {
		layer.setState({ opacity: 0, pattern: 1 });
		layer.setState({ pattern: 0 });

		expect(get(layer.opacity)).toBe(0);
		expect(get(layer.pattern)).toBe(0);
	});
});

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
