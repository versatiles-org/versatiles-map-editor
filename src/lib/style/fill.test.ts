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
		expect(keys).toStrictEqual(['color', 'pattern', 'patternCoverage', 'patternScale']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(layer.color).toBe('#ff0000');
		expect(layer.pattern).toBe('solid');
	});

	it('gives the pattern image in the opaque color, and the opacity of the color on its own', () => {
		// a solid fill has no size and coverage
		layer.patternScale = 2;
		expect(layer.getProperties()).toStrictEqual({ pattern: 'fill-pattern:solid:1:1:#ff0000', opacity: 1 });
		layer.color = '#00FF0080';
		layer.pattern = 'diagonal-up';
		layer.patternCoverage = 0.25;
		expect(layer.getProperties()).toStrictEqual({
			pattern: 'fill-pattern:diagonal-up:2:0.25:#00ff00',
			opacity: 128 / 255
		});
	});

	it('stores the size and the coverage only with a pattern', () => {
		layer.patternScale = 2;
		expect(layer.getState()).toBeUndefined();
		layer.pattern = 'dots';
		expect(layer.getState()).toStrictEqual({ pattern: 'dots', patternScale: 2 });
		layer.patternScale = 1;
		layer.patternCoverage = 0.75;
		expect(layer.getState()).toStrictEqual({ pattern: 'dots', patternCoverage: 0.75 });
	});

	it('reports every change, but not the initial values', () => {
		expect(onChange).not.toHaveBeenCalled();
		layer.color = '#00ff00';
		layer.pattern = 'diagonal-down';
		expect(onChange).toHaveBeenCalledTimes(2);
	});

	it('should return correct state object', () => {
		layer.color = '#00ff0080';
		layer.pattern = 'diagonal-up';

		expect(layer.getState()).toEqual({ color: '#00ff0080', pattern: 'diagonal-up' });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ffcc', pattern: 'diagonal-down' });

		expect(layer.color).toBe('#0000ffcc');
		expect(layer.pattern).toBe('diagonal-down');
	});

	it('should restore the default value', () => {
		layer.patch({ pattern: 'diagonal-up' });
		layer.patch({ pattern: 'solid' });

		expect(layer.pattern).toBe('solid');
	});

	it('gives the fields that a stored style leaves out their defaults', () => {
		layer.setState({ color: '#00ff00', pattern: 'diagonal-up' });
		layer.setState({ color: '#0000ff' });

		expect(layer.color).toBe('#0000ff');
		expect(layer.pattern).toBe('solid');
	});
});

describe('the names of fill pattern images', () => {
	it('hold the pattern, its size and coverage, and the color, in lowercase', () => {
		const name = fillPatternName({ pattern: 'dots', scale: 1.5, coverage: 0.25, color: '#FF0000' });
		expect(name).toBe('fill-pattern:dots:1.5:0.25:#ff0000');
		expect(parseFillPatternName(name)).toStrictEqual({ pattern: 'dots', scale: 1.5, coverage: 0.25, color: '#ff0000' });
		expect(parseFillPatternName('base:icon-airfield')).toBeUndefined();
	});
});
