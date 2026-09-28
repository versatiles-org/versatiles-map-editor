import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.svelte.js';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { SelectionHandler } from './interaction/index.js';
import type { StateManager } from './state/manager.js';
import type { ColorPalette } from './color_palette.svelte.js';
import type { StateBackground, StateLegend, MapState, StateElement } from '@versatiles/map-state';
import { inlineSources } from '@versatiles/style';
import { elementFromState } from './element/registry.js';
import { ELEMENT_LAYERS, ElementRenderer } from './element_renderer.js';
import { buildStyle, keepElements } from './editor_style.js';
import { getSettings } from './background/index.js';
import { addFillPatternImage } from './map_layer/index.js';
import { loadSymbols, spriteSheets } from './symbols_catalog.js';

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

export class GeometryManager {
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
	/** The background map. Undefined for the editor's default background. */
	#background: StateBackground | undefined = $state.raw(undefined);
	/** The glyph font of the labels of all markers, if it is not the one of the background map. */
	#labelFont: string | undefined = $state.raw(undefined);
	/** The glyph font of the labels of the markers: their own, or the one of the background map. */
	public readonly font: string = $derived(this.#labelFont ?? getSettings(this.#background).font);
	private destroyed = false;
	private readonly abortController = new AbortController();
	// The map has no style until inlineSources() finishes, so elements must wait for it
	private styleLoaded = false;
	private styleRequest = 0;
	/** Whether a state is being loaded, e.g. to show a loading indicator. */
	#loading = $state(false);
	private loadingStates = 0;
	private stateRequest = 0;
	private loadedCallbacks: (() => void)[] = [];

	constructor(map: maplibregl.Map) {
		this.map = map;
		this.canvas = this.map.getCanvasContainer();
		this.map.on('style.load', () => {
			this.styleLoaded = true;
			// e.g. a label font that was set while the style loaded
			this.applyLabelFont();
		});
		// the images of the fill patterns are made when the map needs them, e.g. again after a new style
		this.map.setMissingStyleImageResolver((id) => void addFillPatternImage(this.map, id));
		this.renderer = new ElementRenderer(this.map);
		void this.loadStyle(undefined);
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
		// without a new style; the next style has it too (see `loadStyle`)
		this.applyLabelFont();
	}

	/** Set the font on the layer of the markers, once the style has it. */
	private applyLabelFont() {
		if (this.styleLoaded && this.map.getLayer(ELEMENT_LAYERS.symbol)) {
			this.map.setLayoutProperty(ELEMENT_LAYERS.symbol, 'text-font', ['literal', [this.font]]);
		}
	}

	/** Show another background map. The background is set at once; resolves when its style is loaded. */
	public async setBackground(background?: StateBackground) {
		if (sameBackground(background, this.#background)) return;
		this.#background = background;
		await this.loadStyle(background);
	}

	private async loadStyle(background: StateBackground | undefined) {
		const request = ++this.styleRequest;
		// The sprite sheets with all symbols, loaded once for all maps. The style needs them for
		// its sprites and for the places of the labels around the symbols.
		await loadSymbols();
		if (this.destroyed || request !== this.styleRequest) return;
		const style = buildStyle(background, this.#labelFont);
		style.sprite = spriteSheets();

		// The tile server's TileJSON uses relative tile URLs, which MapLibre cannot resolve itself.
		// The download is aborted and its result ignored once the manager is destroyed.
		const signal = this.abortController.signal;
		let inlined = style;
		try {
			inlined = await inlineSources(style, { fetch: (input, init) => fetch(input, { ...init, signal }) });
		} catch (error) {
			if (this.destroyed) return; // includes the AbortError caused by destroy()
			console.error('Failed to inline map style sources', error);
		}
		// a newer background replaces this one
		if (this.destroyed || request !== this.styleRequest) return;

		const previousStyle = this.map.style;
		let onLoad!: () => void;
		const loaded = new Promise<void>((resolve) => (onLoad = resolve));
		this.map.once('style.load', onLoad);
		this.styleLoaded = false;
		// The elements keep their sources and layers
		this.map.setStyle(inlined, {
			transformStyle: (previous, next) => keepElements(previous, next)
		});
		// the element sources of the new style may be empty or outdated
		this.renderer.redraw();
		// MapLibre changes the current style if it can (keeping e.g. the images of the fill patterns).
		// Only a new style object has to load, which fires "style.load".
		if (previousStyle && this.map.style === previousStyle) {
			this.map.off('style.load', onLoad);
			this.styleLoaded = true;
			return;
		}
		await loaded;
	}

	/** Stop pending work and remove all elements. Call before removing the map. */
	public destroy() {
		this.destroyed = true;
		this.abortController.abort();
		this.clear();
	}

	public isInteractive(): this is GeometryManagerInteractive {
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
		if (!sameBackground(state.meta?.background, this.#background)) {
			await this.setBackground(state.meta?.background);
			if (outdated()) return;
		}

		if (!this.styleLoaded) {
			await new Promise((r) => this.map.once('style.load', r));
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

function sameBackground(a: StateBackground | undefined, b: StateBackground | undefined): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
