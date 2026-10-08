import { describe, it, expect } from 'vitest';
import { stateToGeoJSON, stateFromGeoJSON, type GeoJSONDocument } from './geojson.js';
import { decodeState, encodeState } from './index.js';
import { FILL_PATTERN_NAMES, STROKE_STYLE_NAMES, type MapState } from './types.js';

/** A GeoJSON document as a link, and back. */
const encodeGeoJSON = (doc: GeoJSONDocument) => encodeState(stateFromGeoJSON(doc));
const decodeGeoJSON = (base64: string) => stateToGeoJSON(decodeState(base64));

describe('stateToGeoJSON', () => {
	it('maps a marker to a Point feature with symbol properties', () => {
		const doc = stateToGeoJSON({ elements: [{ type: 'marker', point: [13.4, 52.5] }] });
		const f = doc.features[0];
		expect(f.geometry).toEqual({ type: 'Point', coordinates: [13.4, 52.5] });
		expect(f.properties).toMatchObject({ 'symbol-pattern': 'base:icon-embassy', 'symbol-color': '#ff0000' });
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

	it('emits no viewport, only the features of an empty map', () => {
		expect(stateToGeoJSON({ elements: [] })).toStrictEqual({ type: 'FeatureCollection', features: [] });
	});
});

describe('stateFromGeoJSON ∘ stateToGeoJSON round-trip (lossless)', () => {
	const state: MapState = {
		elements: [
			{ type: 'marker', point: [13.4, 52.5] },
			{
				type: 'marker',
				point: [1, 2],
				label: 'x',
				style: { color: '#abcdef', symbol: 'icons:anchor', size: 2 },
				popup: { text: 'A **marker**' }
			},
			{
				type: 'line',
				points: [
					[0, 0],
					[1, 1],
					[2, 0]
				],
				style: { color: '#00ff00', dash: 'dashed', width: 5 },
				popup: { text: 'A line' }
			},
			{
				type: 'polygon',
				points: [
					[0, 0],
					[1, 0],
					[1, 1]
				],
				style: { color: '#11223380' },
				strokeStyle: { color: '#445566', width: 3, visible: false },
				popup: { text: 'A polygon' }
			},
			{
				type: 'circle',
				point: [10, 20],
				radius: 500,
				style: { color: '#778899' },
				strokeStyle: { dash: 'dotted' },
				popup: { text: 'A circle' }
			}
		]
	};

	it('preserves the document exactly', () => {
		expect(stateFromGeoJSON(stateToGeoJSON(state))).toEqual(state);
	});
});

describe('the names of the dashes and the fill patterns', () => {
	it('all survive a link and GeoJSON', () => {
		const points: [number, number][] = [
			[13.4, 52.5],
			[13.5, 52.6],
			[13.4, 52.6]
		];
		const state: MapState = {
			elements: [
				...STROKE_STYLE_NAMES.slice(1).map((dash) => ({ type: 'line' as const, points, style: { dash } })),
				...FILL_PATTERN_NAMES.slice(1).map((pattern) => ({ type: 'polygon' as const, points, style: { pattern } }))
			]
		};
		const styles = state.elements.map((element) => element.style);
		expect(decodeState(encodeState(state)).elements.map((element) => element.style)).toStrictEqual(styles);
		expect(stateFromGeoJSON(stateToGeoJSON(state)).elements.map((element) => element.style)).toStrictEqual(styles);
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

	it('flattens MultiPoint, MultiLineString and GeometryCollection, keeping the properties', () => {
		const properties = { 'stroke-width': 4, 'symbol-size': 2 };
		const doc: GeoJSONDocument = {
			type: 'FeatureCollection',
			features: [
				{
					type: 'Feature',
					properties,
					geometry: {
						type: 'MultiPoint',
						coordinates: [
							[1, 2],
							[3, 4]
						]
					}
				},
				{
					type: 'Feature',
					properties,
					geometry: {
						type: 'MultiLineString',
						coordinates: [
							[
								[0, 0],
								[1, 1]
							],
							[
								[2, 2],
								[3, 3]
							]
						]
					}
				},
				{
					type: 'Feature',
					properties,
					geometry: {
						type: 'GeometryCollection',
						geometries: [
							{ type: 'Point', coordinates: [5, 6] },
							{
								type: 'GeometryCollection',
								geometries: [
									{
										type: 'LineString',
										coordinates: [
											[7, 8],
											[9, 10]
										]
									}
								]
							}
						]
					}
				}
			]
		};
		const elements = stateFromGeoJSON(doc).elements;
		expect(elements.map((e) => e.type)).toEqual(['marker', 'marker', 'line', 'line', 'marker', 'line']);
		expect(elements.map((e) => e.style)).toEqual([
			{ size: 2 },
			{ size: 2 },
			{ width: 4 },
			{ width: 4 },
			{ size: 2 },
			{ width: 4 }
		]);
	});
});

describe('a GeoJSON document as a link', () => {
	it('round-trips a document through base64 (stable fixed point + geometry preserved)', () => {
		const doc = stateToGeoJSON({
			elements: [
				{ type: 'marker', point: [13.4, 52.5], label: 'hello', style: { symbol: 'base:icon-beer_mug' } },
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

describe('background', () => {
	const background = { theme: 'gray' };

	it('round-trips as the meta member', () => {
		const doc = stateToGeoJSON({ meta: { background }, elements: [] });
		expect(doc.meta).toStrictEqual({ background });
		expect(stateFromGeoJSON(doc).meta).toStrictEqual({ background });
	});

	it('ignores invalid backgrounds', () => {
		const doc = { type: 'FeatureCollection', features: [], meta: { background: { base: 'moon', labels: 'many' } } };
		expect(stateFromGeoJSON(doc as GeoJSONDocument)).toStrictEqual({ elements: [] });
	});
});

describe('legend', () => {
	it('round-trips as the meta member', () => {
		const legend = {
			entries: [{ type: 'marker' as const, style: { color: '#ff0000', symbol: 'extras:pin-teardrop' }, label: 'A' }]
		};
		const doc = stateToGeoJSON({ meta: { legend }, elements: [] });
		expect(doc.meta).toStrictEqual({ legend });
		expect(stateFromGeoJSON(doc).meta).toStrictEqual({ legend });
	});

	it('sanitizes foreign legends', () => {
		const doc = {
			type: 'FeatureCollection',
			features: [],
			meta: {
				legend: {
					position: 'middle',
					layout: 'inline',
					font: 'monospace',
					entries: [
						{ type: 'line', style: { color: '#F00', width: '3', dash: 7, size: -1, extra: 1 }, label: 5 },
						// only areas have an outline
						{ type: 'marker', style: { symbol: 'flag' }, strokeStyle: { color: '#000' }, label: 'y' },
						{ type: 'area', style: 'red', strokeStyle: { visible: false }, label: 'z' },
						{ type: 'circle', style: { color: '#0F0' }, label: 'x' },
						// without a type
						{ color: '#0F0', label: 'x', symbol: 'icons:anchor' },
						'x'
					]
				}
			}
		};
		expect(stateFromGeoJSON(doc as unknown as GeoJSONDocument).meta).toStrictEqual({
			legend: {
				layout: 'inline',
				font: 'monospace',
				entries: [
					// only valid fields; a symbol is the name of its image, e.g. no short name
					{ type: 'line', style: { color: '#ff0000', width: 3 }, label: '5' },
					{ type: 'marker', label: 'y' },
					{ type: 'area', strokeStyle: { visible: false }, label: 'z' }
				]
			}
		});
	});
});

describe('color scheme', () => {
	it('round-trips as the meta member', () => {
		const doc = stateToGeoJSON({ meta: { colorScheme: 'dark2' }, elements: [] });
		expect(doc.meta).toStrictEqual({ colorScheme: 'dark2' });
		expect(stateFromGeoJSON(doc).meta).toStrictEqual({ colorScheme: 'dark2' });
	});
});

describe('viewer', () => {
	it('round-trips as the meta member, without defaults and invalid values', () => {
		const viewer = { search: 'top-right', zoom: false, legend: 'top' } as const;
		const doc = stateToGeoJSON({ meta: { viewer }, elements: [] });
		expect(doc.meta).toStrictEqual({ viewer });
		expect(stateFromGeoJSON(doc).meta).toStrictEqual({ viewer });
		const foreign = { search: 'bottom', navigation: 'top-right', legend: 'right', zoom: true };
		expect(stateFromGeoJSON({ ...doc, meta: { viewer: foreign } } as unknown as GeoJSONDocument).meta).toStrictEqual({
			viewer: { legend: 'right' }
		});
	});
});

describe('popups', () => {
	it('are written as the description property', () => {
		const doc = stateToGeoJSON({ elements: [{ type: 'marker', point: [0, 0], popup: { text: 'Hello' } }] });
		expect(doc.features[0].properties).toMatchObject({ description: 'Hello' });
	});

	it('are read from the description property, ignoring empty and non-text values', () => {
		const popups = [{ description: 'Hi\nthere' }, { description: '  ' }, { description: 42 }, {}].map(
			(properties) =>
				stateFromGeoJSON({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [0, 0] } }).elements[0]
					.popup
		);
		expect(popups).toStrictEqual([{ text: 'Hi\nthere' }, undefined, { text: '42' }, undefined]);
	});
});

describe('stateFromGeoJSON with foreign property values', () => {
	const point = (properties: GeoJSON.GeoJsonProperties): GeoJSONDocument => ({
		type: 'FeatureCollection',
		features: [{ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [13.4, 52.5] } }]
	});
	const styleOf = (properties: GeoJSON.GeoJsonProperties) => stateFromGeoJSON(point(properties)).elements[0];

	it('rounds and normalizes symbol rotation', () => {
		expect(styleOf({ 'symbol-rotation': 12.5 })).toMatchObject({ style: { rotation: 13 } });
		expect(styleOf({ 'symbol-rotation': 270 })).toMatchObject({ style: { rotation: -90 } });
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
		expect(styleOf({ 'symbol-size': '2', 'symbol-label': 7 })).toMatchObject({ label: '7', style: { size: 2 } });
		expect(styleOf({ subType: 'Circle', radius: '50', 'stroke-visibility': 'false' })).toMatchObject({
			radius: 50,
			strokeStyle: { visible: false }
		});
	});

	it('ignores invalid values', () => {
		expect(
			styleOf({ 'symbol-size': 'big', 'symbol-halo-width': null, 'symbol-label': {}, 'symbol-rotation': NaN })
		).toEqual({ type: 'marker', point: [13.4, 52.5] });
	});

	it('skips a circle with an invalid radius, like other features it cannot map', () => {
		const circle = (radius: unknown): GeoJSON.Feature => ({
			type: 'Feature',
			properties: { subType: 'Circle', radius, 'fill-color': '#00ff00' },
			geometry: { type: 'Point', coordinates: [13.4, 52.5] }
		});
		expect(stateFromGeoJSON({ type: 'FeatureCollection', features: [circle('wide')] }).elements).toStrictEqual([]);
		expect(stateFromGeoJSON({ type: 'FeatureCollection', features: [circle(-5)] }).elements).toStrictEqual([]);
		expect(stateFromGeoJSON(circle(50)).elements).toMatchObject([{ type: 'circle', radius: 50 }]);
	});

	it('always produces encodable documents', () => {
		for (const properties of [
			{ 'symbol-rotation': 12.5 },
			{ subType: 'Circle', radius: 100.7, 'stroke-width': -1 },
			{ 'symbol-color': 'notacolor' },
			{ 'symbol-size': Infinity, 'symbol-halo-width': -3 }
		]) {
			expect(() => encodeGeoJSON(point(properties))).not.toThrow();
		}
	});
});

describe('stateFromGeoJSON with unusual input', () => {
	const collection = (...features: GeoJSON.Feature[]): GeoJSONDocument => ({ type: 'FeatureCollection', features });
	const feature = (geometry: GeoJSON.Geometry | null): GeoJSON.Feature =>
		({ type: 'Feature', properties: {}, geometry }) as GeoJSON.Feature;
	const lowercaseType = { type: 'point', coordinates: [1, 2] };

	it('skips features without geometry', () => {
		const state = stateFromGeoJSON(collection(feature(null), feature({ type: 'Point', coordinates: [1, 2] })));
		expect(state.elements).toEqual([{ type: 'marker', point: [1, 2] }]);
	});

	it('accepts a single feature', () => {
		const state = stateFromGeoJSON(feature({ type: 'Point', coordinates: [1, 2] }));
		expect(state.elements).toEqual([{ type: 'marker', point: [1, 2] }]);
	});

	it('accepts a bare geometry', () => {
		const state = stateFromGeoJSON({
			type: 'LineString',
			coordinates: [
				[1, 2],
				[3, 4]
			]
		});
		expect(state.elements).toEqual([
			{
				type: 'line',
				points: [
					[1, 2],
					[3, 4]
				]
			}
		]);
	});

	it('rejects non-GeoJSON input', () => {
		expect(() => stateFromGeoJSON({} as GeoJSONDocument)).toThrow('Not a GeoJSON object');
		expect(() => stateFromGeoJSON(lowercaseType as unknown as GeoJSONDocument)).toThrow('Not a GeoJSON object');
		expect(() => stateFromGeoJSON(null as unknown as GeoJSONDocument)).toThrow('Not a GeoJSON object');
	});

	it('drops altitudes and skips invalid coordinates', () => {
		const state = stateFromGeoJSON(
			collection(
				feature({ type: 'Point', coordinates: [1, 2, 300] }),
				feature({ type: 'Point', coordinates: [1] }),
				feature({ type: 'Point', coordinates: ['1', 2] } as unknown as GeoJSON.Point),
				feature({
					type: 'LineString',
					coordinates: [
						[1, 2],
						[NaN, 4]
					]
				})
			)
		);
		expect(state.elements).toEqual([{ type: 'marker', point: [1, 2] }]);
	});

	it('skips degenerate lines and polygons', () => {
		const state = stateFromGeoJSON(
			collection(
				feature({ type: 'LineString', coordinates: [[1, 2]] }),
				feature({
					type: 'Polygon',
					coordinates: [
						[
							[0, 0],
							[1, 1],
							[0, 0]
						]
					]
				}),
				feature({ type: 'Polygon', coordinates: [] })
			)
		);
		expect(state.elements).toEqual([]);
	});

	it('keeps all vertices of an unclosed polygon ring', () => {
		const ring: Point[] = [
			[0, 0],
			[1, 0],
			[1, 1]
		];
		const state = stateFromGeoJSON(collection(feature({ type: 'Polygon', coordinates: [ring] })));
		expect(state.elements).toEqual([{ type: 'polygon', points: ring }]);
	});

	it('ignores a viewport, e.g. of an older file', () => {
		const doc = { ...collection(), view: { center: [1, 2], radius: 1000 } } as GeoJSONDocument;
		expect(stateFromGeoJSON(doc)).toStrictEqual({ elements: [] });
	});

	it('always produces encodable documents', () => {
		const doc = collection(
			feature(null),
			feature({ type: 'Point', coordinates: [1, 2, 3] }),
			feature({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[1, 1]
					]
				]
			})
		);
		expect(() => encodeGeoJSON(doc)).not.toThrow();
	});
});

type Point = [number, number];
