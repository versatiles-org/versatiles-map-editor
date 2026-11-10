import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { MapDocument } from '../document/map_document.svelte.js';
import { ELEMENT_LAYERS, elementStyle, MAX_LAYERS } from '@versatiles/map-state/maplibre';
import { layerIdsOf } from './element_renderer.js';
import type { LineElement } from '../element/line.js';
import type { PolygonElement } from '../element/polygon.js';
import type { MarkerElement } from '../element/marker.js';

type Source = { setData: Mock; updateData: Mock };

describe('ElementRenderer', () => {
	let map: MockMap;
	let doc: MapDocument;
	let sources: Record<string, Source>;

	// the layers of the map, also those that are added, moved and removed
	let order: string[];

	beforeEach(async () => {
		map = new MockMap();
		sources = {};
		order = [
			'elements_fill',
			'elements_stroke',
			'elements_arrows',
			'elements_areas_top',
			'elements_symbol',
			'elements_top',
			'selection'
		];
		map.getLayersOrder.mockImplementation(() => [...order]);
		const place = (id: string, before: string) => {
			if (order.includes(id)) order.splice(order.indexOf(id), 1);
			order.splice(order.indexOf(before), 0, id);
		};
		map.addLayer.mockImplementation((layer: { id: string }, before: string) => place(layer.id, before));
		map.moveLayer.mockImplementation(place);
		map.removeLayer.mockImplementation((id: string) => order.splice(order.indexOf(id), 1));
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
					outlineStyle: { visible: false }
				},
				{ type: 'marker', point: [1, 2], label: 'A' }
			]
		});
		map.setStyle();
		await loading;
		doc.view.renderer.flush();
	});

	it('plans the layers once for many elements whose labels change, e.g. on undo', async () => {
		const markers = (label?: string) => ({
			elements: Array.from({ length: 50 }, (_, i) => ({
				type: 'marker' as const,
				point: [i, 2] as [number, number],
				style: label ? { label: `${label} ${i}`, color: '#ff0000' } : { color: '#0000ff' }
			}))
		});
		await doc.setState(markers('A'));
		doc.view.renderer.flush();
		const plan = vi.spyOn(doc.view.renderer as unknown as { plan: () => void }, 'plan');

		await doc.setState(markers());
		doc.view.renderer.flush();
		// not once per marker
		expect(plan.mock.calls.length).toBeLessThanOrEqual(2);
		expect(layerIdsOf(doc.elements[0] as MarkerElement)).toStrictEqual(['elements_symbol']);
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

	it('draws the arrowheads of lines in a source of their own, two features per line', async () => {
		const points: [number, number][] = [
			[0, 0],
			[1, 0]
		];
		await doc.setState({
			elements: [
				{ type: 'line', points, style: { arrowStart: 'circle', arrowEnd: 'triangle', color: '#0000ff' } },
				{ type: 'line', points }
			]
		});
		doc.view.renderer.flush();
		const [line, plain] = doc.elements as [LineElement, LineElement];
		expect(layerIdsOf(line)).toStrictEqual(['elements_stroke', 'elements_arrows']);
		expect(layerIdsOf(plain)).toStrictEqual(['elements_stroke']);
		expect(
			lastFeatures('arrow').map((f) => [f.id, f.geometry, f.properties?.icon, f.properties?.layer, f.properties?.color])
		).toStrictEqual([
			[line.id * 2, { type: 'Point', coordinates: [0, 0] }, 'arrow-circle', 'elements_arrows', 'rgb(0,0,255)'],
			[line.id * 2 + 1, { type: 'Point', coordinates: [1, 0] }, 'arrow-triangle', 'elements_arrows', 'rgb(0,0,255)']
		]);

		// a change replaces both arrowheads
		line.layer.color = '#00ff00';
		await Promise.resolve();
		const diff = sources.elements_arrows.updateData.mock.lastCall![0];
		expect(diff.remove).toStrictEqual([line.id * 2, line.id * 2 + 1]);
		expect(diff.add).toHaveLength(2);

		// without arrowheads, the layers are planned again
		line.layer.arrowStart = 'none';
		line.layer.arrowEnd = 'none';
		await Promise.resolve();
		expect(lastFeatures('arrow')).toStrictEqual([]);
		expect(layerIdsOf(line)).toStrictEqual(['elements_stroke']);
	});

	it('gives every map style the element layers, with the font of the map', () => {
		const { sources, layers } = elementStyle('lato_bold', []);
		expect(Object.keys(sources)).toStrictEqual([
			'elements_fill',
			'elements_stroke',
			'elements_arrows',
			'elements_symbol'
		]);
		// areas at the bottom, markers on top, and the invisible marks of the tops
		expect(layers.map((l) => l.id)).toStrictEqual([
			'elements_fill',
			'elements_stroke',
			'elements_arrows',
			'elements_areas_top',
			'elements_symbol',
			'elements_top'
		]);
		const symbol = layers[4] as { layout: Record<string, unknown> };
		expect(symbol.layout['text-font']).toStrictEqual(['literal', ['lato_bold']]);
	});

	describe('markers with labels', () => {
		/** Markers in drawing order, with these labels ("" for none). */
		async function markers(labels: string[]) {
			await doc.setState({
				elements: labels.map((label, i) => ({ type: 'marker' as const, point: [i, 0], label }))
			});
			doc.view.renderer.flush();
		}
		const groups = () => lastFeatures('symbol').map((f) => [f.properties?.label, f.properties?.layer]);
		const addedLayers = () => map.addLayer.mock.calls.map(([layer]) => [layer.id, layer.filter]);

		it('are drawn by layers from the back to the front, each ending with a label', async () => {
			await markers(['A', '', 'B', '', '']);
			// MapLibre draws the labels of a layer over all its symbols
			expect(groups()).toStrictEqual([
				['A', 'elements_symbol'],
				['', 'elements_symbol_1'],
				['B', 'elements_symbol_1'],
				['', 'elements_symbol_2'],
				['', 'elements_symbol_2']
			]);
			expect(addedLayers()).toStrictEqual([
				['elements_symbol_1', ['==', ['get', 'layer'], 'elements_symbol_1']],
				['elements_symbol_2', ['==', ['get', 'layer'], 'elements_symbol_2']]
			]);
			// in their order, under the top of the elements, e.g. under the selection
			expect(order.slice(order.indexOf('elements_symbol'))).toStrictEqual([
				'elements_symbol',
				'elements_symbol_1',
				'elements_symbol_2',
				'elements_top',
				'selection'
			]);
			expect(doc.view.renderer.layerIds('symbol')).toStrictEqual([
				'elements_symbol',
				'elements_symbol_1',
				'elements_symbol_2'
			]);
		});

		it('are drawn by layers of their own if they lie flat on the map, since a layer draws all its markers alike', async () => {
			await doc.setState({
				elements: [
					{ type: 'marker', point: [0, 0] },
					{ type: 'marker', point: [1, 0], style: { flat: true } },
					{ type: 'marker', point: [2, 0], style: { flat: true } },
					{ type: 'marker', point: [3, 0] }
				]
			});
			doc.view.renderer.flush();
			expect(lastFeatures('symbol').map((f) => [f.properties?.flat, f.properties?.layer])).toStrictEqual([
				[undefined, 'elements_symbol'],
				[true, 'elements_symbol_1'],
				[true, 'elements_symbol_1'],
				[undefined, 'elements_symbol_2']
			]);
			// the layer of the flat ones turns and tilts with the map, its symbols and its labels
			const aligned = map.setLayoutProperty.mock.calls.filter(([, key]) => String(key).endsWith('-alignment'));
			expect(aligned).toStrictEqual([
				['elements_symbol_1', 'icon-rotation-alignment', 'map'],
				['elements_symbol_1', 'icon-pitch-alignment', 'map'],
				['elements_symbol_1', 'text-rotation-alignment', 'map'],
				['elements_symbol_1', 'text-pitch-alignment', 'map']
			]);

			// upright again: one layer for all, and the layer that stays draws upright markers
			map.getLayoutProperty.mockImplementation((id, key) =>
				id === 'elements_symbol_1' && key?.endsWith('-alignment') ? 'map' : undefined
			);
			const flat = doc.elements.filter((_, i) => i === 1 || i === 2) as MarkerElement[];
			flat.forEach((marker) => (marker.layer.flat = false));
			doc.view.renderer.flush();
			expect(lastFeatures('symbol').map((f) => f.properties?.layer)).toStrictEqual(Array(4).fill('elements_symbol'));
		});

		it('need fewer layers when labels are removed, and more when one is added', async () => {
			await markers(['A', '', 'B', '']);
			expect(doc.view.renderer.layerIds('symbol')).toHaveLength(3);
			const [a, , b] = doc.elements as MarkerElement[];
			b.layer.label = '';
			await Promise.resolve();
			expect(map.removeLayer).toHaveBeenCalledWith('elements_symbol_2');
			expect(groups()).toStrictEqual([
				['A', 'elements_symbol'],
				['', 'elements_symbol_1'],
				['', 'elements_symbol_1'],
				['', 'elements_symbol_1']
			]);
			a.layer.label = '';
			await Promise.resolve();
			expect(doc.view.renderer.layerIds('symbol')).toStrictEqual(['elements_symbol']);
			b.layer.label = 'B';
			await Promise.resolve();
			expect(doc.view.renderer.layerIds('symbol')).toHaveLength(2);
		});

		it('share one layer if there are too many, since every layer costs time', async () => {
			await markers(Array.from({ length: MAX_LAYERS + 1 }, (_, i) => `Label ${i}`));
			expect(new Set(groups().map(([, layer]) => layer))).toStrictEqual(new Set(['elements_symbol']));
			// only a layer for their labels, above the markers, which draw none
			expect(addedLayers().map(([id]) => id)).toStrictEqual(['elements_labels']);
			const layout = (id: string, key: string) =>
				map.setLayoutProperty.mock.calls.filter(([i, k]) => i === id && k === key).at(-1)?.[2];
			expect(layout('elements_symbol', 'text-field')).toBe('');
			expect(layout('elements_labels', 'text-field')).toStrictEqual(['get', 'label']);
			expect(layout('elements_labels', 'symbol-sort-key')).toStrictEqual(['get', 'order']);
			// labels that would overlap hidden: placed from the front, so the marker in front keeps its label
			doc.view.renderer.setLabelOptions({ overlap: 'hide', minZoom: 0 });
			expect(layout('elements_labels', 'symbol-sort-key')).toStrictEqual(['-', 0, ['get', 'order']]);
			expect(layout('elements_labels', 'text-overlap')).toBe('never');
			expect(layout('elements_symbol', 'text-field')).toBe('');
			expect(doc.view.renderer.layerIds('symbol')).toStrictEqual(['elements_symbol', 'elements_labels']);
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

	it('draws a polygon over a marker in front of it with layers of its own', async () => {
		map.addLayer.mockClear();
		await doc.setState({
			elements: [
				{ type: 'marker', point: [0, 0] },
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[0, 1]
					]
				}
			]
		});
		doc.view.renderer.flush();
		// the polygon's area and outline above the marker; the first layers of the roles draw them
		expect(map.addLayer).not.toHaveBeenCalled();
		const elementLayers = () => order.filter((id) => id.startsWith('elements'));
		expect(elementLayers()).toStrictEqual([
			'elements_areas_top',
			// the first layer of a role that draws nothing at the bottom
			'elements_arrows',
			'elements_symbol',
			'elements_fill',
			'elements_stroke',
			'elements_top'
		]);
		expect(lastFeatures('fill').map((f) => f.properties?.layer)).toStrictEqual(['elements_fill']);

		// with the markers on top (e.g. with the labels of the background map over areas and lines),
		// the areas and lines under their own top
		doc.view.renderer.setMarkersOnTop(true);
		doc.view.renderer.flush();
		expect(elementLayers()).toStrictEqual([
			'elements_arrows',
			'elements_fill',
			'elements_stroke',
			'elements_areas_top',
			'elements_symbol',
			'elements_top'
		]);
		expect(map.removeLayer).not.toHaveBeenCalled();
	});
});
