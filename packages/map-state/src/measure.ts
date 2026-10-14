import { StateReader } from './reader.js';
import { encodeStrings } from './string_coder.js';
import { StateWriter } from './writer.js';
import type { MapState } from './types.js';

/**
 * What the bits of a link hold:
 * - `strings`: the texts of the map, e.g. labels, popups and its title, in one compressed block;
 * - `stringRefs`: where each of them is used;
 * - `coordinates`: the positions of the elements;
 * - `styles`: the styles of the elements and of the legend;
 * - `colors`: the palette of the colors that the styles use;
 * - `frame`: what a shared map shows when it opens;
 * - `background`: the background map;
 * - `structure`: all others, e.g. the types of the elements, flags, keys, counts, and the bits
 *   that fill the last character.
 * @category Links
 */
export type LinkKind =
	'strings' | 'stringRefs' | 'coordinates' | 'styles' | 'colors' | 'frame' | 'background' | 'structure';

/** @category Links */
export const LINK_KINDS: LinkKind[] = [
	'strings',
	'stringRefs',
	'coordinates',
	'styles',
	'colors',
	'frame',
	'background',
	'structure'
];

/**
 * The size of a link, and where its bits go.
 * @category Links
 */
export interface LinkMeasure {
	/** The length of the link's base64 string, each character 6 bits. */
	characters: number;
	bits: number;
	/** The bits of each kind, which add up to `bits`. */
	kinds: Record<LinkKind, number>;
}

/**
 * The kinds of bits, by the innermost of these read methods that reads them. The reader, not the
 * writer: the writer tries out several encodings of each style and keeps only the shortest, while
 * the reader reads exactly the bits of the link.
 */
const KIND_OF_READ: Record<string, LinkKind> = {
	readStringTable: 'strings',
	readStringRef: 'stringRefs',
	readElementPoint: 'coordinates',
	readElementPoints: 'coordinates',
	readStyle: 'styles',
	readElementStyles: 'styles',
	readPalette: 'colors',
	readFrame: 'frame',
	readBackground: 'background'
};

/**
 * The groups of the texts of a map, by where they are used. The words of the format (e.g. the names
 * of symbols and fonts) are none of them.
 * @category Links
 */
export type TextGroup = 'title' | 'label' | 'popup' | 'legend';

/** @category Links */
export const TEXT_GROUPS: TextGroup[] = ['title', 'label', 'popup', 'legend'];

/**
 * The read methods whose strings belong to a group of texts. `readText` gets the group as its
 * argument; a legend entry reads its label as a string reference.
 */
const GROUP_OF_READ: Record<string, (args: unknown[]) => TextGroup> = {
	readText: ([what]) => what as TextGroup,
	readLegendEntry: () => 'legend'
};

/** The texts of a link: the strings of its table, where each is used, and the bits of their references. */
export interface LinkTexts {
	/** The words of the format, the first section of the string table. */
	format: string[];
	/** The texts of the map, the second section of the string table. */
	strings: string[];
	/** Of each of `strings`, the groups of the places that use it. */
	groups: Set<TextGroup>[];
	/** The bits of the references to the texts, by the group of the place. */
	references: Record<TextGroup, number>;
}

/** Reads a link, and tells where its bits go and what its texts are. */
export function readMeasured(base64: string): { measure: LinkMeasure; texts: LinkTexts } {
	const reader = StateReader.fromBase64(base64);
	const total = reader.bits.length;
	const kinds = Object.fromEntries(LINK_KINDS.map((kind) => [kind, 0])) as Record<LinkKind, number>;
	const references = Object.fromEntries(TEXT_GROUPS.map((group) => [group, 0])) as Record<TextGroup, number>;
	const uses = new Map<string, Set<TextGroup>>();

	// the bits since `counted` belong to the kind of the innermost classified read
	let current: LinkKind = 'structure';
	let counted = 0;
	const count = () => {
		kinds[current] += reader.offset - counted;
		counted = reader.offset;
	};
	// the group of the innermost read of a text
	let group: TextGroup | undefined;

	const methods = reader as unknown as Record<string, (...args: unknown[]) => unknown>;
	const wrap = (name: string, around: (method: (...args: unknown[]) => unknown, args: unknown[]) => unknown) => {
		const method = methods[name].bind(reader);
		methods[name] = (...args: unknown[]) => around(method, args);
	};
	for (const [name, kind] of Object.entries(KIND_OF_READ)) {
		wrap(name, (method, args) => {
			count();
			const outer = current;
			current = kind;
			try {
				return method(...args);
			} finally {
				count();
				current = outer;
			}
		});
	}
	for (const [name, groupOf] of Object.entries(GROUP_OF_READ)) {
		wrap(name, (method, args) => {
			const outer = group;
			group = groupOf(args);
			try {
				return method(...args);
			} finally {
				group = outer;
			}
		});
	}
	// outside the wrap of `KIND_OF_READ`, so its own bits only
	wrap('readStringRef', (method, args) => {
		const start = reader.offset;
		const value = method(...args) as string;
		const format = args[0] === true;
		if (!format) {
			if (!group) throw new Error(`A text outside a group: ${value}`);
			references[group] += reader.offset - start;
			let groups = uses.get(value);
			if (!groups) uses.set(value, (groups = new Set()));
			groups.add(group);
		}
		return value;
	});

	reader.readRoot();
	count();
	// the bits that fill the last character
	kinds.structure += total - reader.offset;

	const [format, strings] = (reader as unknown as { strings: [string[], string[]] }).strings;
	const groups = strings.map((value) => uses.get(value) ?? new Set<TextGroup>());
	return {
		measure: { characters: base64.length, bits: total, kinds },
		texts: { format, strings, groups, references }
	};
}

/**
 * Where the bits of a link go, e.g. to tell an author what makes a link long. Throws like
 * `decodeState` if the link cannot be read.
 * @category Links
 */
export function measureLink(base64: string): LinkMeasure {
	return readMeasured(base64).measure;
}

/**
 * Where the bits of the link of a map go, see `measureLink`. `resolution`: as for `encodeState`.
 * @category Links
 */
export function measureState(state: MapState, options: { resolution?: number } = {}): LinkMeasure {
	const writer = new StateWriter(options);
	writer.writeRoot(state);
	return measureLink(writer.asBase64());
}

/**
 * The bits of the texts of a link, by their group, e.g. to tell an author which texts make a link
 * long: of each group the bits of its references, and its share of the block of the strings.
 *
 * The block is compressed by a model that learns while it codes, so what a string costs depends on
 * the strings before it, and no split of the block is exact. This one is fair: the Shapley value.
 * The block is encoded with the texts of each subset of the groups; the share of a group is what
 * adding it saves, averaged over all the orders in which the groups could be added. The shares add
 * up to the bits of all texts; what two groups have in common, e.g. words that both use, is split
 * evenly between them; a text used in two groups is in a subset if one of them is.
 *
 * The groups add up to less than the kinds `strings` and `stringRefs` of {@link measureLink}: the
 * rest are the words of the format (e.g. the names of symbols and fonts), the number of strings
 * and the end of the block. Shares are fractions of bits. A map with up to 4 groups encodes the
 * block up to 16 times, which takes some milliseconds for a map of hundreds of texts. Throws like
 * `decodeState` if the link cannot be read.
 * @category Links
 */
export function measureTexts(base64: string): Record<TextGroup, number> {
	const { format, strings, groups, references } = readMeasured(base64).texts;
	const result = { ...references };

	// the groups that the map uses, and the bits of the block with the texts of each subset of them
	const used = TEXT_GROUPS.filter((group) => groups.some((of) => of.has(group)));
	const blockOf = (subset: number) => {
		const present = new Set(used.filter((_, i) => subset & (1 << i)));
		// a string that no group uses would be in each subset; the writer writes none
		const texts = strings.filter((_, i) => groups[i].size === 0 || [...groups[i]].some((group) => present.has(group)));
		return encodeStrings([...format, ...texts], format.length).length;
	};
	const count = used.length;
	const sizes = Array.from({ length: 1 << count }, (_, subset) => blockOf(subset));

	// the share of a group: its savings with each subset of the others, weighted by how many of the
	// orders of all groups add it right after this subset
	const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
	used.forEach((group, i) => {
		for (let subset = 0; subset < sizes.length; subset++) {
			if (subset & (1 << i)) continue;
			let size = 0;
			for (let rest = subset; rest > 0; rest &= rest - 1) size++;
			const weight = (factorial(size) * factorial(count - size - 1)) / factorial(count);
			result[group] += weight * (sizes[subset | (1 << i)] - sizes[subset]);
		}
	});
	return result;
}
