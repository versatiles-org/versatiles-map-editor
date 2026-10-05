import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';
import { MapDocument } from '../document/map_document.svelte.js';
import {
	ELEMENT_LAYERS,
	elementStyle,
	labelLayout,
	layerIdsOf,
	MAX_LAYERS,
	planLayers,
	type Drawn,
	type LayerPlan
} from './element_renderer.js';
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
					strokeStyle: { visible: false }
				},
				{ type: 'marker', point: [1, 2], style: { label: 'A' } }
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
		const { sources, layers } = elementStyle('lato_bold');
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
				elements: labels.map((label, i) => ({ type: 'marker' as const, point: [i, 0], style: { label } }))
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

describe('planLayers', () => {
	const marker: Drawn = { roles: ['symbol'], label: false };
	const labeled: Drawn = { roles: ['symbol'], label: true };
	const polygon: Drawn = { roles: ['fill', 'stroke'], label: false };
	const area: Drawn = { roles: ['fill'], label: false };
	const line: Drawn = { roles: ['stroke'], label: false };
	const arrowed: Drawn = { roles: ['stroke', 'arrow'], label: false };
	const layers = (plan: LayerPlan) => plan.layers.map(({ role, elements }) => `${role} ${elements.join()}`);

	/**
	 * What the layers draw, in this order: the parts of the elements, e.g. "2 label". A layer of
	 * markers draws all its symbols before all its labels; the labels of the markers in a layer
	 * of their own (`sharedLabels`) come last.
	 */
	function drawn(plan: LayerPlan, elements: Drawn[]): string[] {
		const parts = plan.layers.flatMap(({ role, elements: indices }) => {
			if (role !== 'symbol') return indices.map((i) => `${i} ${role}`);
			const labels = plan.sharedLabels ? [] : indices.filter((i) => elements[i].label).map((i) => `${i} label`);
			return [...indices.map((i) => `${i} symbol`), ...labels];
		});
		const labels = elements.flatMap((e, i) => (e.label ? [`${i} label`] : []));
		return plan.sharedLabels ? [...parts, ...labels] : parts;
	}

	/** What one layer per element draws: each element's area, outline or line, symbol, label. */
	function reference(elements: Drawn[], markersOnTop = false): string[] {
		const parts = (e: Drawn, i: number) => [
			...e.roles.map((role) => `${i} ${role}`),
			...(e.label ? [`${i} label`] : [])
		];
		if (!markersOnTop) return elements.flatMap(parts);
		const isMarker = (e: Drawn) => e.roles.includes('symbol');
		return [
			...elements.flatMap((e, i) => (isMarker(e) ? [] : parts(e, i))),
			...elements.flatMap((e, i) => (isMarker(e) ? parts(e, i) : []))
		];
	}

	it('merges layers in a row that draw the same', () => {
		expect(layers(planLayers([area, area, line, line, marker, marker]))).toStrictEqual([
			'fill 0,1',
			'stroke 2,3',
			'symbol 4,5'
		]);
		// two polygons: area, outline, area, outline
		expect(layers(planLayers([polygon, polygon]))).toStrictEqual(['fill 0', 'stroke 0', 'fill 1', 'stroke 1']);
		// a marker after a label: in a layer of its own
		expect(layers(planLayers([labeled, marker, labeled, marker]))).toStrictEqual([
			'symbol 0',
			'symbol 1,2',
			'symbol 3'
		]);
		expect(layers(planLayers([marker, polygon, marker]))).toStrictEqual(['symbol 0', 'fill 1', 'stroke 1', 'symbol 2']);
	});

	it('draws the arrowheads of lines in a row over all of their lines', () => {
		expect(layers(planLayers([arrowed, line, arrowed, marker, arrowed]))).toStrictEqual([
			'stroke 0,1,2',
			'arrow 0,2',
			'symbol 3',
			'stroke 4',
			'arrow 4'
		]);
		// an outline after an area does not join the lines before it
		expect(layers(planLayers([arrowed, polygon]))).toStrictEqual(['stroke 0', 'arrow 0', 'fill 1', 'stroke 1']);
		// with too many layers, all arrowheads over all lines and outlines
		const many = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => (i % 2 ? polygon : arrowed));
		expect(planLayers(many).layers.map(({ role }) => role)).toStrictEqual(['fill', 'stroke', 'arrow']);
	});

	it('puts the markers over all areas and lines on demand', () => {
		const plan = planLayers([marker, polygon, labeled, marker, polygon], true);
		expect(layers(plan)).toStrictEqual(['fill 1', 'stroke 1', 'fill 4', 'stroke 4', 'symbol 0,2', 'symbol 3']);
		expect(plan.markersOnTop).toBe(true);
	});

	it('draws exactly like one layer per element', () => {
		// random maps of all kinds of elements, the same each run
		let seed = 1;
		const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
		const kinds = [marker, labeled, polygon, area, line];
		for (let run = 0; run < 500; run++) {
			const elements = Array.from(
				{ length: Math.floor(random() * 30) },
				() => kinds[Math.floor(random() * kinds.length)]
			);
			for (const markersOnTop of [false, true]) {
				const plan = planLayers(elements, markersOnTop);
				expect(plan.sharedLabels).toBe(false);
				expect(drawn(plan, elements)).toStrictEqual(reference(elements, markersOnTop));
				// and no two layers in a row could be one
				plan.layers.slice(1).forEach(({ role, elements: [first] }, i) => {
					const before = plan.layers[i];
					const label = before.elements.some((e) => elements[e].label);
					expect(role === before.role && !(role === 'symbol' && label), `${first}`).toBe(false);
				});
			}
		}
	});

	it('draws with fewer layers if there are too many, step by step', () => {
		// 1. the labels of all markers in a layer of their own, over all markers
		const labels = Array.from({ length: MAX_LAYERS + 1 }, () => labeled);
		const shared = planLayers([polygon, ...labels]);
		expect(layers(shared)).toStrictEqual(['fill 0', 'stroke 0', `symbol ${labels.map((_, i) => i + 1).join()}`]);
		expect(shared).toMatchObject({ sharedLabels: true, markersOnTop: false });

		// 2. the markers over all areas and lines, which keep their order
		const mixed = Array.from({ length: MAX_LAYERS + 1 }, (_, i) => (i % 2 ? marker : line));
		const onTop = planLayers(mixed);
		expect(onTop).toMatchObject({ sharedLabels: true, markersOnTop: true });
		expect(onTop.layers).toHaveLength(2);
		expect(drawn(onTop, mixed)).toStrictEqual(reference(mixed, true));

		// 3. all areas under all lines and outlines
		const polygons = Array.from({ length: MAX_LAYERS / 2 + 1 }, () => polygon);
		expect(planLayers(polygons).layers.map(({ role }) => role)).toStrictEqual(['fill', 'stroke']);
		// up to the limit, each in layers of its own
		expect(planLayers(polygons.slice(1)).layers).toHaveLength(MAX_LAYERS);
	});
});

describe('labelLayout', () => {
	it('shows all labels at every zoom level by default', () => {
		expect(labelLayout({ overlap: 'show', minZoom: 0 })).toStrictEqual({
			'text-field': ['get', 'label'],
			'text-overlap': 'always',
			'text-optional': false
		});
	});

	it('hides labels that would overlap, keeping their markers, and those below a zoom level', () => {
		expect(labelLayout({ overlap: 'hide', minZoom: 14 })).toStrictEqual({
			'text-field': ['step', ['zoom'], '', 14, ['get', 'label']],
			'text-overlap': 'never',
			'text-optional': true
		});
	});
});
