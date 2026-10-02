import { describe, expect, it } from 'vitest';
import { ELEMENT_KEYS, END_KEY, LEGEND_ENTRY_KEYS, LEGEND_KEYS, METADATA_KEYS, POPUP_KEYS } from './constants.js';
import { STYLE_EXTENDED_KEY, STYLE_FIELDS, STYLE_REMOVE_KEY } from './style_history.js';

describe('the keys of the fields', () => {
	it('are each once in their list, not the end, and fit their bits', () => {
		const lists: [string, number[], number][] = [
			['elements', Object.values(ELEMENT_KEYS), 3],
			['metadata', Object.values(METADATA_KEYS), 6],
			['legend', Object.values(LEGEND_KEYS), 4],
			['legend entry', Object.values(LEGEND_ENTRY_KEYS), 4],
			['popup', Object.values(POPUP_KEYS), 4],
			// keys from 16 after the extended key, in 4 more bits
			['style', [...STYLE_FIELDS.map((field) => field.key), STYLE_EXTENDED_KEY, STYLE_REMOVE_KEY], 8]
		];
		for (const [name, keys, bits] of lists) {
			expect(new Set(keys).size, name).toBe(keys.length);
			expect(keys, name).not.toContain(END_KEY);
			for (const key of keys) expect(key, name).toBeLessThan(2 ** bits);
		}
	});
});
