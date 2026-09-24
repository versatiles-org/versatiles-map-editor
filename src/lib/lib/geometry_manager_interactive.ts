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
import { stateToGeoJSON, stateFromGeoJSON, type GeoJSONDocument } from '$lib/codec/index.js';
import type { StateRoot } from '$lib/codec/types.js';

export class GeometryManagerInteractive extends GeometryManager {
	public readonly selection: SelectionHandler;
	public readonly cursor: Cursor;
	public readonly state: StateManager;

	constructor(map: maplibregl.Map) {
		super(map);
		this.cursor = new Cursor(map.getCanvasContainer());
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
		this.selection.selectElement();
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
		return {
			map: {
				center: [center.lng, center.lat],
				radius
			},
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
