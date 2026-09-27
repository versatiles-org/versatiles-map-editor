import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import {
	decodeState,
	encodeState,
	stateFromGeoJSON,
	stateFromKML,
	stateToGeoJSON,
	stateToKML,
	type MapState
} from '@versatiles/map-state';

// The example maps in /examples: what each contains, so a change of a file is noticed
const EXAMPLES: Record<string, { types: Record<string, number>; legend: number; builder: 'osm' | 'satellite' }> = {
	'paris-2024-venues': { types: { marker: 24 }, legend: 4, builder: 'osm' },
	'hamburg-berlin-railway': { types: { line: 2, marker: 6 }, legend: 2, builder: 'osm' },
	'berlin-low-emission-zone': { types: { polygon: 3 }, legend: 2, builder: 'osm' },
	'chernobyl-exclusion-zone': { types: { circle: 2, marker: 4 }, legend: 2, builder: 'satellite' }
};

const read = (name: string): MapState => JSON.parse(readFileSync(`examples/${name}.mapjson`, 'utf-8'));

describe('example maps', () => {
	for (const [name, expected] of Object.entries(EXAMPLES)) {
		describe(name, () => {
			const state = read(name);

			it('has its view, elements, legend and background', () => {
				const types: Record<string, number> = {};
				for (const element of state.elements) types[element.type] = (types[element.type] ?? 0) + 1;
				expect(types).toStrictEqual(expected.types);
				expect(state.meta?.legend?.entries).toHaveLength(expected.legend);
				expect(state.meta?.background?.builder).toBe(expected.builder);
				expect(state.map).toBeDefined();
			});

			it('survives a link', () => {
				const decoded = decodeState(encodeState(state));
				expect(decoded.meta).toStrictEqual(state.meta);
				// the styles and popups are kept, the coordinates are rounded
				const withoutGeometry = (elements: MapState['elements']) =>
					elements.map((e) => ({ ...e, point: undefined, points: undefined, radius: undefined }));
				expect(withoutGeometry(decoded.elements)).toStrictEqual(withoutGeometry(state.elements));
			});

			it('keeps its elements and styles in GeoJSON and KML', () => {
				const geojson = stateToGeoJSON(state);
				expect(stateToGeoJSON(stateFromGeoJSON(geojson))).toStrictEqual(geojson);
				const kml = stateFromKML(stateToKML(state));
				expect(kml.elements.map((e) => e.type)).toStrictEqual(state.elements.map((e) => e.type));
				expect(kml.meta?.legend).toStrictEqual(state.meta?.legend);
			});
		});
	}

	it('contain every kind of element, for the tests that use them', () => {
		const types = new Set(Object.values(EXAMPLES).flatMap((e) => Object.keys(e.types)));
		expect([...types].sort()).toStrictEqual(['circle', 'line', 'marker', 'polygon']);
	});
});
