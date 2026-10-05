import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import {
	decodeState,
	encodeState,
	stateFromGeoJSON,
	stateFromKML,
	stateFromMapJSON,
	stateToGeoJSON,
	stateToKML
} from './index.js';
import { StateWriter } from './writer.js';

// the fonts of the labels of markers, each its own; without one, the font of the background map
const state: MapState = {
	meta: { background: { builder: 'osm', options: { text: { font: 'lato_regular' } } } },
	elements: [
		{ type: 'marker', point: [13.4, 52.5], label: 'A', style: { font: 'noto_sans_bold' } },
		{ type: 'marker', point: [13.5, 52.5], label: 'B', style: { font: 'lato_italic' } },
		{ type: 'marker', point: [13.6, 52.5], label: 'C' }
	]
};

describe('label font', () => {
	it('is kept for each marker in a link, GeoJSON, .mapjson and KML', () => {
		expect(decodeState(encodeState(state))).toStrictEqual(state);
		const doc = stateToGeoJSON(state);
		expect(doc.features.map((f) => f.properties?.['symbol-label-font'])).toStrictEqual([
			'noto_sans_bold',
			'lato_italic',
			undefined
		]);
		expect(stateFromGeoJSON(doc)).toStrictEqual(state);
		expect(stateFromMapJSON(JSON.parse(JSON.stringify(state)))).toStrictEqual(state);
		expect(stateFromKML(stateToKML(state)).elements).toStrictEqual(state.elements);
	});

	it('is not written as metadata any more', () => {
		expect(stateToGeoJSON(state).meta).not.toHaveProperty('labelFont');
		const writer = new StateWriter();
		writer.writeRoot(state);
		expect(decodeState(writer.asBase64()).meta).toStrictEqual(state.meta);
	});
});
