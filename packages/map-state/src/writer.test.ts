import { describe, it, expect } from 'vitest';
import { StateWriter } from './writer.js';
import { StateReader } from './reader.js';
import type { StateMetadata } from './types.js';

describe('StateWriter', () => {
	it('should initialize with an empty bits array', () => {
		const writer = new StateWriter();
		expect(writer.asBitString()).toBe('');
	});

	it('should write a single bit correctly', () => {
		const writer = new StateWriter();
		writer.writeBit(true);
		expect(writer.asBitString()).toBe('1');
		writer.writeBit(false);
		expect(writer.asBitString()).toBe('10');
	});

	it('should write an integer correctly', () => {
		const writer = new StateWriter();
		writer.writeInteger(3, 4);
		expect(writer.asBitString()).toBe('0011');
	});

	it('should write signed varint correctly', () => {
		function test(value: number): string {
			const writer = new StateWriter();
			writer.writeVarint(value, true);
			return writer.asBitString();
		}
		expect(test(-16)).toBe('111110');
		expect(test(-8)).toBe('011110');
		expect(test(-4)).toBe('001110');
		expect(test(-2)).toBe('000110');
		expect(test(-1)).toBe('000010');
		expect(test(0)).toBe('000000');
		expect(test(1)).toBe('000100');
		expect(test(2)).toBe('001000');
		expect(test(4)).toBe('010000');
		expect(test(8)).toBe('100000');

		expect(test(-32)).toBe('111111000010');
		expect(test(16)).toBe('000001000010');
		expect(test(32)).toBe('000001000100');
	});

	it('should write a signed varint correctly', () => {
		const writer = new StateWriter();
		writer.writeVarint(-5, true); // Encoded as signed varint
		expect(writer.asBitString()).toBe('010010'); // Example encoding
	});

	it('should write an array correctly', () => {
		const writer = new StateWriter();
		writer.writeArray([1, 2, 3], (value) => writer.writeInteger(value, 3));
		expect(writer.asBitString()).toBe('000110001010011'); // Example encoding
	});

	describe('writePoint', () => {
		it('should write a point correctly', () => {
			const writer = new StateWriter();
			writer.writePoint([0, 0]);
			expect(writer.asBitString()).toBe('000000000000');
		});

		it('should write SW correctly', () => {
			const writer = new StateWriter();
			writer.writePoint([-180, -90], 1e5);
			expect(writer.asBitString()).toBe('001111010110100111001010');

			const reader = new StateReader(writer.bits);
			expect(reader.readVarint(true)).toBe(-180);
			expect(reader.readVarint(true)).toBe(-90);
		});

		it('should write NE correctly', () => {
			const writer = new StateWriter();
			writer.writePoint([180, 90], 1e5);
			expect(writer.asBitString()).toBe('010001010110101001001010');

			const reader = new StateReader(writer.bits);
			expect(reader.readVarint(true)).toBe(180);
			expect(reader.readVarint(true)).toBe(90);
		});
	});

	describe('writeMetadata', () => {
		function test(metadata: StateMetadata, expected: string) {
			const writer = new StateWriter();
			writer.writeMetadata(metadata);
			expect(writer.asBase64()).toBe(expected);
		}
		it('should write empty metadata correctly', () => {
			test({}, 'A');
		});
	});

	it('should write a root object correctly', () => {
		const writer = new StateWriter();
		writer.writeRoot({
			elements: [
				{
					type: 'marker',
					point: [3, 4],
					style: { haloWidth: 1.5, size: 0.8, color: '#ff0000' }
				},
				{
					type: 'line',
					points: [
						[5, 6],
						[7, 8]
					],
					style: { width: 1.5, dash: 'dashed', color: '#00ff00' }
				},
				{
					type: 'polygon',
					points: [
						[9, 10],
						[11, 12],
						[13, 14]
					],
					style: { pattern: 'cross', color: '#0000ff' },
					strokeStyle: { width: 0.8, visible: false, color: '#ffff00' }
				},
				{
					type: 'circle',
					point: [15, 16],
					radius: 17,
					style: { pattern: 'diagonal-up' },
					strokeStyle: { width: 0.2 }
				}
			]
		});
		expect(writer.asBase64()).toBe(
			'JD_AAAAP8AAAA_z__wAACOIUPoSYFpPf2k9_1OgJeiEUNP9Q0_-GoDhqAaTeIFMaAAAgAAOGoDhqA4agOGoBpsrojQJRpPgGk-Ai2F2J'
		);
	});

	it('should write an empty root object correctly', () => {
		const writer = new StateWriter();
		writer.writeRoot({ elements: [] });
		expect(writer.asBitString()).toBe('00100000000000000000000000000000000000000');
	});

	it('should write a style correctly', () => {
		const writer = new StateWriter();
		// the palette of the colors, which the style refers to
		writer.writePalette(['#ff0000']);
		writer.writeStyle('marker', {
			haloWidth: 1.5,
			rotation: -45,
			size: 2.5,
			labelPosition: 'bottom',
			color: '#ff0000'
		});
		writer.writeStyle('area', { pattern: 'diagonal-down', color: '#ff0000' });
		expect(writer.asBase64()).toBe('Cf4AAKnyEECXhmYmrEg');
	});

	it('should write a RGB color correctly', () => {
		const writer = new StateWriter();
		writer.writeColor('#ff0000');
		expect(writer.asBase64()).toBe('_wAAA');
	});

	it('should write a RGBA color correctly', () => {
		const writer = new StateWriter();
		writer.writeColor('#ff000080');
		expect(writer.asBase64()).toBe('_wAAwA');
	});

	it('should convert bits to Base64 correctly', () => {
		const writer = new StateWriter();
		writer.writeInteger(63, 6);
		expect(writer.asBase64()).toBe('_');
	});
});
