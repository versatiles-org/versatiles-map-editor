import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import type { MapState } from './types.js';

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
			style: { symbol: `base:icon-symbol_${i % count}`, color: colors[i % colors.length], label: `Place ${i}` }
		}))
	};
}

describe('symbols', () => {
	it('round-trip in styles and in the legend', () => {
		const state: MapState = {
			meta: {
				legend: {
					entries: [
						{ color: '#ff0000', symbol: 'icons:anchor', label: 'Harbour' },
						// only in the legend
						{ color: '#00ff00', symbol: 'base:icon-zoo', label: 'Zoo' },
						{ color: '#0000ff', label: 'Area' }
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
				{ type: 'marker', point: [13.1, 52], style: { label: 'A' } }
			]
		};
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('are no metadata of their own', () => {
		const state: MapState = { elements: [{ type: 'marker', point: [13, 52], style: { symbol: 'icons:anchor' } }] };
		expect(decode(encode(state)).meta).toBeUndefined();
	});

	it('are stored once, sorted, with the beginning they share with the previous name', () => {
		const writer = new StateWriter();
		writer.writeSymbols([...NAMES, 'base:icon-bank']);
		const reader = new StateReader(writer.bits);
		expect(reader.readVarint()).toBe(5);
		const entries = Array.from({ length: 5 }, () => [reader.readVarint(), reader.readString()]);
		expect(entries).toStrictEqual([
			[0, 'base:icon-atm'],
			[10, 'bakery'],
			[12, 'nk'],
			[12, 'r'],
			[0, 'icons:anchor']
		]);
		expect(reader.ended()).toBe(true);
	});

	it('keep many symbols short', () => {
		// before the list, the names in the styles made this 4556 characters long
		const state = markers(100, 40);
		const encoded = encode(state);
		expect(encoded.length).toBeLessThan(2900);
		expect(decode(encoded)).toStrictEqual(state);
	});

	it('are rejected if the index is not in the list, e.g. in older links with the names in the styles', () => {
		const writer = new StateWriter();
		writer.writeInteger(1, 3); // version
		writer.writeVarint(0); // no colors
		writer.writeBit(false); // no map
		writer.writeVarint(5); // resolution: decimal places
		writer.writeBit(false); // no metadata, so no symbols
		writer.writeInteger(1, 3); // marker
		writer.writeVarint(0, true);
		writer.writeVarint(0, true);
		writer.writeBit(true); // style
		writer.writeVarint(0); // no reference
		writer.writeInteger(13, 4); // symbol
		writer.writeString('icons:anchor');
		expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
	});

	it('reject a name that shares more than the previous one has', () => {
		const writer = new StateWriter();
		writer.writeVarint(1);
		writer.writeVarint(3);
		writer.writeString('x');
		expect(() => new StateReader(writer.bits).readSymbols()).toThrow(
			expect.objectContaining({
				cause: expect.objectContaining({ message: 'Invalid symbol name: 3 shared characters' })
			})
		);
	});
});
