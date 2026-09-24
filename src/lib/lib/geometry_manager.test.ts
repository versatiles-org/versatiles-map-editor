import { describe, expect, it, beforeEach, vi } from 'vitest';
import { GeometryManager } from './geometry_manager.js';
import { get } from 'svelte/store';
import { MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';
import type { StateRoot } from '$lib/codec/types.js';
import type { AbstractElement } from './element/abstract.js';
import { inlineSources } from '@versatiles/style';
import type { StyleSpecification } from 'maplibre-gl';

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

	it('should identify as non-interactive', () => {
		expect(geometryManager.isInteractive()).toBe(false);
	});
});
