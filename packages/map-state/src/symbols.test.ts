import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import type { MapState } from './types.js';
import { CODEC_VERSION, ELEMENT_KEYS, KEY_PARAMETERS, STRING_INDEX_K } from './constants.js';

function encode(state: MapState): string {
	const writer = new StateWriter();
	writer.writeRoot(state);
	return writer.asBase64();
}

const decode = (base64: string) => StateReader.fromBase64(base64).readRoot();

const NAMES = ['base:icon-bakery', 'base:icon-bank', 'base:icon-bar', 'icons:anchor', 'base:icon-atm'];

/** Markers with `count` different symbols, colors and labels, as in an imported table. */
function markers(n: number, count: number): MapState {
	const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628'];
	return {
		elements: Array.from({ length: n }, (_, i) => ({
			type: 'marker' as const,
			point: [(1300 + i) / 100, (5200 + ((i * 37) % 100)) / 100] as [number, number],
			label: `Place ${i}`,
			style: { symbol: `base:icon-symbol_${i % count}`, color: colors[i % colors.length] }
		}))
	};
}

describe('symbols', () => {
	it('round-trip in styles and in the legend', () => {
		const state: MapState = {
			meta: {
				legend: {
					entries: [
						{ type: 'marker', style: { color: '#ff0000', symbol: 'icons:anchor' }, label: 'Harbour' },
						// only in the legend
						{ type: 'marker', style: { color: '#00ff00', symbol: 'base:icon-zoo' }, label: 'Zoo' },
						{ type: 'area', style: { color: '#0000ff' }, label: 'Area' }
					]
				}
			},
			elements: NAMES.map((symbol, i) => ({ type: 'marker', point: [13 + i / 100, 52], style: { symbol } }))
		};
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('round-trip without a symbol, and with an empty one', () => {
		const state: MapState = {
			elements: [
				{ type: 'marker', point: [13, 52], style: { symbol: '' } },
				{ type: 'marker', point: [13.1, 52], label: 'A' }
			]
		};
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('are no metadata of their own', () => {
		const state: MapState = { elements: [{ type: 'marker', point: [13, 52], style: { symbol: 'icons:anchor' } }] };
		expect(decode(encode(state)).meta).toBeUndefined();
	});

	it('are words of the format in the string table, each once, in the order they are written', () => {
		const state: MapState = {
			meta: { legend: { entries: [{ type: 'marker', style: { symbol: 'icons:anchor' }, label: 'Harbour' }] } },
			elements: NAMES.map((symbol, i) => ({ type: 'marker', point: [13 + i / 100, 52], style: { symbol } }))
		};
		const reader = StateReader.fromBase64(encode(state));
		reader.readVersion();
		reader.readPalette();
		// the words of the format, then the others
		expect(reader.readStringTable()).toStrictEqual([
			'icons:anchor',
			'base:icon-bakery',
			'base:icon-bank',
			'base:icon-bar',
			'base:icon-atm',
			'Harbour'
		]);
	});

	it('keep many symbols short', () => {
		// before the list, the names in the styles made this 4556 characters long
		const state = markers(100, 40);
		const encoded = encode(state);
		expect(encoded.length).toBeLessThan(2900);
		expect(decode(encoded)).toStrictEqual(state);
	});

	it('are rejected if they are not in the string table', () => {
		const writer = new StateWriter();
		writer.writeKey(CODEC_VERSION, KEY_PARAMETERS.version);
		writer.writeVarint(0); // no colors
		writer.writeVarint(0); // no strings
		writer.writeInteger(0, 4); // the step of the coordinates: 0.00001°
		writer.writeVarint(0, true); // the origin
		writer.writeVarint(0, true);
		writer.writeBit(false); // one parameter for longitude and latitude
		writer.writeInteger(0, 5); // the parameter of the code of the coordinates
		writer.writeBit(false); // the points of markers and circles from the origin
		writer.writeBit(false); // no frame
		writer.writeBit(false); // no metadata
		writer.writeBit(true); // elements may have popups
		writer.writeKey(ELEMENT_KEYS.marker, KEY_PARAMETERS.element);
		writer.writeExpGolomb(0, 0, true); // the point
		writer.writeExpGolomb(0, 0, true);
		writer.writeBit(true); // style
		writer.writeExpGolomb(0, 0); // no reference
		writer.writeExpGolomb(2, 0); // symbol
		// not the next string, but the one with index 5
		writer.writeBit(false);
		writer.writeExpGolomb(5, STRING_INDEX_K);
		// root, marker, style
		expect(() => new StateReader(writer.bits).readRoot()).toThrow(
			expect.objectContaining({
				cause: expect.objectContaining({
					cause: expect.objectContaining({ cause: expect.objectContaining({ message: 'Invalid string index: 5' }) })
				})
			})
		);
	});
});
