import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { collectColors, StateWriter } from './writer.js';
import { decodeState, encodeState } from './index.js';
import type { MapState } from './types.js';
import { CODEC_VERSION, COLOR_INDEX_K, ELEMENT_KEYS, KEY_PARAMETERS } from './constants.js';

function encode(state: MapState): string {
	const writer = new StateWriter();
	writer.writeRoot(state);
	return writer.asBase64();
}

// many elements in a few colors, as in a typical map
const state: MapState = {
	meta: { legend: { entries: [{ type: 'area', style: { color: '#0000ff' }, label: 'Water' }] } },
	elements: Array.from({ length: 20 }, (_, i) => ({
		type: 'polygon' as const,
		// from integers, so the coordinates are exact at the codec's resolution
		points: [
			[(1300 + i) / 100, 52],
			[(1301 + i) / 100, 52],
			[(1301 + i) / 100, 52.01]
		] as [number, number][],
		style: { color: i % 2 ? '#0000ff' : '#00ff00' },
		outlineStyle: { color: '#ffffff80' }
	}))
};

describe('color palette', () => {
	it('round-trips styles, stroke styles and legend colors', () => {
		expect(StateReader.fromBase64(encode(state)).readRoot()).toStrictEqual(state);
	});

	it('decodes colors as lowercase hex', () => {
		const upper: MapState = { elements: [{ type: 'marker', point: [1, 2], style: { color: '#ABCDEF' } }] };
		expect(decodeState(encodeState(upper)).elements[0].style).toStrictEqual({ color: '#abcdef' });
	});

	it('lists each color once, most frequent first', () => {
		expect(collectColors(state)).toStrictEqual(['#ffffff80', '#0000ff', '#00ff00']);
		const mixedCase: MapState = {
			elements: [
				{ type: 'marker', point: [0, 0], style: { color: '#ff0000' } },
				{ type: 'marker', point: [0, 0], style: { color: '#ff0000' } }
			]
		};
		expect(collectColors(mixedCase)).toStrictEqual(['#ff0000']);
	});

	it('handles states without colors', () => {
		const empty: MapState = { elements: [{ type: 'marker', point: [1, 2] }] };
		expect(StateReader.fromBase64(encode(empty)).readRoot()).toStrictEqual(empty);
	});

	it('rejects an index outside the palette', () => {
		const writer = new StateWriter();
		writer.writeKey(CODEC_VERSION, KEY_PARAMETERS.version);
		writer.writePalette(['#ff0000']);
		writer.writeVarint(0); // no strings
		writer.writeInteger(0, 4); // the step of the coordinates: 0.00001°
		writer.writeVarint(0, true); // the origin
		writer.writeVarint(0, true);
		writer.writeBit(false); // one parameter for longitude and latitude
		writer.writeInteger(0, 5); // the parameter of the code of the coordinates
		writer.writeBit(false); // the points of markers and circles from the origin
		writer.writeBit(false); // no frame
		writer.writeBit(false); // no metadata
		writer.writeBit(true); // elements may have fields, e.g. a popup
		writer.writeKey(ELEMENT_KEYS.marker, KEY_PARAMETERS.element);
		writer.writeExpGolomb(0, 0, true); // the point
		writer.writeExpGolomb(0, 0, true);
		writer.writeBit(true); // style
		writer.writeExpGolomb(0, 0); // no reference
		writer.writeExpGolomb(1, 0); // color
		writer.writeExpGolomb(5, COLOR_INDEX_K);
		writer.writeExpGolomb(0, 0); // end
		// root, marker, style
		expect(() => new StateReader(writer.bits).readRoot()).toThrow(
			expect.objectContaining({
				cause: expect.objectContaining({
					cause: expect.objectContaining({ cause: expect.objectContaining({ message: 'Invalid palette index: 5' }) })
				})
			})
		);
	});
});

describe('the colors of a palette', () => {
	it('cost 3 bits if black or white, else 26, each 8 more with alpha', () => {
		const bits = (color: string) => {
			const writer = new StateWriter();
			writer.writePaletteColor(color);
			return writer.bits.length;
		};
		expect(['#000000', '#ffffff', '#ffffff80', '#0072b2', '#0072b24d', '#fefefe'].map(bits)).toStrictEqual([
			3, 3, 11, 26, 34, 26
		]);
	});

	it('are read with their alpha, in lowercase', () => {
		const colors = ['#000000', '#FFFFFF', '#00000080', '#ffffff4d', '#0072B2', '#00664a80', '#010101'];
		const writer = new StateWriter();
		for (const color of colors) writer.writePaletteColor(color);
		const reader = new StateReader(writer.bits);
		expect(colors.map(() => reader.readPaletteColor())).toStrictEqual(colors.map((color) => color.toLowerCase()));
		expect(reader.ended()).toBe(true);
	});
});

describe('versions', () => {
	it('encodeState writes version 1', () => {
		expect(StateReader.fromBase64(encodeState(state)).readKey(KEY_PARAMETERS.version)).toBe(1);
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('rejects other versions, of which there is no last one', () => {
		for (const version of [0, 2, 7, 1000]) {
			const writer = new StateWriter();
			writer.writeKey(version, KEY_PARAMETERS.version);
			expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
		}
	});
});
