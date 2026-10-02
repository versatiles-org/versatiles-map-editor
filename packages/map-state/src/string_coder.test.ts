import { globSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { decodeStringBlock, decodeStrings, encodeStrings } from './string_coder.js';
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

	it('codes the words of the format with a model that learned them before', () => {
		const background =
			'{"builder":"satellite","options":{"raster":{"brightnessMin":0.2},"osmOverlay":{"theme":"gray"}}}';
		const primed = encodeStrings([background, 'noto_sans_bold'], 2).length;
		const empty = encodeStrings([background, 'noto_sans_bold']).length;
		expect(primed).toBeLessThan(empty / 2);
		// a change of the primer changes these bits: links written before cannot be read
		expect(primed).toMatchInlineSnapshot(`170`);
	});

	it('keeps the words of the format and the other strings', () => {
		const strings = ['{"builder":"osm","options":{}}', 'okabe-ito', 'Москва 🧸', '', 'noto_sans_bold'];
		for (const formatCount of [0, 1, 2, 5]) {
			expect(decodeStrings(encodeStrings(strings, formatCount), strings.length, formatCount)).toStrictEqual(strings);
		}
	});

	it('codes the other strings with an empty model, which the words of the format do not make worse', () => {
		const text = ['Площадь Революции', 'Маяковская'];
		const alone = encodeStrings(text).length;
		const after = encodeStrings(['{"builder":"osm","options":{"theme":"gray"}}', ...text], 1).length;
		const format = encodeStrings(['{"builder":"osm","options":{"theme":"gray"}}'], 1).length;
		// the bits of both parts, give or take the few of the end of the coder
		expect(Math.abs(after - format - alone)).toBeLessThanOrEqual(3);
	});

	it('keeps empty strings', () => {
		expect(roundTrip([''])).toStrictEqual(['']);
		expect(roundTrip(['a', '', 'b'])).toStrictEqual(['a', '', 'b']);
		// one in each section
		expect(decodeStrings(encodeStrings(['', 'a', ''], 2), 3, 2)).toStrictEqual(['', 'a', '']);
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
			// each once, as the writer gives them
			const strings = [
				...new Set(
					Array.from({ length: Math.floor(next() * 30) }, () =>
						Array.from({ length: Math.floor(next() * 40) }, char).join('')
					)
				)
			];
			expect(roundTrip(strings)).toStrictEqual(strings);
		}
	});

	it('knows the length of its block, whatever follows it', () => {
		const next = random(3);
		const cases = [
			['Pharmacy', 'Boots', 'Superdrug'],
			[''],
			['a'],
			...files.map(stringsOf).filter((strings) => strings.length > 0)
		];
		for (const strings of cases) {
			for (const formatCount of [0, 1]) {
				const block = encodeStrings(strings, formatCount);
				for (const after of [[], Array<boolean>(64).fill(true), Array.from({ length: 64 }, () => next() < 0.5)]) {
					const decoded = decodeStringBlock([...block, ...after], strings.length, formatCount);
					expect(decoded.strings).toStrictEqual(strings);
					expect(decoded.length).toBe(block.length);
					// the bits of the strings add up to the block
					expect(decoded.bits).toHaveLength(strings.length);
					expect(decoded.bits.reduce((sum, bits) => sum + bits, 0)).toBe(block.length);
				}
			}
		}
	});

	it('stops in a corrupt block instead of reading on', () => {
		const next = random(7);
		for (let round = 0; round < 50; round++) {
			const bits = Array.from({ length: 40 }, () => next() < 0.5);
			try {
				const strings = decodeStrings(bits, 3);
				expect(strings).toHaveLength(3);
			} catch (error) {
				expect(String(error)).toMatch(/beyond their block|Invalid code point|twice in its section/);
			}
		}
	});

	it('refuses a string twice in its section, which the writer never writes', () => {
		expect(() => decodeStrings(encodeStrings(['ab', 'ab']), 2)).toThrow(/twice in its section/);
		// e.g. an empty string, which costs almost no bits: a short link would make millions of them
		expect(() => decodeStrings(encodeStrings(['', '']), 2)).toThrow(/twice in its section/);
		// once in each section
		expect(decodeStrings(encodeStrings(['ab', 'ab'], 1), 2, 1)).toStrictEqual(['ab', 'ab']);
	});

	it('stops at 2^22 symbols, which a hostile link could code in a few bits', () => {
		const longest = 'a'.repeat(2 ** 22 - 1);
		const block = encodeStrings([longest]);
		expect(block.length).toBeLessThan(1000);
		expect(decodeStrings(block, 1)).toStrictEqual([longest]);
		// with one END more: a further string after the block
		expect(() => decodeStrings(block, 2)).toThrow(/More than 4194304 symbols/);
		expect(() => encodeStrings([longest + 'a'])).toThrow(/too long/);
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
