import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { parseColor } from './color.js';
import { decodeState, encodeState, stateFromGeoJSON, stateFromMapJSON, type Bounds, type MapState } from './index.js';
import { sanitizeFrame } from './profile.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { FILL_PATTERN_NAMES, LABEL_POSITION_NAMES, DASH_NAMES, type Position, type StateStyle } from './types.js';

// Links that are cut off, changed or made up must either be refused quickly, or give a map that the
// editor can draw and the writer can write again: what a corrupt or hostile link can do.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Random numbers from a seed, so a failing case can be repeated (mulberry32). */
function random(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

const links = globSync('examples/*.mapjson')
	.sort()
	.map((file) => encodeState(stateFromMapJSON(JSON.parse(readFileSync(file, 'utf-8')))));

function checkPosition([lng, lat]: Position) {
	expect(Number.isFinite(lng)).toBe(true);
	expect(Math.abs(lat)).toBeLessThanOrEqual(90);
}

function checkStyle(style: StateStyle | undefined) {
	if (!style) return;
	for (const key of ['haloWidth', 'size', 'labelSize', 'width'] as const) {
		if (style[key] !== undefined) expect(Number.isFinite(style[key])).toBe(true);
	}
	if (style.pattern !== undefined) expect(FILL_PATTERN_NAMES).toContain(style.pattern);
	if (style.dash !== undefined) expect(DASH_NAMES).toContain(style.dash);
	if (style.labelPosition !== undefined) expect(LABEL_POSITION_NAMES).toContain(style.labelPosition);
	if (style.rotation !== undefined) {
		expect(style.rotation).toBeGreaterThan(-180);
		expect(style.rotation).toBeLessThanOrEqual(180);
	}
	for (const key of ['color', 'labelColor', 'haloColor'] as const) {
		if (style[key] !== undefined) expect(parseColor(style[key])).toBeDefined();
	}
}

/** A map that the editor can draw. */
function checkDrawable(state: MapState) {
	if (state.frame) expect(sanitizeFrame(state.frame)).toStrictEqual(state.frame);
	for (const element of state.elements) {
		checkStyle(element.style);
		if ('outlineStyle' in element) checkStyle(element.outlineStyle);
		switch (element.type) {
			case 'marker':
				checkPosition(element.point);
				break;
			case 'circle':
				checkPosition(element.point);
				expect(element.radius).toBeGreaterThanOrEqual(1);
				break;
			case 'line':
			case 'polygon':
				expect(element.points.length).toBeGreaterThanOrEqual(element.type === 'line' ? 2 : 3);
				element.points.forEach(checkPosition);
				break;
			default:
				throw new Error(`Unknown element: ${JSON.stringify(element)}`);
		}
	}
}

/** Decode the link: refused, or a map to draw and to write again. The longest time it took, in ms. */
function tryLink(link: string, slowest: { ms: number }) {
	const start = performance.now();
	let state: MapState | undefined;
	try {
		state = decodeState(link);
	} catch {
		// refused
	}
	slowest.ms = Math.max(slowest.ms, performance.now() - start);
	if (!state) return;
	checkDrawable(state);
	expect(() => encodeState(state)).not.toThrow();
}

// thousands of links: a few seconds each with coverage, five times as long on the runners of CI
describe('corrupt links', { timeout: 60_000 }, () => {
	it('are the examples, which are read', () => {
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) checkDrawable(decodeState(link));
	});

	it('cut off anywhere are refused or drawable', () => {
		const slowest = { ms: 0 };
		for (const link of links) {
			// about 200 places in each, from the start to the end
			const step = Math.max(1, Math.floor(link.length / 200));
			for (let length = 0; length < link.length; length += step) tryLink(link.slice(0, length), slowest);
		}
		expect(slowest.ms).toBeLessThan(2000);
	});

	it('cut off anywhere are refused: no map loses its last elements unnoticed', () => {
		for (const link of links) {
			for (let length = 0; length < link.length; length++) {
				expect(() => decodeState(link.slice(0, length)), `${length} of ${link.length}`).toThrow();
			}
		}
	});

	it('with anything after their end are refused, e.g. two links in a row', () => {
		for (const link of links) {
			expect(() => decodeState(link + 'A')).toThrow();
			expect(() => decodeState(link + link)).toThrow();
		}
		// the bits that fill the last character are zeros
		const writer = new StateWriter();
		writer.writeRoot({ elements: [] });
		const filled = (fill: boolean[]) => () => new StateReader([...writer.bits, ...fill]).readRoot();
		expect(filled([false, false, false, false, false])).not.toThrow();
		expect(filled([false, false, true])).toThrow(
			expect.objectContaining({ cause: expect.objectContaining({ message: 'Data after the end of the map' }) })
		);
		expect(filled([false, false, false, false, false, false])).toThrow();
	});

	it('with characters changed are refused or drawable', () => {
		const next = random(1);
		const slowest = { ms: 0 };
		for (const link of links) {
			for (let round = 0; round < 200; round++) {
				const chars = [...link];
				for (let n = 1 + Math.floor(next() * 3); n > 0; n--) {
					chars[Math.floor(next() * chars.length)] = BASE64[Math.floor(next() * 64)];
				}
				tryLink(chars.join(''), slowest);
			}
		}
		expect(slowest.ms).toBeLessThan(2000);
	});

	it('with a valid start and random bits after it are refused or drawable', () => {
		const next = random(2);
		const slowest = { ms: 0 };
		for (const link of links) {
			for (let round = 0; round < 200; round++) {
				const start = link.slice(0, 1 + Math.floor(next() * Math.min(link.length, 40)));
				const tail = Array.from({ length: Math.floor(next() * 200) }, () => BASE64[Math.floor(next() * 64)]);
				tryLink(start + tail.join(''), slowest);
			}
		}
		expect(slowest.ms).toBeLessThan(2000);
	});
});

// what the writer is given may be anything, e.g. from a script that uses the package
describe('the writer writes only what the reader reads', () => {
	const read = (state: unknown, resolution?: number) =>
		decodeState(encodeState(state as MapState, resolution ? { resolution } : {}));

	it('keeps the valid parts of invalid elements, and leaves out what cannot be drawn', () => {
		const state = {
			elements: [
				{ type: 'marker', point: [13, 52], style: { rotation: 200, size: 'big', color: 'no color' } },
				{
					type: 'polygon',
					points: [
						[1, 2],
						[3, 4],
						[5, 2]
					],
					style: { pattern: 'dots', patternScale: 9 }
				},
				{ type: 'line', points: [[1, 2]] },
				{
					type: 'polygon',
					points: [
						[1, 2],
						[3, 4]
					]
				},
				{ type: 'circle', point: [1, 2], radius: -5 },
				{ type: 'star', point: [1, 2] },
				{ type: 'marker', point: [13, Infinity] }
			],
			frame: { bounds: [10, 50, 5, 55], pitch: 500 },
			meta: { viewer: { search: 'somewhere' }, legend: 'yes' }
		};
		const result = read(state);
		expect(result.elements.map((element) => element.type)).toStrictEqual(['marker', 'polygon']);
		checkDrawable(result);
		// and again the same
		expect(read(result)).toStrictEqual(result);
	});

	it('keeps positions on the map at every accuracy, e.g. at the poles', () => {
		for (const resolution of [1, 100, 5000, 20000, 40000]) {
			const state: MapState = {
				elements: [
					{ type: 'marker', point: [0, 90] },
					{ type: 'marker', point: [179.99999, -90] },
					{ type: 'marker', point: [10, 91] },
					{
						type: 'line',
						points: [
							[-180, -89.99999],
							[180, 89.99999]
						]
					},
					{ type: 'circle', point: [0, -95], radius: 10 }
				]
			};
			const result = read(state, resolution);
			expect(result.elements).toHaveLength(5);
			checkDrawable(result);
		}
	});

	it('keeps a frame on the map at every accuracy, e.g. of the whole world or at its end', () => {
		const frames: Bounds[] = [
			[-180, -90, 180, 90],
			[179.9, 89.9, 180, 90],
			[-180, -90, -179.9, -89.9],
			[179.99998, 89.99998, 180, 90]
		];
		for (const bounds of frames) {
			for (const resolution of [1, 100, 5000, 20000, 40000]) {
				const result = read({ elements: [], frame: { bounds } }, resolution);
				expect(result.frame?.bounds, `${bounds} at ${resolution} m`).toBeDefined();
				checkDrawable(result);
			}
		}
	});

	it('reads a latitude beyond a pole as the pole, from a file of any format, and keeps longitudes', () => {
		const marker = { type: 'marker', point: [500, 95] };
		const line = {
			type: 'line',
			points: [
				[170, -91],
				[190, 10]
			]
		};
		const expected = [
			{ type: 'marker', point: [500, 90] },
			{
				type: 'line',
				points: [
					[170, -90],
					[190, 10]
				]
			}
		];
		expect(stateFromMapJSON({ elements: [marker, line] }).elements).toStrictEqual(expected);
		const geojson = {
			type: 'FeatureCollection',
			features: [
				{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: marker.point } },
				{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.points } }
			]
		};
		const read = stateFromGeoJSON(geojson as never).elements;
		expect(read.map((element) => ('point' in element ? element.point : element.points))).toStrictEqual([
			[500, 90],
			[
				[170, -90],
				[190, 10]
			]
		]);
		checkDrawable(decodeState(encodeState({ elements: read })));
	});

	it('keeps of the options of a background only what JSON can hold, so the link can be read', () => {
		const background = (options: unknown) => ({ elements: [], meta: { background: { theme: 'gray', options } } });
		// nothing is left of these
		for (const options of [{ a: undefined }, { a() {} }, { toJSON: () => 'x' }, { a: 1n }, {}, [1], 'x']) {
			expect(read(background(options)).meta).toStrictEqual({ background: { theme: 'gray' } });
		}
		// and of these what JSON has
		const mixed = { sky: false, a: undefined, list: [1, undefined], date: new Date(0) };
		expect(read(background(mixed)).meta?.background?.options).toStrictEqual({
			sky: false,
			list: [1, null],
			date: '1970-01-01T00:00:00.000Z'
		});
		// the only setting of a background
		expect(read({ elements: [], meta: { background: { options: { a: undefined } } } }).meta).toBeUndefined();
		expect(stateFromMapJSON(background({ a: undefined })).meta).toStrictEqual({ background: { theme: 'gray' } });
	});

	it('refuses a number that does not fit its bits instead of writing another one', () => {
		expect(() => new StateWriter().writeInteger(64, 6)).toThrow('64 does not fit 6 bits');
		expect(() => new StateWriter().writeInteger(-1, 6)).toThrow();
		expect(() => new StateWriter().writeInteger(63, 6)).not.toThrow();
	});
});
