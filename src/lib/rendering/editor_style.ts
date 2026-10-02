import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { StateBackground } from '@versatiles/map-state';
import type { StyleSpecification } from '@versatiles/style';
import { getMapStyle, getSettings } from '../background/index.js';
import { AREAS_TOP, ELEMENT_LAYERS, elementStyle } from './element_renderer.js';

/** Whether the primary input is a finger (e.g. phone or tablet) instead of a mouse. */
function hasCoarsePointer(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** A part of the style: its sources, and its layers in drawing order. */
interface StylePart {
	sources: Record<string, SourceSpecification>;
	layers: LayerSpecification[];
}

/** A GeoJSON source without features, which the editor fills. */
function emptySource(): SourceSpecification {
	return { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
}

/**
 * The layers that are drawn under the labels of the background map if they are on top: the areas
 * and lines of the elements, and the highlight under them. The markers are always on top. The
 * renderer puts the other layers of areas and lines under `AREAS_TOP`.
 */
export const LAYERS_UNDER_MAP_LABELS = [
	'highlight_line',
	'highlight_point',
	ELEMENT_LAYERS.fill,
	ELEMENT_LAYERS.stroke,
	AREAS_TOP
];

/**
 * The background map with the editor's own layers over it, from the bottom up: the highlight, the
 * elements, the selection, and the element being drawn. With `mapLabelsOnTop`, the labels of the
 * background map are drawn over the highlight and the areas and lines of the elements.
 * `editorColor` is the color of the editor's own marks, `--color-accent-line` of the theme.
 */
export function buildStyle(
	background: StateBackground | undefined,
	font?: string,
	mapLabelsOnTop = false,
	editorColor = EDITOR_COLOR
): StyleSpecification {
	const style = getMapStyle(background);
	style.transition = { duration: 0, delay: 0 };
	// larger nodes are easier to see and hit with a finger
	const coarse = hasCoarsePointer();
	const parts = [
		highlightLayers(),
		elementStyle(font ?? getSettings(background).font),
		selectionLayers(coarse),
		visibleAreaLayers(coarse, editorColor),
		drawingLayers(coarse, editorColor)
	];
	const layers: LayerSpecification[] = [];
	for (const part of parts) {
		Object.assign(style.sources, part.sources);
		layers.push(...part.layers);
	}
	if (mapLabelsOnTop) {
		// under the first label of the background map, if it has labels
		const under = layers.filter((layer) => LAYERS_UNDER_MAP_LABELS.includes(layer.id));
		const labels = style.layers.findIndex((layer) => layer.type === 'symbol');
		style.layers.splice(labels < 0 ? style.layers.length : labels, 0, ...under);
		style.layers.push(...layers.filter((layer) => !under.includes(layer)));
	} else {
		style.layers.push(...layers);
	}
	return style;
}

/** Highlights the element with a popup under the pointer in the viewer, below all elements. */
function highlightLayers(): StylePart {
	return {
		sources: { highlight: emptySource() },
		layers: [
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
		]
	};
}

/**
 * The selection: the nodes of a single selected element, which can be dragged, and the nodes of
 * several selected elements, which only mark them.
 */
function selectionLayers(coarse: boolean): StylePart {
	return {
		sources: { selection_marks: emptySource(), selection_nodes: emptySource() },
		layers: [
			{
				id: 'selection_marks',
				source: 'selection_marks',
				type: 'circle',
				paint: {
					'circle-color': '#ffffff',
					'circle-radius': 3,
					'circle-stroke-color': '#000000',
					'circle-stroke-width': 1
				}
			},
			{
				id: 'selection_nodes',
				source: 'selection_nodes',
				type: 'circle',
				layout: {},
				paint: {
					// the selected node is filled, like in vector graphics software
					'circle-color': ['case', ['boolean', ['get', 'selected'], false], '#000000', '#ffffff'],
					'circle-opacity': ['get', 'opacity'],
					'circle-radius': coarse ? 6 : 3,
					'circle-stroke-color': '#000000',
					'circle-stroke-opacity': ['get', 'opacity'],
					'circle-stroke-width': 1
				}
			}
		]
	};
}

/**
 * The color of the editor's own marks on the map, if the theme cannot be read: about
 * `--color-accent-line` of the theme, oklch(60% 0.19 308).
 */
export const EDITOR_COLOR = '#a059d3';

/**
 * The visible area while it is edited: a veil outside the frame, its border, and without a frame
 * the bounds of the elements, dashed. Over the elements, since the veil covers what visitors do not see.
 */
function visibleAreaLayers(coarse: boolean, color: string): StylePart {
	return {
		sources: { visible_area: emptySource() },
		layers: [
			{
				id: 'visible_area_veil',
				source: 'visible_area',
				type: 'fill',
				filter: ['==', ['get', 'kind'], 'veil'],
				paint: { 'fill-color': '#000000', 'fill-opacity': 0.35 }
			},
			{
				id: 'visible_area_border',
				source: 'visible_area',
				type: 'line',
				filter: ['==', ['get', 'kind'], 'border'],
				paint: { 'line-color': color, 'line-width': 2 }
			},
			{
				id: 'visible_area_bounds',
				source: 'visible_area',
				type: 'line',
				filter: ['==', ['get', 'kind'], 'bounds'],
				paint: { 'line-color': color, 'line-width': 1.5, 'line-dasharray': [3, 2] }
			},
			{
				// the handles at the corners and edges, like the nodes of the element being drawn
				id: 'visible_area_handles',
				source: 'visible_area',
				type: 'circle',
				filter: ['==', ['get', 'kind'], 'handle'],
				paint: {
					'circle-color': '#ffffff',
					'circle-radius': coarse ? 7 : 5,
					'circle-stroke-color': color,
					'circle-stroke-width': 2
				}
			}
		]
	};
}

/** The element being drawn, in the color of the editor's controls. */
function drawingLayers(coarse: boolean, color: string): StylePart {
	return {
		sources: { drawing: emptySource() },
		layers: [
			{
				id: 'drawing_fill',
				source: 'drawing',
				type: 'fill',
				filter: ['==', ['geometry-type'], 'Polygon'],
				paint: { 'fill-color': color, 'fill-opacity': 0.15 }
			},
			{
				id: 'drawing_line',
				source: 'drawing',
				type: 'line',
				filter: ['!=', ['geometry-type'], 'Point'],
				layout: { 'line-cap': 'round', 'line-join': 'round' },
				paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 2] }
			},
			{
				id: 'drawing_nodes',
				source: 'drawing',
				type: 'circle',
				filter: ['==', ['geometry-type'], 'Point'],
				paint: {
					'circle-color': '#ffffff',
					'circle-radius': coarse ? 6 : 4,
					'circle-stroke-color': color,
					'circle-stroke-width': 2
				}
			}
		]
	};
}

/**
 * Keep the content of the element sources, the selection marks and nodes and the highlight from the
 * previous style, so the elements stay visible while the next one loads. The layers come from the
 * next style, e.g. with the label font of the new background map.
 */
export function keepElements(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
	if (!previous) return next;
	const sources = { ...next.sources };
	for (const id of [
		...Object.values(ELEMENT_LAYERS),
		'highlight',
		'selection_marks',
		'selection_nodes',
		'drawing',
		'visible_area'
	]) {
		if (previous.sources[id]) sources[id] = previous.sources[id];
	}
	return { ...next, sources };
}
