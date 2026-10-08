import type * as maplibregl from 'maplibre-gl';
import { elementFromState, type AbstractElement } from '../element/index.js';
import type { MapDocumentInteractive } from '../editor/index.js';
import {
	boundsOf,
	removeLegendDefaults,
	removeViewerDefaults,
	VIEWER_DEFAULTS,
	type Bounds,
	type StateBackground,
	type StateLegend,
	type MapState,
	type StateElement,
	type StateFrame,
	type StateMetadata,
	type StateViewer
} from '@versatiles/map-state';
import { MapView, type ElementIndex } from '../rendering/index.js';
import { getSettings, sameBackground } from '../background/index.js';

/** How a shared map is turned and whether viewers can turn it: a frame without its area. */
export type FrameTurn = Omit<StateFrame, 'bounds'>;

/** The turn of a frame, or undefined if it has none, e.g. only an area. */
export function turnOf(frame: StateFrame | undefined): FrameTurn | undefined {
	if (!frame) return undefined;
	const { bounds: _bounds, ...turn } = frame;
	return Object.keys(turn).length > 0 ? turn : undefined;
}

export class MapDocument {
	// replaced as a whole, never changed in place, so it needs no deep reactivity
	#elements: AbstractElement[] = $state.raw([]);
	/** The map on the screen, which shows the elements. */
	public readonly view: MapView;
	/**
	 * What a shared or embedded map shows over it, and where: the search, the zoom buttons, the
	 * legend. Without the defaults, as links store it; undefined if all have their default.
	 */
	get viewer(): StateViewer | undefined {
		return this.#viewer;
	}
	set viewer(value: StateViewer | undefined) {
		this.#viewer = removeViewerDefaults(value);
	}
	#viewer: StateViewer | undefined = $state.raw(undefined);
	/** The settings of the viewer, with the defaults, e.g. `controls.search` is "none" without a search. */
	public get controls(): Required<StateViewer> {
		return { ...VIEWER_DEFAULTS, ...this.#viewer };
	}
	/** The title of the map, e.g. for the title of the page and file names. Empty without one. */
	public title = $state('');
	/** The background map. Undefined for the editor's default background. See `setBackground`. */
	#background: StateBackground | undefined = $state.raw(undefined);
	/** The glyph font of the labels of markers without a font of their own: the one of the background map. */
	public readonly font: string = $derived(getSettings(this.#background).font);
	/** Whether the labels of the background map are drawn over the areas and lines of the elements. */
	#mapLabelsOnTop = $state(false);
	/**
	 * The visible area: what a shared or embedded map shows completely. Undefined for the bounds of
	 * the elements. Part of the history, so a change can be undone.
	 */
	public frame: Bounds | undefined = $state.raw(undefined);
	/**
	 * How a shared or embedded map is turned when it opens, and whether its viewers can turn it: the
	 * frame of the map state without its area. Undefined for north at the top, seen from straight
	 * above, free to turn. Part of the history, like the visible area.
	 */
	public frameTurn: FrameTurn | undefined = $state.raw(undefined);
	/**
	 * Whether the author can rotate and tilt the map in the editor, which else shows it with north
	 * at the top, seen from straight above. Kept with the camera, so it is not part of the history.
	 */
	public turnable = $state(false);
	/**
	 * The legend of the map, if it has one. Replaced as a whole on every change. Without the fields
	 * that have their default value, as links store it, so a legend is the same in a link, a file
	 * and the editor.
	 */
	get legend(): StateLegend | undefined {
		return this.#legend;
	}
	set legend(value: StateLegend | undefined) {
		this.#legend = value && removeLegendDefaults(value);
	}
	#legend: StateLegend | undefined = $state.raw(undefined);
	private destroyed = false;
	/** Whether a state is being loaded, e.g. to show a loading indicator. */
	#loading = $state(false);
	private loadingStates = 0;
	private stateRequest = 0;

	constructor(map: maplibregl.Map) {
		this.view = new MapView(map);
	}

	/** All elements of the map, in drawing order. Replaced as a whole on every change. */
	public get elements(): AbstractElement[] {
		return this.#elements;
	}
	public set elements(elements: AbstractElement[]) {
		this.#elements = elements;
		this.view.renderer.setElements(elements);
	}

	/** Draw an element again, after a change of its geometry or style, which the element reports. */
	public elementChanged(element: AbstractElement) {
		this.view.renderer.update(element);
	}

	/** The background map. Undefined for the editor's default background. See `setBackground`. */
	public get background(): StateBackground | undefined {
		return this.#background;
	}

	/** Whether a state is being loaded, e.g. to show a loading indicator. */
	public get loading(): boolean {
		return this.#loading;
	}

	/** Whether the labels of markers that would overlap other labels are hidden; their symbols stay. */
	public get labelOverlap(): 'show' | 'hide' {
		return this.#labelOverlap;
	}
	public set labelOverlap(overlap: 'show' | 'hide') {
		this.#labelOverlap = overlap;
		this.view.style.setLabelOptions({ overlap, minZoom: this.#labelMinZoom });
	}
	#labelOverlap: 'show' | 'hide' = $state('show');

	/** The zoom level from which the labels of markers are shown; 0 for all zoom levels. */
	public get labelMinZoom(): number {
		return this.#labelMinZoom;
	}
	public set labelMinZoom(zoom: number) {
		this.#labelMinZoom = zoom;
		this.view.style.setLabelOptions({ overlap: this.#labelOverlap, minZoom: zoom });
	}
	#labelMinZoom = $state(0);

	/**
	 * Whether the labels of the background map are drawn over the areas and lines of the elements,
	 * instead of under them. The labels of markers are always on top.
	 */
	public get mapLabelsOnTop(): boolean {
		return this.#mapLabelsOnTop;
	}
	public set mapLabelsOnTop(onTop: boolean) {
		this.#mapLabelsOnTop = onTop;
		this.view.style.setMapLabelsOnTop(onTop);
	}

	/** Show another background map. The background is set at once; resolves when its style is loaded. */
	public async setBackground(background?: StateBackground): Promise<void> {
		if (sameBackground(background, this.#background)) return;
		this.#background = background;
		await this.view.style.setBackground(background, this.font);
	}

	/** Stop pending work and remove all elements. Call before removing the map. */
	public destroy() {
		this.destroyed = true;
		this.view.destroy();
		this.clear();
	}

	public isInteractive(): this is MapDocumentInteractive {
		return false;
	}

	public clear() {
		const elements = this.elements;
		this.elements = [];
		elements.forEach((e) => e.destroy());
	}

	protected appendElement(element: AbstractElement) {
		this.appendElements([element]);
	}

	/** Append several elements at once, e.g. of an import, in linear time. */
	protected appendElements(added: AbstractElement[]) {
		if (added.length > 0) this.elements = [...this.elements, ...added];
	}

	/**
	 * The topmost element drawn at the pixel, within `tolerance` pixels.
	 * Only `candidates` are considered, e.g. the elements with a popup.
	 */
	public elementAt(
		point: { x: number; y: number },
		tolerance = 0,
		candidates: AbstractElement[] | ElementIndex = this.elements
	): AbstractElement | undefined {
		return this.view.elementAt(point, tolerance, candidates);
	}

	public removeElement(element: AbstractElement) {
		this.removeElements([element]);
	}

	/** Remove several elements from the map state at once, in linear time. */
	public removeElements(removed: AbstractElement[]) {
		const set = new Set(removed);
		this.elements = this.elements.filter((e) => !set.has(e));
	}

	/**
	 * Move the elements in the drawing order: to the front (the end of the list), one step forward
	 * past the next element, one step backward, or to the back. The moved elements keep their order.
	 */
	public moveElements(moved: AbstractElement[], to: 'front' | 'forward' | 'backward' | 'back') {
		const set = new Set(moved);
		const others = this.elements.filter((e) => !set.has(e));
		const selected = this.elements.filter((e) => set.has(e));
		if (to === 'front') return void (this.elements = [...others, ...selected]);
		if (to === 'back') return void (this.elements = [...selected, ...others]);

		// forward: the element nearest to the front first, so it makes room for the next one
		const list = [...this.elements];
		const step = to === 'forward' ? 1 : -1;
		for (const element of step > 0 ? [...selected].reverse() : selected) {
			const from = list.indexOf(element);
			const target = from + step;
			// past the next element that is not moved, if there is one
			if (target < 0 || target >= list.length || set.has(list[target])) continue;
			list.splice(from, 1);
			list.splice(target, 0, element);
		}
		this.elements = list;
	}

	/**
	 * Draw the elements in this order, e.g. after a drag in the list of elements. The same elements
	 * as before, else nothing changes.
	 */
	public setDrawingOrder(order: AbstractElement[]) {
		// each of the elements once
		const current = new Set(this.elements);
		const next = new Set(order);
		if (order.length !== current.size || next.size !== current.size || !order.every((e) => current.has(e))) return;
		this.elements = order;
	}

	/** Remove the elements for good, e.g. when they are deleted. */
	public deleteElements(elements: AbstractElement[]) {
		this.removeElements(elements);
		elements.forEach((element) => element.destroy());
	}

	/** The bounds of all elements, or undefined without elements. */
	public getBounds(): Bounds | undefined {
		return boundsOf(this.elements.map((element) => element.getState()));
	}

	/**
	 * Open a map. The editor looks where its camera was (`view`), which a session of the browser
	 * storage has, e.g. after a reload. Without one, the viewer shows the frame of the map, else its
	 * elements; the editor all its elements, so none is overlooked, and an empty map where it is.
	 * `keepView`: without a camera, the map stays where it is, e.g. for a new map.
	 */
	public async loadState(state: MapState, { keepView = false } = {}) {
		this.clear();
		const camera = this.isInteractive() ? state.view : undefined;
		// a map without a camera is not turned by one
		if (!camera) this.applyCamera(undefined);
		// the viewer keeps showing it when its size changes, e.g. a growing embed
		if (!camera && !keepView) {
			// north-up and seen from straight above, unless it has elements to show
			if (this.isInteractive()) {
				if (state.elements.length > 0) this.view.fitArea(undefined, state.elements);
			} else {
				const turn = { bearing: state.frame?.bearing, pitch: state.frame?.pitch };
				this.view.fitArea(state.frame?.bounds, state.elements, { keep: true, turn });
			}
		}
		await this.setState({ ...state, view: camera });
	}

	public async setState(state: MapState) {
		if (this.loadingStates++ === 0) this.#loading = true;
		try {
			await this.applyState(state);
		} finally {
			if (--this.loadingStates === 0) this.#loading = false;
		}
	}

	private async applyState(state: MapState) {
		// A newer state (e.g. a quick second redo) replaces this one while it waits
		const request = ++this.stateRequest;
		const outdated = () => this.destroyed || request !== this.stateRequest;

		this.deselectAll();

		if (state.view) this.applyCamera(state.view);
		this.frame = state.frame?.bounds;
		this.frameTurn = turnOf(state.frame);
		this.applyMetadata(state.meta);
		// Only awaited when it changes, so an unchanged background restores the elements at once
		if (!sameBackground(state.meta?.background, this.#background)) {
			await this.setBackground(state.meta?.background);
			if (outdated()) return;
		}

		if (!this.view.style.ready) {
			await this.view.style.whenReady();
			if (outdated()) return;
		}

		if (state.elements) this.reconcileElements(state.elements);
	}

	/**
	 * Change the elements to the states. An element is changed in place if it has the type of the
	 * state at its position, so e.g. undoing a color change rebuilds no layers. Only the others are
	 * built or removed.
	 */
	private reconcileElements(states: StateElement[]) {
		const current = this.elements;
		const next = states.map((state, i) => {
			const element = current[i];
			return element?.updateFromState(state) ? element : elementFromState(this, state);
		});
		const kept = new Set(next);
		current.filter((element) => !kept.has(element)).forEach((element) => element.destroy());
		this.elements = next;
	}

	/** Look where the camera of a map looks; the editor also turns its map like it, see there. */
	protected applyCamera(camera: MapState['view']) {
		if (camera) this.view.fitViewport(camera);
	}

	/** Take the properties of the map from the state, e.g. its legend. */
	protected applyMetadata(meta: StateMetadata | undefined) {
		this.legend = meta?.legend;
		this.viewer = meta?.viewer;
		this.title = meta?.title ?? '';
		this.labelOverlap = meta?.labels?.overlap === 'hide' ? 'hide' : 'show';
		this.labelMinZoom = meta?.labels?.minZoom ?? 0;
		this.mapLabelsOnTop = meta?.labels?.mapOnTop === true;
	}

	/** Deselect all elements, e.g. before undo. The viewer has no selection. */
	protected deselectAll() {}
}
