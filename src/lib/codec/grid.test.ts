import { describe, expect, it } from 'vitest';
import { digitsForResolution, LocalGrid, resolutionOfDigits } from './grid.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import type { StateRoot } from './types.js';

function encode(state: StateRoot, version: number, resolution?: number): string {
	const writer = new StateWriter({ version, resolution });
	writer.writeRoot(state);
	return writer.asBase64();
}
const decode = (base64: string) => StateReader.fromBase64(base64).readRoot();

describe('resolution', () => {
	it('is rounded to decimal places of degrees', () => {
		expect([0.001, 1, 10, 100, 1000, 1e7].map(digitsForResolution)).toStrictEqual([8, 5, 4, 3, 2, 0]);
		expect(resolutionOfDigits(5)).toBeCloseTo(1.1132);
	});
});

describe('LocalGrid', () => {
	it('counts steps from the center, and returns exact decimals', () => {
		const grid = new LocalGrid([13.40001, 52.49999], 4);
		expect(grid.toGrid([13.4123, 52.5])).toStrictEqual([123, 0]);
		expect(grid.fromGrid([123, 0])).toStrictEqual([13.4123, 52.5]);
		expect(grid.fromGrid(grid.toGrid([13.41234, 52.50006]))).toStrictEqual([13.4123, 52.5001]);
	});
});

// a map in Berlin, far from the origin of the coordinates
const berlin: StateRoot = {
	map: { center: [13.4, 52.5], radius: 10000 },
	elements: [
		{ type: 'marker', point: [13.41234, 52.51234] },
		{
			type: 'line',
			points: [
				[13.3, 52.4],
				[13.35, 52.45],
				[13.36123, 52.46789]
			]
		},
		{ type: 'circle', point: [13.45, 52.55], radius: 1000 }
	]
};

describe('coordinates relative to the map center (version 1)', () => {
	it('round-trip exactly at the default resolution', () => {
		const decoded = decode(encode(berlin, 1));
		expect(decoded.elements).toStrictEqual(berlin.elements);
	});

	it('make the hash shorter', () => {
		// 59 → 49 characters: only the first point of each element is relative to the center
		expect(encode(berlin, 1).length).toBeLessThan(encode(berlin, 0).length * 0.9);
	});

	it('can be coarser, which is shorter', () => {
		const coarse = encode(berlin, 1, 100);
		expect(coarse.length).toBeLessThan(encode(berlin, 1).length);
		expect(decode(coarse).elements[0]).toStrictEqual({ type: 'marker', point: [13.412, 52.512] });
	});

	it('work without a map viewport', () => {
		const state: StateRoot = { elements: [{ type: 'marker', point: [-70.12345, -33.45678] }] };
		expect(decode(encode(state, 1))).toStrictEqual(state);
	});

	it('reject invalid resolutions', () => {
		expect(() => new StateWriter({ version: 1, resolution: 0 })).toThrow('Invalid resolution');
		const writer = new StateWriter({ version: 1 });
		writer.writeInteger(1, 3); // version
		writer.writeArray([], () => {}); // palette
		writer.writeBit(false); // no map
		writer.writeVarint(12); // too many decimal places
		expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
	});
});
