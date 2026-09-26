import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GeometryManager, keepElements } from './geometry_manager.js';
import { get } from 'svelte/store';
import { MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';
import type { MapState } from '@versatiles/map-state';
import type { AbstractElement } from './element/abstract.js';
import { inlineSources } from '@versatiles/style';
import type { StyleSpecification } from 'maplibre-gl';
import type * as maplibregl from 'maplibre-gl';

describe('GeometryManager', () => {
	let map: MockMap;
	let geometryManager: GeometryManager;

	beforeEach(() => {
		map = new MockMap();
		geometryManager = new GeometryManager(map as unknown as MaplibreMap);
	});

	it('should initialize with default values', () => {
		expect(geometryManager.elements).toBeDefined();
		expect(geometryManager.map).toBe(map);
		expect(geometryManager.canvas).toBe(map.getCanvasContainer());
		expect(geometryManager.state).toBeNull();
		expect(geometryManager.selection).toBeNull();
	});

	describe('destroy', () => {
		// Let the test decide when the TileJSON download finishes
		function deferInlineSources() {
			let resolve!: (style: StyleSpecification) => void;
			let reject!: (error: unknown) => void;
			vi.mocked(inlineSources).mockImplementationOnce(
				() =>
					new Promise((res, rej) => {
						resolve = res;
						reject = rej;
					})
			);
			const manager = new GeometryManager(map as unknown as MaplibreMap);
			map.setStyle.mockClear();
			return { manager, resolve: (s: StyleSpecification) => resolve(s), reject: (e: unknown) => reject(e) };
		}

		it('sets the style once it is loaded', async () => {
			const { resolve } = deferInlineSources();
			resolve({ version: 8, sources: {}, layers: [] });
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
		});

		it('does not set the style after destroy', async () => {
			const { manager, resolve } = deferInlineSources();
			manager.destroy();
			resolve({ version: 8, sources: {}, layers: [] });
			await new Promise((r) => setTimeout(r, 0));
			expect(map.setStyle).not.toHaveBeenCalled();
		});

		it('does not fall back to the uninlined style after destroy', async () => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
			const { manager, reject } = deferInlineSources();
			manager.destroy();
			reject(new DOMException('The operation was aborted.', 'AbortError'));
			await new Promise((r) => setTimeout(r, 0));
			expect(map.setStyle).not.toHaveBeenCalled();
			expect(consoleError).not.toHaveBeenCalled();
			consoleError.mockRestore();
		});

		it('aborts the TileJSON download', () => {
			const { manager } = deferInlineSources();
			const fetchMock = vi.fn<typeof fetch>();
			vi.stubGlobal('fetch', fetchMock);
			const options = vi.mocked(inlineSources).mock.lastCall?.[1];
			options?.fetch?.('https://example.org/tiles.json');
			const signal = fetchMock.mock.lastCall?.[1]?.signal;
			expect(signal?.aborted).toBe(false);

			manager.destroy();
			expect(signal?.aborted).toBe(true);
			vi.unstubAllGlobals();
		});

		it('creates elements only once the style is loaded', async () => {
			const { manager, resolve } = deferInlineSources();
			const loading = manager.setState({ elements: [{ type: 'marker', point: [1, 2] }] });
			await new Promise((r) => setTimeout(r, 0));
			expect(get(manager.elements)).toHaveLength(0);

			resolve({ version: 8, sources: {}, layers: [] });
			await loading;
			expect(get(manager.elements)).toHaveLength(1);
		});

		it('removes all elements', () => {
			const element = { destroy: vi.fn() } as unknown as AbstractElement;
			geometryManager['appendElement'](element);
			geometryManager.destroy();
			expect(element.destroy).toHaveBeenCalled();
			expect(get(geometryManager.elements)).toStrictEqual([]);
		});
	});

	it('should clear all elements', () => {
		const element = { destroy: vi.fn() } as unknown as AbstractElement;
		get(geometryManager.elements).push(element);
		geometryManager.clear();
		expect(element.destroy).toHaveBeenCalled();
		expect(geometryManager.elements).toBeDefined();
	});

	it('should append an element', () => {
		const element = { id: 'test-element' } as unknown as AbstractElement;
		geometryManager['appendElement'](element);
		expect(get(geometryManager.elements)).toContain(element);
	});

	it('should remove an element', () => {
		const element = { id: 'test-element' } as unknown as AbstractElement;
		get(geometryManager.elements).push(element);
		geometryManager.removeElement(element);
		expect(get(geometryManager.elements)).not.toContain(element);
	});

	it('should load a state', async () => {
		const state: MapState = {
			map: { center: [0, 0], radius: 1000 },
			elements: []
		};
		const clearSpy = vi.spyOn(geometryManager, 'clear');
		const setStateSpy = vi.spyOn(geometryManager, 'setState');
		// @ts-expect-error: mocking state
		geometryManager.state = { history: { reset: vi.fn() } };

		await geometryManager.loadState(state);
		expect(clearSpy).toHaveBeenCalled();
		expect(setStateSpy).toHaveBeenCalledWith(state);
		expect(geometryManager.state?.history.reset).toHaveBeenCalledWith(state);
	});

	it('should propagate errors while loading a state', async () => {
		const state = { elements: [{ type: 'unknown' }] } as unknown as MapState;
		await expect(geometryManager.loadState(state)).rejects.toThrow('Unknown element type');
	});

	it('should set a state and fit map bounds', async () => {
		const state: MapState = {
			map: { center: [0, 0], radius: 1000 },
			elements: []
		};
		await geometryManager.setState(state);
		expect(map.fitBounds).toHaveBeenCalled();
	});

	it('should restore popups', async () => {
		map.setStyle();
		await geometryManager.setState({
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
		const [element] = get(geometryManager.elements);
		expect(get(element.popup)).toBe('Hello');
		expect(element.getState().popup).toStrictEqual({ text: 'Hello' });
	});

	describe('loading', () => {
		it('reports a state as loading until its elements exist', async () => {
			expect(geometryManager.isLoading()).toBe(false);
			expect(get(geometryManager.loading)).toBe(false);
			// the style is not loaded yet, so the elements have to wait
			const loading = geometryManager.setState({ elements: [{ type: 'marker', point: [1, 2] }] });
			expect(geometryManager.isLoading()).toBe(true);
			expect(get(geometryManager.loading)).toBe(true);
			let loaded = false;
			geometryManager.whenLoaded().then(() => (loaded = true));

			map.setStyle();
			await loading;
			await Promise.resolve();
			expect(loaded).toBe(true);
			expect(geometryManager.isLoading()).toBe(false);
			expect(get(geometryManager.loading)).toBe(false);
			expect(get(geometryManager.elements)).toHaveLength(1);
		});

		it('resolves at once when nothing is loading', async () => {
			await expect(geometryManager.whenLoaded()).resolves.toBeUndefined();
		});

		it('lets a newer state replace an older one that is still waiting', async () => {
			map.setStyle();
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalled());
			// the background of the older state loads slowly
			let resolve!: (style: StyleSpecification) => void;
			vi.mocked(inlineSources).mockImplementationOnce(() => new Promise((r) => (resolve = r)));
			const gray = { builder: 'osm' as const, options: { theme: 'gray' } };

			const older = geometryManager.setState({
				meta: { background: gray },
				elements: [{ type: 'marker', point: [1, 2] }]
			});
			// the same background: the newer state does not wait
			const newer = geometryManager.setState({
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

			const elements = get(geometryManager.elements);
			expect(elements.map((e) => e.getState().type)).toStrictEqual(['line']);
			expect(geometryManager.isLoading()).toBe(false);
		});

		it('is not loading any more after an error', async () => {
			await expect(
				geometryManager.setState({ elements: [{ type: 'unknown' }] } as unknown as MapState)
			).rejects.toThrow();
			expect(geometryManager.isLoading()).toBe(false);
		});
	});

	describe('fitViewport', () => {
		const shownBounds = () => map.fitBounds.mock.lastCall![0] as [[number, number], [number, number]];

		it('stays within the latitudes of the map near a pole', () => {
			// e.g. a view at zoom 2, centered at 70°N: half its height is about 27.5°
			geometryManager.fitViewport({ center: [0, 70], radius: 3_061_000 });
			const [[, south], [, north]] = shownBounds();
			expect(north).toBeCloseTo(85.051129);
			expect(south).toBeCloseTo(42.5, 0);
		});

		it('is at most once around the world wide', () => {
			geometryManager.fitViewport({ center: [10, 89.99], radius: 1000 });
			const [[west], [east]] = shownBounds();
			expect(east - west).toBeLessThanOrEqual(360);
		});

		it('does not throw if the map cannot show the viewport', () => {
			const error = vi.spyOn(console, 'error').mockImplementation(() => {});
			map.fitBounds.mockImplementationOnce(() => {
				throw new Error('Invalid LngLat');
			});
			expect(() => geometryManager.fitViewport({ center: [0, 0], radius: 1000 })).not.toThrow();
			expect(error).toHaveBeenCalled();
		});
	});

	it('should find the topmost element at a pixel', async () => {
		map.setStyle();
		await geometryManager.setState({
			elements: [
				{ type: 'marker', point: [0, 0] },
				{ type: 'marker', point: [1, 1] }
			]
		});
		const [a, b] = get(geometryManager.elements);
		map.queryRenderedFeatures.mockReturnValue([
			{ source: 'basemap', id: 'x' },
			{ source: 'elements_symbol', id: b.id },
			{ source: 'elements_symbol', id: a.id }
		] as unknown as maplibregl.MapGeoJSONFeature[]);

		expect(geometryManager.elementAt({ x: 10, y: 20 }, 2)).toBe(b);
		expect(map.queryRenderedFeatures).toHaveBeenLastCalledWith(
			[
				[8, 18],
				[12, 22]
			],
			// the layer shared by both markers, once
			{ layers: ['elements_symbol'] }
		);
		// only among the candidates
		expect(geometryManager.elementAt({ x: 10, y: 20 }, 0, [a])).toBe(a);
		expect(geometryManager.elementAt({ x: 10, y: 20 }, 0, [])).toBeUndefined();
	});

	describe('background', () => {
		const gray = { builder: 'osm' as const, options: { theme: 'gray' } };

		it('changes the style, keeping the elements', async () => {
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
			map.setStyle.mockClear();
			// the mocked map changes its style object, like MapLibre with a diff: nothing has to load
			map.setStyle.mockImplementation(() => {});
			await geometryManager.setBackground(gray);
			expect(get(geometryManager.background)).toStrictEqual(gray);
			expect(map.setStyle).toHaveBeenCalledTimes(1);
			expect((map.setStyle.mock.lastCall as unknown[])[1]).toMatchObject({
				transformStyle: expect.any(Function)
			});
			// only the permanent listener is left
			expect(map.listenerCount('style.load')).toBe(1);

			// an unchanged background loads no style
			await geometryManager.setBackground({ ...gray });
			expect(map.setStyle).toHaveBeenCalledTimes(1);
		});

		it('waits for a new style object to load', async () => {
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
			// a full reload: MapLibre replaces the style object, which loads later
			map.setStyle.mockImplementation(() => (map.style = {}));
			let done = false;
			const loading = geometryManager.setBackground(gray).then(() => (done = true));
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(2));
			await new Promise((r) => setTimeout(r, 0));
			expect(done).toBe(false);
			map.emit('style.load');
			await loading;
			expect(done).toBe(true);
		});

		it('is set by the state', async () => {
			map.setStyle();
			await geometryManager.setState({ meta: { background: gray }, elements: [] });
			expect(get(geometryManager.background)).toStrictEqual(gray);
			await geometryManager.setState({ elements: [] });
			expect(get(geometryManager.background)).toBeUndefined();
		});

		it('makes the missing images of fill patterns', () => {
			const resolver = map.setMissingStyleImageResolver.mock.lastCall![0] as (id: string) => void;
			resolver('base:icon-airfield');
			expect(map.addImage).not.toHaveBeenCalled();
			resolver('fill-pattern:1:#ff0000');
			expect(map.addImage).toHaveBeenCalledWith('fill-pattern:1:#ff0000', expect.anything());
		});

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

	it('should identify as non-interactive', () => {
		expect(geometryManager.isInteractive()).toBe(false);
	});
});
