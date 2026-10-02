import { parseColor } from './color.js';
import { BASE64_CHARS, CHAR_CODE2VALUE, CODEC_VERSION, ORIGIN_SCALE } from './constants.js';
import { boundsOf, centerOf } from './bounds.js';
import {
	LEGEND_DEFAULTS,
	removeViewerDefaults,
	sanitizeFrame,
	sanitizeLabelMinZoom,
	VIEWER_CHOICES
} from './profile.js';
import { StateReader } from './reader.js';
import { encodeStrings } from './string_coder.js';
import { LEGEND_ENTRY_TYPES, LEGEND_FONTS, LEGEND_LAYOUTS } from './types.js';
import { exponentForResolution, LocalGrid } from './grid.js';
import {
	canonical,
	colorKey,
	encodedValue,
	STYLE_FIELDS,
	STYLE_REMOVE_KEY,
	StyleHistory,
	withoutLabel
} from './style_history.js';
import type {
	Bounds,
	StateElement,
	StateElementCircle,
	StateElementLine,
	StateElementMarker,
	StateElementPolygon,
	StateMetadata,
	StateLegend,
	StatePopup,
	MapState,
	StateStyle,
	StateViewer
} from './types.js';

export class StateWriter {
	bits: boolean[] = [];
	// the colors of the state, most frequent first, by their color key (see `writePalette`)
	private palette = new Map<string, number>();
	// the index of each symbol name in the list of the metadata (see `writeSymbols`)
	private symbols = new Map<string, number>();
	// the index of each string in the string table (see `writeStringTable`)
	private strings = new Map<string, number>();
	// 1 + the highest index of the string table referenced so far (see `writeStringRef`)
	private nextString = 0;
	// the styles written so far
	private styleHistory = new StyleHistory();
	// the coordinates of the elements are steps on this grid, from the center of the map
	private grid: LocalGrid | undefined;
	// the order of the Exp-Golomb code of the coordinates of the elements (see `writeExpGolomb`)
	private coordinateOrder = 0;
	private readonly resolution: number;

	/**
	 * `resolution`: the precision of the element coordinates in meters, rounded to decimal places of
	 * degrees. Coarser is shorter. Default: 1 m.
	 */
	constructor({ resolution = 1 }: { resolution?: number } = {}) {
		if (!(resolution > 0) || !Number.isFinite(resolution)) throw new Error(`Invalid resolution: ${resolution}`);
		this.resolution = resolution;
	}

	asBase64(): string {
		const reader = new StateReader(this.bits);
		const chars = [];
		while (!reader.ended()) {
			chars.push(BASE64_CHARS[reader.read6pack()]);
		}
		return chars.join('');
	}

	asBitString(): string {
		return this.bits.map((bit) => (bit ? '1' : '0')).join('');
	}

	writeBit(value: boolean) {
		this.bits.push(value);
	}

	writeInteger(value: number, bits: number) {
		if (value % 1 !== 0) throw new Error('value must be an integer');
		for (let i = bits - 1; i >= 0; i--) {
			this.bits.push((value & (1 << i)) > 0);
		}
		return value;
	}

	/**
	 * An integer in groups of 5 bits, each followed by a bit whether another group follows.
	 * Signed values are zigzag encoded (0, -1, 1, -2, …). Arithmetic instead of bit operators,
	 * which would cut the values to 32 bits.
	 */
	writeVarint(value: number, signed?: true) {
		if (!Number.isSafeInteger(value)) throw new Error(`value must be a safe integer: ${value}`);

		if (signed) {
			value = value < 0 ? -2 * value - 1 : 2 * value;
			if (!Number.isSafeInteger(value)) throw new Error(`value too large: ${value}`);
		} else {
			if (value < 0) throw new Error('Unsigned varint cannot be negative');
		}
		while (true) {
			this.writeInteger(value % 32, 5);
			value = Math.floor(value / 32);
			this.writeBit(value >= 1);
			if (value < 1) break;
		}
	}

	writeArray<T>(array: T[], cb: (v: T) => void) {
		const length = array.length;
		this.writeVarint(length);
		for (let i = 0; i < length; i++) cb(array[i]);
	}

	writePoint(point: [number, number], resolutionInMeters: number = 1) {
		if (!resolutionInMeters || resolutionInMeters < 1) resolutionInMeters = 1;

		const scale = Math.round(1e5 / resolutionInMeters);
		this.writeVarint(Math.round(point[0] * scale), true);
		this.writeVarint(Math.round(point[1] * scale), true);
	}

	writeRoot(root: MapState) {
		this.writeInteger(CODEC_VERSION, 3);
		this.writePalette(collectColors(root));
		this.writeStringTable(collectStrings(root));
		this.styleHistory = new StyleHistory();

		// the camera, with its own center
		this.writeMap(root.map);
		// the step of the coordinates: 0.00001° × 2^exponent
		const exponent = exponentForResolution(this.resolution);
		this.writeInteger(exponent, 4);

		// The coordinates of the frame and the elements are steps from an origin near them, so the
		// numbers stay small: the center of the frame, else of the camera, else of the elements
		const frame = sanitizeFrame(root.frame);
		const near = (frame && centerOf(frame)) ?? root.map?.center ?? centerOf(boundsOf(root.elements) ?? [0, 0, 0, 0]);
		const origin: [number, number] = [Math.round(near[0] * ORIGIN_SCALE), Math.round(near[1] * ORIGIN_SCALE)];
		this.writeVarint(origin[0], true);
		this.writeVarint(origin[1], true);
		this.grid = new LocalGrid([origin[0] / ORIGIN_SCALE, origin[1] / ORIGIN_SCALE], exponent);
		// the order of the code of the element coordinates that makes them shortest
		this.coordinateOrder = bestExpGolombOrder(this.coordinateSteps(root.elements));
		this.writeInteger(this.coordinateOrder, 5);

		this.writeFrame(frame);
		this.writeMetadata(root.meta, collectSymbols(root));

		// each element after the first: 1 bit whether it repeats the type and the styles of the one before
		let previous: string | undefined;
		root.elements.forEach((element) => {
			const key = repeatKey(element);
			const repeat = key === previous;
			if (previous !== undefined) this.writeBit(repeat);
			previous = key;
			switch (element.type) {
				case 'marker':
					if (!repeat) this.writeInteger(1, 3);
					this.writeElementMarker(element, repeat);
					break;
				case 'line':
					if (!repeat) this.writeInteger(2, 3);
					this.writeElementLine(element, repeat);
					break;
				case 'polygon':
					if (!repeat) this.writeInteger(3, 3);
					this.writeElementPolygon(element, repeat);
					break;
				case 'circle':
					if (!repeat) this.writeInteger(4, 3);
					this.writeElementCircle(element, repeat);
					break;
			}
		});
	}

	/**
	 * The styles of an element, unless it repeats those of the element before: the style without
	 * its label, and for areas the outline.
	 */
	private writeElementStyles(element: StateElement, repeat: boolean) {
		if (repeat) return;
		this.writeOptionalStyle(element.style && withoutLabel(element.style));
		if (element.type === 'polygon' || element.type === 'circle') this.writeOptionalStyle(element.strokeStyle);
	}

	private writeOptionalStyle(style: StateStyle | undefined) {
		this.writeBit(style !== undefined);
		if (style) this.writeStyle(style);
	}

	/** The label of the style of an element: a field of the element, since it differs more often than the style. */
	private writeElementLabel(element: StateElement) {
		const label = element.style?.label;
		this.writeBit(label != null);
		if (label != null) this.writeStringRef(label);
	}

	/** The frame: its south-west corner on the grid, and its width and height in steps of the grid. */
	writeFrame(frame: Bounds | undefined) {
		if (!frame) return this.writeBit(false);
		this.writeBit(true);
		const [x0, y0] = this.elementGrid.toGrid([frame[0], frame[1]]);
		const [x1, y1] = this.elementGrid.toGrid([frame[2], frame[3]]);
		this.writeVarint(x0, true);
		this.writeVarint(y0, true);
		// at least one step, so a frame never becomes empty
		this.writeVarint(Math.max(1, x1 - x0));
		this.writeVarint(Math.max(1, y1 - y0));
	}

	/** Returns the center as the reader decodes it, or undefined without a map. */
	writeMap(map: MapState['map']): [number, number] | undefined {
		// A degenerate viewport (e.g. from a zero-sized map container) is not worth storing
		if (!map || !(map.radius > 0) || !Number.isFinite(map.radius) || !map.center.every(Number.isFinite)) {
			this.writeBit(false);
			return undefined;
		}

		this.writeBit(true);

		// The radius is log-encoded in 10 bits: 1 m … 2^(1023/40) m ≈ 49,000 km
		const value = Math.min(1023, Math.max(0, Math.round(Math.log2(map.radius) * 40)));
		const radius = Math.pow(2, value / 40);
		this.writeInteger(value, 10);
		// effective resolution of coordinates is 1000 times the visible radius
		this.writePoint(map.center, radius / 1e3);

		this.writeBit(false); // additional map data not supported yet

		const scale = Math.round(1e5 / Math.max(1, radius / 1e3));
		return [Math.round(map.center[0] * scale) / scale, Math.round(map.center[1] * scale) / scale];
	}

	/** The grid of the element coordinates, which the map of the root sets. */
	private get elementGrid(): LocalGrid {
		if (!this.grid) throw new Error('Element points need the grid of the map');
		return this.grid;
	}

	/** A point of an element, on the grid. */
	writeElementPoint(point: [number, number]) {
		for (const step of this.elementGrid.toGrid(point)) this.writeExpGolomb(step, this.coordinateOrder, true);
	}

	/** The points of an element: each as the difference to the previous one. */
	writeElementPoints(points: [number, number][]) {
		this.writeVarint(points.length);
		for (const step of pointSteps(this.elementGrid, points)) this.writeExpGolomb(step, this.coordinateOrder, true);
	}

	/** The numbers that `writeElementPoint` and `writeElementPoints` write for the elements, zigzag encoded. */
	private coordinateSteps(elements: StateElement[]): number[] {
		const grid = this.elementGrid;
		return elements
			.flatMap((element) => ('point' in element ? grid.toGrid(element.point) : pointSteps(grid, element.points)))
			.map(zigzag);
	}

	/**
	 * An integer as an Exp-Golomb code of order `order`: `value + 2^order` in binary, after as many
	 * zeros as it has bits beyond `order + 1`. Values below about 2^order cost `order + 1` bits, and
	 * each doubling 2 bits more. Signed values are zigzag encoded (0, -1, 1, -2, …). Arithmetic
	 * instead of bit operators, which would cut the values to 32 bits.
	 */
	writeExpGolomb(value: number, order: number, signed?: true) {
		if (!Number.isSafeInteger(value)) throw new Error(`value must be a safe integer: ${value}`);
		if (signed) value = zigzag(value);
		else if (value < 0) throw new Error('Unsigned Exp-Golomb code cannot be negative');
		const code = value + 2 ** order;
		const length = bitLength(code);
		for (let i = length - order - 1; i > 0; i--) this.writeBit(false);
		for (let i = length - 1; i >= 0; i--) this.writeBit(Math.floor(code / 2 ** i) % 2 === 1);
	}

	/**
	 * `symbols`: the names of all symbols of the map, which styles and the legend reference by index.
	 * Without it, those of the legend.
	 */
	writeMetadata(metadata?: StateMetadata, symbols = collectSymbols({ meta: metadata, elements: [] })) {
		// only the fields that are stored count, e.g. not `search: false`
		const stored =
			symbols.length > 0 ||
			(metadata &&
				(metadata.background ||
					metadata.legend ||
					metadata.colorScheme ||
					removeViewerDefaults(metadata.viewer) ||
					metadata.labelFont ||
					metadata.labelOverlap === 'hide' ||
					sanitizeLabelMinZoom(metadata.labelMinZoom) !== undefined ||
					metadata.mapLabelsOnTop ||
					metadata.title));
		if (!stored) {
			return this.writeBit(false);
		}

		this.writeBit(true);
		// first, since the legend references them
		if (symbols.length > 0) {
			this.writeInteger(8, 6);
			this.writeSymbols(symbols);
		}
		if (!metadata) return this.writeInteger(0, 6);
		//if (metadata.heading) {
		//	this.writeInteger(1, 6);
		//	this.writeString(metadata.heading);
		//}
		if (metadata.background) {
			this.writeInteger(2, 6);
			// as JSON, so any option of @versatiles/style can be stored
			this.writeStringRef(JSON.stringify(metadata.background));
		}
		if (metadata.legend) {
			this.writeInteger(3, 6);
			this.writeLegend(metadata.legend);
		}
		if (metadata.colorScheme) {
			this.writeInteger(4, 6);
			this.writeStringRef(metadata.colorScheme);
		}
		if (metadata.labelFont) {
			this.writeInteger(6, 6);
			this.writeStringRef(metadata.labelFont);
		}
		if (metadata.mapLabelsOnTop) {
			// a flag: the key alone
			this.writeInteger(7, 6);
		}
		if (metadata.title) {
			this.writeInteger(9, 6);
			this.writeStringRef(metadata.title);
		}
		if (metadata.labelOverlap === 'hide') {
			// a flag: the key alone
			this.writeInteger(11, 6);
		}
		const labelMinZoom = sanitizeLabelMinZoom(metadata.labelMinZoom);
		if (labelMinZoom !== undefined) {
			this.writeInteger(12, 6);
			// in tenths of a zoom level
			this.writeVarint(Math.round(labelMinZoom * 10));
		}
		// key 5 was the search of older links, as a flag
		const viewer = removeViewerDefaults(metadata.viewer);
		if (viewer) {
			this.writeInteger(10, 6);
			this.writeViewer(viewer);
		}
		this.writeInteger(0, 6);
	}

	/** `repeat`: the element has the type and the styles of the element before, which are not written. */
	writeElementMarker(element: StateElementMarker, repeat = false) {
		this.writeElementPoint(element.point);
		this.writeElementStyles(element, repeat);
		this.writeElementLabel(element);
		this.writePopup(element.popup);
	}

	writeElementLine(element: StateElementLine, repeat = false) {
		this.writeElementPoints(element.points);
		this.writeElementStyles(element, repeat);
		this.writeElementLabel(element);
		this.writePopup(element.popup);
	}

	writeElementPolygon(element: StateElementPolygon, repeat = false) {
		this.writeElementPoints(element.points);
		this.writeElementStyles(element, repeat);
		this.writeElementLabel(element);
		this.writePopup(element.popup);
	}

	writeElementCircle(element: StateElementCircle, repeat = false) {
		this.writeElementPoint(element.point);
		this.writeVarint(Math.round(element.radius));
		this.writeElementStyles(element, repeat);
		this.writeElementLabel(element);
		this.writePopup(element.popup);
	}

	/**
	 * The choices that differ from the defaults, as key/value pairs like a style: the key of the
	 * control, and the index of its choice in `VIEWER_CHOICES`.
	 */
	writeViewer(viewer: StateViewer) {
		Object.entries(VIEWER_CHOICES).forEach(([name, choices], i) => {
			const choice = viewer[name as keyof StateViewer];
			if (choice === undefined) return;
			this.writeInteger(i + 1, 4);
			this.writeVarint((choices as readonly string[]).indexOf(choice));
		});
		this.writeInteger(0, 4);
	}

	// key/value pairs like a style, so fields can be added later; key 1 was the position of older links
	writeLegend(legend: StateLegend) {
		if (legend.layout && legend.layout !== LEGEND_DEFAULTS.layout) {
			this.writeInteger(2, 4);
			this.writeVarint(LEGEND_LAYOUTS.indexOf(legend.layout));
		}
		if (legend.font && legend.font !== LEGEND_DEFAULTS.font) {
			this.writeInteger(4, 4);
			this.writeVarint(LEGEND_FONTS.indexOf(legend.font));
		}
		// only the key: they are false without it
		if (legend.bold) this.writeInteger(5, 4);
		if (legend.italic) this.writeInteger(6, 4);
		this.writeInteger(3, 4);
		// keys 1 and 4 were the color and the symbol of older links, key 2 is not used
		this.writeArray(legend.entries, (entry) => {
			const type = LEGEND_ENTRY_TYPES.indexOf(entry.type);
			if (type < 0) throw new Error(`Invalid legend entry type: ${entry.type}`);
			this.writeInteger(5, 4);
			this.writeVarint(type);
			// the styles like those of elements, which can refer to them
			if (entry.style) {
				this.writeInteger(6, 4);
				this.writeStyle(entry.style);
			}
			if (entry.strokeStyle) {
				this.writeInteger(7, 4);
				this.writeStyle(entry.strokeStyle);
			}
			if (entry.label) {
				this.writeInteger(3, 4);
				this.writeStringRef(entry.label);
			}
			this.writeInteger(0, 4);
		});
		this.writeInteger(0, 4);
	}

	writePopup(popup?: StatePopup) {
		if (!popup?.text) return this.writeBit(false);
		this.writeBit(true);
		// key/value pairs like a style, so fields can be added later
		this.writeInteger(1, 4);
		this.writeStringRef(popup.text);
		this.writeInteger(0, 4);
	}

	/**
	 * A style: a reference to a similar earlier style (0: none) and only the differences to it,
	 * whichever is shortest.
	 */
	writeStyle(style: StateStyle) {
		let best: StateWriter | undefined;
		for (let ref = 0; ref <= this.styleHistory.length; ref++) {
			const writer = this.fork();
			writer.writeVarint(ref);
			writer.writeStylePatch(this.styleHistory.get(ref) ?? {}, style);
			if (!best || writer.bits.length < best.bits.length) best = writer;
		}
		// not with a spread: a style can have many bits
		for (const bit of best!.bits) this.bits.push(bit);
		// the strings the chosen encoding referenced
		this.nextString = best!.nextString;
		this.styleHistory.remember(style);
	}

	/** The fields that differ from `base`: changed ones with their value, missing ones as removed. */
	writeStylePatch(base: StateStyle, style: StateStyle) {
		for (const field of STYLE_FIELDS) {
			const value = encodedValue(style, field);
			if (value === encodedValue(base, field)) continue;
			if (value === undefined) {
				this.writeInteger(STYLE_REMOVE_KEY, 4);
				this.writeInteger(field.key, 4);
				continue;
			}
			this.writeInteger(field.key, 4);
			this.writeStyleValue(field.name, style);
		}
		this.writeInteger(0, 4);
	}

	private writeStyleValue(name: keyof StateStyle, style: StateStyle) {
		switch (name) {
			case 'halo':
				return this.writeVarint(Math.round(style.halo! * 10));
			case 'pattern':
				return this.writeVarint(style.pattern!);
			case 'rotate':
				return this.writeVarint(style.rotate!, true);
			case 'size':
				return this.writeVarint(Math.round(style.size! * 10));
			case 'width':
				return this.writeVarint(Math.round(style.width! * 10));
			case 'align':
				return this.writeVarint(style.align!);
			case 'color':
			case 'labelColor':
			case 'haloColor':
				return this.writeColorValue(style[name]!);
			case 'label':
				return this.writeStringRef(style.label!);
			case 'symbol':
				return this.writeSymbolValue(style.symbol!);
			case 'visible':
				// the key alone means "false"
				return;
		}
	}

	/** A writer for trying out an encoding, with the same palette, symbols and strings. */
	private fork(): StateWriter {
		const writer = new StateWriter({ resolution: this.resolution });
		writer.palette = this.palette;
		writer.symbols = this.symbols;
		writer.strings = this.strings;
		writer.nextString = this.nextString;
		return writer;
	}

	/**
	 * The names of the symbols, each once and sorted, and afterwards only their index. The names
	 * share long beginnings (e.g. "base:icon-"), so each stores only the length of the beginning it
	 * shares with the previous name, and the rest.
	 */
	writeSymbols(names: string[]) {
		const sorted = [...new Set(names)].sort();
		let previous = '';
		this.writeArray(sorted, (name) => {
			let shared = 0;
			while (shared < previous.length && shared < name.length && previous[shared] === name[shared]) shared++;
			this.writeVarint(shared);
			this.writeString(name.slice(shared));
			previous = name;
		});
		this.symbols = new Map(sorted.map((name, index) => [name, index]));
	}

	/** A symbol, as its index in the list of symbols. */
	writeSymbolValue(name: string) {
		const index = this.symbols.get(name);
		if (index === undefined) throw new Error(`Symbol not in the list: ${name}`);
		this.writeVarint(index);
	}

	/** The colors, each once, and afterwards only their index. */
	writePalette(colors: string[]) {
		this.writeArray(colors, (color) => this.writeColor(color));
		this.palette = new Map(colors.map((color, index) => [colorKey(color), index]));
	}

	/** A color, as its index in the palette. */
	writeColorValue(color: string) {
		const index = this.palette.get(colorKey(color));
		if (index === undefined) throw new Error(`Color not in the palette: ${color}`);
		this.writeVarint(index);
	}

	/**
	 * The strings of the metadata, the labels and the popups, each once, in the order they are written, and
	 * afterwards only a reference (see `writeStringRef`): their number, and unless 0, the length of
	 * their block in bits and the block (see `encodeStrings`).
	 */
	writeStringTable(strings: string[]) {
		const unique = [...new Set(strings)];
		this.writeVarint(unique.length);
		if (unique.length > 0) {
			const block = encodeStrings(unique);
			this.writeVarint(block.length);
			// not with a spread: the block can have many bits
			for (const bit of block) this.bits.push(bit);
		}
		this.strings = new Map(unique.map((value, index) => [value, index]));
		this.nextString = 0;
	}

	/**
	 * A string of the table: 1 bit "1" for the next string not referenced so far, which is the usual
	 * case, since the table is in the order of the writing. Otherwise "0" and the index.
	 */
	writeStringRef(value: string) {
		const index = this.strings.get(value);
		if (index === undefined) throw new Error(`String not in the table: ${value}`);
		if (index === this.nextString) {
			this.writeBit(true);
		} else {
			this.writeBit(false);
			this.writeVarint(index);
		}
		this.nextString = Math.max(this.nextString, index + 1);
	}

	writeColor(color: string) {
		const rgb = parseColor(color);
		if (!rgb) throw new Error(`Invalid color: ${color}`);
		this.writeInteger(Math.round(rgb.r), 8);
		this.writeInteger(Math.round(rgb.g), 8);
		this.writeInteger(Math.round(rgb.b), 8);
		if (rgb.alpha == 1) {
			this.bits.push(false);
		} else {
			this.bits.push(true);
			this.writeInteger(Math.round(rgb.alpha * 255), 8);
		}
	}

	writeString(value: string) {
		const charCodes = value.split('').map((c) => c.charCodeAt(0));
		this.writeVarint(charCodes.length);
		charCodes.forEach((c) => this.writeVarint(c < 128 ? CHAR_CODE2VALUE[c] : c));
		return value;
	}
}

/** The names of the symbols of all styles and of the legend, each once. */
export function collectSymbols(root: MapState): string[] {
	const symbols = new Set<string>();
	for (const style of allStyles(root)) {
		if (style.symbol != null) symbols.add(style.symbol);
	}
	return [...symbols];
}

/** The styles of all elements and of all entries of the legend. */
function allStyles(root: MapState): StateStyle[] {
	return [...root.elements, ...(root.meta?.legend?.entries ?? [])].flatMap((item) => [
		...(item.style ? [item.style] : []),
		...('strokeStyle' in item && item.strokeStyle ? [item.strokeStyle] : [])
	]);
}

/**
 * The strings of the string table, in the order the writer writes them: of the metadata (the
 * background as JSON, the legend, the color scheme, the label font, the title) and of each element.
 */
export function collectStrings(root: MapState): string[] {
	const strings: string[] = [];
	const ofStyles = (item: { style?: StateStyle; strokeStyle?: StateStyle }) => {
		for (const style of [item.style, item.strokeStyle]) if (style?.label != null) strings.push(style.label);
	};
	const meta = root.meta;
	if (meta?.background) strings.push(JSON.stringify(meta.background));
	for (const entry of meta?.legend?.entries ?? []) {
		ofStyles(entry);
		if (entry.label) strings.push(entry.label);
	}
	if (meta?.colorScheme) strings.push(meta.colorScheme);
	if (meta?.labelFont) strings.push(meta.labelFont);
	if (meta?.title) strings.push(meta.title);
	for (const element of root.elements) {
		// the label of the outline is written inside it, before the label of the element
		if ('strokeStyle' in element && element.strokeStyle?.label != null) strings.push(element.strokeStyle.label);
		if (element.style?.label != null) strings.push(element.style.label);
		if (element.popup?.text) strings.push(element.popup.text);
	}
	return strings;
}

/** The steps of points on the grid: the first from the origin, each other from the one before. */
function pointSteps(grid: LocalGrid, points: [number, number][]): number[] {
	const steps: number[] = [];
	let px = 0;
	let py = 0;
	for (const point of points) {
		const [x, y] = grid.toGrid(point);
		steps.push(x - px, y - py);
		px = x;
		py = y;
	}
	return steps;
}

/** 0, -1, 1, -2, … as 0, 1, 2, 3, … */
function zigzag(value: number): number {
	const result = value < 0 ? -2 * value - 1 : 2 * value;
	if (!Number.isSafeInteger(result)) throw new Error(`value too large: ${value}`);
	return result;
}

/** The number of bits of a positive integer. */
function bitLength(value: number): number {
	let length = 0;
	for (; value >= 1; value = Math.floor(value / 2)) length++;
	return length;
}

/** The order of the Exp-Golomb code (0 to 31) that codes these unsigned values in the fewest bits. */
export function bestExpGolombOrder(values: number[]): number {
	let best = 0;
	let bestBits = Infinity;
	for (let order = 0; order < 32; order++) {
		let bits = 0;
		for (const value of values) bits += 2 * bitLength(value + 2 ** order) - order - 1;
		if (bits < bestBits) {
			best = order;
			bestBits = bits;
		}
	}
	return best;
}

/** The type and the styles of an element as they are encoded: equal for an element that repeats the one before. */
function repeatKey(element: StateElement): string {
	const key = (style: StateStyle | undefined) => (style ? canonical(style) : '-');
	const strokeStyle = 'strokeStyle' in element ? element.strokeStyle : undefined;
	return [element.type, key(element.style && withoutLabel(element.style)), key(strokeStyle)].join('|');
}

/** The colors of all styles and of the legend, most frequent first, so they get the shortest indices. */
export function collectColors(root: MapState): string[] {
	const colors: string[] = [];
	for (const style of allStyles(root)) {
		for (const color of [style.color, style.labelColor, style.haloColor]) if (color) colors.push(color);
	}

	const counts = new Map<string, { color: string; count: number; first: number }>();
	colors.forEach((color, i) => {
		const key = colorKey(color);
		const entry = counts.get(key);
		if (entry) entry.count++;
		else counts.set(key, { color, count: 1, first: i });
	});
	return [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((entry) => entry.color);
}
