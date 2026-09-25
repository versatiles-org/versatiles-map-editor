import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.js';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { SelectionHandler } from './selection.js';
import type { StateManager } from './state/manager.js';
import type { ColorPalette } from './color_palette.js';
import type { StateBackground, StateLegend, StateRoot, StateElement } from '@versatiles/map-state';
import { derived, get, writable, type Readable, type Writable } from 'svelte/store';
import { inlineSources, type StyleSpecification } from '@versatiles/style';
import { getMapStyle } from '$lib/utils/map_style.js';
import { getSettings } from '$lib/utils/background.js';
import { CircleElement } from './element/circle.js';
import { LineElement } from './element/line.js';
import { MarkerElement } from './element/marker.js';
import { PolygonElement } from './element/polygon.js';

/** Build a live editor element from its serialized state. */
export function elementFromState(manager: GeometryManager, element: StateElement): AbstractElement {
	const result = elementFromStateWithoutPopup(manager, element);
	if (element.popup) result.popup.set(element.popup.text);
	return result;
}

function elementFromStateWithoutPopup(manager: GeometryManager, element: StateElement): AbstractElement {
	switch (element.type) {
		case 'marker':
			return MarkerElement.fromState(manager, element);
		case 'line':
			return LineElement.fromState(manager, element);
		case 'polygon':
			return PolygonElement.fromState(manager, element);
		case 'circle':
			return CircleElement.fromState(manager, element);
		default:
			throw new Error('Unknown element type');
	}
}

export class GeometryManager {
	public readonly elements: Writable<AbstractElement[]>;
	public readonly map: maplibregl.Map;
	public readonly canvas: HTMLElement;
	public readonly state: StateManager | null = null;
	public readonly selection: SelectionHandler | null = null;
	public readonly colors: ColorPalette | null = null;
	/**
	 * Functions that add the images the editor generates (e.g. fill patterns), by image id.
	 * A new background map removes all images, and MapLibre asks for them again.
	 */
	public readonly imageResolvers = new Map<string, () => void>();
	/** Whether the read-only viewer shows an address search. */
	public readonly search: Writable<boolean> = writable(false);
	/** The legend of the map, if it has one. */
	public readonly legend: Writable<StateLegend | undefined> = writable(undefined);
	/** The background map. Undefined for the editor's default background. */
	public readonly background: Writable<StateBackground | undefined> = writable(undefined);
	/** The glyph font of the map labels, which the marker labels use too. */
	public readonly font: Readable<string> = derived(this.background, (background) => getSettings(background).font);
	private destroyed = false;
	private readonly abortController = new AbortController();
	// The map has no style until inlineSources() finishes, so elements must wait for it
	private styleLoaded = false;
	private styleRequest = 0;

	constructor(map: maplibregl.Map) {
		this.elements = writable([]);
		this.map = map;
		this.canvas = this.map.getCanvasContainer();
		this.map.on('style.load', () => (this.styleLoaded = true));
		this.map.setMissingStyleImageResolver((id) => this.imageResolvers.get(id)?.());
		void this.loadStyle(undefined);
	}

	/** Show another background map. The background is set at once; resolves when its style is loaded. */
	public async setBackground(background?: StateBackground) {
		if (sameBackground(background, get(this.background))) return;
		this.background.set(background);
		await this.loadStyle(background);
	}

	private async loadStyle(background: StateBackground | undefined) {
		const request = ++this.styleRequest;
		const style = buildStyle(background);

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

		this.styleLoaded = false;
		const loaded = new Promise((resolve) => this.map.once('style.load', resolve));
		// Always a full reload, which is predictable. The elements keep their sources and layers.
		this.map.setStyle(inlined, {
			diff: false,
			transformStyle: (previous, next) => keepElements(previous, next, get(this.elements))
		});
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
		this.elements.update((elements) => {
			elements.forEach((e) => e.destroy());
			return [];
		});
	}

	protected appendElement(element: AbstractElement) {
		this.elements.update((elements) => [...elements, element]);
	}

	/**
	 * The topmost element drawn at the pixel, within `tolerance` pixels.
	 * Only `candidates` are considered, e.g. the elements with a popup.
	 */
	public elementAt(
		{ x, y }: { x: number; y: number },
		tolerance = 0,
		candidates: AbstractElement[] = get(this.elements)
	): AbstractElement | undefined {
		if (candidates.length === 0) return undefined;
		const features = this.map.queryRenderedFeatures(
			[
				[x - tolerance, y - tolerance],
				[x + tolerance, y + tolerance]
			],
			{ layers: candidates.flatMap((element) => element.getLayerIds()) }
		);
		for (const feature of features) {
			const element = candidates.find((e) => e.sourceId === feature.source);
			if (element) return element;
		}
		return undefined;
	}

	public removeElement(element: AbstractElement) {
		this.elements.update((elements) => elements.filter((e) => e !== element));
	}

	public async loadState(state: StateRoot) {
		if (!state) return;
		this.clear();
		await this.setState(state);
		this.state?.history.reset(state);
	}

	/** Move the map to show the given viewport (center + radius in meters). */
	public fitViewport(viewport: NonNullable<StateRoot['map']>) {
		const { center, radius } = viewport;
		const dy = (radius * 360) / 40074000;
		const dx = dy / Math.cos((center[1] * Math.PI) / 180);
		const bounds: [[number, number], [number, number]] = [
			[center[0] - dx, center[1] - dy],
			[center[0] + dx, center[1] + dy]
		];
		this.map.fitBounds(bounds, { animate: false });
	}

	public async setState(state: StateRoot) {
		if (!state) return;

		this.clear();

		if (state.map) this.fitViewport(state.map);
		this.legend.set(state.meta?.legend);
		this.search.set(state.meta?.search === true);
		this.colors?.scheme.set(state.meta?.colorScheme);
		// Only awaited when it changes, so an unchanged background restores the elements at once
		if (!sameBackground(state.meta?.background, get(this.background))) await this.setBackground(state.meta?.background);

		if (!this.styleLoaded) {
			await new Promise((r) => this.map.once('style.load', r));
			if (this.destroyed) return;
		}

		if (state.elements) {
			this.elements.set(state.elements.map((element) => elementFromState(this, element)));
		}
	}
}

/** Whether the primary input is a finger (e.g. phone or tablet) instead of a mouse. */
function hasCoarsePointer(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

function sameBackground(a: StateBackground | undefined, b: StateBackground | undefined): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

/** The background map with the editor's own layers: the highlight and the selection nodes. */
function buildStyle(background: StateBackground | undefined): StyleSpecification {
	const style = getMapStyle(background);
	style.transition = { duration: 0, delay: 0 };

	// Highlights the element with a popup under the pointer in the viewer, below all elements
	style.sources.highlight = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
	style.layers.push(
		{
			id: 'highlight_line',
			source: 'highlight',
			type: 'line',
			filter: ['!=', ['geometry-type'], 'Point'],
			paint: { 'line-color': '#000000', 'line-opacity': 0.2, 'line-width': 10, 'line-blur': 2 }
		},
		{
			id: 'highlight_point',
			source: 'highlight',
			type: 'circle',
			filter: ['==', ['geometry-type'], 'Point'],
			paint: { 'circle-color': '#000000', 'circle-opacity': 0.2, 'circle-radius': 16, 'circle-blur': 0.3 }
		}
	);

	style.sources.selection_nodes = {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	};
	style.layers.push({
		id: 'selection_nodes',
		source: 'selection_nodes',
		type: 'circle',
		layout: {},
		paint: {
			// the selected node is filled, like in vector graphics software
			'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#000000', '#ffffff'],
			'circle-opacity': ['get', 'opacity'],
			// larger nodes are easier to see and hit with a finger
			'circle-radius': hasCoarsePointer() ? 6 : 3,
			'circle-stroke-color': '#000000',
			'circle-stroke-opacity': ['get', 'opacity'],
			'circle-stroke-width': 1
		}
	});
	return style;
}

/**
 * Move the sources and layers of the elements, and the current selection nodes and highlight,
 * from the previous style into the next one. The element layers stay between the highlight and
 * the selection nodes.
 */
export function keepElements(
	previous: StyleSpecification | undefined,
	next: StyleSpecification,
	elements: AbstractElement[]
): StyleSpecification {
	if (!previous) return next;
	const sources = { ...next.sources };
	for (const id of [...elements.map((e) => e.sourceId), 'highlight', 'selection_nodes']) {
		if (previous.sources[id]) sources[id] = previous.sources[id];
	}
	const elementSources = new Set(elements.map((e) => e.sourceId));
	const elementLayers = previous.layers.filter((layer) => 'source' in layer && elementSources.has(layer.source));
	const index = next.layers.findIndex((layer) => layer.id === 'selection_nodes');
	return {
		...next,
		sources,
		layers: [...next.layers.slice(0, index), ...elementLayers, ...next.layers.slice(index)]
	};
}
