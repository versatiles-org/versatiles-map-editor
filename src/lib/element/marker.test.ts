import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MarkerElement, NEW_MARKER_SYMBOL, newMarkerState } from './marker.js';
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

	it('gives the colors that it draws: its symbol, its label and their halo', () => {
		const layer = element.layer;
		layer.color = '#0000ff';
		// without a label: the symbol and its halo
		expect(element.getColors()).toStrictEqual(['#0000ff', '#ffffff']);
		layer.label = 'Cafe';
		layer.labelColor = '#123456';
		layer.haloColor = '#000000';
		expect(element.getColors()).toStrictEqual(['#0000ff', '#123456', '#000000']);
		// the color that stands for the marker: its symbol
		expect(element.getColors('main')).toStrictEqual(['#0000ff']);
		// without a halo
		layer.haloWidth = 0;
		expect(element.getColors()).toStrictEqual(['#0000ff', '#123456']);
		// without a symbol: the label stands for it
		layer.symbol = '';
		expect(element.getColors()).toStrictEqual(['#123456']);
		expect(element.getColors('main')).toStrictEqual(['#123456']);
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

	it('keeps its point on the grid of the coordinates: 5 decimal places, about 1 m', () => {
		expect(new MarkerElement(mockDoc, [13.4000049, 52.5000051]).point).toStrictEqual([13.4, 52.50001]);
		// a dragged node
		element.getSelectionNodeUpdater()?.update(13.123456789, 52.987654321);
		expect(element.point).toStrictEqual([13.12346, 52.98765]);
		// a moved marker, once the move is done
		element.moveBy(0.0000004, 0);
		expect(element.point[0]).not.toBe(13.12346);
		element.snap();
		expect(element.point).toStrictEqual([13.12346, 52.98765]);
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

describe('newMarkerState', () => {
	it('gives the markers of the editor a pin, not the flag of markers without a symbol', () => {
		const state = newMarkerState([1, 2]);
		expect(state).toStrictEqual({ type: 'marker', point: [1, 2], style: { symbol: NEW_MARKER_SYMBOL } });
		expect(MarkerElement.fromState(new MockElementOwner(), state).layer.symbol).toBe('extras:pin-teardrop');
	});
});
