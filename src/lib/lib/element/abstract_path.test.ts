import type * as maplibregl from 'maplibre-gl';
import { describe, expect, it, beforeEach, vi, type Mock } from 'vitest';
import { AbstractPathElement } from './abstract_path.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { SelectionNode } from './types.js';
import type { StateElement } from '$lib/codec/types.js';
import { getMiddlePoint } from '../utils/geometry.js';

class TestPathElement extends AbstractPathElement {
	constructor(manager: GeometryManager, isLine: boolean) {
		super(manager, isLine);
	}
	isActive = true;

	isSelected = true;

	getFeature(): GeoJSON.Feature {
		return {
			type: 'Feature',
			geometry: { type: 'LineString', coordinates: this.path },
			properties: {}
		};
	}
	getState(): StateElement {
		return {
			type: 'line',
			points: [
				[100, -81],
				[102, -83]
			]
		};
	}

	getColors(): string[] {
		return [];
	}

	public handleDrag(e: maplibregl.MapMouseEvent | maplibregl.MapTouchEvent): void {
		super.handleDrag(e);
	}

	destroy() {}
}

describe('AbstractPathElement', () => {
	let mockManager: MockGeometryManager;
	let manager: GeometryManager;

	beforeEach(() => {
		mockManager = new MockGeometryManager();
		manager = mockManager as unknown as GeometryManager;
	});

	it('should initialize with empty path', () => {
		const element = new TestPathElement(manager, true);
		expect(element).toBeDefined();
		expect(element['path']).toEqual([]);
	});

	it('should generate selection nodes correctly', () => {
		const element = new TestPathElement(manager, true);
		element['path'] = [
			[0, 0],
			[10, 10]
		];
		const nodes: SelectionNode[] = element.getSelectionNodes();

		expect(nodes.length).toBe(3);
		expect(nodes[0]).toEqual({ index: 0, coordinates: [0, 0] });
		expect(nodes[1]).toEqual({
			index: 0.5,
			transparent: true,
			coordinates: getMiddlePoint([0, 0], [10, 10])
		});
		expect(nodes[2]).toEqual({ index: 1, coordinates: [10, 10] });
	});

	it('should update selection node correctly', () => {
		const element = new TestPathElement(manager, true);
		element['path'] = [
			[0, 0],
			[10, 10]
		];
		const updater = element.getSelectionNodeUpdater({ index: 1 });
		if (updater) {
			updater.update(5, 5);
			expect(element['path'][1]).toEqual([5, 5]);
		}
	});

	it('should report the dragged vertex, and insert a vertex for a dragged midpoint', () => {
		const element = new TestPathElement(manager, false);
		element.path = [
			[0, 0],
			[10, 0],
			[10, 10]
		];
		expect(element.getSelectionNodeUpdater({ index: 1 })?.vertex).toBe(1);
		// the midpoint of the closing edge becomes the last vertex
		expect(element.getSelectionNodeUpdater({ index: 2.5 })?.vertex).toBe(3);
		expect(element.path).toStrictEqual([[0, 0], [10, 0], [10, 10], getMiddlePoint([10, 10], [0, 0])]);
	});

	it('should delete a vertex', () => {
		const element = new TestPathElement(manager, true);
		element.path = [
			[0, 0],
			[10, 10],
			[20, 20]
		];
		expect(element.canDeleteNode(1)).toBe(true);
		expect(element.deleteNode(1)).toBe(true);
		expect(element.path).toStrictEqual([
			[0, 0],
			[20, 20]
		]);
	});

	it('should keep the minimum number of vertices', () => {
		const line = new TestPathElement(manager, true);
		line.path = [
			[0, 0],
			[10, 10]
		];
		expect(line.canDeleteNode(0)).toBe(false);
		expect(line.deleteNode(0)).toBe(false);
		expect(line.path.length).toBe(2);

		const polygon = new TestPathElement(manager, false);
		polygon.path = [
			[0, 0],
			[10, 0],
			[10, 10]
		];
		expect(polygon.canDeleteNode(0)).toBe(false);
		polygon.path.push([0, 10]);
		expect(polygon.canDeleteNode(0)).toBe(true);
	});

	it('should not delete midpoints or unknown nodes', () => {
		const element = new TestPathElement(manager, true);
		element.path = [
			[0, 0],
			[10, 10],
			[20, 20]
		];
		expect(element.canDeleteNode(0.5)).toBe(false);
		expect(element.canDeleteNode(3)).toBe(false);
		expect(element.canDeleteNode(-1)).toBe(false);
	});

	it('should handle drag correctly', () => {
		const element = new TestPathElement(manager, true);
		element['path'] = [
			[0, 0],
			[10, 10]
		];
		const mockEvent = {
			type: 'mousedown',
			lngLat: { lng: 5, lat: 5 },
			originalEvent: { altKey: false },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;

		const mockMoveEvent = {
			type: 'mousemove',
			lngLat: { lng: 15, lat: 15 },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;

		element.handleDrag(mockEvent);

		expect(mockManager.map.on).toHaveBeenCalledWith('mousemove', expect.any(Function));
		expect(mockManager.map.on).toHaveBeenCalledWith('mouseup', expect.any(Function));
		expect(mockEvent.preventDefault).toHaveBeenCalled();

		mockManager.map.emit('mousemove', mockMoveEvent);

		expect(element['path']).toEqual([
			[10, expect.closeTo(10.12)],
			[20, expect.closeTo(19.81)]
		]);
		expect(mockMoveEvent.preventDefault).toHaveBeenCalled();

		const log = vi.spyOn(mockManager.state, 'log');
		mockManager.map.emit('mouseup');
		expect(mockManager.map.listenerCount('mousemove')).toBe(0);
		expect(log).toHaveBeenCalled();
	});

	it('should handle a touch drag, and stop it for a pinch-zoom', () => {
		const element = new TestPathElement(manager, true);
		element.path = [
			[0, 0],
			[10, 0]
		];
		const originalEvent = { altKey: false, cancelable: true, preventDefault: vi.fn() };
		const touchEvent = (type: string, lng: number, fingers = 1) =>
			({
				type,
				lngLat: { lng, lat: 0 },
				points: new Array(fingers).fill({ x: 0, y: 0 }),
				originalEvent,
				preventDefault: vi.fn()
			}) as unknown as maplibregl.MapTouchEvent;

		const start = touchEvent('touchstart', 5);
		element.handleDrag(start);
		// the map must not pan
		expect(start.preventDefault).toHaveBeenCalled();

		mockManager.map.emit('touchmove', touchEvent('touchmove', 15));
		expect(element.path).toStrictEqual([
			[10, expect.closeTo(0)],
			[20, expect.closeTo(0)]
		]);

		// a second finger ends the drag
		mockManager.map.emit('touchmove', touchEvent('touchmove', 25, 2));
		mockManager.map.emit('touchmove', touchEvent('touchmove', 35));
		expect(element.path[0][0]).toBe(10);
		expect(mockManager.map.listenerCount('touchmove')).toBe(0);
		expect(mockManager.map.listenerCount('touchend')).toBe(0);
	});

	describe('alt-drag', () => {
		let element: TestPathElement;
		let copy: TestPathElement;
		const altEvent = {
			type: 'mousedown',
			lngLat: { lng: 5, lat: 5 },
			originalEvent: { altKey: true },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;
		const moveEvent = {
			type: 'mousemove',
			lngLat: { lng: 15, lat: 5 },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;

		beforeEach(() => {
			element = new TestPathElement(manager, true);
			element.path = [
				[0, 0],
				[10, 0]
			];
			copy = new TestPathElement(manager, true);
			copy.path = element.path.map((p) => [...p]);
			Object.assign(mockManager, { duplicateElement: vi.fn(() => copy) });
		});

		it('should move a copy instead of the original', () => {
			element.handleDrag(altEvent);
			mockManager.map.emit('mousemove', moveEvent);
			mockManager.map.emit('mousemove', moveEvent);

			expect((mockManager as unknown as { duplicateElement: Mock }).duplicateElement).toHaveBeenCalledTimes(1);
			expect(element.path).toStrictEqual([
				[0, 0],
				[10, 0]
			]);
			expect(copy.path).toStrictEqual([
				[10, expect.closeTo(0)],
				[20, expect.closeTo(0)]
			]);
		});

		it('should not create a copy on a click without moving', () => {
			element.handleDrag(altEvent);
			mockManager.map.emit('mouseup');

			expect((mockManager as unknown as { duplicateElement: Mock }).duplicateElement).not.toHaveBeenCalled();
		});
	});
});
