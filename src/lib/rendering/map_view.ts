import type * as maplibregl from 'maplibre-gl';
import { boundsOf, type Bounds, type MapState, type StateElement } from '@versatiles/map-state';
import type { AbstractElement } from '../element/abstract.svelte.js';
import { clampLatitude, lat2mercator, MAX_LATITUDE, mercator2lat, type GeoPoint } from '../geometry.js';
import { ELEMENT_LAYERS, ElementRenderer, elementIdOf, layerIdsOf, type Role } from './element_renderer.js';

/** The role of the first layer or the source of a role, e.g. "symbol" of `elements_symbol`. */
function roleOf(id: string): Role | undefined {
	return (Object.keys(ELEMENT_LAYERS) as Role[]).find((role) => ELEMENT_LAYERS[role] === id);
}

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

/** The circumference of the earth in meters, as the viewport measures it. */
const EARTH_CIRCUMFERENCE = 40074000;

/** The padding around a frame that the author set, in pixels. */
const FRAME_PADDING = 10;
/** The padding around the elements, which is larger, since the symbols of markers are larger than their points. */
const ELEMENTS_PADDING = 30;
/** The closest zoom for elements all at one place, e.g. a single marker (like the table import). */
const MAX_ZOOM = 15;

/** A rectangle on the map, in pixels from its top left corner. */
export interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

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
	/** The part of the map that e.g. the legend covers, which a fitted area keeps clear of. */
	#covered: Box | undefined;

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
			// each role is drawn by several layers, see planLayers
			{ layers: layerIds.flatMap((id) => this.renderer.layerIds(roleOf(id)!)) }
		);
		// the topmost first; the features have the element ids, see `elementIdOf`
		for (const feature of features) {
			// the source of a role has the id of its first layer
			const id = typeof feature.id === 'number' ? elementIdOf(feature.id, roleOf(feature.source)) : undefined;
			const element = id === undefined ? undefined : byId.get(id);
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
		const bounds: [[number, number], [number, number]] = [
			[center[0] - dx, clampLatitude(center[1] - dy)],
			[center[0] + dx, clampLatitude(center[1] + dy)]
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
	 * opens. The padding of the map (e.g. its bars) is kept free, and the covered part (e.g. the
	 * legend) if the area would reach under it. With `keep`, e.g. in the viewer, the area is shown
	 * again whenever the size of the map or its covered part changes, until the map is moved.
	 */
	public fitArea(frame: Bounds | undefined, elements: StateElement[], { keep = false } = {}) {
		this.#fit(frame, elements);
		this.#kept = keep ? { frame, elements } : undefined;
	}

	/** The part of the map that e.g. the legend covers, undefined without one. A kept area is shown again. */
	public setCovered(box: Box | undefined) {
		if (JSON.stringify(box) === JSON.stringify(this.#covered)) return;
		this.#covered = box;
		if (this.#kept) this.#fit(this.#kept.frame, this.#kept.elements);
	}

	#fit(frame: Bounds | undefined, elements: StateElement[]) {
		const bounds = frame ?? boundsOf(elements) ?? [-180, -MAX_LATITUDE, 180, MAX_LATITUDE];
		const target: [[number, number], [number, number]] = [
			[bounds[0], clampLatitude(bounds[1])],
			[bounds[2], clampLatitude(bounds[3])]
		];
		const padding = frame ? FRAME_PADDING : ELEMENTS_PADDING;
		// not `maxZoom: undefined`, which would replace MapLibre's default and make the zoom NaN
		const limit = frame ? {} : { maxZoom: MAX_ZOOM };
		this.#fitting = true;
		try {
			this.map.fitBounds(target, { animate: false, padding, ...limit });
			const clear = this.#clearOfCovered(target, padding, limit);
			if (clear) this.map.fitBounds(target, { animate: false, padding: clear, ...limit });
		} catch (error) {
			// the elements must be shown anyway
			console.error('Failed to show the area of the map', error);
		} finally {
			this.#fitting = false;
		}
	}

	/**
	 * If the shown area reaches under the covered part, a padding that keeps it clear: beside it,
	 * or above or below it, whichever shows the area larger. Undefined if nothing is covered.
	 */
	#clearOfCovered(
		target: [[number, number], [number, number]],
		padding: number,
		limit: { maxZoom?: number }
	): Required<maplibregl.PaddingOptions> | undefined {
		const box = this.#covered;
		if (!box) return undefined;
		const southWest = this.map.project(target[0]);
		const northEast = this.map.project(target[1]);
		const shown: Box = {
			left: southWest.x - padding,
			top: northEast.y - padding,
			right: northEast.x + padding,
			bottom: southWest.y + padding
		};
		if (!overlaps(shown, box)) return undefined;

		const { clientWidth: width, clientHeight: height } = this.map.getContainer();
		const { top = 0, right = 0, bottom = 0, left = 0 } = this.map.getPadding();
		const base = { top: padding, right: padding, bottom: padding, left: padding };
		// the fit padding is added to the padding of the map, e.g. its bars
		const candidates: Required<maplibregl.PaddingOptions>[] = [];
		if (box.right <= width / 2) candidates.push({ ...base, left: padding + Math.max(0, box.right - left) });
		else if (box.left >= width / 2)
			candidates.push({ ...base, right: padding + Math.max(0, width - box.left - right) });
		if (box.bottom <= height / 2) candidates.push({ ...base, top: padding + Math.max(0, box.bottom - top) });
		else if (box.top >= height / 2)
			candidates.push({ ...base, bottom: padding + Math.max(0, height - box.top - bottom) });

		let best: Required<maplibregl.PaddingOptions> | undefined;
		let bestZoom = -Infinity;
		for (const candidate of candidates) {
			// undefined if the area does not fit, e.g. on a small map
			const zoom = this.map.cameraForBounds(target, { padding: candidate, ...limit })?.zoom;
			if (zoom !== undefined && zoom > bestZoom) {
				best = candidate;
				bestZoom = zoom;
			}
		}
		return best;
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

/** Whether two rectangles overlap. */
function overlaps(a: Box, b: Box): boolean {
	return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
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

/** Where a handle is: the middle of an edge is its middle on the map (in Web Mercator). */
export function handlePosition([west, south, east, north]: Bounds, handle: Handle): [number, number] {
	const lng = handle.includes('w') ? west : handle.includes('e') ? east : (west + east) / 2;
	const lat = handle.includes('n')
		? north
		: handle.includes('s')
			? south
			: mercator2lat((lat2mercator(south) + lat2mercator(north)) / 2);
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
