import type * as maplibregl from 'maplibre-gl';
import { elementFromState, type AbstractElement } from '../element/index.js';
import { MapDocument } from '../document/index.js';
import { Cursor, DrawingHandler, SelectionHandler, StylePickerMode, VisibleAreaMode } from '../interaction/index.js';
import { StateManager, legendColors } from '../state/index.js';
import { ColorPalette } from './color_palette.svelte.js';
import { StyleClipboard } from './style_clipboard.svelte.js';
import {
	stateToGeoJSON,
	stateFromGeoJSON,
	type GeoJSONDocument,
	type StateElement,
	type StateMetadata,
	type MapState,
	type Bounds
} from '@versatiles/map-state';
import type { GeoPoint } from '../geometry.js';

export class MapDocumentInteractive extends MapDocument {
	public readonly selection: SelectionHandler;
	public readonly drawing: DrawingHandler;
	public readonly cursor: Cursor;
	public readonly state: StateManager;
	/** Editing the visible area (the frame), in which drawing and selecting are off. */
	public readonly visibleArea: VisibleAreaMode;
	/** Picking the style of an element with a click, e.g. for an entry of the legend. */
	public readonly stylePicker: StylePickerMode;
	public readonly styleClipboard = new StyleClipboard();
	// the colors of the legend first, so that the newest elements come first in the palette
	public readonly colors = new ColorPalette(() => [
		...legendColors(this.legend),
		...this.elements.flatMap((e) => e.getColors())
	]);

	constructor(map: maplibregl.Map) {
		super(map);
		this.cursor = new Cursor(map.getCanvasContainer());
		// first, so it can take the clicks while the visible area is edited
		this.visibleArea = new VisibleAreaMode(this);
		// also first, so it takes the click on an element
		this.stylePicker = new StylePickerMode(this);
		// before the selection, so a click with a drawing tool draws instead of selecting
		this.drawing = new DrawingHandler(this);
		this.selection = new SelectionHandler(this);
		this.state = new StateManager(this);
	}

	/** Load a map, e.g. from a file, as a new start of the history. */
	public async loadState(state: MapState, options: { keepView?: boolean } = {}) {
		await super.loadState(state, options);
		if (state) this.state.history.reset(state);
	}

	protected applyMetadata(meta: StateMetadata | undefined) {
		super.applyMetadata(meta);
		this.colors.scheme = meta?.colorScheme;
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

	public isInteractive(): this is MapDocumentInteractive {
		return true;
	}

	public removeElements(elements: AbstractElement[]) {
		this.selection.deselectElements(elements);
		super.removeElements(elements);
	}

	/** Add a copy of the element, moved by the given offset in pixels, and select it. */
	public duplicateElement(element: AbstractElement, offset: [number, number] = [0, 0]): AbstractElement {
		return this.duplicateElements([element], offset)[0];
	}

	/** Add copies of the elements, moved by the given offset in pixels, and select them. */
	public duplicateElements(elements: AbstractElement[], offset: [number, number] = [0, 0]): AbstractElement[] {
		const move = (point: GeoPoint): GeoPoint => this.view.offsetPoint(point, offset);

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
		const meta: StateMetadata = {};
		const background = this.background;
		if (background) meta.background = background;
		const legend = this.legend;
		if (legend) meta.legend = legend;
		const colorScheme = this.colors.scheme;
		if (colorScheme) meta.colorScheme = colorScheme;
		if (this.viewer) meta.viewer = this.viewer;
		const title = this.title.trim();
		if (title) meta.title = title;
		if (this.labelOverlap === 'hide') meta.labelOverlap = 'hide';
		if (this.labelMinZoom > 0) meta.labelMinZoom = this.labelMinZoom;
		if (this.mapLabelsOnTop) meta.mapLabelsOnTop = true;
		return {
			map: this.view.getViewport(),
			...(this.frame ? { frame: this.frame } : {}),
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
		if (state.map) this.view.fitViewport(state.map);
		// both frames: one that covers both; else the one there is
		if (state.frame) this.frame = this.frame ? unionOf(this.frame, state.frame) : state.frame;
		const meta = state.meta ?? {};
		if (meta.background) void this.setBackground(meta.background);
		if (meta.legend) this.legend = meta.legend;
		if (meta.colorScheme) this.colors.scheme = meta.colorScheme;
		if (meta.viewer) this.viewer = { ...this.viewer, ...meta.viewer };
		if (meta.title) this.title = meta.title;
		if (meta.labelOverlap) this.labelOverlap = meta.labelOverlap;
		if (meta.labelMinZoom) this.labelMinZoom = meta.labelMinZoom;
		if (meta.mapLabelsOnTop) this.mapLabelsOnTop = true;
		this.appendElements(state.elements.map((element) => elementFromState(this, element)));
	}
}

/** The bounds that cover both. */
function unionOf(a: Bounds, b: Bounds): Bounds {
	return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}
