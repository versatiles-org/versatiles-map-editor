import { describe, it, expect, vi, beforeEach, type Mock, type Mocked } from 'vitest';
import { SelectionHandler } from './selection.svelte.js';
import { MockMap } from './__mocks__/map.js';
import type * as maplibregl from 'maplibre-gl';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { Cursor } from './cursor.js';
import type { StateManager } from './state/manager.js';
import type { AbstractElement } from './element/abstract.svelte.js';

function createSelectionNode(index = 0, transparent = false, coordinates = [0, 0]) {
	return { index, transparent, coordinates };
}

describe('SelectionHandler', () => {
	let handler: SelectionHandler;
	let mockMap: MockMap;
	let mockCursor: Mocked<Cursor>;
	let mockState: Mocked<StateManager>;
	let mockManager: GeometryManagerInteractive;

	beforeEach(() => {
		mockMap = new MockMap();
		mockCursor = {
			togglePrecise: vi.fn(),
			toggleHover: vi.fn(),
			toggleGrab: vi.fn()
		} as unknown as Mocked<Cursor>;
		mockState = {
			log: vi.fn()
		} as unknown as Mocked<StateManager>;
		mockManager = {
			map: mockMap,
			cursor: mockCursor,
			state: mockState,
			elements: [],
			elementAt: vi.fn(() => undefined),
			drawing: { active: false }
		} as unknown as GeometryManagerInteractive;

		vi.clearAllMocks();
		handler = new SelectionHandler(mockManager);
	});

	it('should initialize with undefined selectedElement', () => {
		expect(handler.selectedElement).toBeUndefined();
	});

	it('selects either the legend or elements', () => {
		const element = {
			select: vi.fn(),
			getSelectionNodes: vi.fn().mockReturnValue([])
		} as unknown as AbstractElement;
		mockManager.elements = [element];
		handler.selectElement(element);

		handler.selectLegend();
		expect(handler.legendSelected).toBe(true);
		expect(handler.selectedElements).toStrictEqual([]);

		handler.selectElement(element);
		expect(handler.legendSelected).toBe(false);

		// deselecting everything, e.g. with a click on the empty map
		handler.selectLegend();
		handler.selectElement();
		expect(handler.legendSelected).toBe(false);
	});

	it('selectElement sets selected element and updates nodes', () => {
		const selectMock = vi.fn();
		const element = {
			select: selectMock,
			getSelectionNodes: vi.fn().mockReturnValue([])
		} as unknown as AbstractElement;
		mockManager.elements = [element];
		handler.selectElement(element);
		expect(handler.selectedElement).toBe(element);
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
		mockManager.elements = [element1, element2];
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
		handler.selectElements([element as unknown as AbstractElement]);
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
		handler.selectElements([]);
		handler.updateSelectionNodes();
		expect(setDataMock).toHaveBeenCalledWith({
			type: 'FeatureCollection',
			features: []
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
			mockMap.getSource.mockImplementation(
				(id: string) =>
					(id === 'selection_nodes' ? { setData: setDataMock } : undefined) as unknown as maplibregl.Source
			);
			element = {
				select: vi.fn(),
				getSelectionNodes: vi.fn(() => nodes),
				getSelectionNodeUpdater: vi.fn().mockReturnValue({ update: vi.fn(), vertex: 1 }),
				canDeleteNode: vi.fn(() => true),
				deleteNode: vi.fn(() => true),
				isMoveNode: vi.fn(() => false)
			} as unknown as Mocked<AbstractElement>;
			mockManager.elements = [element];
			handler.selectElement(element);
		});

		const selectedNode = () => handler.selectedNode;

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
		const selected = () => handler.selectedElements;

		beforeEach(() => {
			const createElement = () =>
				({
					select: vi.fn(),
					moveBy: vi.fn(),
					getSelectionNodes: vi.fn(() => [{ index: 0, coordinates: [0, 0] }])
				}) as unknown as Mocked<AbstractElement>;
			elements = [createElement(), createElement(), createElement()];
			mockManager.elements = elements;
		});

		it('selects, toggles and deselects elements', () => {
			handler.selectElements([elements[0], elements[1]]);
			// only the elements whose selection changes
			expect(elements.map((e) => e.select.mock.calls)).toStrictEqual([[[true]], [[true]], []]);
			expect(handler.selectedElement).toBeUndefined();

			handler.toggleElement(elements[2]);
			handler.toggleElement(elements[0]);
			expect(selected()).toStrictEqual([elements[1], elements[2]]);

			handler.deselectElement(elements[1]);
			expect(selected()).toStrictEqual([elements[2]]);
			expect(handler.selectedElement).toBe(elements[2]);
		});
		it('shows the nodes of a single element, and marks several elements', () => {
			const sources = { selection_nodes: { setData: vi.fn() }, selection_marks: { setData: vi.fn() } };
			mockMap.getSource.mockImplementation(
				(id: string) => sources[id as keyof typeof sources] as unknown as maplibregl.Source
			);
			const count = (id: keyof typeof sources) => sources[id].setData.mock.lastCall![0].features.length;
			handler.selectElements([elements[0]]);
			expect([count('selection_nodes'), count('selection_marks')]).toStrictEqual([1, 0]);
			handler.selectElements([elements[0], elements[1]]);
			expect([count('selection_nodes'), count('selection_marks')]).toStrictEqual([0, 2]);
			handler.selectElements([]);
			expect([count('selection_nodes'), count('selection_marks')]).toStrictEqual([0, 0]);
		});
	});
});
