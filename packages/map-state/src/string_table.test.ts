import { describe, expect, it } from 'vitest';
import { StateReader } from './reader.js';
import { collectStrings, StateWriter } from './writer.js';
import { decodeState, encodeState } from './index.js';
import type { MapState } from './types.js';

/** The bits that `write` adds after a table of these strings. */
function refBits(strings: string[], write: (writer: StateWriter) => void): string {
	const writer = new StateWriter();
	writer.writeStringTable(strings);
	const start = writer.bits.length;
	write(writer);
	return writer.asBitString().slice(start);
}

describe('the string table', () => {
	const state: MapState = {
		meta: { title: 'Pharmacies', legend: { entries: [{ type: 'marker', label: 'Pharmacy' }] } },
		elements: [
			{ type: 'marker', point: [13.4, 52.5], style: { label: 'Boots' }, popup: { text: 'Pharmacy' } },
			{ type: 'marker', point: [13.5, 52.5], style: { label: 'Boots', size: 2 } },
			{ type: 'marker', point: [13.6, 52.5], style: { label: '' }, popup: { text: 'Open 24 h' } }
		]
	};

	it('has the strings in the order they are written, each once', () => {
		expect([...new Set(collectStrings(state))]).toStrictEqual(['Pharmacy', 'Pharmacies', 'Boots', '', 'Open 24 h']);
		const reader = StateReader.fromBase64(encodeState(state));
		reader.readInteger(3);
		reader.readPalette();
		expect(reader.readArray(() => reader.readString())).toStrictEqual([
			'Pharmacy',
			'Pharmacies',
			'Boots',
			'',
			'Open 24 h'
		]);
	});

	it('keeps the strings in a link', () => {
		expect(decodeState(encodeState(state))).toStrictEqual(state);
	});

	it('refers to the next new string with 1 bit, and to others with their index', () => {
		const bits = refBits(['a', 'b'], (writer) => ['a', 'b', 'a', 'b'].forEach((s) => writer.writeStringRef(s)));
		expect(bits).toBe('1' + '1' + '0' + '000000' + '0' + '000010');
	});

	it('refers to a string out of order with its index', () => {
		const writer = new StateWriter();
		writer.writeStringTable(['a', 'b', 'c']);
		['b', 'a', 'c'].forEach((s) => writer.writeStringRef(s));
		const reader = new StateReader(writer.bits);
		reader.readStringTable();
		expect([reader.readStringRef(), reader.readStringRef(), reader.readStringRef()]).toStrictEqual(['b', 'a', 'c']);
		expect(reader.ended()).toBe(true);
	});

	it('counts the strings that the chosen encoding of a style refers to', () => {
		// each style is written by trying several encodings; the second one refers to the first
		const writer = new StateWriter();
		writer.writeStringTable(['a', 'b', 'c']);
		writer.writeStyle({ label: 'a', size: 2 });
		writer.writeStyle({ label: 'b', size: 2 });
		// so "c" is the next new string
		expect(refBits(['c'], (w) => w.writeStringRef('c'))).toBe('1');
		const start = writer.bits.length;
		writer.writeStringRef('c');
		expect(writer.asBitString().slice(start)).toBe('1');
	});

	it('cannot refer to a string that is not in the table', () => {
		const writer = new StateWriter();
		writer.writeStringTable(['a']);
		expect(() => writer.writeStringRef('b')).toThrow('String not in the table: b');
	});

	it('rejects an index outside the table', () => {
		const writer = new StateWriter();
		writer.writeStringTable(['a']);
		writer.writeBit(false);
		writer.writeVarint(5);
		const reader = new StateReader(writer.bits);
		reader.readStringTable();
		expect(() => reader.readStringRef()).toThrow('Invalid string index: 5');
	});

	it('rejects the next new string after the last one', () => {
		const writer = new StateWriter();
		writer.writeStringTable(['a']);
		writer.writeStringRef('a');
		writer.writeBit(true);
		const reader = new StateReader(writer.bits);
		reader.readStringTable();
		expect(reader.readStringRef()).toBe('a');
		expect(() => reader.readStringRef()).toThrow('Invalid string index: 1');
	});
});
