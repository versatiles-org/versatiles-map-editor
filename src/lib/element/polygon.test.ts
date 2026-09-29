import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PolygonElement } from './polygon.js';
import { MockMapDocument } from '../__mocks__/map_document.js';
import type { MapDocument } from '../map_document.svelte.js';
import type { StateElementPolygon } from '@versatiles/map-state';
import type { GeoPath } from '../geometry.js';

describe('PolygonElement', () => {
	let mockManager: MapDocument;
	let element: PolygonElement;

	beforeEach(() => {
		mockManager = new MockMapDocument() as unknown as MapDocument;
		element = new PolygonElement(mockManager, [
			[0, 0],
			[1, 0],
			[0, 1]
		]);
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
		expect(element.measurements).toEqual([{ label: 'Area', value: '12,400 km²' }]);
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
