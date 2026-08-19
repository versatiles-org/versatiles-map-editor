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
