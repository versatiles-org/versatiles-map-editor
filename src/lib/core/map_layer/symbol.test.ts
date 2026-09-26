import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { get } from 'svelte/store';
import { LABEL_POSITIONS, MapLayerSymbol } from './symbol.js';

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
		expect(get(layer.color)).toBe('#ff0000');
		expect(get(layer.rotate)).toBe(0);
		expect(get(layer.size)).toBe(1);
		expect(get(layer.halo)).toBe(1);
		expect(get(layer.symbolIndex)).toBe(38);
		expect(get(layer.label)).toBe('');
	});

	it('gives its style as feature properties', () => {
		layer.color.set('#00ff00');
		layer.size.set(2);
		layer.symbolIndex.set(1);
		layer.label.set('Price {EUR}');
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
		layer.labelAlign.set(3); // top
		expect(layer.getProperties().position).toBe('bottom');
		expect(LABEL_POSITIONS.bottom).toStrictEqual(['bottom', [0, -0.7]]);
		layer.labelAlign.set(0); // auto
		layer.symbolIndex.set(0); // no image
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
		layer.color.set('#00ff00');
		layer.rotate.set(45);
		layer.size.set(2);
		layer.halo.set(3);
		layer.symbolIndex.set(1);
		layer.label.set('Test Label');
		layer.labelAlign.set(2);

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

		expect(get(layer.color)).toBe('#0000ff');
		expect(get(layer.rotate)).toBe(90);
		expect(get(layer.size)).toBe(3);
		expect(get(layer.halo)).toBe(2);
		expect(get(layer.symbolIndex)).toBe(5);
		expect(get(layer.label)).toBe('New Label');
		expect(get(layer.labelAlign)).toBe(2);
	});

	it('should restore falsy values', () => {
		layer.setState({ halo: 0, rotate: 90, label: 'Label', align: 2 });
		layer.setState({ rotate: 0, label: '', align: 0 });

		expect(get(layer.halo)).toBe(0);
		expect(get(layer.rotate)).toBe(0);
		expect(get(layer.label)).toBe('');
		expect(get(layer.labelAlign)).toBe(0);
	});
});
