import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { collectColors, StateWriter } from './writer.js';
import { decodeState, encodeState } from './index.js';
import type { MapState } from './types.js';

function encode(state: MapState): string {
	const writer = new StateWriter();
	writer.writeRoot(state);
	return writer.asBase64();
}

// many elements in a few colors, as in a typical map
// without a viewport, whose radius is stored lossy by design
const state: MapState = {
	meta: { legend: { entries: [{ type: 'polygon', style: { color: '#0000ff' }, label: 'Water' }] } },
	elements: Array.from({ length: 20 }, (_, i) => ({
		type: 'polygon' as const,
		// from integers, so the coordinates are exact at the codec's resolution
		points: [
			[(1300 + i) / 100, 52],
			[(1301 + i) / 100, 52],
			[(1301 + i) / 100, 52.01]
		] as [number, number][],
		style: { color: i % 2 ? '#0000ff' : '#00ff00' },
		strokeStyle: { color: '#ffffff80' }
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
		writer.writeInteger(1, 3); // version
		writer.writePalette(['#ff0000']);
		writer.writeVarint(0); // no strings
		writer.writeBit(false); // no camera
		writer.writeInteger(0, 4); // the step of the coordinates: 0.00001°
		writer.writeVarint(0, true); // the origin
		writer.writeVarint(0, true);
		writer.writeInteger(0, 5); // the order of the code of the coordinates
		writer.writeBit(false); // the points of markers and circles from the origin
		writer.writeBit(false); // no frame
		writer.writeBit(false); // no metadata
		writer.writeInteger(1, 3); // marker
		writer.writeExpGolomb(0, 0, true); // the point
		writer.writeExpGolomb(0, 0, true);
		writer.writeBit(true); // style
		writer.writeExpGolomb(0, 0); // no reference
		writer.writeInteger(8, 4); // color
		writer.writeVarint(5);
		writer.writeInteger(0, 4);
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

describe('versions', () => {
	it('encodeState writes version 1', () => {
		expect(StateReader.fromBase64(encodeState(state)).readInteger(3)).toBe(1);
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('rejects other versions, also the original version 0', () => {
		for (const version of [0, 2, 7]) {
			const writer = new StateWriter();
			writer.writeInteger(version, 3);
			expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
		}
	});
});
