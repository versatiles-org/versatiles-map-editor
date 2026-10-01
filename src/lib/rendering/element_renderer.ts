import type * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { AbstractElement } from '../element/abstract.svelte.js';
import type { StyleLayers } from '../element/types.js';
import { dashArrays, LABEL_POSITIONS, labelPositionTable } from '../style/index.js';
import { allSymbols } from '../symbols_catalog.js';

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
 * MapLibre draws the symbols of a layer first, then its labels, so in one layer every label covers
 * every symbol (maplibre-gl-js issue #49). So the markers are drawn by several layers of the same
 * source, from the back to the front: each group of markers ends with a labeled one. Up to this
 * many labeled markers; with more, all markers share one layer again, since every layer costs
 * time, and their labels cover all symbols.
 */
export const MAX_LABEL_GROUPS = 100;

/** The layer of a group of markers: the first one is `elements_symbol`, the next ones are above it. */
export function symbolLayerId(group: number): string {
	return group === 0 ? ELEMENT_LAYERS.symbol : `${ELEMENT_LAYERS.symbol}_${group}`;
}

/** The ids of the layers that draw the element: one per role of its style, shared with the other elements. */
export function layerIdsOf(element: AbstractElement): string[] {
	return (Object.keys(element.getStyleLayers()) as Role[]).map((role) => ELEMENT_LAYERS[role]);
}

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

/**
 * The sources and layers that draw all elements. Every map style gets them. The label positions
 * are those of the symbols that are loaded (see `loadSymbols`).
 */
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
			symbolLayer(font, 0)
		]
	};
}

/** The layer of the markers of a group, with the glyph font of their labels, see `MAX_LABEL_GROUPS`. */
export function symbolLayer(font: string, group: number): LayerSpecification {
	return {
		id: symbolLayerId(group),
		source: ELEMENT_LAYERS.symbol,
		type: 'symbol',
		filter: ['==', ['get', 'group'], group],
		layout: {
			'symbol-sort-key': ['get', 'order'],
			'icon-image': ['get', 'icon'],
			// e.g. the tip of a pin on the point
			'icon-anchor': ['coalesce', ['get', 'anchor'], 'center'],
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
			'text-variable-anchor-offset': lookup(
				'position',
				Object.entries(labelPositionTable(allSymbols())),
				LABEL_POSITIONS.auto
			)
		},
		paint: {
			'icon-color': ['get', 'color'],
			'icon-halo-blur': 0,
			'icon-halo-color': ['get', 'haloColor'],
			'icon-halo-width': ['get', 'halo'],
			// the opacity of the colors, which also fades the halo
			'icon-opacity': ['get', 'opacity'],
			'text-color': ['get', 'labelColor'],
			'text-opacity': ['get', 'labelOpacity'],
			'text-halo-blur': 0,
			'text-halo-color': ['get', 'haloColor'],
			'text-halo-width': ['get', 'halo']
		}
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
	/** The group of each marker, see `MAX_LABEL_GROUPS`, and the markers with a label. */
	private groups = new Map<AbstractElement, number>();
	private labeled = new Set<AbstractElement>();
	/** The number of layers of markers that the map style has, at least `elements_symbol`. */
	private symbolLayers = 1;

	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	/** The elements to draw, in drawing order. The map document calls it on every change of the list. */
	public setElements(elements: AbstractElement[]) {
		this.elements = elements;
		this.order = new Map(elements.map((element, i) => [element, i]));
		this.regroup();
		this.redraw();
	}

	/** Whether the element is a marker with a label. */
	private static hasLabel(element: AbstractElement): boolean {
		const label = element.getStyleLayers().symbol?.getProperties().label;
		return typeof label === 'string' && label.trim() !== '';
	}

	/**
	 * The groups of the markers, from the back to the front: each group ends with a labeled marker,
	 * so no label is drawn under a symbol in front of it. All in one group with too many labels.
	 */
	private regroup() {
		const markers = this.elements.filter((element) => element.getStyleLayers().symbol);
		this.labeled = new Set(markers.filter((element) => ElementRenderer.hasLabel(element)));
		const separate = this.labeled.size <= MAX_LABEL_GROUPS;
		this.groups = new Map();
		let group = 0;
		for (const marker of markers) {
			this.groups.set(marker, group);
			if (separate && this.labeled.has(marker)) group++;
		}
	}

	/** The ids of the layers of the markers, from the back to the front, e.g. to find a marker. */
	public symbolLayerIds(): string[] {
		return Array.from({ length: this.symbolLayers }, (_, group) => symbolLayerId(group));
	}

	/** A new map style has only the first layer of the markers: the others are added again. */
	public onStyleLoad() {
		this.symbolLayers = 1;
		this.redraw();
	}

	/**
	 * Add or remove layers of markers, so there is one for each group. The new ones are above the
	 * others, with the label font of the first one.
	 */
	private syncSymbolLayers() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		// the groups that have markers: a group starts after a labeled marker only if one follows
		let wanted = 1;
		for (const group of this.groups.values()) wanted = Math.max(wanted, group + 1);
		while (this.symbolLayers > wanted) {
			this.symbolLayers--;
			map.removeLayer(symbolLayerId(this.symbolLayers));
		}
		if (this.symbolLayers === wanted) return;
		const font = (
			map.getLayoutProperty(ELEMENT_LAYERS.symbol, 'text-font') as ['literal', string[]] | undefined
		)?.[1]?.[0];
		const order = map.getLayersOrder();
		// the layer above the last layer of the markers, e.g. of the selection
		const before = order[order.indexOf(symbolLayerId(this.symbolLayers - 1)) + 1];
		while (this.symbolLayers < wanted) {
			map.addLayer(symbolLayer(font ?? 'noto_sans_regular', this.symbolLayers), before);
			this.symbolLayers++;
		}
	}

	/** Draw the element again, e.g. after a change of its geometry or style. */
	public update(element: AbstractElement) {
		// an element that is not (yet) on the map is drawn when it is added
		if (!this.order.has(element)) return;
		// a label added or removed changes the groups of the markers
		if (ElementRenderer.hasLabel(element) !== this.labeled.has(element)) {
			this.regroup();
			return this.redraw();
		}
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
			this.syncSymbolLayers();
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
		const group = role === 'symbol' ? (this.groups.get(element) ?? 0) : undefined;
		return {
			type: 'Feature',
			id: element.id,
			geometry,
			properties: { ...properties, order: this.order.get(element), ...(group !== undefined && { group }) }
		};
	}
}
