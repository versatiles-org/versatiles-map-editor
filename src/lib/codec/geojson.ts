import type {
	StateRoot,
	StateElement,
	StateElementCircle,
	StateElementLine,
	StateElementMarker,
	StateElementPolygon
} from './types.js';
import {
	fillPropsFromStyle,
	fillStyleFromProps,
	sanitizeNumber,
	strokePropsFromStyle,
	strokeStyleFromProps,
	symbolPropsFromStyle,
	symbolStyleFromProps
} from './profile.js';

/**
 * A GeoJSON FeatureCollection extended with the editor's `map` viewport, which
 * mirrors the State viewport (`center` + `radius` in meters).
 */
export type GeoJSONDocument = GeoJSON.FeatureCollection & {
	map?: { center: [number, number]; radius: number };
};

type Point = [number, number];

function clean(properties: GeoJSON.GeoJsonProperties): GeoJSON.GeoJsonProperties {
	// drop undefined values so emitted properties stay compact and comparable
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(properties ?? {})) {
		if (v !== undefined) out[k] = v;
	}
	return out;
}

// ---------------------------------------------------------------------------
// State -> GeoJSON
// ---------------------------------------------------------------------------

function markerToFeature(el: StateElementMarker): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean(symbolPropsFromStyle(el.style)),
		geometry: { type: 'Point', coordinates: el.point }
	};
}

function lineToFeature(el: StateElementLine): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean(strokePropsFromStyle(el.style)),
		geometry: { type: 'LineString', coordinates: el.points }
	};
}

function polygonToFeature(el: StateElementPolygon): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean({ ...fillPropsFromStyle(el.style), ...strokePropsFromStyle(el.strokeStyle) }),
		geometry: { type: 'Polygon', coordinates: [[...el.points, el.points[0]]] }
	};
}

function circleToFeature(el: StateElementCircle): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean({
			...fillPropsFromStyle(el.style),
			...strokePropsFromStyle(el.strokeStyle),
			subType: 'Circle',
			radius: el.radius
		}),
		geometry: { type: 'Point', coordinates: el.point }
	};
}

/** Convert a map state document into a GeoJSON FeatureCollection. */
export function stateToGeoJSON(state: StateRoot): GeoJSONDocument {
	const features = state.elements.map((el): GeoJSON.Feature => {
		switch (el.type) {
			case 'marker':
				return markerToFeature(el);
			case 'line':
				return lineToFeature(el);
			case 'polygon':
				return polygonToFeature(el);
			case 'circle':
				return circleToFeature(el);
		}
	});

	const doc: GeoJSONDocument = { type: 'FeatureCollection', features };
	if (state.map) doc.map = { center: state.map.center, radius: state.map.radius };
	return doc;
}

// ---------------------------------------------------------------------------
// GeoJSON -> State
// ---------------------------------------------------------------------------

/** Expand Multi* geometries into their single-geometry features. */
function* flatten(features: GeoJSON.Feature[]): Generator<GeoJSON.Feature> {
	for (const feature of features) {
		const g = feature.geometry;
		switch (g.type) {
			case 'MultiPoint':
				for (const coordinates of g.coordinates) yield { ...feature, geometry: { type: 'Point', coordinates } };
				break;
			case 'MultiLineString':
				for (const coordinates of g.coordinates) yield { ...feature, geometry: { type: 'LineString', coordinates } };
				break;
			case 'MultiPolygon':
				for (const coordinates of g.coordinates) yield { ...feature, geometry: { type: 'Polygon', coordinates } };
				break;
			case 'GeometryCollection':
				yield* flatten(g.geometries.map((geometry) => ({ ...feature, geometry })));
				break;
			default:
				yield feature;
		}
	}
}

function featureToElement(feature: GeoJSON.Feature): StateElement | undefined {
	const p = feature.properties ?? {};
	const g = feature.geometry;

	switch (g.type) {
		case 'Point': {
			const point = g.coordinates as Point;
			const radius = sanitizeNumber(p.radius, 0);
			if (p.subType === 'Circle' && radius !== undefined) {
				return {
					type: 'circle',
					point,
					radius,
					style: fillStyleFromProps(p),
					strokeStyle: strokeStyleFromProps(p)
				};
			}
			return { type: 'marker', point, style: symbolStyleFromProps(p) };
		}
		case 'LineString':
			return { type: 'line', points: g.coordinates as Point[], style: strokeStyleFromProps(p) };
		case 'Polygon': {
			const ring = g.coordinates[0] as Point[];
			return {
				type: 'polygon',
				points: ring.slice(0, -1),
				style: fillStyleFromProps(p),
				strokeStyle: strokeStyleFromProps(p)
			};
		}
		default:
			return undefined;
	}
}

/** Convert a GeoJSON FeatureCollection into a map state document. */
export function stateFromGeoJSON(doc: GeoJSONDocument): StateRoot {
	const elements: StateElement[] = [];
	for (const feature of flatten(doc.features)) {
		const element = featureToElement(feature);
		if (element) elements.push(element);
	}

	const state: StateRoot = { elements };
	if (doc.map && Array.isArray(doc.map.center) && typeof doc.map.radius === 'number') {
		state.map = { center: doc.map.center, radius: doc.map.radius };
	}
	return state;
}
