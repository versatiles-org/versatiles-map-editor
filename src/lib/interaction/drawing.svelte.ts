import type * as maplibregl from 'maplibre-gl';
import type { StateElement } from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import type { ElementType } from '../element/registry.js';
import { type GeoPoint, circle, distance } from '../geometry.js';
import { claimEvent, isMultiTouch, trackDrag, type MapPointerEvent } from './drag.js';
import { NEW_MARKER_SYMBOL } from '../symbols_catalog.js';

/** The tool of the editor: selecting elements, or drawing a new one. */
export type Tool = 'select' | ElementType;

// A second press within this time and distance finishes a line or polygon: a double-click, also
// as a double tap, which browsers do not report as a double-click
const DOUBLE_PRESS_MS = 400;
const DOUBLE_PRESS_PX = 8;
// A click on the first node closes a polygon, within this distance
const CLOSE_PX = 10;
// The radius of a circle that is placed with a click instead of a drag
const CIRCLE_RADIUS_PX = 50;

/**
 * Draws new elements with clicks, like graphics software: a marker with one click, a line or
 * polygon with a click per node, finished with a double-click, and a circle by dragging from
 * its center. Dragging the map still pans it, except with the circle tool. After an element,
 * the tool goes back to selecting.
 */
export class DrawingHandler {
	#tool: Tool = $state('select');
	// the nodes of the line or polygon, or the center of the circle; replaced as a whole
	#points: GeoPoint[] = $state.raw([]);
	#radius = 0;
	// the mouse position, where the next node of a line or polygon would be
	private hover: GeoPoint | undefined;
	private lastPress: { time: number; x: number; y: number } | undefined;
	// the click after drawing a circle with the mouse, which must not select or deselect
	private swallowClick = false;
	private readonly doc: MapDocumentInteractive;

	/** Created before the selection, so its listeners run first and can claim the events. */
	constructor(doc: MapDocumentInteractive) {
		this.doc = doc;
		const map = doc.view.map;
		map.on('mousedown', (e) => this.handleDown(e));
		map.on('touchstart', (e) => this.handleDown(e));
		map.on('click', (e) => this.handleClick(e));
		map.on('mousemove', (e) => {
			if (this.#points.length === 0 || this.#tool === 'circle') return;
			this.hover = [e.lngLat.lng, e.lngLat.lat];
			this.render();
		});
		map.on('mouseout', () => {
			this.hover = undefined;
			this.render();
		});
	}

	public get tool(): Tool {
		return this.#tool;
	}

	/** Whether a drawing tool is chosen, instead of selecting. */
	public get active(): boolean {
		return this.#tool !== 'select';
	}

	/** The nodes of the line or polygon being drawn. */
	public get points(): GeoPoint[] {
		return this.#points;
	}

	/** Whether the line or polygon has enough nodes to finish it. */
	public get canFinish(): boolean {
		return this.#points.length >= (this.#tool === 'polygon' ? 3 : this.#tool === 'line' ? 2 : Infinity);
	}

	/** Choose a tool. An unfinished element is dropped. */
	public setTool(tool: Tool) {
		this.#points = [];
		this.#radius = 0;
		this.hover = undefined;
		this.lastPress = undefined;
		this.#tool = tool;
		const map = this.doc.view.map;
		if (this.active) {
			// the new element is selected when it is done, and a click draws instead of selecting
			this.doc.selection.selectElement();
			map.doubleClickZoom.disable();
		} else {
			// later, since the double-click that finished a line would zoom otherwise
			setTimeout(() => {
				if (!this.active) map.doubleClickZoom.enable();
			}, DOUBLE_PRESS_MS);
		}
		this.doc.cursor.togglePrecise('drawing', this.active);
		this.render();
	}

	/** Add the line or polygon to the map, if it has enough nodes. Returns whether it did. */
	public finish(): boolean {
		if (!this.canFinish) return false;
		this.create({ type: this.#tool as 'line' | 'polygon', points: this.#points });
		return true;
	}

	public removeLastPoint() {
		this.#points = this.#points.slice(0, -1);
		this.render();
	}

	private create(state: StateElement) {
		this.setTool('select');
		this.doc.addElement(state);
		this.doc.state.log();
	}

	private handleDown(e: MapPointerEvent) {
		this.swallowClick = false;
		if (this.#tool !== 'circle' || isMultiTouch(e)) return;
		claimEvent(e);
		const map = this.doc.view.map;
		const center: GeoPoint = [e.lngLat.lng, e.lngLat.lat];
		this.#points = [center];
		this.#radius = 0;
		trackDrag(
			map,
			e,
			(e) => {
				e.preventDefault();
				this.#radius = distance(center, [e.lngLat.lng, e.lngLat.lat]);
				this.render();
			},
			() => {
				// a click places a circle of a size that fits the view
				if (this.#radius === 0) {
					const edge = map.unproject([e.point.x + CIRCLE_RADIUS_PX, e.point.y]);
					this.#radius = distance(center, [edge.lng, edge.lat]);
				}
				this.swallowClick = true;
				this.create({ type: 'circle', point: center, radius: this.#radius });
			}
		);
	}

	private handleClick(e: maplibregl.MapMouseEvent) {
		if (this.swallowClick) {
			this.swallowClick = false;
			claimEvent(e);
			return;
		}
		if (!this.active) return;
		claimEvent(e);
		const point: GeoPoint = [e.lngLat.lng, e.lngLat.lat];
		if (this.#tool === 'marker') this.create({ type: 'marker', point, style: { symbol: NEW_MARKER_SYMBOL } });
		else if (this.#tool === 'line' || this.#tool === 'polygon') this.addPoint(point, e.point);
	}

	private addPoint(point: GeoPoint, pixel: { x: number; y: number }) {
		const time = performance.now();
		const last = this.lastPress;
		this.lastPress = { time, x: pixel.x, y: pixel.y };
		// the second press of a double-click finishes, and adds no node at the same place
		if (
			last &&
			time - last.time < DOUBLE_PRESS_MS &&
			Math.hypot(pixel.x - last.x, pixel.y - last.y) < DOUBLE_PRESS_PX
		) {
			this.lastPress = undefined;
			this.finish();
			return;
		}

		const points = this.#points;
		if (this.#tool === 'polygon' && points.length >= 3) {
			const first = this.doc.view.map.project(points[0]);
			if (Math.hypot(first.x - pixel.x, first.y - pixel.y) < CLOSE_PX) {
				this.finish();
				return;
			}
		}
		this.#points = [...points, point];
		this.render();
	}

	/** Show the element being drawn, with its nodes and the segment to the mouse. */
	private render() {
		const features: GeoJSON.Feature[] = [];
		const feature = (geometry: GeoJSON.Geometry): GeoJSON.Feature => ({ type: 'Feature', properties: {}, geometry });
		const points = this.#points;
		if (this.#tool === 'circle') {
			if (points.length > 0 && this.#radius > 0) {
				const ring = circle(points[0], this.#radius, 72);
				features.push(feature({ type: 'Polygon', coordinates: [[...ring, ring[0]]] }));
			}
		} else if (this.#tool === 'line' || this.#tool === 'polygon') {
			const path = this.hover ? [...points, this.hover] : points;
			if (this.#tool === 'polygon' && path.length >= 3) {
				features.push(feature({ type: 'Polygon', coordinates: [[...path, path[0]]] }));
			} else if (path.length >= 2) {
				features.push(feature({ type: 'LineString', coordinates: path }));
			}
		}
		points.forEach((coordinates) => features.push(feature({ type: 'Point', coordinates })));
		// looked up each time, since a new background map replaces the source object
		this.doc.view.map.getSource<maplibregl.GeoJSONSource>('drawing')?.setData({ type: 'FeatureCollection', features });
	}
}
