import { describe, expect, it } from 'vitest';
import {
	BACKGROUND_KEYS,
	bitsToBase64,
	CODEC_VERSION,
	ELEMENT_END,
	ELEMENT_FIELD_KEYS,
	ELEMENT_KEYS,
	END_KEY,
	FRAME_KEYS,
	KEY_PARAMETERS,
	LEGEND_ENTRY_KEYS,
	LEGEND_KEYS,
	METADATA_KEYS,
	VIEWER_KEYS
} from './constants.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';
import { STYLE_KEYS, styleFields, styleRemoveKey } from './style_history.js';
import { STYLE_ROLE_FIELDS } from './style_roles.js';
import type { StyleRoleName } from './types.js';

describe('the keys of the fields', () => {
	it('are each once in their list, and not its end', () => {
		const lists: [string, number[], number][] = [
			['elements', Object.values(ELEMENT_KEYS), ELEMENT_END],
			['metadata', Object.values(METADATA_KEYS), END_KEY],
			['background', Object.values(BACKGROUND_KEYS), END_KEY],
			['frame', Object.values(FRAME_KEYS), END_KEY],
			['viewer', Object.values(VIEWER_KEYS), END_KEY],
			['legend', Object.values(LEGEND_KEYS), END_KEY],
			['legend entry', Object.values(LEGEND_ENTRY_KEYS), END_KEY],
			['fields of an element', Object.values(ELEMENT_FIELD_KEYS), END_KEY],
			...(Object.keys(STYLE_KEYS) as StyleRoleName[]).map((role): [string, number[], number] => [
				`style of ${role}`,
				[...styleFields(role).map((field) => field.key), styleRemoveKey(role)],
				END_KEY
			])
		];
		for (const [name, keys, end] of lists) {
			expect(new Set(keys).size, name).toBe(keys.length);
			expect(keys, name).not.toContain(end);
			// without gaps: the numbers are spent in order, the small ones are the short codes
			expect(
				[...keys, end].sort((a, b) => a - b),
				name
			).toStrictEqual(keys.map((_, i) => i).concat(keys.length));
		}
	});

	it('are codes without a last one, short for the small numbers', () => {
		const bits = (key: number, parameter: number) => {
			const writer = new StateWriter();
			writer.writeKey(key, parameter);
			expect(new StateReader(writer.bits).readKey(parameter)).toBe(key);
			return writer.bits.length;
		};
		expect([0, 1, 2, 3, 6, 7].map((key) => bits(key, 0))).toStrictEqual([1, 3, 3, 5, 5, 7]);
		expect([0, 1, 2, 5, 6, 13, 14].map((key) => bits(key, 1))).toStrictEqual([2, 2, 4, 4, 6, 6, 8]);
		expect(bits(CODEC_VERSION, KEY_PARAMETERS.version)).toBe(3);
		expect(bits(100000, 0)).toBe(33);
	});

	it('of a style are there for every field of its role', () => {
		for (const role of Object.keys(STYLE_KEYS) as StyleRoleName[]) {
			const names = styleFields(role).map((field) => field.name);
			expect([...names].sort(), role).toStrictEqual([...STYLE_ROLE_FIELDS[role]].sort());
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
