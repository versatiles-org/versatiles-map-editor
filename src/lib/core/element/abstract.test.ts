import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AbstractElement } from './abstract.svelte.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.svelte.js';
import type { StateElementMarker } from '@versatiles/map-state';

class TestElement extends AbstractElement {
	constructor(manager: GeometryManager) {
		super(manager);
	}

	getStyleLayers() {
		return {};
	}

	setGeometry() {}

	getFeature(): GeoJSON.Feature {
		return { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} };
	}

	getSelectionNodes() {
		return [];
	}

	moveBy() {}
	getSelectionNodeUpdater() {
		return undefined;
	}

	getState(): StateElementMarker {
		return { type: 'marker', point: [0, 1] };
	}
}

describe('AbstractElement', () => {
	let mockManager: GeometryManager;

	beforeEach(() => {
		mockManager = new MockGeometryManager() as unknown as GeometryManager;
	});

	it('gets a unique id for its features, and no source of its own', () => {
		const a = new TestElement(mockManager);
		const b = new TestElement(mockManager);
		expect(a.id).not.toBe(b.id);
		expect(mockManager.map.addSource).not.toHaveBeenCalled();
	});

	it('should generate random positions', () => {
		const element = new TestElement(mockManager);
		const points = element['randomPositions'](3);
		expect(points).toHaveLength(3);
		expect(points[0]).toHaveLength(2);
	});

	it('should call destroy and delete itself', () => {
		const element = new TestElement(mockManager);
		vi.spyOn(element, 'destroy');
		vi.spyOn(mockManager, 'removeElement');

		element.delete();

		expect(element.destroy).toHaveBeenCalled();
		expect(mockManager.removeElement).toHaveBeenCalledWith(element);
	});
});
