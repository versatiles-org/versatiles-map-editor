import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { get } from 'svelte/store';
import { MapLayerLine } from './line.js';

describe('MapLayerLine', () => {
	let onChange: Mock<() => void>;
	let layer: MapLayerLine;

	beforeEach(() => {
		onChange = vi.fn();
		layer = new MapLayerLine(onChange);
	});

	it('should have the correct keys in default style', () => {
		const keys = Object.keys(MapLayerLine.defaultStyle).sort();
		expect(keys).toStrictEqual(['color', 'pattern', 'visible', 'width']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(get(layer.color)).toBe('#ff0000');
		expect(get(layer.dashed)).toBe(0);
		expect(get(layer.visible)).toBe(true);
		expect(get(layer.width)).toBe(2);
	});

	it('gives color, width and dash pattern as feature properties', () => {
		layer.color.set('#00ff00');
		layer.width.set(5);
		layer.dashed.set(1);
		expect(layer.getProperties()).toStrictEqual({ color: 'rgb(0,255,0)', width: 5, dash: 1 });
		expect(onChange).toHaveBeenCalledTimes(3);
	});

	it('draws nothing when hidden', () => {
		layer.visible.set(false);
		expect(layer.getProperties()).toBeUndefined();
	});

	it('should return correct state object', () => {
		layer.color.set('#00ff00');
		layer.dashed.set(1);
		layer.visible.set(false);
		layer.width.set(4);

		expect(layer.getState()).toEqual({ color: '#00ff00', pattern: 1, visible: false, width: 4 });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ff', pattern: 2, width: 3 });

		expect(get(layer.color)).toBe('#0000ff');
		expect(get(layer.dashed)).toBe(2);
		expect(get(layer.width)).toBe(3);
	});

	it('should restore falsy values', () => {
		layer.setState({ visible: false, pattern: 1 });
		layer.setState({ pattern: 0 });

		expect(get(layer.visible)).toBe(false);
		expect(get(layer.dashed)).toBe(0);
	});
});
