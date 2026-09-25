import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GeometryManager, keepElements } from './geometry_manager.js';
import { get } from 'svelte/store';
import { MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';
import type { StateRoot } from '@versatiles/map-state';
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
		const state: StateRoot = {
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
		const state = { elements: [{ type: 'unknown' }] } as unknown as StateRoot;
		await expect(geometryManager.loadState(state)).rejects.toThrow('Unknown element type');
	});

	it('should set a state and fit map bounds', async () => {
		const state: StateRoot = {
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
			{ source: 'basemap' },
			{ source: b.sourceId },
			{ source: a.sourceId }
		] as unknown as maplibregl.MapGeoJSONFeature[]);

		expect(geometryManager.elementAt({ x: 10, y: 20 }, 2)).toBe(b);
		expect(map.queryRenderedFeatures).toHaveBeenLastCalledWith(
			[
				[8, 18],
				[12, 22]
			],
			{ layers: [...a.getLayerIds(), ...b.getLayerIds()] }
		);
		// only among the candidates
		expect(geometryManager.elementAt({ x: 10, y: 20 }, 0, [a])).toBe(a);
		expect(geometryManager.elementAt({ x: 10, y: 20 }, 0, [])).toBeUndefined();
	});

	describe('background', () => {
		const gray = { builder: 'osm' as const, options: { theme: 'gray' } };

		it('loads a new style without a diff, keeping the elements', async () => {
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
			map.setStyle.mockClear();
			await geometryManager.setBackground(gray);
			expect(get(geometryManager.background)).toStrictEqual(gray);
			expect(map.setStyle).toHaveBeenCalledTimes(1);
			expect((map.setStyle.mock.lastCall as unknown[])[1]).toMatchObject({
				diff: false,
				transformStyle: expect.any(Function)
			});

			// an unchanged background loads no style
			await geometryManager.setBackground({ ...gray });
			expect(map.setStyle).toHaveBeenCalledTimes(1);
		});

		it('is set by the state', async () => {
			map.setStyle();
			await geometryManager.setState({ meta: { background: gray }, elements: [] });
			expect(get(geometryManager.background)).toStrictEqual(gray);
			await geometryManager.setState({ elements: [] });
			expect(get(geometryManager.background)).toBeUndefined();
		});

		it('resolves missing images with the registered functions', () => {
			const resolve = vi.fn();
			geometryManager.imageResolvers.set('pattern', resolve);
			const resolver = map.setMissingStyleImageResolver.mock.lastCall![0] as (id: string) => void;
			resolver('other');
			expect(resolve).not.toHaveBeenCalled();
			resolver('pattern');
			expect(resolve).toHaveBeenCalled();
		});

		it('moves the element sources and layers into the new style', () => {
			const element = { sourceId: 'source_a' } as AbstractElement;
			const layer = (id: string, source: string) => ({ id, source, type: 'line' }) as maplibregl.LayerSpecification;
			const geojson = (n: number) => ({ type: 'geojson', data: { type: 'FeatureCollection', features: new Array(n) } });
			const previous = {
				version: 8,
				sources: { old: geojson(0), source_a: geojson(1), selection_nodes: geojson(2) },
				layers: [layer('old', 'old'), layer('a', 'source_a'), layer('selection_nodes', 'selection_nodes')]
			} as unknown as maplibregl.StyleSpecification;
			const next = {
				version: 8,
				sources: { base: geojson(0), selection_nodes: geojson(0) },
				layers: [layer('base', 'base'), layer('highlight_line', 'base'), layer('selection_nodes', 'selection_nodes')]
			} as unknown as maplibregl.StyleSpecification;

			const result = keepElements(previous, next, [element]);
			expect(Object.keys(result.sources)).toStrictEqual(['base', 'selection_nodes', 'source_a']);
			expect(result.sources.selection_nodes).toBe(previous.sources.selection_nodes);
			expect(result.layers.map((l) => l.id)).toStrictEqual(['base', 'highlight_line', 'a', 'selection_nodes']);
			expect(keepElements(undefined, next, [element])).toBe(next);
		});
	});

	it('should identify as non-interactive', () => {
		expect(geometryManager.isInteractive()).toBe(false);
	});
});
