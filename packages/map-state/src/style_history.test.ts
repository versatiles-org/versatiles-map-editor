import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { STYLE_HISTORY_SIZE, StyleHistory } from './style_history.js';
import type { MapState } from './types.js';

function encode(state: MapState): string {
	const writer = new StateWriter();
	writer.writeRoot(state);
	return writer.asBase64();
}

const decode = (base64: string) => StateReader.fromBase64(base64).readRoot();

// markers that differ only in their label, as in an imported table
const markers: MapState = {
	elements: Array.from({ length: 30 }, (_, i) => ({
		type: 'marker' as const,
		point: [(1300 + i) / 100, (5200 + i) / 100] as [number, number],
		// upper case, as the decoder returns colors
		style: { color: ['#e41a1c', '#377eb8', '#4daf4a'][i % 3], symbol: 'icons:anchor', size: 1.5, label: `Place ${i}` }
	}))
};

describe('style references', () => {
	it('round-trip', () => {
		expect(decode(encode(markers))).toStrictEqual(markers);
	});

	it('round the rotation to whole numbers', () => {
		// e.g. a rotation typed into the editor, or a file
		const state: MapState = {
			elements: [
				{ type: 'marker', point: [0, 0], style: { rotate: 17.5 } },
				{ type: 'marker', point: [1, 1], style: { rotate: 18 } }
			]
		};
		const decoded = decode(encode(state)).elements.map((element) => element.style);
		expect(decoded).toStrictEqual([{ rotate: 18 }, { rotate: 18 }]);
		// written as the whole numbers, so the second marker refers to the style of the first
		const whole: MapState = {
			elements: [{ ...state.elements[0], style: { rotate: 18 } }, ...state.elements.slice(1)]
		};
		expect(encode(state)).toBe(encode(whole));
	});

	it('remove fields that the referenced style has', () => {
		const state: MapState = {
			elements: [
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					style: { color: '#00ff00', pattern: 'diagonal' },
					strokeStyle: { color: '#000000', width: 3, visible: false }
				},
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					style: { color: '#00ff00' },
					strokeStyle: { color: '#000000', width: 3 }
				},
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					style: { width: 3 }
				}
			]
		};
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('compare values as they are encoded', () => {
		const state: MapState = {
			elements: [
				{ type: 'marker', point: [0, 0], style: { halo: 1.5, size: 2 } },
				{ type: 'marker', point: [0, 0], style: { halo: 1.504, size: 2 } }
			]
		};
		expect(decode(encode(state)).elements.map((e) => e.style)).toStrictEqual([
			{ halo: 1.5, size: 2 },
			{ halo: 1.5, size: 2 }
		]);
	});

	it('work with more styles than the history keeps', () => {
		const state: MapState = {
			elements: Array.from({ length: STYLE_HISTORY_SIZE * 2 }, (_, i) => ({
				type: 'marker' as const,
				point: [0, 0] as [number, number],
				style: { rotate: i % (STYLE_HISTORY_SIZE + 5), label: 'x' }
			}))
		};
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('cost 1 bit for none and 3 bits for the latest style', () => {
		const writer = new StateWriter();
		writer.writeStyle({ halo: 1 });
		// no reference, the key of the halo (13), its value, the end
		expect(writer.asBitString()).toBe('1' + '0001110' + '010100' + '1');
		const start = writer.bits.length;
		writer.writeStyle({ halo: 1 });
		// the latest style, the end
		expect(writer.asBitString().slice(start)).toBe('010' + '1');
	});

	it('reject an invalid reference', () => {
		const writer = new StateWriter();
		writer.writeInteger(1, 3); // version
		writer.writeArray([], () => {}); // palette
		writer.writeVarint(0); // no strings
		writer.writeBit(false); // no map
		writer.writeInteger(0, 4); // the step of the coordinates: 0.00001°
		writer.writeVarint(0, true); // the origin
		writer.writeVarint(0, true);
		writer.writeBit(false); // one parameter for longitude and latitude
		writer.writeInteger(0, 5); // the parameter of the code of the coordinates
		writer.writeBit(false); // the points of markers and circles from the origin
		writer.writeBit(false); // no frame
		writer.writeBit(false); // no metadata
		writer.writeInteger(1, 3); // marker
		writer.writeExpGolomb(0, 0, true); // the point
		writer.writeExpGolomb(0, 0, true);
		writer.writeBit(true); // style
		writer.writeExpGolomb(3, 0); // reference to a style that does not exist
		writer.writeExpGolomb(0, 0); // end
		// root, marker, style
		expect(() => new StateReader(writer.bits).readRoot()).toThrow(
			expect.objectContaining({
				cause: expect.objectContaining({
					cause: expect.objectContaining({ cause: expect.objectContaining({ message: 'Invalid style reference: 3' }) })
				})
			})
		);
	});
});

describe('StyleHistory', () => {
	it('references the latest style as 1 and moves reused styles to the end', () => {
		const history = new StyleHistory();
		history.remember({ color: '#ff0000' });
		history.remember({ color: '#00ff00' });
		expect(history.get(1)).toStrictEqual({ color: '#00ff00' });
		// the same style, as it is encoded
		history.remember({ color: '#ff0000' });
		expect(history.length).toBe(2);
		expect(history.get(1)).toStrictEqual({ color: '#ff0000' });
		expect(history.get(2)).toStrictEqual({ color: '#00ff00' });
		expect(history.get(0)).toBeUndefined();
		expect(history.get(3)).toBeUndefined();
	});

	it('keeps a limited number of styles', () => {
		const history = new StyleHistory();
		for (let i = 0; i < STYLE_HISTORY_SIZE + 10; i++) history.remember({ rotate: i });
		expect(history.length).toBe(STYLE_HISTORY_SIZE);
		expect(history.get(STYLE_HISTORY_SIZE)).toStrictEqual({ rotate: 10 });
	});
});
