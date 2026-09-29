import type * as maplibregl from 'maplibre-gl';
import type { StateBackground } from '@versatiles/map-state';
import { inlineSources } from '@versatiles/style';
import { ELEMENT_LAYERS, type ElementRenderer } from './element_renderer.js';
import { buildStyle, keepElements, LAYERS_UNDER_MAP_LABELS } from './editor_style.js';
import { addFillPatternImage } from './fill_patterns.js';
import { loadSymbols, spriteSheets } from '../symbols_catalog.js';

/**
 * Loads the style of the map: the background map with the editor's layers, the font of the labels
 * of the markers, and whether the labels of the background map are on top, as the document has them. A newer background replaces one that is still
 * loading. The elements keep their sources and layers across styles.
 */
export class MapStyleLoader {
	readonly #map: maplibregl.Map;
	readonly #renderer: ElementRenderer;
	/** The glyph font of the labels of the markers. Undefined for the one of the default background. */
	#font: string | undefined;
	/** Whether the labels of the background map are drawn over the areas and lines of the elements. */
	#mapLabelsOnTop = false;
	// The map has no style until inlineSources() finishes, so elements must wait for it
	#loaded = false;
	#request = 0;
	#destroyed = false;
	readonly #abortController = new AbortController();

	constructor(map: maplibregl.Map, renderer: ElementRenderer) {
		this.#map = map;
		this.#renderer = renderer;
		map.on('style.load', () => {
			this.#loaded = true;
			// e.g. a label font that was set while the style loaded
			this.#applyFont();
			this.#applyLayerOrder();
		});
		// the images of the fill patterns are made when the map needs them, e.g. again after a new style
		map.setMissingStyleImageResolver((id) => void addFillPatternImage(map, id));
		void this.#load(undefined);
	}

	/** Show the glyph font on the labels of the markers, without a new style; the next style has it too. */
	public setFont(font: string) {
		if (font === this.#font) return;
		this.#font = font;
		this.#applyFont();
	}

	/** Draw the labels of the background map over the areas and lines of the elements, or under them. */
	public setMapLabelsOnTop(onTop: boolean) {
		if (onTop === this.#mapLabelsOnTop) return;
		this.#mapLabelsOnTop = onTop;
		this.#applyLayerOrder();
	}

	/**
	 * Show another background map (undefined for the editor's default), with the glyph font of the
	 * labels of the markers. Resolves when its style is loaded.
	 */
	public async setBackground(background: StateBackground | undefined, font: string) {
		this.#font = font;
		await this.#load(background);
	}

	/** Whether the map has a style, so elements can be added to it. */
	public get ready(): boolean {
		return this.#loaded;
	}

	/** Resolves when the map has a style, e.g. before elements are added to it. */
	public async whenReady(): Promise<void> {
		if (!this.#loaded) await new Promise((r) => this.#map.once('style.load', r));
	}

	/** Stop loading a style. */
	public destroy() {
		this.#destroyed = true;
		this.#abortController.abort();
	}

	/** Set the font on the layer of the markers, once the style has it. */
	#applyFont() {
		if (this.#font && this.#loaded && this.#map.getLayer(ELEMENT_LAYERS.symbol)) {
			this.#map.setLayoutProperty(ELEMENT_LAYERS.symbol, 'text-font', ['literal', [this.#font]]);
		}
	}

	/**
	 * Move the areas and lines of the elements under the first label of the background map, or back
	 * under the markers, once the style has them. The next style is built in this order.
	 */
	#applyLayerOrder() {
		const map = this.#map;
		if (!this.#loaded || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const order = map.getLayersOrder();
		// the first label of the background map, or the markers if it has none
		const labels = order.find((id) => map.getLayer(id)?.type === 'symbol');
		const before = this.#mapLabelsOnTop && labels ? labels : ELEMENT_LAYERS.symbol;
		// e.g. a new style, which is built in this order
		const at = order.indexOf(before) - LAYERS_UNDER_MAP_LABELS.length;
		if (LAYERS_UNDER_MAP_LABELS.every((id, i) => order[at + i] === id)) return;
		for (const id of LAYERS_UNDER_MAP_LABELS) {
			if (map.getLayer(id)) map.moveLayer(id, before);
		}
	}

	async #load(background: StateBackground | undefined) {
		const request = ++this.#request;
		// The sprite sheets with all symbols, loaded once for all maps. The style needs them for
		// its sprites and for the places of the labels around the symbols.
		await loadSymbols();
		if (this.#destroyed || request !== this.#request) return;
		const style = buildStyle(background, this.#font, this.#mapLabelsOnTop);
		style.sprite = spriteSheets();

		// The tile server's TileJSON uses relative tile URLs, which MapLibre cannot resolve itself.
		// The download is aborted and its result ignored once the loader is destroyed.
		const signal = this.#abortController.signal;
		let inlined = style;
		try {
			inlined = await inlineSources(style, { fetch: (input, init) => fetch(input, { ...init, signal }) });
		} catch (error) {
			if (this.#destroyed) return; // includes the AbortError caused by destroy()
			console.error('Failed to inline map style sources', error);
		}
		// a newer background replaces this one
		if (this.#destroyed || request !== this.#request) return;

		const map = this.#map;
		const previousStyle = map.style;
		let onLoad!: () => void;
		const loaded = new Promise<void>((resolve) => (onLoad = resolve));
		map.once('style.load', onLoad);
		this.#loaded = false;
		// The elements keep their sources and layers
		map.setStyle(inlined, {
			transformStyle: (previous, next) => keepElements(previous, next)
		});
		// the element sources of the new style may be empty or outdated
		this.#renderer.redraw();
		// MapLibre changes the current style if it can (keeping e.g. the images of the fill patterns).
		// Only a new style object has to load, which fires "style.load".
		if (previousStyle && map.style === previousStyle) {
			map.off('style.load', onLoad);
			this.#loaded = true;
			return;
		}
		await loaded;
	}
}
