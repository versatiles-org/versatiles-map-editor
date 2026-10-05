import { describe, expect, it } from 'vitest';
import type { Bounds, MapState } from './types.js';
import {
	boundsOf,
	centerOf,
	decodeState,
	encodeState,
	sanitizeFrame,
	stateFromGeoJSON,
	stateFromKML,
	stateToGeoJSON,
	stateToKML
} from './index.js';

const frame: Bounds = [13.3, 52.45, 13.5, 52.55];
const state: MapState = {
	frame,
	elements: [
		{ type: 'marker', point: [13.4, 52.5] },
		{
			type: 'line',
			points: [
				[13.35, 52.48],
				[13.45, 52.52]
			]
		}
	]
};

describe('frame', () => {
	it('is kept in a link, at the resolution of the coordinates', () => {
		expect(decodeState(encodeState(state))).toStrictEqual(state);
		// about 1 km: steps of 0.01024°, within half a step
		const coarse = decodeState(
			encodeState({ ...state, frame: [13.30004, 52.45004, 13.50004, 52.55004] }, { resolution: 1000 })
		);
		coarse.frame!.forEach((value, i) => expect(Math.abs(value - frame[i])).toBeLessThanOrEqual(0.00512 + 1e-4));
		expect(coarse.frame!.every((value) => Number(value.toFixed(5)) === value)).toBe(true);
	});

	it('is kept next to the camera, which has a center of its own', () => {
		const withCamera: MapState = { ...state, view: { center: [10, 50], radius: 1000 } };
		const decoded = decodeState(encodeState(withCamera));
		expect(decoded.frame).toStrictEqual(frame);
		expect(decoded.view?.center).toStrictEqual([10, 50]);
		expect(decoded.elements).toStrictEqual(state.elements);
	});

	it('is never empty, and an invalid one is left out', () => {
		const tiny = decodeState(encodeState({ elements: [], frame: [13.4, 52.5, 13.400001, 52.500001] }));
		expect(tiny.frame![2]).toBeGreaterThan(tiny.frame![0]);
		expect(tiny.frame![3]).toBeGreaterThan(tiny.frame![1]);
		expect(decodeState(encodeState({ elements: [], frame: [13.5, 52.5, 13.4, 52.6] })).frame).toBeUndefined();
	});

	it('makes links short without a camera: the coordinates start near the elements', () => {
		// the elements far from 0°, 0°: the origin is their center, not 0°, 0°
		const far = encodeState({ elements: state.elements });
		const near = encodeState({
			elements: [
				{ type: 'marker', point: [0, 0] },
				{
					type: 'line',
					points: [
						[-0.05, -0.02],
						[0.05, 0.02]
					]
				}
			]
		});
		// only the origin itself is longer, e.g. 1340 and 5250 hundredths of a degree
		expect(Math.abs(far.length - near.length)).toBeLessThanOrEqual(5);
		expect(decodeState(far).elements).toStrictEqual(state.elements);
	});

	it('is kept in GeoJSON and KML, and KML looks at it', () => {
		expect(stateToGeoJSON(state).frame).toStrictEqual(frame);
		expect(stateFromGeoJSON(stateToGeoJSON(state)).frame).toStrictEqual(frame);
		const kml = stateToKML(state);
		expect(stateFromKML(kml).frame).toStrictEqual(frame);
		expect(kml).toContain('<LookAt><longitude>13.4</longitude><latitude>52.5</latitude>');
	});

	it('is checked when it is read from a file', () => {
		const doc = { type: 'FeatureCollection', features: [] };
		expect(stateFromGeoJSON({ ...doc, frame: [1, 2, 3] } as never).frame).toBeUndefined();
		expect(stateFromGeoJSON({ ...doc, frame: [1, 2, 3, 'x'] } as never).frame).toBeUndefined();
		expect(stateFromGeoJSON({ ...doc, frame: [1, 2, 3, 4] } as never).frame).toStrictEqual([1, 2, 3, 4]);
	});
});

describe('sanitizeFrame', () => {
	it('accepts only an area within the latitudes and longitudes of the map', () => {
		expect(sanitizeFrame([-10, -20, 10, 20])).toStrictEqual([-10, -20, 10, 20]);
		expect(sanitizeFrame([10, -20, -10, 20])).toBeUndefined();
		expect(sanitizeFrame([-10, 20, 10, -20])).toBeUndefined();
		expect(sanitizeFrame([-10, -95, 10, 20])).toBeUndefined();
		expect(sanitizeFrame([-190, -20, 10, 20])).toBeUndefined();
		expect(sanitizeFrame([0, 0, NaN, 1])).toBeUndefined();
		expect(sanitizeFrame(undefined)).toBeUndefined();
	});
});

describe('boundsOf', () => {
	it('covers all points of the elements, and circles with their radius', () => {
		expect(boundsOf(state.elements)).toStrictEqual([13.35, 52.48, 13.45, 52.52]);
		const [west, south, east, north] = boundsOf([{ type: 'circle', point: [0, 0], radius: 111320 }])!;
		expect(south).toBeCloseTo(-1);
		expect(north).toBeCloseTo(1);
		expect(west).toBeCloseTo(-1);
		expect(east).toBeCloseTo(1);
	});

	it('is a point for a single marker, and undefined without elements', () => {
		expect(boundsOf([{ type: 'marker', point: [13.4, 52.5] }])).toStrictEqual([13.4, 52.5, 13.4, 52.5]);
		expect(boundsOf([])).toBeUndefined();
	});

	it('has a center', () => {
		expect(centerOf([10, 20, 30, 40])).toStrictEqual([20, 30]);
	});
});
