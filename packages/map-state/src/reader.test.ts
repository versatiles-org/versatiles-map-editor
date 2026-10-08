import { describe, it, expect } from 'vitest';
import { StateReader } from './reader.js';
import type { StateLegend, StateMetadata, MapState, StateStyle, StateViewer } from './types.js';
import { StateWriter } from './writer.js';
import { decodeState, encodeState } from './index.js';

describe('StateReader', () => {
	const path: [number, number][] = [
		[13.37097, 52.51837],
		[13.36962, 52.51568],
		[13.35131, 52.51452],
		[13.35089, 52.51477],
		[13.3504, 52.51507],
		[13.3496, 52.51507],
		[13.34912, 52.51477],
		[13.34899, 52.5144],
		[13.34918, 52.51409],
		[13.3496, 52.51391],
		[13.35021, 52.51379],
		[13.35119, 52.50952],
		[13.35192, 52.50671]
	];

	describe('fromBase64', () => {
		it('should create a StateReader instance from a valid base64 string', () => {
			function test(base64: string): number[] {
				const reader = StateReader.fromBase64(base64);
				const values = [];
				for (let i = 0; i < base64.length; i++) values.push(reader.readInteger(6));
				expect(reader.ended()).toBe(true);
				return values;
			}
			expect(test('A')).toStrictEqual([0]);
			expect(test('B')).toStrictEqual([1]);
			expect(test('ABCEIQg89-_')).toStrictEqual([0, 1, 2, 4, 8, 16, 32, 60, 61, 62, 63]);
		});

		it('should throw an error for an invalid base64 string', () => {
			const base64 = '#'; // Invalid character
			expect(() => StateReader.fromBase64(base64)).toThrowError('Invalid character in base64 string: #');
		});
	});

	describe('readBit', () => {
		it('should read a single bit and increment the offset', () => {
			const reader = StateReader.fromBitString('0101');
			expect(reader.readBit()).toBe(false);
			expect(reader.readBit()).toBe(true);
			expect(reader.readBit()).toBe(false);

			expect(reader.ended()).toBe(false);
			expect(reader.readBit()).toBe(true);

			expect(reader.ended()).toBe(true);
			expect(() => reader.readBit()).toThrowError('End of bits');
		});
	});

	describe('readInteger', () => {
		it('should read an unsigned integer', () => {
			function test(bits: string): number {
				const reader = StateReader.fromBitString(bits);
				const value = reader.readInteger(bits.length);
				expect(reader.ended()).toBe(true);
				return value;
			}
			expect(test('0000')).toBe(0);
			expect(test('0001')).toBe(1);
			expect(test('0011')).toBe(3);
			expect(test('0111')).toBe(7);
			expect(test('1000')).toBe(8);
			expect(test('1100')).toBe(12);
			expect(test('1110')).toBe(14);
			expect(test('1111')).toBe(15);
		});

		it('should read integer from writer correctly', () => {
			function test(value: number, bits: number) {
				const writer = new StateWriter();
				writer.writeInteger(value, bits);
				const reader = new StateReader(writer.bits);
				expect(reader.readInteger(bits)).toBe(value);
				expect(reader.ended()).toBe(true);
			}
			test(0, 4);
			test(1, 4);
			test(3, 4);
			test(7, 4);
			test(14, 4);
			test(15, 4);
			test(255, 8);
		});
	});

	describe('readVarint', () => {
		it('should read an unsigned varint', () => {
			function test(bits: string): number {
				const reader = StateReader.fromBitString(bits);
				const value = reader.readVarint();
				expect(reader.ended()).toBe(true);
				return value;
			}
			expect(test('000000')).toBe(0);
			expect(test('000010')).toBe(1);
			expect(test('000100')).toBe(2);
			expect(test('001000')).toBe(4);
			expect(test('010000')).toBe(8);
			expect(test('100000')).toBe(16);
			expect(test('000001000010')).toBe(32);
		});

		it('should read a signed varint', () => {
			function test(bits: string): number {
				const reader = StateReader.fromBitString(bits);
				const value = reader.readVarint(true);
				expect(reader.ended()).toBe(true);
				return value;
			}
			expect(test('111110')).toBe(-16);
			expect(test('011110')).toBe(-8);
			expect(test('001110')).toBe(-4);
			expect(test('000110')).toBe(-2);
			expect(test('000010')).toBe(-1);
			expect(test('000000')).toBe(0);
			expect(test('000100')).toBe(1);
			expect(test('001000')).toBe(2);
			expect(test('010000')).toBe(4);
			expect(test('100000')).toBe(8);

			expect(test('111111000010')).toBe(-32);
			expect(test('000001000010')).toBe(16);
			expect(test('000001000100')).toBe(32);
		});

		it('should read varint from writer correctly', () => {
			function test(value: number, signed?: true) {
				const writer = new StateWriter();
				writer.writeVarint(value, signed);
				const reader = new StateReader(writer.bits);
				expect(reader.readVarint(signed)).toBe(value);
				expect(reader.ended()).toBe(true);
			}
			test(0);
			test(1);
			test(65535);
			test(65536);
			test(65535, true);
			test(65536, true);
			test(-65535, true);
			test(-65536, true);
			test(Number.MAX_SAFE_INTEGER);
		});

		it('should refuse a varint beyond the safe integers', () => {
			// 11 groups of 5 bits: up to 2^55
			const bits = Array.from({ length: 11 }, (_, i) => '11111' + (i < 10 ? '1' : '0')).join('');
			expect(() => StateReader.fromBitString(bits).readVarint()).toThrow(
				expect.objectContaining({ cause: expect.objectContaining({ message: 'Varint beyond the safe integers' }) })
			);
		});
	});

	describe('readArray', () => {
		it('should read an array of elements', () => {
			const reader = StateReader.fromBitString('000110110');
			const array = reader.readArray(() => reader.readBit());
			expect(array).toEqual([true, true, false]);
			expect(reader.ended()).toBe(true);
		});
	});

	describe('readPoint', () => {
		it('should read a point with default level', () => {
			expect(StateReader.fromBitString('000000000000').readPoint(1e5)).toStrictEqual([0, 0]);
			expect(StateReader.fromBitString('001111010110100111001010').readPoint(1e5)).toStrictEqual([-180, -90]);
			expect(StateReader.fromBitString('010001010110101001001010').readPoint(1e5)).toStrictEqual([180, 90]);
		});

		it('should write and read points correctly', () => {
			function test(x: number, y: number, bits: number) {
				const writer = new StateWriter();
				writer.writePoint([x, y], bits);
				const reader = new StateReader(writer.bits);
				const point = reader.readPoint(bits);
				expect(reader.ended()).toBe(true);
				return point;
			}
			expect(test(-180, -90, 1e4)).toStrictEqual([-180, -90]);
			expect(test(180, 90, 1e4)).toStrictEqual([180, 90]);

			expect(test(0.4, 3.1, 1e4)).toStrictEqual([0.4, 3.1]);
		});
	});

	describe('readMetadata', () => {
		function test(metadata0: StateMetadata | undefined, expected: string) {
			const writer = new StateWriter();
			writer.writeMetadata(metadata0);
			expect(writer.asBase64()).toBe(expected);

			const reader = new StateReader(writer.bits);

			const metadata1 = reader.readMetadata();
			if (JSON.stringify(metadata0) == '{}') metadata0 = undefined;
			expect(metadata1).toStrictEqual(metadata0);

			expect(reader.ended()).toBe(true);
		}
		it('should read undefined metadata correctly', () => {
			test(undefined, 'A');
		});
		it('should read empty metadata correctly', () => {
			test({}, 'A');
		});
	});

	describe('readRoot', () => {
		it('should reject unknown element keys', () => {
			const writer = new StateWriter();
			writer.writeInteger(1, 3); // version
			writer.writeVarint(0); // no colors
			writer.writeVarint(0); // no strings
			writer.writeInteger(0, 4); // the step of the coordinates: 0.00001°
			writer.writeVarint(0, true); // the origin
			writer.writeVarint(0, true);
			writer.writeBit(false); // one parameter for longitude and latitude
			writer.writeInteger(0, 5); // the parameter of the code of the coordinates
			writer.writeBit(false); // the points of markers and circles from the origin
			writer.writeBit(false); // no frame
			writer.writeBit(false); // no metadata
			writer.writeBit(true); // elements may have popups
			writer.writeInteger(5, 3); // unknown element key
			writer.writeInteger(0, 3);

			const reader = StateReader.fromBase64(writer.asBase64());
			expect(() => reader.readRoot()).toThrow(
				expect.objectContaining({ cause: expect.objectContaining({ message: 'Unknown element key: 5' }) })
			);
		});

		it('should read a root state', () => {
			// version 1, no colors, no strings, the resolution, the origin, one parameter of the code
			// of the coordinates, points from the origin, no frame, no metadata, no popups, no elements
			const reader = StateReader.fromBitString(
				'001' + '000000' + '000000' + '0010' + '100000' + '000000' + '0' + '00000' + '0' + '0' + '0' + '0'
			);
			const root = reader.readRoot();
			expect(root).toStrictEqual({ elements: [] });
			expect(reader.ended()).toBe(true);
		});

		it('should read a simple root state', () => {
			const root = {
				elements: [
					{
						type: 'marker',
						point: [3, 4]
					}
				]
			} as MapState;

			const writer = new StateWriter();
			writer.writeRoot(root);
			expect(writer.asBitString()).toBe('001000000000000000011000110010000000111001000000000000011100');

			const reader = new StateReader(writer.bits);
			expect(reader.readRoot()).toStrictEqual(root);
		});

		it('should read a root object correctly', () => {
			const root: MapState = {
				elements: [
					{
						type: 'marker',
						point: [3, 4],
						style: { haloWidth: 1.2, size: 3.4, color: '#ff0000' }
					},
					{
						type: 'line',
						points: [
							[5, 6],
							[7, 8]
						]
					},
					{
						type: 'polygon',
						points: path,
						style: { pattern: 'dots', patternScale: 1.5, color: '#0000ff64' },
						strokeStyle: { dash: 'dotted', width: 0.8, color: '#ffff00' }
					},
					{
						type: 'circle',
						point: [9, 10],
						radius: 12345,
						style: { color: '#111111' },
						strokeStyle: { color: '#222222' }
					}
				]
			};
			const writer = new StateWriter();
			writer.writeRoot(root);
			expect(writer.asBase64()).toBe(
				'JT_AAAAAD_sj__wAERERCIiIgAGzhUwlDgQAP1y8AASgmf1OKEJYiEAAm8rwABD7x8AGGwAAGGwANoAD9AiAAEoIWmNKZDs1Z9Oy4bxH4Dfu5nJpr3Uo_qXUQ9VEisWkziPdNoFEoAE8qAABvdD-YbGidFg'
			);
			const reader = new StateReader(writer.bits);
			expect(reader.readRoot()).toStrictEqual(root);
			expect(reader.ended()).toBe(true);
		});
	});

	describe('readStyle', () => {
		it('should read a style object', () => {
			// no reference to an earlier style (Exp-Golomb: 1), then the halo of a marker (key 8, 0.1 as 1) and the end (key 0)
			const reader = StateReader.fromBitString('1' + '0001001' + '000010' + '1');
			const style = reader.readStyle('marker');
			expect(style).toStrictEqual({ haloWidth: 0.1 });
			expect(reader.ended()).toBe(true);
		});

		it('should read a style correctly', () => {
			const marker: StateStyle = {
				haloWidth: 1.5,
				rotation: -45,
				size: 2.5,
				labelPosition: 'bottom',
				color: '#c400ff42'
			};
			const outline: StateStyle = { dash: 'dashed', width: 2.3, visible: false, color: '#c400ff42' };
			const writer = new StateWriter();
			// the palette of the colors, which the styles refer to
			writer.writePalette(['#c400ff42']);
			writer.writeStyle('marker', marker);
			writer.writeStyle('outline', outline);
			expect(writer.asBase64()).toBe('CYgB_0Kp8hBAl4ZmJq7iFCg');

			const reader = new StateReader(writer.bits);
			reader.readPalette();
			expect(reader.readStyle('marker')).toStrictEqual(marker);
			expect(reader.readStyle('outline')).toStrictEqual(outline);
			expect(reader.ended()).toBe(true);
		});
	});

	describe('readColor', () => {
		it('should read a color', () => {
			const reader = StateReader.fromBitString(['00000000', '01111011', '11111111', '1', '00110011'].join(''));
			const color = reader.readColor();
			expect(color).toBe('#007bff33');
			expect(reader.ended()).toBe(true);
		});
		it('should write and read a RGB color', () => {
			const color = '#123456';
			const writer = new StateWriter();
			writer.writeColor(color);
			expect(writer.asBitString()).toBe('0001001000110100010101100');

			const reader = new StateReader(writer.bits);
			expect(reader.readColor()).toBe(color);
			expect(reader.ended()).toBe(true);
		});
		it('should write and read a RGBA color', () => {
			const color = '#12345678';
			const writer = new StateWriter();
			writer.writeColor(color);
			expect(writer.asBitString()).toBe('000100100011010001010110101111000');

			const reader = new StateReader(writer.bits);
			expect(reader.readColor()).toBe(color);
			expect(reader.ended()).toBe(true);
		});
	});

	describe('big hashes', () => {
		it('should return demo route', () => {
			const reader = StateReader.fromBase64(
				'ISqAAAIAniYwRbIEOHuiK5hDOIaioOCaCSQcUZcpUO11nwbzxrkTgeG3mcGsydKj-JlSD0f4q9q5QojnJmOogTwkSHTsyAtOGtIdiCDYBAWHasTq1I'
			);
			expect(reader.readRoot()).toStrictEqual({
				elements: [
					{
						points: [
							[expect.closeTo(13.37106, 5), expect.closeTo(52.51842, 5)],
							[expect.closeTo(13.36966, 5), expect.closeTo(52.51575, 5)],
							[expect.closeTo(13.3513, 5), expect.closeTo(52.51459, 5)],
							[expect.closeTo(13.35097, 5), expect.closeTo(52.51489, 5)],
							[expect.closeTo(13.3504, 5), expect.closeTo(52.51512, 5)],
							[expect.closeTo(13.34966, 5), expect.closeTo(52.51511, 5)],
							[expect.closeTo(13.34917, 5), expect.closeTo(52.51483, 5)],
							[expect.closeTo(13.34904, 5), expect.closeTo(52.5145, 5)],
							[expect.closeTo(13.34926, 5), expect.closeTo(52.51413, 5)],
							[expect.closeTo(13.34967, 5), expect.closeTo(52.51395, 5)],
							[expect.closeTo(13.35027, 5), expect.closeTo(52.51382, 5)],
							[expect.closeTo(13.35127, 5), expect.closeTo(52.50957, 5)],
							[expect.closeTo(13.3519, 5), expect.closeTo(52.50677, 5)]
						],
						style: {
							color: '#aa0000',
							width: 5
						},
						type: 'line'
					},
					{
						point: [expect.closeTo(13.35139, 5), expect.closeTo(52.50655, 5)],
						label: 'End',
						style: {
							labelPosition: 'left',
							color: '#aa0000'
						},
						type: 'marker'
					},
					{
						point: [expect.closeTo(13.37097, 5), expect.closeTo(52.51871, 5)],
						label: 'Start',
						style: {
							labelPosition: 'left',
							color: '#aa0000'
						},
						type: 'marker'
					},
					{
						points: [
							[expect.closeTo(13.37383, 5), expect.closeTo(52.51794, 5)],
							[expect.closeTo(13.37379, 5), expect.closeTo(52.51926, 5)],
							[expect.closeTo(13.3718, 5), expect.closeTo(52.51926, 5)],
							[expect.closeTo(13.37115, 5), expect.closeTo(52.51794, 5)]
						],
						strokeStyle: {
							color: '#aa0000',
							width: 1
						},
						style: {
							color: '#aa0000',
							pattern: 'diagonal-down'
						},
						type: 'polygon'
					}
				]
			});
		});
	});
});

describe('popups', () => {
	it('cost no bit per element in a map without any', () => {
		const markers = (count: number, popup: boolean): MapState['elements'] =>
			Array.from({ length: count }, (_, i) => ({
				type: 'marker',
				point: [0, 0],
				...(popup && i === 0 ? { popup: { text: 'x' } } : {})
			}));
		const bits = (elements: MapState['elements']) => {
			const writer = new StateWriter();
			writer.writeRoot({ elements });
			return writer.bits.length;
		};
		// with one popup, each other marker has a bit for it; without, none has
		const withPopup = bits(markers(21, true)) - bits(markers(1, true));
		const without = bits(markers(21, false)) - bits(markers(1, false));
		expect(withPopup - without).toBe(20);
		for (const popup of [false, true]) {
			expect(decodeState(encodeState({ elements: markers(5, popup) })).elements).toStrictEqual(markers(5, popup));
		}
	});

	const text = 'Line 1\n**bold** [link](https://example.org) äöü € 🗺️';

	it('round-trip for all element types', () => {
		const state: MapState = {
			elements: [
				{ type: 'marker', point: [1, 2], popup: { text } },
				{
					type: 'line',
					points: [
						[1, 2],
						[3, 4]
					],
					popup: { text: 'line' }
				},
				{
					type: 'polygon',
					points: [
						[1, 2],
						[3, 4],
						[5, 2]
					],
					popup: { text: 'polygon' }
				},
				{ type: 'circle', point: [1, 2], radius: 100, popup: { text: 'circle' } },
				{ type: 'marker', point: [1, 2] }
			]
		};
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('skip empty popups', () => {
		const state: MapState = { elements: [{ type: 'marker', point: [1, 2], popup: { text: '' } }] };
		expect(decodeState(encodeState(state))).toStrictEqual({ elements: [{ type: 'marker', point: [1, 2] }] });
	});

	it('reject unknown popup fields', () => {
		const writer = new StateWriter();
		writer.writeInteger(15, 4);
		expect(() => new StateReader([true, ...writer.bits]).readPopup()).toThrow('Error reading popup');
	});
});

describe('background', () => {
	it('round-trips its settings, and any options of @versatiles/style', () => {
		const state: MapState = {
			meta: {
				background: {
					base: 'satellite',
					theme: 'gray-dark',
					streets: false,
					borders: false,
					labels: 'fewer',
					language: 'de',
					font: 'lato_regular',
					labelSize: 1.5,
					haloWidth: 0.5,
					colors: { saturation: -0.5, black: 0.2, white: 0.9 },
					hillshade: true,
					terrain: true,
					buildings: 'extruded',
					options: { osmOverlay: { text: { spacing: 1.5 } }, features: { terrain: { exaggeration: 2 } } }
				}
			},
			elements: []
		};
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('is stored without the settings that have their default, and not at all with only those', () => {
		const defaults: MapState = {
			meta: {
				background: {
					base: 'vector',
					theme: 'colorful',
					streets: true,
					borders: true,
					labels: 'normal',
					language: 'user',
					font: 'noto_sans_regular',
					labelSize: 1,
					haloWidth: 2,
					colors: { saturation: 0, black: 0, white: 1 },
					hillshade: false,
					terrain: false,
					buildings: 'flat',
					options: {}
				}
			},
			elements: []
		};
		expect(encodeState(defaults)).toBe(encodeState({ elements: [] }));
		const some: MapState = {
			meta: { background: { ...defaults.meta!.background, theme: 'gray', haloWidth: 1 } },
			elements: []
		};
		expect(decodeState(encodeState(some)).meta).toStrictEqual({ background: { theme: 'gray', haloWidth: 1 } });
		// the halo of the labels over the imagery is 1 pixel wide by default
		const imagery: MapState = { meta: { background: { base: 'satellite', haloWidth: 1 } }, elements: [] };
		expect(decodeState(encodeState(imagery)).meta).toStrictEqual({ background: { base: 'satellite' } });
	});

	it('stores a theme and a language of its lists as their index, others as text', () => {
		const strings = (background: MapState['meta'] & object) => {
			const reader = StateReader.fromBase64(encodeState({ meta: background, elements: [] }));
			reader.readInteger(3);
			reader.readPalette();
			return reader.readStringTable();
		};
		expect(strings({ background: { theme: 'gray-dark', language: 'de', labels: 'fewer' } })).toStrictEqual([]);
		// e.g. of a newer version of @versatiles/style, and a language that the tiles may have
		const newer: MapState = { meta: { background: { theme: 'solar', language: 'ja' } }, elements: [] };
		expect(strings(newer.meta!)).toStrictEqual(['solar', 'ja']);
		expect(decodeState(encodeState(newer))).toStrictEqual(newer);
		// with a font and options: the words of the format, in the order they are written
		const all = { theme: 'solar', language: 'ja', font: 'lato_regular', options: { sky: false } };
		expect(strings({ background: all, colorScheme: 'okabe-ito' })).toStrictEqual([
			'solar',
			'ja',
			'lato_regular',
			'{"sky":false}',
			'okabe-ito'
		]);
	});

	it('stores its numbers in the steps of their sliders', () => {
		const exact: MapState = {
			meta: { background: { labelSize: 0.55, haloWidth: 4.75, colors: { saturation: -1, black: -0.95, white: 2 } } },
			elements: []
		};
		expect(decodeState(encodeState(exact))).toStrictEqual(exact);
		const between: MapState = {
			meta: { background: { labelSize: 1.234, haloWidth: 1.6, colors: { saturation: 0.33, black: 0.175 } } },
			elements: []
		};
		expect(decodeState(encodeState(between)).meta?.background).toStrictEqual({
			labelSize: 1.25,
			haloWidth: 1.5,
			colors: { saturation: 0.35, black: 0.2 }
		});
		// a change so small that nothing is left of it is none
		const tiny: MapState = { meta: { background: { labelSize: 1.01, colors: { black: 0.01 } } }, elements: [] };
		expect(decodeState(encodeState(tiny)).meta).toBeUndefined();
	});

	it('rejects invalid backgrounds', () => {
		const read = (write: (writer: StateWriter) => void, strings: string[] = []) => {
			const writer = new StateWriter();
			writer.writeStringTable([], strings);
			writer.writeBit(true);
			writer.writeInteger(2, 6); // the background
			write(writer);
			const reader = new StateReader(writer.bits);
			reader.readStringTable();
			return () => reader.readMetadata();
		};
		const error = (message: unknown) =>
			expect.objectContaining({
				message: 'Error reading metadata',
				cause: expect.objectContaining({
					message: 'Error reading background',
					cause: expect.objectContaining({ message })
				})
			});
		// a key that the format does not have
		expect(read((writer) => writer.writeInteger(15, 4))).toThrow(error('Invalid background key: 15'));
		// a theme beyond its list
		expect(
			read((writer) => {
				writer.writeInteger(2, 4);
				writer.writeInteger(30, 5);
			})
		).toThrow(error('Invalid index: 30 of 24'));
		// no setting at all
		expect(read((writer) => writer.writeInteger(0, 4))).toThrow(error('A background without settings'));
		// options that are no JSON, or no object
		for (const json of ['{', '[]', 'null']) {
			expect(
				read(
					(writer) => {
						writer.writeInteger(14, 4);
						writer.writeStringRef(json, true);
					},
					[json]
				)
			).toThrow(error(json === '{' ? expect.stringContaining('JSON') : 'Invalid options of the background'));
		}
	});
});

describe('legend', () => {
	it('round-trips layouts and entries', () => {
		const state: MapState = {
			meta: {
				legend: {
					layout: 'inline',
					font: 'serif',
					entries: [
						{
							type: 'area',
							style: { color: '#ff0000', pattern: 'diagonal-up' },
							strokeStyle: { width: 3 },
							label: 'Red area'
						},
						{ type: 'marker', style: { color: '#0000ff', symbol: 'icons:anchor', size: 1.5 }, label: 'Blue marker' },
						{ type: 'line', style: { color: '#00ff00', dash: 'dotted' }, label: '' },
						// all defaults
						{ type: 'marker', label: 'Flag' }
					]
				}
			},
			// an element with the style of an entry, which refers to it
			elements: [
				{
					type: 'line',
					points: [
						[13, 52],
						[13.1, 52]
					],
					style: { color: '#00ff00', dash: 'dotted' }
				}
			]
		};
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('refuses an entry without a valid type', () => {
		const legend = { entries: [{ color: '#ff0000', label: 'A' }] } as unknown as StateLegend;
		expect(() => encodeState({ meta: { legend }, elements: [] })).toThrow('Invalid legend entry type');
	});

	it('does not store the default layout', () => {
		const legend = { layout: 'vertical' as const, entries: [] };
		expect(decodeState(encodeState({ meta: { legend }, elements: [] })).meta).toStrictEqual({
			legend: { entries: [] }
		});
	});

	it('rejects unknown fields', () => {
		const writer = new StateWriter();
		writer.writeInteger(15, 4);
		expect(() => new StateReader(writer.bits).readLegend()).toThrow('Error reading legend');
	});
});

describe('color scheme', () => {
	it('round-trips', () => {
		const state: MapState = { meta: { colorScheme: 'okabe-ito' }, elements: [] };
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});
});

describe('viewer', () => {
	it('round-trips the search, the zoom buttons and the legend, each at a position or none', () => {
		for (const viewer of [
			{ search: 'top-right', navigation: 'bottom-left', legend: 'right' },
			{ search: 'top-left' },
			{ navigation: 'none', legend: 'none' }
		] as StateViewer[]) {
			const state: MapState = { meta: { viewer }, elements: [] };
			expect(decodeState(encodeState(state))).toStrictEqual(state);
		}
	});

	it('does not store the defaults, like missing metadata', () => {
		const defaults: StateViewer = { search: 'none', navigation: 'top-right', legend: 'bottom-left' };
		expect(encodeState({ meta: { viewer: defaults }, elements: [] })).toBe(encodeState({ elements: [] }));
		expect(
			decodeState(encodeState({ meta: { viewer: { search: 'top-left', legend: 'bottom-left' } }, elements: [] }))
		).toStrictEqual({ meta: { viewer: { search: 'top-left' } }, elements: [] });
	});
});

describe('invalid links', () => {
	/** The message of the innermost error of decoding the map, e.g. "Invalid latitude: 95". */
	function decodeError(state: MapState): string {
		try {
			decodeState(encodeState(state));
		} catch (error) {
			let inner = error as Error;
			while (inner.cause instanceof Error) inner = inner.cause;
			return inner.message;
		}
		return 'no error';
	}

	it('are refused with elements that cannot be drawn, which the editor never writes', () => {
		expect(decodeError({ elements: [{ type: 'line', points: [[0, 0]] }] })).toBe('A line of fewer than 2 points');
		const twoPoints: [number, number][] = [
			[0, 0],
			[1, 1]
		];
		expect(decodeError({ elements: [{ type: 'polygon', points: twoPoints }] })).toBe('An area of fewer than 3 points');
		expect(decodeError({ elements: [{ type: 'marker', point: [0, 95] }] })).toBe('Invalid latitude: 95');
		expect(
			decodeError({
				elements: [
					{
						type: 'line',
						points: [
							[0, 0],
							[1, -91]
						]
					}
				]
			})
		).toBe('Invalid latitude: -91');
	});

	it('are refused with a rotation beyond 180°', () => {
		const marker = (style: StateStyle): MapState => ({ elements: [{ type: 'marker', point: [0, 0], style }] });
		expect(decodeError(marker({ rotation: 200 }))).toBe('Invalid rotation: 200');
	});

	it('keep a circle smaller than 1 m, as 1 m', () => {
		const state = decodeState(encodeState({ elements: [{ type: 'circle', point: [0, 0], radius: 0.3 }] }));
		expect(state.elements).toStrictEqual([{ type: 'circle', point: [0, 0], radius: 1 }]);
	});

	it('keep frames up to the edges of the map', () => {
		for (const bounds of [
			[-180, -90, 180, 90],
			[-180, -85.0511, 180, 85.0511],
			[179.99999, 0, 180, 1]
		] as [number, number, number, number][]) {
			expect(decodeState(encodeState({ frame: { bounds }, elements: [] })).frame).toStrictEqual({ bounds });
		}
	});
});
