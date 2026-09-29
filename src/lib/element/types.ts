import type { GeoPoint } from '../geometry.js';
import type { MapLayerFill, MapLayerLine, MapLayerSymbol } from '../map_layer/index.js';

/**
 * The map layers of an element by their role in its style: markers have a symbol, lines a stroke,
 * polygons and circles a fill and a stroke (their outline).
 */
export interface StyleLayers {
	symbol?: MapLayerSymbol;
	fill?: MapLayerFill;
	stroke?: MapLayerLine;
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

export interface Measurement {
	label: string;
	value: string;
}
