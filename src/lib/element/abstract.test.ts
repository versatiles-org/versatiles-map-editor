import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AbstractElement } from './abstract.svelte.js';
import { MockMapDocument } from '../__mocks__/map_document.js';
import type { MapDocument } from '../map_document.svelte.js';
import type { StateElementMarker } from '@versatiles/map-state';

class TestElement extends AbstractElement {
	constructor(doc: MapDocument) {
		super(doc);
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
	let mockDoc: MapDocument;

	beforeEach(() => {
		mockDoc = new MockMapDocument() as unknown as MapDocument;
	});

	it('gets a unique id for its features, and no source of its own', () => {
		const a = new TestElement(mockDoc);
		const b = new TestElement(mockDoc);
		expect(a.id).not.toBe(b.id);
		expect(mockDoc.map.addSource).not.toHaveBeenCalled();
	});

	it('should call destroy and delete itself', () => {
		const element = new TestElement(mockDoc);
		vi.spyOn(element, 'destroy');
		vi.spyOn(mockDoc, 'removeElement');

		element.delete();

		expect(element.destroy).toHaveBeenCalled();
		expect(mockDoc.removeElement).toHaveBeenCalledWith(element);
	});
});
