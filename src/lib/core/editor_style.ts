import type { StateBackground } from '@versatiles/map-state';
import type { StyleSpecification } from '@versatiles/style';
import { getMapStyle, getSettings } from '../background/index.js';
import { ELEMENT_LAYERS, elementStyle } from './element_renderer.js';

/** Whether the primary input is a finger (e.g. phone or tablet) instead of a mouse. */
function hasCoarsePointer(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** The background map with the editor's own layers: the highlight, the selection marks and nodes. */
export function buildStyle(background: StateBackground | undefined, labelFont?: string): StyleSpecification {
	const style = getMapStyle(background);
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

	// All elements, between the highlight and the selection marks and nodes
	const elements = elementStyle(labelFont ?? getSettings(background).font);
	Object.assign(style.sources, elements.sources);
	style.layers.push(...elements.layers);

	// the nodes of several selected elements, which mark them but cannot be dragged
	style.sources.selection_marks = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
	style.layers.push({
		id: 'selection_marks',
		source: 'selection_marks',
		type: 'circle',
		paint: {
			'circle-color': '#ffffff',
			'circle-radius': 3,
			'circle-stroke-color': '#000000',
			'circle-stroke-width': 1
		}
	});

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

	// the element being drawn, in the color of the editor's controls
	style.sources.drawing = {
		type: 'geojson',
		data: { type: 'FeatureCollection', features: [] }
	};
	style.layers.push(
		{
			id: 'drawing_fill',
			source: 'drawing',
			type: 'fill',
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: { 'fill-color': '#115588', 'fill-opacity': 0.15 }
		},
		{
			id: 'drawing_line',
			source: 'drawing',
			type: 'line',
			filter: ['!=', ['geometry-type'], 'Point'],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: { 'line-color': '#115588', 'line-width': 2, 'line-dasharray': [2, 2] }
		},
		{
			id: 'drawing_nodes',
			source: 'drawing',
			type: 'circle',
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-color': '#ffffff',
				'circle-radius': hasCoarsePointer() ? 6 : 4,
				'circle-stroke-color': '#115588',
				'circle-stroke-width': 2
			}
		}
	);
	return style;
}

/**
 * Keep the content of the element sources, the selection marks and nodes and the highlight from the
 * previous style, so the elements stay visible while the next one loads. The layers come from the
 * next style, e.g. with the label font of the new background map.
 */
export function keepElements(previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
	if (!previous) return next;
	const sources = { ...next.sources };
	for (const id of [...Object.values(ELEMENT_LAYERS), 'highlight', 'selection_marks', 'selection_nodes', 'drawing']) {
		if (previous.sources[id]) sources[id] = previous.sources[id];
	}
	return { ...next, sources };
}
