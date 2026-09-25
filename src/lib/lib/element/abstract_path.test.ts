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

	public handleDrag(e: maplibregl.MapMouseEvent): void {
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

	it('should delete selection node correctly', () => {
		const element = new TestPathElement(manager, true);
		element['path'] = [
			[0, 0],
			[10, 10],
			[20, 20]
		];
		const updater = element.getSelectionNodeUpdater({ index: 1 });
		if (updater) {
			updater.delete();
			expect(element['path'].length).toBe(2);
		}
	});

	it('should handle drag correctly', () => {
		const element = new TestPathElement(manager, true);
		element['path'] = [
			[0, 0],
			[10, 10]
		];
		const mockEvent = {
			lngLat: { lng: 5, lat: 5 },
			originalEvent: { altKey: false },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;

		const mockMoveEvent = {
			lngLat: { lng: 15, lat: 15 },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;

		element.handleDrag(mockEvent);

		expect(mockManager.map.on).toHaveBeenCalledWith('mousemove', expect.any(Function));
		expect(mockManager.map.once).toHaveBeenCalledWith('mouseup', expect.any(Function));
		expect(mockEvent.preventDefault).toHaveBeenCalled();

		mockManager.map.emit('mousemove', mockMoveEvent);

		expect(element['path']).toEqual([
			[10, expect.closeTo(10.12)],
			[20, expect.closeTo(19.81)]
		]);
		expect(mockMoveEvent.preventDefault).toHaveBeenCalled();
	});

	describe('alt-drag', () => {
		let element: TestPathElement;
		let copy: TestPathElement;
		const altEvent = {
			lngLat: { lng: 5, lat: 5 },
			originalEvent: { altKey: true },
			preventDefault: vi.fn()
		} as unknown as maplibregl.MapMouseEvent;
		const moveEvent = {
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
