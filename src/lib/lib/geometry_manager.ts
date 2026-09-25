import type * as maplibregl from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.js';
import type { GeometryManagerInteractive } from './geometry_manager_interactive.js';
import type { SelectionHandler } from './selection.js';
import type { StateManager } from './state/manager.js';
import type { ColorPalette } from './color_palette.js';
import type { StateRoot, StateElement } from '$lib/codec/types.js';
import { writable, type Writable } from 'svelte/store';
import { inlineSources } from '@versatiles/style';
import { getMapStyle } from '$lib/utils/map_style.js';
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
	private destroyed = false;
	private readonly abortController = new AbortController();
	// The map has no style until inlineSources() finishes, so elements must wait for it
	private styleLoaded = false;

	constructor(map: maplibregl.Map) {
		this.elements = writable([]);
		this.map = map;
		this.canvas = this.map.getCanvasContainer();
		this.map.once('style.load', () => (this.styleLoaded = true));

		const style = getMapStyle({ darkMode: false });
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

		// The tile server's TileJSON uses relative tile URLs, which MapLibre cannot resolve itself.
		// The download is aborted and its result ignored once the manager is destroyed.
		const signal = this.abortController.signal;
		inlineSources(style, { fetch: (input, init) => fetch(input, { ...init, signal }) }).then(
			(inlined) => {
				if (!this.destroyed) map.setStyle(inlined);
			},
			(error) => {
				if (this.destroyed) return; // includes the AbortError caused by destroy()
				console.error('Failed to inline map style sources', error);
				map.setStyle(style);
			}
		);
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
