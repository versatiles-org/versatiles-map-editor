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

		it('should read a signed integer', () => {
			function test(bits: string): number {
				const reader = StateReader.fromBitString(bits);
				const value = reader.readInteger(bits.length, true);
				expect(reader.ended()).toBe(true);
				return value;
			}
			expect(test('0000')).toBe(0);
			expect(test('0001')).toBe(1);
			expect(test('0011')).toBe(3);
			expect(test('0111')).toBe(7);
			expect(test('1000')).toBe(-8);
			expect(test('1100')).toBe(-4);
			expect(test('1110')).toBe(-2);
			expect(test('1111')).toBe(-1);
		});

		it('should read integer from writer correctly', () => {
			function test(value: number, bits: number, signed?: true) {
				const writer = new StateWriter();
				writer.writeInteger(value, bits);
				const reader = new StateReader(writer.bits);
				expect(reader.readInteger(bits, signed)).toBe(value);
				expect(reader.ended()).toBe(true);
			}
			test(0, 4);
			test(1, 4);
			test(3, 4);
			test(7, 4);
			test(14, 4);
			test(15, 4);
			test(255, 8);
			test(-128, 8, true);
			test(-1, 8, true);
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

	describe('readMap', () => {
		it('should write and read a map object 1', () => {
			const map: MapState['map'] = {
				center: [1.0085728693898135, 2.017145738779627],
				radius: 10085.53503412156
			};
			const writer = new StateWriter();
			writer.writeMap(map);
			expect(writer.asBitString()).toBe('110000101000000011000111001100000010001010011110000100');

			const reader = new StateReader(writer.bits);
			expect(reader.readMap()).toStrictEqual(map);
			expect(reader.ended()).toBe(true);
		});

		it('should write and read a map object 2', () => {
			const map0: MapState['map'] = {
				center: [-121.013, 82.65],
				radius: 10.021315508993025
			};
			const writer = new StateWriter();
			writer.writeMap(map0);
			expect(writer.asBitString()).toBe('100100001010011110101111001110001011011101000011001010111011100010111100');

			const reader = new StateReader(writer.bits);
			const map1 = reader.readMap();
			expect(map1?.center).toStrictEqual(map0.center);
			expect(map1?.radius).toBeCloseTo(map0.radius, 10);
			expect(reader.ended()).toBe(true);
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
		it('should read metadata that was stored empty as none, like older hashes', () => {
			const writer = new StateWriter();
			writer.writeBit(true);
			writer.writeInteger(0, 6);
			expect(new StateReader(writer.bits).readMetadata()).toBeUndefined();
		});
	});

	describe('readRoot', () => {
		it('should reject unknown element keys', () => {
			const writer = new StateWriter();
			writer.writeInteger(1, 3); // version
			writer.writeVarint(0); // no colors
			writer.writeVarint(0); // no strings
			writer.writeBit(false); // no camera
			writer.writeInteger(0, 4); // the step of the coordinates: 0.00001°
			writer.writeVarint(0, true); // the origin
			writer.writeVarint(0, true);
			writer.writeBit(false); // no frame
			writer.writeBit(false); // no metadata
			writer.writeInteger(5, 3); // unknown element key
			writer.writeInteger(0, 3);

			const reader = StateReader.fromBase64(writer.asBase64());
			expect(() => reader.readRoot()).toThrow(
				expect.objectContaining({ cause: expect.objectContaining({ message: 'Unknown element key: 5' }) })
			);
		});

		it('should read a root state', () => {
			// version 1, no colors, no strings, no camera, the resolution, the origin, no frame, no metadata, no elements
			const reader = StateReader.fromBitString(
				'001' + '000000' + '000000' + '0' + '001010' + '000000' + '000000' + '0' + '0'
			);
			const root = reader.readRoot();
			expect(root).toStrictEqual({ elements: [] });
		});

		it('should read a simple root state', () => {
			const root = {
				map: {
					center: [1, 2],
					radius: 8192
				},
				elements: [
					{
						type: 'marker',
						point: [3, 4]
					}
				]
			} as MapState;

			const writer = new StateWriter();
			writer.writeRoot(root);
			expect(writer.asBitString()).toBe(
				'00100000000000011000001000111101110101101110111001101011011111000010000000100010011001000010110000000100000110100100110101100000000110100100110101100000'
			);

			const reader = new StateReader(writer.bits);
			expect(reader.readRoot()).toStrictEqual(root);
		});

		it('should read a root object correctly', () => {
			const root: MapState = {
				map: {
					radius: 1024,
					center: [1, 2]
				},
				elements: [
					{
						type: 'marker',
						point: [3, 4],
						style: { halo: 1.2, size: 3.4, color: '#ff0000' }
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
						style: { halo: 1.5, width: 0.8, color: '#0000ff64' },
						strokeStyle: { halo: 1.5, width: 0.8, color: '#ffff00' }
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
				'JX-AAAAAP-yf_-ABEREREREQCyEN_pQL_awETIWAg0msA0msQBYUUKAAIQFFvAFFvAGk1gGk1gbUpsK4mu6tKTaGcDcox504koQY3IX5AH4m4WSYhoXYVIg4Wo1xJlekpEcUAXmQgIIUCAgMOsIQMOsIWYbECBggQQA'
			);
			const reader = new StateReader(writer.bits);
			expect(reader.readRoot()).toStrictEqual(root);
			expect(reader.ended()).toBe(true);
		});
	});

	it('reads the opacity of fills in older strings as the alpha of their color', () => {
		// written when fills had an opacity of their own: 3.4 for a marker, 0.8 for the fill and
		// the outline of a polygon, the outline referring to the style of the fill
		const state = StateReader.fromBase64(
			'JX-AAAAAP-yf_-ABEREREREQCyEN_pQL_awETIWAg0msA0msQBYKlSAAIQFFvAFFvAGk1gGk1gbUpsK4mu6tKTaGcDcox504koQY3IX5AH4m4WSYhoXYVIg4Wo1xJlekpEcUAXihEgIIUCAgMOsIQMOsIWYbECBggQQA'
		).readRoot();
		const [marker, , polygon] = state.elements as { style?: StateStyle; strokeStyle?: StateStyle }[];
		// at most opaque
		expect(marker.style).toStrictEqual({ halo: 1.2, color: '#ff0000' });
		// 0x64 × 0.8 = 0x50
		expect(polygon.style).toStrictEqual({ halo: 1.5, color: '#0000ff50' });
		expect(polygon.strokeStyle).toStrictEqual({ halo: 1.5, color: '#ffff00cc' });
	});

	describe('readStyle', () => {
		it('should read a style object', () => {
			// no reference to an earlier style, then the halo
			const reader = StateReader.fromBitString('00000000010000100000');
			const style = reader.readStyle();
			expect(style).toStrictEqual({ halo: 0.1 });
			expect(reader.ended()).toBe(true);
		});

		it('should read a style correctly', () => {
			const style: StateStyle = {
				halo: 1.5,
				pattern: 3,
				rotate: -45,
				size: 2.5,
				width: 2.3,
				align: 4,
				label: 'test',
				visible: false,
				color: '#c400ff42'
			};
			const writer = new StateWriter();
			// the palette of the colors, which the style refers to
			writer.writePalette(['#c400ff42']);
			// the table of the strings, which the label refers to
			writer.writeStringTable(['test']);
			writer.writeStyle(style);
			expect(writer.asBase64()).toBe('CxAD_oQRAgRwgAvGMmYi5Nc5EAToA');

			const reader = new StateReader(writer.bits);
			reader.readPalette();
			reader.readStringTable();
			expect(reader.readStyle()).toStrictEqual(style);
			expect(reader.ended()).toBe(true);
		});
	});

	describe('readString', () => {
		it('should read a string', () => {
			const reader = StateReader.fromBase64('S4CUUmNEA9DtCxfvC');
			expect(reader.readString()).toBe('Teddy: 🧸');
			expect(reader.ended()).toBe(true);
		});

		it('should write and read a string', () => {
			const text =
				'Hello, world, 🌍, וועלט, მოსოფელი, دنیا, ܥܠܡܐ, ലോകം, العالم, دنی, 世界, ދުނިޔެ, Sè-kài, ពិភពលោក, ലോകം,';
			const writer = new StateWriter();
			writer.writeString(text);
			expect(writer.asBase64()).toBe(
				'JGzCCSSMsAqMQSUsA5DtCbxvCsArdCrdCFfC5dCxdCsA3NI7NIDPI7NIJPIpNI1NIxNIsAfjCNlCZtCPjCsALzCBzCDzChxCsAlTGXVGrRGFRGsAPjCJlCzjCPjCJlCLlCsAfjCNlCZtCsAthmZV6sAX5CV7CF5CR7Cp5CZ7CsA2RONCyBOKsAt5Kv7Kv5Kt5K35KJ9KB5KsAlTGXVGrRGFRGs'
			);

			const reader = new StateReader(writer.bits);
			expect(reader.readString()).toBe(text);
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
				'IVUAAAQZ8IhQrYQZASybKM64mNZKaQIZxDUVBNEliU0hXoVwXyjHnBichRjOhTkBBjXhZBiMhJiSiDhYjZImR6ejPxQGlCgABzrCjqheziTAZSRHbQoUwMh20SmMI5FBtgAMg9CMYnsEhlAAA'
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
						style: {
							align: 2,
							color: '#aa0000',
							label: 'End'
						},
						type: 'marker'
					},
					{
						point: [expect.closeTo(13.37097, 5), expect.closeTo(52.51871, 5)],
						style: {
							align: 2,
							color: '#aa0000',
							label: 'Start'
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
							pattern: 2
						},
						type: 'polygon'
					}
				],
				map: {
					center: [expect.closeTo(13.36075, 5), expect.closeTo(52.51318, 5)],
					radius: expect.closeTo(1078.64)
				}
			});
		});
	});
});

describe('popups', () => {
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
		expect(() => new StateReader(writer.bits).readPopup()).toThrow('Error reading popup');
	});
});

describe('background', () => {
	it('round-trips any options', () => {
		const state: MapState = {
			meta: {
				background: {
					builder: 'satellite',
					options: { osmOverlay: { text: { language: 'de', spacing: 1.5 }, layers: { labels: false } } }
				}
			},
			elements: []
		};
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('rejects invalid backgrounds', () => {
		for (const json of ['{"builder":"other","options":{}}', '{"builder":"osm","options":[]}', 'null', '{']) {
			const writer = new StateWriter();
			writer.writeBit(true);
			writer.writeInteger(2, 6);
			writer.writeString(json);
			writer.writeInteger(0, 6);
			expect(() => new StateReader(writer.bits).readMetadata()).toThrow('Error reading metadata');
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
						{ type: 'polygon', style: { color: '#ff0000', pattern: 1 }, strokeStyle: { width: 3 }, label: 'Red area' },
						{ type: 'marker', style: { color: '#0000ff', symbol: 'icons:anchor', size: 1.5 }, label: 'Blue marker' },
						{ type: 'line', style: { color: '#00ff00', pattern: 2 }, label: '' },
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
					style: { color: '#00ff00', pattern: 2 }
				}
			]
		};
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('reads the entries of older links, a color and maybe a symbol, as markers and areas', () => {
		// written before: a blue anchor, and a translucent red swatch
		expect(decodeState('IgAAf7_AADACHZhDIUGNIEBhIBDAAASAgGCmDCDjRBiGFjEAzEEBADgIRwAAA').meta).toStrictEqual({
			legend: {
				entries: [
					{ type: 'marker', style: { color: '#0000ff', symbol: 'icons:anchor' }, label: 'Harbour' },
					{ type: 'polygon', style: { color: '#ff000080' }, strokeStyle: { visible: false }, label: 'Area' }
				]
			}
		});
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

	it('reads the search and the position of the legend of older links', () => {
		// written before: the search as a flag, the legend at the top right
		expect(decodeState('IX-AAAIIMIAACGJBhCAcAFAAA').meta).toStrictEqual({
			legend: {
				entries: [{ type: 'polygon', style: { color: '#ff0000' }, strokeStyle: { visible: false }, label: 'A' }]
			},
			viewer: { search: 'top-left', legend: 'top-right' }
		});
	});
});
