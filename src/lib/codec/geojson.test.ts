import { describe, it, expect } from 'vitest';
import { stateToGeoJSON, stateFromGeoJSON, type GeoJSONDocument } from './geojson.js';
import { encodeGeoJSON, decodeGeoJSON } from './index.js';
import type { StateRoot } from './types.js';

describe('stateToGeoJSON', () => {
	it('maps a marker to a Point feature with symbol properties', () => {
		const doc = stateToGeoJSON({ elements: [{ type: 'marker', point: [13.4, 52.5] }] });
		const f = doc.features[0];
		expect(f.geometry).toEqual({ type: 'Point', coordinates: [13.4, 52.5] });
		expect(f.properties).toMatchObject({ 'symbol-pattern': 'flag', 'symbol-color': '#ff0000' });
	});

	it('maps a line to a LineString feature with stroke properties', () => {
		const doc = stateToGeoJSON({
			elements: [
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					style: { color: '#00ff00' }
				}
			]
		});
		const f = doc.features[0];
		expect(f.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[0, 0],
				[1, 1]
			]
		});
		expect(f.properties).toMatchObject({ 'stroke-color': '#00ff00', 'stroke-style': 'solid' });
	});

	it('maps a polygon to a closed-ring Polygon feature', () => {
		const doc = stateToGeoJSON({
			elements: [
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					]
				}
			]
		});
		const ring = (doc.features[0].geometry as GeoJSON.Polygon).coordinates[0];
		expect(ring).toEqual([
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 0]
		]); // closed
	});

	it('maps a circle to a Point feature with subType and radius', () => {
		const doc = stateToGeoJSON({
			elements: [{ type: 'circle', point: [10, 20], radius: 500 }]
		});
		const f = doc.features[0];
		expect(f.geometry).toEqual({ type: 'Point', coordinates: [10, 20] });
		expect(f.properties).toMatchObject({ subType: 'Circle', radius: 500 });
	});

	it('emits the viewport as center + radius', () => {
		const doc = stateToGeoJSON({ map: { center: [13.4, 52.5], radius: 1234 }, elements: [] });
		expect(doc.map).toEqual({ center: [13.4, 52.5], radius: 1234 });
	});
});

describe('stateFromGeoJSON ∘ stateToGeoJSON round-trip (lossless)', () => {
	const state: StateRoot = {
		map: { center: [13.4, 52.5], radius: 1234 },
		elements: [
			{ type: 'marker', point: [13.4, 52.5] },
			{ type: 'marker', point: [1, 2], style: { color: '#abcdef', pattern: 10, label: 'x', size: 2 } },
			{
				type: 'line',
				points: [
					[0, 0],
					[1, 1],
					[2, 0]
				],
				style: { color: '#00ff00', pattern: 1, width: 5 }
			},
			{
				type: 'polygon',
				points: [
					[0, 0],
					[1, 0],
					[1, 1]
				],
				style: { color: '#112233', opacity: 0.5 },
				strokeStyle: { color: '#445566', width: 3, visible: false }
			},
			{
				type: 'circle',
				point: [10, 20],
				radius: 500,
				style: { color: '#778899' },
				strokeStyle: { pattern: 2 }
			}
		]
	};

	it('preserves the document exactly', () => {
		expect(stateFromGeoJSON(stateToGeoJSON(state))).toEqual(state);
	});
});

describe('stateFromGeoJSON', () => {
	it('flattens MultiPolygon features into multiple polygons', () => {
		const doc: GeoJSONDocument = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'MultiPolygon',
						coordinates: [
							[
								[
									[0, 0],
									[1, 0],
									[1, 1],
									[0, 0]
								]
							],
							[
								[
									[5, 5],
									[6, 5],
									[6, 6],
									[5, 5]
								]
							]
						]
					}
				}
			]
		};
		const state = stateFromGeoJSON(doc);
		expect(state.elements.map((e) => e.type)).toEqual(['polygon', 'polygon']);
	});
});

describe('encodeGeoJSON / decodeGeoJSON', () => {
	it('round-trips a document through base64 (stable fixed point + geometry preserved)', () => {
		const doc = stateToGeoJSON({
			elements: [
				{ type: 'marker', point: [13.4, 52.5], style: { label: 'hello', pattern: 10 } },
				{
					type: 'line',
					points: [
						[1, 2],
						[3, 4]
					],
					style: { color: '#00ff00' }
				}
			]
		});
		const base64 = encodeGeoJSON(doc);
		const decoded = decodeGeoJSON(base64);
		// geometry survives (coordinates chosen on the 1e-5 quantization grid)
		expect(decoded.features.map((f) => f.geometry)).toEqual(doc.features.map((f) => f.geometry));
		// decoding is a fixed point: re-encoding yields the identical base64
		expect(encodeGeoJSON(decoded)).toBe(base64);
	});
});

describe('stateFromGeoJSON with foreign property values', () => {
	const point = (properties: GeoJSON.GeoJsonProperties): GeoJSONDocument => ({
		type: 'FeatureCollection',
		features: [{ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [13.4, 52.5] } }]
	});
	const styleOf = (properties: GeoJSON.GeoJsonProperties) => stateFromGeoJSON(point(properties)).elements[0];

	it('rounds and normalizes symbol rotation', () => {
		expect(styleOf({ 'symbol-rotate': 12.5 })).toMatchObject({ style: { rotate: 13 } });
		expect(styleOf({ 'symbol-rotate': 270 })).toMatchObject({ style: { rotate: -90 } });
	});

	it('clamps negative sizes and out-of-range opacity', () => {
		const circle = styleOf({ subType: 'Circle', radius: 100, 'stroke-width': -1, 'fill-opacity': 1.5 });
		expect(circle).toEqual({ type: 'circle', point: [13.4, 52.5], radius: 100, strokeStyle: { width: 0 } });
	});

	it('normalizes parseable colors and drops unparseable ones', () => {
		expect(styleOf({ 'symbol-color': 'rgb(1,2,3)' })).toMatchObject({ style: { color: '#010203' } });
		expect(styleOf({ 'symbol-color': '#FF0000' })).toEqual({ type: 'marker', point: [13.4, 52.5] });
		expect(styleOf({ 'symbol-color': 'notacolor' })).toEqual({ type: 'marker', point: [13.4, 52.5] });
		expect(styleOf({ 'symbol-color': 42 })).toEqual({ type: 'marker', point: [13.4, 52.5] });
	});

	it('coerces numeric strings, labels and boolean strings', () => {
		expect(styleOf({ 'symbol-size': '2', 'symbol-label': 7 })).toMatchObject({ style: { size: 2, label: '7' } });
		expect(styleOf({ subType: 'Circle', radius: '50', 'stroke-visibility': 'false' })).toMatchObject({
			radius: 50,
			strokeStyle: { visible: false }
		});
	});

	it('ignores invalid values', () => {
		expect(
			styleOf({ 'symbol-size': 'big', 'symbol-halo-width': null, 'symbol-label': {}, 'symbol-rotate': NaN })
		).toEqual({ type: 'marker', point: [13.4, 52.5] });
	});

	it('treats a circle with an invalid radius as a marker', () => {
		expect(styleOf({ subType: 'Circle', radius: 'wide' })).toMatchObject({ type: 'marker' });
	});

	it('always produces encodable documents', () => {
		for (const properties of [
			{ 'symbol-rotate': 12.5 },
			{ subType: 'Circle', radius: 100.7, 'stroke-width': -1 },
			{ 'symbol-color': 'notacolor' },
			{ 'symbol-size': Infinity, 'symbol-halo-width': -3 }
		]) {
			expect(() => encodeGeoJSON(point(properties))).not.toThrow();
		}
	});
});
