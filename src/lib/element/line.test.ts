import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LineElement } from './line.js';
import { MockMapDocument } from '../__mocks__/map_document.js';
import type { MapDocument } from '../map_document.svelte.js';
import type { StateElementLine } from '@versatiles/map-state';
import type { GeoPoint } from '../geometry.js';

describe('LineElement', () => {
	let mockDoc: MapDocument;
	let element: LineElement;

	beforeEach(() => {
		mockDoc = new MockMapDocument() as unknown as MapDocument;
		element = new LineElement(mockDoc, [
			[0, 0],
			[1, 1]
		]);
	});

	it('should initialize with a provided path', () => {
		const customPath: GeoPoint[] = [
			[0, 0],
			[10, 10],
			[20, 20]
		];
		element = new LineElement(mockDoc, customPath);
		expect(element.path).toEqual(customPath);
	});

	it('should provide the length as measurement', () => {
		element = new LineElement(mockDoc, [
			[0, 0],
			[1, 0]
		]);
		// a degree of longitude at the equator, in meters
		expect(element.measurements).toEqual([{ kind: 'length', value: expect.closeTo(111195, 0) }]);
		element.getSelectionNodeUpdater({ index: 1 })?.update(0, 0.001);
		expect(element.measurements).toEqual([{ kind: 'length', value: expect.closeTo(111.2, 1) }]);
	});

	it('should set isSelected correctly', () => {
		element.select(true);
		expect(element.selected).toBe(true);
	});

	it('should generate a valid GeoJSON feature', () => {
		const feature = element.getFeature();
		expect(feature.type).toBe('Feature');
		expect(feature.geometry.type).toBe('LineString');
		expect(feature.geometry.coordinates).toEqual(element.path);
	});

	it('draws itself again after a change of its style', () => {
		vi.mocked(mockDoc.elementChanged).mockClear();
		element.layer.color = '#00ff00';
		expect(mockDoc.elementChanged).toHaveBeenCalledWith(element);
	});

	it('should return correct state object', () => {
		const state = element.getState();
		expect(state.type).toBe('line');
		expect(state.points).toEqual(element.path);
		expect(state.style).toEqual(element.layer.getState());
	});

	it('should restore from state correctly', () => {
		const state: StateElementLine = {
			type: 'line',
			points: [
				[0, 0],
				[10, 10]
			],
			style: { color: '#00ff00' }
		};
		const restoredElement = LineElement.fromState(mockDoc, state);

		expect(restoredElement.path).toEqual(state.points);
		expect(restoredElement.layer.getState()?.color).toBe('#00ff00');
	});

	it('stays visible with "visible: false" from a link or a file, since a line cannot be hidden', () => {
		const line = LineElement.fromState(mockDoc, {
			type: 'line',
			points: [
				[1, 2],
				[3, 4]
			],
			style: { visible: false, color: '#00ff00' }
		});
		expect(line.layer.getProperties()).toBeDefined();
		expect(line.getState().style).toStrictEqual({ color: '#00ff00' });
	});
});
