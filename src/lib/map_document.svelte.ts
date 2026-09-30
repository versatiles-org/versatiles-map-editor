import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.svelte.js';
import type { MapDocumentInteractive } from './map_document_interactive.js';
import {
	boundsOf,
	type Bounds,
	type StateBackground,
	type StateLegend,
	type MapState,
	type StateElement,
	type StateMetadata
} from '@versatiles/map-state';
import { elementFromState } from './element/registry.js';
import { MapView, type ElementIndex } from './rendering/index.js';
import { getSettings, sameBackground } from './background/index.js';

export class MapDocument {
	// replaced as a whole, never changed in place, so it needs no deep reactivity
	#elements: AbstractElement[] = $state.raw([]);
	/** The map on the screen, which shows the elements. */
	public readonly view: MapView;
	/** Whether the read-only viewer shows an address search. */
	public search = $state(false);
	/** The title of the map, e.g. for the title of the page and file names. Empty without one. */
	public title = $state('');
	/** The background map. Undefined for the editor's default background. See `setBackground`. */
	#background: StateBackground | undefined = $state.raw(undefined);
	/** The glyph font of the labels of all markers, if it is not the one of the background map. */
	#labelFont: string | undefined = $state.raw(undefined);
	/** The glyph font of the labels of the markers: their own, or the one of the background map. */
	public readonly font: string = $derived(this.#labelFont ?? getSettings(this.#background).font);
	/** Whether the labels of the background map are drawn over the areas and lines of the elements. */
	#mapLabelsOnTop = $state(false);
	/**
	 * The visible area: what a shared or embedded map shows completely. Undefined for the bounds of
	 * the elements. Part of the history, so a change can be undone.
	 */
	public frame: Bounds | undefined = $state.raw(undefined);
	/** The legend of the map, if it has one. Replaced as a whole on every change. */
	public legend: StateLegend | undefined = $state.raw(undefined);
	private destroyed = false;
	/** Whether a state is being loaded, e.g. to show a loading indicator. */
	#loading = $state(false);
	private loadingStates = 0;
	private stateRequest = 0;
	private loadedCallbacks: (() => void)[] = [];

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

	/** The font of the labels of all markers, or undefined for the font of the background map. */
	public get labelFont(): string | undefined {
		return this.#labelFont;
	}
	public set labelFont(font: string | undefined) {
		if (font === this.#labelFont) return;
		this.#labelFont = font;
		this.view.style.setFont(this.font);
	}

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
	 * Open a map. The editor looks where its camera was (`map`); without one, and always in the
	 * viewer, the map shows its frame, else its elements.
	 */
	public async loadState(state: MapState) {
		if (!state) return;
		this.clear();
		const camera = this.isInteractive() ? state.map : undefined;
		// the viewer keeps showing it when its size changes, e.g. a growing embed
		if (!camera) this.view.fitArea(state.frame, state.elements, { keep: !this.isInteractive() });
		await this.setState({ ...state, map: camera });
	}

	/** Whether a state is being loaded: until then, the map misses (some of) its elements. */
	public isLoading(): boolean {
		return this.loadingStates > 0;
	}

	/** Resolves when no state is being loaded any more. */
	public whenLoaded(): Promise<void> {
		if (!this.isLoading()) return Promise.resolve();
		return new Promise((resolve) => this.loadedCallbacks.push(resolve));
	}

	public async setState(state: MapState) {
		if (this.loadingStates++ === 0) this.#loading = true;
		try {
			await this.applyState(state);
		} finally {
			if (--this.loadingStates === 0) {
				this.#loading = false;
				const callbacks = this.loadedCallbacks;
				this.loadedCallbacks = [];
				callbacks.forEach((callback) => callback());
			}
		}
	}

	private async applyState(state: MapState) {
		if (!state) return;
		// A newer state (e.g. a quick second redo) replaces this one while it waits
		const request = ++this.stateRequest;
		const outdated = () => this.destroyed || request !== this.stateRequest;

		this.deselectAll();

		if (state.map) this.view.fitViewport(state.map);
		this.frame = state.frame;
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

	/** Take the properties of the map from the state, e.g. its legend. */
	protected applyMetadata(meta: StateMetadata | undefined) {
		this.legend = meta?.legend;
		this.search = meta?.search === true;
		this.title = meta?.title ?? '';
		this.labelFont = meta?.labelFont;
		this.mapLabelsOnTop = meta?.mapLabelsOnTop === true;
	}

	/** Deselect all elements, e.g. before undo. The viewer has no selection. */
	protected deselectAll() {}
}
