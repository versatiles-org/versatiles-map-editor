import { describe, expect, it, beforeEach, vi } from 'vitest';
import { inlineSources } from '@versatiles/style';
import { deferInlineSources } from '../__mocks__/inline_sources.js';
import { MapStyleLoader } from './map_style_loader.js';
import type { ElementRenderer } from './element_renderer.js';
import { MockMap, type MaplibreMap } from '../__mocks__/map.js';

describe('MapStyleLoader', () => {
	let map: MockMap;
	let renderer: ElementRenderer;
	let loader: MapStyleLoader;

	beforeEach(() => {
		map = new MockMap();
		renderer = { redraw: vi.fn() } as unknown as ElementRenderer;
		loader = new MapStyleLoader(map as unknown as MaplibreMap, renderer);
	});

	describe('loading and destroy', () => {
		// Let the test decide when the TileJSON download finishes
		async function deferStyle() {
			const inline = deferInlineSources();
			const loader = new MapStyleLoader(map as unknown as MaplibreMap, renderer);
			await inline.started();
			map.setStyle.mockClear();
			return { loader, resolve: inline.resolve, reject: inline.reject };
		}

		it('sets the style once it is loaded', async () => {
			const { resolve } = await deferStyle();
			resolve({ version: 8, sources: {}, layers: [] });
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
		});
		it('does not set the style after destroy', async () => {
			const { loader, resolve } = await deferStyle();
			loader.destroy();
			resolve({ version: 8, sources: {}, layers: [] });
			await new Promise((r) => setTimeout(r, 0));
			expect(map.setStyle).not.toHaveBeenCalled();
		});
		it('does not fall back to the uninlined style after destroy', async () => {
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
			const { loader, reject } = await deferStyle();
			loader.destroy();
			reject(new DOMException('The operation was aborted.', 'AbortError'));
			await new Promise((r) => setTimeout(r, 0));
			expect(map.setStyle).not.toHaveBeenCalled();
			expect(consoleError).not.toHaveBeenCalled();
			consoleError.mockRestore();
		});
		it('aborts the TileJSON download', async () => {
			const { loader } = await deferStyle();
			const fetchMock = vi.fn<typeof fetch>();
			vi.stubGlobal('fetch', fetchMock);
			const options = vi.mocked(inlineSources).mock.lastCall?.[1];
			options?.fetch?.('https://example.org/tiles.json');
			const signal = fetchMock.mock.lastCall?.[1]?.signal;
			expect(signal?.aborted).toBe(false);

			loader.destroy();
			expect(signal?.aborted).toBe(true);
			vi.unstubAllGlobals();
		});
	});

	describe('background', () => {
		const gray = { builder: 'osm' as const, options: { theme: 'gray' } };

		it('changes the style, keeping the elements', async () => {
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
			map.setStyle.mockClear();
			// the mocked map changes its style object, like MapLibre with a diff: nothing has to load
			map.setStyle.mockImplementation(() => {});
			await loader.setBackground(gray, 'noto_sans_regular');
			expect(map.setStyle).toHaveBeenCalledTimes(1);
			expect((map.setStyle.mock.lastCall as unknown[])[1]).toMatchObject({
				transformStyle: expect.any(Function)
			});
			// only the permanent listener is left
			expect(map.listenerCount('style.load')).toBe(1);
		});
		it('waits for a new style object to load', async () => {
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
			// a full reload: MapLibre replaces the style object, which loads later
			map.setStyle.mockImplementation(() => (map.style = {}));
			let done = false;
			const loading = loader.setBackground(gray, 'noto_sans_regular').then(() => (done = true));
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(2));
			await new Promise((r) => setTimeout(r, 0));
			expect(done).toBe(false);
			map.emit('style.load');
			await loading;
			expect(done).toBe(true);
		});
		it('makes the missing images of fill patterns', () => {
			const resolver = map.setMissingStyleImageResolver.mock.lastCall![0] as (id: string) => void;
			resolver('base:icon-airfield');
			expect(map.addImage).not.toHaveBeenCalled();
			resolver('fill-pattern:1:#ff0000');
			expect(map.addImage).toHaveBeenCalledWith('fill-pattern:1:#ff0000', expect.anything());
		});
	});

	describe('labels of the background map on top', () => {
		const under = ['highlight_line', 'highlight_point', 'elements_fill', 'elements_stroke'];

		beforeEach(async () => {
			await vi.waitFor(() => expect(map.setStyle).toHaveBeenCalledTimes(1));
			const types: Record<string, string> = { water: 'fill', place_labels: 'symbol', elements_symbol: 'symbol' };
			map.getLayersOrder.mockReturnValue(['water', 'place_labels', ...under, 'elements_symbol']);
			map.getLayer.mockImplementation((id: string) => ({ type: types[id] ?? 'line' }));
			map.moveLayer.mockClear();
		});

		it('moves the areas and lines under the first label, and back under the markers', () => {
			loader.setMapLabelsOnTop(true);
			expect(map.moveLayer.mock.calls).toStrictEqual(under.map((id) => [id, 'place_labels']));

			map.moveLayer.mockClear();
			map.getLayersOrder.mockReturnValue(['water', ...under, 'place_labels', 'elements_symbol']);
			loader.setMapLabelsOnTop(false);
			expect(map.moveLayer.mock.calls).toStrictEqual(under.map((id) => [id, 'elements_symbol']));
		});
		it('leaves them under the markers if the background map has no labels', () => {
			map.getLayersOrder.mockReturnValue(['water', ...under, 'elements_symbol']);
			loader.setMapLabelsOnTop(true);
			expect(map.moveLayer).not.toHaveBeenCalled();
		});
		it('builds the next style in this order', async () => {
			loader.setMapLabelsOnTop(true);
			map.setStyle.mockClear();
			await loader.setBackground({ builder: 'osm', options: { theme: 'gray' } }, 'noto_sans_regular');
			const style = (map.setStyle.mock.lastCall as unknown[])[0] as { layers: { id: string; type: string }[] };
			const ids = style.layers.map((layer) => layer.id);
			const firstLabel = style.layers.findIndex((layer) => layer.type === 'symbol');
			expect(ids.slice(firstLabel - under.length, firstLabel)).toStrictEqual(under);
		});
	});
});
