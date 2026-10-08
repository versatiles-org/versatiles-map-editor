import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AbstractElement } from './abstract.svelte.js';
import { MockElementOwner } from './__mocks__/owner.js';
import type { ElementOwner } from './types.js';
import type { StateElementMarker } from '@versatiles/map-state';

class TestElement extends AbstractElement {
	constructor(doc: ElementOwner) {
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
	snap() {}
	getSelectionNodeUpdater() {
		return undefined;
	}

	getState(): StateElementMarker {
		return { type: 'marker', point: [0, 1] };
	}
}

describe('AbstractElement', () => {
	let mockDoc: ElementOwner;

	beforeEach(() => {
		mockDoc = new MockElementOwner();
	});

	it('gets a unique id for its features', () => {
		const a = new TestElement(mockDoc);
		const b = new TestElement(mockDoc);
		expect(a.id).not.toBe(b.id);
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
