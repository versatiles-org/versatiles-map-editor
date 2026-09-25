import { describe, expect, it, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { MarkerElement } from './marker.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateElementMarker } from '$lib/codec/types.js';
import type { GeoPoint } from '../utils/types.js';

describe('MarkerElement', () => {
	let mockManager: GeometryManager;
	let element: MarkerElement;

	beforeEach(() => {
		mockManager = new MockGeometryManager() as unknown as GeometryManager;
		element = new MarkerElement(mockManager);
	});

	it('should move the whole marker with its node', () => {
		expect(element.isMoveNode()).toBe(true);
	});

	it('should have no measurements', () => {
		expect(get(element.measurements)).toEqual([]);
	});

	it('should initialize with a default point', () => {
		expect(element).toBeDefined();
		expect(element['point'].length).toBe(2);
	});

	it('should initialize with a provided point', () => {
		const customPoint: GeoPoint = [10, 20];
		element = new MarkerElement(mockManager, customPoint);
		expect(element['point']).toEqual(customPoint);
	});

	it('should set isSelected correctly', () => {
		element.select(true);
		expect(element.layer.isSelected).toBe(true);
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

	it('should call destroy correctly', () => {
		vi.spyOn(element.layer, 'destroy');
		vi.spyOn(mockManager.map, 'removeSource');

		element.destroy();

		expect(element.layer.destroy).toHaveBeenCalled();
		expect(mockManager.map.removeSource).toHaveBeenCalledWith(element.sourceId);
	});

	it('should return correct state object', () => {
		const state = element.getState();
		expect(state.type).toBe('marker');
		expect(state.point).toEqual(element['point']);
		expect(state.style).toEqual(element.layer.getState());
	});

	it('should include a popup in the state, unless it is empty', () => {
		expect(element.getState()).not.toHaveProperty('popup');
		element.popup.set('Hello');
		expect(element.getState().popup).toStrictEqual({ text: 'Hello' });
		element.popup.set(' \n ');
		expect(element.getState()).not.toHaveProperty('popup');
	});

	it('should restore from state correctly', () => {
		const state: StateElementMarker = {
			type: 'marker',
			point: [10, 20],
			style: { color: '#00ff00' }
		};
		const restoredElement = MarkerElement.fromState(mockManager, state);

		expect(restoredElement['point']).toEqual(state.point);
		expect(restoredElement.layer.getState()?.color).toBe('#00ff00');
	});

	it('should move its point', () => {
		element.point = [10, 20];
		element.moveBy(1, 0);
		expect(element.point).toStrictEqual([11, expect.closeTo(20)]);
	});
});
