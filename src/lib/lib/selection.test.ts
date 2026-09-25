import { describe, it, expect, vi, beforeEach, type Mock, type Mocked } from 'vitest';
import { get, writable, type Writable } from 'svelte/store';
import { SelectionHandler } from './selection.js';
import { MockMap } from '$lib/__mocks__/map.js';
import type * as maplibregl from 'maplibre-gl';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { Cursor } from './cursor.js';
import type { StateManager } from './state/manager.js';
import type { AbstractElement } from './element/abstract.js';

function createSelectionNode(index = 0, transparent = false, coordinates = [0, 0]) {
	return { index, transparent, coordinates };
}

describe('SelectionHandler', () => {
	let handler: SelectionHandler;
	let mockMap: MockMap;
	let mockCursor: Mocked<Cursor>;
	let mockState: Mocked<StateManager>;
	let mockElements: Writable<AbstractElement[]>;
	let mockManager: GeometryManagerInteractive;

	beforeEach(() => {
		mockMap = new MockMap();
		mockCursor = {
			togglePrecise: vi.fn()
		} as unknown as Mocked<Cursor>;
		mockState = {
			log: vi.fn()
		} as unknown as Mocked<StateManager>;
		mockElements = writable([]);
		mockManager = {
			map: mockMap,
			cursor: mockCursor,
			state: mockState,
			elements: mockElements
		} as unknown as GeometryManagerInteractive;

		vi.clearAllMocks();
		mockElements.set([]);
		handler = new SelectionHandler(mockManager);
	});

	it('should initialize with undefined selectedElement', () => {
		let value;
		handler.selectedElement.subscribe((v) => (value = v))();
		expect(value).toBeUndefined();
	});

	it('selectElement sets selected element and updates nodes', () => {
		const selectMock = vi.fn();
		const element = {
			select: selectMock,
			getSelectionNodes: vi.fn().mockReturnValue([])
		} as unknown as AbstractElement;
		mockElements.set([element]);
		handler.selectElement(element);
		let value;
		handler.selectedElement.subscribe((v) => (value = v))();
		expect(value).toBe(element);
		expect(selectMock).toHaveBeenCalledWith(true);
	});

	it('selectElement deselects previous element', () => {
		const selectMock1 = vi.fn();
		const selectMock2 = vi.fn();
		const element1 = {
			select: selectMock1,
			getSelectionNodes: vi.fn().mockReturnValue([])
		} as unknown as AbstractElement;
		const element2 = {
			select: selectMock2,
			getSelectionNodes: vi.fn().mockReturnValue([])
		} as unknown as AbstractElement;
		mockElements.set([element1, element2]);
		handler.selectElement(element1);
		handler.selectElement(element2);
		expect(selectMock1).toHaveBeenCalledWith(false);
		expect(selectMock2).toHaveBeenCalledWith(true);
	});

	it('updateSelectionNodes sets data on selectionNodes source', () => {
		const setDataMock = vi.fn();
		mockMap.getSource.mockReturnValue({ setData: setDataMock } as unknown as maplibregl.Source);
		const selectionNode = createSelectionNode(1, true, [1, 2]);
		const element = {
			getSelectionNodes: vi.fn().mockReturnValue([selectionNode])
		};
		handler.selectedElement.set(element as unknown as AbstractElement);
		handler.updateSelectionNodes();
		expect(setDataMock).toHaveBeenCalledWith({
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: { index: 1, opacity: 0.3, selected: false },
					geometry: { type: 'Point', coordinates: [1, 2] }
				}
			]
		});
	});

	it('updateSelectionNodes does nothing if no selected element', () => {
		const setDataMock = vi.fn();
		mockMap.getSource.mockReturnValue({ setData: setDataMock } as unknown as maplibregl.Source);
		handler.selectedElement.set(undefined);
		handler.updateSelectionNodes();
		expect(setDataMock).toHaveBeenCalledWith({
			type: 'FeatureCollection',
			features: []
		});
	});

	describe('handle mouse events', () => {
		it('should handle mouseenter', () => {
			mockMap.emit('mouseenter');
			expect(mockCursor.togglePrecise).toHaveBeenCalledExactlyOnceWith('selection_nodes');
		});

		it('should handle mouseleave', () => {
			mockMap.emit('mouseleave');
			expect(mockCursor.togglePrecise).toHaveBeenCalledExactlyOnceWith('selection_nodes', false);
		});

		it('should call selectElement on click if shiftKey is not pressed', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([]);
			const selectElementSpy = vi.spyOn(handler, 'selectElement');
			const event = { type: 'click', point: {}, originalEvent: { shiftKey: false }, preventDefault: vi.fn() };
			mockMap.emit('click', event);
			expect(selectElementSpy).toHaveBeenCalled();
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it('should not call selectElement on click if shiftKey is pressed', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([]);
			const selectElementSpy = vi.spyOn(handler, 'selectElement');
			const event = { type: 'click', point: {}, originalEvent: { shiftKey: true }, preventDefault: vi.fn() };
			mockMap.emit('click', event);
			expect(selectElementSpy).not.toHaveBeenCalled();
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it('should keep the selection on a click on a node', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([
				{ properties: { index: 0 } } as unknown as maplibregl.MapGeoJSONFeature
			]);
			const selectElementSpy = vi.spyOn(handler, 'selectElement');
			mockMap.emit('click', { type: 'click', point: {}, originalEvent: { shiftKey: false }, preventDefault: vi.fn() });
			expect(selectElementSpy).not.toHaveBeenCalled();
		});
	});

	describe('handle mousedown', () => {
		let element: Mocked<AbstractElement>;
		let updateMock: Mock;
		const mouseEvent = (type: string, altKey = false) => ({
			type,
			point: {},
			lngLat: { lng: 10, lat: 20 },
			originalEvent: { shiftKey: false, altKey },
			preventDefault: vi.fn()
		});

		beforeEach(() => {
			updateMock = vi.fn();
			element = {
				getSelectionNodeUpdater: vi.fn().mockReturnValue({ update: updateMock }),
				getSelectionNodes: vi.fn().mockReturnValue([]),
				isMoveNode: vi.fn(() => false)
			} as unknown as Mocked<AbstractElement>;
			handler.selectedElement.set(element);
		});

		it('should handle mousedown', () => {
			const event = mouseEvent('mousedown');
			mockMap.emit('mousedown', event);
			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockMap.queryRenderedFeatures).toHaveBeenCalledWith(event.point, { layers: ['selection_nodes'] });
		});

		it('should not call getSelectionNodeUpdater if no selected element on mousedown', () => {
			handler.selectedElement.set(undefined);
			const event = mouseEvent('mousedown');
			mockMap.emit('mousedown', event);
			expect(element.getSelectionNodeUpdater).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		it('should do nothing if no selection node is found at the mouse position', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([]);
			const event = mouseEvent('mousedown');
			expect(() => mockMap.emit('mousedown', event)).not.toThrow();
			expect(element.getSelectionNodeUpdater).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		it('should do nothing if getSelectionNodeUpdater returns null', () => {
			element.getSelectionNodeUpdater.mockReturnValue(undefined);
			mockMap.queryRenderedFeatures.mockReturnValue([
				{ properties: { foo: 1 } } as unknown as maplibregl.MapGeoJSONFeature
			]);
			const event = mouseEvent('mousedown');
			mockMap.emit('mousedown', event);
			expect(element.getSelectionNodeUpdater).toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});

		it('should handle node dragging on mousedown', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([
				{ properties: { foo: 1 } } as unknown as maplibregl.MapGeoJSONFeature
			]);
			mockMap.emit('mousedown', mouseEvent('mousedown'));
			mockMap.emit('mousemove', mouseEvent('mousemove'));
			expect(updateMock).toHaveBeenCalledWith(10, 20);

			mockMap.emit('mouseup');
			expect(mockState.log).toHaveBeenCalled();
			expect(mockMap.listenerCount('mousemove')).toBe(0);
		});

		describe('alt-drag', () => {
			let copyUpdateMock: Mock;
			let duplicateElement: Mock;

			beforeEach(() => {
				copyUpdateMock = vi.fn();
				duplicateElement = vi.fn(() => ({
					getSelectionNodeUpdater: vi.fn().mockReturnValue({ update: copyUpdateMock })
				}));
				Object.assign(mockManager, { duplicateElement });
				mockMap.queryRenderedFeatures.mockReturnValue([
					{ properties: { index: 0 } } as unknown as maplibregl.MapGeoJSONFeature
				]);
			});

			it('should move a copy when dragging a node that moves the element', () => {
				element.isMoveNode.mockReturnValue(true);
				mockMap.emit('mousedown', mouseEvent('mousedown', true));
				mockMap.emit('mousemove', mouseEvent('mousemove'));
				mockMap.emit('mousemove', mouseEvent('mousemove'));

				expect(duplicateElement).toHaveBeenCalledTimes(1);
				expect(duplicateElement).toHaveBeenCalledWith(element);
				expect(copyUpdateMock).toHaveBeenCalledTimes(2);
				expect(updateMock).not.toHaveBeenCalled();
			});

			it('should reshape the original when dragging any other node', () => {
				mockMap.emit('mousedown', mouseEvent('mousedown', true));
				mockMap.emit('mousemove', mouseEvent('mousemove'));

				expect(duplicateElement).not.toHaveBeenCalled();
				expect(updateMock).toHaveBeenCalledWith(10, 20);
			});

			it('should not create a copy on a click without moving', () => {
				element.isMoveNode.mockReturnValue(true);
				mockMap.emit('mousedown', mouseEvent('mousedown', true));
				mockMap.emit('mouseup');

				expect(duplicateElement).not.toHaveBeenCalled();
			});
		});
	});

	describe('handle touch', () => {
		let element: Mocked<AbstractElement>;
		let updateMock: Mock;
		const touchEvent = (type: string, fingers = 1) => ({
			type,
			point: { x: 100, y: 100 },
			points: new Array(fingers).fill({ x: 100, y: 100 }),
			lngLat: { lng: 10, lat: 20 },
			originalEvent: { altKey: false, cancelable: true, preventDefault: vi.fn() },
			preventDefault: vi.fn()
		});
		const nodeAt = (index: number, x: number) =>
			({
				properties: { index },
				geometry: { type: 'Point', coordinates: [x, 0] }
			}) as unknown as maplibregl.MapGeoJSONFeature;

		beforeEach(() => {
			updateMock = vi.fn();
			element = {
				getSelectionNodeUpdater: vi.fn().mockReturnValue({ update: updateMock }),
				getSelectionNodes: vi.fn().mockReturnValue([]),
				isMoveNode: vi.fn(() => false)
			} as unknown as Mocked<AbstractElement>;
			handler.selectedElement.set(element);
			// the mocked projection maps [x, 0] to the pixel (x, 0)
			mockMap.project.mockImplementation((p) => ({ x: (p as number[])[0], y: 100 }) as maplibregl.Point);
		});

		it('should pick the nearest node within the touch tolerance', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([nodeAt(1, 110), nodeAt(2, 97), nodeAt(3, 90)]);
			const event = touchEvent('touchstart');
			mockMap.emit('touchstart', event);

			expect(mockMap.queryRenderedFeatures).toHaveBeenCalledWith(
				[
					[84, 84],
					[116, 116]
				],
				{ layers: ['selection_nodes'] }
			);
			expect(element.getSelectionNodeUpdater).toHaveBeenCalledWith({ index: 2 });
			// the map must not pan
			expect(event.preventDefault).toHaveBeenCalled();
		});

		it('should drag a node with a finger', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([nodeAt(1, 100)]);
			mockMap.emit('touchstart', touchEvent('touchstart'));
			mockMap.emit('touchmove', touchEvent('touchmove'));
			expect(updateMock).toHaveBeenCalledWith(10, 20);

			// the browser must not emulate mouse events and a click, which would handle the tap again
			const end = touchEvent('touchend');
			mockMap.emit('touchend', end);
			expect(end.originalEvent.preventDefault).toHaveBeenCalled();
			expect(mockState.log).toHaveBeenCalled();
			expect(mockMap.listenerCount('touchmove')).toBe(0);
		});

		it('should leave pinch-zoom to the map', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([nodeAt(1, 100)]);
			const event = touchEvent('touchstart', 2);
			mockMap.emit('touchstart', event);
			expect(element.getSelectionNodeUpdater).not.toHaveBeenCalled();
			expect(event.preventDefault).not.toHaveBeenCalled();
		});
	});

	describe('node selection', () => {
		let element: Mocked<AbstractElement>;
		let setDataMock: Mock;
		const nodes = [
			{ index: 0, coordinates: [0, 0] },
			{ index: 0.5, transparent: true, coordinates: [5, 0] },
			{ index: 1, coordinates: [10, 0] }
		];

		beforeEach(() => {
			setDataMock = vi.fn();
			mockMap.getSource.mockReturnValue({ setData: setDataMock } as unknown as maplibregl.Source);
			element = {
				select: vi.fn(),
				getSelectionNodes: vi.fn(() => nodes),
				getSelectionNodeUpdater: vi.fn().mockReturnValue({ update: vi.fn(), vertex: 1 }),
				canDeleteNode: vi.fn(() => true),
				deleteNode: vi.fn(() => true),
				isMoveNode: vi.fn(() => false)
			} as unknown as Mocked<AbstractElement>;
			mockElements.set([element]);
			handler.selectElement(element);
		});

		const selectedNode = () => get(handler.selectedNode);

		it('should select the vertex that is pressed', () => {
			mockMap.queryRenderedFeatures.mockReturnValue([
				{ properties: { index: 1 } } as unknown as maplibregl.MapGeoJSONFeature
			]);
			mockMap.emit('mousedown', {
				type: 'mousedown',
				point: {},
				originalEvent: {},
				preventDefault: vi.fn()
			});
			expect(selectedNode()).toStrictEqual({ index: 1, coordinates: [10, 0], deletable: true });
			const features = setDataMock.mock.lastCall![0].features;
			expect(features.map((f: GeoJSON.Feature) => f.properties!.selected)).toStrictEqual([false, false, true]);
		});

		it('should not select midpoints or nodes without a vertex', () => {
			handler.selectNode(0.5);
			expect(selectedNode()).toBeUndefined();
			handler.selectNode(undefined);
			expect(selectedNode()).toBeUndefined();
		});

		it('should report whether the node can be deleted', () => {
			element.canDeleteNode.mockReturnValue(false);
			handler.selectNode(0);
			expect(selectedNode()?.deletable).toBe(false);
		});

		it('should clear the node when another element is selected', () => {
			handler.selectNode(1);
			handler.selectElement();
			expect(selectedNode()).toBeUndefined();
		});

		it('should delete the selected node', () => {
			handler.selectNode(1);
			expect(handler.deleteSelectedNode()).toBe(true);
			expect(element.deleteNode).toHaveBeenCalledWith(1);
			expect(mockState.log).toHaveBeenCalled();
			expect(selectedNode()).toBeUndefined();
		});

		it('should not delete anything without a selected node, or if the shape needs it', () => {
			expect(handler.deleteSelectedNode()).toBe(false);

			element.deleteNode.mockReturnValue(false);
			handler.selectNode(1);
			expect(handler.deleteSelectedNode()).toBe(false);
			expect(mockState.log).not.toHaveBeenCalled();
		});
	});
});
