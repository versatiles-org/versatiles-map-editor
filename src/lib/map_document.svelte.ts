import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.svelte.js';
import type { MapDocumentInteractive } from './map_document_interactive.js';
import type { SelectionHandler } from './interaction/index.js';
import type { StateManager } from './state/manager.js';
import type { ColorPalette } from './color_palette.svelte.js';
import type { StateBackground, StateLegend, MapState, StateElement } from '@versatiles/map-state';
import { elementFromState } from './element/registry.js';
import { ElementRenderer, MapStyleLoader } from './rendering/index.js';

/** Elements prepared for `elementAt`, e.g. to reuse them for every mouse move. */
export interface ElementIndex {
	layerIds: string[];
	byId: Map<number, AbstractElement>;
}

export function indexElements(elements: AbstractElement[]): ElementIndex {
	return {
		layerIds: [...new Set(elements.flatMap((element) => element.getLayerIds()))],
		byId: new Map(elements.map((element) => [element.id, element]))
	};
}

/** The northernmost latitude of the Web Mercator projection. */
const MAX_LATITUDE = 85.051129;

export class MapDocument {
	// replaced as a whole, never changed in place, so it needs no deep reactivity
	#elements: AbstractElement[] = $state.raw([]);
	public readonly map: maplibregl.Map;
	public readonly canvas: HTMLElement;
	public readonly state: StateManager | null = null;
	public readonly selection: SelectionHandler | null = null;
	public readonly colors: ColorPalette | null = null;
	/** Draws all elements. */
	public readonly renderer: ElementRenderer;
	/** Whether the read-only viewer shows an address search. */
	public search = $state(false);
	/** The legend of the map, if it has one. Replaced as a whole on every change. */
	public legend: StateLegend | undefined = $state.raw(undefined);
	/** The background map and the font of the labels, and loading their style. */
	readonly #style: MapStyleLoader;
	private destroyed = false;
	/** Whether a state is being loaded, e.g. to show a loading indicator. */
	#loading = $state(false);
	private loadingStates = 0;
	private stateRequest = 0;
	private loadedCallbacks: (() => void)[] = [];

	constructor(map: maplibregl.Map) {
		this.map = map;
		this.canvas = this.map.getCanvasContainer();
		this.renderer = new ElementRenderer(this.map);
		this.#style = new MapStyleLoader(this.map, this.renderer);
	}

	/** All elements of the map, in drawing order. Replaced as a whole on every change. */
	public get elements(): AbstractElement[] {
		return this.#elements;
	}
	public set elements(elements: AbstractElement[]) {
		this.#elements = elements;
		this.renderer.setElements(elements);
	}

	/** The background map. Undefined for the editor's default background. See `setBackground`. */
	public get background(): StateBackground | undefined {
		return this.#style.background;
	}

	/** Whether a state is being loaded, e.g. to show a loading indicator. */
	public get loading(): boolean {
		return this.#loading;
	}

	/** The font of the labels of all markers, or undefined for the font of the background map. */
	public get labelFont(): string | undefined {
		return this.#style.labelFont;
	}
	public set labelFont(font: string | undefined) {
		this.#style.labelFont = font;
	}

	/** The glyph font of the labels of the markers: their own, or the one of the background map. */
	public get font(): string {
		return this.#style.font;
	}

	/** Show another background map. The background is set at once; resolves when its style is loaded. */
	public setBackground(background?: StateBackground): Promise<void> {
		return this.#style.setBackground(background);
	}

	/** Stop pending work and remove all elements. Call before removing the map. */
	public destroy() {
		this.destroyed = true;
		this.#style.destroy();
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
		{ x, y }: { x: number; y: number },
		tolerance = 0,
		candidates: AbstractElement[] | ElementIndex = this.elements
	): AbstractElement | undefined {
		const { layerIds, byId } = Array.isArray(candidates) ? indexElements(candidates) : candidates;
		if (layerIds.length === 0) return undefined;
		const features = this.map.queryRenderedFeatures(
			[
				[x - tolerance, y - tolerance],
				[x + tolerance, y + tolerance]
			],
			{ layers: layerIds }
		);
		// the topmost first; the element layers share the element ids as feature ids
		for (const feature of features) {
			const element = typeof feature.id === 'number' ? byId.get(feature.id) : undefined;
			if (element) return element;
		}
		return undefined;
	}

	public removeElement(element: AbstractElement) {
		this.removeElements([element]);
	}

	/** Remove several elements from the map state at once, in linear time. */
	public removeElements(removed: AbstractElement[]) {
		const set = new Set(removed);
		this.elements = this.elements.filter((e) => !set.has(e));
	}

	/** Remove the elements and their map layers. */
	public deleteElements(elements: AbstractElement[]) {
		this.removeElements(elements);
		elements.forEach((element) => element.destroy());
	}

	public async loadState(state: MapState) {
		if (!state) return;
		this.clear();
		await this.setState(state);
		this.state?.history.reset(state);
	}

	/** Move the map to show the given viewport (center + radius in meters). */
	public fitViewport(viewport: NonNullable<MapState['map']>) {
		const { center, radius } = viewport;
		const dy = (radius * 360) / 40074000;
		const dx = Math.min(180, dy / Math.max(Math.cos((center[1] * Math.PI) / 180), 1e-6));
		// A viewport near a pole can reach beyond the latitudes of the map, where MapLibre throws
		const lat = (value: number) => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, value));
		const bounds: [[number, number], [number, number]] = [
			[center[0] - dx, lat(center[1] - dy)],
			[center[0] + dx, lat(center[1] + dy)]
		];
		try {
			this.map.fitBounds(bounds, { animate: false });
		} catch (error) {
			// the elements must be shown anyway
			console.error('Failed to show the viewport of the map', error);
		}
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

		if (state.map) this.fitViewport(state.map);
		this.legend = state.meta?.legend;
		this.search = state.meta?.search === true;
		this.labelFont = state.meta?.labelFont;
		if (this.colors) this.colors.scheme = state.meta?.colorScheme;
		// Only awaited when it changes, so an unchanged background restores the elements at once
		if (!this.#style.hasBackground(state.meta?.background)) {
			await this.setBackground(state.meta?.background);
			if (outdated()) return;
		}

		if (!this.#style.ready) {
			await this.#style.whenReady();
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

	/** Deselect all elements, e.g. before undo. The viewer has no selection. */
	protected deselectAll() {}
}
