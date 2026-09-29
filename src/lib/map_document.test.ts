import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MapDocument } from './map_document.svelte.js';
import { MockMap, type MaplibreMap } from './__mocks__/map.js';
import type { MapState } from '@versatiles/map-state';
import type { AbstractElement } from './element/abstract.svelte.js';
import { MarkerElement } from './element/marker.js';
import { inlineSources } from '@versatiles/style';
import { deferInlineSources } from './__mocks__/inline_sources.js';
import type { StyleSpecification } from 'maplibre-gl';
import type * as maplibregl from 'maplibre-gl';

describe('MapDocument', () => {
	let map: MockMap;
	let mapDocument: MapDocument;

	beforeEach(() => {
		map = new MockMap();
		mapDocument = new MapDocument(map as unknown as MaplibreMap);
	});

	it('should initialize with default values', () => {
		expect(mapDocument.elements).toBeDefined();
		expect(mapDocument.view.map).toBe(map);
		// the viewer has no history, selection or palette
		expect('state' in mapDocument).toBe(false);
		expect('selection' in mapDocument).toBe(false);
	});

	describe('destroy', () => {
		// Let the test decide when the TileJSON download finishes
		async function deferStyle() {
			const inline = deferInlineSources();
			const doc = new MapDocument(map as unknown as MaplibreMap);
			await inline.started();
			map.setStyle.mockClear();
			return { doc, resolve: inline.resolve, reject: inline.reject };
		}

		it('creates elements only once the style is loaded', async () => {
			const { doc, resolve } = await deferStyle();
			const loading = doc.setState({ elements: [{ type: 'marker', point: [1, 2] }] });
			await new Promise((r) => setTimeout(r, 0));
			expect(doc.elements).toHaveLength(0);

			resolve({ version: 8, sources: {}, layers: [] });
			await loading;
			expect(doc.elements).toHaveLength(1);
		});

		it('removes all elements', () => {
			const element = { destroy: vi.fn() } as unknown as AbstractElement;
			mapDocument['appendElement'](element);
			mapDocument.destroy();
			expect(element.destroy).toHaveBeenCalled();
			expect(mapDocument.elements).toStrictEqual([]);
		});
	});

	it('should clear all elements', () => {
		const element = { destroy: vi.fn() } as unknown as AbstractElement;
		mapDocument.elements.push(element);
		mapDocument.clear();
		expect(element.destroy).toHaveBeenCalled();
		expect(mapDocument.elements).toBeDefined();
	});

	it('should append an element', async () => {
		// a real element: the renderer draws it later, in a microtask
		const element = new MarkerElement(mapDocument, [0, 0]);
		mapDocument['appendElement'](element);
		expect(mapDocument.elements).toContain(element);
		// drawn within the test, so an error would fail this test
		await Promise.resolve();
	});

	it('should remove an element', () => {
		const element = { id: 'test-element' } as unknown as AbstractElement;
		mapDocument.elements.push(element);
		mapDocument.removeElement(element);
		expect(mapDocument.elements).not.toContain(element);
	});

	it('should load a state', async () => {
		const state: MapState = {
			map: { center: [0, 0], radius: 1000 },
			elements: []
		};
		const clearSpy = vi.spyOn(mapDocument, 'clear');
		const setStateSpy = vi.spyOn(mapDocument, 'setState');

		await mapDocument.loadState(state);
		expect(clearSpy).toHaveBeenCalled();
		expect(setStateSpy).toHaveBeenCalledWith(state);
	});

	it('should propagate errors while loading a state', async () => {
		const state = { elements: [{ type: 'unknown' }] } as unknown as MapState;
		await expect(mapDocument.loadState(state)).rejects.toThrow('Unknown element type');
	});

	it('should set a state and fit map bounds', async () => {
		const state: MapState = {
			map: { center: [0, 0], radius: 1000 },
			elements: []
		};
		await mapDocument.setState(state);
		expect(map.fitBounds).toHaveBeenCalled();
	});

	it('should restore popups', async () => {
		map.setStyle();
		await mapDocument.setState({
			elements: [
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					popup: { text: 'Hello' }
				}
			]
		});
		const [element] = mapDocument.elements;
		expect(element.popup).toBe('Hello');
		expect(element.getState().popup).toStrictEqual({ text: 'Hello' });
	});

	describe('loading', () => {
		it('reports a state as loading until its elements exist', async () => {
			expect(mapDocument.isLoading()).toBe(false);
			expect(mapDocument.loading).toBe(false);
			// the style is not loaded yet, so the elements have to wait
			const loading = mapDocument.setState({ elements: [{ type: 'marker', point: [1, 2] }] });
			expect(mapDocument.isLoading()).toBe(true);
			expect(mapDocument.loading).toBe(true);
			let loaded = false;
			mapDocument.whenLoaded().then(() => (loaded = true));

			map.setStyle();
			await loading;
			await Promise.resolve();
			expect(loaded).toBe(true);
			expect(mapDocument.isLoading()).toBe(false);
			expect(mapDocument.loading).toBe(false);
			expect(mapDocument.elements).toHaveLength(1);
		});

		it('resolves at once when nothing is loading', async () => {
			await expect(mapDocument.whenLoaded()).resolves.toBeUndefined();
		});

		it('lets a newer state replace an older one that is still waiting', async () => {
			map.setStyle();
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalled());
			// the background of the older state loads slowly
			let resolve!: (style: StyleSpecification) => void;
			vi.mocked(inlineSources).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
			const gray = { builder: 'osm' as const, options: { theme: 'gray' } };

			const older = mapDocument.setState({
				meta: { background: gray },
				elements: [{ type: 'marker', point: [1, 2] }]
			});
			// the same background: the newer state does not wait
			const newer = mapDocument.setState({
				meta: { background: gray },
				elements: [
					{
						type: 'line',
						points: [
							[0, 0],
							[1, 1]
						]
					}
				]
			});
			await newer;
			resolve({ version: 8, sources: {}, layers: [] });
			await older;

			const elements = mapDocument.elements;
			expect(elements.map((e) => e.getState().type)).toStrictEqual(['line']);
			expect(mapDocument.isLoading()).toBe(false);
		});

		it('is not loading any more after an error', async () => {
			await expect(mapDocument.setState({ elements: [{ type: 'unknown' }] } as unknown as MapState)).rejects.toThrow();
			expect(mapDocument.isLoading()).toBe(false);
		});
	});

	it('should find the topmost element at a pixel', async () => {
		map.setStyle();
		await mapDocument.setState({
			elements: [
				{ type: 'marker', point: [0, 0] },
				{ type: 'marker', point: [1, 1] }
			]
		});
		const [a, b] = mapDocument.elements;
		map.queryRenderedFeatures.mockReturnValue([
			{ source: 'basemap', id: 'x' },
			{ source: 'elements_symbol', id: b.id },
			{ source: 'elements_symbol', id: a.id }
		] as unknown as maplibregl.MapGeoJSONFeature[]);

		expect(mapDocument.elementAt({ x: 10, y: 20 }, 2)).toBe(b);
		expect(map.queryRenderedFeatures).toHaveBeenLastCalledWith(
			[
				[8, 18],
				[12, 22]
			],
			// the layer shared by both markers, once
			{ layers: ['elements_symbol'] }
		);
		// only among the candidates
		expect(mapDocument.elementAt({ x: 10, y: 20 }, 0, [a])).toBe(a);
		expect(mapDocument.elementAt({ x: 10, y: 20 }, 0, [])).toBeUndefined();
	});

	describe('background', () => {
		const gray = { builder: 'osm' as const, options: { theme: 'gray' } };

		it('is set by the state', async () => {
			map.setStyle();
			await mapDocument.setState({ meta: { background: gray }, elements: [] });
			expect(mapDocument.background).toStrictEqual(gray);
			await mapDocument.setState({ elements: [] });
			expect(mapDocument.background).toBeUndefined();
		});

		it('loads no style for an unchanged background', async () => {
			map.setStyle();
			await mapDocument.setBackground(gray);
			map.setStyle.mockClear();
			await mapDocument.setBackground({ ...gray });
			expect(map.setStyle).not.toHaveBeenCalled();
		});
	});

	it('should identify as non-interactive', () => {
		expect(mapDocument.isInteractive()).toBe(false);
	});
});
