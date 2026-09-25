import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { collectColors, StateWriter } from './writer.js';
import { decodeState, encodeState } from './index.js';
import type { StateRoot } from './types.js';

function encode(state: StateRoot, version: number): string {
	const writer = new StateWriter({ version });
	writer.writeRoot(state);
	return writer.asBase64();
}

// many elements in a few colors, as in a typical map
// without a viewport, whose radius is stored lossy by design
const state: StateRoot = {
	meta: { legend: { entries: [{ color: '#0000FF', label: 'Water' }] } },
	elements: Array.from({ length: 20 }, (_, i) => ({
		type: 'polygon' as const,
		// from integers, so the coordinates are exact at the codec's resolution
		points: [
			[(1300 + i) / 100, 52],
			[(1301 + i) / 100, 52],
			[(1301 + i) / 100, 52.01]
		] as [number, number][],
		style: { color: i % 2 ? '#0000FF' : '#00FF00' },
		strokeStyle: { color: '#FFFFFF80' }
	}))
};

describe('color palette (version 1)', () => {
	it('round-trips styles, stroke styles and legend colors', () => {
		expect(StateReader.fromBase64(encode(state, 1)).readRoot()).toStrictEqual(state);
	});

	it('makes the hash shorter', () => {
		const v0 = encode(state, 0);
		const v1 = encode(state, 1);
		expect(v1.length).toBeLessThan(v0.length * 0.8);
	});

	it('lists each color once, most frequent first', () => {
		expect(collectColors(state)).toStrictEqual(['#FFFFFF80', '#0000FF', '#00FF00']);
		const mixedCase: StateRoot = {
			elements: [
				{ type: 'marker', point: [0, 0], style: { color: '#ff0000' } },
				{ type: 'marker', point: [0, 0], style: { color: '#FF0000' } }
			]
		};
		expect(collectColors(mixedCase)).toStrictEqual(['#ff0000']);
	});

	it('handles states without colors', () => {
		const empty: StateRoot = { elements: [{ type: 'marker', point: [1, 2] }] };
		expect(StateReader.fromBase64(encode(empty, 1)).readRoot()).toStrictEqual(empty);
	});

	it('rejects an index outside the palette', () => {
		const writer = new StateWriter({ version: 1 });
		writer.writeInteger(1, 3); // version
		writer.writeArray(['#ff0000'], (c) => writer.writeColor(c));
		writer.writeBit(false); // no map
		writer.writeVarint(5); // resolution: decimal places
		writer.writeBit(false); // no metadata
		writer.writeInteger(1, 3); // marker
		writer.writePoint([0, 0]);
		writer.writeBit(true); // style
		writer.writeInteger(8, 4); // color
		writer.writeVarint(5);
		writer.writeInteger(0, 4);
		expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
	});
});

describe('versions', () => {
	it('encodeState writes version 1', () => {
		expect(StateReader.fromBase64(encodeState(state)).readInteger(3)).toBe(1);
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('rejects unknown versions', () => {
		expect(() => new StateWriter({ version: 7 })).toThrow('Unsupported version');
		const writer = new StateWriter();
		writer.writeInteger(7, 3);
		expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
	});
});
