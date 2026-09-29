import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MarkerElement } from './marker.js';
import { MockElementOwner } from './__mocks__/owner.js';
import type { ElementOwner } from './types.js';
import type { StateElementMarker } from '@versatiles/map-state';
import type { GeoPoint } from '../geometry.js';

describe('MarkerElement', () => {
	let mockDoc: ElementOwner;
	let element: MarkerElement;

	beforeEach(() => {
		mockDoc = new MockElementOwner();
		element = new MarkerElement(mockDoc, [0, 0]);
	});

	it('should move the whole marker with its node', () => {
		expect(element.isMoveNode()).toBe(true);
	});

	it('should have no measurements', () => {
		expect(element.measurements).toEqual([]);
	});

	it('should initialize with a provided point', () => {
		const customPoint: GeoPoint = [10, 20];
		element = new MarkerElement(mockDoc, customPoint);
		expect(element['point']).toEqual(customPoint);
	});

	it('should set isSelected correctly', () => {
		element.select(true);
		expect(element.selected).toBe(true);
	});

	it('should generate a valid GeoJSON feature', () => {
		const feature = element.getFeature();
		expect(feature.type).toBe('Feature');
		expect(feature.geometry.type).toBe('Point');
		expect(feature.geometry.coordinates).toEqual(element['point']);
	});

	it('should return correct selection nodes', () => {
		const nodes = element.getSelectionNodes();
		expect(nodes).toEqual([{ index: 0, coordinates: element['point'] }]);
	});

	it('should update selection node correctly', () => {
		const updater = element.getSelectionNodeUpdater();
		if (updater) {
			updater.update(5, 5);
			expect(element['point']).toEqual([5, 5]);
		}
	});

	it('should not delete its only node', () => {
		expect(element.canDeleteNode(0)).toBe(false);
		expect(element.deleteNode(0)).toBe(false);
	});

	it('draws itself again after a change of its style', () => {
		vi.mocked(mockDoc.elementChanged).mockClear();
		element.layer.color = '#00ff00';
		expect(mockDoc.elementChanged).toHaveBeenCalledWith(element);
	});

	it('should return correct state object', () => {
		const state = element.getState();
		expect(state.type).toBe('marker');
		expect(state.point).toEqual(element['point']);
		expect(state.style).toEqual(element.layer.getState());
	});

	it('should include a popup in the state, unless it is empty', () => {
		expect(element.getState()).not.toHaveProperty('popup');
		element.popup = 'Hello';
		expect(element.getState().popup).toStrictEqual({ text: 'Hello' });
		element.popup = ' \n ';
		expect(element.getState()).not.toHaveProperty('popup');
	});

	it('should restore from state correctly', () => {
		const state: StateElementMarker = {
			type: 'marker',
			point: [10, 20],
			style: { color: '#00ff00' }
		};
		const restoredElement = MarkerElement.fromState(mockDoc, state);

		expect(restoredElement['point']).toEqual(state.point);
		expect(restoredElement.layer.getState()?.color).toBe('#00ff00');
	});

	it('should move its point', () => {
		element.point = [10, 20];
		element.moveBy(1, 0);
		expect(element.point).toStrictEqual([11, expect.closeTo(20)]);
	});
});
