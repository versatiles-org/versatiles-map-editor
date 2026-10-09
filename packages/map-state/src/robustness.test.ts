import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { parseColor } from './color.js';
import {
	decodeState,
	encodeState,
	stateFromGeoJSON,
	stateFromMapJSON,
	type Bounds,
	type MapState,
	stateToGeoJSON,
	stateToMapJSON
} from './index.js';
import { sanitizeFrame } from './profile.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { styleFields, styleRemoveKey } from './style_history.js';
import { BACKGROUND_KEYS, END_KEY, KEY_PARAMETERS, LEGEND_KEYS, METADATA_KEYS, VIEWER_KEYS } from './constants.js';
import {
	FILL_PATTERN_NAMES,
	LABEL_POSITION_NAMES,
	LIMITS,
	DASH_NAMES,
	type Position,
	type StateStyle
} from './types.js';

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

	it('keeps a small size as the smallest one, not as none', () => {
		const state: MapState = {
			elements: [
				{ type: 'marker', point: [0, 0], label: 'A', style: { size: 0.04, labelSize: 0.01 } },
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					style: { arrowEnd: 'triangle', arrowSize: 0.04 }
				}
			]
		};
		const once = read(state);
		expect(once.elements.map((element) => element.style)).toStrictEqual([
			{ size: 0.1, labelSize: 0.1 },
			{ arrowEnd: 'triangle', arrowSize: 0.1 }
		]);
		// and it stays so
		expect(read(once)).toStrictEqual(once);
		// a link with a size of 0 is none of this format
		for (const field of ['size', 'labelSize'] as const) {
			const writer = new StateWriter();
			writer.writeExpGolomb(0, 0); // no reference
			writer.writeExpGolomb(styleFields('marker').find(({ name }) => name === field)!.key, 0);
			writer.writeVarint(0);
			writer.writeExpGolomb(0, 0); // end
			expect(() => new StateReader(writer.bits).readStyle('marker')).toThrow(
				expect.objectContaining({ cause: expect.objectContaining({ message: 'A size of 0' }) })
			);
		}
	});

	it('has no field of a style with its default, whatever a map is read from', () => {
		const state: MapState = {
			meta: {
				legend: {
					entries: [{ type: 'area', style: { color: '#ff000040' }, outlineStyle: { visible: true }, label: 'A' }]
				}
			},
			elements: [
				{
					type: 'marker',
					point: [0, 0],
					style: { color: '#ff0000', size: 1, flat: false, symbol: 'extras:pin-teardrop' }
				},
				{ type: 'marker', point: [0, 0], style: { color: '#FF0000', size: 2 } },
				// rounded to its default by a link
				{ type: 'marker', point: [0, 0], style: { size: 1.04 } },
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					style: { width: 2, dash: 'solid', arrowEnd: 'none' }
				},
				{ type: 'circle', point: [0, 0], radius: 5, style: { pattern: 'solid' }, outlineStyle: { visible: true } }
			]
		};
		const expected: MapState = {
			meta: { legend: { entries: [{ type: 'area', label: 'A' }] } },
			elements: [
				{ type: 'marker', point: [0, 0] },
				{ type: 'marker', point: [0, 0], style: { size: 2 } },
				{ type: 'marker', point: [0, 0] },
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					]
				},
				{ type: 'circle', point: [0, 0], radius: 5 }
			]
		};
		expect(read(state)).toStrictEqual(expected);
		// a file keeps the size that a link rounds
		const file = stateFromMapJSON(stateToMapJSON(state));
		expect(file.elements[2]).toStrictEqual({ type: 'marker', point: [0, 0], style: { size: 1.04 } });
		expect({
			...file,
			elements: file.elements.map((element, i) => (i === 2 ? expected.elements[2] : element))
		}).toStrictEqual(expected);
		expect(stateFromGeoJSON(stateToGeoJSON(state)).elements).toStrictEqual(file.elements);
		// and what is read is written as the same again
		expect(read(read(state))).toStrictEqual(read(state));
	});

	it('refuses a number that does not fit its bits instead of writing another one', () => {
		expect(() => new StateWriter().writeInteger(64, 6)).toThrow('64 does not fit 6 bits');
		expect(() => new StateWriter().writeInteger(-1, 6)).toThrow();
		expect(() => new StateWriter().writeInteger(63, 6)).not.toThrow();
	});
});

// One way to write a map: what the writer does not write, the reader does not read. Anything that
// it read would have to be read for good.
describe('the reader refuses what the writer never writes', () => {
	/** The innermost error of reading what `write` wrote with a writer and reads with a reader. */
	function refusal(write: (writer: StateWriter) => void, read: (reader: StateReader) => unknown): string {
		const writer = new StateWriter();
		write(writer);
		try {
			read(new StateReader(writer.bits));
		} catch (error) {
			let inner = error as Error;
			while (inner.cause instanceof Error) inner = inner.cause;
			return inner.message;
		}
		return 'read';
	}
	const key = (writer: StateWriter, list: keyof typeof KEY_PARAMETERS, value: number) =>
		writer.writeKey(value, KEY_PARAMETERS[list]);

	it('a number with a group that adds nothing', () => {
		// 0 and 5, each with a second group of zeros
		for (const value of [0, 5]) {
			const padded = (writer: StateWriter) => {
				writer.writeInteger(value, 5);
				writer.writeBit(true);
				writer.writeInteger(0, 5);
				writer.writeBit(false);
			};
			expect(refusal(padded, (reader) => reader.readVarint())).toBe('Varint with a needless group');
		}
		expect(() => decodeState('oAAAgAAAw')).toThrow();
		// what the writer writes is read, also numbers with several groups
		for (const value of [0, 31, 32, 1023, 1024, 2 ** 40]) {
			expect(
				refusal(
					(writer) => writer.writeVarint(value),
					(reader) => reader.readVarint()
				)
			).toBe('read');
		}
	});

	it('a key twice in a list', () => {
		const twice = (list: keyof typeof KEY_PARAMETERS, flag: number, read: (reader: StateReader) => unknown) =>
			refusal((writer) => {
				key(writer, list, flag);
				key(writer, list, flag);
				key(writer, list, END_KEY);
			}, read);
		expect(twice('viewer', VIEWER_KEYS.reset, (reader) => reader.readViewer())).toBe(
			`The key ${VIEWER_KEYS.reset} twice in the viewer`
		);
		expect(twice('legend', LEGEND_KEYS.bold, (reader) => reader.readLegend())).toBe(
			`The key ${LEGEND_KEYS.bold} twice in the legend`
		);
		expect(twice('background', BACKGROUND_KEYS.hillshade, (reader) => reader.readBackground())).toBe(
			`The key ${BACKGROUND_KEYS.hillshade} twice in the background`
		);
		// a field of a style, set twice or removed without being there
		const flat = styleFields('marker').find(({ name }) => name === 'flat')!.key;
		const style = (keys: number[]) =>
			refusal(
				(writer) => {
					writer.writeExpGolomb(0, 0); // no reference
					for (const k of [...keys, END_KEY]) writer.writeExpGolomb(k, 0);
				},
				(reader) => reader.readStyle('marker')
			);
		expect(style([flat])).toBe('read');
		expect(style([flat, flat])).toBe(`The key ${flat} twice in a style`);
		expect(style([styleRemoveKey('marker'), flat])).toBe('A field removed that the style has not: flat');
	});

	it('a frame, metadata, a viewer or a style without anything, and a legend without its entries', () => {
		const empty = (list: keyof typeof KEY_PARAMETERS, read: (reader: StateReader) => unknown, bits = 0) =>
			refusal((writer) => {
				for (let i = 0; i < bits; i++) writer.writeBit(i === 0);
				key(writer, list, END_KEY);
			}, read);
		// the bit "a frame", the bit "no area"
		expect(empty('frame', (reader) => reader.readFrame(), 2)).toBe('A frame without anything');
		expect(empty('metadata', (reader) => reader.readMetadata(), 1)).toBe('Metadata without anything');
		expect(empty('viewer', (reader) => reader.readViewer())).toBe('A viewer without settings');
		expect(empty('legend', (reader) => reader.readLegend())).toBe('A legend without its entries');
		const style = refusal(
			(writer) => {
				writer.writeExpGolomb(0, 0); // no reference
				writer.writeExpGolomb(END_KEY, 0);
			},
			(reader) => reader.readStyle('line')
		);
		expect(style).toBe('A style without fields');
	});

	it('a zoom limit beyond the levels, or a least one above the largest one', () => {
		const limits = (min: number, max: number) =>
			refusal(
				(writer) => {
					key(writer, 'viewer', VIEWER_KEYS.minZoom);
					writer.writeInteger(min * 2, 6);
					key(writer, 'viewer', VIEWER_KEYS.maxZoom);
					writer.writeInteger(max * 2, 6);
					key(writer, 'viewer', END_KEY);
				},
				(reader) => reader.readViewer()
			);
		expect(limits(3, 22)).toBe('read');
		expect(limits(3, 22.5)).toBe('Invalid zoom level: 22.5');
		expect(limits(12, 10)).toBe('A least zoom above the largest one');
	});

	it('an empty text, e.g. a title, a label or a popup of spaces', () => {
		const text = (value: string, read: (reader: StateReader) => unknown, write: (writer: StateWriter) => void) =>
			refusal(
				(writer) => {
					writer.writeStringTable([value]);
					write(writer);
				},
				(reader) => {
					reader.readStringTable();
					return read(reader);
				}
			);
		for (const [value, result] of [
			['', 'An empty title'],
			['  ', 'An empty title'],
			['A', 'read']
		]) {
			const title = text(
				value,
				(reader) => reader.readMetadata(),
				(writer) => {
					writer.writeBit(true);
					key(writer, 'metadata', METADATA_KEYS.title);
					writer.writeStringRef(value);
					key(writer, 'metadata', END_KEY);
				}
			);
			expect(title, JSON.stringify(value)).toBe(result);
		}
		// and the writer leaves them out
		const blank: MapState = {
			meta: { title: '  ' },
			elements: [{ type: 'marker', point: [0, 0], label: ' \n ', popup: { text: '\t' } }]
		};
		expect(decodeState(encodeState(blank))).toStrictEqual({ elements: [{ type: 'marker', point: [0, 0] }] });
		expect(stateFromMapJSON(blank)).toStrictEqual({ elements: [{ type: 'marker', point: [0, 0] }] });
	});

	it('a number beyond the largest one, which the writer brings into its range', () => {
		const huge: MapState = {
			meta: { background: { labelSize: 1e20, haloWidth: 1e20 } },
			elements: [
				{ type: 'marker', point: [4.4e10, 10], label: 'A', style: { size: 1e300, labelSize: 1e9, haloWidth: 1e12 } },
				{
					type: 'line',
					points: [
						[-1e6, 0],
						[10, 10]
					],
					style: { width: 1e20, arrowEnd: 'triangle', arrowSize: 1e9 }
				},
				{ type: 'circle', point: [0, 0], radius: 1e20, outlineStyle: { width: 5000 } }
			]
		};
		const limited: MapState = {
			meta: { background: { labelSize: LIMITS.size, haloWidth: LIMITS.width } },
			elements: [
				{
					type: 'marker',
					point: [LIMITS.longitude, 10],
					label: 'A',
					style: { size: LIMITS.size, labelSize: LIMITS.size, haloWidth: LIMITS.width }
				},
				{
					type: 'line',
					points: [
						[-LIMITS.longitude, 0],
						[10, 10]
					],
					style: { width: LIMITS.width, arrowEnd: 'triangle', arrowSize: LIMITS.size }
				},
				{ type: 'circle', point: [0, 0], radius: LIMITS.radius, outlineStyle: { width: LIMITS.width } }
			]
		};
		expect(decodeState(encodeState(huge))).toStrictEqual(limited);
		expect(stateFromMapJSON(huge)).toStrictEqual(limited);
		// on a coarse grid too, where rounding must not leave the range
		for (const resolution of [100, 5000, 20000, 40000]) {
			const state = decodeState(encodeState(huge, { resolution }));
			expect(state.elements).toHaveLength(3);
			checkDrawable(state);
		}
		// and the reader refuses them
		const style = (name: 'size' | 'width' | 'haloWidth', role: 'marker' | 'line', tenths: number) =>
			refusal(
				(writer) => {
					writer.writeExpGolomb(0, 0); // no reference
					writer.writeExpGolomb(styleFields(role).find((field) => field.name === name)!.key, 0);
					writer.writeVarint(tenths);
					writer.writeExpGolomb(END_KEY, 0);
				},
				(reader) => reader.readStyle(role)
			);
		expect(style('size', 'marker', LIMITS.size * 10)).toBe('read');
		expect(style('size', 'marker', LIMITS.size * 10 + 1)).toBe('A size beyond the largest one: 100.1');
		expect(style('width', 'line', LIMITS.width * 10)).toBe('read');
		expect(style('width', 'line', LIMITS.width * 10 + 1)).toBe('A width beyond the largest one: 1000.1');
		expect(style('haloWidth', 'marker', LIMITS.width * 10 + 1)).toBe('A width beyond the largest one: 1000.1');
	});

	it('a symbol that is no name of an image', () => {
		const symbol = (name: string) =>
			refusal(
				(writer) => {
					writer.writeStringTable([], [name]);
					writer.writeStyle('marker', { symbol: name });
				},
				(reader) => {
					reader.readStringTable();
					return reader.readStyle('marker');
				}
			);
		expect(symbol('icons:anchor')).toBe('read');
		expect(symbol('')).toBe('read');
		expect(symbol('anchor')).toBe('Invalid symbol: anchor');
	});
});
