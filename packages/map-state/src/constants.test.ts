import { describe, expect, it } from 'vitest';
import {
	bitsToBase64,
	ELEMENT_KEYS,
	END_KEY,
	LEGEND_ENTRY_KEYS,
	LEGEND_KEYS,
	METADATA_KEYS,
	POPUP_KEYS
} from './constants.js';
import { StateReader } from './reader.js';
import { STYLE_FIELDS, STYLE_REMOVE_KEY } from './style_history.js';

describe('the keys of the fields', () => {
	it('are each once in their list, not the end, and fit their bits', () => {
		const lists: [string, number[], number][] = [
			['elements', Object.values(ELEMENT_KEYS), 3],
			['metadata', Object.values(METADATA_KEYS), 6],
			['legend', Object.values(LEGEND_KEYS), 4],
			['legend entry', Object.values(LEGEND_ENTRY_KEYS), 4],
			['popup', Object.values(POPUP_KEYS), 4],
			// in an Exp-Golomb code, which has no limit; 9 bits at most for now
			['style', [...STYLE_FIELDS.map((field) => field.key), STYLE_REMOVE_KEY], 5]
		];
		for (const [name, keys, bits] of lists) {
			expect(new Set(keys).size, name).toBe(keys.length);
			expect(keys, name).not.toContain(END_KEY);
			for (const key of keys) expect(key, name).toBeLessThan(2 ** bits);
		}
	});
});

describe('base64', () => {
	it('has 6 bits in each character, the last ones filled up with zeros', () => {
		const bits = (text: string) => [...text].map((c) => c === '1');
		expect(bitsToBase64(bits('000000111111'))).toBe('A_');
		expect(bitsToBase64(bits('1'))).toBe('g');
		expect(bitsToBase64([])).toBe('');
		const random = Array.from({ length: 100 }, (_, i) => (i * 7919) % 3 === 0);
		expect(StateReader.fromBase64(bitsToBase64(random)).bits.slice(0, 100)).toStrictEqual(random);
	});
});
