#!/usr/bin/env node
/**
 * Where the bits of an encoded map go: encodes .mapjson files, decodes them again with a reader
 * that records every read method with the bits it consumed, and prints the calls as a tree. The
 * reader, not the writer: the writer tries out several encodings of each style and keeps only the
 * shortest, while the reader reads exactly the bits of the link.
 *
 *     npm run analyse-bits --workspace @versatiles/map-state -- [options] [files…]
 *
 * Without files, all examples. It reads the built package, so the npm script builds it first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';
import {
	boundsOf,
	encodeState,
	exponentForResolution,
	LINK_KINDS,
	measureLink,
	resolutionForArea,
	resolutionOfExponent,
	stateFromMapJSON
} from '../dist/index.js';
import { StateReader } from '../dist/reader.js';
import { decodeStringBlock } from '../dist/string_coder.js';

const HELP = `Usage: analyse_bits.mjs [options] [files…]

Options:
  --depth <n>          show the tree to this depth (default: all)
  --expand             a line per call, instead of the calls of the same method merged
  --min-percent <p>    merge the lines below p % of the bits into one (default: 0)
  --summary            a line per map instead of the tree: bits, characters, shares by kind
  --json               the summary and the tree as JSON, e.g. to compare two runs with diff
  --resolution <m>     the precision of the coordinates in meters, or "auto" as the share dialog
                       chooses it: fine enough for the frame, else the elements (default: auto)
  --help               this text`;

// the kinds of bits of `measureLink` of the package, which the share dialog shows too, by their names here
const KIND_TITLES = { stringRefs: 'string refs' };
const KIND_NAMES = LINK_KINDS.map((kind) => KIND_TITLES[kind] ?? kind);

// the methods that read bits themselves: leaves of the tree, which also call each other
const PRIMITIVES = new Set(['readBit', 'readInteger', 'readVarint', 'readExpGolomb', 'readBlock']);

/** A reader that records each call of a read method: its name, and the bits it consumed. */
class TracingReader extends StateReader {
	constructor(bits) {
		super(bits);
		this.root = { name: 'total', start: 0, end: 0, children: [] };
		this.stack = [this.root];
	}
}

for (const name of Object.getOwnPropertyNames(StateReader.prototype)) {
	const descriptor = Object.getOwnPropertyDescriptor(StateReader.prototype, name);
	// only methods, e.g. not the getter of the grid
	if (!name.startsWith('read') || typeof descriptor.value !== 'function') continue;
	const method = descriptor.value;
	TracingReader.prototype[name] = function (...args) {
		const parent = this.stack.at(-1);
		// the reads inside a primitive belong to it
		if (parent.primitive) return method.apply(this, args);
		const span = {
			name: label(name, args, parent.name),
			primitive: PRIMITIVES.has(name),
			start: this.offset,
			children: []
		};
		parent.children.push(span);
		this.stack.push(span);
		try {
			const value = method.apply(this, args);
			// e.g. the number of strings, for `expandStringTables`
			if (span.primitive) span.value = value;
			return value;
		} catch (error) {
			// e.g. the type of a next element, in the padding of the last character
			if (span.primitive) span.name = '(padding)';
			throw error;
		} finally {
			span.end = this.offset;
			this.stack.pop();
		}
	};
}

// the read methods of key/value pairs, whose integers are their keys
const KEY_VALUE_READS = new Set([
	'readMetadata',
	'readLegend',
	'readLegendEntry',
	'readPopup',
	'readViewer',
	'readStylePatch',
	'readStyleKey'
]);

/**
 * The name of a call in the tree: primitives with their arguments, e.g. `int(4)` or `varint±`, and
 * the integers of key/value pairs as `key(4)`.
 */
function label(name, args, parent) {
	switch (name) {
		case 'readBit':
			return 'bit';
		case 'readInteger':
			return KEY_VALUE_READS.has(parent) ? `key(${args[0]})` : `int(${args[0]})`;
		case 'readVarint':
			return args[0] ? 'varint±' : 'varint';
		case 'readExpGolomb':
			return `expgolomb(${args[0]})${args[1] ? '±' : ''}`;
		case 'readBlock':
			return 'block';
		default:
			return name;
	}
}

/** Merges the calls into a tree of nodes: the calls of the same method under the same node in one, unless `expand`. */
function aggregate(
	span,
	expand,
	node = { name: span.name, primitive: span.primitive, count: 0, bits: 0, children: new Map() }
) {
	node.count++;
	node.bits += span.end - span.start;
	span.children.forEach((child, index) => {
		// a read at the end that found no bits
		if (child.end === child.start && child.name === '(padding)') return;
		const key = expand ? index : child.name;
		let childNode = node.children.get(key);
		if (!childNode) {
			childNode = { name: child.name, primitive: child.primitive, count: 0, bits: 0, children: new Map() };
			node.children.set(key, childNode);
		}
		aggregate(child, expand, childNode);
	});
	return node;
}

/** The lines of the tree, as `{ prefix, name, node }`, with the small nodes merged. */
function treeLines(node, options, total, prefix = '', depth = 0, lines = []) {
	if (depth >= options.depth) return lines;
	let children = [...node.children.values()];
	// bits that no child read, which would be a gap in the tracing
	const covered = children.reduce((sum, child) => sum + child.bits, 0);
	if (children.length > 0 && covered < node.bits) {
		children.push({ name: '(not traced)', count: 1, bits: node.bits - covered, children: new Map(), warning: true });
	}
	const small = children.filter((child) => (child.bits / total) * 100 < options.minPercent);
	if (small.length > 1) {
		children = children.filter((child) => !small.includes(child));
		children.push({
			name: `(${small.length} more)`,
			count: small.reduce((sum, child) => sum + child.count, 0),
			bits: small.reduce((sum, child) => sum + child.bits, 0),
			children: new Map(),
			merged: true
		});
	}
	children.forEach((child, index) => {
		const last = index === children.length - 1;
		lines.push({ prefix: prefix + (last ? '└─ ' : '├─ '), node: child, depth });
		treeLines(child, options, total, prefix + (last ? '   ' : '│  '), depth + 1, lines);
	});
	return lines;
}

/** A bar of `width` characters, filled by `fraction`, in eighths of a character. */
function bar(fraction, width) {
	const eighths = Math.round(fraction * width * 8);
	const full = '█'.repeat(Math.floor(eighths / 8));
	const part = eighths % 8 > 0 ? ' ▏▎▍▌▋▊▉'[eighths % 8] : '';
	return (full + part).padEnd(width);
}

const format = (n) => n.toLocaleString('en-US');
const formatStep = (meters) => (meters < 1000 ? `${meters.toFixed(1)} m` : `${(meters / 1000).toFixed(1)} km`);
const color = (style, text) => styleText(style, text);

/** The resolution of the share dialog: fine enough for the frame, else the elements; 1 m without either. */
function automaticResolution(state) {
	const area = state.frame?.bounds ?? boundsOf(state.elements);
	return (area && resolutionForArea(area)) || 1;
}

/** The bits of a map: the calls of its reader as a tree, and the bits of each kind (see `KINDS`). */
function analyse(state, base64, options) {
	const bits = StateReader.fromBase64(base64).bits;
	const reader = new TracingReader(bits);
	reader.readRoot();
	reader.root.end = bits.length;
	const unread = bits.length - reader.offset;
	if (unread > 0)
		reader.root.children.push({ name: '(padding)', start: reader.offset, end: bits.length, children: [] });

	expandStringTables(reader.root, bits);

	const elements = {};
	for (const element of state.elements) elements[element.type] = (elements[element.type] ?? 0) + 1;
	const tree = aggregate(reader.root, options.expand);
	return {
		bits: tree.bits,
		characters: base64.length,
		step: options.step,
		elements,
		kinds: Object.fromEntries(LINK_KINDS.map((kind, i) => [KIND_NAMES[i], measureLink(base64).kinds[kind]])),
		tree
	};
}

/**
 * The block of a string table as its 2 sections with their strings, each with its bits: the
 * table reads the number of strings, the number of words of the format, and the block, which is
 * decoded again here.
 */
function expandStringTables(span, bits) {
	if (span.name === 'readStringTable') {
		const [count, formatCount, block] = span.children;
		if (!block) return;
		const decoded = decodeStringBlock(bits.slice(block.start), count.value, formatCount.value);
		let offset = block.start;
		const section = (name, from, to) => {
			const start = offset;
			const children = decoded.strings.slice(from, to).map((string, i) => {
				const end = offset + decoded.bits[from + i];
				const child = { name: abbreviate(string), primitive: true, start: offset, end, children: [] };
				offset = end;
				return child;
			});
			return { name, start, end: offset, children };
		};
		block.children = [
			section('words of the format', 0, formatCount.value),
			section('other strings', formatCount.value, count.value)
		].filter((child) => child.children.length > 0);
		return;
	}
	for (const child of span.children) expandStringTables(child, bits);
}

/** A string as a short name in the tree, in quotes. */
function abbreviate(string) {
	const quoted = JSON.stringify(string);
	return quoted.length > 40 ? quoted.slice(0, 38) + '…"' : quoted;
}

function printTree(title, analysis, options) {
	const { tree, bits: total, characters, step, elements } = analysis;
	const lines = treeLines(tree, options, total);

	console.log(color(['bold', 'magenta'], title));
	console.log(
		color(
			'gray',
			`${format(total)} bits · ${format(characters)} characters · steps of ${formatStep(step)} · ` +
				Object.entries(elements)
					.map(([type, count]) => `${format(count)} ${type}${count === 1 ? '' : 's'}`)
					.join(', ')
		)
	);

	const width = Math.max(...lines.map((line) => line.prefix.length + line.node.name.length), 10);
	for (const { prefix, node } of lines) {
		const fraction = node.bits / total;
		const nameStyle = node.warning
			? 'red'
			: node.merged || node.primitive
				? 'gray'
				: node.name.startsWith('(')
					? 'yellow'
					: 'cyan';
		const columns = [
			color('gray', prefix) + color(nameStyle, node.name) + ' '.repeat(width - prefix.length - node.name.length),
			color('bold', format(node.bits).padStart(9)),
			(fraction * 100).toFixed(1).padStart(5) + '%',
			color('magenta', bar(fraction, 20))
		];
		if (node.count > 1) {
			columns.push(
				color('yellow', `×${format(node.count)}`.padStart(8)),
				color('gray', `⌀ ${(node.bits / node.count).toFixed(1)}`)
			);
		}
		console.log(columns.join('  '));
	}
	console.log();
}

/** A line per map: its bits, characters and the share of each kind, the largest in bold. */
function printSummary(analyses) {
	const width = Math.max(...analyses.map(({ title }) => title.length), 3);
	const header = [
		'map'.padEnd(width),
		'bits'.padStart(8),
		'chars'.padStart(7),
		'step'.padStart(8),
		...KIND_NAMES.map((k) => k.padStart(k.length > 7 ? k.length : 7))
	];
	console.log(color('gray', header.join('  ')));
	for (const { title, analysis } of analyses) {
		const largest = Math.max(...Object.values(analysis.kinds));
		const shares = KIND_NAMES.map((kind) => {
			const bits = analysis.kinds[kind];
			const cell = ((100 * bits) / analysis.bits).toFixed(1).padStart(Math.max(kind.length, 7) - 1) + '%';
			return bits === largest ? color('bold', cell) : bits === 0 ? color('gray', cell) : cell;
		});
		console.log(
			[
				color('magenta', title.padEnd(width)),
				color('bold', format(analysis.bits).padStart(8)),
				format(analysis.characters).padStart(7),
				formatStep(analysis.step).padStart(8),
				...shares
			].join('  ')
		);
	}
}

/** A node of the tree as JSON: its name, calls and bits, and its children. */
function nodeJSON(node) {
	const children = [...node.children.values()].map(nodeJSON);
	return { name: node.name, count: node.count, bits: node.bits, ...(children.length > 0 && { children }) };
}

function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			depth: { type: 'string' },
			expand: { type: 'boolean', default: false },
			'min-percent': { type: 'string', default: '0' },
			summary: { type: 'boolean', default: false },
			json: { type: 'boolean', default: false },
			resolution: { type: 'string', default: 'auto' },
			help: { type: 'boolean', default: false }
		}
	});
	if (values.help) return console.log(HELP);

	const options = {
		depth: values.depth === undefined ? Infinity : Number(values.depth),
		expand: values.expand,
		minPercent: Number(values['min-percent']),
		resolution: values.resolution === 'auto' ? 'auto' : Number(values.resolution)
	};

	let files = positionals;
	if (files.length === 0) {
		// the examples of the repository: two folders above the package
		const examples = join(dirname(fileURLToPath(import.meta.url)), '../../../examples');
		files = readdirSync(examples)
			.filter((name) => name.endsWith('.mapjson'))
			.sort()
			.map((name) => join(examples, name));
	}

	const analyses = files.map((file) => {
		const state = stateFromMapJSON(JSON.parse(readFileSync(file, 'utf8')));
		const resolution = options.resolution === 'auto' ? automaticResolution(state) : options.resolution;
		// the step of the grid that the encoder uses for this resolution
		const step = resolutionOfExponent(exponentForResolution(resolution));
		const analysis = analyse(state, encodeState(state, { resolution }), { ...options, step });
		return { title: basename(file), analysis };
	});
	if (values.json) {
		const json = analyses.map(({ title, analysis: { tree, ...summary } }) => ({
			map: title,
			...summary,
			tree: nodeJSON(tree)
		}));
		return console.log(JSON.stringify(json, null, 2));
	}
	if (values.summary) return printSummary(analyses);
	for (const { title, analysis } of analyses) printTree(title, analysis, options);
}

main();
