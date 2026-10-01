import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { MapDocument } from '../map_document.svelte.js';
import { ELEMENT_LAYERS, elementStyle, layerIdsOf, MAX_LABEL_GROUPS } from './element_renderer.js';
import type { PolygonElement } from '../element/polygon.js';
import type { MarkerElement } from '../element/marker.js';

type Source = { setData: Mock; updateData: Mock };

describe('ElementRenderer', () => {
	let map: MockMap;
	let doc: MapDocument;
	let sources: Record<string, Source>;

	beforeEach(async () => {
		map = new MockMap();
		sources = {};
		// one source object per id, like MapLibre
		map.getSource.mockImplementation(
			(id: string) => (sources[id] ??= { setData: vi.fn(), updateData: vi.fn() }) as never
		);
		doc = new MapDocument(map as unknown as MaplibreMap);
		const loading = doc.setState({
			elements: [
				{
					type: 'polygon',
					points: [
						[1, 2],
						[3, 4],
						[5, 2]
					],
					strokeStyle: { visible: false }
				},
				{ type: 'marker', point: [1, 2], style: { label: 'A' } }
			]
		});
		map.setStyle();
		await loading;
		doc.view.renderer.flush();
	});

	it('draws each element with the layers of the roles of its style', () => {
		const [polygon, marker] = doc.elements;
		expect(layerIdsOf(polygon)).toStrictEqual(['elements_fill', 'elements_stroke']);
		expect(layerIdsOf(marker)).toStrictEqual(['elements_symbol']);
	});

	const lastFeatures = (role: keyof typeof ELEMENT_LAYERS) =>
		sources[ELEMENT_LAYERS[role]].setData.mock.lastCall![0].features as GeoJSON.Feature[];

	it('draws all elements with one source per role, in the order of the elements', () => {
		const [polygon, marker] = doc.elements;
		expect(lastFeatures('fill').map((f) => [f.id, f.properties?.order])).toStrictEqual([[polygon.id, 0]]);
		// a hidden outline is not drawn
		expect(lastFeatures('stroke')).toStrictEqual([]);
		expect(lastFeatures('symbol').map((f) => [f.id, f.properties?.label, f.properties?.order])).toStrictEqual([
			[marker.id, 'A', 1]
		]);
	});

	it('writes changes of single elements once, only their features', async () => {
		const [polygon, marker] = doc.elements as [PolygonElement, MarkerElement];
		for (const source of Object.values(sources)) source.setData.mockClear();

		marker.layer.label = 'B';
		marker.layer.color = '#00ff00';
		polygon.strokeLayer.visible = true;
		await Promise.resolve();

		expect(sources.elements_symbol.updateData).toHaveBeenCalledTimes(1);
		const diff = sources.elements_symbol.updateData.mock.lastCall![0];
		expect(diff.remove).toStrictEqual([marker.id]);
		expect(diff.add.map((f: GeoJSON.Feature) => f.properties?.label)).toStrictEqual(['B']);
		// the outline is drawn now
		expect(sources.elements_stroke.updateData.mock.lastCall![0].add.map((f: GeoJSON.Feature) => f.id)).toStrictEqual([
			polygon.id
		]);
		expect(sources.elements_symbol.setData).not.toHaveBeenCalled();
	});

	it('draws everything again when the elements change', async () => {
		doc.clear();
		await Promise.resolve();
		expect(lastFeatures('fill')).toStrictEqual([]);
		expect(lastFeatures('symbol')).toStrictEqual([]);
	});

	it('gives every map style the element layers, with the font of the map', () => {
		const { sources, layers } = elementStyle('lato_bold');
		expect(Object.keys(sources)).toStrictEqual(['elements_fill', 'elements_stroke', 'elements_symbol']);
		// areas at the bottom, markers on top
		expect(layers.map((l) => l.id)).toStrictEqual(['elements_fill', 'elements_stroke', 'elements_symbol']);
		const symbol = layers[2] as { layout: Record<string, unknown> };
		expect(symbol.layout['text-font']).toStrictEqual(['literal', ['lato_bold']]);
	});

	describe('markers with labels', () => {
		/** Markers in drawing order, with these labels ("" for none). */
		async function markers(labels: string[]) {
			await doc.setState({
				elements: labels.map((label, i) => ({ type: 'marker' as const, point: [i, 0], style: { label } }))
			});
			doc.view.renderer.flush();
		}
		const groups = () => lastFeatures('symbol').map((f) => [f.properties?.label, f.properties?.group]);
		const addedLayers = () => map.addLayer.mock.calls.map(([layer]) => [layer.id, layer.filter]);

		it('are drawn in groups by layers from the back to the front, each group ending with a label', async () => {
			map.getLayersOrder.mockReturnValue(['elements_symbol', 'selection']);
			await markers(['A', '', 'B', '', '']);
			// MapLibre draws the labels of a layer over all its symbols
			expect(groups()).toStrictEqual([
				['A', 0],
				['', 1],
				['B', 1],
				['', 2],
				['', 2]
			]);
			expect(addedLayers()).toStrictEqual([
				['elements_symbol_1', ['==', ['get', 'group'], 1]],
				['elements_symbol_2', ['==', ['get', 'group'], 2]]
			]);
			// above the first layer of the markers, under the layers that follow it
			expect(map.addLayer.mock.calls.map(([, before]) => before)).toStrictEqual(['selection', 'selection']);
			expect(doc.view.renderer.symbolLayerIds()).toStrictEqual([
				'elements_symbol',
				'elements_symbol_1',
				'elements_symbol_2'
			]);
		});

		it('need fewer layers when labels are removed, and more when one is added', async () => {
			await markers(['A', '', 'B', '']);
			expect(doc.view.renderer.symbolLayerIds()).toHaveLength(3);
			const [a, , b] = doc.elements as MarkerElement[];
			b.layer.label = '';
			await Promise.resolve();
			expect(map.removeLayer).toHaveBeenCalledWith('elements_symbol_2');
			expect(groups()).toStrictEqual([
				['A', 0],
				['', 1],
				['', 1],
				['', 1]
			]);
			a.layer.label = '';
			await Promise.resolve();
			expect(doc.view.renderer.symbolLayerIds()).toStrictEqual(['elements_symbol']);
			b.layer.label = 'B';
			await Promise.resolve();
			expect(doc.view.renderer.symbolLayerIds()).toHaveLength(2);
		});

		it('share one layer if there are too many, since every layer costs time', async () => {
			await markers(Array.from({ length: MAX_LABEL_GROUPS + 1 }, (_, i) => `Label ${i}`));
			expect(new Set(groups().map(([, group]) => group))).toStrictEqual(new Set([0]));
			expect(map.addLayer).not.toHaveBeenCalled();
		});

		it('get their layers again in a new map style', async () => {
			await markers(['A', 'B']);
			expect(map.addLayer).toHaveBeenCalledTimes(1);
			doc.view.renderer.onStyleLoad();
			doc.view.renderer.flush();
			expect(map.addLayer).toHaveBeenCalledTimes(2);
			expect(map.removeLayer).not.toHaveBeenCalled();
		});
	});
});
