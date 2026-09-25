import type * as maplibregl from 'maplibre-gl';
import { get, writable, type Writable } from 'svelte/store';
import type { AbstractElement } from './element/abstract.js';
import type { SelectionNode } from './element/types.js';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { GeoPoint } from './utils/types.js';
import {
	claimEvent,
	isMultiTouch,
	isTouchEvent,
	trackDrag,
	TOUCH_TOLERANCE,
	type MapPointerEvent
} from './utils/drag.js';

/** The selected vertex of the selected line or polygon. */
export interface SelectedNode {
	index: number;
	coordinates: GeoPoint;
	/** Whether the shape keeps enough vertices without it. */
	deletable: boolean;
}

export class SelectionHandler {
	public readonly selectedElement: Writable<AbstractElement | undefined> = writable(undefined);
	public readonly selectedNode: Writable<SelectedNode | undefined> = writable(undefined);
	private selectedNodeIndex: number | undefined;
	private selectionNodes: maplibregl.GeoJSONSource | undefined;
	private manager: GeometryManagerInteractive;

	constructor(manager: GeometryManagerInteractive) {
		this.manager = manager;
		const map = this.manager.map;

		// Registered before the listeners of any element, so a node wins over the element below it
		map.on('mousedown', (e) => this.handleNodeDown(e));
		map.on('touchstart', (e) => this.handleNodeDown(e));

		map.on('mouseenter', 'selection_nodes', () => {
			this.manager.cursor.togglePrecise('selection_nodes');
		});
		map.on('mouseleave', 'selection_nodes', () => {
			this.manager.cursor.togglePrecise('selection_nodes', false);
		});

		map.on('click', (e) => {
			// A click on a node selects the node (in handleNodeDown) and keeps the element selected
			if (this.findNode(e)) return;
			if (!e.originalEvent.shiftKey) this.selectElement();
			e.preventDefault();
		});
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

	private handleNodeDown(e: MapPointerEvent) {
		const element = get(this.selectedElement);
		if (element == null) return;
		if (isMultiTouch(e)) return;

		const properties = this.findNode(e);
		if (properties == null) return;
		const selectedNode = element.getSelectionNodeUpdater(properties);
		if (selectedNode == null) return;

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
	}

	public selectElement(element?: AbstractElement) {
		if (element == get(this.selectedElement)) return;
		const elements = get(this.manager.elements);
		elements.forEach((e) => e.select(e == element));
		this.selectedElement.set(element);
		this.selectedNodeIndex = undefined;
		this.updateSelectionNodes();
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

		if (!this.selectionNodes) this.selectionNodes = this.manager.map.getSource('selection_nodes')!;
		this.selectionNodes?.setData({
			type: 'FeatureCollection',
			features: nodes.map((n) => ({
				type: 'Feature',
				properties: { index: n.index, opacity: n.transparent ? 0.3 : 1, selected: n === selected },
				geometry: { type: 'Point', coordinates: n.coordinates }
			}))
		});
	}
}
