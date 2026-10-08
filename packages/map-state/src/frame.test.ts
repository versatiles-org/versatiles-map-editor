import { describe, expect, it } from 'vitest';
import type { Bounds, MapState, StateFrame } from './types.js';
import {
	boundsOf,
	decodeState,
	encodeState,
	sanitizeBounds,
	sanitizeFrame,
	stateFromGeoJSON,
	stateFromKML,
	stateToGeoJSON,
	stateToKML
} from './index.js';
import { centerOf } from './bounds.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { KEY_PARAMETERS } from './constants.js';

const bounds: Bounds = [13.3, 52.45, 13.5, 52.55];
const frame: StateFrame = { bounds };
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
			encodeState({ ...state, frame: { bounds: [13.30004, 52.45004, 13.50004, 52.55004] } }, { resolution: 1000 })
		);
		const area = coarse.frame!.bounds!;
		area.forEach((value, i) => expect(Math.abs(value - bounds[i])).toBeLessThanOrEqual(0.00512 + 1e-4));
		expect(area.every((value) => Number(value.toFixed(5)) === value)).toBe(true);
	});

	it('is never empty, and an invalid one is left out', () => {
		// one step of the coordinates wide and high, in a link with coarser steps
		const tiny = decodeState(
			encodeState({ elements: [], frame: { bounds: [13.4, 52.5, 13.40001, 52.50001] } }, { resolution: 100 })
		);
		const area = tiny.frame!.bounds!;
		expect(area[2]).toBeGreaterThan(area[0]);
		expect(area[3]).toBeGreaterThan(area[1]);
		// less than a step of the coordinates is no area
		expect(
			decodeState(encodeState({ elements: [], frame: { bounds: [13.4, 52.5, 13.400001, 52.500001] } })).frame
		).toBeUndefined();
		expect(
			decodeState(encodeState({ elements: [], frame: { bounds: [13.5, 52.5, 13.4, 52.6] } })).frame
		).toBeUndefined();
	});

	it('is not needed for a short link: the coordinates start near the elements', () => {
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
		expect(stateFromGeoJSON({ ...doc, frame: { bounds: [1, 2, 3] } } as never).frame).toBeUndefined();
		expect(stateFromGeoJSON({ ...doc, frame: { bounds: [1, 2, 3, 'x'] } } as never).frame).toBeUndefined();
		expect(stateFromGeoJSON({ ...doc, frame: { bounds: [1, 2, 3, 4] } } as never).frame).toStrictEqual({
			bounds: [1, 2, 3, 4]
		});
		// an area alone, as before the frame had other parts, is none
		expect(stateFromGeoJSON({ ...doc, frame: [1, 2, 3, 4] } as never).frame).toBeUndefined();
	});
});

describe('frame: how the map is turned', () => {
	const turned: StateFrame = {
		bounds,
		bearing: -120,
		pitch: 45,
		canPan: false,
		canZoom: false,
		canRotate: true,
		canTilt: true
	};

	it('is kept in a link, with and without an area', () => {
		expect(decodeState(encodeState({ ...state, frame: turned })).frame).toStrictEqual(turned);
		for (const frame of [
			{ bearing: 90 },
			{ pitch: 60 },
			{ bearing: 180, pitch: 1 },
			{ canRotate: true },
			{ canTilt: true },
			{ canPan: false },
			{ canZoom: false },
			{ bounds, canTilt: true, canZoom: false },
			{ confine: true },
			{ minZoom: 3.5 },
			{ scrollZoom: 'free' },
			{ maxZoom: 0 },
			{ bounds, minZoom: 8, maxZoom: 22 },
			{ bounds, confine: true }
		] as StateFrame[]) {
			expect(decodeState(encodeState({ ...state, frame })).frame).toStrictEqual(frame);
		}
	});

	it('is kept in whole degrees in a link', () => {
		const frame = decodeState(encodeState({ ...state, frame: { bearing: 29.6, pitch: 12.4 } })).frame;
		expect(frame).toStrictEqual({ bearing: 30, pitch: 12 });
		// too little to be turned at all
		expect(decodeState(encodeState({ ...state, frame: { bearing: 0.2, pitch: 0.4 } })).frame).toBeUndefined();
		expect(decodeState(encodeState({ ...state, frame: { bearing: 359.8 } })).frame).toBeUndefined();
	});

	it('costs a link what it sets: nothing without a setting, little for one, more for all', () => {
		const plain = encodeState(state);
		const longer = (frame: StateFrame) => encodeState({ ...state, frame }).length - plain.length;
		// only an area: 1 bit says that no settings follow, as before the settings were a list
		expect(longer({ bounds })).toBe(0);
		expect(longer({ bounds, canRotate: true })).toBeLessThanOrEqual(2);
		expect(longer({ bounds, bearing: -120 })).toBeLessThanOrEqual(3);
		// all six settings: a key each, which is the price for settings that can be added later
		expect(longer(turned)).toBeLessThanOrEqual(8);
	});

	it('refuses a setting that this version does not know', () => {
		const writer = new StateWriter();
		writer.writeBit(true); // a frame
		writer.writeBit(false); // without an area
		writer.writeKey(99, KEY_PARAMETERS.frame);
		expect(() => new StateReader(writer.bits).readFrame()).toThrow(
			expect.objectContaining({ cause: expect.objectContaining({ message: 'Unknown key of the frame: 99' }) })
		);
	});

	it('costs 1 bit for its settings if it is only an area', () => {
		const bits = (frame: StateFrame) => {
			const writer = new StateWriter();
			writer.writeRoot({ elements: [], frame });
			return writer.bits.length;
		};
		// "visitors can rotate" is the key 2 of 3 bits
		expect(bits({ bounds, canRotate: true }) - bits({ bounds })).toBe(3);
	});

	it('is kept in GeoJSON, KML and .mapjson files', () => {
		expect(stateFromGeoJSON(stateToGeoJSON({ ...state, frame: turned })).frame).toStrictEqual(turned);
		expect(stateFromKML(stateToKML({ ...state, frame: turned })).frame).toStrictEqual(turned);
		// KML looks at the area, else at the elements, and nowhere without both
		expect(stateToKML({ ...state, frame: turned })).toContain('<LookAt>');
		expect(stateToKML({ ...state, frame: { bearing: 90 } })).toContain('<LookAt>');
		expect(stateToKML({ elements: [], frame: { bearing: 90 } })).not.toContain('<LookAt>');
	});
});

describe('flat markers', () => {
	const marker = (style?: object): MapState => ({ elements: [{ type: 'marker', point: [13.4, 52.5], style }] });

	it('are kept in a link, and upright ones cost nothing', () => {
		expect(decodeState(encodeState(marker({ flat: true }))).elements[0].style).toStrictEqual({ flat: true });
		expect(decodeState(encodeState(marker({ flat: true, rotation: 45 }))).elements[0].style).toStrictEqual({
			flat: true,
			rotation: 45
		});
		// upright is the default: no more than a style without anything
		expect(encodeState(marker({ flat: false }))).toBe(encodeState(marker({})));
		expect(decodeState(encodeState(marker({ flat: false }))).elements[0].style?.flat).toBeUndefined();
	});

	it('are flat again after an upright one, e.g. in a list of markers', () => {
		const state: MapState = {
			elements: [
				{ type: 'marker', point: [13.4, 52.5], style: { flat: true } },
				{ type: 'marker', point: [13.5, 52.5] },
				{ type: 'marker', point: [13.6, 52.5], style: { flat: true, size: 2 } }
			]
		};
		expect(decodeState(encodeState(state)).elements.map((element) => element.style)).toStrictEqual([
			{ flat: true },
			undefined,
			{ flat: true, size: 2 }
		]);
	});

	it('are kept in GeoJSON and KML', () => {
		const state = marker({ flat: true });
		expect(stateToGeoJSON(state).features[0].properties?.['symbol-flat']).toBe(true);
		expect(stateToGeoJSON(marker()).features[0].properties).not.toHaveProperty('symbol-flat');
		expect(stateFromGeoJSON(stateToGeoJSON(state)).elements[0].style).toStrictEqual({ flat: true });
		expect(stateFromKML(stateToKML(state)).elements[0].style).toStrictEqual({ flat: true });
	});
});

describe('sanitizeBounds', () => {
	it('accepts only an area within the latitudes and longitudes of the map', () => {
		expect(sanitizeBounds([-10, -20, 10, 20])).toStrictEqual([-10, -20, 10, 20]);
		expect(sanitizeBounds([10, -20, -10, 20])).toBeUndefined();
		expect(sanitizeBounds([-10, 20, 10, -20])).toBeUndefined();
		expect(sanitizeBounds([-10, -95, 10, 20])).toBeUndefined();
		expect(sanitizeBounds([-190, -20, 10, 20])).toBeUndefined();
		expect(sanitizeBounds([0, 0, NaN, 1])).toBeUndefined();
		expect(sanitizeBounds(undefined)).toBeUndefined();
	});
});

describe('sanitizeFrame', () => {
	it('keeps the valid parts, without those that have their default value', () => {
		expect(sanitizeFrame({ bounds: [-10, -20, 10, 20] })).toStrictEqual({ bounds: [-10, -20, 10, 20] });
		expect(sanitizeFrame({ bounds: [10, -20, -10, 20], bearing: 45 })).toStrictEqual({ bearing: 45 });
		// viewers can move the map and zoom, but not rotate or tilt it
		expect(
			sanitizeFrame({ bearing: 0, pitch: 0, canPan: true, canZoom: true, canRotate: false, canTilt: false })
		).toBeUndefined();
		expect(sanitizeFrame({ canPan: false, canZoom: false, canRotate: true, canTilt: true })).toStrictEqual({
			canPan: false,
			canZoom: false,
			canRotate: true,
			canTilt: true
		});
		expect(sanitizeFrame({ bearing: 'east', pitch: null, canTilt: 'yes', canPan: 0 })).toBeUndefined();
		// zoom limits: from 0 to 22 in steps of 0.5, the least one not above the largest one
		expect(sanitizeFrame({ minZoom: 3.3, maxZoom: 12.76 })).toStrictEqual({ minZoom: 3.5, maxZoom: 13 });
		expect(sanitizeFrame({ minZoom: 14, maxZoom: 10 })).toStrictEqual({ minZoom: 10, maxZoom: 10 });
		// beyond the levels of a map: the nearest level; no number: no limit
		expect(sanitizeFrame({ minZoom: -1, maxZoom: 23 })).toStrictEqual({ minZoom: 0, maxZoom: 22 });
		expect(sanitizeFrame({ minZoom: 'far', maxZoom: null })).toBeUndefined();
		expect(sanitizeFrame({ minZoom: 0 })).toStrictEqual({ minZoom: 0 });
		// an embedded map leaves the wheel to its page, unless the frame says that it is free
		expect(sanitizeFrame({ scrollZoom: 'protected' })).toBeUndefined();
		expect(sanitizeFrame({ scrollZoom: 'locked' })).toBeUndefined();
		expect(sanitizeFrame({ scrollZoom: 'free' })).toStrictEqual({ scrollZoom: 'free' });
		expect(sanitizeFrame({})).toBeUndefined();
		expect(sanitizeFrame([-10, -20, 10, 20])).toBeUndefined();
		expect(sanitizeFrame(undefined)).toBeUndefined();
	});

	it('normalizes the rotation to (-180°, 180°] and limits the tilt', () => {
		expect(sanitizeFrame({ bearing: 270 })).toStrictEqual({ bearing: -90 });
		expect(sanitizeFrame({ bearing: -180 })).toStrictEqual({ bearing: 180 });
		expect(sanitizeFrame({ bearing: 360 })).toBeUndefined();
		expect(sanitizeFrame({ bearing: 12.5, pitch: 33.3 })).toStrictEqual({ bearing: 12.5, pitch: 33.3 });
		expect(sanitizeFrame({ pitch: 80 })).toStrictEqual({ pitch: 60 });
		expect(sanitizeFrame({ pitch: -5 })).toBeUndefined();
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
