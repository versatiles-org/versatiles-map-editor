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
});
