import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { STYLE_HISTORY_SIZE, StyleHistory } from './style_history.js';
import type { StateRoot } from './types.js';

function encode(state: StateRoot, version: number): string {
	const writer = new StateWriter({ version });
	writer.writeRoot(state);
	return writer.asBase64();
}

const decode = (base64: string) => StateReader.fromBase64(base64).readRoot();

// markers that differ only in their label, as in an imported table
const markers: StateRoot = {
	elements: Array.from({ length: 30 }, (_, i) => ({
		type: 'marker' as const,
		point: [(1300 + i) / 100, (5200 + i) / 100] as [number, number],
		// upper case, as the decoder returns colors
		style: { color: ['#E41A1C', '#377EB8', '#4DAF4A'][i % 3], pattern: 12, size: 1.5, label: `Place ${i}` }
	}))
};

describe('style references (version 1)', () => {
	it('round-trip', () => {
		expect(decode(encode(markers, 1))).toStrictEqual(markers);
	});

	it('make the hash shorter', () => {
		// 919 → 726 characters: the labels differ, but the rest of each style is a reference
		expect(encode(markers, 1).length).toBeLessThan(encode(markers, 0).length * 0.85);
	});

	it('remove fields that the referenced style has', () => {
		const state: StateRoot = {
			elements: [
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					],
					style: { color: '#00ff00', opacity: 0.5, pattern: 1 },
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
		expect(decode(encode(state, 1))).toStrictEqual(decode(encode(state, 0)));
	});

	it('compare values as they are encoded', () => {
		const state: StateRoot = {
			elements: [
				{ type: 'marker', point: [0, 0], style: { halo: 1.5, size: 2 } },
				{ type: 'marker', point: [0, 0], style: { halo: 1.504, size: 2 } }
			]
		};
		expect(decode(encode(state, 1)).elements.map((e) => e.style)).toStrictEqual([
			{ halo: 1.5, size: 2 },
			{ halo: 1.5, size: 2 }
		]);
	});

	it('work with more styles than the history keeps', () => {
		const state: StateRoot = {
			elements: Array.from({ length: STYLE_HISTORY_SIZE * 2 }, (_, i) => ({
				type: 'marker' as const,
				point: [0, 0] as [number, number],
				style: { rotate: i % (STYLE_HISTORY_SIZE + 5), label: 'x' }
			}))
		};
		expect(decode(encode(state, 1))).toStrictEqual(state);
	});

	it('reject an invalid reference', () => {
		const writer = new StateWriter({ version: 1 });
		writer.writeInteger(1, 3); // version
		writer.writeArray([], () => {}); // palette
		writer.writeBit(false); // no map
		writer.writeVarint(5); // resolution: decimal places
		writer.writeBit(false); // no metadata
		writer.writeInteger(1, 3); // marker
		writer.writePoint([0, 0]);
		writer.writeBit(true); // style
		writer.writeVarint(3); // reference to a style that does not exist
		writer.writeInteger(0, 4);
		expect(() => new StateReader(writer.bits).readRoot()).toThrow('Error reading root');
	});
});

describe('StyleHistory', () => {
	it('references the latest style as 1 and moves reused styles to the end', () => {
		const history = new StyleHistory();
		history.remember({ color: '#ff0000' });
		history.remember({ color: '#00ff00' });
		expect(history.get(1)).toStrictEqual({ color: '#00ff00' });
		// the same style, as it is encoded
		history.remember({ color: '#FF0000' });
		expect(history.length).toBe(2);
		expect(history.get(1)).toStrictEqual({ color: '#FF0000' });
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
