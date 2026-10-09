import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { decodeState, encodeState, LIMITS } from './index.js';

function roundTrip(value: number, signed?: true): number {
	const writer = new StateWriter();
	writer.writeVarint(value, signed);
	return new StateReader(writer.bits).readVarint(signed);
}

describe('varints', () => {
	it('round-trip values beyond 32 bits', () => {
		for (const value of [0, 31, 32, 2 ** 30, 2 ** 31, 2 ** 31 + 5, 2 ** 40 + 1, Number.MAX_SAFE_INTEGER]) {
			expect(roundTrip(value)).toBe(value);
		}
		for (const value of [-1, -(2 ** 30), -(2 ** 31) - 1, 2 ** 31, -(2 ** 45)]) {
			expect(roundTrip(value, true)).toBe(value);
		}
	});

	it('are written as before for small values, so existing hashes stay valid', () => {
		const writer = new StateWriter();
		writer.writeVarint(-1234, true);
		writer.writeVarint(987654);
		expect(writer.asBitString()).toBe('000111011011000100001101100001001001111100');
	});

	it('reject values that are not safe integers', () => {
		expect(() => new StateWriter().writeVarint(2 ** 60)).toThrow();
		expect(() => new StateWriter().writeVarint(Infinity)).toThrow();
	});

	it('reject endless varints', () => {
		const writer = new StateWriter();
		for (let i = 0; i < 20; i++) {
			writer.writeInteger(31, 5);
			writer.writeBit(true);
		}
		expect(() => new StateReader(writer.bits).readVarint()).toThrow();
	});
});

describe('large values in a map', () => {
	it('keep far points at a fine resolution', () => {
		const state = {
			map: { center: [0, 0] as [number, number], radius: 20 },
			elements: [{ type: 'marker' as const, point: [120, 10] as [number, number] }]
		};
		expect(decodeState(encodeState(state, { resolution: 0.01 })).elements).toStrictEqual(state.elements);
	});

	it('keep style values up to the largest ones, and none beyond', () => {
		const marker = (size: number) => ({
			elements: [{ type: 'marker' as const, point: [1, 2] as [number, number], style: { size } }]
		});
		expect(decodeState(encodeState(marker(LIMITS.size))).elements).toStrictEqual(marker(LIMITS.size).elements);
		expect(decodeState(encodeState(marker(1e9))).elements).toStrictEqual(marker(LIMITS.size).elements);
	});
});
