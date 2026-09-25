import { describe, expect, it, beforeEach } from 'vitest';
import { AbstractPathElement } from './abstract_path.js';
import { MockGeometryManager } from '../__mocks__/geometry_manager.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { SelectionNode } from './types.js';
import type { StateElement } from '$lib/codec/types.js';
import { getMiddlePoint, lat2mercator } from '../utils/geometry.js';

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

	getLayerIds() {
		return [];
	}
	getColors(): string[] {
		return [];
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

	it('should move all points, keeping the shape on the map', () => {
		const element = new TestPathElement(manager, true);
		element.path = [
			[0, 0],
			[10, 10]
		];
		element.moveBy(10, lat2mercator(5) - lat2mercator(0));
		expect(element.path).toStrictEqual([
			[10, expect.closeTo(5)],
			[20, expect.closeTo(14.887, 3)]
		]);
	});
});
