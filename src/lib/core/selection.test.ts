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
			elements: mockElements,
			elementAt: vi.fn(() => undefined)
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
		handler.selectedElements.set([element as unknown as AbstractElement]);
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
		handler.selectedElements.set([]);
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
			handler.selectedElements.set([element]);
		});

		it('should handle mousedown', () => {
			const event = mouseEvent('mousedown');
			mockMap.emit('mousedown', event);
			expect(event.preventDefault).toHaveBeenCalled();
			expect(mockMap.queryRenderedFeatures).toHaveBeenCalledWith(event.point, { layers: ['selection_nodes'] });
		});

		it('should not call getSelectionNodeUpdater if no selected element on mousedown', () => {
			handler.selectedElements.set([]);
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
			handler.selectedElements.set([element]);
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

	describe('multiple elements', () => {
		let elements: Mocked<AbstractElement>[];
		let elementAt: Mock;
		const mouseEvent = (type: string, keys: { shiftKey?: boolean; altKey?: boolean } = {}, lng = 10) => ({
			type,
			point: { x: 1, y: 2 },
			lngLat: { lng, lat: 0 },
			originalEvent: { shiftKey: false, altKey: false, ...keys },
			preventDefault: vi.fn()
		});
		const selected = () => get(handler.selectedElements);

		beforeEach(() => {
			const createElement = () =>
				({
					select: vi.fn(),
					moveBy: vi.fn(),
					getSelectionNodes: vi.fn(() => [{ index: 0, coordinates: [0, 0] }])
				}) as unknown as Mocked<AbstractElement>;
			elements = [createElement(), createElement(), createElement()];
			mockElements.set(elements);
			elementAt = mockManager.elementAt as Mock;
			// no selection node is hit
			mockMap.queryRenderedFeatures.mockReturnValue([]);
		});

		it('selects, toggles and deselects elements', () => {
			handler.selectElements([elements[0], elements[1]]);
			expect(elements.map((e) => e.select.mock.lastCall![0])).toStrictEqual([true, true, false]);
			expect(get(handler.selectedElement)).toBeUndefined();

			handler.toggleElement(elements[2]);
			handler.toggleElement(elements[0]);
			expect(selected()).toStrictEqual([elements[1], elements[2]]);

			handler.deselectElement(elements[1]);
			expect(selected()).toStrictEqual([elements[2]]);
			expect(get(handler.selectedElement)).toBe(elements[2]);
		});

		it('shows the nodes of a single element only', () => {
			const setData = vi.fn();
			mockMap.getSource.mockReturnValue({ setData } as unknown as maplibregl.Source);
			handler.selectElements([elements[0]]);
			expect(setData.mock.lastCall![0].features.length).toBe(1);
			handler.selectElements([elements[0], elements[1]]);
			expect(setData.mock.lastCall![0].features.length).toBe(0);
		});

		it('selects the clicked element, or adds it with Shift+click', () => {
			elementAt.mockReturnValue(elements[0]);
			mockMap.emit('click', mouseEvent('click'));
			expect(selected()).toStrictEqual([elements[0]]);

			elementAt.mockReturnValue(elements[1]);
			mockMap.emit('click', mouseEvent('click', { shiftKey: true }));
			expect(selected()).toStrictEqual([elements[0], elements[1]]);

			// Shift+click next to the elements keeps the selection
			elementAt.mockReturnValue(undefined);
			mockMap.emit('click', mouseEvent('click', { shiftKey: true }));
			expect(selected()).toStrictEqual([elements[0], elements[1]]);

			// a click next to the elements deselects all
			mockMap.emit('click', mouseEvent('click'));
			expect(selected()).toStrictEqual([]);
		});

		it('moves all selected elements by dragging one of them', () => {
			handler.selectElements([elements[0], elements[1]]);
			elementAt.mockReturnValue(elements[1]);
			const down = mouseEvent('mousedown', {}, 10);
			mockMap.emit('mousedown', down);
			// only the selected elements are candidates
			expect(elementAt).toHaveBeenLastCalledWith(down.point, 3, [elements[0], elements[1]]);
			expect(down.preventDefault).toHaveBeenCalled();

			mockMap.emit('mousemove', mouseEvent('mousemove', {}, 12));
			mockMap.emit('mouseup');
			expect(elements[0].moveBy).toHaveBeenCalledWith(2, 0);
			expect(elements[1].moveBy).toHaveBeenCalledWith(2, 0);
			expect(elements[2].moveBy).not.toHaveBeenCalled();
			expect(mockState.log).toHaveBeenCalled();
			expect(selected()).toStrictEqual([elements[0], elements[1]]);
		});

		it('selects only the pressed element on a click without moving', () => {
			handler.selectElements([elements[0], elements[1]]);
			elementAt.mockReturnValue(elements[1]);
			mockMap.emit('mousedown', mouseEvent('mousedown'));
			mockMap.emit('mouseup');
			expect(selected()).toStrictEqual([elements[1]]);
		});

		it('moves copies of all selected elements with Alt-drag', () => {
			const copies = [elements[2]];
			const duplicateElements = vi.fn(() => copies);
			Object.assign(mockManager, { duplicateElements });
			handler.selectElements([elements[0]]);
			elementAt.mockReturnValue(elements[0]);

			mockMap.emit('mousedown', mouseEvent('mousedown', { altKey: true }, 10));
			mockMap.emit('mousemove', mouseEvent('mousemove', {}, 11));
			mockMap.emit('mousemove', mouseEvent('mousemove', {}, 12));
			expect(duplicateElements).toHaveBeenCalledExactlyOnceWith([elements[0]]);
			expect(elements[0].moveBy).not.toHaveBeenCalled();
			expect(elements[2].moveBy).toHaveBeenCalledTimes(2);
		});

		it('does not drag with Shift or on unselected elements', () => {
			handler.selectElements([elements[0]]);

			elementAt.mockReturnValue(elements[0]);
			const shiftDown = mouseEvent('mousedown', { shiftKey: true });
			mockMap.emit('mousedown', shiftDown);
			expect(shiftDown.preventDefault).not.toHaveBeenCalled();

			elementAt.mockReturnValue(undefined);
			const down = mouseEvent('mousedown');
			mockMap.emit('mousedown', down);
			expect(down.preventDefault).not.toHaveBeenCalled();
			expect(mockMap.listenerCount('mousemove')).toBe(0);
		});

		it('drags with a finger, using a larger tolerance', () => {
			handler.selectElements([elements[0]]);
			elementAt.mockReturnValue(elements[0]);
			const touch = (type: string, lng: number) => ({
				...mouseEvent(type, {}, lng),
				points: [{ x: 1, y: 2 }],
				originalEvent: { altKey: false, shiftKey: false, cancelable: true, preventDefault: vi.fn() }
			});
			mockMap.emit('touchstart', touch('touchstart', 10));
			expect(elementAt).toHaveBeenLastCalledWith({ x: 1, y: 2 }, 16, [elements[0]]);
			mockMap.emit('touchmove', touch('touchmove', 13));
			mockMap.emit('touchend', touch('touchend', 13));
			expect(elements[0].moveBy).toHaveBeenCalledWith(3, 0);
		});
	});
});
