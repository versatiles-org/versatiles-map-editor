import type * as maplibregl from 'maplibre-gl';
import type { StateBackground } from '@versatiles/map-state';
import { inlineSources } from '@versatiles/style';
import { ELEMENT_LAYERS, type ElementRenderer } from './element_renderer.js';
import { buildStyle, keepElements } from './editor_style.js';
import { getSettings } from '../background/index.js';
import { addFillPatternImage } from './fill_patterns.js';
import { loadSymbols, spriteSheets } from '../symbols_catalog.js';

/**
 * Loads the style of the map: the background map with the editor's layers, and the font of the
 * labels of the markers. A newer background replaces one that is still loading. The elements
 * keep their sources and layers across styles.
 */
export class MapStyleLoader {
	readonly #map: maplibregl.Map;
	readonly #renderer: ElementRenderer;
	/** The background map. Undefined for the editor's default background. */
	#background: StateBackground | undefined = $state.raw(undefined);
	/** The glyph font of the labels of all markers, if it is not the one of the background map. */
	#labelFont: string | undefined = $state.raw(undefined);
	/** The glyph font of the labels of the markers: their own, or the one of the background map. */
	public readonly font: string = $derived(this.#labelFont ?? getSettings(this.#background).font);
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
			this.#applyLabelFont();
		});
		// the images of the fill patterns are made when the map needs them, e.g. again after a new style
		map.setMissingStyleImageResolver((id) => void addFillPatternImage(map, id));
		void this.#load(undefined);
	}

	/** The background map. Undefined for the editor's default background. See `setBackground`. */
	public get background(): StateBackground | undefined {
		return this.#background;
	}

	/** The font of the labels of all markers, or undefined for the font of the background map. */
	public get labelFont(): string | undefined {
		return this.#labelFont;
	}
	public set labelFont(font: string | undefined) {
		if (font === this.#labelFont) return;
		this.#labelFont = font;
		// without a new style; the next style has it too (see `#load`)
		this.#applyLabelFont();
	}

	/** Show another background map. The background is set at once; resolves when its style is loaded. */
	public async setBackground(background?: StateBackground) {
		if (sameBackground(background, this.#background)) return;
		this.#background = background;
		await this.#load(background);
	}

	/** Whether the background is `background`, e.g. to load a state without reloading the same style. */
	public hasBackground(background: StateBackground | undefined): boolean {
		return sameBackground(background, this.#background);
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
	#applyLabelFont() {
		if (this.#loaded && this.#map.getLayer(ELEMENT_LAYERS.symbol)) {
			this.#map.setLayoutProperty(ELEMENT_LAYERS.symbol, 'text-font', ['literal', [this.font]]);
		}
	}

	async #load(background: StateBackground | undefined) {
		const request = ++this.#request;
		// The sprite sheets with all symbols, loaded once for all maps. The style needs them for
		// its sprites and for the places of the labels around the symbols.
		await loadSymbols();
		if (this.#destroyed || request !== this.#request) return;
		const style = buildStyle(background, this.#labelFont);
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

function sameBackground(a: StateBackground | undefined, b: StateBackground | undefined): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
