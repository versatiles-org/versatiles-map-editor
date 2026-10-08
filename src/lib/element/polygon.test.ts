import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PolygonElement } from './polygon.js';
import { MockElementOwner } from './__mocks__/owner.js';
import type { ElementOwner } from './types.js';
import type { StateElementPolygon } from '@versatiles/map-state';
import type { GeoPath } from '../geometry.js';

describe('PolygonElement', () => {
	let mockDoc: ElementOwner;
	let element: PolygonElement;

	beforeEach(() => {
		mockDoc = new MockElementOwner();
		element = new PolygonElement(mockDoc, [
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
		element = new PolygonElement(mockDoc, customPolygon);
		expect(element.path).toEqual(customPolygon);
	});

	it('should provide the area as measurement', () => {
		element = new PolygonElement(mockDoc, [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		]);
		// about 12,400 km², in square meters
		expect(element.measurements).toEqual([{ kind: 'area', value: expect.closeTo(12363718145, -1) }]);
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
		vi.mocked(mockDoc.elementChanged).mockClear();
		element.fillLayer.color = '#00ff00';
		element.strokeLayer.width = 5;
		expect(mockDoc.elementChanged).toHaveBeenCalledWith(element);
	});

	it('should return correct state object', () => {
		const state = element.getState();
		expect(state.type).toBe('polygon');
		expect(state.points).toEqual(element.path);
		expect(state.style).toEqual(element.fillLayer.getState());
		expect(state.outlineStyle).toEqual(element.strokeLayer.getState());
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
			outlineStyle: { width: 2 }
		};
		const restoredElement = PolygonElement.fromState(mockDoc, state);

		expect(restoredElement.path).toEqual(state.points);
		expect(restoredElement.fillLayer.color).toBe('#00ff00');
		expect(restoredElement.strokeLayer.width).toBe(2);
	});

	it('is drawn as a smooth closed curve through its nodes, and measured inside it', () => {
		const triangle: [number, number][] = [
			[13.3, 52.5],
			[13.5, 52.5],
			[13.4, 52.6]
		];
		element = new PolygonElement(mockDoc, triangle);
		const straight = element.measurements[0].value;
		element.smooth = true;
		const [ring] = element.getFeature().geometry.coordinates;
		// closed, through every node
		expect(ring.at(-1)).toStrictEqual(ring[0]);
		expect(ring.length).toBeGreaterThan(10);
		// a smooth ring bulges out between its nodes
		expect(element.measurements[0].value).toBeGreaterThan(straight);
		expect(PolygonElement.fromState(mockDoc, element.getState()).smooth).toBe(true);
	});
});
