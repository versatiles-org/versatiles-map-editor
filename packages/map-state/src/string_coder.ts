/**
 * The strings of the string table as one block of bits: an adaptive model predicts each character
 * from the four before it, and an arithmetic coder spends fewer bits on the likelier characters.
 * The model starts empty and learns the strings while they are coded, so text in any language and
 * script gets shorter, and repeated words and names cost little. Only the words of the format, e.g.
 * the options of the background map, have a model that learned them before (`STRING_PRIMER`).
 *
 * The model is PPM (prediction by partial matching) of order 4 with escape method D, exclusion and
 * update exclusion: a symbol is coded in the context of the four symbols before it (at the start
 * of a string, fewer and END); if it was never seen there, an escape is coded and the context of
 * three symbols before is tried, and so on down to none, then the symbol itself. Method D: a
 * symbol seen n times counts 2n − 1, the escape as many as the context has symbols. Update
 * exclusion: only the context that had the symbol and the longer ones learn it, so the short
 * contexts are not dominated by frequent symbols. (Measured against order 2 with method C and
 * without update exclusion: the string tables of the examples about 7 % shorter.) The coder is the
 * integer arithmetic coder of Witten, Neal and Cleary, with 32-bit bounds. Everything is exact
 * integer arithmetic below 2^53, so every browser decodes the same.
 */

import { STRING_PRIMER } from './string_primer.js';

/** The symbols are the code points of the strings, and this one after each string. */
const END = -1;

/** The longest context, in symbols. */
const ORDER = 4;

/** A context with a total above this halves its counts, so `range × total` stays exact. */
const MAX_TOTAL = 2 ** 16;

/**
 * The most symbols of a block: code points and END. A likely symbol costs only a fraction of a
 * bit, so a few bits of a hostile link could otherwise decode to millions of strings or code
 * points. Far more than a map has (1.7 million code points of 20,000 popups decode in 0.3 s).
 */
const MAX_SYMBOLS = 2 ** 22;

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

/**
 * The contexts of order 0 to `ORDER`, by the symbols before (at the start of a string, END for
 * those before it). Encoder and decoder update them identically.
 */
class Model {
	private byOrder: Map<string, Context>[] = Array.from({ length: ORDER + 1 }, () => new Map());

	/** A model that has learned `primer`, as if it were coded before (see `STRING_PRIMER`), in all its contexts. */
	constructor(primer: readonly string[] = []) {
		for (const string of primer) {
			const before = start();
			for (const char of string) {
				const symbol = char.codePointAt(0)!;
				this.update(before, symbol, 0);
				shift(before, symbol);
			}
			this.update(before, END, 0);
		}
	}

	/** The contexts of a symbol after the symbols `before`, the longest first, with their order; those not seen so far are missing. */
	contexts(before: number[]): { order: number; context: Context }[] {
		const found: { order: number; context: Context }[] = [];
		for (let order = ORDER; order >= 0; order--) {
			const context = this.byOrder[order].get(key(before, order));
			if (context) found.push({ order, context });
		}
		return found;
	}

	/** Learn the symbol in the contexts of order `from` to `ORDER`: update exclusion, see above. */
	update(before: number[], symbol: number, from: number) {
		for (let order = from; order <= ORDER; order++) {
			const k = key(before, order);
			let context = this.byOrder[order].get(k);
			if (!context) this.byOrder[order].set(k, (context = new Context()));
			context.add(symbol);
		}
	}
}

/** The symbols before the first of a string: END. */
function start(): number[] {
	return new Array<number>(ORDER).fill(END);
}

/** The symbols before the next one, after `symbol`. */
function shift(before: number[], symbol: number) {
	before.shift();
	before.push(symbol);
}

/** The key of the context of the last `order` symbols. */
function key(before: number[], order: number): string {
	return before.slice(ORDER - order).join(',');
}

/** The frequency of a symbol seen `count` times, by escape method D. */
const weight = (count: number) => 2 * count - 1;

/**
 * The frequencies of a context without the excluded symbols: the symbols left, with the escape
 * after them, whose frequency is their number. Undefined if no symbol is left.
 */
function frequencies(context: Context, excluded: Set<number>): { sum: number; escape: number } | undefined {
	let sum = 0;
	let escape = 0;
	for (let i = 0; i < context.symbols.length; i++) {
		if (excluded.has(context.symbols[i])) continue;
		sum += weight(context.counts[i]);
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
 * The strings as one block of bits; `decodeStringBlock` needs their number. The first `formatCount`
 * are words of the format, e.g. the options of the background map as JSON: a model that has
 * learned `STRING_PRIMER` codes them. The others, e.g. labels in any language, get an empty model,
 * which the words of the format would only make worse at text. The decoder refuses a string
 * twice in its section, which the writer never writes, and more than `MAX_SYMBOLS` symbols.
 */
export function encodeStrings(strings: string[], formatCount = 0): boolean[] {
	let model = new Model(formatCount > 0 ? STRING_PRIMER : []);
	const encoder = new Encoder();
	let symbolCount = 0;
	for (const [n, string] of strings.entries()) {
		if (n === formatCount && n > 0) model = new Model();
		const symbols = [...string].map((char) => char.codePointAt(0)!);
		symbols.push(END);
		// what the decoder would refuse
		symbolCount += symbols.length;
		if (symbolCount > MAX_SYMBOLS)
			throw new Error(`The texts of the map are too long: more than ${MAX_SYMBOLS} characters`);
		const before = start();
		for (const symbol of symbols) {
			const excluded = new Set<number>();
			// the order of the context that had the symbol: it and the longer ones learn it
			let found: number | undefined;
			for (const { order, context } of model.contexts(before)) {
				const frequency = frequencies(context, excluded);
				if (!frequency) continue;
				const total = frequency.sum + frequency.escape;
				let from = 0;
				const index = context.symbols.indexOf(symbol);
				if (index >= 0 && !excluded.has(symbol)) {
					for (let i = 0; i < index; i++) if (!excluded.has(context.symbols[i])) from += weight(context.counts[i]);
					encoder.encode(from, from + weight(context.counts[index]), total);
					found = order;
					break;
				}
				encoder.encode(frequency.sum, total, total);
				for (const seen of context.symbols) excluded.add(seen);
			}
			if (found === undefined) {
				// a symbol that no context has seen: its kind, then its code point
				const kind = newSymbolKind(symbol);
				encoder.encode(kind, kind + 1, NEW_SYMBOL_BITS.length);
				for (let bit = NEW_SYMBOL_BITS[kind] - 1; bit >= 0; bit--) {
					const value = Math.floor(symbol / 2 ** bit) % 2;
					encoder.encode(value, value + 1, 2);
				}
			}
			model.update(before, symbol, found ?? 0);
			shift(before, symbol);
		}
	}
	return encoder.finish();
}

/**
 * The strings at the start of `bits` (see `encodeStrings`), and the length of their block, after
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
	let symbolCount = 0;
	// the strings of the section so far: the encoder writes each once (see `StateWriter.writeStringTable`)
	let seen = new Set<string>();
	for (let n = 0; n < count; n++) {
		if (n === formatCount && n > 0) {
			model = new Model();
			seen = new Set();
		}
		const codePoints: number[] = [];
		const before = start();
		while (true) {
			if (++symbolCount > MAX_SYMBOLS) throw new Error(`More than ${MAX_SYMBOLS} symbols in the strings`);
			const excluded = new Set<number>();
			let symbol: number | undefined;
			let found: number | undefined;
			for (const { order, context } of model.contexts(before)) {
				const frequency = frequencies(context, excluded);
				if (!frequency) continue;
				const total = frequency.sum + frequency.escape;
				const target = decoder.target(total);
				let from = 0;
				for (let i = 0; i < context.symbols.length && symbol === undefined; i++) {
					if (excluded.has(context.symbols[i])) continue;
					if (target < from + weight(context.counts[i])) {
						symbol = context.symbols[i];
						decoder.decode(from, from + weight(context.counts[i]), total);
						found = order;
					} else {
						from += weight(context.counts[i]);
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
			model.update(before, symbol, found ?? 0);
			if (symbol === END) break;
			codePoints.push(symbol);
			shift(before, symbol);
		}
		// in chunks: spreading a long array into the arguments overflows the stack
		let string = '';
		for (let i = 0; i < codePoints.length; i += 8192) string += String.fromCodePoint(...codePoints.slice(i, i + 8192));
		if (seen.has(string)) throw new Error(`A string twice in its section: ${JSON.stringify(string.slice(0, 50))}`);
		seen.add(string);
		strings.push(string);
		stringBits.push(decoder.shiftCount - shiftsBefore);
		shiftsBefore = decoder.shiftCount;
	}
	if (stringBits.length > 0) stringBits[stringBits.length - 1] += 2;
	return { strings, length: decoder.length, bits: stringBits };
}
