import { describe, expect, it } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { buildStyle, keepElements } from './editor_style.js';
import { ELEMENT_LAYERS } from './element_renderer.js';

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
			ELEMENT_LAYERS.symbol,
			'selection_marks',
			'selection_nodes',
			'drawing_fill',
			'drawing_line',
			'drawing_nodes'
		];
		// the background map below, then the highlight, the elements, the selection and the drawing
		expect(ids.slice(-own.length)).toStrictEqual(own);
		expect(index('highlight_line')).toBeGreaterThan(0);
		for (const id of own) {
			const source = style.layers[index(id)] as { source: string };
			expect(style.sources[source.source], id).toBeDefined();
		}
		// changes of the background map are not animated
		expect(style.transition).toStrictEqual({ duration: 0, delay: 0 });
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
});
