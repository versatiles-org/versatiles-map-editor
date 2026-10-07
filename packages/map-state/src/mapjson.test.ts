import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
	MAPJSON_SCHEMA_URL,
	MapJSONVersionError,
	stateFromMapJSON,
	stateToMapJSON,
	unknownMapJSONFields,
	type MapState
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

	it('of a newer version are refused with the version', () => {
		const newer = { $schema: MAPJSON_SCHEMA_URL.replace('mapjson-1', 'mapjson-2'), elements: [] };
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
			const { $schema: _schema, ...json } = JSON.parse(readFileSync(file, 'utf-8'));
			expect(stateFromMapJSON(json), file).toStrictEqual(json);
		}
	});

	it('keep only what is valid, since they may contain anything', () => {
		const json = {
			view: { center: [13.4, 'north'], radius: 1000 },
			frame: { bounds: [10, 50, 5, 55], pitch: 'steep' },
			meta: { title: 'Map', viewer: { search: 'middle' }, labels: { minZoom: 99 }, background: 'osm' },
			elements: [
				{
					type: 'marker',
					point: [1, 2],
					style: { rotation: 45.5, color: '#FF0000', labelColor: 'red', size: 'big' },
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
				{ type: 'circle', point: [0, 0], radius: 50, style: { pattern: 1.5 }, strokeStyle: { width: -1 } },
				{ type: 'star', point: [0, 0] },
				null,
				'marker'
			]
		};
		expect(stateFromMapJSON(json)).toStrictEqual({
			meta: { title: 'Map' },
			elements: [
				{ type: 'marker', point: [1, 2], style: { rotation: 46, color: '#ff0000' }, popup: { text: '7' } },
				{ type: 'circle', point: [0, 0], radius: 50, strokeStyle: { width: 0 } }
			]
		});
	});

	it('report the fields that this version does not know, which are not kept', () => {
		const json = {
			$schema: MAPJSON_SCHEMA_URL,
			future: true,
			view: { center: [13.4, 52.5], radius: 1000, tilt: 30 },
			meta: {
				title: 'T',
				theme: 'x',
				background: { builder: 'osm', options: { anything: 1 } },
				legend: { entries: [{ type: 'line', label: 'A', icon: 'x', style: { glow: 2 } }] },
				viewer: { scale: 'top-left' }
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
					strokeStyle: { glow: 1 },
					popup: { text: 'p', image: 'i' }
				}
			]
		};
		expect(unknownMapJSONFields(json)).toStrictEqual([
			'future',
			'view.tilt',
			'meta.theme',
			'meta.viewer.scale',
			'meta.legend.entries[0].icon',
			'meta.legend.entries[0].style.glow',
			'elements[0].note',
			'elements[0].style.colour',
			'elements[1]',
			'elements[2].strokeStyle.glow',
			'elements[2].popup.image'
		]);
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
					strokeStyle: { pattern: 'dots' }
				}
			]
		};
		expect(unknownMapJSONFields(json)).toStrictEqual([
			'elements[0].style.arrowStart',
			'elements[1].style.width',
			'elements[1].strokeStyle.pattern'
		]);
		const state = stateFromMapJSON(json);
		expect(state.elements[0].style).toStrictEqual({ color: '#0000ff' });
		expect(state.elements[1]).toStrictEqual({ type: 'polygon', points: json.elements[1].points });
	});
});
