import type * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { AbstractElement } from './element/abstract.svelte.js';
import type { StyleLayers } from './element/types.js';
import { symbolEntries } from '@versatiles/map-state';
import { dashArrays } from './map_layer/line.svelte.js';
import { LABEL_POSITIONS } from './map_layer/symbol.svelte.js';

/** The parts of a style that elements have, each drawn by one layer for all elements. */
export type Role = keyof StyleLayers;

/**
 * The layer (and source) of each role, in drawing order: all areas at the bottom, then lines and
 * outlines, then markers. Within a layer, the elements keep their order (the "order" property).
 */
export const ELEMENT_LAYERS: Record<Role, string> = {
	fill: 'elements_fill',
	stroke: 'elements_stroke',
	symbol: 'elements_symbol'
};
const ROLES = Object.keys(ELEMENT_LAYERS) as Role[];

/**
 * A value that the layer looks up by a feature property, since features cannot have array
 * properties (e.g. dash arrays): `lookup('dash', [[1, [2, 4]], …], [100])`.
 */
function lookup(property: string, entries: [string | number, unknown][], fallback: unknown): ExpressionSpecification {
	return [
		'match',
		['get', property],
		...entries.flatMap(([key, value]) => [key, ['literal', value]]),
		['literal', fallback]
	] as unknown as ExpressionSpecification;
}

const DASH_ARRAYS = lookup(
	'dash',
	[...dashArrays].flatMap(([index, { array }]) => (array ? [[index, array] as [number, number[]]] : [])),
	[100]
);
const ICON_OFFSETS = lookup(
	'symbol',
	symbolEntries.flatMap(([index, , , offset]) => (offset ? [[index, offset] as [number, [number, number]]] : [])),
	[0, 0]
);
const LABEL_ANCHORS = lookup('position', Object.entries(LABEL_POSITIONS), LABEL_POSITIONS.auto);

/** The sources and layers that draw all elements. Every map style gets them. */
export function elementStyle(font: string): {
	sources: Record<string, SourceSpecification>;
	layers: LayerSpecification[];
} {
	const empty = (): SourceSpecification => ({ type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
	return {
		sources: Object.fromEntries(ROLES.map((role) => [ELEMENT_LAYERS[role], empty()])),
		layers: [
			{
				id: ELEMENT_LAYERS.fill,
				source: ELEMENT_LAYERS.fill,
				type: 'fill',
				layout: { 'fill-sort-key': ['get', 'order'] },
				paint: { 'fill-pattern': ['get', 'pattern'], 'fill-opacity': ['get', 'opacity'] }
			},
			{
				id: ELEMENT_LAYERS.stroke,
				source: ELEMENT_LAYERS.stroke,
				type: 'line',
				layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] },
				paint: {
					'line-color': ['get', 'color'],
					'line-width': ['get', 'width'],
					'line-dasharray': DASH_ARRAYS
				}
			},
			{
				id: ELEMENT_LAYERS.symbol,
				source: ELEMENT_LAYERS.symbol,
				type: 'symbol',
				layout: {
					'symbol-sort-key': ['get', 'order'],
					'icon-image': ['get', 'icon'],
					'icon-offset': ICON_OFFSETS,
					'icon-allow-overlap': true,
					'icon-rotate': ['get', 'rotate'],
					'icon-size': ['get', 'size'],
					// a property, so "{…}" in a label is not replaced with feature properties
					'text-field': ['get', 'label'],
					// marker labels use the font of the map labels
					'text-font': ['literal', [font]],
					'text-size': ['*', ['get', 'size'], 16],
					'text-justify': 'left',
					'text-overlap': 'always',
					'text-variable-anchor-offset': LABEL_ANCHORS
				},
				paint: {
					'icon-color': ['get', 'color'],
					'icon-halo-blur': 0,
					'icon-halo-color': '#FFFFFF',
					'icon-halo-width': ['get', 'halo'],
					'icon-opacity': 1,
					'text-halo-blur': 0,
					'text-halo-color': '#FFFFFF',
					'text-halo-width': ['get', 'halo']
				}
			}
		]
	};
}

/**
 * Draws all elements with one source and layer per role, instead of a source and layers per
 * element, so maps with many elements (e.g. a table import) stay fast. The elements are features
 * with their element id; their styles are feature properties that the layers read.
 *
 * Changes are collected and written once per microtask: a change of the element list replaces
 * all features, a change of single elements only their features.
 */
export class ElementRenderer {
	private readonly map: maplibregl.Map;
	private elements: AbstractElement[] = [];
	private order = new Map<AbstractElement, number>();
	private changed = new Set<AbstractElement>();
	private all = false;
	private scheduled = false;

	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	/** The elements to draw, in drawing order. The manager calls it on every change of the list. */
	public setElements(elements: AbstractElement[]) {
		this.elements = elements;
		this.order = new Map(elements.map((element, i) => [element, i]));
		this.redraw();
	}

	/** Draw the element again, e.g. after a change of its geometry or style. */
	public update(element: AbstractElement) {
		// an element that is not (yet) on the map is drawn when it is added
		if (!this.order.has(element)) return;
		this.changed.add(element);
		this.schedule();
	}

	/** Draw all elements again, e.g. after a new map style. */
	public redraw() {
		this.all = true;
		this.schedule();
	}

	private schedule() {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => this.flush());
	}

	/** Write the pending changes to the map now. */
	public flush() {
		this.scheduled = false;
		if (this.all) {
			for (const role of ROLES) {
				const features = this.elements.flatMap((element) => this.featureOf(element, role) ?? []);
				this.source(role)?.setData({ type: 'FeatureCollection', features });
			}
		} else if (this.changed.size > 0) {
			const changed = [...this.changed].filter((element) => this.order.has(element));
			for (const role of ROLES) {
				const elements = changed.filter((element) => element.getStyleLayers()[role]);
				if (elements.length === 0) continue;
				this.source(role)?.updateData({
					// replaced, or removed if it is not drawn any more (e.g. a hidden outline)
					remove: elements.map((element) => element.id),
					add: elements.flatMap((element) => this.featureOf(element, role) ?? [])
				});
			}
		}
		this.all = false;
		this.changed.clear();
	}

	private source(role: Role) {
		// looked up each time, since a new map style replaces the source object
		return this.map.style ? this.map.getSource<maplibregl.GeoJSONSource>(ELEMENT_LAYERS[role]) : undefined;
	}

	private featureOf(element: AbstractElement, role: Role): GeoJSON.Feature | undefined {
		const properties = element.getStyleLayers()[role]?.getProperties();
		if (!properties) return undefined;
		const { geometry } = element.getFeature();
		return { type: 'Feature', id: element.id, geometry, properties: { ...properties, order: this.order.get(element) } };
	}
}
