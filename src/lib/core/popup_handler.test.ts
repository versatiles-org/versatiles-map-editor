import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import { MockMap, type MaplibreMap } from '$lib/__mocks__/map.js';
import { GeometryManager } from './geometry_manager.js';
import { PopupHandler } from './popup_handler.js';

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe('PopupHandler', () => {
	let map: MockMap;
	let manager: GeometryManager;

	beforeEach(async () => {
		map = new MockMap();
		manager = new GeometryManager(map as unknown as MaplibreMap);
		new PopupHandler(manager);
		const loading = manager.setState({
			elements: [
				{ type: 'marker', point: [1, 2], popup: { text: 'Hello' } },
				{ type: 'marker', point: [3, 4] }
			]
		});
		map.setStyle();
		await loading;
		map.queryRenderedFeatures.mockClear();
	});

	const hoverOver = (index: number | undefined) => {
		const element = index === undefined ? undefined : get(manager.elements)[index];
		map.queryRenderedFeatures.mockReturnValue(element ? [{ id: element.id } as unknown as MapGeoJSONFeature] : []);
		map.emit('mousemove', { point: { x: 10, y: 20 } });
	};

	it('highlights an element with a popup under the mouse, once per frame', async () => {
		hoverOver(0);
		hoverOver(0);
		hoverOver(0);
		expect(map.queryRenderedFeatures).not.toHaveBeenCalled();
		await nextFrame();
		expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(1);
		expect(map.getCanvasContainer().style.cursor).toBe('pointer');

		hoverOver(undefined);
		await nextFrame();
		expect(map.getCanvasContainer().style.cursor).toBe('');
	});

	it('only takes elements with a popup, also after a popup changes', async () => {
		const withoutPopup = get(manager.elements)[1];
		hoverOver(1);
		await nextFrame();
		expect(map.getCanvasContainer().style.cursor).toBe('');

		withoutPopup.popup.set('World');
		hoverOver(1);
		await nextFrame();
		expect(map.getCanvasContainer().style.cursor).toBe('pointer');
	});
});
