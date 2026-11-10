/**
 * The features of an element, as the layers of the elements draw them: one per role (the fill and
 * the stroke of an area, the stroke of a line, the symbol of a marker), and one per arrowhead.
 */
import { AREA_DEFAULTS, LINE_DEFAULTS, MARKER_DEFAULTS, OUTLINE_DEFAULTS } from '../profile.js';
import type { Position, StateElement } from '../types.js';
import { arrowHeads, type ArrowHead } from './arrow_heads.js';
import { circle } from './geometry.js';
import {
	arrowProperties,
	fillProperties,
	strokeProperties,
	symbolProperties,
	type FillProperties,
	type StrokeProperties,
	type SymbolProperties
} from './properties.js';
import { smoothPath } from './smooth_path.js';
import type { SymbolInfo } from './types.js';

/**
 * The parts of an element that a layer draws, each drawn by one layer for all elements: the fill
 * of an area, the stroke of a line or an outline, the arrowheads of a line, the symbol of a marker.
 */
export type ElementRole = 'fill' | 'stroke' | 'arrow' | 'symbol';

/** The points of a circle element's ring: so many that it looks round at every size. */
const CIRCLE_STEPS = 72;

/** The drawn line of a line element: through its points, or the curve through them if it is smooth. */
export function lineGeometry(points: Position[], smooth = false): GeoJSON.LineString {
	return { type: 'LineString', coordinates: smooth ? smoothPath(points, false) : points };
}

/** The drawn area of a polygon element, whose `ring` does not repeat its first point. */
export function polygonGeometry(ring: Position[], smooth = false): GeoJSON.Polygon {
	const drawn = smooth ? smoothPath(ring, true) : ring;
	return { type: 'Polygon', coordinates: [[...drawn, drawn[0]]] };
}

/** The drawn area of a circle element: a ring at `radius` meters around its point. */
export function circleGeometry(point: Position, radius: number): GeoJSON.Polygon {
	const ring = circle(point, radius, CIRCLE_STEPS);
	return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}

/** What the map draws of an element. */
export function elementGeometry(element: StateElement): GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon {
	switch (element.type) {
		case 'marker':
			return { type: 'Point', coordinates: element.point };
		case 'line':
			return lineGeometry(element.points, element.smooth === true);
		case 'polygon':
			return polygonGeometry(element.points, element.smooth === true);
		case 'circle':
			return circleGeometry(element.point, element.radius);
	}
}

/** The properties of the features of each role. */
export interface RoleProperties {
	fill: FillProperties;
	stroke: StrokeProperties;
	arrow: ArrowHead['properties'];
	symbol: SymbolProperties;
}

/** A feature of an element in a role, without an id; an arrowhead tells at which end it is. */
export interface ElementFeature<R extends ElementRole = ElementRole> {
	geometry: GeoJSON.Point | GeoJSON.LineString | GeoJSON.Polygon;
	properties: RoleProperties[R];
	/** Of an arrowhead: whether it is at the last point, else at the first one. */
	end?: boolean;
}

/**
 * The features of an element in a role: none if it draws nothing in it (e.g. a hidden outline, a
 * line without arrowheads, a marker's fill), one per arrowhead, else one. `symbol` gives the image
 * of the symbol of a marker by its name, e.g. "icons:anchor", undefined for none.
 */
export function elementFeatures<R extends ElementRole>(
	element: StateElement,
	role: R,
	symbol: (name: string) => SymbolInfo | undefined
): ElementFeature<R>[];
export function elementFeatures(
	element: StateElement,
	role: ElementRole,
	symbol: (name: string) => SymbolInfo | undefined
): ElementFeature[] {
	const geometry = elementGeometry(element);
	const one = (properties: RoleProperties[ElementRole] | undefined): ElementFeature[] =>
		properties ? [{ geometry, properties }] : [];
	switch (element.type) {
		case 'marker': {
			if (role !== 'symbol') return [];
			const style = { ...MARKER_DEFAULTS, ...element.style };
			return one(symbolProperties(style, element.label ?? '', symbol(style.symbol)));
		}
		case 'line': {
			const style = { ...LINE_DEFAULTS, ...element.style };
			if (role === 'stroke') return one(strokeProperties(style));
			if (role !== 'arrow' || geometry.type !== 'LineString') return [];
			const arrows = arrowProperties(style);
			if (!arrows) return [];
			return arrowHeads(geometry.coordinates as Position[], arrows).map(({ point, end, properties }) => ({
				geometry: { type: 'Point', coordinates: point },
				properties,
				end
			}));
		}
		case 'polygon':
		case 'circle':
			if (role === 'fill') return one(fillProperties({ ...AREA_DEFAULTS, ...element.style }));
			if (role === 'stroke') return one(strokeProperties({ ...OUTLINE_DEFAULTS, ...element.outlineStyle }));
			return [];
	}
}
