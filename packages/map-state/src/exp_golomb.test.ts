import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { bestExpGolombParameter, StateWriter } from './writer.js';
import { decodeState, encodeState } from './index.js';
import type { StateElement } from './types.js';

function bits(value: number, k: number, signed?: true): string {
	const writer = new StateWriter();
	writer.writeExpGolomb(value, k, signed);
	return writer.asBitString();
}

describe('the Exp-Golomb code', () => {
	it('writes the code with the parameter 0 and 2', () => {
		expect([0, 1, 2, 3, 4].map((value) => bits(value, 0))).toStrictEqual(['1', '010', '011', '00100', '00101']);
		expect([0, 3, 4, 11, 12].map((value) => bits(value, 2))).toStrictEqual(['100', '111', '01000', '01111', '0010000']);
	});

	it('writes signed values zigzag encoded', () => {
		expect([0, -1, 1, -2].map((value) => bits(value, 0, true))).toStrictEqual(['1', '010', '011', '00100']);
	});

	it('reads what it writes, up to the largest safe integers', () => {
		const values = [0, 1, -1, 1000, -123456, 2 ** 31, -(2 ** 31) - 1, 2 ** 51, -(2 ** 51)];
		for (const k of [0, 5, 17, 31]) {
			const writer = new StateWriter();
			for (const value of values) writer.writeExpGolomb(value, k, true);
			writer.writeExpGolomb(2 ** 52, k);
			const reader = new StateReader(writer.bits);
			expect(values.map(() => reader.readExpGolomb(k, true))).toStrictEqual(values);
			expect(reader.readExpGolomb(k)).toBe(2 ** 52);
			expect(reader.ended()).toBe(true);
		}
	});

	it('refuses negative unsigned values and unsafe integers', () => {
		const writer = new StateWriter();
		expect(() => writer.writeExpGolomb(-1, 0)).toThrow('cannot be negative');
		expect(() => writer.writeExpGolomb(2 ** 53, 0)).toThrow('safe integer');
	});

	it('rejects a code beyond the safe integers', () => {
		const reader = StateReader.fromBitString('0'.repeat(53) + '1' + '0'.repeat(53));
		expect(() => reader.readExpGolomb(0)).toThrow(
			expect.objectContaining({ cause: expect.objectContaining({ message: 'Exp-Golomb code too long' }) })
		);
	});

	it('has the parameter that codes the values in the fewest bits', () => {
		expect(bestExpGolombParameter([])).toBe(0);
		expect(bestExpGolombParameter([0, 1, 0, 2])).toBe(0);
		// parameter 10: 11 bits each; 9 and 11: 12 bits each
		expect(bestExpGolombParameter([600, 700, 900, 1000])).toBe(10);
	});
});

describe('the coordinates of elements', () => {
	it('are kept near and far from the origin', () => {
		const elements: StateElement[] = [
			{ type: 'marker', point: [13.4, 52.5] },
			{ type: 'marker', point: [-179.99999, -85] },
			{ type: 'circle', point: [179.99999, 85], radius: 10 },
			{
				type: 'line',
				points: [
					[13.4, 52.5],
					[13.40001, 52.5],
					[-170, 10]
				]
			}
		];
		expect(decodeState(encodeState({ map: { center: [13.4, 52.5], radius: 1000 }, elements })).elements).toStrictEqual(
			elements
		);
	});

	it('are differences to the point before if that is shorter, e.g. for points in a row', () => {
		// far from the origin, the camera, but each near the one before
		const map = { center: [0, 0] as [number, number], radius: 1000 };
		const markers: StateElement[] = Array.from({ length: 50 }, (_, i) => ({
			type: 'marker',
			point: [13 + i * 0.0001, 52 + (i % 3) * 0.0001]
		}));
		// the same points, but in a jumbled order
		const jumbled = markers.map((_, i) => markers[(i * 17) % 50]);
		const length = (elements: StateElement[]) => encodeState({ map, elements }).length;
		// from the origin, each marker would cost about 47 bits: about 390 characters for all
		expect(length(markers)).toBeLessThan(200);
		expect(length(markers)).toBeLessThan(length(jumbled));
		expect(decodeState(encodeState({ map, elements: markers })).elements).toStrictEqual(markers);
	});

	it('keep the points of markers and circles relative across lines and areas between them', () => {
		const map = { center: [0, 0] as [number, number], radius: 1000 };
		const elements: StateElement[] = [
			{ type: 'marker', point: [13.4, 52.5] },
			{
				type: 'line',
				points: [
					[13.5, 52.6],
					[13.6, 52.7]
				]
			},
			{ type: 'circle', point: [13.40001, 52.50001], radius: 50 },
			{ type: 'marker', point: [13.40002, 52.5] }
		];
		expect(decodeState(encodeState({ map, elements })).elements).toStrictEqual(elements);
	});

	it('have a parameter per axis if that is shorter, e.g. for points sorted by latitude', () => {
		/** Whether the link stores a parameter per axis: the bit after the origin. */
		function perAxis(elements: StateElement[]): boolean {
			const reader = StateReader.fromBase64(encodeState({ elements }));
			reader.readVersion();
			reader.readPalette();
			reader.readStringTable();
			reader.readMap();
			reader.readInteger(4); // the step of the coordinates
			reader.readVarint(true); // the origin
			reader.readVarint(true);
			return reader.readBit();
		}
		// north to south, each about 1 km apart in longitude
		const sorted: StateElement[] = Array.from({ length: 60 }, (_, i) => ({
			type: 'marker',
			point: [(1300 + ((i * 37) % 60)) / 100, (526000 - i) / 10000]
		}));
		expect(perAxis(sorted)).toBe(true);
		expect(decodeState(encodeState({ elements: sorted })).elements).toStrictEqual(sorted);
		// spread alike in both directions
		const spread: StateElement[] = sorted.map((_, i) => ({
			type: 'marker',
			point: [(1300 + ((i * 37) % 60)) / 100, (5200 + ((i * 23) % 60)) / 100]
		}));
		expect(perAxis(spread)).toBe(false);
		expect(decodeState(encodeState({ elements: spread })).elements).toStrictEqual(spread);
	});

	it('cost 1 bit each at the origin', () => {
		const marker = (lng: number): StateElement => ({ type: 'marker', point: [lng, 0] });
		const length = (count: number) => encodeState({ elements: Array.from({ length: count }, () => marker(0)) }).length;
		// each marker: the repeat bit, 2 coordinates, the label and popup flags: 5 bits
		expect((length(61) - length(1)) * 6).toBeGreaterThanOrEqual(5 * 60);
		expect((length(61) - length(1)) * 6).toBeLessThan(5 * 60 + 6);
	});
});
