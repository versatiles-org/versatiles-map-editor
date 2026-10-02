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

const marker = (lng: number, style?: StateElement['style']): StateElement => ({
	type: 'marker',
	point: [lng, 52.5],
	...(style && { style })
});

describe('elements that repeat the one before', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('store their type and styles once, also with other labels', () => {
		const elements = [
			marker(13.1, { color: '#ff0000', size: 2, label: 'Boots' }),
			marker(13.2, { color: '#ff0000', size: 2, label: 'Superdrug' }),
			marker(13.3, { color: '#ff0000', size: 2 }),
			marker(13.4, { color: '#ff0000', size: 2, label: 'Boots' })
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
			strokeStyle: { width: 2 }
		};
		const circle: StateElement = { type: 'circle', point: [13, 52], radius: 100, strokeStyle: { visible: false } };
		const elements = [line, { ...line }, polygon, { ...polygon }, circle, { ...circle }];
		expect(roundTrip(elements)).toStrictEqual(elements);
		// line, polygon (fill and outline), circle (outline)
		expect(stylesRead(elements)).toBe(4);
	});

	it('repeat elements without a style', () => {
		const elements = [marker(13.1), marker(13.2), marker(13.3, { color: '#ff0000' }), marker(13.4)];
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
			{ type: 'polygon', points: square, style: { color: '#00ff00' }, strokeStyle: { width: 2 } },
			{ type: 'polygon', points: square, style: { color: '#00ff00' }, strokeStyle: { width: 3 } },
			{ type: 'line', points: square, style: { color: '#00ff00' } },
			marker(13, { color: '#00ff00' })
		];
		expect(roundTrip(elements)).toStrictEqual(elements);
		expect(stylesRead(elements)).toBe(6);
	});

	it('get copies of the styles, without the label of the one before', () => {
		const [first, second] = roundTrip([marker(13.1, { size: 2, label: 'A' }), marker(13.2, { size: 2 })]);
		expect(second.style).toStrictEqual({ size: 2 });
		second.style!.size = 3;
		expect(first.style).toStrictEqual({ size: 2, label: 'A' });
	});
});

describe('the label of an element', () => {
	it('is kept, also when it is empty or the only field of the style', () => {
		const elements = [
			marker(13.1, { label: '' }),
			marker(13.2, { label: 'Only a label' }),
			marker(13.3, { color: '#ff0000', label: 'Only a label' }),
			marker(13.4, {})
		];
		expect(roundTrip(elements)).toStrictEqual(elements);
	});

	it('is kept in the outline of an area, which has it inside', () => {
		const elements: StateElement[] = [
			{ type: 'circle', point: [13, 52], radius: 100, style: { label: 'Fill' }, strokeStyle: { label: 'Outline' } }
		];
		expect(roundTrip(elements)).toStrictEqual(elements);
	});

	it('is in the string table in the order of writing', () => {
		const state: MapState = {
			elements: [
				{ type: 'circle', point: [13, 52], radius: 100, style: { label: 'Fill' }, strokeStyle: { label: 'Outline' } }
			]
		};
		const reader = StateReader.fromBase64(encodeState(state));
		reader.readInteger(3);
		reader.readPalette();
		expect(reader.readStringTable()).toStrictEqual(['Outline', 'Fill']);
	});
});
