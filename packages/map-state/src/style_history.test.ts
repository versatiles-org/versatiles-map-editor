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
		label: `Place ${i}`,
		style: { color: ['#e41a1c', '#377eb8', '#4daf4a'][i % 3], symbol: 'icons:anchor', size: 1.5 }
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
				{ type: 'marker', point: [0, 0], style: { rotation: 17.5 } },
				{ type: 'marker', point: [1, 1], style: { rotation: 18 } }
			]
		};
		const decoded = decode(encode(state)).elements.map((element) => element.style);
		expect(decoded).toStrictEqual([{ rotation: 18 }, { rotation: 18 }]);
		// written as the whole numbers, so the second marker refers to the style of the first
		const whole: MapState = {
			elements: [{ ...state.elements[0], style: { rotation: 18 } }, ...state.elements.slice(1)]
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
					style: { color: '#00ff00', pattern: 'diagonal-up' },
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
				{ type: 'marker', point: [0, 0], style: { haloWidth: 1.5, size: 2 } },
				{ type: 'marker', point: [0, 0], style: { haloWidth: 1.504, size: 2 } }
			]
		};
		expect(decode(encode(state)).elements.map((e) => e.style)).toStrictEqual([
			{ haloWidth: 1.5, size: 2 },
			{ haloWidth: 1.5, size: 2 }
		]);
	});

	it('work with more styles than the history keeps', () => {
		const state: MapState = {
			elements: Array.from({ length: STYLE_HISTORY_SIZE * 2 }, (_, i) => ({
				type: 'marker' as const,
				point: [0, 0] as [number, number],
				label: 'x',
				style: { rotation: i % (STYLE_HISTORY_SIZE + 5) }
			}))
		};
		expect(decode(encode(state))).toStrictEqual(state);
	});

	it('cost 1 bit for none and 3 bits for the latest style', () => {
		const writer = new StateWriter();
		writer.writeStyle('marker', { haloWidth: 1 });
		// no reference, the key of the halo of a marker (8), its value, the end
		expect(writer.asBitString()).toBe('1' + '0001001' + '010100' + '1');
		const start = writer.bits.length;
		writer.writeStyle('marker', { haloWidth: 1 });
		// the latest style, the end
		expect(writer.asBitString().slice(start)).toBe('010' + '1');
	});

	it('reject an invalid reference', () => {
		const writer = new StateWriter();
		writer.writeInteger(1, 3); // version
		writer.writeArray([], () => {}); // palette
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
		history.remember('marker', { color: '#ff0000' });
		history.remember('marker', { color: '#00ff00' });
		expect(history.get(1, 'marker')).toStrictEqual({ color: '#00ff00' });
		// the same style, as it is encoded
		history.remember('marker', { color: '#ff0000' });
		expect(history.count('marker')).toBe(2);
		expect(history.get(1, 'marker')).toStrictEqual({ color: '#ff0000' });
		expect(history.get(2, 'marker')).toStrictEqual({ color: '#00ff00' });
		expect(history.get(0, 'marker')).toBeUndefined();
		expect(history.get(3, 'marker')).toBeUndefined();
	});

	it('counts only the styles of the role, so styles of other roles in between cost nothing', () => {
		const history = new StyleHistory();
		history.remember('marker', { color: '#ff0000' });
		history.remember('line', { width: 4 });
		history.remember('area', { pattern: 'dots' });
		history.remember('outline', { width: 4 });
		// the marker is the latest style of its role
		expect(history.get(1, 'marker')).toStrictEqual({ color: '#ff0000' });
		expect(history.count('marker')).toBe(1);
		// equal fields of another role are another style
		expect(history.get(1, 'line')).toStrictEqual({ width: 4 });
		expect(history.get(1, 'outline')).toStrictEqual({ width: 4 });
	});

	it('is the same in the writer and the reader, which refuses a reference to a style that is not there', () => {
		const writer = new StateWriter();
		writer.writeStyle('marker', { rotation: 45, size: 2 });
		writer.writeStyle('line', { width: 4 });
		// refers to the marker before: the line in between does not count
		const start = writer.bits.length;
		writer.writeStyle('marker', { rotation: 45, size: 2 });
		expect(writer.asBitString().slice(start)).toBe('010' + '1');
		const reader = new StateReader(writer.bits);
		reader.readStyle('marker');
		reader.readStyle('line');
		expect(reader.readStyle('marker')).toStrictEqual({ rotation: 45, size: 2 });
		// a reference to the second style of the area, of which there is none
		const hostile = new StateWriter();
		hostile.writeExpGolomb(2, 0);
		hostile.writeExpGolomb(0, 0);
		expect(() => new StateReader(hostile.bits).readStyle('area')).toThrow();
	});

	it('keeps a limited number of styles', () => {
		const history = new StyleHistory();
		for (let i = 0; i < STYLE_HISTORY_SIZE + 10; i++) history.remember('marker', { rotation: i });
		expect(history.count('marker')).toBe(STYLE_HISTORY_SIZE);
		expect(history.get(STYLE_HISTORY_SIZE, 'marker')).toStrictEqual({ rotation: 10 });
	});
});
