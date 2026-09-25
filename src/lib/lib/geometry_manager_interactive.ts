import type * as maplibregl from 'maplibre-gl';
import { get } from 'svelte/store';
import type { AbstractElement } from './element/abstract.js';
import { CircleElement } from './element/circle.js';
import { LineElement } from './element/line.js';
import { MarkerElement } from './element/marker.js';
import { PolygonElement } from './element/polygon.js';
import { GeometryManager, elementFromState } from './geometry_manager.js';
import { SelectionHandler } from './selection.js';
import { Cursor } from './cursor.js';
import { StateManager } from './state/manager.js';
import { ColorPalette } from './color_palette.js';
import { StyleClipboard } from './style_clipboard.js';
import { stateToGeoJSON, stateFromGeoJSON, type GeoJSONDocument } from '$lib/codec/index.js';
import type { StateElement, StateMetadata, StateRoot } from '$lib/codec/types.js';
import type { GeoPoint } from './utils/types.js';

export class GeometryManagerInteractive extends GeometryManager {
	public readonly selection: SelectionHandler;
	public readonly cursor: Cursor;
	public readonly state: StateManager;
	public readonly styleClipboard = new StyleClipboard();
	public readonly colors = new ColorPalette(() => get(this.elements).flatMap((e) => e.getColors()));

	constructor(map: maplibregl.Map) {
		super(map);
		this.cursor = new Cursor(map.getCanvasContainer());
		// Shift+click selects several elements. Box zoom (Shift+drag) would swallow these clicks.
		map.boxZoom.disable();
		this.selection = new SelectionHandler(this);
		this.state = new StateManager(this);
	}

	public clear() {
		this.selection.selectElement();
		super.clear();
	}

	public destroy() {
		super.destroy();
		this.state.events.clear();
	}

	public isInteractive(): this is GeometryManagerInteractive {
		return true;
	}

	public removeElement(element: AbstractElement) {
		this.selection.deselectElement(element);
		super.removeElement(element);
	}

	public addNewElement(type: 'marker'): MarkerElement;
	public addNewElement(type: 'line'): LineElement;
	public addNewElement(type: 'polygon'): PolygonElement;
	public addNewElement(type: 'circle'): CircleElement;
	public addNewElement(type: 'marker' | 'line' | 'polygon' | 'circle'): AbstractElement;
	public addNewElement(type: 'marker' | 'line' | 'polygon' | 'circle'): AbstractElement {
		const AbstractClass = {
			marker: MarkerElement,
			line: LineElement,
			polygon: PolygonElement,
			circle: CircleElement
		}[type];
		const element = new AbstractClass(this);
		this.appendElement(element);
		this.selection.selectElement(element);
		return element;
	}

	/** Add a copy of the element, moved by the given offset in pixels, and select it. */
	public duplicateElement(element: AbstractElement, offset: [number, number] = [0, 0]): AbstractElement {
		return this.duplicateElements([element], offset)[0];
	}

	/** Add copies of the elements, moved by the given offset in pixels, and select them. */
	public duplicateElements(elements: AbstractElement[], offset: [number, number] = [0, 0]): AbstractElement[] {
		const move = (point: GeoPoint): GeoPoint => {
			if (offset[0] === 0 && offset[1] === 0) return point;
			const { x, y } = this.map.project(point);
			const { lng, lat } = this.map.unproject([x + offset[0], y + offset[1]]);
			return [lng, lat];
		};

		const states = elements.map((element) => {
			const state: StateElement = structuredClone(element.getState());
			switch (state.type) {
				case 'marker':
				case 'circle':
					state.point = move(state.point);
					break;
				case 'line':
				case 'polygon':
					state.points = state.points.map(move);
					break;
			}
			return state;
		});
		return this.addElements(states);
	}

	/** Add elements from their states and select them all. */
	public addElements(states: StateElement[]): AbstractElement[] {
		const elements = states.map((state) => {
			const element = elementFromState(this, state);
			this.appendElement(element);
			return element;
		});
		this.selection.selectElements(elements);
		return elements;
	}

	/** Add an element from its state and select it. */
	public addElement(state: StateElement): AbstractElement {
		const element = elementFromState(this, state);
		this.appendElement(element);
		this.selection.selectElement(element);
		return element;
	}

	public getGeoJSON(): GeoJSONDocument {
		return stateToGeoJSON(this.getState());
	}

	public getState(): StateRoot {
		const center = this.map.getCenter();
		const bounds = this.map.getBounds();
		const radiusDegrees =
			Math.min(
				bounds.getNorth() - bounds.getSouth(),
				(bounds.getEast() - bounds.getWest()) * Math.cos((center.lat * Math.PI) / 180)
			) / 2;
		const radius = 40074000 * (radiusDegrees / 360);
		const meta: StateMetadata = {};
		const background = get(this.background);
		if (background) meta.background = background;
		const legend = get(this.legend);
		if (legend) meta.legend = legend;
		const colorScheme = get(this.colors.scheme);
		if (colorScheme) meta.colorScheme = colorScheme;
		return {
			map: {
				center: [center.lng, center.lat],
				radius
			},
			...(Object.keys(meta).length > 0 ? { meta } : {}),
			elements: get(this.elements).map((element) => element.getState())
		};
	}

	public addGeoJSON(doc: GeoJSONDocument | GeoJSON.GeoJSON) {
		const state = stateFromGeoJSON(doc);
		if (state.map) this.fitViewport(state.map);
		for (const element of state.elements) {
			this.appendElement(elementFromState(this, element));
		}
	}
}
