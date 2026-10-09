import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateReader } from './reader.js';
import { decodeState, encodeState } from './index.js';
import type { MapState, StateElement } from './types.js';

const roundTrip = (elements: StateElement[]) => decodeState(encodeState({ elements })).elements;

/** How many styles the reader reads for these elements, which is fewer if elements repeat the one before. */
function stylesRead(elements: StateElement[]): number {
	const readStyle = vi.spyOn(StateReader.prototype, 'readStyle');
	decodeState(encodeState({ elements }));
	return readStyle.mock.calls.length;
}

const marker = (lng: number, style?: StateElement['style'], label?: string): StateElement => ({
	type: 'marker',
	point: [lng, 52.5],
	...(label !== undefined && { label }),
	...(style && { style })
});

describe('elements that repeat the one before', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('store their type and styles once, also with other labels', () => {
		const elements = [
			marker(13.1, { color: '#aa0000', size: 2 }, 'Boots'),
			marker(13.2, { color: '#aa0000', size: 2 }, 'Superdrug'),
			marker(13.3, { color: '#aa0000', size: 2 }),
			marker(13.4, { color: '#aa0000', size: 2 }, 'Boots')
		];
		expect(roundTrip(elements)).toStrictEqual(elements);
		expect(stylesRead(elements)).toBe(1);
	});

	it('repeat elements of every type', () => {
		const line: StateElement = {
			type: 'line',
			points: [
				[13, 52],
				[13.1, 52]
			],
			style: { width: 3 }
		};
		const polygon: StateElement = {
			type: 'polygon',
			points: [
				[13, 52],
				[13.1, 52],
				[13.1, 52.1]
			],
			style: { color: '#00ff00' },
			outlineStyle: { width: 3 }
		};
		const circle: StateElement = { type: 'circle', point: [13, 52], radius: 100, outlineStyle: { visible: false } };
		const elements = [line, { ...line }, polygon, { ...polygon }, circle, { ...circle }];
		expect(roundTrip(elements)).toStrictEqual(elements);
		// line, polygon (fill and outline), circle (outline)
		expect(stylesRead(elements)).toBe(4);
	});

	it('repeat elements without a style', () => {
		const elements = [marker(13.1), marker(13.2), marker(13.3, { color: '#aa0000' }), marker(13.4)];
		expect(roundTrip(elements)).toStrictEqual(elements);
		expect(stylesRead(elements)).toBe(1);
	});

	it('are not repeats with another type or another outline', () => {
		const square: [number, number][] = [
			[13, 52],
			[13.1, 52],
			[13.1, 52.1]
		];
		const elements: StateElement[] = [
			{ type: 'polygon', points: square, style: { color: '#00ff00' }, outlineStyle: { width: 4 } },
			{ type: 'polygon', points: square, style: { color: '#00ff00' }, outlineStyle: { width: 3 } },
			{ type: 'line', points: square, style: { color: '#00ff00' } },
			marker(13, { color: '#00ff00' })
		];
		expect(roundTrip(elements)).toStrictEqual(elements);
		expect(stylesRead(elements)).toBe(6);
	});

	it('get copies of the styles, and not the label of the one before', () => {
		const [first, second] = roundTrip([marker(13.1, { size: 2 }, 'A'), marker(13.2, { size: 2 })]);
		expect(second).toStrictEqual(marker(13.2, { size: 2 }));
		second.style!.size = 3;
		expect(first.style).toStrictEqual({ size: 2 });
	});
});

describe('the label of a marker', () => {
	it('is kept, also without a style; an empty one is none', () => {
		const elements = [
			marker(13.2, undefined, 'Only a label'),
			marker(13.3, { color: '#aa0000' }, 'A'),
			marker(13.4, {})
		];
		// a style without fields is none
		expect(roundTrip(elements)).toStrictEqual([...elements.slice(0, 2), marker(13.4)]);
		expect(roundTrip([marker(13.1, undefined, '')])).toStrictEqual([marker(13.1)]);
	});

	it('is in the string table in the order of writing, before the popup', () => {
		const state: MapState = {
			elements: [{ type: 'marker', point: [13, 52], label: 'Label', popup: { text: 'Popup' } }]
		};
		const reader = StateReader.fromBase64(encodeState(state));
		reader.readVersion();
		reader.readPalette();
		expect(reader.readStringTable()).toStrictEqual(['Label', 'Popup']);
	});
});
