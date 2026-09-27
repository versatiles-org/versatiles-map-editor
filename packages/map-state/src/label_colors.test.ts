import { describe, expect, it } from 'vitest';
import type { MapState } from './types.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromKML, stateToGeoJSON, stateToKML } from './index.js';

// the text and the halo color of a marker's label
const state: MapState = {
	elements: [
		{ type: 'marker', point: [13.4, 52.5], style: { label: 'A', labelColor: '#123456', haloColor: '#fedcba' } },
		{ type: 'marker', point: [13.5, 52.5], style: { label: 'B' } }
	]
};

describe('label colors', () => {
	it('are kept in a link, and default to black text in a white halo', () => {
		const decoded = decodeState(encodeState(state));
		expect(decoded.elements.map((e) => e.style)).toStrictEqual([
			{ label: 'A', labelColor: '#123456', haloColor: '#fedcba' },
			{ label: 'B' }
		]);
	});

	it('are properties in GeoJSON', () => {
		const doc = stateToGeoJSON(state);
		expect(doc.features[0].properties).toMatchObject({
			'symbol-label-color': '#123456',
			'symbol-halo-color': '#fedcba'
		});
		expect(doc.features[1].properties).toMatchObject({
			'symbol-label-color': '#000000',
			'symbol-halo-color': '#ffffff'
		});
		expect(stateFromGeoJSON(doc).elements.map((e) => e.style)).toStrictEqual(state.elements.map((e) => e.style));
	});

	it('are kept in KML, where the text color is the color of the label style', () => {
		const kml = stateToKML(state);
		// KML colors are aabbggrr
		expect(kml).toContain('<LabelStyle><color>ff563412</color></LabelStyle>');
		expect(stateFromKML(kml).elements.map((e) => e.style)).toStrictEqual(state.elements.map((e) => e.style));

		// from another program, which has no halo color
		const foreign = stateFromKML(
			'<kml><Document><Placemark><name>C</name><Style><LabelStyle><color>ff00ff00</color></LabelStyle></Style>' +
				'<Point><coordinates>13.4,52.5</coordinates></Point></Placemark></Document></kml>'
		);
		expect(foreign.elements[0].style).toMatchObject({ label: 'C', labelColor: '#00ff00' });
	});
});
