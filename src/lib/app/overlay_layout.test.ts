import { describe, expect, it, vi } from 'vitest';
import type * as maplibregl from 'maplibre-gl';
import { addAttribution, addNavigation, layoutOverlays, type OverlaySizes } from './overlay_layout.js';

describe('layoutOverlays', () => {
	// a wide map: the legend (200px) fits next to the search (260px) and the expanded attribution (400px)
	const wide: OverlaySizes = {
		freeWidth: 1000,
		legendWidth: 200,
		searchWidth: 260,
		attributionWidth: 400,
		topOverlaysHeight: 40,
		hint: false
	};
	// too narrow for the legend next to the search or the expanded attribution
	const narrow: OverlaySizes = { ...wide, freeWidth: 400 };

	it('keeps everything at its place without a legend', () => {
		expect(layoutOverlays(undefined, narrow)).toStrictEqual({
			searchRight: false,
			attributionCorner: 'bottom-left',
			navigationCorner: 'top-right',
			legendBelowOverlays: false,
			legendAboveAttribution: false
		});
	});

	it('puts the buttons for zooming at the top right, or at the bottom right if the legend or the search is there', () => {
		for (const position of ['bottom-left', 'bottom', 'bottom-right', 'left'] as const) {
			expect(layoutOverlays(position, wide)).toMatchObject({ navigationCorner: 'top-right' });
		}
		for (const position of ['top-left', 'top', 'top-right', 'right'] as const) {
			// the attribution is at the other bottom corner then
			expect(layoutOverlays(position, wide)).toMatchObject({
				navigationCorner: 'bottom-right',
				attributionCorner: 'bottom-left'
			});
		}
	});

	it('moves the search and the attribution to the side away from the legend', () => {
		expect(layoutOverlays('top-left', wide)).toMatchObject({ searchRight: true, attributionCorner: 'bottom-left' });
		expect(layoutOverlays('top-right', wide)).toMatchObject({ searchRight: false, attributionCorner: 'bottom-left' });
		expect(layoutOverlays('bottom-left', wide)).toMatchObject({
			searchRight: false,
			attributionCorner: 'bottom-right'
		});
		expect(layoutOverlays('bottom-right', wide)).toMatchObject({ attributionCorner: 'bottom-left' });
	});

	it('moves a legend at the top below the search only if they do not fit side by side', () => {
		for (const position of ['top-left', 'top-right'] as const) {
			expect(layoutOverlays(position, wide).legendBelowOverlays, position).toBe(false);
			expect(layoutOverlays(position, narrow).legendBelowOverlays, position).toBe(true);
		}
		// nothing at the top to avoid
		expect(layoutOverlays('top-left', { ...narrow, topOverlaysHeight: 0 }).legendBelowOverlays).toBe(false);
		// the hint of the viewer is nearly as wide as the map
		expect(layoutOverlays('top-right', { ...wide, hint: true }).legendBelowOverlays).toBe(true);
	});

	it('lets a legend at the center reach half of its width to each side', () => {
		// 150 + 260 > 800 / 2, but 150 + 260 < 1000 / 2
		expect(layoutOverlays('top', { ...wide, freeWidth: 800, legendWidth: 300 }).legendBelowOverlays).toBe(true);
		expect(layoutOverlays('top', { ...wide, legendWidth: 300 }).legendBelowOverlays).toBe(false);
	});

	it('moves a legend at the bottom above the attribution while that is too wide', () => {
		expect(layoutOverlays('bottom-left', narrow).legendAboveAttribution).toBe(true);
		expect(layoutOverlays('bottom-right', wide).legendAboveAttribution).toBe(false);
		// collapsed to its button
		expect(layoutOverlays('bottom-left', { ...narrow, attributionWidth: 24 }).legendAboveAttribution).toBe(false);
	});

	it('never moves a legend at the side', () => {
		for (const position of ['left', 'right'] as const) {
			expect(layoutOverlays(position, { ...narrow, hint: true })).toMatchObject({
				legendBelowOverlays: false,
				legendAboveAttribution: false
			});
		}
	});
});

describe('addNavigation', () => {
	it('adds the buttons for zooming to the corner, and removes them again', () => {
		let controls: unknown[] = [];
		const map = {
			addControl: vi.fn((control: unknown) => controls.push(control)),
			hasControl: vi.fn((control: unknown) => controls.includes(control)),
			removeControl: vi.fn((control: unknown) => (controls = controls.filter((c) => c !== control)))
		};
		const remove = addNavigation(map as unknown as maplibregl.Map, 'bottom-right');
		expect(map.addControl).toHaveBeenCalledWith(expect.anything(), 'bottom-right');
		expect(controls).toHaveLength(1);
		remove();
		expect(controls).toStrictEqual([]);
	});
});

describe('addAttribution', () => {
	it('adds the attribution to the corner, reports its size, and removes it again', () => {
		const container = document.createElement('div');
		const element = document.createElement('div');
		element.className = 'maplibregl-ctrl-attrib';
		container.append(element);
		container.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;
		element.getBoundingClientRect = () => ({ width: 300, top: 470 }) as DOMRect;
		let controls: unknown[] = [];
		const map = {
			addControl: vi.fn((control: unknown) => controls.push(control)),
			hasControl: vi.fn((control: unknown) => controls.includes(control)),
			removeControl: vi.fn((control: unknown) => (controls = controls.filter((c) => c !== control))),
			getContainer: () => container
		};
		let observed: ResizeObserverCallback | undefined;
		const disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: ResizeObserverCallback) {
					observed = callback;
				}
				observe() {}
				disconnect = disconnect;
			}
		);

		const onResize = vi.fn();
		const remove = addAttribution(map as unknown as maplibregl.Map, 'bottom-right', onResize);
		expect(map.addControl).toHaveBeenCalledWith(expect.anything(), 'bottom-right');
		observed!([], {} as ResizeObserver);
		expect(onResize).toHaveBeenCalledWith({ width: 300, top: 30 });

		remove();
		expect(disconnect).toHaveBeenCalled();
		expect(controls).toStrictEqual([]);
		vi.unstubAllGlobals();
	});
});
