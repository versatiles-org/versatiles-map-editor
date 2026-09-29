import type { GeoPoint } from '../geometry.js';
import type { AbstractElement } from './abstract.svelte.js';
import type { FillStyle, LineStyle, SymbolStyle } from '../style/index.js';

/**
 * The parts of an element's style by their role: markers have a symbol, lines a stroke,
 * polygons and circles a fill and a stroke (their outline).
 */
export interface StyleLayers {
	symbol?: SymbolStyle;
	fill?: FillStyle;
	stroke?: LineStyle;
}

export interface SelectionNode {
	coordinates: GeoPoint;
	index: number;
	transparent?: boolean;
}

export interface SelectionNodeUpdater {
	update: (lng: number, lat: number) => void;
	/** Index of the dragged vertex in the path, if it is one (a dragged midpoint becomes a new vertex). */
	vertex?: number;
}

/** A measurement of the geometry of an element: a length or a radius in meters, or an area in square meters. */
export interface Measurement {
	kind: 'length' | 'radius' | 'area';
	value: number;
}

/** What an element reports to the document that holds it, e.g. the map document. */
export interface ElementOwner {
	/** Draw the element again, after a change of its geometry or style. */
	elementChanged(element: AbstractElement): void;
	/** Remove the element, e.g. when it is deleted. */
	removeElement(element: AbstractElement): void;
}
