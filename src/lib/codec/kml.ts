import { stateFromGeoJSON, stateToGeoJSON, type GeoJSONDocument } from './geojson.js';
import type { StateRoot } from './types.js';
import { child, children, descendants, parseXml, text, xml, type XmlElement } from './xml.js';

/**
 * KML, for Google Earth, Google My Maps and many GIS tools. It is converted to and from the
 * GeoJSON profile, which holds every property of the map state:
 * - For other tools, the elements get KML styles, names and descriptions, and circles are polygons.
 * - All properties are also stored in `<ExtendedData>`, so importing an exported file restores the
 *   exact map state. Files of other tools are imported as far as KML styles can be mapped.
 */

const MAP_DATA = 'versatiles:map';
const META_DATA = 'versatiles:meta';
const CENTER_DATA = 'center';
// Properties that only our export writes: they mark a Placemark whose ExtendedData is complete
const OWN_PROPERTIES = ['symbol-pattern', 'stroke-style', 'fill-pattern'];

type Properties = Record<string, unknown>;
type Point = [number, number];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** The map state as a KML document. */
export function stateToKML(state: StateRoot): string {
	const doc = stateToGeoJSON(state);
	const documentData: Record<string, string> = {};
	if (doc.map) documentData[MAP_DATA] = JSON.stringify(doc.map);
	if (doc.meta) documentData[META_DATA] = JSON.stringify(doc.meta);

	const content = [
		xml('name', 'Map'),
		doc.map &&
			xml('LookAt', [
				xml('longitude', String(doc.map.center[0])),
				xml('latitude', String(doc.map.center[1])),
				xml('range', String(Math.round(doc.map.radius * 2.5)))
			]),
		extendedData(documentData),
		...doc.features.map(featureToPlacemark)
	];
	return (
		'<?xml version="1.0" encoding="UTF-8"?>\n' +
		xml(
			'kml',
			[
				'\n',
				xml(
					'Document',
					content.filter(Boolean).map((c) => c + '\n')
				),
				'\n'
			],
			{
				xmlns: 'http://www.opengis.net/kml/2.2'
			}
		) +
		'\n'
	);
}

function featureToPlacemark(feature: GeoJSON.Feature): string {
	const p = (feature.properties ?? {}) as Properties;
	const data: Record<string, string> = {};
	for (const [key, value] of Object.entries(p)) {
		if (key !== 'description' && value !== undefined) data[key] = String(value);
	}

	let geometry: string;
	let style: string[];
	const g = feature.geometry;
	if (g.type === 'Point' && p.subType === 'Circle') {
		data[CENTER_DATA] = JSON.stringify(g.coordinates);
		geometry = polygonXml(circleRing(g.coordinates as Point, Number(p.radius)));
		style = [lineStyle(p), polyStyle(p)];
	} else if (g.type === 'Point') {
		geometry = xml('Point', [xml('coordinates', coordinates([g.coordinates as Point]))]);
		style = [
			xml('IconStyle', [
				xml('color', kmlColor(p['symbol-color'])),
				xml('scale', String(p['symbol-size'] ?? 1)),
				xml('heading', String(p['symbol-rotate'] ?? 0))
			])
		];
	} else if (g.type === 'LineString') {
		geometry = xml('LineString', [xml('coordinates', coordinates(g.coordinates as Point[]))]);
		style = [lineStyle(p)];
	} else if (g.type === 'Polygon') {
		geometry = polygonXml(g.coordinates[0] as Point[]);
		style = [lineStyle(p), polyStyle(p)];
	} else {
		throw new Error(`Unexpected geometry: ${g.type}`);
	}

	const label = typeof p['symbol-label'] === 'string' ? p['symbol-label'] : '';
	return xml('Placemark', [
		label ? xml('name', label) : undefined,
		typeof p.description === 'string' ? xml('description', p.description) : undefined,
		xml('Style', style),
		extendedData(data),
		geometry
	]);
}

function lineStyle(p: Properties): string {
	return xml('LineStyle', [xml('color', kmlColor(p['stroke-color'])), xml('width', String(p['stroke-width'] ?? 2))]);
}

function polyStyle(p: Properties): string {
	return xml('PolyStyle', [
		xml('color', kmlColor(p['fill-color'], Number(p['fill-opacity'] ?? 1))),
		xml('outline', p['stroke-visibility'] === false ? '0' : '1')
	]);
}

function polygonXml(ring: Point[]): string {
	return xml('Polygon', [xml('outerBoundaryIs', [xml('LinearRing', [xml('coordinates', coordinates(ring))])])]);
}

function coordinates(points: Point[]): string {
	return points.map(([x, y]) => `${x},${y}`).join(' ');
}

function extendedData(data: Record<string, string>): string | undefined {
	const entries = Object.entries(data);
	if (entries.length === 0) return undefined;
	return xml(
		'ExtendedData',
		entries.map(([name, value]) => xml('Data', [xml('value', value)], { name }))
	);
}

/** A polygon approximating the circle, closed. */
function circleRing([lng, lat]: Point, radius: number, steps = 64): Point[] {
	const dLat = radius / 111320;
	const dLng = dLat / Math.max(Math.cos((lat * Math.PI) / 180), 0.01);
	const ring: Point[] = [];
	for (let i = 0; i <= steps; i++) {
		const a = (2 * Math.PI * (i % steps)) / steps;
		ring.push([Math.round((lng + dLng * Math.sin(a)) * 1e6) / 1e6, Math.round((lat + dLat * Math.cos(a)) * 1e6) / 1e6]);
	}
	return ring;
}

/** "#rrggbb" or "#rrggbbaa" as KML color "aabbggrr", with an additional opacity. */
function kmlColor(color: unknown, opacity = 1): string {
	const hex = typeof color === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color) ? color : '#ff0000';
	const alpha = (hex.length === 9 ? parseInt(hex.slice(7), 16) / 255 : 1) * opacity;
	const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return (aa + hex.slice(5, 7) + hex.slice(3, 5) + hex.slice(1, 3)).toLowerCase();
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** A KML document as map state. Throws if it is no KML. */
export function stateFromKML(kml: string): StateRoot {
	const root = parseXml(kml);
	const kmlElement = child(root, 'kml');
	if (!kmlElement) throw new Error('Not a KML document');

	const styles = new Map<string, XmlElement>();
	for (const style of [...descendants(kmlElement, 'Style'), ...descendants(kmlElement, 'StyleMap')]) {
		if (style.attributes.id) styles.set(style.attributes.id, style);
	}

	const doc: GeoJSONDocument = { type: 'FeatureCollection', features: [] };
	const document = child(kmlElement, 'Document') ?? kmlElement;
	const documentData = readExtendedData(child(document, 'ExtendedData'));
	const map = parseJson(documentData[MAP_DATA]);
	if (map) doc.map = map as GeoJSONDocument['map'];
	const meta = parseJson(documentData[META_DATA]);
	if (meta) doc.meta = meta as GeoJSONDocument['meta'];

	for (const placemark of descendants(kmlElement, 'Placemark')) {
		const feature = placemarkToFeature(placemark, styles);
		if (feature) doc.features.push(feature);
	}
	return stateFromGeoJSON(doc);
}

function placemarkToFeature(placemark: XmlElement, styles: Map<string, XmlElement>): GeoJSON.Feature | undefined {
	const geometry = readGeometry(placemark);
	if (!geometry) return undefined;
	const data = readExtendedData(child(placemark, 'ExtendedData'));
	const description = text(child(placemark, 'description'));

	// exported by this editor: the ExtendedData holds every property
	if (OWN_PROPERTIES.some((key) => key in data)) {
		const properties: Properties = { ...data };
		if (description !== undefined) properties.description = description;
		const center = parseJson(data[CENTER_DATA]);
		delete properties[CENTER_DATA];
		if (data.subType === 'Circle' && Array.isArray(center)) {
			return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: center as Point } };
		}
		return { type: 'Feature', properties, geometry };
	}

	// from another tool: as far as the KML style can be mapped
	const style = resolveStyle(placemark, styles);
	const properties: Properties = {};
	const name = text(child(placemark, 'name'))?.trim();
	const iconColor = readColor(child(child(style, 'IconStyle'), 'color'));
	const lineStyle = child(style, 'LineStyle');
	const lineColor = readColor(child(lineStyle, 'color'));
	const polyStyle = child(style, 'PolyStyle');
	const polyColor = readColor(child(polyStyle, 'color'));

	if (name) properties['symbol-label'] = name;
	if (iconColor) properties['symbol-color'] = iconColor.color;
	if (lineColor) properties['stroke-color'] = lineColor.color;
	const width = text(child(lineStyle, 'width'));
	if (width) properties['stroke-width'] = width;
	if (polyColor) {
		properties['fill-color'] = polyColor.color;
		properties['fill-opacity'] = polyColor.opacity;
	}
	if (text(child(polyStyle, 'fill'))?.trim() === '0') properties['fill-opacity'] = 0;
	if (text(child(polyStyle, 'outline'))?.trim() === '0') properties['stroke-visibility'] = false;
	if (description?.trim()) properties.description = htmlToText(description);
	return { type: 'Feature', properties, geometry };
}

/** The inline style, or the one referenced by `styleUrl` (through a StyleMap to its normal style). */
function resolveStyle(placemark: XmlElement, styles: Map<string, XmlElement>): XmlElement | undefined {
	const inline = child(placemark, 'Style');
	if (inline) return inline;
	let style = styles.get(text(child(placemark, 'styleUrl'))?.trim().replace(/^.*#/, '') ?? '');
	for (let depth = 0; style?.name === 'StyleMap' && depth < 3; depth++) {
		const pair = children(style, 'Pair').find((p) => text(child(p, 'key'))?.trim() === 'normal');
		const inlinePairStyle = child(pair, 'Style');
		style = inlinePairStyle ?? styles.get(text(child(pair, 'styleUrl'))?.trim().replace(/^.*#/, '') ?? '');
	}
	return style?.name === 'Style' ? style : undefined;
}

function readGeometry(element: XmlElement): GeoJSON.Geometry | undefined {
	for (const c of element.children) {
		if (typeof c === 'string') continue;
		switch (c.name) {
			case 'Point': {
				const [point] = readCoordinates(c);
				if (point) return { type: 'Point', coordinates: point };
				break;
			}
			case 'LineString':
				return { type: 'LineString', coordinates: readCoordinates(c) };
			case 'Polygon': {
				// only the outer ring; holes are not supported
				const ring = child(child(c, 'outerBoundaryIs'), 'LinearRing');
				return { type: 'Polygon', coordinates: [readCoordinates(ring)] };
			}
			case 'MultiGeometry': {
				const geometries = c.children
					.filter((g): g is XmlElement => typeof g !== 'string')
					.map((g) => readGeometry({ name: '', attributes: {}, children: [g] }))
					.filter((g): g is GeoJSON.Geometry => g !== undefined);
				return { type: 'GeometryCollection', geometries };
			}
		}
	}
	// e.g. gx:Track, Model: not supported
	return undefined;
}

function readCoordinates(element: XmlElement | undefined): Point[] {
	const value = text(child(element, 'coordinates')) ?? '';
	return value
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((tuple) => tuple.split(',').map(Number))
		.filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
		.map(([x, y]) => [x, y]);
}

function readExtendedData(element: XmlElement | undefined): Record<string, string> {
	const data: Record<string, string> = {};
	for (const d of children(element, 'Data')) {
		const name = d.attributes.name;
		const value = text(child(d, 'value'));
		if (name && value !== undefined) data[name] = value;
	}
	return data;
}

/** A KML color "aabbggrr" as "#rrggbb" and an opacity. */
function readColor(element: XmlElement | undefined): { color: string; opacity: number } | undefined {
	const value = text(element)?.trim().replace(/^#/, '');
	if (!value || !/^[0-9a-f]{8}$/i.test(value)) return undefined;
	return {
		color: `#${value.slice(6, 8)}${value.slice(4, 6)}${value.slice(2, 4)}`.toLowerCase(),
		opacity: Math.round((parseInt(value.slice(0, 2), 16) / 255) * 100) / 100
	};
}

/** Descriptions of other tools are often HTML: line breaks are kept, other tags are removed. */
function htmlToText(html: string): string {
	return html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li)>/gi, '\n')
		.replace(/<[^>]*>/g, '')
		.replace(/&nbsp;/g, ' ')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function parseJson(value: string | undefined): unknown {
	if (value === undefined) return undefined;
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}
