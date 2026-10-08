import { StateReader } from './reader.js';
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
 * Where the bits of a link go, e.g. to tell an author what makes a link long. Throws like
 * `decodeState` if the link cannot be read.
 * @category Links
 */
export function measureLink(base64: string): LinkMeasure {
	const reader = StateReader.fromBase64(base64);
	const total = reader.bits.length;
	const kinds = Object.fromEntries(LINK_KINDS.map((kind) => [kind, 0])) as Record<LinkKind, number>;

	// the bits since `counted` belong to the kind of the innermost classified read
	let current: LinkKind = 'structure';
	let counted = 0;
	const count = () => {
		kinds[current] += reader.offset - counted;
		counted = reader.offset;
	};
	const methods = reader as unknown as Record<string, (...args: unknown[]) => unknown>;
	for (const [name, kind] of Object.entries(KIND_OF_READ)) {
		const method = methods[name];
		methods[name] = function (this: StateReader, ...args: unknown[]) {
			count();
			const outer = current;
			current = kind;
			try {
				return method.apply(this, args);
			} finally {
				count();
				current = outer;
			}
		};
	}

	reader.readRoot();
	count();
	// the bits that fill the last character
	kinds.structure += total - reader.offset;
	return { characters: base64.length, bits: total, kinds };
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
