import type * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { AbstractElement, StyleLayers } from '../element/index.js';
import { dashArrays, LABEL_PLACES, labelPlaceTable } from '../style/index.js';
import { allSymbols } from '../background/index.js';
import { arrowHeads, ROTATE_ZOOMS, rotateProperty } from './arrow_heads.js';

/**
 * The parts of a style that elements have, each drawn by one layer for all elements, and the
 * arrowheads of lines, which are part of their stroke.
 */
export type Role = keyof StyleLayers | 'arrow';

/**
 * The source of each role, and its first layer, see `planLayers`. Within a layer, the elements keep
 * their order (the "order" property).
 */
export const ELEMENT_LAYERS: Record<Role, string> = {
	fill: 'elements_fill',
	stroke: 'elements_stroke',
	arrow: 'elements_arrows',
	symbol: 'elements_symbol'
};
const ROLES = Object.keys(ELEMENT_LAYERS) as Role[];

/** The roles that an element draws: those of its style, and the arrowheads of a line that has them. */
export function rolesOf(element: AbstractElement): Role[] {
	const layers = element.getStyleLayers();
	return ROLES.filter((role) => (role === 'arrow' ? layers.stroke?.getArrowProperties() : layers[role]));
}

/**
 * Invisible layers that mark places in the map style: the top of the areas and lines while the
 * markers are drawn over them (e.g. under the labels of the background map), and the top of all
 * layers of the elements (under e.g. the selection).
 */
export const AREAS_TOP = 'elements_areas_top';
export const ELEMENTS_TOP = 'elements_top';

/**
 * The most layers for the elements: every layer costs time (a map with 559 layers took ten times as
 * long to load as with 4), so with more, they are drawn with fewer layers, see `planLayers`.
 */
export const MAX_LAYERS = 200;

/**
 * What an element draws: the roles of its style, whether it has a label, and whether it is a
 * marker that lies flat on the map, which a layer of its own kind draws (see `symbolAlignment`).
 */
export interface Drawn {
	roles: Role[];
	label: boolean;
	flat?: boolean;
}

/** The layers that draw the elements, in drawing order, see `planLayers`. */
export interface LayerPlan {
	/** Each layer with the elements (their indices) that it draws; `flat` for one of flat markers. */
	layers: { role: Role; elements: number[]; flat?: true }[];
	/** Whether the markers are drawn over all areas and lines. */
	markersOnTop: boolean;
	/** Whether the labels of all markers are drawn by one layer over all markers, see `LABELS_LAYER`. */
	sharedLabels: boolean;
	/** Whether flat markers have labels then, which a layer of their own draws, see `FLAT_LABELS_LAYER`. */
	flatLabels?: true;
}

/**
 * The layers that draw the elements (in drawing order). It starts with the layers of each element:
 * its area, its outline or line, its marker. Then it merges each layer into the one before it if
 * they draw the same, e.g. two lines in a row: within a layer, the elements keep their order, so
 * this draws exactly the same with fewer layers. Flat markers and upright ones stay apart, since
 * a layer draws its markers all alike. And a marker after a label stays apart: MapLibre
 * draws the symbols of a layer before all its labels (maplibre-gl-js issue #49). The arrowheads of
 * lines are drawn over the lines of their layer: a line after a line with arrowheads joins the
 * layer of that line, under its arrowheads, so lines in a row keep one layer.
 *
 * With `markersOnTop` (e.g. while the labels of the background map are between the areas and lines
 * and the markers), the layers of the markers come after those of all areas and lines.
 *
 * With more than `MAX_LAYERS` layers, the drawing differs, step by step until they are few enough:
 * 1. the labels of all markers in one layer over all markers (see `LABELS_LAYER`);
 * 2. the markers over all areas and lines;
 * 3. all areas under all lines and outlines.
 */
export function planLayers(elements: Drawn[], markersOnTop = false): LayerPlan {
	const steps = [
		{ markersOnTop, sharedLabels: false, mergeAreas: false },
		{ markersOnTop, sharedLabels: true, mergeAreas: false },
		{ markersOnTop: true, sharedLabels: true, mergeAreas: false },
		{ markersOnTop: true, sharedLabels: true, mergeAreas: true }
	];
	let plan: LayerPlan | undefined;
	for (const step of steps) {
		plan = mergeLayers(elements, step);
		if (plan.layers.length <= MAX_LAYERS) break;
	}
	return plan!;
}

/** The layers of the elements, merged where they draw the same, see `planLayers`. */
function mergeLayers(
	elements: Drawn[],
	{ markersOnTop, sharedLabels, mergeAreas }: { markersOnTop: boolean; sharedLabels: boolean; mergeAreas: boolean }
): LayerPlan {
	// one layer per element and role
	let single = elements.flatMap((drawn, element) =>
		ROLES.filter((role) => drawn.roles.includes(role)).map((role) => ({
			role,
			element,
			label: role === 'symbol' && drawn.label && !sharedLabels,
			flat: role === 'symbol' && drawn.flat === true
		}))
	);
	const markers = single.filter((layer) => layer.role === 'symbol');
	if (markersOnTop) single = [...single.filter((layer) => layer.role !== 'symbol'), ...markers];
	if (mergeAreas) single = [...ROLES.flatMap((role) => single.filter((layer) => layer.role === role))];
	const merged: { role: Role; elements: number[]; label: boolean; flat: boolean }[] = [];
	for (const { role, element, label, flat } of single) {
		// a line under the arrowheads of the lines before it
		const lines = role === 'stroke' && merged.at(-1)?.role === 'arrow' ? merged.at(-2) : undefined;
		const last = lines?.role === 'stroke' ? lines : merged.at(-1);
		if (last && last.role === role && !last.label && last.flat === flat) {
			last.elements.push(element);
			last.label = label;
		} else {
			merged.push({ role, elements: [element], label, flat });
		}
	}
	return {
		layers: merged.map(({ role, elements, flat }) => ({ role, elements, ...(flat ? { flat: true as const } : {}) })),
		markersOnTop: markersOnTop || mergeAreas,
		sharedLabels,
		...(sharedLabels && elements.some((drawn) => drawn.flat && drawn.label) ? { flatLabels: true as const } : {})
	};
}

/** The ids of the layers that draw the element: one per role of its style, shared with the other elements. */
export function layerIdsOf(element: AbstractElement): string[] {
	return rolesOf(element).map((role) => ELEMENT_LAYERS[role]);
}

/**
 * A value that the layer looks up by a feature property, since features cannot have array
 * properties (e.g. dash arrays): `lookup('dash', [['dashed', [2, 4]], …], [100])`.
 */
function lookup(property: string, entries: [string | number, unknown][], fallback: unknown): ExpressionSpecification {
	return [
		'match',
		['get', property],
		...entries.flatMap(([key, value]) => [key, ['literal', value]]),
		['literal', fallback]
	] as unknown as ExpressionSpecification;
}

const DASH_ARRAYS = lookup('dash', Object.entries(dashArrays), dashArrays.solid);

/** A GeoJSON source without features, which the editor fills. */
export function emptySource(): SourceSpecification {
	return { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
}

/**
 * The sources and layers that draw all elements. Every map style gets them. The label places
 * are those of the symbols that are loaded (see `loadSymbols`).
 */
export function elementStyle(font: string): {
	sources: Record<string, SourceSpecification>;
	layers: LayerSpecification[];
} {
	return {
		sources: Object.fromEntries(ROLES.map((role) => [ELEMENT_LAYERS[role], emptySource()])),
		layers: [
			elementLayer('fill', ELEMENT_LAYERS.fill, font),
			elementLayer('stroke', ELEMENT_LAYERS.stroke, font),
			elementLayer('arrow', ELEMENT_LAYERS.arrow, font),
			anchorLayer(AREAS_TOP),
			elementLayer('symbol', ELEMENT_LAYERS.symbol, font),
			anchorLayer(ELEMENTS_TOP)
		]
	};
}

/** An invisible layer that marks a place in the map style, see `AREAS_TOP`. */
function anchorLayer(id: string): LayerSpecification {
	return { id, type: 'background', layout: { visibility: 'none' } };
}

/**
 * The direction of an arrowhead: along the line at its end point, or the one of the zoom level
 * where the line bends within the head, see `arrowHeads`.
 */
const ARROW_ROTATE = [
	'step',
	['zoom'],
	...Array.from({ length: ROTATE_ZOOMS }, (_, zoom) => [
		...(zoom > 0 ? [zoom] : []),
		['coalesce', ['get', rotateProperty(zoom)], ['get', 'rotate']]
	]).flat()
] as ExpressionSpecification;

/**
 * A layer of a role, see `planLayers`: it draws the features that name it. Markers with the glyph
 * font of their labels.
 */
function elementLayer(role: Role, id: string, font: string): LayerSpecification {
	const filter: ExpressionSpecification = ['==', ['get', 'layer'], id];
	switch (role) {
		case 'fill':
			return {
				id,
				source: ELEMENT_LAYERS.fill,
				type: 'fill',
				filter,
				layout: { 'fill-sort-key': ['get', 'order'] },
				paint: { 'fill-pattern': ['get', 'pattern'], 'fill-opacity': ['get', 'opacity'] }
			};
		case 'stroke':
			return {
				id,
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
		case 'arrow':
			return {
				id,
				source: ELEMENT_LAYERS.arrow,
				type: 'symbol',
				filter,
				layout: {
					'symbol-sort-key': ['get', 'order'],
					'icon-image': ['get', 'icon'],
					'icon-size': ['get', 'size'],
					// a number, since MapLibre makes array properties of features strings: [offset, 0]
					'icon-offset': [
						'interpolate',
						['linear'],
						['get', 'offset'],
						0,
						['literal', [0, 0]],
						1000,
						['literal', [1000, 0]]
					],
					// turned with the map, so it points along the line
					'icon-rotate': ARROW_ROTATE,
					'icon-rotation-alignment': 'map',
					'icon-pitch-alignment': 'map',
					'icon-allow-overlap': true,
					'icon-ignore-placement': true
				},
				paint: { 'icon-color': ['get', 'color'] }
			};
		case 'symbol':
			return symbolLayer(font, id);
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
/** A width of a label in letters that none reaches, so MapLibre does not break its lines. */
const NO_LINE_BREAKS = 1000;

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
 * The layer of the labels of markers when there would be too many layers otherwise (see
 * `planLayers`): the markers share layers of symbols, whose labels would be placed from the back, so the marker behind keeps its
 * label where two overlap. This layer draws them all, placed from the front, above the markers.
 * (Under them, each label would collide with the symbol of its own marker and be hidden.) Labels
 * hidden where they overlap still avoid each other, but may cover the symbols of other markers.
 */
export const LABELS_LAYER = 'elements_labels';
/** The layer of the labels of the flat markers then, which lie on the map, over the other labels. */
export const FLAT_LABELS_LAYER = 'elements_labels_flat';
const LABELS_LAYERS = [LABELS_LAYER, FLAT_LABELS_LAYER];

/**
 * A layer of the labels of the markers, see `LABELS_LAYER`: their texts without the symbols, of
 * the upright markers or of the flat ones.
 */
function labelsLayer(font: string, flat: boolean): LayerSpecification {
	const id = flat ? FLAT_LABELS_LAYER : LABELS_LAYER;
	const markers = symbolLayer(font, id) as {
		layout: Record<string, unknown>;
		paint: Record<string, unknown>;
	};
	const text = (properties: Record<string, unknown>) =>
		Object.fromEntries(Object.entries(properties).filter(([key]) => key.startsWith('text-')));
	return {
		id,
		source: ELEMENT_LAYERS.symbol,
		type: 'symbol',
		filter: [flat ? '==' : '!=', ['get', 'flat'], true],
		layout: { ...text(markers.layout), ...symbolAlignment(flat), 'symbol-sort-key': ['get', 'order'] },
		paint: text(markers.paint)
	} as LayerSpecification;
}

/**
 * How a layer draws its markers on a map that is rotated or tilted: flat on the map, the symbols
 * and the labels, so they turn and tilt with it; else upright, facing the viewer. MapLibre sets
 * that per layer, not per marker.
 */
export function symbolAlignment(flat: boolean) {
	const alignment = flat ? ('map' as const) : ('auto' as const);
	return {
		'icon-rotation-alignment': alignment,
		'icon-pitch-alignment': alignment,
		'text-rotation-alignment': alignment,
		'text-pitch-alignment': alignment
	};
}

/** The layout properties of the labels of markers that each layer of markers has alike. */
export const LABEL_LAYOUT_KEYS = ['text-font', 'text-field', 'text-overlap', 'text-optional'] as const;

/**
 * The largest ratio of the size of a symbol to the size of its label (`labelScale`) with exact
 * label offsets; larger ones have the offsets of this one.
 */
const MAX_LABEL_SCALE = 10;

/** The places of a label with their offsets times `factor`. */
function scaledPlaces(places: (string | [number, number])[], factor: number): (string | [number, number])[] {
	return places.map((place) => (typeof place === 'string' ? place : [place[0] * factor, place[1] * factor]));
}

/**
 * The places of the labels with their offsets, by their name (see `LABEL_PLACES`). The offsets are in ems of the label, for a symbol as large as its label;
 * they grow with the size of the symbol relative to its label (`labelScale`), interpolated from 0.
 */
function labelOffsets(): ExpressionSpecification {
	const table = Object.entries(labelPlaceTable(allSymbols()));
	const scaled = (factor: number) =>
		lookup(
			'place',
			table.map(([name, places]) => [name, scaledPlaces(places, factor)]),
			scaledPlaces(LABEL_PLACES.auto, factor)
		);
	return ['interpolate', ['linear'], ['get', 'labelScale'], 0, scaled(0), MAX_LABEL_SCALE, scaled(MAX_LABEL_SCALE)];
}

/** A layer of markers, with the glyph font of their labels. */
function symbolLayer(font: string, id: string): LayerSpecification {
	return {
		id,
		source: ELEMENT_LAYERS.symbol,
		type: 'symbol',
		filter: ['==', ['get', 'layer'], id],
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
			'text-size': ['*', ['get', 'labelSize'], 16],
			// A label has the lines that its author gave it: MapLibre would break a long one itself,
			// wherever it sees fit. Its lines are aligned to the side of the symbol: left beside it at
			// the right, right at the left, centered above and below.
			'text-max-width': NO_LINE_BREAKS,
			'text-justify': 'auto',
			'text-variable-anchor-offset': labelOffsets()
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
 * Draws all elements with one source per role and few layers (see `planLayers`), instead of a
 * source and layers per element, so maps with many elements (e.g. a table import) stay fast. The
 * elements are features with their element id; their styles are feature properties that the
 * layers read, and the id of the layer that draws them.
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
	/** Whether the layers must be planned again before the next flush, e.g. after labels were added. */
	private replan = false;
	private scheduled = false;
	/** The layer of each element and role, see `planLayers`, and what each draws, to notice a change. */
	private layerOf = new Map<AbstractElement, Partial<Record<Role, string>>>();
	private drawn = new Map<AbstractElement, string>();
	/** Whether the markers must be drawn over all areas and lines, see `planLayers`. */
	private markersOnTop = false;
	/** The layers of the areas and lines that have a place of their own (with the markers on top), and the others, in drawing order. */
	private planned: { areas: string[]; others: string[] } = { areas: [], others: [...Object.values(ELEMENT_LAYERS)] };
	/** The layers of the plan that draw flat markers, or their labels. */
	private flatLayers = new Set<string>();
	/** The layers of the elements that the map style has. */
	private present = new Set<string>(Object.values(ELEMENT_LAYERS));
	/** How the labels of markers are shown, see `LabelOptions`. */
	private labels: LabelOptions = DEFAULT_LABEL_OPTIONS;
	/** The glyph font of the labels of markers without one of their own: the one of the background map. */
	private font = 'noto_sans_regular';
	/** The fonts of their own that markers have, sorted, which `text-font` lists. */
	private fonts: string[] = [];

	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	/** The elements to draw, in drawing order. The map document calls it on every change of the list. */
	public setElements(elements: AbstractElement[]) {
		this.elements = elements;
		this.order = new Map(elements.map((element, i) => [element, i]));
		this.plan();
		this.redraw();
	}

	/** What the element draws, for the layers. */
	private static drawnOf(element: AbstractElement): Drawn {
		const symbol = element.getStyleLayers().symbol;
		const label = symbol?.getProperties().label;
		return {
			roles: rolesOf(element),
			label: typeof label === 'string' && label.trim() !== '',
			...(symbol?.flat ? { flat: true } : {})
		};
	}

	private static key({ roles, label, flat }: Drawn): string {
		return `${roles.join()}${label ? ' label' : ''}${flat ? ' flat' : ''}`;
	}

	/**
	 * The layers of the elements, see `planLayers`: the first one of each role has the id of the
	 * role (e.g. `elements_fill`), the others a number (e.g. `elements_fill_1`).
	 */
	private plan() {
		const drawn = this.elements.map((element) => ElementRenderer.drawnOf(element));
		const plan = planLayers(drawn, this.markersOnTop);
		const count: Partial<Record<Role, number>> = {};
		this.layerOf = new Map(this.elements.map((element) => [element, {}]));
		this.flatLayers = new Set(plan.flatLabels ? [FLAT_LABELS_LAYER] : []);
		const ids = plan.layers.map(({ role, elements, flat }) => {
			const n = (count[role] = (count[role] ?? -1) + 1);
			const id = n === 0 ? ELEMENT_LAYERS[role] : `${ELEMENT_LAYERS[role]}_${n}`;
			for (const i of elements) this.layerOf.get(this.elements[i])![role] = id;
			if (flat) this.flatLayers.add(id);
			return id;
		});
		// every map style has the first layer of each role, also if it draws nothing
		const all = [...ROLES.filter((role) => count[role] === undefined).map((role) => ELEMENT_LAYERS[role]), ...ids];
		const isArea = (id: string) => plan.markersOnTop && !id.startsWith(ELEMENT_LAYERS.symbol);
		this.planned = {
			areas: all.filter(isArea),
			others: [
				...all.filter((id) => !isArea(id)),
				...(plan.sharedLabels ? [LABELS_LAYER] : []),
				...(plan.flatLabels ? [FLAT_LABELS_LAYER] : [])
			]
		};
		this.drawn = new Map(this.elements.map((element, i) => [element, ElementRenderer.key(drawn[i])]));
	}

	/**
	 * Draw the markers over all areas and lines, e.g. while the labels of the background map are
	 * between them; else each element at its place in the order.
	 */
	public setMarkersOnTop(onTop: boolean) {
		if (onTop === this.markersOnTop) return;
		this.markersOnTop = onTop;
		this.plan();
		this.redraw();
	}

	/** The ids of the layers of a role, e.g. to find an element under the mouse. */
	public layerIds(role: Role): string[] {
		const ids = [...this.planned.areas, ...this.planned.others];
		const own = ids.filter((id) => id === ELEMENT_LAYERS[role] || id.startsWith(`${ELEMENT_LAYERS[role]}_`));
		// the labels of the markers, if they have layers of their own
		return role === 'symbol' ? [...own, ...LABELS_LAYERS.filter((id) => ids.includes(id))] : own;
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
		const own = this.present.has(LABELS_LAYER);
		for (const id of this.layerIds('symbol')) {
			for (const [key, value] of Object.entries(layout)) {
				const label = LABELS_LAYERS.includes(id) || !own;
				map.setLayoutProperty(id, key as keyof typeof layout, key === 'text-field' && !label ? '' : value);
			}
		}
		if (own) {
			const order: ExpressionSpecification = ['get', 'order'];
			const front = this.labels.overlap === 'hide';
			for (const id of LABELS_LAYERS) {
				if (this.present.has(id)) map.setLayoutProperty(id, 'symbol-sort-key', front ? ['-', 0, order] : order);
			}
		}
	}

	/** The glyph font of the labels of markers without a font of their own, e.g. of the background map. */
	public setFont(font: string) {
		this.font = font;
		this.applyFonts();
	}

	/**
	 * The fonts of the labels on the layers of the markers: each marker's own (the feature property
	 * `font`), else the font of the background map. `text-font` needs a list of fonts, which a
	 * feature property cannot be, so it lists the fonts that the markers have.
	 */
	private applyFonts() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const fallback = ['literal', [this.font]];
		const font = (
			this.fonts.length === 0
				? fallback
				: ['match', ['get', 'font'], ...this.fonts.flatMap((font) => [font, ['literal', [font]]]), fallback]
		) as ExpressionSpecification;
		for (const id of this.layerIds('symbol')) {
			if (map.getLayer(id)) map.setLayoutProperty(id, 'text-font', font);
		}
	}

	/** Update the fonts of the labels if the markers have other fonts of their own; `force`, e.g. for new layers. */
	private updateFonts(force: boolean) {
		const fonts = new Set<string>();
		for (const element of this.elements) {
			const font = element.getStyleLayers().symbol?.font;
			if (font) fonts.add(font);
		}
		const sorted = [...fonts].sort();
		if (!force && sorted.join() === this.fonts.join()) return;
		this.fonts = sorted;
		this.applyFonts();
	}

	/** A new map style has only the first layer of each role: the others are added again. */
	public onStyleLoad() {
		this.present = new Set(Object.values(ELEMENT_LAYERS));
		this.redraw();
	}

	/**
	 * Make the layers of the map style those of the plan, in its order: remove the others, add the
	 * missing ones, and move them into place, under `AREAS_TOP` (the areas and lines with the
	 * markers on top) and under `ELEMENTS_TOP` (all others). New layers of markers get the label
	 * font of the first one.
	 */
	private syncLayers() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const { areas, others } = this.planned;
		const wanted = new Set([...areas, ...others]);
		for (const id of this.present) {
			if (!wanted.has(id)) map.removeLayer(id);
		}
		for (const id of wanted) {
			if (this.present.has(id)) continue;
			const role = ROLES.find((role) => id.startsWith(ELEMENT_LAYERS[role]))!;
			map.addLayer(
				LABELS_LAYERS.includes(id)
					? labelsLayer('noto_sans_regular', id === FLAT_LABELS_LAYER)
					: elementLayer(role, id, 'noto_sans_regular'),
				ELEMENTS_TOP
			);
			// the font like that of the first layer of markers
			if (!LABELS_LAYERS.includes(id) && role !== 'symbol') continue;
			for (const key of LABEL_LAYOUT_KEYS) {
				const value = map.getLayoutProperty(ELEMENT_LAYERS.symbol, key);
				if (value !== undefined) map.setLayoutProperty(id, key, value);
			}
		}
		this.present = wanted;
		// the layers of the markers draw other markers than before: flat ones, or upright ones
		for (const id of this.layerIds('symbol')) {
			const alignment = symbolAlignment(this.flatLayers.has(id));
			for (const key of Object.keys(alignment) as (keyof typeof alignment)[]) {
				const value = alignment[key];
				if ((map.getLayoutProperty(id, key) ?? 'auto') !== value) map.setLayoutProperty(id, key, value);
			}
		}
		// from the top down, each right under the one above it
		for (const [ids, top] of [
			[areas, AREAS_TOP],
			[others, ELEMENTS_TOP]
		] as const) {
			let above: string = top;
			for (const id of [...ids].reverse()) {
				const order = map.getLayersOrder();
				if (order[order.indexOf(above) - 1] !== id) map.moveLayer(id, above);
				above = id;
			}
		}
		this.applyLabels();
	}

	/** Draw the element again, e.g. after a change of its geometry or style. */
	public update(element: AbstractElement) {
		// an element that is not (yet) on the map is drawn when it is added
		if (!this.order.has(element)) return;
		// e.g. a label or an outline added or removed can change the layers: planned once for all
		// changed elements, e.g. when undo takes the labels of many markers
		if (ElementRenderer.key(ElementRenderer.drawnOf(element)) !== this.drawn.get(element)) {
			this.replan = true;
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
		if (this.replan) {
			this.replan = false;
			this.plan();
		}
		if (this.all) {
			this.syncLayers();
			this.updateFonts(true);
			for (const role of ROLES) {
				const features = this.elements.flatMap((element) => this.featuresOf(element, role));
				this.source(role)?.setData({ type: 'FeatureCollection', features });
			}
		} else if (this.changed.size > 0) {
			const changed = [...this.changed].filter((element) => this.order.has(element));
			for (const role of ROLES) {
				// an element that gets or loses a role is planned again, see `update`
				const elements = changed.filter((element) => this.layerOf.get(element)?.[role]);
				if (elements.length === 0) continue;
				this.source(role)?.updateData({
					// replaced, or removed if it is not drawn any more (e.g. a hidden outline)
					remove: elements.flatMap((element) => featureIds(element, role)),
					add: elements.flatMap((element) => this.featuresOf(element, role))
				});
			}
			this.updateFonts(false);
		}
		this.all = false;
		this.changed.clear();
	}

	private source(role: Role) {
		// looked up each time, since a new map style replaces the source object
		return this.map.style ? this.map.getSource<maplibregl.GeoJSONSource>(ELEMENT_LAYERS[role]) : undefined;
	}

	/** The features of the element in the source of the role: one, or one per arrowhead. */
	private featuresOf(element: AbstractElement, role: Role): GeoJSON.Feature[] {
		const common = { order: this.order.get(element), layer: this.layerOf.get(element)?.[role] };
		const { geometry } = element.getFeature();
		if (role === 'arrow') {
			const arrows = element.getStyleLayers().stroke?.getArrowProperties();
			if (!arrows || geometry.type !== 'LineString') return [];
			return arrowHeads(geometry.coordinates as [number, number][], arrows).map(({ point, end, properties }) => ({
				type: 'Feature',
				id: arrowFeatureId(element.id, end),
				geometry: { type: 'Point', coordinates: point },
				properties: { ...properties, ...common }
			}));
		}
		const properties = element.getStyleLayers()[role]?.getProperties();
		if (!properties) return [];
		return [{ type: 'Feature', id: element.id, geometry, properties: { ...properties, ...common } }];
	}
}

/**
 * The id of the feature of an arrowhead: two per element, since a source needs a different id for
 * each feature. `elementIdOf` returns the element id.
 */
function arrowFeatureId(id: number, end: boolean): number {
	return id * 2 + (end ? 1 : 0);
}

/** The ids of the features that an element can have in the source of a role. */
function featureIds(element: AbstractElement, role: Role): number[] {
	return role === 'arrow' ? [arrowFeatureId(element.id, false), arrowFeatureId(element.id, true)] : [element.id];
}

/** The id of the element of a feature in the source of a role, e.g. of a feature under the mouse. */
export function elementIdOf(featureId: number, role: Role | undefined): number {
	return role === 'arrow' ? Math.floor(featureId / 2) : featureId;
}
