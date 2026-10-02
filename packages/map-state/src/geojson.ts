import type * as GeoJSON from 'geojson';
import type {
	MapState,
	StateElement,
	StateElementCircle,
	StateElementLine,
	StateElementMarker,
	StateElementPolygon,
	StateMetadata,
	Bounds
} from './types.js';
import {
	fillPropsFromStyle,
	fillStyleFromProps,
	popupFromProps,
	removeViewerDefaults,
	sanitizeLabelMinZoom,
	sanitizeCamera,
	sanitizeNumber,
	sanitizeFrame,
	sanitizeMetadata,
	sanitizePosition,
	sanitizePositions,
	strokePropsFromStyle,
	strokeStyleFromProps,
	symbolPropsFromStyle,
	symbolStyleFromProps
} from './profile.js';

/**
 * A GeoJSON FeatureCollection extended with the editor's `map` camera (`center` + `radius` in
 * meters) and the `frame`, the visible area of the map (`[west, south, east, north]`).
 */
export type GeoJSONDocument = GeoJSON.FeatureCollection & {
	map?: { center: [number, number]; radius: number };
	frame?: Bounds;
	/** Properties of the whole map, e.g. its background. */
	meta?: StateMetadata;
};

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
		properties: clean({ ...symbolPropsFromStyle(el.style), description: el.popup?.text }),
		geometry: { type: 'Point', coordinates: el.point }
	};
}

function lineToFeature(el: StateElementLine): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean({ ...strokePropsFromStyle(el.style), description: el.popup?.text }),
		geometry: { type: 'LineString', coordinates: el.points }
	};
}

function polygonToFeature(el: StateElementPolygon): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean({
			...fillPropsFromStyle(el.style),
			...strokePropsFromStyle(el.strokeStyle),
			description: el.popup?.text
		}),
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
			radius: el.radius,
			description: el.popup?.text
		}),
		geometry: { type: 'Point', coordinates: el.point }
	};
}

/** Convert a map state document into a GeoJSON FeatureCollection. */
export function stateToGeoJSON(state: MapState): GeoJSONDocument {
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
	const frame = sanitizeFrame(state.frame);
	if (frame) doc.frame = frame;
	const meta: StateMetadata = {};
	if (state.meta?.background) meta.background = state.meta.background;
	if (state.meta?.legend) meta.legend = state.meta.legend;
	if (state.meta?.colorScheme) meta.colorScheme = state.meta.colorScheme;
	const viewer = removeViewerDefaults(state.meta?.viewer);
	if (viewer) meta.viewer = viewer;
	if (state.meta?.labelOverlap === 'hide') meta.labelOverlap = 'hide';
	const labelMinZoom = sanitizeLabelMinZoom(state.meta?.labelMinZoom);
	if (labelMinZoom !== undefined) meta.labelMinZoom = labelMinZoom;
	if (state.meta?.mapLabelsOnTop) meta.mapLabelsOnTop = true;
	if (state.meta?.title) meta.title = state.meta.title;
	if (Object.keys(meta).length > 0) doc.meta = meta;
	return doc;
}

// ---------------------------------------------------------------------------
// GeoJSON -> State
// ---------------------------------------------------------------------------

/** Expand Multi* geometries into their single-geometry features and skip features without geometry. */
function* flatten(features: GeoJSON.Feature[]): Generator<GeoJSON.Feature> {
	for (const feature of features) {
		const g = feature?.geometry;
		if (g == null) continue;
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
	const element = featureToElementWithoutPopup(feature);
	if (!element) return undefined;
	const popup = popupFromProps(feature.properties);
	if (popup) element.popup = popup;
	// default styles are absent, not undefined, like in a decoded state
	for (const key of Object.keys(element) as (keyof StateElement)[]) {
		if (element[key] === undefined) delete element[key];
	}
	return element;
}

function featureToElementWithoutPopup(feature: GeoJSON.Feature): StateElement | undefined {
	const p = feature.properties ?? {};
	const g = feature.geometry;

	switch (g.type) {
		case 'Point': {
			const point = sanitizePosition(g.coordinates);
			if (!point) return undefined;
			if (p.subType === 'Circle') {
				// a circle without a positive radius cannot be drawn: skipped, not turned into a marker
				const radius = sanitizeNumber(p.radius);
				if (radius === undefined || radius <= 0) return undefined;
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
		case 'LineString': {
			const points = sanitizePositions(g.coordinates);
			if (!points || points.length < 2) return undefined;
			return { type: 'line', points, style: strokeStyleFromProps(p) };
		}
		case 'Polygon': {
			// Only the outer ring is supported; holes are dropped.
			const points = sanitizePositions(g.coordinates?.[0]);
			if (!points) return undefined;
			const first = points[0];
			const last = points[points.length - 1];
			if (points.length > 1 && first[0] === last[0] && first[1] === last[1]) points.pop();
			if (points.length < 3) return undefined;
			return {
				type: 'polygon',
				points,
				style: fillStyleFromProps(p),
				strokeStyle: strokeStyleFromProps(p)
			};
		}
		default:
			return undefined;
	}
}

/** Normalize any GeoJSON object (collection, single feature or bare geometry) to a list of features. */
function toFeatures(doc: GeoJSON.GeoJSON): GeoJSON.Feature[] {
	switch (doc?.type) {
		case 'FeatureCollection':
			return Array.isArray(doc.features) ? doc.features : [];
		case 'Feature':
			return [doc];
		case 'Point':
		case 'MultiPoint':
		case 'LineString':
		case 'MultiLineString':
		case 'Polygon':
		case 'MultiPolygon':
		case 'GeometryCollection':
			return [{ type: 'Feature', properties: {}, geometry: doc }];
		default:
			throw new Error('Not a GeoJSON object');
	}
}

/**
 * Convert GeoJSON into a map state document. Accepts a FeatureCollection (optionally
 * with the editor's `map` viewport), a single Feature or a bare Geometry. Features
 * with missing or invalid geometry are skipped.
 */
export function stateFromGeoJSON(doc: GeoJSONDocument | GeoJSON.GeoJSON): MapState {
	const elements: StateElement[] = [];
	for (const feature of flatten(toFeatures(doc))) {
		const element = featureToElement(feature);
		if (element) elements.push(element);
	}

	const state: MapState = { elements };
	if (doc.type === 'FeatureCollection' && 'map' in doc) {
		const camera = sanitizeCamera(doc.map);
		if (camera) state.map = camera;
	}
	if (doc.type === 'FeatureCollection' && 'frame' in doc) {
		const frame = sanitizeFrame(doc.frame);
		if (frame) state.frame = frame;
	}
	if (doc.type === 'FeatureCollection' && 'meta' in doc) {
		const meta = sanitizeMetadata(doc.meta);
		if (meta) state.meta = meta;
	}
	return state;
}
