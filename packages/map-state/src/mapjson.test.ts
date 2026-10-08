import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
	MAPJSON_SCHEMA_URL,
	MapJSONVersionError,
	stateFromMapJSON,
	stateToMapJSON,
	changedMapJSONValues,
	unknownMapJSONFields,
	type MapState,
	decodeState,
	encodeState,
	stateFromGeoJSON,
	stateToGeoJSON
} from './index.js';

describe('.mapjson files', () => {
	const state: MapState = { meta: { title: 'T' }, elements: [{ type: 'marker', point: [1, 2] }] };

	it('name the schema of their version first, and are read back', () => {
		const json = stateToMapJSON(state);
		expect(Object.keys(json)[0]).toBe('$schema');
		expect(json.$schema).toBe(MAPJSON_SCHEMA_URL);
		expect(MAPJSON_SCHEMA_URL).toMatch(/\/mapjson-1\.schema\.json$/);
		expect(stateFromMapJSON(JSON.parse(JSON.stringify(json)))).toStrictEqual(state);
	});

	it('tell their version in a field of its own, and are of version 1 without it', () => {
		expect(stateToMapJSON({ elements: [] })).toStrictEqual({ $schema: MAPJSON_SCHEMA_URL, version: 1, elements: [] });
		expect(stateFromMapJSON({ elements: [] })).toStrictEqual({ elements: [] });
		expect(stateFromMapJSON({ version: 1, elements: [] })).toStrictEqual({ elements: [] });
		// not by the name of the schema, which may be any address, e.g. a copy of it
		expect(stateFromMapJSON({ $schema: 'https://example.org/mapjson-2.schema.json', elements: [] })).toStrictEqual({
			elements: []
		});
		// a version is a whole number from 1
		for (const version of ['1', 1.5, 0, -1, null, true]) {
			expect(() => stateFromMapJSON({ version, elements: [] }), String(version)).toThrow(
				'The file has no valid version'
			);
		}
	});

	it('of a newer version are refused with the version', () => {
		const newer = { $schema: MAPJSON_SCHEMA_URL, version: 2, elements: [] };
		expect(() => stateFromMapJSON(newer)).toThrow(MapJSONVersionError);
		try {
			stateFromMapJSON(newer);
		} catch (error) {
			expect((error as MapJSONVersionError).version).toBe(2);
		}
	});

	it('without a map are refused', () => {
		for (const json of [null, [], 'map', { no: 'elements' }]) expect(() => stateFromMapJSON(json)).toThrow();
	});

	it('are read unchanged if they are valid, e.g. the examples', () => {
		const files = globSync(['examples/*.mapjson', 'packages/map-state/src/__fixtures__/**/*.mapjson']);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const { $schema: _schema, version: _version, ...json } = JSON.parse(readFileSync(file, 'utf-8'));
			expect(stateFromMapJSON(json), file).toStrictEqual(json);
		}
	});

	it('have coordinates with 5 decimal places, about 1 m, when written and when read', () => {
		const state: MapState = {
			frame: { bounds: [13.3000004, 52.4499996, 13.5, 52.55] },
			elements: [
				{ type: 'marker', point: [13.4000049, 52.5000051] },
				{ type: 'circle', point: [-0.0000004, 0.0000004], radius: 123.456 },
				{
					type: 'line',
					points: [
						[13.123456789, 52.987654321],
						[13.2, 52.9]
					]
				}
			]
		};
		const rounded: MapState = {
			frame: { bounds: [13.3, 52.45, 13.5, 52.55] },
			elements: [
				{ type: 'marker', point: [13.4, 52.50001] },
				// not -0; the radius is no coordinate
				{ type: 'circle', point: [0, 0], radius: 123.456 },
				{
					type: 'line',
					points: [
						[13.12346, 52.98765],
						[13.2, 52.9]
					]
				}
			]
		};
		const { $schema: _schema, version: _version, ...written } = stateToMapJSON(state);
		expect(written).toStrictEqual(rounded);
		// the state itself is not changed
		expect(state.elements[0]).toStrictEqual({ type: 'marker', point: [13.4000049, 52.5000051] });
		expect(stateFromMapJSON(state)).toStrictEqual(rounded);
		// as text: no long tails, e.g. of 0.1 + 0.2
		const text = JSON.stringify(stateToMapJSON({ elements: [{ type: 'marker', point: [0.1 + 0.2, 1.1 + 2.2] }] }));
		expect(text).toContain('[0.3,3.3]');
	});

	it('keep the lines of a label, in files, links and GeoJSON, also of a text of Windows', () => {
		const state: MapState = { elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Town hall\nMon to Fri' }] };
		const { $schema: _schema, ...written } = stateToMapJSON(state);
		expect(stateFromMapJSON(written)).toStrictEqual(state);
		expect(decodeState(encodeState(state))).toStrictEqual(state);
		expect(stateFromGeoJSON(stateToGeoJSON(state))).toStrictEqual(state);
		const windows = { elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Town hall\r\nMon to Fri' }] };
		expect(stateFromMapJSON(windows)).toStrictEqual(state);
	});

	it('keep only what is valid, since they may contain anything', () => {
		const json = {
			// the camera of the editor, which is not part of a map
			view: { center: [13.4, 52.5], radius: 1000 },
			frame: { bounds: [10, 50, 5, 55], pitch: 'steep' },
			meta: { title: 'Map', viewer: { search: 'middle' }, labels: { minZoom: 99 }, background: 'osm' },
			elements: [
				{
					type: 'marker',
					point: [1, 2],
					// only the types of the schema: no number or flag as text, no short or named color
					style: {
						rotation: 45.5,
						color: '#FF0000',
						labelColor: 'red',
						haloColor: '#fff',
						size: 'big',
						haloWidth: '2',
						flat: 'true'
					},
					popup: { text: 7 }
				},
				{ type: 'marker', point: [1] },
				{ type: 'line', points: [[0, 0]] },
				{
					type: 'line',
					points: [
						[0, 0],
						[1, null]
					]
				},
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0]
					]
				},
				{ type: 'circle', point: [0, 0], radius: 0 },
				{ type: 'circle', point: [0, 0], radius: 50, style: { pattern: 1.5 }, outlineStyle: { width: -1 } },
				{ type: 'star', point: [0, 0] },
				null,
				'marker'
			]
		};
		expect(stateFromMapJSON(json)).toStrictEqual({
			meta: { title: 'Map' },
			elements: [
				{ type: 'marker', point: [1, 2], style: { rotation: 46, color: '#ff0000' } },
				{ type: 'circle', point: [0, 0], radius: 50, outlineStyle: { width: 0 } }
			]
		});
	});

	it('are written as they are read: only what is valid, without defaults', () => {
		const state = {
			frame: { bounds: [13.123456789, 52, 14, 53], bearing: 0, pitch: 80 },
			meta: { viewer: { search: 'none', canRotate: true }, legend: { layout: 'vertical', entries: [] } },
			elements: [
				{ type: 'marker', point: [13.4000001, 52.5], style: { color: '#FF0000', rotation: 180, size: 'big' } },
				{ type: 'line', points: [[0, 0]] }
			]
		} as unknown as MapState;
		const json = stateToMapJSON(state);
		expect(json).toStrictEqual({
			$schema: MAPJSON_SCHEMA_URL,
			version: 1,
			frame: { bounds: [13.12346, 52, 14, 53], pitch: 60 },
			meta: { viewer: { canRotate: true }, legend: { entries: [] } },
			elements: [{ type: 'marker', point: [13.4, 52.5], style: { color: '#ff0000', rotation: 180 } }]
		});
		// in this order, and read again as the same map
		expect(Object.keys(json)).toStrictEqual(['$schema', 'version', 'frame', 'meta', 'elements']);
		const { $schema: _schema, version: _version, ...written } = json;
		expect(stateFromMapJSON(json)).toStrictEqual(written);
		expect(changedMapJSONValues(json)).toStrictEqual([]);
	});

	it('report the values that are not kept as they are: invalid, beyond their range, or not drawable', () => {
		const json = {
			$schema: MAPJSON_SCHEMA_URL,
			// across the date line, and steeper than a map can be tilted
			frame: { bounds: [170, 50, -170, 55], pitch: 80, bearing: 20 },
			meta: {
				title: 7,
				background: { theme: 'gray', labels: 'many', labelSize: '2', colors: { black: 5, white: 1 } },
				viewer: { search: 'middle', canPan: 'no', minZoom: 14, maxZoom: 10, reset: true },
				labels: { overlap: 'sometimes', minZoom: 99 },
				legend: {
					layout: 'diagonal',
					// the last one is no entry: told with the fields that are not known
					entries: [{ type: 'line', label: 5, style: { dash: 'wavy', width: 3 } }, { type: 'marker', label: 'ok' }, 'x']
				}
			},
			elements: [
				{
					type: 'marker',
					point: [1, 2],
					label: 3,
					style: { color: 'red', symbol: 'flag', rotation: 45.5, size: 2 },
					popup: { text: 7 }
				},
				{ type: 'line', points: [[0, 0]] },
				{ type: 'circle', point: [0, 0], radius: 0 },
				// beyond the north pole: at the pole; the longitude is kept
				{ type: 'marker', point: [500, 95] },
				{
					type: 'line',
					points: [
						[170, 0],
						[190, -91]
					]
				},
				{ type: 'circle', point: [0, 0], radius: 50, style: 'red', outlineStyle: { width: -1, visible: 'no' } }
			]
		};
		expect(changedMapJSONValues(json)).toStrictEqual([
			'frame.bounds',
			'frame.pitch',
			'meta.title',
			'meta.background.labels',
			'meta.background.labelSize',
			'meta.background.colors.black',
			'meta.viewer.search',
			'meta.viewer.canPan',
			'meta.viewer.minZoom',
			'meta.labels.overlap',
			'meta.labels.minZoom',
			'meta.legend.layout',
			'meta.legend.entries[0].label',
			'meta.legend.entries[0].style.dash',
			'elements[0].label',
			'elements[0].style.color',
			'elements[0].style.symbol',
			'elements[0].style.rotation',
			'elements[0].popup.text',
			'elements[1]',
			'elements[2]',
			'elements[3].point',
			'elements[4].points',
			'elements[5].style',
			'elements[5].outlineStyle.width',
			'elements[5].outlineStyle.visible'
		]);
	});

	it('report nothing for what is only written in another way, is the default, or is not known', () => {
		const json = {
			$schema: MAPJSON_SCHEMA_URL,
			frame: { bounds: [13.123456789, 52, 14, 53], bearing: 0, pitch: 0 },
			meta: {
				title: '',
				background: {
					base: 'vector',
					theme: 'colorful',
					streets: true,
					labels: 'normal',
					language: 'user',
					labelSize: 1,
					haloWidth: 2,
					labelsOnTop: false,
					colors: { saturation: 0, black: 0, white: 1 },
					hillshade: false,
					buildings: 'flat',
					options: { anything: [1, 2] }
				},
				viewer: { search: 'none', navigation: 'top-right', zoomButtons: true, canPan: true, canRotate: false },
				labels: { overlap: 'show' },
				legend: { layout: 'vertical', font: 'sans-serif', bold: false, entries: [{ type: 'area', label: 'A' }] }
			},
			elements: [
				{
					type: 'marker',
					point: [13.4000001, 52.5],
					label: 'Line 1\r\nLine 2',
					style: { color: '#FF0000', haloColor: '#FFFFFF80', colour: 'x' },
					popup: { text: '  ' }
				},
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					smooth: false,
					style: { patternScale: 2 },
					future: 1
				},
				{ type: 'text', point: [0, 0] }
			]
		};
		expect(changedMapJSONValues(json)).toStrictEqual([]);
		// and none of the examples has any
		for (const file of globSync('examples/*.mapjson')) {
			expect(changedMapJSONValues(JSON.parse(readFileSync(file, 'utf-8'))), file).toStrictEqual([]);
		}
		// no map at all: `stateFromMapJSON` refuses it
		expect(changedMapJSONValues({ meta: { title: 7 } })).toStrictEqual([]);
	});

	it('report the fields that this version does not know, which are not kept', () => {
		const json = {
			$schema: MAPJSON_SCHEMA_URL,
			future: true,
			// e.g. the camera of the editor, which was part of a map once
			view: { center: [13.4, 52.5], radius: 1000 },
			meta: {
				title: 'T',
				theme: 'x',
				background: { theme: 'gray', options: { anything: 1 }, colors: { black: 0.2, gamma: 2 }, glow: true },
				legend: { entries: [{ type: 'line', label: 'A', icon: 'x', style: { glow: 2 } }] },
				viewer: { minimap: 'top-left' }
			},
			elements: [
				// e.g. a typo, which the schema allows now
				{ type: 'marker', point: [1, 2], style: { colour: '#ff0000' }, note: 'n' },
				{ type: 'text', point: [1, 2] },
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					outlineStyle: { glow: 1 },
					popup: { text: 'p', image: 'i' }
				}
			]
		};
		expect(unknownMapJSONFields(json)).toStrictEqual([
			'future',
			'view',
			'meta.theme',
			'meta.background.glow',
			'meta.background.colors.gamma',
			'meta.viewer.minimap',
			'meta.legend.entries[0].icon',
			'meta.legend.entries[0].style.glow',
			'elements[0].note',
			'elements[0].style.colour',
			'elements[1]',
			'elements[2].outlineStyle.glow',
			'elements[2].popup.image'
		]);
		expect(stateFromMapJSON(json)).not.toHaveProperty('view');
		// and none of the examples has any
		for (const file of globSync('examples/*.mapjson')) {
			expect(unknownMapJSONFields(JSON.parse(readFileSync(file, 'utf-8'))), file).toStrictEqual([]);
		}
		expect(unknownMapJSONFields('no map')).toStrictEqual([]);
	});

	it('report and drop the style fields of other roles, e.g. an arrowhead of a marker', () => {
		const json = {
			elements: [
				{ type: 'marker', point: [1, 2], style: { color: '#0000ff', arrowStart: 'triangle' } },
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					style: { width: 3 },
					outlineStyle: { pattern: 'dots' }
				}
			]
		};
		expect(unknownMapJSONFields(json)).toStrictEqual([
			'elements[0].style.arrowStart',
			'elements[1].style.width',
			'elements[1].outlineStyle.pattern'
		]);
		const state = stateFromMapJSON(json);
		expect(state.elements[0].style).toStrictEqual({ color: '#0000ff' });
		expect(state.elements[1]).toStrictEqual({ type: 'polygon', points: json.elements[1].points });
	});
});
