import type { ElementOwner, Measurement, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import type { StateElement, StatePopup, StateStyle } from '@versatiles/map-state';

let nextId = 1;

export abstract class AbstractElement {
	protected isSelected = false;

	/** The document that holds the element, which it reports its changes to. */
	protected readonly doc: ElementOwner;
	/** The id of the element's features in the shared element sources. */
	public readonly id = nextId++;
	/** The length, area or radius, shown in the style editor. */
	public measurements: Measurement[] = $state.raw([]);
	/** Text of the popup that opens on click in the viewer. Empty for no popup. */
	public popup = $state('');

	constructor(doc: ElementOwner) {
		this.doc = doc;
	}

	/** The parts of the element's style, by their role. */
	abstract getStyleLayers(): StyleLayers;

	public select(value: boolean) {
		this.isSelected = value;
	}

	public get selected(): boolean {
		return this.isSelected;
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

	/** Called when the element is removed; its features go with the list of the document's elements. */
	public destroy(): void {}

	/** Report a change of the geometry or the style, e.g. so the map draws the element again. */
	protected changed() {
		this.doc.elementChanged(this);
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
		const { symbol, fill, stroke } = this.getStyleLayers();
		symbol?.setState(state.style);
		fill?.setState(state.style);
		// the outline of an area has its own style, a line has only one
		stroke?.setState(fill ? (state as { strokeStyle?: StateStyle }).strokeStyle : state.style);
		this.popup = state.popup?.text ?? '';
		this.changed();
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
