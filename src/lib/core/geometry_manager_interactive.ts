import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.svelte.js';
import { GeometryManager } from './geometry_manager.svelte.js';
import { createElement, elementFromState, type ElementOfType, type ElementType } from './element/registry.js';
import { SelectionHandler } from './selection.svelte.js';
import { DrawingHandler } from './drawing.svelte.js';
import { Cursor } from './cursor.js';
import { StateManager } from './state/manager.js';
import { ColorPalette } from './color_palette.svelte.js';
import { StyleClipboard } from './style_clipboard.svelte.js';
import {
	stateToGeoJSON,
	stateFromGeoJSON,
	type GeoJSONDocument,
	type StateElement,
	type StateMetadata,
	type MapState
} from '@versatiles/map-state';
import type { GeoPoint } from '../utils/types.js';

export class GeometryManagerInteractive extends GeometryManager {
	public readonly selection: SelectionHandler;
	public readonly drawing: DrawingHandler;
	public readonly cursor: Cursor;
	public readonly state: StateManager;
	public readonly styleClipboard = new StyleClipboard();
	public readonly colors = new ColorPalette(() => this.elements.flatMap((e) => e.getColors()));

	constructor(map: maplibregl.Map) {
		super(map);
		this.cursor = new Cursor(map.getCanvasContainer());
		// Shift+click selects several elements. Box zoom (Shift+drag) would swallow these clicks.
		map.boxZoom.disable();
		// before the selection, so a click with a drawing tool draws instead of selecting
		this.drawing = new DrawingHandler(this);
		this.selection = new SelectionHandler(this);
		this.state = new StateManager(this);
	}

	protected deselectAll() {
		this.selection.selectElement();
	}

	public clear() {
		this.deselectAll();
		super.clear();
	}

	public destroy() {
		super.destroy();
		this.state.events.clear();
	}

	public isInteractive(): this is GeometryManagerInteractive {
		return true;
	}

	public removeElements(elements: AbstractElement[]) {
		this.selection.deselectElements(elements);
		super.removeElements(elements);
	}

	public addNewElement<T extends ElementType>(type: T): ElementOfType<T> {
		const element = createElement(this, type);
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
			if ('point' in state) state.point = move(state.point);
			if ('points' in state) state.points = state.points.map(move);
			return state;
		});
		return this.addElements(states);
	}

	/** Add elements from their states and select them all. */
	public addElements(states: StateElement[]): AbstractElement[] {
		const elements = states.map((state) => elementFromState(this, state));
		this.appendElements(elements);
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

	public getState(): MapState {
		const center = this.map.getCenter();
		const bounds = this.map.getBounds();
		const radiusDegrees =
			Math.min(
				bounds.getNorth() - bounds.getSouth(),
				(bounds.getEast() - bounds.getWest()) * Math.cos((center.lat * Math.PI) / 180)
			) / 2;
		const radius = 40074000 * (radiusDegrees / 360);
		const meta: StateMetadata = {};
		const background = this.background;
		if (background) meta.background = background;
		const legend = this.legend;
		if (legend) meta.legend = legend;
		const colorScheme = this.colors.scheme;
		if (colorScheme) meta.colorScheme = colorScheme;
		if (this.search) meta.search = true;
		return {
			map: {
				center: [center.lng, center.lat],
				radius
			},
			...(Object.keys(meta).length > 0 ? { meta } : {}),
			elements: this.elements.map((element) => element.getState())
		};
	}

	public addGeoJSON(doc: GeoJSONDocument | GeoJSON.GeoJSON) {
		this.addState(stateFromGeoJSON(doc));
	}

	/**
	 * Add the content of an imported file: its elements are added to the map, and the map
	 * properties it has (e.g. the background) replace the current ones.
	 */
	public addState(state: MapState) {
		if (state.map) this.fitViewport(state.map);
		const meta = state.meta ?? {};
		if (meta.background) void this.setBackground(meta.background);
		if (meta.legend) this.legend = meta.legend;
		if (meta.colorScheme) this.colors.scheme = meta.colorScheme;
		if (meta.search) this.search = true;
		this.appendElements(state.elements.map((element) => elementFromState(this, element)));
	}
}
