import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PolygonElement } from './polygon.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateElementPolygon } from '@versatiles/map-state';
import { get } from 'svelte/store';
import type { GeoPath } from '../../utils/types.js';

describe('PolygonElement', () => {
	let mockManager: GeometryManager;
	let element: PolygonElement;

	beforeEach(() => {
		mockManager = new MockGeometryManager() as unknown as GeometryManager;
		element = new PolygonElement(mockManager);
	});

	it('should initialize with a default polygon', () => {
		expect(element).toBeDefined();
		expect(element.path.length).toBe(3);
	});

	it('should initialize with a provided polygon', () => {
		const customPolygon: GeoPath = [
			[0, 0],
			[10, 10],
			[20, 20],
			[30, 30]
		];
		element = new PolygonElement(mockManager, customPolygon);
		expect(element.path).toEqual(customPolygon);
	});

	it('should provide the area as measurement', () => {
		element = new PolygonElement(mockManager, [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		]);
		expect(get(element.measurements)).toEqual([{ label: 'Area', value: '12,400 km²' }]);
	});

	it('should list the colors of the fill and the visible outline', () => {
		element.fillLayer.color = '#00ff00';
		element.strokeLayer.color = '#0000ff';
		element.strokeLayer.visible = false;
		expect(element.getColors()).toStrictEqual(['#00ff00']);
		element.strokeLayer.visible = true;
		expect(element.getColors()).toStrictEqual(['#00ff00', '#0000ff']);
	});

	it('should set isSelected correctly', () => {
		element.select(true);
		expect(element.selected).toBe(true);
	});

	it('should generate a valid GeoJSON feature', () => {
		const feature = element.getFeature();
		expect(feature.type).toBe('Feature');
		expect(feature.geometry.type).toBe('Polygon');
		expect(feature.geometry.coordinates[0]).toEqual([...element.path, element.path[0]]);
	});

	it('draws itself again after a change of its style', () => {
		vi.mocked(mockManager.renderer.update).mockClear();
		element.fillLayer.color = '#00ff00';
		element.strokeLayer.width = 5;
		expect(mockManager.renderer.update).toHaveBeenCalledWith(element);
	});

	it('should return correct state object', () => {
		const state = element.getState();
		expect(state.type).toBe('polygon');
		expect(state.points).toEqual(element.path);
		expect(state.style).toEqual(element.fillLayer.getState());
		expect(state.strokeStyle).toEqual(element.strokeLayer.getState());
	});

	it('should restore from state correctly', () => {
		const state: StateElementPolygon = {
			type: 'polygon',
			points: [
				[0, 0],
				[10, 10],
				[20, 20]
			],
			style: { color: '#00ff00' },
			strokeStyle: { width: 2 }
		};
		const restoredElement = PolygonElement.fromState(mockManager, state);

		expect(restoredElement.path).toEqual(state.points);
		expect(restoredElement.fillLayer.color).toBe('#00ff00');
		expect(restoredElement.strokeLayer.width).toBe(2);
	});
});
