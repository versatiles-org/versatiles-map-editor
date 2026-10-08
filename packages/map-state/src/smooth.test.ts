import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import {
	decodeState,
	encodeState,
	stateFromGeoJSON,
	stateFromKML,
	stateFromMapJSON,
	stateToGeoJSON,
	stateToKML,
	stateToMapJSON
} from './index.js';
import { StateWriter } from './writer.js';

const points: [number, number][] = [
	[13.4, 52.5],
	[13.5, 52.6],
	[13.6, 52.5]
];

// smooth and straight lines and polygons
const state: MapState = {
	elements: [
		{ type: 'line', points, smooth: true },
		{ type: 'line', points },
		{ type: 'polygon', points, smooth: true, style: { color: '#0000ff' } },
		{ type: 'polygon', points }
	]
};

describe('smooth lines and polygons', () => {
	it('are kept in a link, with 1 bit each', () => {
		expect(decodeState(encodeState(state)).elements.map((e) => 'smooth' in e && e.smooth)).toStrictEqual([
			true,
			false,
			true,
			false
		]);
		// a bit for each line and polygon, set or not: as long as the same map with all of them smooth
		const bits = (map: MapState) => {
			const writer = new StateWriter();
			writer.writeRoot(map);
			return writer.bits.length;
		};
		const smooth: MapState = { elements: state.elements.map((e) => ({ ...e, smooth: true })) };
		expect(bits(smooth)).toBe(bits(state));
	});

	it('keep their points and the flag in GeoJSON, .mapjson and KML files', () => {
		const doc = stateToGeoJSON(state);
		expect(doc.features.map((f) => f.properties?.smooth)).toStrictEqual([true, undefined, true, undefined]);
		// the points as they are, not the curve
		expect(doc.features[0].geometry).toStrictEqual({ type: 'LineString', coordinates: points });
		expect(stateFromGeoJSON(doc).elements).toStrictEqual(
			stateFromGeoJSON(stateToGeoJSON(stateFromGeoJSON(doc))).elements
		);
		expect(stateFromGeoJSON(doc).elements.map((e) => 'smooth' in e && e.smooth)).toStrictEqual([
			true,
			false,
			true,
			false
		]);
		expect(stateFromMapJSON(stateToMapJSON(state)).elements).toStrictEqual(state.elements.map(withoutUndefined));
		expect(stateFromKML(stateToKML(state)).elements.map((e) => 'smooth' in e && e.smooth)).toStrictEqual([
			true,
			false,
			true,
			false
		]);
	});

	it('ignore an invalid flag in files, and keep only true', () => {
		const read = (smooth: unknown) =>
			stateFromMapJSON({ elements: [{ type: 'line', points, smooth }] }).elements[0] as { smooth?: boolean };
		expect(read(true).smooth).toBe(true);
		// a flag is a boolean, not a text
		expect('smooth' in read('true')).toBe(false);
		expect('smooth' in read(false)).toBe(false);
		expect('smooth' in read('yes')).toBe(false);
		// a marker is never smooth
		const marker = stateFromMapJSON({ elements: [{ type: 'marker', point: [0, 0], smooth: true }] }).elements[0];
		expect('smooth' in marker).toBe(false);
	});
});

function withoutUndefined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
