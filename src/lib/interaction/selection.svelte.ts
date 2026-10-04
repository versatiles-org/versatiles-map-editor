import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from '../element/index.js';
import type { SelectionNode } from '../element/index.js';
import type { MapDocumentInteractive } from '../editor/index.js';
import type { GeoPoint } from '../geometry.js';
import { SelectionPointer } from './selection_pointer.js';

/** The selected vertex of the selected line or polygon. */
export interface SelectedNode {
	index: number;
	coordinates: GeoPoint;
	/** Whether the shape keeps enough vertices without it. */
	deletable: boolean;
}

export class SelectionHandler {
	// replaced as a whole, so they need no deep reactivity
	#selectedElements: AbstractElement[] = $state.raw([]);
	#selectedNode: SelectedNode | undefined = $state.raw(undefined);
	#legendSelected = $state(false);

	/** All selected elements, in the order of selection. */
	public get selectedElements(): AbstractElement[] {
		return this.#selectedElements;
	}

	/** The selected element, if exactly one is selected. Only then its nodes can be edited. */
	public get selectedElement(): AbstractElement | undefined {
		return this.#selectedElements.length === 1 ? this.#selectedElements[0] : undefined;
	}

	/** The selected vertex of the selected line or polygon. */
	public get selectedNode(): SelectedNode | undefined {
		return this.#selectedNode;
	}

	/** Whether the legend is selected, to edit it. The legend and elements are not selected together. */
	public get legendSelected(): boolean {
		return this.#legendSelected;
	}

	/**
	 * The entry of the legend that was clicked last on the map, e.g. to show it in the inspector; a
	 * new object for each click, also on the same entry.
	 */
	public get legendEntry(): { index: number } | undefined {
		return this.#legendEntry;
	}
	#legendEntry: { index: number } | undefined = $state.raw();

	/** Select the legend instead of the elements, or deselect it; `entry`: the index of a clicked entry. */
	public selectLegend(selected = true, entry?: number) {
		if (selected) this.selectElements([]);
		this.#legendSelected = selected;
		if (selected && entry !== undefined) this.#legendEntry = { index: entry };
	}

	private selectedNodeIndex: number | undefined;
	private doc: MapDocumentInteractive;
	private pointer: SelectionPointer;

	constructor(doc: MapDocumentInteractive) {
		this.doc = doc;
		this.pointer = new SelectionPointer(doc, this);
	}

	/** Select only this element, or nothing. */
	public selectElement(element?: AbstractElement) {
		this.selectElements(element ? [element] : []);
	}

	public selectElements(selection: AbstractElement[]) {
		this.#legendSelected = false;
		const current = this.#selectedElements;
		if (selection.length === current.length && selection.every((e, i) => e === current[i])) return;
		// only the elements whose selection changes, so selecting many elements takes linear time
		const was = new Set(current);
		const is = new Set(selection);
		this.doc.elements.forEach((e) => {
			if (was.has(e) !== is.has(e)) e.select(is.has(e));
		});
		this.#selectedElements = selection;
		this.selectedNodeIndex = undefined;
		this.updateSelectionNodes();
		// e.g. the element under the mouse was selected, so it can be dragged now
		this.pointer.refreshCursor();
	}

	/** Add the element to the selection, or remove it. */
	public toggleElement(element: AbstractElement) {
		const current = this.#selectedElements;
		this.selectElements(current.includes(element) ? current.filter((e) => e !== element) : [...current, element]);
	}

	public deselectElements(elements: AbstractElement[]) {
		const removed = new Set(elements);
		const current = this.#selectedElements;
		if (current.some((e) => removed.has(e))) this.selectElements(current.filter((e) => !removed.has(e)));
	}

	/** Select a vertex of the selected element, or no vertex. */
	public selectNode(index?: number) {
		this.selectedNodeIndex = index;
		this.updateSelectionNodes();
	}

	/** Delete the selected vertex. Returns false if there is none, or the shape needs it. */
	public deleteSelectedNode(): boolean {
		const element = this.selectedElement;
		const index = this.selectedNodeIndex;
		if (element == null || index == null) return false;
		if (!element.deleteNode(index)) return false;
		this.selectNode();
		this.doc.state.log();
		return true;
	}

	public updateSelectionNodes() {
		const element = this.selectedElement;
		const nodes: SelectionNode[] = element?.getSelectionNodes() ?? [];
		const selectedIndex = this.selectedNodeIndex;
		const selected = nodes.find((n) => n.index === selectedIndex && !n.transparent);
		if (selected == null) this.selectedNodeIndex = undefined;
		this.#selectedNode =
			element && selected
				? { index: selected.index, coordinates: selected.coordinates, deletable: element.canDeleteNode(selected.index) }
				: undefined;

		// looked up each time, since a new background map replaces the source object
		this.doc.view.map.getSource<maplibregl.GeoJSONSource>('selection_nodes')?.setData({
			type: 'FeatureCollection',
			features: nodes.map((n) => ({
				type: 'Feature',
				properties: { index: n.index, opacity: n.transparent ? 0.3 : 1, selected: n === selected },
				geometry: { type: 'Point', coordinates: n.coordinates }
			}))
		});

		// Several selected elements cannot be reshaped, so their nodes only mark them
		const elements = this.#selectedElements;
		const marks =
			elements.length > 1 ? elements.flatMap((e) => e.getSelectionNodes().filter((n) => !n.transparent)) : [];
		this.doc.view.map.getSource<maplibregl.GeoJSONSource>('selection_marks')?.setData({
			type: 'FeatureCollection',
			features: marks.map((n) => ({
				type: 'Feature',
				properties: {},
				geometry: { type: 'Point', coordinates: n.coordinates }
			}))
		});
	}
}
