import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { MAPJSON_SCHEMA_URL, MapJSONVersionError, stateFromMapJSON, stateToMapJSON, type MapState } from './index.js';

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
			map: { center: [13.4, 'north'], radius: 1000 },
			frame: [10, 50, 5, 55],
			meta: { title: 'Map', viewer: { search: 'middle' }, labelMinZoom: 99, background: 'osm' },
			elements: [
				{
					type: 'marker',
					point: [1, 2],
					style: { rotate: 45.5, color: '#FF0000', labelColor: 'red', size: 'big' },
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
				{ type: 'marker', point: [1, 2], style: { rotate: 46, color: '#ff0000' }, popup: { text: '7' } },
				{ type: 'circle', point: [0, 0], radius: 50, strokeStyle: { width: 0 } }
			]
		});
	});
});
