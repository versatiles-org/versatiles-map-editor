import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AbstractElement } from './abstract.svelte.js';
import { MockMapDocument } from '../__mocks__/map_document.js';
import type { MapDocument } from '../map_document.svelte.js';
import type { StateElementMarker } from '@versatiles/map-state';

class TestElement extends AbstractElement {
	constructor(manager: MapDocument) {
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
	let mockManager: MapDocument;

	beforeEach(() => {
		mockManager = new MockMapDocument() as unknown as MapDocument;
	});

	it('gets a unique id for its features, and no source of its own', () => {
		const a = new TestElement(mockManager);
		const b = new TestElement(mockManager);
		expect(a.id).not.toBe(b.id);
		expect(mockManager.map.addSource).not.toHaveBeenCalled();
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
