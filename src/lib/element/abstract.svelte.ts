import type * as maplibregl from 'maplibre-gl';
import type { Measurement, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import type { MapDocument } from '../map_document.svelte.js';
import {
	FILL_DEFAULTS,
	LINE_DEFAULTS,
	SYMBOL_DEFAULTS,
	type StateElement,
	type StatePopup,
	type StateStyle
} from '@versatiles/map-state';
import type { MapDocumentInteractive } from '../map_document_interactive.js';
import { ELEMENT_LAYERS, type Role } from '../rendering/index.js';

let nextId = 1;

export abstract class AbstractElement {
	protected readonly canvas: HTMLElement;
	protected readonly map: maplibregl.Map;
	protected isSelected = false;

	public readonly doc: MapDocument | MapDocumentInteractive;
	/** The id of the element's features in the shared element sources. */
	public readonly id = nextId++;
	/** The length, area or radius, shown in the style editor. */
	public measurements: Measurement[] = $state.raw([]);
	/** Text of the popup that opens on click in the viewer. Empty for no popup. */
	public popup = $state('');

	constructor(doc: MapDocument | MapDocumentInteractive) {
		this.doc = doc;
		this.map = doc.map;
		this.canvas = this.map.getCanvasContainer();
	}

	/** The map layers that draw the element, by their role in its style. */
	abstract getStyleLayers(): StyleLayers;

	public select(value: boolean) {
		this.isSelected = value;
	}

	public get selected(): boolean {
		return this.isSelected;
	}

	/** The ids of the map layers that draw the element (shared with the other elements). */
	public getLayerIds(): string[] {
		return (Object.keys(this.getStyleLayers()) as Role[]).map((role) => ELEMENT_LAYERS[role]);
	}

	/** The colors of the element, e.g. for the palette of used colors. A hidden outline has none. */
	public getColors(): string[] {
		const { symbol, fill, stroke } = this.getStyleLayers();
		const colors: string[] = [];
		if (symbol) colors.push(symbol.color);
		if (fill) colors.push(fill.color);
		// a hidden outline is not drawn (a line cannot be hidden)
		if (stroke?.visible) colors.push(stroke.color);
		return colors;
	}

	/** Called when the element is removed; the renderer removes its features with the element list. */
	public destroy(): void {}

	/** Draw the element again, after a change of its geometry or style. */
	protected updateSource() {
		this.doc.renderer.update(this);
		this.measurements = this.getMeasurements();
	}

	protected getMeasurements(): Measurement[] {
		return [];
	}

	/** The popup as part of the element state: `{ popup }`, or nothing if there is no popup. */
	protected getPopupState(): { popup?: StatePopup } {
		const text = this.popup;
		return text.trim() ? { popup: { text } } : {};
	}

	/** Whether dragging this selection node moves the whole element (instead of reshaping it). */
	public isMoveNode(properties?: Record<string, unknown>): boolean {
		void properties;
		return false;
	}

	/** Whether the node can be deleted on its own, i.e. it is a vertex and the shape keeps enough vertices. */
	public canDeleteNode(index: number): boolean {
		void index;
		return false;
	}

	/** Delete a single node. Returns false if it cannot be deleted. */
	public deleteNode(index: number): boolean {
		void index;
		return false;
	}

	/**
	 * Change the element to the state, e.g. on undo, instead of building a new one.
	 * Returns false if the state is of another type.
	 */
	public updateFromState(state: StateElement): boolean {
		const current = this.getState();
		if (current.type !== state.type) return false;
		if (JSON.stringify(current) === JSON.stringify(state)) return true;

		this.setGeometry(state);
		// the style of the state, with the defaults for the properties it leaves out
		const { symbol, fill, stroke } = this.getStyleLayers();
		if (symbol) symbol.setState({ ...SYMBOL_DEFAULTS, ...state.style });
		if (fill) fill.setState({ ...FILL_DEFAULTS, ...state.style });
		// the outline of an area has its own style, a line has only one
		const strokeStyle = fill ? (state as { strokeStyle?: StateStyle }).strokeStyle : state.style;
		if (stroke) stroke.setState({ ...LINE_DEFAULTS, ...strokeStyle });
		this.popup = state.popup?.text ?? '';
		this.updateSource();
		return true;
	}

	/** Take the geometry of a state of the same type. */
	protected abstract setGeometry(state: StateElement): void;

	public delete() {
		this.doc.removeElement(this);
		this.destroy();
	}

	/** Move the element by `dx` degrees of longitude and `dy` in mercator units (see `movePoint`). */
	abstract moveBy(dx: number, dy: number): void;
	abstract getFeature(): GeoJSON.Feature;
	abstract getSelectionNodes(): SelectionNode[];
	abstract getSelectionNodeUpdater(properties?: Record<string, unknown>): SelectionNodeUpdater | undefined;
	abstract getState(): StateElement;
}
