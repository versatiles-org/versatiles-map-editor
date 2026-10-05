import { describe, expect, it } from 'vitest';
import {
	coarsestResolutionForArea,
	exponentForResolution,
	LocalGrid,
	MAX_EXPONENT,
	resolutionForArea,
	resolutionOfExponent
} from './grid.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import type { MapState } from './types.js';

function encode(state: MapState, resolution?: number): string {
	const writer = new StateWriter({ resolution });
	writer.writeRoot(state);
	return writer.asBase64();
}
const decode = (base64: string) => StateReader.fromBase64(base64).readRoot();

describe('resolution', () => {
	it('is a step of 0.00001° times a power of 2, from about 1 m to 36 km', () => {
		expect([0.001, 1, 2.2, 100, 1000, 36000, 1e7].map(exponentForResolution)).toStrictEqual([0, 0, 1, 6, 10, 15, 15]);
		expect(resolutionOfExponent(0)).toBeCloseTo(1.1132);
		expect(resolutionOfExponent(MAX_EXPONENT)).toBeCloseTo(36477, 0);
	});
});

/** Whether a number has at most 5 decimal places, e.g. 13.41236 but not 13.400024414. */
const fiveDecimals = (value: number) => Number(value.toFixed(5)) === value;

describe('LocalGrid', () => {
	it('counts steps from the center, and returns exact decimals', () => {
		// steps of 0.00004°
		const grid = new LocalGrid([13.4, 52.5], 2);
		expect(grid.toGrid([13.41236, 52.5])).toStrictEqual([309, 0]);
		expect(grid.fromGrid([309, 0])).toStrictEqual([13.41236, 52.5]);
		expect(grid.fromGrid(grid.toGrid([13.41237, 52.50001]))).toStrictEqual([13.41236, 52.5]);
	});

	it('has coordinates with at most 5 decimal places, within half a step, at every exponent', () => {
		for (let exponent = 0; exponent <= MAX_EXPONENT; exponent++) {
			const grid = new LocalGrid([13.4, 52.5], exponent);
			const step = 0.00001 * 2 ** exponent;
			for (const point of [
				[13.41234, 52.51234],
				[-70.12345, -33.45678]
			] as [number, number][]) {
				const rounded = grid.fromGrid(grid.toGrid(point));
				expect(rounded.every(fiveDecimals), `${exponent}`).toBe(true);
				rounded.forEach((value, i) => expect(Math.abs(value - point[i])).toBeLessThanOrEqual(step / 2 + 1e-9));
				// once rounded, it stays
				expect(grid.fromGrid(grid.toGrid(rounded))).toStrictEqual(rounded);
			}
		}
	});
});

// a map in Berlin, far from the origin of the coordinates
const berlin: MapState = {
	view: { center: [13.4, 52.5], radius: 10000 },
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

describe('coordinates relative to the map center', () => {
	it('round-trip exactly at the default resolution', () => {
		const decoded = decode(encode(berlin));
		expect(decoded.elements).toStrictEqual(berlin.elements);
	});

	it('can be coarser, which is shorter', () => {
		// about 70 m: steps of 0.00064°
		const coarse = encode(berlin, 100);
		expect(coarse.length).toBeLessThan(encode(berlin).length);
		expect(decode(coarse).elements[0]).toStrictEqual({ type: 'marker', point: [13.41248, 52.51264] });
	});

	it('work without a map viewport', () => {
		const state: MapState = { elements: [{ type: 'marker', point: [-70.12345, -33.45678] }] };
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('reject invalid resolutions', () => {
		expect(() => new StateWriter({ resolution: 0 })).toThrow('Invalid resolution');
	});

	it('take 4 bits for the step, at every resolution', () => {
		const lengths = [1, 1000, 36000].map((resolution) => {
			const writer = new StateWriter({ resolution });
			writer.writeRoot({ elements: [] });
			return writer.bits.length;
		});
		expect(new Set(lengths).size).toBe(1);
	});
});

describe('resolutionForArea', () => {
	it('is a thousandth of the larger side, in meters', () => {
		// 0.2° of latitude: 22,264 m
		expect(resolutionForArea([13.3, 52.4, 13.4, 52.6])).toBeCloseTo(22.264, 3);
		// 1° of longitude at the equator is the larger side
		expect(resolutionForArea([0, -0.1, 1, 0.1])).toBeCloseTo(111.32, 2);
		// a point
		expect(resolutionForArea([13, 52, 13, 52])).toBe(0);
	});

	it('gives the step of the share dialog', () => {
		// Inner London: about 24 km wide, a step of 0.00016°, about 17.8 m
		expect(exponentForResolution(resolutionForArea([-0.25, 51.42, 0.09, 51.58]))).toBe(4);
	});
});

describe('coarsestResolutionForArea', () => {
	it('is a hundredth of the larger side, in meters', () => {
		expect(coarsestResolutionForArea([13.3, 52.4, 13.4, 52.6])).toBeCloseTo(222.64, 2);
		expect(coarsestResolutionForArea([13, 52, 13, 52])).toBe(0);
	});

	it('gives the end of the slider of the share dialog', () => {
		// Inner London: 236 m, the nearest step 0.00256°, about 285 m
		expect(exponentForResolution(coarsestResolutionForArea([-0.25, 51.42, 0.09, 51.58]))).toBe(8);
		// the whole world: the coarsest step
		expect(exponentForResolution(coarsestResolutionForArea([-180, -85, 180, 85]))).toBe(MAX_EXPONENT);
	});
});
