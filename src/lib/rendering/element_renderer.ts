import type * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { AbstractElement } from '../element/abstract.svelte.js';
import type { StyleLayers } from '../element/types.js';
import { dashArrays, LABEL_POSITIONS, labelPositionTable } from '../style/index.js';
import { allSymbols } from '../symbols_catalog.js';

/** The parts of a style that elements have, each drawn by one layer for all elements. */
export type Role = keyof StyleLayers;

/**
 * The source of each role, and the layer of its first group, see `groupElements`. Within a layer,
 * the elements keep their order (the "order" property).
 */
export const ELEMENT_LAYERS: Record<Role, string> = {
	fill: 'elements_fill',
	stroke: 'elements_stroke',
	symbol: 'elements_symbol'
};
const ROLES = Object.keys(ELEMENT_LAYERS) as Role[];

/**
 * The most groups of layers of a kind, see `groupElements`: every layer costs time, so with more,
 * the markers are drawn over all areas and lines, or a kind is drawn in one group.
 */
export const MAX_GROUPS = 100;

/** The layer of a role in a group: the first group has `elements_fill` etc., the next ones are above it. */
export function layerId(role: Role, group: number): string {
	return group === 0 ? ELEMENT_LAYERS[role] : `${ELEMENT_LAYERS[role]}_${group}`;
}

/** The layer of a group of markers. */
export function symbolLayerId(group: number): string {
	return layerId('symbol', group);
}

/** What an element draws, for its group: the roles of its style, and whether it has a label. */
export interface Drawn {
	roles: Role[];
	label: boolean;
}

/**
 * The group of each element, in drawing order, and whether the markers are drawn over all areas
 * and lines. The elements of a group are drawn by one layer per role: its areas, then its lines
 * and outlines, then its markers; MapLibre draws the symbols of a layer before all its labels
 * (maplibre-gl-js issue #49). So an element joins the group of the one before it, unless something
 * of it would be drawn under something earlier in the group: its area under a line or a marker,
 * its line under a marker, its marker under a label. This looks the same as one layer per
 * element, with far fewer layers.
 *
 * With `markersOnTop` (e.g. while the labels of the background map are between the areas and lines
 * and the markers), or with more than `MAX_GROUPS` groups, the markers are drawn over all areas and
 * lines: the areas and lines are grouped among themselves, and the markers among themselves, so
 * each keeps its place among the others of its kind. If that gives more than `MAX_GROUPS` groups
 * of a kind, all of it is in the first group: areas under all lines, markers under all labels.
 */
export function groupElements(elements: Drawn[], markersOnTop = false): { groups: number[]; markersOnTop: boolean } {
	if (!markersOnTop) {
		const groups = chain(elements);
		if (Math.max(0, ...groups) < MAX_GROUPS) return { groups, markersOnTop: false };
	}
	const groups = new Array<number>(elements.length);
	for (const markers of [false, true]) {
		const indices = elements.flatMap((e, i) => (e.roles.includes('symbol') === markers ? [i] : []));
		const kind = chain(indices.map((i) => elements[i]));
		const separate = Math.max(0, ...kind) < MAX_GROUPS;
		indices.forEach((i, j) => (groups[i] = separate ? kind[j] : 0));
	}
	return { groups, markersOnTop: true };
}

/** The groups of elements in one order, see `groupElements`. */
function chain(elements: Drawn[]): number[] {
	let group = 0;
	let stroke = false;
	let symbol = false;
	let label = false;
	return elements.map(({ roles, label: hasLabel }) => {
		const has = (role: Role) => roles.includes(role);
		if ((has('fill') && (stroke || symbol)) || (has('stroke') && symbol) || (has('symbol') && label)) {
			group++;
			stroke = symbol = label = false;
		}
		stroke ||= has('stroke');
		symbol ||= has('symbol');
		label ||= hasLabel;
		return group;
	});
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
		layers: [elementLayer('fill', 0, font), elementLayer('stroke', 0, font), elementLayer('symbol', 0, font)]
	};
}

/** The layer of a role in a group, see `groupElements`; markers with the glyph font of their labels. */
export function elementLayer(role: Role, group: number, font: string): LayerSpecification {
	const filter: ExpressionSpecification = ['==', ['get', 'group'], group];
	switch (role) {
		case 'fill':
			return {
				id: layerId('fill', group),
				source: ELEMENT_LAYERS.fill,
				type: 'fill',
				filter,
				layout: { 'fill-sort-key': ['get', 'order'] },
				paint: { 'fill-pattern': ['get', 'pattern'], 'fill-opacity': ['get', 'opacity'] }
			};
		case 'stroke':
			return {
				id: layerId('stroke', group),
				source: ELEMENT_LAYERS.stroke,
				type: 'line',
				filter,
				layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'order'] },
				paint: {
					'line-color': ['get', 'color'],
					'line-width': ['get', 'width'],
					'line-dasharray': DASH_ARRAYS
				}
			};
		case 'symbol':
			return symbolLayer(font, group);
	}
}

/**
 * How the labels of markers are shown: all, also on top of each other ("show"), or without those
 * that would overlap other labels or symbols ("hide"); from a zoom level (0: always).
 */
export interface LabelOptions {
	overlap: 'show' | 'hide';
	minZoom: number;
}

export const DEFAULT_LABEL_OPTIONS: LabelOptions = { overlap: 'show', minZoom: 0 };

/** The layout properties of the labels of markers for the options, see `LabelOptions`. */
export function labelLayout({ overlap, minZoom }: LabelOptions) {
	// a property, so "{…}" in a label is not replaced with feature properties
	const label: ExpressionSpecification = ['get', 'label'];
	return {
		// no label below the zoom level, so it neither shows nor takes room
		'text-field': minZoom > 0 ? (['step', ['zoom'], '', minZoom, label] as ExpressionSpecification) : label,
		'text-overlap': overlap === 'hide' ? ('never' as const) : ('always' as const),
		// a marker whose label has no room is shown without it
		'text-optional': overlap === 'hide'
	};
}

/**
 * The layer of the labels of markers when more than `MAX_GROUPS` markers have labels: they share
 * one layer of symbols, whose labels would be placed from the back, so the marker behind keeps its
 * label where two overlap. This layer draws them all, placed from the front, above the markers.
 * (Under them, each label would collide with the symbol of its own marker and be hidden.) Labels
 * hidden where they overlap still avoid each other, but may cover the symbols of other markers.
 */
export const LABELS_LAYER = 'elements_labels';

/** The layer of the labels of the markers, see `LABELS_LAYER`: their texts without the symbols. */
export function labelsLayer(font: string): LayerSpecification {
	const markers = symbolLayer(font, 0) as { layout: Record<string, unknown>; paint: Record<string, unknown> };
	const text = (properties: Record<string, unknown>) =>
		Object.fromEntries(Object.entries(properties).filter(([key]) => key.startsWith('text-')));
	return {
		id: LABELS_LAYER,
		source: ELEMENT_LAYERS.symbol,
		type: 'symbol',
		layout: { ...text(markers.layout), 'symbol-sort-key': ['get', 'order'] },
		paint: text(markers.paint)
	} as LayerSpecification;
}

/** The layout properties of the labels of markers that each layer of markers has alike. */
export const LABEL_LAYOUT_KEYS = ['text-font', 'text-field', 'text-overlap', 'text-optional'] as const;

/** The layer of the markers of a group, with the glyph font of their labels. */
function symbolLayer(font: string, group: number): LayerSpecification {
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
			...labelLayout(DEFAULT_LABEL_OPTIONS),
			// marker labels use the font of the map labels
			'text-font': ['literal', [font]],
			'text-size': ['*', ['get', 'size'], 16],
			'text-justify': 'left',
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
 * Draws all elements with one source per role and groups of layers (see `groupElements`), instead
 * of a source and layers per element, so maps with many elements (e.g. a table import) stay fast. The elements are features
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
	/** The group of each element, see `groupElements`, and what each draws, to notice a change. */
	private groups = new Map<AbstractElement, number>();
	private drawn = new Map<AbstractElement, string>();
	/** Whether the markers must be drawn over all areas and lines, see `groupElements`. */
	private markersOnTop = false;
	/** Whether they are, also because there are too many groups otherwise. */
	private grouped: ReturnType<typeof groupElements> = { groups: [], markersOnTop: false };
	/** The layers of the groups after the first, which the map style has, in drawing order. */
	private extraLayers: string[] = [];
	/** Whether they were placed with the markers on top, see `syncLayers`. */
	private extraOnTop = false;
	/** How the labels of markers are shown, see `LabelOptions`. */
	private labels: LabelOptions = DEFAULT_LABEL_OPTIONS;
	/** Whether the labels of the markers have a layer of their own, see `LABELS_LAYER`. */
	private sharedLabels = false;

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

	/** What the element draws, for its group. */
	private static drawnOf(element: AbstractElement): Drawn {
		const layers = element.getStyleLayers();
		const label = layers.symbol?.getProperties().label;
		return { roles: ROLES.filter((role) => layers[role]), label: typeof label === 'string' && label.trim() !== '' };
	}

	private static key({ roles, label }: Drawn): string {
		return `${roles.join()}${label ? ' label' : ''}`;
	}

	/** The groups of the elements, see `groupElements`. */
	private regroup() {
		const drawn = this.elements.map((element) => ElementRenderer.drawnOf(element));
		this.grouped = groupElements(drawn, this.markersOnTop);
		const { groups } = this.grouped;
		this.groups = new Map(this.elements.map((element, i) => [element, groups[i]]));
		this.drawn = new Map(this.elements.map((element, i) => [element, ElementRenderer.key(drawn[i])]));
		this.sharedLabels = drawn.filter((d) => d.label).length > MAX_GROUPS;
	}

	/**
	 * Draw the markers over all areas and lines, e.g. while the labels of the background map are
	 * between them; else each element at its place in the order.
	 */
	public setMarkersOnTop(onTop: boolean) {
		if (onTop === this.markersOnTop) return;
		this.markersOnTop = onTop;
		// the layers of the groups are in other places now: all are added again
		if (this.map.style) for (const id of [...this.extraLayers].reverse()) this.map.removeLayer(id);
		this.extraLayers = [];
		this.regroup();
		this.redraw();
	}

	/** The ids of the layers of a role, e.g. to find an element under the mouse. */
	public layerIds(role: Role): string[] {
		const ids = [ELEMENT_LAYERS[role], ...this.extraLayers.filter((id) => id.startsWith(`${ELEMENT_LAYERS[role]}_`))];
		// the labels of the markers, if they have a layer of their own
		return role === 'symbol' && this.extraLayers.includes(LABELS_LAYER) ? [...ids, LABELS_LAYER] : ids;
	}

	/** Show the labels of the markers all, or without those that overlap, and from a zoom level. */
	public setLabelOptions(options: LabelOptions) {
		this.labels = options;
		this.applyLabels();
	}

	/**
	 * The options of the labels on the layers of the markers. If the labels have a layer of their
	 * own, the layers of the markers draw no labels, and the labels are placed from the front when
	 * overlapping ones are hidden.
	 */
	private applyLabels() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const layout = labelLayout(this.labels);
		const own = this.extraLayers.includes(LABELS_LAYER);
		for (const id of this.layerIds('symbol')) {
			for (const [key, value] of Object.entries(layout)) {
				const label = id === LABELS_LAYER || !own;
				map.setLayoutProperty(id, key as keyof typeof layout, key === 'text-field' && !label ? '' : value);
			}
		}
		if (own) {
			const order: ExpressionSpecification = ['get', 'order'];
			const front = this.labels.overlap === 'hide';
			map.setLayoutProperty(LABELS_LAYER, 'symbol-sort-key', front ? ['-', 0, order] : order);
		}
	}

	/** The ids of the layers of the markers, e.g. to set the font of their labels. */
	public symbolLayerIds(): string[] {
		return this.layerIds('symbol');
	}

	/** A new map style has only the layers of the first group: the others are added again. */
	public onStyleLoad() {
		this.extraLayers = [];
		this.redraw();
	}

	/**
	 * Add or remove the layers of the groups after the first, one per role that the group has, above
	 * the layers of the first group: only those after the first difference. With the markers on top,
	 * the layers of the areas and lines are above those of the first group of areas and lines (e.g.
	 * under the labels of the background map), and those of the markers above the first one of
	 * markers. Markers get the label font of the first layer of markers.
	 */
	private syncLayers() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const roles: Set<Role>[] = [];
		for (const [element, group] of this.groups) {
			roles[group] ??= new Set();
			for (const role of ElementRenderer.drawnOf(element).roles) roles[group].add(role);
		}
		const layersOf = (kinds: Role[]) =>
			roles.flatMap((has, group) =>
				group === 0 ? [] : kinds.filter((role) => has?.has(role)).map((role) => layerId(role, group))
			);
		const onTop = this.grouped.markersOnTop;
		const wanted = onTop ? [...layersOf(['fill', 'stroke']), ...layersOf(['symbol'])] : layersOf(ROLES);
		if (this.sharedLabels) wanted.push(LABELS_LAYER);
		let same = 0;
		// placed otherwise before: all are added again
		while (onTop === this.extraOnTop && same < wanted.length && wanted[same] === this.extraLayers[same]) same++;
		for (const id of this.extraLayers.slice(same).reverse()) map.removeLayer(id);
		const roleOf = (id: string) => /^elements_(fill|stroke|symbol)_\d+$/.exec(id)?.[1] ?? 'symbol';
		const isArea = (id: string) => onTop && roleOf(id) !== 'symbol';
		for (const [i, id] of wanted.entries()) {
			if (i < same) continue;
			// above the layer before it of its kind, or the first one of its kind; under e.g. the selection
			const previous = wanted.slice(0, i).findLast((other) => isArea(other) === isArea(id));
			const after = previous ?? (isArea(id) ? ELEMENT_LAYERS.stroke : ELEMENT_LAYERS.symbol);
			const order = map.getLayersOrder();
			const before = order[order.indexOf(after) + 1];
			const [, role, group] = /^elements_(fill|stroke|symbol)_(\d+)$/.exec(id) ?? [id, 'labels', '0'];
			map.addLayer(
				role === 'labels'
					? labelsLayer('noto_sans_regular')
					: elementLayer(role as Role, Number(group), 'noto_sans_regular'),
				before
			);
			// the font like that of the first layer of markers
			if (role === 'fill' || role === 'stroke') continue;
			for (const key of LABEL_LAYOUT_KEYS) {
				const value = map.getLayoutProperty(ELEMENT_LAYERS.symbol, key);
				if (value !== undefined) map.setLayoutProperty(id, key, value);
			}
		}
		this.extraLayers = wanted;
		this.extraOnTop = onTop;
		this.applyLabels();
	}

	/** Draw the element again, e.g. after a change of its geometry or style. */
	public update(element: AbstractElement) {
		// an element that is not (yet) on the map is drawn when it is added
		if (!this.order.has(element)) return;
		// e.g. a label or an outline added or removed can change the groups
		if (ElementRenderer.key(ElementRenderer.drawnOf(element)) !== this.drawn.get(element)) {
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
			this.syncLayers();
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
		return {
			type: 'Feature',
			id: element.id,
			geometry,
			properties: { ...properties, order: this.order.get(element), group: this.groups.get(element) ?? 0 }
		};
	}
}
