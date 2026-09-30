import type * as maplibregl from 'maplibre-gl';
import { boundsOf, type Bounds, type MapState, type StateElement } from '@versatiles/map-state';
import type { AbstractElement } from '../element/abstract.svelte.js';
import type { GeoPoint } from '../geometry.js';
import { ElementRenderer, layerIdsOf } from './element_renderer.js';
import { MapStyleLoader } from './map_style_loader.js';

/** The part of the map that is shown: its center, and the radius of the largest circle in it, in meters. */
export type Viewport = NonNullable<MapState['map']>;

/** Elements prepared for `elementAt`, e.g. to reuse them for every mouse move. */
export interface ElementIndex {
	layerIds: string[];
	byId: Map<number, AbstractElement>;
}

export function indexElements(elements: AbstractElement[]): ElementIndex {
	return {
		layerIds: [...new Set(elements.flatMap(layerIdsOf))],
		byId: new Map(elements.map((element) => [element.id, element]))
	};
}

/** The northernmost latitude of the Web Mercator projection. */
const MAX_LATITUDE = 85.051129;
/** The circumference of the earth in meters, as the viewport measures it. */
const EARTH_CIRCUMFERENCE = 40074000;

/** The padding around a frame that the author set, in pixels. */
const FRAME_PADDING = 10;
/** The padding around the elements, which is larger, since the symbols of markers are larger than their points. */
const ELEMENTS_PADDING = 30;
/** The closest zoom for elements all at one place, e.g. a single marker (like the table import). */
const MAX_ZOOM = 15;

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
	/** The area that is shown again when the size of the map changes, until the map is moved. */
	#kept: { frame: Bounds | undefined; elements: StateElement[] } | undefined;
	/** Whether the view itself moves the map, which does not end keeping the area. */
	#fitting = false;

	constructor(map: maplibregl.Map) {
		this.map = map;
		this.renderer = new ElementRenderer(map);
		this.style = new MapStyleLoader(map, this.renderer);
		// A resize of the map fires "movestart" before "resize", both at once. So a move ends keeping
		// the area only if no resize follows it, e.g. a move by the visitor or by the address search.
		let resized = false;
		map.on('movestart', () => {
			if (this.#fitting) return;
			queueMicrotask(() => {
				if (!resized) this.#kept = undefined;
			});
		});
		// e.g. a growing embed, or a rotated phone
		map.on('resize', () => {
			resized = true;
			queueMicrotask(() => (resized = false));
			if (this.#kept) this.#fit(this.#kept.frame, this.#kept.elements);
		});
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

	/**
	 * Show the frame completely, else all elements, else the whole world, e.g. when a shared map
	 * opens. The padding of the map (e.g. its bars) is kept free. With `keep`, e.g. in the viewer,
	 * the area is shown again whenever the size of the map changes, until the map is moved.
	 */
	public fitArea(frame: Bounds | undefined, elements: StateElement[], { keep = false } = {}) {
		this.#fit(frame, elements);
		this.#kept = keep ? { frame, elements } : undefined;
	}

	#fit(frame: Bounds | undefined, elements: StateElement[]) {
		const bounds = frame ?? boundsOf(elements) ?? [-180, -MAX_LATITUDE, 180, MAX_LATITUDE];
		const lat = (value: number) => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, value));
		this.#fitting = true;
		try {
			this.map.fitBounds(
				[
					[bounds[0], lat(bounds[1])],
					[bounds[2], lat(bounds[3])]
				],
				// not `maxZoom: undefined`, which would replace MapLibre's default and make the zoom NaN
				frame
					? { animate: false, padding: FRAME_PADDING }
					: { animate: false, padding: ELEMENTS_PADDING, maxZoom: MAX_ZOOM }
			);
		} catch (error) {
			// the elements must be shown anyway
			console.error('Failed to show the area of the map', error);
		} finally {
			this.#fitting = false;
		}
	}

	/** The part of the map that is shown, without the padding of the map, e.g. its bars. */
	public viewBounds(): Bounds {
		const { clientWidth: width, clientHeight: height } = this.map.getContainer();
		const { top = 0, right = 0, bottom = 0, left = 0 } = this.map.getPadding();
		const topLeft = this.map.unproject([left, top]);
		const bottomRight = this.map.unproject([width - right, height - bottom]);
		return [
			Math.max(-180, topLeft.lng),
			Math.max(-MAX_LATITUDE, bottomRight.lat),
			Math.min(180, bottomRight.lng),
			Math.min(MAX_LATITUDE, topLeft.lat)
		];
	}

	/**
	 * Show the visible area while it is edited: a veil outside the frame and its border, or without
	 * a frame the bounds of the elements, dashed.
	 */
	public showVisibleArea(frame: Bounds | undefined, bounds: Bounds | undefined) {
		const area = frame ?? bounds;
		const features = [...visibleAreaFeatures(frame, bounds), ...(area ? handleFeatures(area) : [])];
		this.#visibleAreaSource()?.setData({ type: 'FeatureCollection', features });
	}

	/** Hide the visible area, e.g. when its mode is left. */
	public hideVisibleArea() {
		this.#visibleAreaSource()?.setData({ type: 'FeatureCollection', features: [] });
	}

	#visibleAreaSource() {
		return this.map.style ? this.map.getSource<maplibregl.GeoJSONSource>('visible_area') : undefined;
	}

	/** The point that is shown `offset` pixels away from the point. */
	public offsetPoint(point: GeoPoint, offset: [number, number]): GeoPoint {
		if (offset[0] === 0 && offset[1] === 0) return point;
		const { x, y } = this.map.project(point);
		const { lng, lat } = this.map.unproject([x + offset[0], y + offset[1]]);
		return [lng, lat];
	}
}

/** The ring around bounds, closed. */
function ringOf([west, south, east, north]: Bounds): [number, number][] {
	return [
		[west, south],
		[east, south],
		[east, north],
		[west, north],
		[west, south]
	];
}

/** The features of the visible area, which the layers of `editor_style` draw by their `kind`. */
export function visibleAreaFeatures(frame: Bounds | undefined, bounds: Bounds | undefined): GeoJSON.Feature[] {
	if (frame) {
		// the world with the frame as a hole, in the other direction
		const world = ringOf([-180, -MAX_LATITUDE, 180, MAX_LATITUDE]);
		return [
			{
				type: 'Feature',
				properties: { kind: 'veil' },
				geometry: { type: 'Polygon', coordinates: [world, ringOf(frame).reverse()] }
			},
			{ type: 'Feature', properties: { kind: 'border' }, geometry: { type: 'LineString', coordinates: ringOf(frame) } }
		];
	}
	if (bounds) {
		return [
			{ type: 'Feature', properties: { kind: 'bounds' }, geometry: { type: 'LineString', coordinates: ringOf(bounds) } }
		];
	}
	return [];
}

/** The handles of the visible area: at the corners, which move two sides, and in the middle of the edges. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type Handle = (typeof HANDLES)[number];

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const latitudeOf = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/** Where a handle is: the middle of an edge is its middle on the map (in Web Mercator). */
export function handlePosition([west, south, east, north]: Bounds, handle: Handle): [number, number] {
	const lng = handle.includes('w') ? west : handle.includes('e') ? east : (west + east) / 2;
	const lat = handle.includes('n')
		? north
		: handle.includes('s')
			? south
			: latitudeOf((mercatorY(south) + mercatorY(north)) / 2);
	return [lng, lat];
}

/** The handles of an area, as features for the layer of the handles. */
export function handleFeatures(area: Bounds): GeoJSON.Feature[] {
	return HANDLES.map((handle) => ({
		type: 'Feature',
		properties: { kind: 'handle', handle },
		geometry: { type: 'Point', coordinates: handlePosition(area, handle) }
	}));
}
