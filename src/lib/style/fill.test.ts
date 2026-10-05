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
		expect(layer.pattern).toBe('solid');
	});

	it('gives the pattern image in the opaque color, and the opacity of the color on its own', () => {
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:solid:#ff0000', opacity: 1 });
		layer.color = '#00FF0080';
		layer.pattern = 'diagonal';
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:diagonal:#00ff00', opacity: 128 / 255 });
	});

	it('reports every change, but not the initial values', () => {
		expect(onChange).not.toHaveBeenCalled();
		layer.color = '#00ff00';
		layer.pattern = 'diagonal-thin';
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('should return correct state object', () => {
		layer.color = '#00ff0080';
		layer.pattern = 'diagonal';

		expect(layer.getState()).toEqual({ color: '#00ff0080', pattern: 'diagonal' });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ffcc', pattern: 'diagonal-thin' });

		expect(layer.color).toBe('#0000ffcc');
		expect(layer.pattern).toBe('diagonal-thin');
	});

	it('should restore the default value', () => {
		layer.patch({ pattern: 'diagonal' });
		layer.patch({ pattern: 'solid' });

		expect(layer.pattern).toBe('solid');
	});

	it('gives the fields that a stored style leaves out their defaults', () => {
		layer.setState({ color: '#00ff00', pattern: 'diagonal' });
		layer.setState({ color: '#0000ff' });

		expect(layer.color).toBe('#0000ff');
		expect(layer.pattern).toBe('solid');
	});
});

describe('the names of fill pattern images', () => {
	it('hold the pattern and the color, in lowercase', () => {
		const name = fillPatternName('diagonal', '#FF0000');
		expect(parseFillPatternName(name)).toStrictEqual({ pattern: 'diagonal', color: '#ff0000' });
		expect(parseFillPatternName('base:icon-airfield')).toBeUndefined();
	});
});
