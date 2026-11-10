/**
 * The sources and layers that draw the elements of a map: one source per role, and as few layers as
 * draw them in their order (see `planLayers`). The editor adds and moves these layers on a running
 * map as the elements change; a map style of a whole map has them all.
 */
import type {
	ExpressionSpecification,
	LayerSpecification,
	SourceSpecification
} from '@maplibre/maplibre-gl-style-spec';
import type { DashName } from '../types.js';
import { ROTATE_ZOOMS, rotateProperty } from './arrow_heads.js';
import type { ElementRole } from './features.js';
import { LABEL_PLACES, labelPlaceTable } from './label_places.js';
import type { SymbolInfo } from './types.js';

/**
 * The source of each role, and its first layer, see `planLayers`. Within a layer, the elements keep
 * their order (the "order" property).
 */
export const ELEMENT_LAYERS: Record<ElementRole, string> = {
	fill: 'elements_fill',
	stroke: 'elements_stroke',
	arrow: 'elements_arrows',
	symbol: 'elements_symbol'
};
/** The roles in the order of their first layers. */
export const ELEMENT_ROLES = Object.keys(ELEMENT_LAYERS) as ElementRole[];
const ROLES = ELEMENT_ROLES;

/**
 * The dashes and gaps of each dash style, in multiples of the width of the line. The lines have
 * round caps, which add half the width at each end of a dash: "dashed" shows dashes and gaps of 3
 * widths, a dash of 0 is a dot.
 */
export const dashArrays: Record<DashName, number[]> = {
	solid: [100],
	dashed: [2, 4],
	dotted: [0, 2],
	// dashes of 6 widths, gaps of 3
	'long-dash': [5, 4],
	// a dash of 3 widths, a gap of 2, a dot, a gap of 2
	'dash-dot': [2, 3, 0, 3]
};

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
	roles: ElementRole[];
	label: boolean;
	flat?: boolean;
}

/** The layers that draw the elements, in drawing order, see `planLayers`. */
export interface LayerPlan {
	/** Each layer with the elements (their indices) that it draws; `flat` for one of flat markers. */
	layers: { role: ElementRole; elements: number[]; flat?: true }[];
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
	const merged: { role: ElementRole; elements: number[]; label: boolean; flat: boolean }[] = [];
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
 * The sources and layers that draw all elements, the first layer of each role, with empty sources.
 * Every map style of the editor gets them. The label places are those of the symbols of the
 * markers (see `fetchSymbolCatalog`), `font` the glyph font of the labels.
 */
export function elementStyle(
	font: string,
	symbols: SymbolInfo[]
): {
	sources: Record<string, SourceSpecification>;
	layers: LayerSpecification[];
} {
	return {
		sources: Object.fromEntries(ROLES.map((role) => [ELEMENT_LAYERS[role], emptySource()])),
		layers: [
			elementLayer('fill', ELEMENT_LAYERS.fill, font, symbols),
			elementLayer('stroke', ELEMENT_LAYERS.stroke, font, symbols),
			elementLayer('arrow', ELEMENT_LAYERS.arrow, font, symbols),
			anchorLayer(AREAS_TOP),
			elementLayer('symbol', ELEMENT_LAYERS.symbol, font, symbols),
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
 * font of their labels, and the label places of the symbols.
 */
export function elementLayer(role: ElementRole, id: string, font: string, symbols: SymbolInfo[]): LayerSpecification {
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
			return symbolLayer(font, id, symbols);
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
export const LABELS_LAYERS = [LABELS_LAYER, FLAT_LABELS_LAYER];

/**
 * A layer of the labels of the markers, see `LABELS_LAYER`: their texts without the symbols, of
 * the upright markers or of the flat ones.
 */
export function labelsLayer(font: string, flat: boolean, symbols: SymbolInfo[]): LayerSpecification {
	const id = flat ? FLAT_LABELS_LAYER : LABELS_LAYER;
	const markers = symbolLayer(font, id, symbols) as {
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
function labelOffsets(symbols: SymbolInfo[]): ExpressionSpecification {
	const table = Object.entries(labelPlaceTable(symbols));
	const scaled = (factor: number) =>
		lookup(
			'place',
			table.map(([name, places]) => [name, scaledPlaces(places, factor)]),
			scaledPlaces(LABEL_PLACES.auto, factor)
		);
	return ['interpolate', ['linear'], ['get', 'labelScale'], 0, scaled(0), MAX_LABEL_SCALE, scaled(MAX_LABEL_SCALE)];
}

/** A layer of markers, with the glyph font of their labels. */
function symbolLayer(font: string, id: string, symbols: SymbolInfo[]): LayerSpecification {
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
			'text-variable-anchor-offset': labelOffsets(symbols)
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
 * The glyph fonts of the labels of markers (`text-font`): each marker's own (the feature property
 * `font`), else `fallback`, e.g. the font of the background map. `text-font` needs a list of fonts,
 * which a feature property cannot be, so it lists `fonts`, those that the markers have.
 */
export function labelFont(fonts: string[], fallback: string): ExpressionSpecification {
	const other = ['literal', [fallback]];
	return (
		fonts.length === 0
			? other
			: ['match', ['get', 'font'], ...fonts.flatMap((font) => [font, ['literal', [font]]]), other]
	) as ExpressionSpecification;
}

/**
 * The order in which a layer of labels of its own (see `LABELS_LAYER`) places them: from the front
 * where labels that overlap are hidden, so the marker in front keeps its label; else from the back.
 */
export function labelSortKey(overlap: LabelOptions['overlap']): ExpressionSpecification {
	const order: ExpressionSpecification = ['get', 'order'];
	return overlap === 'hide' ? ['-', 0, order] : order;
}
