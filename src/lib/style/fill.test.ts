import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { fillPatternName, FillStyle, parseFillPatternName } from './fill.svelte.js';

describe('FillStyle', () => {
	let onChange: Mock<() => void>;
	let layer: FillStyle;

	beforeEach(() => {
		onChange = vi.fn();
		layer = new FillStyle(onChange);
	});

	it('should have the correct keys in default style', () => {
		const keys = Object.keys(FillStyle.defaultStyle).sort();
		expect(keys).toStrictEqual(['color', 'pattern']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(layer.color).toBe('#ff0000');
		expect(layer.pattern).toBe(0);
	});

	it('gives the pattern image in the opaque color, and the opacity of the color on its own', () => {
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:0:#ff0000', opacity: 1 });
		layer.color = '#00FF0080';
		layer.pattern = 1;
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:1:#00ff00', opacity: 128 / 255 });
	});

	it('reports every change, but not the initial values', () => {
		expect(onChange).not.toHaveBeenCalled();
		layer.color = '#00ff00';
		layer.pattern = 2;
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('should return correct state object', () => {
		layer.color = '#00ff0080';
		layer.pattern = 1;

		expect(layer.getState()).toEqual({ color: '#00ff0080', pattern: 1 });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ffcc', pattern: 2 });

		expect(layer.color).toBe('#0000ffcc');
		expect(layer.pattern).toBe(2);
	});

	it('should restore falsy values', () => {
		layer.patch({ pattern: 1 });
		layer.patch({ pattern: 0 });

		expect(layer.pattern).toBe(0);
	});

	it('gives the fields that a stored style leaves out their defaults', () => {
		layer.setState({ color: '#00ff00', pattern: 1 });
		layer.setState({ color: '#0000ff' });

		expect(layer.color).toBe('#0000ff');
		expect(layer.pattern).toBe(0);
	});
});

describe('the names of fill pattern images', () => {
	it('hold the pattern and the color, in lowercase', () => {
		const name = fillPatternName(1, '#FF0000');
		expect(parseFillPatternName(name)).toStrictEqual({ pattern: 1, color: '#ff0000' });
		expect(parseFillPatternName('base:icon-airfield')).toBeUndefined();
	});
});
