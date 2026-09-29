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
		expect(keys).toStrictEqual(['color', 'opacity', 'pattern']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(layer.color).toBe('#ff0000');
		expect(layer.opacity).toBe(1);
		expect(layer.pattern).toBe(0);
	});

	it('gives the pattern image and the opacity as feature properties', () => {
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:0:#ff0000', opacity: 1 });
		layer.color = '#00FF00';
		layer.pattern = 1;
		layer.opacity = 0.5;
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:1:#00ff00', opacity: 0.5 });
	});

	it('reports every change, but not the initial values', () => {
		expect(onChange).not.toHaveBeenCalled();
		layer.color = '#00ff00';
		layer.pattern = 2;
		layer.opacity = 0.3;
		expect(onChange).toHaveBeenCalledTimes(3);
	});

	it('should return correct state object', () => {
		layer.color = '#00ff00';
		layer.opacity = 0.5;
		layer.pattern = 1;

		expect(layer.getState()).toEqual({ color: '#00ff00', opacity: 0.5, pattern: 1 });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ff', opacity: 0.8, pattern: 2 });

		expect(layer.color).toBe('#0000ff');
		expect(layer.opacity).toBe(0.8);
		expect(layer.pattern).toBe(2);
	});

	it('should restore falsy values', () => {
		layer.setState({ opacity: 0, pattern: 1 });
		layer.setState({ pattern: 0 });

		expect(layer.opacity).toBe(0);
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
