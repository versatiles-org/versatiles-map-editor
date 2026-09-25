import type { GeoPoint } from '../utils/types.js';

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
