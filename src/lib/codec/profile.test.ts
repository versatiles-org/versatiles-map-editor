import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';

import {
	FILL_DEFAULTS,
	LINE_DEFAULTS,
	SYMBOL_DEFAULTS,
	FILL_PATTERN_NAMES,
	STROKE_STYLE_NAMES,
	LABEL_ALIGN_NAMES,
	fillPropsFromStyle,
	fillStyleFromProps,
	strokePropsFromStyle,
	strokeStyleFromProps,
	symbolPropsFromStyle,
	symbolStyleFromProps
} from './profile.js';
import { symbolName, symbolIndexByName, symbolEntries } from './symbols.js';

import { MapLayerFill, fillPatterns } from '$lib/lib/map_layer/fill.js';
import { MapLayerLine, dashArrays } from '$lib/lib/map_layer/line.js';
import { MapLayerSymbol, labelPositions } from '$lib/lib/map_layer/symbol.js';
import { getSymbol } from '$lib/lib/symbols.js';
import { MockGeometryManager } from '$lib/lib/__mocks__/geometry_manager.js';
import type { GeometryManager } from '$lib/lib/geometry_manager.js';
import type { StateStyle } from './types.js';

// The codec owns the style vocabulary; these guards ensure it never drifts from
// the editor's MapLayer definitions.
describe('profile drift guard', () => {
	it('default styles match the editor MapLayer defaults', () => {
		expect(FILL_DEFAULTS).toEqual(MapLayerFill.defaultStyle);
		expect(LINE_DEFAULTS).toEqual(MapLayerLine.defaultStyle);
		expect(SYMBOL_DEFAULTS).toEqual(MapLayerSymbol.defaultStyle);
	});

	it('enum name tables match the editor tables (in index order)', () => {
		const ordered = (m: Map<number, { name: string }>) =>
			[...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.name);
		expect(FILL_PATTERN_NAMES).toEqual(ordered(fillPatterns));
		expect(STROKE_STYLE_NAMES).toEqual(ordered(dashArrays));
		expect(LABEL_ALIGN_NAMES).toEqual([...labelPositions].sort((a, b) => a.index - b.index).map((p) => p.name));
	});

	it('symbol registry matches the editor symbol names', () => {
		for (const [index, name] of symbolEntries) {
			expect(symbolName(index)).toBe(name);
			expect(symbolIndexByName(name)).toBe(index);
			expect(getSymbol(index).name).toBe(name);
		}
	});
});

// The codec's State->properties mapping must reproduce the editor's exported
// GeoJSON properties exactly (so existing exports don't change).
describe('profile parity with MapLayer.getGeoJSONProperties', () => {
	const manager = new MockGeometryManager() as unknown as GeometryManager;

	it('fill: props and style round-trip match the layer', () => {
		const layer = new MapLayerFill(manager, 'fill-test', 'src');
		const style: StateStyle = { color: '#123456', opacity: 0.5, pattern: 1 };
		layer.setState(style);
		const state = layer.getState()!;
		expect(fillPropsFromStyle(state)).toEqual(layer.getGeoJSONProperties());
		expect(fillStyleFromProps(layer.getGeoJSONProperties())).toEqual(state);
	});

	it('line: props and style round-trip match the layer', () => {
		const layer = new MapLayerLine(manager, 'line-test', 'src');
		const style: StateStyle = { color: '#654321', pattern: 2, width: 5 };
		layer.setState(style);
		const state = layer.getState()!;
		expect(strokePropsFromStyle(state)).toEqual(layer.getGeoJSONProperties());
		expect(strokeStyleFromProps(layer.getGeoJSONProperties())).toEqual(state);
	});

	it('symbol: props and style round-trip match the layer', () => {
		const layer = new MapLayerSymbol(manager, 'symbol-test', 'src');
		const style: StateStyle = {
			color: '#0a0b0c',
			rotate: 45,
			size: 2,
			halo: 3,
			pattern: 10,
			label: 'Hi',
			align: 2
		};
		layer.setState(style);
		const state = layer.getState()!;
		expect(symbolPropsFromStyle(state)).toEqual(layer.getGeoJSONProperties());
		expect(symbolStyleFromProps(layer.getGeoJSONProperties())).toEqual(state);
		expect(get(layer.color)).toBe('#0a0b0c'); // sanity: setState applied
	});
});
