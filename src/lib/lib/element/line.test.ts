import { describe, expect, it, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { LineElement } from './line.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateElementLine } from '$lib/codec/types.js';
import type { GeoPoint } from '../utils/types.js';

describe('LineElement', () => {
	let mockManager: GeometryManager;
	let element: LineElement;

	beforeEach(() => {
		mockManager = new MockGeometryManager() as unknown as GeometryManager;
		element = new LineElement(mockManager);
	});

	it('should initialize with a default path', () => {
		expect(element).toBeDefined();
		expect(element.path.length).toBe(2);
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
		expect(get(element.measurements)).toEqual([{ label: 'Length', value: '111 km' }]);
		element.getSelectionNodeUpdater({ index: 1 })?.update(0, 0.001);
		expect(get(element.measurements)).toEqual([{ label: 'Length', value: '111 m' }]);
	});

	it('should set isSelected correctly', () => {
		element.select(true);
		expect(element.layer.isSelected).toBe(true);
	});

	it('should generate a valid GeoJSON feature', () => {
		const feature = element.getFeature();
		expect(feature.type).toBe('Feature');
		expect(feature.geometry.type).toBe('LineString');
		expect(feature.geometry.coordinates).toEqual(element.path);
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
});
