import { MapLayer } from './abstract.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { LayerFill } from './types.js';
import type { StateStyle } from '$lib/codec/types.js';
import { describe, expect, it, beforeEach } from 'vitest';
import type { GeometryManager } from '../geometry_manager.js';

class TestLayer extends MapLayer<LayerFill> {
	getState(): StateStyle {
		return { halo: 1 };
	}
}

describe('MapLayer', () => {
	let mockManager: MockGeometryManager;
	let layer: TestLayer;

	beforeEach(() => {
		mockManager = new MockGeometryManager();

		layer = new TestLayer(mockManager as unknown as GeometryManager, 'test-layer');
	});

	it('should initialize layer with given ID', () => {
		expect(layer).toBeDefined();
		expect(layer.isSelected).toBe(false);
	});

	it('should add layer to map', () => {
		layer.addLayer('source', 'fill', {}, {});
		expect(mockManager.map.addLayer).toHaveBeenCalledWith(
			{ id: 'test-layer', source: 'source', type: 'fill', layout: {}, paint: {} },
			'selection_nodes'
		);
	});

	it('should update paint property', () => {
		layer.setPaint({ 'fill-color': 'red' });
		expect(mockManager.map.setPaintProperty).toHaveBeenCalledWith('test-layer', 'fill-color', 'red');
	});

	it('should update layout property', () => {
		layer.updateLayout({ visibility: 'none' });
		expect(mockManager.map.setLayoutProperty).toHaveBeenCalledWith('test-layer', 'visibility', 'none');
	});

	it('should remove layer on destroy', () => {
		layer.destroy();
		expect(mockManager.map.removeLayer).toHaveBeenCalledWith('test-layer');
	});

	it('should unregister all map listeners on destroy', () => {
		layer.addLayer('source', 'fill', {}, {});
		expect(mockManager.map.listenerCount(undefined, 'test-layer')).toBe(6);

		layer.destroy();
		expect(mockManager.map.listenerCount(undefined, 'test-layer')).toBe(0);
	});

	it('should reset the cursor on destroy', () => {
		layer.addLayer('source', 'fill', {}, {});
		layer.destroy();
		expect(mockManager.cursor.toggleHover).toHaveBeenCalledWith('test-layer', false);
		expect(mockManager.cursor.toggleGrab).toHaveBeenCalledWith('test-layer', false);
	});

	it('should return state object', () => {
		expect(layer.getState()).toEqual({ halo: 1 });
	});
});
