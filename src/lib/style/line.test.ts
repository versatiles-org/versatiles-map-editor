import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { LineStyle } from './line.svelte.js';

describe('LineStyle', () => {
	let onChange: Mock<() => void>;
	let layer: LineStyle;

	beforeEach(() => {
		onChange = vi.fn();
		layer = new LineStyle(onChange);
	});

	describe('arrowheads', () => {
		let line: LineStyle;
		beforeEach(() => {
			line = new LineStyle(onChange, { canHide: false, arrows: true });
		});

		it('are none by default, and only lines have them', () => {
			expect(line.getArrowProperties()).toBeUndefined();
			layer.arrowEnd = 1;
			layer.patch({ arrowStart: 2, arrowSize: 2 });
			expect([layer.arrowStart, layer.arrowEnd, layer.arrowSize]).toStrictEqual([0, 0, 3]);
			expect(layer.getState()).toBeUndefined();
			expect(onChange).not.toHaveBeenCalled();
		});

		it('are drawn with the width and the color of the line', () => {
			line.setState({ arrowStart: 3, arrowEnd: 1, arrowSize: 2, width: 5, color: '#0000ff' });
			expect(line.getArrowProperties()).toStrictEqual({
				start: 'circle',
				end: 'triangle',
				size: 2,
				width: 5,
				color: 'rgb(0,0,255)'
			});
		});

		it('are stored without the size if there is none', () => {
			line.arrowEnd = 2;
			line.arrowSize = 4;
			expect(line.getState()).toStrictEqual({ arrowEnd: 2, arrowSize: 4 });
			line.arrowEnd = 0;
			expect(line.getState()).toBeUndefined();
			// the size stays for the next arrowhead
			expect(line.arrowSize).toBe(4);
			line.setState({ arrowStart: 1 });
			expect(line.getState()).toStrictEqual({ arrowStart: 1 });
		});
	});

	it('should have the correct keys in default style', () => {
		const keys = Object.keys(LineStyle.defaultStyle).sort();
		expect(keys).toStrictEqual(['color', 'pattern', 'visible', 'width']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(layer.color).toBe('#ff0000');
		expect(layer.dashed).toBe(0);
		expect(layer.visible).toBe(true);
		expect(layer.width).toBe(2);
	});

	it('gives color, width and dash pattern as feature properties', () => {
		layer.color = '#00ff00';
		layer.width = 5;
		layer.dashed = 1;
		expect(layer.getProperties()).toStrictEqual({ color: 'rgb(0,255,0)', width: 5, dash: 1 });
		expect(onChange).toHaveBeenCalledTimes(3);
	});

	it('draws nothing when hidden', () => {
		layer.visible = false;
		expect(layer.getProperties()).toBeUndefined();
	});

	it('should return correct state object', () => {
		layer.color = '#00ff00';
		layer.dashed = 1;
		layer.visible = false;
		layer.width = 4;

		expect(layer.getState()).toEqual({ color: '#00ff00', pattern: 1, visible: false, width: 4 });
	});

	it('should restore state correctly', () => {
		layer.setState({ color: '#0000ff', pattern: 2, width: 3 });

		expect(layer.color).toBe('#0000ff');
		expect(layer.dashed).toBe(2);
		expect(layer.width).toBe(3);
	});

	it('should restore falsy values', () => {
		layer.patch({ visible: false, pattern: 1 });
		layer.patch({ pattern: 0 });

		expect(layer.visible).toBe(false);
		expect(layer.dashed).toBe(0);
	});

	it('gives the fields that a stored style leaves out their defaults', () => {
		layer.setState({ visible: false, pattern: 1, width: 5 });
		layer.setState({ color: '#00ff00' });

		expect(layer.color).toBe('#00ff00');
		expect(layer.visible).toBe(true);
		expect(layer.dashed).toBe(0);
		expect(layer.width).toBe(2);
	});
});
