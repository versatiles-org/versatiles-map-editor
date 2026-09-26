import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { LABEL_POSITIONS, MapLayerSymbol } from './symbol.svelte.js';

describe('MapLayerSymbol', () => {
	let onChange: Mock<() => void>;
	let layer: MapLayerSymbol;

	beforeEach(() => {
		onChange = vi.fn();
		layer = new MapLayerSymbol(onChange);
	});

	it('should have the correct keys in default style', () => {
		const keys = Object.keys(MapLayerSymbol.defaultStyle).sort();
		expect(keys).toStrictEqual(['align', 'color', 'halo', 'label', 'pattern', 'rotate', 'size']);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(layer.color).toBe('#ff0000');
		expect(layer.rotate).toBe(0);
		expect(layer.size).toBe(1);
		expect(layer.halo).toBe(1);
		expect(layer.symbolIndex).toBe(38);
		expect(layer.label).toBe('');
	});

	it('gives its style as feature properties', () => {
		layer.color = '#00ff00';
		layer.size = 2;
		layer.symbolIndex = 1;
		layer.label = 'Price {EUR}';
		expect(layer.getProperties()).toStrictEqual({
			icon: 'base:icon-airfield',
			symbol: 1,
			color: 'rgb(0,255,0)',
			rotate: 0,
			size: 2,
			halo: 1,
			// as it is: the layer reads it as a property, so "{…}" is not replaced
			label: 'Price {EUR}',
			position: 'auto'
		});
		expect(onChange).toHaveBeenCalledTimes(4);
	});

	it('places the label at the chosen side, or also on a symbol without image', () => {
		layer.labelAlign = 3; // top
		expect(layer.getProperties().position).toBe('bottom');
		expect(LABEL_POSITIONS.bottom).toStrictEqual(['bottom', [0, -0.7]]);
		layer.labelAlign = 0; // auto
		layer.symbolIndex = 0; // no image
		expect(layer.getProperties().position).toBe('auto-center');
		expect(LABEL_POSITIONS['auto-center'].filter((a) => typeof a === 'string')).toStrictEqual([
			'center',
			'left',
			'right',
			'top',
			'bottom'
		]);
	});

	it('should return correct state object', () => {
		layer.color = '#00ff00';
		layer.rotate = 45;
		layer.size = 2;
		layer.halo = 3;
		layer.symbolIndex = 1;
		layer.label = 'Test Label';
		layer.labelAlign = 2;

		expect(layer.getState()).toEqual({
			color: '#00ff00',
			rotate: 45,
			size: 2,
			halo: 3,
			pattern: 1,
			label: 'Test Label',
			align: 2
		});
	});

	it('should restore state correctly', () => {
		layer.setState({
			color: '#0000ff',
			rotate: 90,
			size: 3,
			halo: 2,
			pattern: 5,
			label: 'New Label',
			align: 2
		});

		expect(layer.color).toBe('#0000ff');
		expect(layer.rotate).toBe(90);
		expect(layer.size).toBe(3);
		expect(layer.halo).toBe(2);
		expect(layer.symbolIndex).toBe(5);
		expect(layer.label).toBe('New Label');
		expect(layer.labelAlign).toBe(2);
	});

	it('should restore falsy values', () => {
		layer.setState({ halo: 0, rotate: 90, label: 'Label', align: 2 });
		layer.setState({ rotate: 0, label: '', align: 0 });

		expect(layer.halo).toBe(0);
		expect(layer.rotate).toBe(0);
		expect(layer.label).toBe('');
		expect(layer.labelAlign).toBe(0);
	});
});
