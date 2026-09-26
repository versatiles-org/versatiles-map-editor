import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.svelte.js';
import type { SelectionNode } from './element/types.js';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { GeoPoint } from '../utils/types.js';
import { lat2mercator } from '../utils/geometry.js';
import {
	claimEvent,
	isMultiTouch,
	isTouchEvent,
	trackDrag,
	TOUCH_TOLERANCE,
	type MapPointerEvent
} from '../utils/drag.js';

// Tolerance in pixels around the mouse, so thin lines are easier to hit
const MOUSE_TOLERANCE = 3;

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

	private selectedNodeIndex: number | undefined;
	private manager: GeometryManagerInteractive;
	// The element under the mouse, for the cursor; the mouse position is handled once per frame
	private hovered: AbstractElement | undefined;
	private pointer: { x: number; y: number } | undefined;
	private frame: number | undefined;

	constructor(manager: GeometryManagerInteractive) {
		this.manager = manager;
		const map = this.manager.map;

		map.on('mousedown', (e) => this.handleDown(e));
		map.on('touchstart', (e) => this.handleDown(e));

		map.on('mouseenter', 'selection_nodes', () => {
			this.manager.cursor.togglePrecise('selection_nodes');
		});
		map.on('mouseleave', 'selection_nodes', () => {
			this.manager.cursor.togglePrecise('selection_nodes', false);
		});

		// A pointer over an element, and a grab hand over a selected one, which can be dragged
		map.on('mousemove', (e) => {
			this.pointer = e.point;
			this.frame ??= requestAnimationFrame(() => {
				this.frame = undefined;
				this.hover(this.pointer && this.manager.elementAt(this.pointer, MOUSE_TOLERANCE));
			});
		});
		map.on('mouseout', () => {
			this.pointer = undefined;
			this.hover(undefined);
		});

		map.on('click', (e) => {
			// A click on a node selects the node (in handleNodeDown) and keeps the element selected
			if (this.findNode(e)) return;
			e.preventDefault();
			const element = this.manager.elementAt(e.point, MOUSE_TOLERANCE);
			// Shift+click adds an element to the selection or removes it, like in graphics software
			if (e.originalEvent.shiftKey) {
				if (element) this.toggleElement(element);
			} else {
				this.selectElement(element);
				// a click on the element itself deselects its node
				this.selectNode();
			}
		});
	}

	private handleDown(e: MapPointerEvent) {
		if (isMultiTouch(e)) return;
		if (this.handleNodeDown(e)) return;
		this.handleElementDown(e);
	}

	/** Dragging a selected element moves all selected elements. Alt/Option-drag moves copies. */
	private handleElementDown(e: MapPointerEvent) {
		// Shift+click toggles the selection instead
		if (e.originalEvent.shiftKey) return;
		const selected = this.#selectedElements;
		const element = this.manager.elementAt(e.point, isTouchEvent(e) ? TOUCH_TOLERANCE : MOUSE_TOLERANCE, selected);
		if (!element) return;

		claimEvent(e);
		let x0 = e.lngLat.lng;
		let y0 = lat2mercator(e.lngLat.lat);
		// The copies are created on the first move, so a click creates no copies
		let targets: AbstractElement[] | undefined = e.originalEvent.altKey ? undefined : selected;
		let moved = false;
		trackDrag(
			this.manager.map,
			e,
			(e) => {
				e.preventDefault();
				moved = true;
				targets ??= this.manager.duplicateElements(selected);
				const x = e.lngLat.lng;
				const y = lat2mercator(e.lngLat.lat);
				targets.forEach((target) => target.moveBy(x - x0, y - y0));
				x0 = x;
				y0 = y;
				this.updateSelectionNodes();
			},
			() => {
				// A click (or tap) on a selected element selects only this element
				if (!moved) this.selectElement(element);
				this.manager.state.log();
			}
		);
	}

	/** The selection node at the event position, with a larger tolerance for touch. */
	private findNode(e: MapPointerEvent): Record<string, unknown> | undefined {
		const map = this.manager.map;
		if (!isTouchEvent(e)) {
			return map.queryRenderedFeatures(e.point, { layers: ['selection_nodes'] })[0]?.properties;
		}

		const { x, y } = e.point;
		const t = TOUCH_TOLERANCE;
		const features = map.queryRenderedFeatures(
			[
				[x - t, y - t],
				[x + t, y + t]
			],
			{ layers: ['selection_nodes'] }
		);
		let nearest: Record<string, unknown> | undefined;
		let minDistance = Infinity;
		for (const feature of features) {
			if (feature.geometry.type !== 'Point') continue;
			const point = map.project(feature.geometry.coordinates as GeoPoint);
			const distance = Math.hypot(point.x - x, point.y - y);
			if (distance < minDistance) {
				minDistance = distance;
				nearest = feature.properties;
			}
		}
		return nearest;
	}

	/** Returns whether a node was hit. */
	private handleNodeDown(e: MapPointerEvent): boolean {
		const element = this.selectedElement;
		if (element == null) return false;

		const properties = this.findNode(e);
		if (properties == null) return false;
		const selectedNode = element.getSelectionNodeUpdater(properties);
		if (selectedNode == null) return false;

		claimEvent(e);

		// Alt/Option-drag moves a copy. It is created on the first move, so a click creates no copy.
		let copy = e.originalEvent.altKey && element.isMoveNode(properties);
		let node = selectedNode;
		this.selectNode(selectedNode.vertex);
		trackDrag(
			this.manager.map,
			e,
			(e) => {
				e.preventDefault();
				if (copy) {
					copy = false;
					node = this.manager.duplicateElement(element).getSelectionNodeUpdater(properties) ?? node;
				}
				node.update(e.lngLat.lng, e.lngLat.lat);
				this.updateSelectionNodes();
			},
			() => {
				// A dragged midpoint became a new vertex, so the nodes change even without a move
				this.updateSelectionNodes();
				this.manager.state.log();
			}
		);
		return true;
	}

	/** Select only this element, or nothing. */
	public selectElement(element?: AbstractElement) {
		this.selectElements(element ? [element] : []);
	}

	public selectElements(selection: AbstractElement[]) {
		const current = this.#selectedElements;
		if (selection.length === current.length && selection.every((e, i) => e === current[i])) return;
		// only the elements whose selection changes, so selecting many elements takes linear time
		const was = new Set(current);
		const is = new Set(selection);
		this.manager.elements.forEach((e) => {
			if (was.has(e) !== is.has(e)) e.select(is.has(e));
		});
		this.#selectedElements = selection;
		this.selectedNodeIndex = undefined;
		this.updateSelectionNodes();
		// e.g. the element under the mouse was selected, so it can be dragged now
		this.hover(this.hovered);
	}

	private hover(element: AbstractElement | undefined) {
		this.hovered = element;
		const cursor = this.manager.cursor;
		cursor.toggleHover('elements', element !== undefined);
		cursor.toggleGrab('elements', element?.selected === true);
	}

	/** Add the element to the selection, or remove it. */
	public toggleElement(element: AbstractElement) {
		const current = this.#selectedElements;
		this.selectElements(current.includes(element) ? current.filter((e) => e !== element) : [...current, element]);
	}

	public deselectElement(element: AbstractElement) {
		this.deselectElements([element]);
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
		this.manager.state.log();
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
		this.manager.map.getSource<maplibregl.GeoJSONSource>('selection_nodes')?.setData({
			type: 'FeatureCollection',
			features: nodes.map((n) => ({
				type: 'Feature',
				properties: { index: n.index, opacity: n.transparent ? 0.3 : 1, selected: n === selected },
				geometry: { type: 'Point', coordinates: n.coordinates }
			}))
		});
	}
}
