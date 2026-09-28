import type { AbstractElement } from '../element/abstract.svelte.js';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import type { SelectionHandler } from './selection.svelte.js';
import type { GeoPoint } from '../types.js';
import { lat2mercator } from '../geometry.js';
import {
	claimEvent,
	isClaimed,
	isMultiTouch,
	isTouchEvent,
	trackDrag,
	TOUCH_TOLERANCE,
	type MapPointerEvent
} from './drag.js';

// Tolerance in pixels around the mouse, so thin lines are easier to hit
const MOUSE_TOLERANCE = 3;

/**
 * The mouse and touch on the map, for the selection: a click selects an element (Shift+click adds
 * it), dragging moves the selected elements or reshapes one at a node, and the cursor shows what
 * can be clicked or dragged. It changes the selection only through its methods.
 */
export class SelectionPointer {
	private readonly manager: GeometryManagerInteractive;
	private readonly selection: SelectionHandler;
	// The element under the mouse, for the cursor; the mouse position is handled once per frame
	private hovered: AbstractElement | undefined;
	private pointer: { x: number; y: number } | undefined;
	private frame: number | undefined;

	constructor(manager: GeometryManagerInteractive, selection: SelectionHandler) {
		this.manager = manager;
		this.selection = selection;
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
			// e.g. a click that drew an element
			if (isClaimed(e) || this.manager.drawing.active) return;
			// A click on a node selects the node (in handleNodeDown) and keeps the element selected
			if (this.findNode(e)) return;
			e.preventDefault();
			const element = this.manager.elementAt(e.point, MOUSE_TOLERANCE);
			// Shift+click adds an element to the selection or removes it, like in graphics software
			if (e.originalEvent.shiftKey) {
				if (element) this.selection.toggleElement(element);
			} else {
				this.selection.selectElement(element);
				// a click on the element itself deselects its node
				this.selection.selectNode();
			}
		});
	}

	private handleDown(e: MapPointerEvent) {
		if (isMultiTouch(e) || isClaimed(e) || this.manager.drawing.active) return;
		if (this.handleNodeDown(e)) return;
		this.handleElementDown(e);
	}

	/** Dragging a selected element moves all selected elements. Alt/Option-drag moves copies. */
	private handleElementDown(e: MapPointerEvent) {
		// Shift+click toggles the selection instead
		if (e.originalEvent.shiftKey) return;
		const selected = this.selection.selectedElements;
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
				this.selection.updateSelectionNodes();
			},
			() => {
				// A click (or tap) on a selected element selects only this element
				if (!moved) this.selection.selectElement(element);
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
		const element = this.selection.selectedElement;
		if (element == null) return false;

		const properties = this.findNode(e);
		if (properties == null) return false;
		const selectedNode = element.getSelectionNodeUpdater(properties);
		if (selectedNode == null) return false;

		claimEvent(e);

		// Alt/Option-drag moves a copy. It is created on the first move, so a click creates no copy.
		let copy = e.originalEvent.altKey && element.isMoveNode(properties);
		let node = selectedNode;
		this.selection.selectNode(selectedNode.vertex);
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
				this.selection.updateSelectionNodes();
			},
			() => {
				// A dragged midpoint became a new vertex, so the nodes change even without a move
				this.selection.updateSelectionNodes();
				this.manager.state.log();
			}
		);
		return true;
	}

	/** Show the cursor of the element under the mouse again, e.g. a grab hand once it is selected. */
	public refreshCursor() {
		this.hover(this.hovered);
	}

	private hover(element: AbstractElement | undefined) {
		this.hovered = element;
		const cursor = this.manager.cursor;
		cursor.toggleHover('elements', element !== undefined);
		cursor.toggleGrab('elements', element?.selected === true);
	}
}
