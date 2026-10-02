/**
 * The strings of the string table as one block of bits: an adaptive model predicts each character
 * from the two before it, and an arithmetic coder spends fewer bits on the likelier characters.
 * The model starts empty and learns the strings while they are coded, so text in any language and
 * script gets shorter, and repeated words and names cost little. Only the words of the format, e.g.
 * the options of the background map, have a model that learned them before (`STRING_PRIMER`).
 *
 * The model is PPM (prediction by partial matching) of order 2 with escape method C and with
 * exclusion: a symbol is coded in the context of the two symbols before it; if it was never seen
 * there, an escape is coded and the context of one symbol before is tried, then of none, then the
 * symbol itself. The coder is the integer arithmetic coder of Witten, Neal and Cleary, with 32-bit
 * bounds. Everything is exact integer arithmetic below 2^53, so every browser decodes the same.
 */

import { STRING_PRIMER } from './string_primer.js';

/** The symbols are the code points of the strings, and this one after each string. */
const END = -1;

/** A context with a total above this halves its counts, so `range × total` stays exact. */
const MAX_TOTAL = 2 ** 16;

/** The bit sizes of the code points of a symbol that no context has seen: 1 of 5 kinds, with END. */
const NEW_SYMBOL_BITS = [0, 7, 11, 16, 21];

const TOP = 2 ** 32 - 1;
const HALF = 2 ** 31;
const QUARTER = 2 ** 30;

/**
 * The symbols seen after a context, with how often, in the order they were first seen there (the
 * order of their cumulative frequencies).
 */
class Context {
	symbols: number[] = [];
	counts: number[] = [];
	total = 0;

	add(symbol: number) {
		const index = this.symbols.indexOf(symbol);
		if (index < 0) {
			this.symbols.push(symbol);
			this.counts.push(1);
		} else {
			this.counts[index]++;
		}
		this.total++;
		if (this.total + this.symbols.length > MAX_TOTAL) {
			this.total = 0;
			for (let i = 0; i < this.counts.length; i++) {
				this.counts[i] = Math.ceil(this.counts[i] / 2);
				this.total += this.counts[i];
			}
		}
	}
}

/** The contexts of order 2, 1 and 0. Encoder and decoder update them identically. */
class Model {
	private order2 = new Map<string, Context>();
	private order1 = new Map<number, Context>();
	private order0 = new Context();

	/** A model that has learned `primer`, as if it were coded before (see `STRING_PRIMER`). */
	constructor(primer: readonly string[] = []) {
		for (const string of primer) {
			let a = END;
			let b = END;
			for (const char of string) {
				const symbol = char.codePointAt(0)!;
				this.update(a, b, symbol);
				a = b;
				b = symbol;
			}
			this.update(a, b, END);
		}
	}

	/** The contexts of a symbol after `a` and `b`, the longest first; those not seen so far are missing. */
	contexts(a: number, b: number): Context[] {
		const contexts: Context[] = [];
		const context2 = this.order2.get(`${a},${b}`);
		if (context2) contexts.push(context2);
		const context1 = this.order1.get(b);
		if (context1) contexts.push(context1);
		if (this.order0.total > 0) contexts.push(this.order0);
		return contexts;
	}

	update(a: number, b: number, symbol: number) {
		const key = `${a},${b}`;
		let context2 = this.order2.get(key);
		if (!context2) this.order2.set(key, (context2 = new Context()));
		context2.add(symbol);
		let context1 = this.order1.get(b);
		if (!context1) this.order1.set(b, (context1 = new Context()));
		context1.add(symbol);
		this.order0.add(symbol);
	}
}

/**
 * The frequencies of a context without the excluded symbols: the symbols left, with the escape
 * after them, whose frequency is their number. Undefined if no symbol is left.
 */
function frequencies(context: Context, excluded: Set<number>): { sum: number; escape: number } | undefined {
	let sum = 0;
	let escape = 0;
	for (let i = 0; i < context.symbols.length; i++) {
		if (excluded.has(context.symbols[i])) continue;
		sum += context.counts[i];
		escape++;
	}
	return escape > 0 ? { sum, escape } : undefined;
}

/** The size of a code point that no context has seen: the index of its kind in `NEW_SYMBOL_BITS`. */
function newSymbolKind(symbol: number): number {
	if (symbol === END) return 0;
	if (symbol < 2 ** 7) return 1;
	if (symbol < 2 ** 11) return 2;
	if (symbol < 2 ** 16) return 3;
	return 4;
}

class Encoder {
	bits: boolean[] = [];
	private low = 0;
	private high = TOP;
	private pending = 0;

	/** Narrows the interval to the frequencies `from` to `to` (exclusive) of `total`. */
	encode(from: number, to: number, total: number) {
		const range = this.high - this.low + 1;
		this.high = this.low + Math.floor((range * to) / total) - 1;
		this.low = this.low + Math.floor((range * from) / total);
		while (true) {
			if (this.high < HALF) {
				this.output(false);
			} else if (this.low >= HALF) {
				this.output(true);
				this.low -= HALF;
				this.high -= HALF;
			} else if (this.low >= QUARTER && this.high < 3 * QUARTER) {
				// the interval straddles the middle: its next bit is decided later
				this.pending++;
				this.low -= QUARTER;
				this.high -= QUARTER;
			} else {
				break;
			}
			this.low = 2 * this.low;
			this.high = 2 * this.high + 1;
		}
	}

	private output(bit: boolean) {
		this.bits.push(bit);
		for (; this.pending > 0; this.pending--) this.bits.push(!bit);
	}

	/** The bits that pick a number inside the final interval. */
	finish(): boolean[] {
		this.pending++;
		this.output(this.low >= QUARTER);
		return this.bits;
	}
}

class Decoder {
	private low = 0;
	private high = TOP;
	private value = 0;
	private offset = 0;
	// the shifts of the interval, each a bit that the encoder wrote
	private shifts = 0;

	constructor(private readonly bits: boolean[]) {
		for (let i = 0; i < 32; i++) this.value = 2 * this.value + this.nextBit();
	}

	/**
	 * Beyond the block, the bits of what follows it, or zeros at the end: the 2 bits of the flush
	 * of the encoder make the strings the same, whatever follows.
	 */
	private nextBit(): number {
		// the decoder reads at most 32 bits ahead, so it is in an endless string of corrupt data
		if (this.offset > this.bits.length + 64) throw new Error('The strings go beyond their block');
		return this.bits[this.offset++] ? 1 : 0;
	}

	/** The frequency of `total` that the interval points to, for `decode` to narrow it to its symbol. */
	target(total: number): number {
		const range = this.high - this.low + 1;
		return Math.floor(((this.value - this.low + 1) * total - 1) / range);
	}

	/** See `Encoder.encode`. */
	decode(from: number, to: number, total: number) {
		const range = this.high - this.low + 1;
		this.high = this.low + Math.floor((range * to) / total) - 1;
		this.low = this.low + Math.floor((range * from) / total);
		while (true) {
			if (this.high < HALF) {
				// nothing to subtract
			} else if (this.low >= HALF) {
				this.low -= HALF;
				this.high -= HALF;
				this.value -= HALF;
			} else if (this.low >= QUARTER && this.high < 3 * QUARTER) {
				this.low -= QUARTER;
				this.high -= QUARTER;
				this.value -= QUARTER;
			} else {
				break;
			}
			this.low = 2 * this.low;
			this.high = 2 * this.high + 1;
			this.value = 2 * this.value + this.nextBit();
			this.shifts++;
		}
	}

	/**
	 * The number of bits that the encoder wrote: one for each shift of the interval, and the 2 of
	 * its flush (see `Encoder.finish`). So the block needs no length of its own.
	 */
	get length(): number {
		return this.shifts + 2;
	}

	/** The shifts so far, each a bit that the encoder wrote. */
	get shiftCount(): number {
		return this.shifts;
	}
}

/**
 * The strings as one block of bits; `decodeStrings` needs their number. The first `formatCount`
 * are words of the format, e.g. the options of the background map as JSON: a model that has
 * learned `STRING_PRIMER` codes them. The others, e.g. labels in any language, get an empty model,
 * which the words of the format would only make worse at text.
 */
export function encodeStrings(strings: string[], formatCount = 0): boolean[] {
	let model = new Model(formatCount > 0 ? STRING_PRIMER : []);
	const encoder = new Encoder();
	for (const [n, string] of strings.entries()) {
		if (n === formatCount && n > 0) model = new Model();
		const symbols = [...string].map((char) => char.codePointAt(0)!);
		symbols.push(END);
		let a = END;
		let b = END;
		for (const symbol of symbols) {
			const excluded = new Set<number>();
			let coded = false;
			for (const context of model.contexts(a, b)) {
				const frequency = frequencies(context, excluded);
				if (!frequency) continue;
				const total = frequency.sum + frequency.escape;
				let from = 0;
				const index = context.symbols.indexOf(symbol);
				if (index >= 0 && !excluded.has(symbol)) {
					for (let i = 0; i < index; i++) if (!excluded.has(context.symbols[i])) from += context.counts[i];
					encoder.encode(from, from + context.counts[index], total);
					coded = true;
					break;
				}
				encoder.encode(frequency.sum, total, total);
				for (const seen of context.symbols) excluded.add(seen);
			}
			if (!coded) {
				// a symbol that no context has seen: its kind, then its code point
				const kind = newSymbolKind(symbol);
				encoder.encode(kind, kind + 1, NEW_SYMBOL_BITS.length);
				for (let bit = NEW_SYMBOL_BITS[kind] - 1; bit >= 0; bit--) {
					const value = Math.floor(symbol / 2 ** bit) % 2;
					encoder.encode(value, value + 1, 2);
				}
			}
			model.update(a, b, symbol);
			a = b;
			b = symbol;
		}
	}
	return encoder.finish();
}

/** The `count` strings of a block of `encodeStrings`, the first `formatCount` words of the format. */
export function decodeStrings(bits: boolean[], count: number, formatCount = 0): string[] {
	return decodeStringBlock(bits, count, formatCount).strings;
}

/**
 * The strings at the start of `bits` (see `decodeStrings`), and the length of their block, after
 * which the bits go on. `bits`: the bits of each string, the last with the 2 of the flush; they add
 * up to `length`, e.g. to analyse which strings are long.
 */
export function decodeStringBlock(
	bits: boolean[],
	count: number,
	formatCount = 0
): { strings: string[]; length: number; bits: number[] } {
	let model = new Model(formatCount > 0 ? STRING_PRIMER : []);
	const decoder = new Decoder(bits);
	const strings: string[] = [];
	// the shifts while decoding each string, its bits
	const stringBits: number[] = [];
	let shiftsBefore = 0;
	for (let n = 0; n < count; n++) {
		if (n === formatCount && n > 0) model = new Model();
		const codePoints: number[] = [];
		let a = END;
		let b = END;
		while (true) {
			const excluded = new Set<number>();
			let symbol: number | undefined;
			for (const context of model.contexts(a, b)) {
				const frequency = frequencies(context, excluded);
				if (!frequency) continue;
				const total = frequency.sum + frequency.escape;
				const target = decoder.target(total);
				let from = 0;
				for (let i = 0; i < context.symbols.length && symbol === undefined; i++) {
					if (excluded.has(context.symbols[i])) continue;
					if (target < from + context.counts[i]) {
						symbol = context.symbols[i];
						decoder.decode(from, from + context.counts[i], total);
					} else {
						from += context.counts[i];
					}
				}
				if (symbol !== undefined) break;
				decoder.decode(frequency.sum, total, total);
				for (const seen of context.symbols) excluded.add(seen);
			}
			if (symbol === undefined) {
				const kind = Math.min(decoder.target(NEW_SYMBOL_BITS.length), NEW_SYMBOL_BITS.length - 1);
				decoder.decode(kind, kind + 1, NEW_SYMBOL_BITS.length);
				symbol = kind === 0 ? END : 0;
				for (let bit = 0; bit < NEW_SYMBOL_BITS[kind]; bit++) {
					const value = decoder.target(2) > 0 ? 1 : 0;
					decoder.decode(value, value + 1, 2);
					symbol = 2 * symbol + value;
				}
				if (symbol > 0x10ffff) throw new Error(`Invalid code point: ${symbol}`);
			}
			model.update(a, b, symbol);
			if (symbol === END) break;
			codePoints.push(symbol);
			a = b;
			b = symbol;
		}
		// in chunks: spreading a long array into the arguments overflows the stack
		let string = '';
		for (let i = 0; i < codePoints.length; i += 8192) string += String.fromCodePoint(...codePoints.slice(i, i + 8192));
		strings.push(string);
		stringBits.push(decoder.shiftCount - shiftsBefore);
		shiftsBefore = decoder.shiftCount;
	}
	if (stringBits.length > 0) stringBits[stringBits.length - 1] += 2;
	return { strings, length: decoder.length, bits: stringBits };
}
