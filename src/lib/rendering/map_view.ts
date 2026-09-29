import type * as maplibregl from 'maplibre-gl';
import type { MapState } from '@versatiles/map-state';
import type { AbstractElement } from '../element/abstract.svelte.js';
import type { GeoPoint } from '../geometry.js';
import { ElementRenderer } from './element_renderer.js';
import { MapStyleLoader } from './map_style_loader.svelte.js';

/** The part of the map that is shown: its center, and the radius of the largest circle in it, in meters. */
export type Viewport = NonNullable<MapState['map']>;

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
/** The circumference of the earth in meters, as the viewport measures it. */
const EARTH_CIRCUMFERENCE = 40074000;

/**
 * The map on the screen: it draws the elements over the background map, and knows where things
 * are shown, e.g. which element is at a pixel.
 */
export class MapView {
	public readonly map: maplibregl.Map;
	/** Draws all elements. */
	public readonly renderer: ElementRenderer;
	/** The background map and the font of the labels, and loading their style. */
	public readonly style: MapStyleLoader;

	constructor(map: maplibregl.Map) {
		this.map = map;
		this.renderer = new ElementRenderer(map);
		this.style = new MapStyleLoader(map, this.renderer);
	}

	/** Stop pending work, e.g. loading a style. */
	public destroy() {
		this.style.destroy();
	}

	/** The topmost of the `candidates` drawn at the pixel, within `tolerance` pixels. */
	public elementAt(
		{ x, y }: { x: number; y: number },
		tolerance: number,
		candidates: AbstractElement[] | ElementIndex
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

	/** The part of the map that is shown. */
	public getViewport(): Viewport {
		const center = this.map.getCenter();
		const bounds = this.map.getBounds();
		const radiusDegrees =
			Math.min(
				bounds.getNorth() - bounds.getSouth(),
				(bounds.getEast() - bounds.getWest()) * Math.cos((center.lat * Math.PI) / 180)
			) / 2;
		return { center: [center.lng, center.lat], radius: EARTH_CIRCUMFERENCE * (radiusDegrees / 360) };
	}

	/** Move the map to show the viewport. */
	public fitViewport(viewport: Viewport) {
		const { center, radius } = viewport;
		const dy = (radius * 360) / EARTH_CIRCUMFERENCE;
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

	/** The point that is shown `offset` pixels away from the point. */
	public offsetPoint(point: GeoPoint, offset: [number, number]): GeoPoint {
		if (offset[0] === 0 && offset[1] === 0) return point;
		const { x, y } = this.map.project(point);
		const { lng, lat } = this.map.unproject([x + offset[0], y + offset[1]]);
		return [lng, lat];
	}
}
