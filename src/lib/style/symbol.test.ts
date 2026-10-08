import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { iconBox, LABEL_PLACES, labelPlaceTable, SymbolStyle } from './symbol.svelte.js';
import { getSymbol, type SymbolInfo } from '../background/symbols_catalog.js';

describe('SymbolStyle', () => {
	let onChange: Mock<() => void>;
	let layer: SymbolStyle;

	beforeEach(() => {
		onChange = vi.fn();
		layer = new SymbolStyle(onChange);
	});

	it('should have the correct keys in default style', () => {
		const keys = Object.keys(SymbolStyle.defaultStyle).sort();
		expect(keys).toStrictEqual([
			'color',
			'flat',
			'haloColor',
			'haloWidth',
			'labelColor',
			'labelFont',
			'labelPosition',
			'labelSize',
			'rotation',
			'size',
			'symbol'
		]);
	});

	it('should initialize layer with default values', () => {
		expect(layer).toBeDefined();
		expect(layer.color).toBe('#ff0000');
		expect(layer.rotation).toBe(0);
		expect(layer.size).toBe(1);
		expect(layer.haloWidth).toBe(1);
		expect(layer.symbol).toBe('extras:pin-teardrop');
		expect(layer.label).toBe('');
	});

	it('gives its style as feature properties', () => {
		layer.color = '#00ff00';
		layer.size = 2;
		layer.symbol = 'base:icon-airfield';
		layer.label = 'Price {EUR}';
		expect(layer.getProperties()).toStrictEqual({
			icon: 'base:icon-airfield',
			anchor: 'center',
			color: 'rgb(0,255,0)',
			opacity: 1,
			rotate: 0,
			size: 2,
			labelSize: 1,
			// the symbol twice as large as its label: offsets twice as large, in ems of the label
			labelScale: 2,
			halo: 1,
			// as it is: the layer reads it as a property, so "{…}" is not replaced
			label: 'Price {EUR}',
			labelColor: 'rgb(0,0,0)',
			labelOpacity: 1,
			haloColor: 'rgb(255,255,255)',
			place: 'auto'
		});
		expect(onChange).toHaveBeenCalledTimes(4);
	});

	it('has a label size of its own, and the offsets of a label without symbol stay', () => {
		layer.size = 2;
		layer.labelSize = 0.5;
		expect(layer.getProperties()).toMatchObject({ size: 2, labelSize: 0.5, labelScale: 4 });
		expect(layer.getState()).toMatchObject({ size: 2, labelSize: 0.5 });
		layer.symbol = '';
		expect(layer.getProperties()).toMatchObject({ labelSize: 0.5, labelScale: 1 });
	});

	it('gives the opacity of the symbol and text colors on its own, so they fade with their halo', () => {
		layer.color = '#00ff0080';
		layer.labelColor = '#0000ff40';
		layer.haloColor = '#ffffff80';
		expect(layer.getProperties()).toMatchObject({
			color: 'rgb(0,255,0)',
			opacity: 128 / 255,
			labelColor: 'rgb(0,0,255)',
			labelOpacity: 64 / 255
		});
		// the halo keeps its own opacity in its color
		expect(layer.getProperties().haloColor).toMatch(/^rgba\(255,\s*255,\s*255,\s*0\.5/);
	});

	it('has a text color and a halo color, stored only if changed', () => {
		expect(layer.getState()).toBeUndefined();
		layer.labelColor = '#123456';
		layer.haloColor = '#fedcba';
		expect(layer.getProperties()).toMatchObject({ labelColor: 'rgb(18,52,86)', haloColor: 'rgb(254,220,186)' });
		expect(layer.getState()).toStrictEqual({ labelColor: '#123456', haloColor: '#fedcba' });

		const copy = new SymbolStyle(() => {});
		copy.setState(layer.getState()!);
		expect([copy.labelColor, copy.haloColor]).toStrictEqual(['#123456', '#fedcba']);
	});

	it('places the label at the chosen side or corner, the first one that fits, or on the point without image', () => {
		layer.labelPosition = 'top'; // top
		expect(layer.getProperties().place).toBe('bottom');
		expect(LABEL_PLACES.bottom).toStrictEqual(['bottom', [0, -0.7]]);
		layer.labelPosition = 'top-right'; // top right: the bottom left corner of the label at the top right of the symbol
		expect(layer.getProperties().place).toBe('bottom-left');
		const near = (x: number, y: number) => [expect.closeTo(x), expect.closeTo(y)];
		expect(LABEL_PLACES['bottom-left']).toStrictEqual(['bottom-left', near(0.495, -0.495)]);
		layer.labelPosition = 'bottom-left'; // bottom left
		expect(layer.getProperties().place).toBe('top-right');
		// automatic: the sides first, then the corners
		layer.labelPosition = 'auto';
		expect(LABEL_PLACES.auto.filter((a) => typeof a === 'string')).toStrictEqual([
			'left',
			'right',
			'top',
			'bottom',
			'bottom-left',
			'top-left',
			'bottom-right',
			'top-right'
		]);
		// without image, on the point, and nowhere else
		layer.symbol = '';
		expect(layer.getProperties().place).toBe('center');
		expect(LABEL_PLACES.center).toStrictEqual(['center', [0, 0]]);
	});

	it('places the label around the image, e.g. beside the head of a pin on the point', () => {
		const pin = { ...getSymbol('base:icon-bench')!, name: 'extras:pin-teardrop', height: 38, center: [0.5, 1] };
		// the center is 19 px (1.1875 em) above the point, and the pin is 3 px (0.1875 em) higher than 32 px
		expect(iconBox(pin as SymbolInfo)).toStrictEqual([0, -1.1875, 0, 0.1875]);
		expect(iconBox(getSymbol('base:icon-bench'))).toStrictEqual([0, 0, 0, 0]);

		const table = labelPlaceTable([getSymbol('base:icon-bench')!, pin as SymbolInfo]);
		const suffix = '@0,-1.1875,0,0.1875';
		expect(Object.keys(table)).toStrictEqual([
			...Object.keys(LABEL_PLACES),
			...Object.keys(LABEL_PLACES).map((name) => name + suffix)
		]);
		// right of the head, and above it, farther away than above a symbol of 32 px
		const near = (x: number, y: number) => [expect.closeTo(x), expect.closeTo(y)];
		expect(table['left' + suffix]).toStrictEqual(['left', near(0.7, -1.1875)]);
		expect(table['bottom' + suffix]).toStrictEqual(['bottom', near(0, -2.075)]);
		expect(table['top' + suffix]).toStrictEqual(['top', near(0, -0.3)]);
		// above right of the head: the corner of the box of the pin, which is higher
		expect(table['bottom-left' + suffix]).toStrictEqual(['bottom-left', near(0.495, -1.8701)]);
	});

	it('names the label position by the box of the image', () => {
		layer.symbol = 'extras:pin-teardrop';
		// an unknown image, e.g. before the symbols are loaded, is 32×32 pixels on the point
		expect(layer.getProperties().place).toBe('auto');
		layer.symbol = 'base:icon-bench';
		layer.labelPosition = 'right'; // right
		expect(layer.getProperties().place).toBe('left');
	});

	it('should return correct state object', () => {
		layer.color = '#00ff00';
		layer.rotation = 45;
		layer.size = 2;
		layer.haloWidth = 3;
		layer.symbol = 'icons:anchor';
		layer.label = 'Test Label';
		layer.labelPosition = 'left';

		expect(layer.getState()).toEqual({
			color: '#00ff00',
			rotation: 45,
			size: 2,
			haloWidth: 3,
			symbol: 'icons:anchor',
			labelPosition: 'left'
		});
	});

	it('should restore state correctly', () => {
		layer.setState({
			color: '#0000ff',
			rotation: 90,
			size: 3,
			haloWidth: 2,
			symbol: 'icons:anchor',
			labelPosition: 'left'
		});

		expect(layer.color).toBe('#0000ff');
		expect(layer.rotation).toBe(90);
		expect(layer.size).toBe(3);
		expect(layer.haloWidth).toBe(2);
		expect(layer.symbol).toBe('icons:anchor');
		expect(layer.labelPosition).toBe('left');
	});

	it('gives the fields that a stored style leaves out their defaults', () => {
		layer.label = 'Label';
		layer.setState({ haloWidth: 0, size: 2, symbol: 'icons:anchor' });
		layer.setState({ color: '#00ff00' });

		expect(layer.color).toBe('#00ff00');
		expect(layer.haloWidth).toBe(1);
		expect(layer.size).toBe(1);
		// the label is a field of the marker, not of its style
		expect(layer.label).toBe('Label');
		expect(layer.getState()).toStrictEqual({ color: '#00ff00' });
		expect(layer.symbol).toBe('extras:pin-teardrop');
	});

	it('should restore falsy values', () => {
		layer.patch({ haloWidth: 0, rotation: 90, labelPosition: 'left' });
		layer.patch({ rotation: 0, labelPosition: 'auto' });

		expect(layer.haloWidth).toBe(0);
		expect(layer.rotation).toBe(0);
		expect(layer.label).toBe('');
		expect(layer.labelPosition).toBe('auto');
	});
});
