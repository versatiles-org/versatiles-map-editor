import type * as GeoJSON from 'geojson';
import type {
	MapState,
	StateElement,
	StateElementCircle,
	StateElementLine,
	StateElementMarker,
	StateElementPolygon,
	StateMetadata,
	StateFrame
} from './types.js';
import {
	fillPropsFromStyle,
	fillStyleFromProps,
	popupFromProps,
	removeViewerDefaults,
	sanitizeBoolean,
	sanitizeLabels,
	sanitizeNumber,
	sanitizeFrame,
	sanitizeMetadata,
	sanitizePosition,
	sanitizePositions,
	strokePropsFromStyle,
	linePropsFromStyle,
	lineStyleFromProps,
	strokeStyleFromProps,
	labelOf,
	symbolPropsFromStyle,
	symbolStyleFromProps
} from './profile.js';

/**
 * A GeoJSON FeatureCollection extended with the `frame`: what a shared map shows, e.g. its
 * visible area (`bounds`).
 * @category Files
 */
export type GeoJSONDocument = GeoJSON.FeatureCollection & {
	frame?: StateFrame;
	/** Properties of the whole map, e.g. its background. */
	meta?: StateMetadata;
};

/** The smoothing of a line or polygon (the property `smooth`), only if it is smooth. */
function smoothOf(p: GeoJSON.GeoJsonProperties): { smooth?: true } {
	return sanitizeBoolean(p?.smooth) ? { smooth: true } : {};
}

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
		properties: clean({ ...symbolPropsFromStyle(el.style), 'symbol-label': el.label, description: el.popup?.text }),
		geometry: { type: 'Point', coordinates: el.point }
	};
}

function lineToFeature(el: StateElementLine): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean({ ...linePropsFromStyle(el.style), smooth: el.smooth || undefined, description: el.popup?.text }),
		geometry: { type: 'LineString', coordinates: el.points }
	};
}

function polygonToFeature(el: StateElementPolygon): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: clean({
			...fillPropsFromStyle(el.style),
			...strokePropsFromStyle(el.outlineStyle),
			smooth: el.smooth || undefined,
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
			...strokePropsFromStyle(el.outlineStyle),
			subType: 'Circle',
			radius: el.radius,
			description: el.popup?.text
		}),
		geometry: { type: 'Point', coordinates: el.point }
	};
}

/**
 * Convert a map state document into a GeoJSON FeatureCollection.
 * @category Files
 */
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
	const frame = sanitizeFrame(state.frame);
	if (frame) doc.frame = frame;
	const meta: StateMetadata = {};
	if (state.meta?.background) meta.background = state.meta.background;
	if (state.meta?.legend) meta.legend = state.meta.legend;
	if (state.meta?.colorScheme) meta.colorScheme = state.meta.colorScheme;
	const viewer = removeViewerDefaults(state.meta?.viewer);
	if (viewer) meta.viewer = viewer;
	const labels = sanitizeLabels(state.meta?.labels);
	if (labels) meta.labels = labels;
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
					outlineStyle: strokeStyleFromProps(p)
				};
			}
			return { type: 'marker', point, ...labelOf(p?.['symbol-label']), style: symbolStyleFromProps(p) };
		}
		case 'LineString': {
			const points = sanitizePositions(g.coordinates);
			if (!points || points.length < 2) return undefined;
			return { type: 'line', points, style: lineStyleFromProps(p), ...smoothOf(p) };
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
				outlineStyle: strokeStyleFromProps(p),
				...smoothOf(p)
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
 * @category Files
 */
export function stateFromGeoJSON(doc: GeoJSONDocument | GeoJSON.GeoJSON): MapState {
	const elements: StateElement[] = [];
	for (const feature of flatten(toFeatures(doc))) {
		const element = featureToElement(feature);
		if (element) elements.push(element);
	}

	const state: MapState = { elements };
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
