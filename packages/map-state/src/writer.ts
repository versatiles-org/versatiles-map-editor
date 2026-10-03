import { parseColor } from './color.js';
import {
	bitsToBase64,
	CODEC_VERSION,
	ELEMENT_KEYS,
	END_KEY,
	LEGEND_ENTRY_KEYS,
	LEGEND_KEYS,
	METADATA_KEYS,
	ORIGIN_SCALE,
	POPUP_KEYS
} from './constants.js';
import { BUILT_IN_COLOR_BITS, BUILT_IN_COLORS, rgbHex } from './color_schemes.js';
import { boundsOf, centerOf } from './bounds.js';
import {
	LEGEND_DEFAULTS,
	removeViewerDefaults,
	sanitizeFrame,
	sanitizeLabelMinZoom,
	VIEWER_CHOICES
} from './profile.js';
import { encodeStrings } from './string_coder.js';
import { LEGEND_ENTRY_TYPES, LEGEND_FONTS, LEGEND_LAYOUTS, LEGEND_THEMES } from './types.js';
import { exponentForResolution, LocalGrid } from './grid.js';
import {
	canonical,
	colorKey,
	encodedValue,
	STYLE_FIELDS,
	STYLE_KEY_PARAMETER,
	STYLE_REMOVE_KEY,
	STYLE_REFERENCE_PARAMETER,
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
	// the index of each string in the 2 sections of the string table: the words of the format and
	// the others (see `writeStringTable`)
	private strings: [Map<string, number>, Map<string, number>] = [new Map(), new Map()];
	// of each section, 1 + the highest index referenced so far (see `writeStringRef`)
	private nextString: [number, number] = [0, 0];
	// the styles written so far
	private styleHistory = new StyleHistory();
	// the coordinates of the elements are steps on this grid, from the center of the map
	private grid: LocalGrid | undefined;
	// the parameters k of the Exp-Golomb code of the coordinates of the elements, of longitude and of
	// latitude (see `writeExpGolomb`)
	private coordinateParameters: [number, number] = [0, 0];
	// whether the point of a marker or circle is a difference to the one before, else to the origin
	private relativePoints = false;
	// the point of the marker or circle before, on the grid
	private lastPoint: [number, number] = [0, 0];
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
		return bitsToBase64(this.bits);
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
		this.writeStringTable(collectStrings(root), collectFormatStrings(root));
		this.styleHistory = new StyleHistory();

		// the camera, with its own center
		this.writeMap(root.map);
		const frame = sanitizeFrame(root.frame);
		this.writeGrid(root, frame);
		this.writeFrame(frame);
		this.writeMetadata(root.meta);

		let previous: string | undefined;
		root.elements.forEach((element, index) => {
			const key = repeatKey(element);
			const repeat = key === previous;
			previous = key;
			this.writeElementType(element, repeat, index === 0);
			switch (element.type) {
				case 'marker':
					this.writeElementMarker(element, repeat);
					break;
				case 'line':
					this.writeElementLine(element, repeat);
					break;
				case 'polygon':
					this.writeElementPolygon(element, repeat);
					break;
				case 'circle':
					this.writeElementCircle(element, repeat);
					break;
			}
		});
	}

	/**
	 * The grid of the coordinates of the frame and the elements: its step, its origin, and how the
	 * coordinates of the elements are coded.
	 */
	private writeGrid(root: MapState, frame: Bounds | undefined) {
		// the step of the coordinates: 0.00001° × 2^exponent
		const exponent = exponentForResolution(this.resolution);
		this.writeInteger(exponent, 4);

		// The coordinates of the frame and the elements are steps from an origin near them, so the
		// numbers stay small: the center of the frame, else of the camera, else of the elements
		const near =
			(frame && centerOf(frame)) ?? storedCamera(root.map)?.center ?? centerOf(boundsOf(root.elements) ?? [0, 0, 0, 0]);
		const origin: [number, number] = [Math.round(near[0] * ORIGIN_SCALE), Math.round(near[1] * ORIGIN_SCALE)];
		this.writeVarint(origin[0], true);
		this.writeVarint(origin[1], true);
		this.grid = new LocalGrid([origin[0] / ORIGIN_SCALE, origin[1] / ORIGIN_SCALE], exponent);
		// the coding of the element coordinates that makes them shortest: whether the points of
		// markers and circles are differences to the point before, e.g. if they are sorted by place,
		// and whether longitude and latitude have parameters of their own, e.g. if they are sorted by
		// latitude, so its steps are small and those of longitude large
		const codings = [false, true].flatMap((relative) => {
			const steps = this.coordinateSteps(root.elements, relative);
			const k = bestExpGolombParameter(steps);
			const axes = [0, 1].map((axis) => steps.filter((_, i) => i % 2 === axis));
			const ks = axes.map(bestExpGolombParameter) as [number, number];
			return [
				{ relative, perAxis: false, parameters: [k, k], bits: expGolombBits(steps, k) },
				{
					relative,
					perAxis: true,
					parameters: ks,
					bits: expGolombBits(axes[0], ks[0]) + expGolombBits(axes[1], ks[1]) + 5
				}
			];
		});
		const coding = codings.reduce((best, coding) => (coding.bits < best.bits ? coding : best));
		this.coordinateParameters = coding.parameters as [number, number];
		this.relativePoints = coding.relative;
		this.lastPoint = [0, 0];
		this.writeBit(coding.perAxis);
		this.writeInteger(this.coordinateParameters[0], 5);
		if (coding.perAxis) this.writeInteger(this.coordinateParameters[1], 5);
		this.writeBit(this.relativePoints);
	}

	/**
	 * The type of an element: after the first, 1 bit whether it repeats the type and the styles of
	 * the element before; unless it does, its type in 3 bits.
	 */
	private writeElementType(element: StateElement, repeat: boolean, first: boolean) {
		if (!first) this.writeBit(repeat);
		if (!repeat) this.writeInteger(ELEMENT_KEYS[element.type], 3);
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
	writeMap(camera: MapState['map']): [number, number] | undefined {
		const map = storedCamera(camera);
		if (!map) {
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

	/** The point of a marker or circle, on the grid: from the origin, or from the point before. */
	writeElementPoint(point: [number, number]) {
		const [x, y] = this.elementGrid.toGrid(point);
		const [px, py] = this.relativePoints ? this.lastPoint : [0, 0];
		this.writeExpGolomb(x - px, this.coordinateParameters[0], true);
		this.writeExpGolomb(y - py, this.coordinateParameters[1], true);
		this.lastPoint = [x, y];
	}

	/** The points of an element: each as the difference to the previous one. */
	writeElementPoints(points: [number, number][]) {
		this.writeVarint(points.length);
		pointSteps(this.elementGrid, points).forEach((step, i) =>
			this.writeExpGolomb(step, this.coordinateParameters[i % 2], true)
		);
	}

	/**
	 * The numbers that `writeElementPoint` and `writeElementPoints` write for the elements, zigzag
	 * encoded, longitude and latitude in turns. `relative`: the points of markers and circles as
	 * differences to the point before.
	 */
	private coordinateSteps(elements: StateElement[], relative: boolean): number[] {
		const grid = this.elementGrid;
		let last: [number, number] = [0, 0];
		return elements
			.flatMap((element) => {
				if (!('point' in element)) return pointSteps(grid, element.points);
				const [x, y] = grid.toGrid(element.point);
				const steps = relative ? [x - last[0], y - last[1]] : [x, y];
				last = [x, y];
				return steps;
			})
			.map(zigzag);
	}

	/**
	 * An integer as an Exp-Golomb code with the parameter `k`: `value + 2^k` in binary, after as many
	 * zeros as it has bits beyond `k + 1`. Values below about 2^k cost `k + 1` bits, and
	 * each doubling 2 bits more. Signed values are zigzag encoded (0, -1, 1, -2, …). Arithmetic
	 * instead of bit operators, which would cut the values to 32 bits.
	 */
	writeExpGolomb(value: number, k: number, signed?: true) {
		if (!Number.isSafeInteger(value)) throw new Error(`value must be a safe integer: ${value}`);
		if (signed) value = zigzag(value);
		else if (value < 0) throw new Error('Unsigned Exp-Golomb code cannot be negative');
		const code = value + 2 ** k;
		const length = bitLength(code);
		for (let i = length - k - 1; i > 0; i--) this.writeBit(false);
		for (let i = length - 1; i >= 0; i--) this.writeBit(Math.floor(code / 2 ** i) % 2 === 1);
	}

	writeMetadata(metadata?: StateMetadata) {
		// only the fields that are stored count, e.g. not `search: false`
		const stored =
			metadata &&
			(metadata.background ||
				metadata.legend ||
				metadata.colorScheme ||
				removeViewerDefaults(metadata.viewer) ||
				metadata.labelOverlap === 'hide' ||
				sanitizeLabelMinZoom(metadata.labelMinZoom) !== undefined ||
				metadata.mapLabelsOnTop ||
				metadata.title);
		if (!stored) {
			return this.writeBit(false);
		}

		this.writeBit(true);
		// first the words of the format, as they are first in the string table
		if (metadata.background) {
			this.writeInteger(METADATA_KEYS.background, 6);
			// as JSON, so any option of @versatiles/style can be stored
			this.writeStringRef(JSON.stringify(metadata.background), true);
		}
		if (metadata.colorScheme) {
			this.writeInteger(METADATA_KEYS.colorScheme, 6);
			this.writeStringRef(metadata.colorScheme, true);
		}
		if (metadata.legend) {
			this.writeInteger(METADATA_KEYS.legend, 6);
			this.writeLegend(metadata.legend);
		}
		if (metadata.mapLabelsOnTop) {
			// a flag: the key alone
			this.writeInteger(METADATA_KEYS.mapLabelsOnTop, 6);
		}
		if (metadata.title) {
			this.writeInteger(METADATA_KEYS.title, 6);
			this.writeStringRef(metadata.title);
		}
		if (metadata.labelOverlap === 'hide') {
			// a flag: the key alone
			this.writeInteger(METADATA_KEYS.labelOverlap, 6);
		}
		const labelMinZoom = sanitizeLabelMinZoom(metadata.labelMinZoom);
		if (labelMinZoom !== undefined) {
			this.writeInteger(METADATA_KEYS.labelMinZoom, 6);
			// in tenths of a zoom level
			this.writeVarint(Math.round(labelMinZoom * 10));
		}
		const viewer = removeViewerDefaults(metadata.viewer);
		if (viewer) {
			this.writeInteger(METADATA_KEYS.viewer, 6);
			this.writeViewer(viewer);
		}
		this.writeInteger(END_KEY, 6);
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
		// a circle smaller than 1 m, e.g. drawn by a short drag, is not 0 m
		this.writeVarint(Math.max(1, Math.round(element.radius)));
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
		this.writeInteger(END_KEY, 4);
	}

	// key/value pairs like a style, so fields can be added later
	writeLegend(legend: StateLegend) {
		if (legend.layout && legend.layout !== LEGEND_DEFAULTS.layout) {
			this.writeInteger(LEGEND_KEYS.layout, 4);
			this.writeVarint(LEGEND_LAYOUTS.indexOf(legend.layout));
		}
		if (legend.font && legend.font !== LEGEND_DEFAULTS.font) {
			this.writeInteger(LEGEND_KEYS.font, 4);
			this.writeVarint(LEGEND_FONTS.indexOf(legend.font));
		}
		// only the key: they are false without it
		if (legend.bold) this.writeInteger(LEGEND_KEYS.bold, 4);
		if (legend.italic) this.writeInteger(LEGEND_KEYS.italic, 4);
		if (legend.theme && legend.theme !== LEGEND_DEFAULTS.theme) {
			this.writeInteger(LEGEND_KEYS.theme, 4);
			this.writeVarint(LEGEND_THEMES.indexOf(legend.theme));
		}
		this.writeInteger(LEGEND_KEYS.entries, 4);
		this.writeArray(legend.entries, (entry) => {
			const type = LEGEND_ENTRY_TYPES.indexOf(entry.type);
			if (type < 0) throw new Error(`Invalid legend entry type: ${entry.type}`);
			this.writeInteger(LEGEND_ENTRY_KEYS.type, 4);
			this.writeVarint(type);
			// the styles like those of elements, which can refer to them
			if (entry.style) {
				this.writeInteger(LEGEND_ENTRY_KEYS.style, 4);
				this.writeStyle(entry.style);
			}
			if (entry.strokeStyle) {
				this.writeInteger(LEGEND_ENTRY_KEYS.strokeStyle, 4);
				this.writeStyle(entry.strokeStyle);
			}
			if (entry.label) {
				this.writeInteger(LEGEND_ENTRY_KEYS.label, 4);
				this.writeStringRef(entry.label);
			}
			this.writeInteger(END_KEY, 4);
		});
		this.writeInteger(END_KEY, 4);
	}

	writePopup(popup?: StatePopup) {
		if (!popup?.text) return this.writeBit(false);
		this.writeBit(true);
		// key/value pairs like a style, so fields can be added later
		this.writeInteger(POPUP_KEYS.text, 4);
		this.writeStringRef(popup.text);
		this.writeInteger(END_KEY, 4);
	}

	/**
	 * A style: a reference to a similar earlier style (0: none) and only the differences to it,
	 * whichever is shortest.
	 */
	writeStyle(style: StateStyle) {
		let best: StateWriter | undefined;
		for (let ref = 0; ref <= this.styleHistory.length; ref++) {
			const writer = this.fork();
			writer.writeExpGolomb(ref, STYLE_REFERENCE_PARAMETER);
			writer.writeStylePatch(this.styleHistory.get(ref) ?? {}, style);
			if (!best || writer.bits.length < best.bits.length) best = writer;
		}
		// not with a spread: a style can have many bits
		for (const bit of best!.bits) this.bits.push(bit);
		// the strings the chosen encoding referenced
		this.nextString = [...best!.nextString];
		this.styleHistory.remember(style);
	}

	/** The fields that differ from `base`: changed ones with their value, missing ones as removed. */
	writeStylePatch(base: StateStyle, style: StateStyle) {
		for (const field of STYLE_FIELDS) {
			const value = encodedValue(style, field);
			if (value === encodedValue(base, field)) continue;
			if (value === undefined) {
				this.writeStyleKey(STYLE_REMOVE_KEY);
				this.writeStyleKey(field.key);
				continue;
			}
			this.writeStyleKey(field.key);
			this.writeStyleValue(field.name, style);
		}
		this.writeStyleKey(END_KEY);
	}

	/** The key of a style field, see `STYLE_KEY_PARAMETER`. */
	private writeStyleKey(key: number) {
		this.writeExpGolomb(key, STYLE_KEY_PARAMETER);
	}

	private writeStyleValue(name: keyof StateStyle, style: StateStyle) {
		switch (name) {
			case 'halo':
				return this.writeVarint(Math.round(style.halo! * 10));
			case 'pattern':
				return this.writeVarint(Math.round(style.pattern!));
			case 'rotate':
				return this.writeVarint(Math.round(style.rotate!), true);
			case 'size':
				return this.writeVarint(Math.round(style.size! * 10));
			case 'labelSize':
				return this.writeVarint(Math.round(style.labelSize! * 10));
			case 'width':
				return this.writeVarint(Math.round(style.width! * 10));
			case 'align':
				return this.writeVarint(Math.round(style.align!));
			case 'color':
			case 'labelColor':
			case 'haloColor':
				return this.writeColorValue(style[name]!);
			case 'label':
				return this.writeStringRef(style.label!);
			case 'symbol':
				return this.writeStringRef(style.symbol!, true);
			case 'font':
				return this.writeStringRef(style.font!, true);
			case 'visible':
				// the key alone means "false"
				return;
		}
	}

	/** A writer for trying out an encoding, with the same palette and strings. */
	private fork(): StateWriter {
		const writer = new StateWriter({ resolution: this.resolution });
		writer.palette = this.palette;
		writer.strings = this.strings;
		writer.nextString = [...this.nextString];
		return writer;
	}

	/** The colors, each once, and afterwards only their index. */
	writePalette(colors: string[]) {
		this.writeArray(colors, (color) => this.writePaletteColor(color));
		this.palette = new Map(colors.map((color, index) => [colorKey(color), index]));
	}

	/** A color, as its index in the palette. */
	writeColorValue(color: string) {
		const index = this.palette.get(colorKey(color));
		if (index === undefined) throw new Error(`Color not in the palette: ${color}`);
		this.writeVarint(index);
	}

	/**
	 * The strings of the map, each once in its section, in the order they are written, and
	 * afterwards only a reference (see `writeStringRef`). 2 sections: the words of the format
	 * (`formatStrings`: the background as JSON, the color scheme, the label font, the names of
	 * symbols), then the others (titles, labels, popups). Their number, and unless 0, the number of
	 * words of the format and the block (see `encodeStrings`), whose length the reader knows from
	 * decoding it.
	 */
	writeStringTable(strings: string[], formatStrings: string[] = []) {
		const sections: [string[], string[]] = [[...new Set(formatStrings)], [...new Set(strings)]];
		const all = [...sections[0], ...sections[1]];
		this.writeVarint(all.length);
		if (all.length > 0) {
			this.writeVarint(sections[0].length);
			const block = encodeStrings(all, sections[0].length);
			// not with a spread: the block can have many bits
			for (const bit of block) this.bits.push(bit);
		}
		this.strings = [
			new Map(sections[0].map((value, index) => [value, index])),
			new Map(sections[1].map((value, index) => [value, index]))
		];
		this.nextString = [0, 0];
	}

	/**
	 * A string of the table, in the section of the words of the format (`format`), else of the
	 * others; which one, each field knows. 1 bit "1" for the next string of the section not referenced
	 * so far, which is the usual case, since the table is in the order of the writing. Otherwise "0"
	 * and its index in the section.
	 */
	writeStringRef(value: string, format = false) {
		const section = format ? 0 : 1;
		const index = this.strings[section].get(value);
		if (index === undefined) throw new Error(`String not in the table: ${value}`);
		if (index === this.nextString[section]) {
			this.writeBit(true);
		} else {
			this.writeBit(false);
			this.writeVarint(index);
		}
		this.nextString[section] = Math.max(this.nextString[section], index + 1);
	}

	/**
	 * A color of the palette: 1 bit whether it is one of the color schemes (`BUILT_IN_COLORS`), then
	 * its index there, else its red, green and blue; then its alpha (see `writeColor`).
	 */
	writePaletteColor(color: string) {
		const index = BUILT_IN_COLORS.indexOf(rgbHex(color));
		if (index < 0) {
			this.writeBit(false);
			return this.writeColor(color);
		}
		this.writeBit(true);
		this.writeInteger(index, BUILT_IN_COLOR_BITS);
		this.writeAlpha(color);
	}

	/** A color: its red, green and blue in 8 bits each, then its alpha. */
	writeColor(color: string) {
		const rgb = parseColor(color);
		if (!rgb) throw new Error(`Invalid color: ${color}`);
		this.writeInteger(Math.round(rgb.r), 8);
		this.writeInteger(Math.round(rgb.g), 8);
		this.writeInteger(Math.round(rgb.b), 8);
		this.writeAlpha(color);
	}

	/** The alpha of a color: 1 bit whether it is translucent, then the alpha in 8 bits. */
	private writeAlpha(color: string) {
		const alpha = parseColor(color)!.alpha;
		this.writeBit(alpha != 1);
		if (alpha != 1) this.writeInteger(Math.round(alpha * 255), 8);
	}
}

/** The styles of all elements and of all entries of the legend. */
function allStyles(root: MapState): StateStyle[] {
	return [...root.elements, ...(root.meta?.legend?.entries ?? [])].flatMap((item) => [
		...(item.style ? [item.style] : []),
		...('strokeStyle' in item && item.strokeStyle ? [item.strokeStyle] : [])
	]);
}

/**
 * The words of the format in the string table, in the order the writer writes them: the
 * background as JSON, the color scheme, the label font, and the names of the symbols of the
 * legend and of the elements.
 */
function collectFormatStrings(root: MapState): string[] {
	const meta = root.meta;
	const strings = [meta?.background && JSON.stringify(meta.background), meta?.colorScheme].filter(
		(value): value is string => !!value
	);
	for (const item of [...(meta?.legend?.entries ?? []), ...root.elements]) {
		const styles = [item.style, 'strokeStyle' in item ? item.strokeStyle : undefined];
		for (const style of styles) {
			// in the order of the keys of the style
			if (style?.symbol != null) strings.push(style.symbol);
			if (style?.font != null) strings.push(style.font);
		}
	}
	return strings;
}

/**
 * The other strings of the string table, in the order the writer writes them: of the legend, the
 * title, and of each element.
 */
export function collectStrings(root: MapState): string[] {
	const strings: string[] = [];
	const ofStyles = (item: { style?: StateStyle; strokeStyle?: StateStyle }) => {
		for (const style of [item.style, item.strokeStyle]) if (style?.label != null) strings.push(style.label);
	};
	const meta = root.meta;
	for (const entry of meta?.legend?.entries ?? []) {
		ofStyles(entry);
		if (entry.label) strings.push(entry.label);
	}
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

/** The number of bits of these unsigned values in the Exp-Golomb code with the parameter `k`. */
function expGolombBits(values: number[], k: number): number {
	let bits = 0;
	for (const value of values) bits += 2 * bitLength(value + 2 ** k) - k - 1;
	return bits;
}

/** The parameter k of the Exp-Golomb code (0 to 31) that codes these unsigned values in the fewest bits. */
export function bestExpGolombParameter(values: number[]): number {
	let best = 0;
	let bestBits = Infinity;
	for (let k = 0; k < 32; k++) {
		const bits = expGolombBits(values, k);
		if (bits < bestBits) {
			best = k;
			bestBits = bits;
		}
	}
	return best;
}

/** The keys of the element types. */

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

/** The camera, unless it is degenerate (e.g. from a zero-sized map container), which is not stored. */
function storedCamera(map: MapState['map']): MapState['map'] {
	if (!map || !(map.radius > 0) || !Number.isFinite(map.radius) || !map.center.every(Number.isFinite)) return undefined;
	return map;
}
