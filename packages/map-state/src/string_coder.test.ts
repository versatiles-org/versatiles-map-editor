import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { decodeStrings, encodeStrings } from './string_coder.js';
import { collectStrings } from './writer.js';
import { stateFromMapJSON } from './index.js';

const roundTrip = (strings: string[]) => decodeStrings(encodeStrings(strings), strings.length);

/** The strings of the string table of a map file, each once. */
function stringsOf(file: string): string[] {
	return [...new Set(collectStrings(stateFromMapJSON(JSON.parse(readFileSync(file, 'utf-8')))))];
}

/** Random numbers from a seed, so a failing case can be repeated (mulberry32). */
function random(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
	};
}

describe('the coder of the string table', () => {
	const files = globSync(['examples/*.mapjson', 'packages/map-state/src/__fixtures__/languages/*.mapjson']).sort();

	it.each(files)('keeps the strings of %s', (file) => {
		const strings = stringsOf(file);
		expect(roundTrip(strings)).toStrictEqual(strings);
	});

	it('codes the strings of the maps in these numbers of bits', () => {
		// a change of the model or the coder changes them: links written before cannot be read. Only
		// the fixtures, which are kept for tests; the examples are edited as showcases.
		const fixtures = files.filter((file) => file.includes('__fixtures__'));
		const bits = Object.fromEntries(
			fixtures.map((file) => [file.replace(/.*\//, ''), encodeStrings(stringsOf(file)).length])
		);
		expect(bits).toMatchInlineSnapshot(`
			{
			  "chinese.mapjson": 2078,
			  "emoji.mapjson": 1953,
			  "french.mapjson": 3247,
			  "german.mapjson": 3396,
			  "greek.mapjson": 2210,
			  "japanese.mapjson": 2557,
			  "polish.mapjson": 3482,
			  "russian.mapjson": 2769,
			}
		`);
	});

	it('codes a short string in these bits', () => {
		const bits = encodeStrings(['ab', 'ab'])
			.map((bit) => (bit ? '1' : '0'))
			.join('');
		expect(bits).toMatchInlineSnapshot(`"010110100100010101010010000"`);
	});

	it('keeps empty strings', () => {
		expect(roundTrip([''])).toStrictEqual(['']);
		expect(roundTrip(['', '', ''])).toStrictEqual(['', '', '']);
		expect(roundTrip(['a', '', 'b', ''])).toStrictEqual(['a', '', 'b', '']);
	});

	it('keeps code points of every size, emoji and lone surrogates', () => {
		const strings = ['\0', 'a\x7f', 'é߿', 'ࠀ€￿', '𐀀🧸\u{10ffff}', 'x\ud800y', '\udc00', '🧸🧸🧸'];
		expect(roundTrip(strings)).toStrictEqual(strings);
	});

	it('keeps a long string, whose counts are halved', () => {
		const string = 'ab'.repeat(70000) + 'c' + 'ab'.repeat(1000);
		expect(roundTrip([string, 'abc'])).toStrictEqual([string, 'abc']);
	});

	it('keeps random strings', () => {
		const next = random(42);
		const char = () => {
			const r = next();
			// mostly ASCII, some other planes, some surrogates on their own
			if (r < 0.6) return String.fromCodePoint(Math.floor(next() * 128));
			if (r < 0.8) return String.fromCodePoint(0x80 + Math.floor(next() * 0x780));
			if (r < 0.95) return String.fromCodePoint(Math.floor(next() * 0xd800));
			return String.fromCodePoint(0x10000 + Math.floor(next() * 0x100000));
		};
		for (let round = 0; round < 20; round++) {
			const strings = Array.from({ length: Math.floor(next() * 30) }, () =>
				Array.from({ length: Math.floor(next() * 40) }, char).join('')
			);
			expect(roundTrip(strings)).toStrictEqual(strings);
		}
	});

	it('reads only the bits of its block', () => {
		const strings = ['Pharmacy', 'Boots', 'Superdrug'];
		const block = encodeStrings(strings);
		// whatever follows the block does not change the strings
		expect(decodeStrings([...block, ...Array<boolean>(64).fill(true)], 3)).toStrictEqual(strings);
	});

	it('stops in a corrupt block instead of reading on', () => {
		const next = random(7);
		for (let round = 0; round < 50; round++) {
			const bits = Array.from({ length: 40 }, () => next() < 0.5);
			try {
				const strings = decodeStrings(bits, 3);
				expect(strings).toHaveLength(3);
			} catch (error) {
				expect(String(error)).toMatch(/beyond their block|Invalid code point/);
			}
		}
	});

	it('is fast enough to encode every edit', () => {
		const strings = stringsOf('examples/london-pharmacies.mapjson');
		const start = performance.now();
		const block = encodeStrings(strings);
		decodeStrings(block, strings.length);
		// a few milliseconds; generous for slow test machines
		expect(performance.now() - start).toBeLessThan(500);
	});
});
