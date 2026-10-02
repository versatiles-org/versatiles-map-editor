import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import {
	decodeState,
	encodeState,
	stateFromGeoJSON,
	stateFromMapJSON,
	stateToGeoJSON,
	stateToMapJSON
} from './index.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';

// the size of a marker's label, apart from the size of its symbol
const state: MapState = {
	elements: [
		{ type: 'marker', point: [13.4, 52.5], style: { label: 'A', size: 2, labelSize: 0.8 } },
		{ type: 'marker', point: [13.5, 52.5], style: { label: 'B', size: 2 } },
		{ type: 'marker', point: [13.6, 52.5], style: { label: 'C', labelSize: 1.5 } }
	]
};

describe('label size', () => {
	it('is kept in a link, in tenths, and defaults to 1', () => {
		const decoded = decodeState(encodeState(state));
		expect(decoded.elements.map((e) => e.style)).toStrictEqual(state.elements.map((e) => e.style));
		const rounded = decodeState(
			encodeState({ elements: [{ type: 'marker', point: [0, 0], style: { labelSize: 1.24 } }] })
		);
		expect(rounded.elements[0].style).toStrictEqual({ labelSize: 1.2 });
	});

	it('has a key after the extended key, also to remove it from an earlier style', () => {
		const writer = new StateWriter();
		writer.writeStylePatch({}, { labelSize: 1.5 });
		writer.writeStylePatch({ labelSize: 1.5, size: 2 }, { size: 2 });
		const bits = writer.bits.map(Number).join('');
		// key 14, key 16 − 16, the varint 15, end; remove (15), key 14, key 16 − 16, end
		expect(bits.startsWith('1110' + '0000')).toBe(true);
		const reader = new StateReader(writer.bits);
		expect(reader.readStylePatch({})).toStrictEqual({ labelSize: 1.5 });
		expect(reader.readStylePatch({ labelSize: 1.5, size: 2 })).toStrictEqual({ size: 2 });
	});

	it('is a property in GeoJSON and a field in .mapjson files', () => {
		const doc = stateToGeoJSON(state);
		expect(doc.features.map((f) => f.properties?.['symbol-label-size'])).toStrictEqual([0.8, 1, 1.5]);
		expect(stateFromGeoJSON(doc).elements.map((e) => e.style)).toStrictEqual(state.elements.map((e) => e.style));
		expect(stateFromMapJSON(stateToMapJSON(state)).elements).toStrictEqual(state.elements);
	});
});
