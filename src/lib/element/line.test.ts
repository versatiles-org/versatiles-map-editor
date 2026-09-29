import { describe, expect, it, beforeEach, vi } from 'vitest';
import { LineElement } from './line.js';
import { MockMapDocument } from '../__mocks__/map_document.js';
import type { MapDocument } from '../map_document.svelte.js';
import type { StateElementLine } from '@versatiles/map-state';
import type { GeoPoint } from '../geometry.js';

describe('LineElement', () => {
	let mockManager: MapDocument;
	let element: LineElement;

	beforeEach(() => {
		mockManager = new MockMapDocument() as unknown as MapDocument;
		element = new LineElement(mockManager, [
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
		element = new LineElement(mockManager, customPath);
		expect(element.path).toEqual(customPath);
	});

	it('should provide the length as measurement', () => {
		element = new LineElement(mockManager, [
			[0, 0],
			[1, 0]
		]);
		expect(element.measurements).toEqual([{ label: 'Length', value: '111 km' }]);
		element.getSelectionNodeUpdater({ index: 1 })?.update(0, 0.001);
		expect(element.measurements).toEqual([{ label: 'Length', value: '111 m' }]);
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
		vi.mocked(mockManager.renderer.update).mockClear();
		element.layer.color = '#00ff00';
		expect(mockManager.renderer.update).toHaveBeenCalledWith(element);
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
		const restoredElement = LineElement.fromState(mockManager, state);

		expect(restoredElement.path).toEqual(state.points);
		expect(restoredElement.layer.getState()?.color).toBe('#00ff00');
	});

	it('stays visible with "visible: false" from a link or a file, since a line cannot be hidden', () => {
		const line = LineElement.fromState(mockManager, {
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
