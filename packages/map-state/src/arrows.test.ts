import { describe, expect, it } from 'vitest';
import type { MapState, StateStyle } from './types.js';
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
import { sanitizeStyle } from './profile.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';

const points: [number, number][] = [
	[13.4, 52.5],
	[13.5, 52.6]
];

// arrowheads at the start, the end, both ends, and none
const state: MapState = {
	elements: [
		{ type: 'line', points, style: { arrowEnd: 1 } },
		{ type: 'line', points, style: { arrowStart: 3, arrowEnd: 2, arrowSize: 1.5 } },
		{ type: 'line', points, style: { arrowStart: 1, width: 4 } },
		{ type: 'line', points, style: { color: '#0000ff' } }
	]
};
const styles = state.elements.map((e) => e.style);

describe('arrowheads', () => {
	it('are kept in a link, with the size in tenths', () => {
		expect(decodeState(encodeState(state)).elements.map((e) => e.style)).toStrictEqual(styles);
		const rounded = decodeState(
			encodeState({ elements: [{ type: 'line', points, style: { arrowEnd: 1, arrowSize: 2.34 } }] })
		);
		expect(rounded.elements[0].style).toStrictEqual({ arrowEnd: 1, arrowSize: 2.3 });
	});

	it('have neighbouring keys', () => {
		const writer = new StateWriter();
		writer.writeStylePatch({}, { arrowStart: 1, arrowEnd: 2, arrowSize: 2 });
		// keys 10, 11 and 12 in 7 bits each, with their varints (1, 2, 20), then the end
		expect(writer.asBitString()).toBe('0001011' + '000010' + '0001100' + '000100' + '0001101' + '101000' + '1');
	});

	it('have no size without an arrowhead', () => {
		const style: StateStyle = { color: '#0000ff', arrowSize: 2 };
		const decoded = decodeState(encodeState({ elements: [{ type: 'line', points, style }] }));
		expect(decoded.elements[0].style).toStrictEqual({ color: '#0000ff' });
		expect(stateToGeoJSON({ elements: [{ type: 'line', points, style }] }).features[0].properties).not.toHaveProperty(
			'stroke-arrow-size'
		);
		expect(sanitizeStyle(style)).toStrictEqual({ color: '#0000ff' });
	});

	it('reject a size without an arrowhead in a link', () => {
		const writer = new StateWriter();
		writer.writeExpGolomb(0, 0); // no reference
		writer.writeExpGolomb(12, 0); // arrowSize
		writer.writeVarint(20);
		writer.writeExpGolomb(0, 0); // end
		expect(() => new StateReader(writer.bits).readStyle()).toThrow(
			expect.objectContaining({ cause: expect.objectContaining({ message: 'Arrow size without an arrowhead' }) })
		);
	});

	it('reject an unknown style in a link', () => {
		const writer = new StateWriter();
		writer.writeExpGolomb(0, 0); // no reference
		writer.writeExpGolomb(11, 0); // arrowEnd
		writer.writeVarint(4);
		writer.writeExpGolomb(0, 0); // end
		expect(() => new StateReader(writer.bits).readStyle()).toThrow(
			expect.objectContaining({ cause: expect.objectContaining({ message: 'Invalid index: 4 of 4' }) })
		);
	});

	it('are properties of lines in GeoJSON, by name', () => {
		const doc = stateToGeoJSON(state);
		const props = doc.features.map((f) => [
			f.properties?.['stroke-arrow-start'],
			f.properties?.['stroke-arrow-end'],
			f.properties?.['stroke-arrow-size']
		]);
		expect(props).toStrictEqual([
			['none', 'triangle', 3],
			['circle', 'chevron', 1.5],
			['triangle', 'none', 3],
			['none', 'none', undefined]
		]);
		expect(stateFromGeoJSON(doc).elements.map((e) => e.style)).toStrictEqual(styles);
	});

	it('are not properties of outlines in GeoJSON', () => {
		const doc = stateToGeoJSON({ elements: [{ type: 'polygon', points: [...points, [13.4, 52.6]] }] });
		expect(Object.keys(doc.features[0].properties ?? {}).filter((key) => key.includes('arrow'))).toStrictEqual([]);
	});

	it('are kept in .mapjson and KML files', () => {
		expect(stateFromMapJSON(stateToMapJSON(state)).elements).toStrictEqual(state.elements);
		expect(stateFromKML(stateToKML(state)).elements.map((e) => e.style)).toStrictEqual(styles);
	});

	it('ignore invalid values in files', () => {
		expect(sanitizeStyle({ arrowStart: 4, arrowEnd: 1.5, arrowSize: 0 })).toBeUndefined();
		expect(sanitizeStyle({ arrowStart: 2, arrowSize: -1 })).toStrictEqual({ arrowStart: 2 });
		const doc = stateToGeoJSON({ elements: [{ type: 'line', points }] });
		doc.features[0].properties = {
			'stroke-arrow-start': 'star',
			'stroke-arrow-end': 'circle',
			'stroke-arrow-size': 'x'
		};
		expect(stateFromGeoJSON(doc).elements[0].style).toStrictEqual({ arrowEnd: 3 });
	});
});
