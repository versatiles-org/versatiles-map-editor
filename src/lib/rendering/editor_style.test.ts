import { describe, expect, it } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { buildStyle, keepElements } from './editor_style.js';
import { AREAS_TOP, ELEMENT_LAYERS, ELEMENTS_TOP } from './element_renderer.js';

describe('buildStyle', () => {
	it('puts the layers of the editor over the background map, in their order', () => {
		const style = buildStyle(undefined, 'noto_sans_regular');
		const ids = style.layers.map((layer) => layer.id);
		const index = (id: string) => ids.indexOf(id);
		const own = [
			'highlight_line',
			'highlight_point',
			ELEMENT_LAYERS.fill,
			ELEMENT_LAYERS.stroke,
			AREAS_TOP,
			ELEMENT_LAYERS.symbol,
			ELEMENTS_TOP,
			'selection_marks',
			'selection_nodes',
			'visible_area_veil',
			'visible_area_border',
			'visible_area_bounds',
			'visible_area_handles',
			'drawing_fill',
			'drawing_line',
			'drawing_nodes'
		];
		// the background map below, then the highlight, the elements, the selection and the drawing
		expect(ids.slice(-own.length)).toStrictEqual(own);
		expect(index('highlight_line')).toBeGreaterThan(0);
		for (const id of own) {
			const layer = style.layers[index(id)];
			// all but the invisible marks of places
			if (layer.type === 'background') continue;
			expect(style.sources[(layer as { source: string }).source], id).toBeDefined();
		}
		// changes of the background map are not animated
		expect(style.transition).toStrictEqual({ duration: 0, delay: 0 });
	});

	it('puts the areas and lines of the elements under the labels of the background map', () => {
		const style = buildStyle(undefined, 'noto_sans_regular', true);
		const ids = style.layers.map((layer) => layer.id);
		const firstLabel = style.layers.findIndex((layer) => layer.type === 'symbol');
		expect(firstLabel).toBeGreaterThan(0);
		expect(style.layers[firstLabel].id).not.toBe(ELEMENT_LAYERS.symbol);
		const under = ['highlight_line', 'highlight_point', ELEMENT_LAYERS.fill, ELEMENT_LAYERS.stroke, AREAS_TOP];
		expect(ids.slice(firstLabel - under.length, firstLabel)).toStrictEqual(under);
		// the markers, the selection, the visible area and the drawing stay on top
		expect(ids.slice(-11)).toStrictEqual([
			ELEMENT_LAYERS.symbol,
			ELEMENTS_TOP,
			'selection_marks',
			'selection_nodes',
			'visible_area_veil',
			'visible_area_border',
			'visible_area_bounds',
			'visible_area_handles',
			'drawing_fill',
			'drawing_line',
			'drawing_nodes'
		]);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.length).toBe(buildStyle(undefined, 'noto_sans_regular').layers.length);
	});

	it("draws the editor's own marks in the color of the theme", () => {
		const style = buildStyle(undefined, 'noto_sans_regular', false, 'rgba(1, 2, 3, 1)');
		const paint = (id: string) => style.layers.find((layer) => layer.id === id)?.paint as Record<string, unknown>;
		expect(paint('drawing_line')['line-color']).toBe('rgba(1, 2, 3, 1)');
		expect(paint('visible_area_border')['line-color']).toBe('rgba(1, 2, 3, 1)');
		expect(paint('visible_area_handles')['circle-stroke-color']).toBe('rgba(1, 2, 3, 1)');
	});
});

describe('keepElements', () => {
	it('keeps the content of the element sources in the new style', () => {
		const layer = (id: string, source: string) => ({ id, source, type: 'line' }) as maplibregl.LayerSpecification;
		const geojson = (n: number) => ({ type: 'geojson', data: { type: 'FeatureCollection', features: new Array(n) } });
		const previous = {
			version: 8,
			sources: { old: geojson(0), elements_stroke: geojson(1), selection_nodes: geojson(2) },
			layers: [layer('old', 'old'), layer('elements_stroke', 'elements_stroke')]
		} as unknown as maplibregl.StyleSpecification;
		const next = {
			version: 8,
			sources: { base: geojson(0), elements_stroke: geojson(0), selection_nodes: geojson(0) },
			layers: [layer('base', 'base'), layer('elements_stroke', 'elements_stroke')]
		} as unknown as maplibregl.StyleSpecification;

		const result = keepElements(previous, next);
		expect(Object.keys(result.sources)).toStrictEqual(['base', 'elements_stroke', 'selection_nodes']);
		expect(result.sources.elements_stroke).toBe(previous.sources.elements_stroke);
		expect(result.sources.selection_nodes).toBe(previous.sources.selection_nodes);
		// the layers of the new style, e.g. with the font of the new background map
		expect(result.layers).toBe(next.layers);
		expect(keepElements(undefined, next)).toBe(next);
	});

	it('keeps the visible area, e.g. while it is edited and the background map changes', () => {
		const style = buildStyle(undefined, 'noto_sans_regular');
		expect(style.sources.visible_area).toBeDefined();
	});
});
