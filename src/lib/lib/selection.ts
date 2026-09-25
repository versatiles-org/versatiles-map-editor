import type * as maplibregl from 'maplibre-gl';
import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import type { AbstractElement } from './element/abstract.js';
import type { SelectionNode } from './element/types.js';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { GeoPoint } from './utils/types.js';
import { lat2mercator } from './utils/geometry.js';
import {
	claimEvent,
	isMultiTouch,
	isTouchEvent,
	trackDrag,
	TOUCH_TOLERANCE,
	type MapPointerEvent
} from './utils/drag.js';

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
	/** All selected elements, in the order of selection. */
	public readonly selectedElements: Writable<AbstractElement[]> = writable([]);
	/** The selected element, if exactly one is selected. Only then its nodes can be edited. */
	public readonly selectedElement: Readable<AbstractElement | undefined> = derived(this.selectedElements, (elements) =>
		elements.length === 1 ? elements[0] : undefined
	);
	public readonly selectedNode: Writable<SelectedNode | undefined> = writable(undefined);
	private selectedNodeIndex: number | undefined;
	private manager: GeometryManagerInteractive;

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
		const selected = get(this.selectedElements);
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
		const element = get(this.selectedElement);
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
		const current = get(this.selectedElements);
		if (selection.length === current.length && selection.every((e, i) => e === current[i])) return;
		get(this.manager.elements).forEach((e) => e.select(selection.includes(e)));
		this.selectedElements.set(selection);
		this.selectedNodeIndex = undefined;
		this.updateSelectionNodes();
	}

	/** Add the element to the selection, or remove it. */
	public toggleElement(element: AbstractElement) {
		const current = get(this.selectedElements);
		this.selectElements(current.includes(element) ? current.filter((e) => e !== element) : [...current, element]);
	}

	public deselectElement(element: AbstractElement) {
		this.selectElements(get(this.selectedElements).filter((e) => e !== element));
	}

	/** Select a vertex of the selected element, or no vertex. */
	public selectNode(index?: number) {
		this.selectedNodeIndex = index;
		this.updateSelectionNodes();
	}

	/** Delete the selected vertex. Returns false if there is none, or the shape needs it. */
	public deleteSelectedNode(): boolean {
		const element = get(this.selectedElement);
		const index = this.selectedNodeIndex;
		if (element == null || index == null) return false;
		if (!element.deleteNode(index)) return false;
		this.selectNode();
		this.manager.state.log();
		return true;
	}

	public updateSelectionNodes() {
		const element = get(this.selectedElement);
		const nodes: SelectionNode[] = element?.getSelectionNodes() ?? [];
		const selectedIndex = this.selectedNodeIndex;
		const selected = nodes.find((n) => n.index === selectedIndex && !n.transparent);
		if (selected == null) this.selectedNodeIndex = undefined;
		this.selectedNode.set(
			element && selected
				? { index: selected.index, coordinates: selected.coordinates, deletable: element.canDeleteNode(selected.index) }
				: undefined
		);

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
