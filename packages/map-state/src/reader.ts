import { formatHex, parseColor } from './color.js';
import {
	ARROW_NAMES,
	FILL_PATTERN_NAMES,
	LABEL_POSITION_NAMES,
	STROKE_STYLE_NAMES,
	LEGEND_ENTRY_TYPES,
	LEGEND_FONTS,
	LEGEND_LAYOUTS,
	LEGEND_THEMES,
	type Bounds,
	type StateBackground,
	type StateElement,
	type StateElementCircle,
	type StateElementLine,
	type StateElementMarker,
	type StateElementPolygon,
	type StateMetadata,
	type StateLegend,
	type StateLegendEntry,
	type StatePopup,
	type MapState,
	type StateStyle,
	type StateViewer
} from './types.js';
import {
	BASE64_CODE2BITS,
	CODEC_VERSION,
	ELEMENT_KEYS,
	END_KEY,
	LEGEND_ENTRY_KEYS,
	LEGEND_KEYS,
	METADATA_KEYS,
	ORIGIN_SCALE,
	POPUP_KEYS
} from './constants.js';
import {
	hasArrow,
	hasPattern,
	PATTERN_COVERAGE_RANGE,
	PATTERN_SCALE_RANGE,
	sanitizeBackground,
	sanitizeFrame,
	sanitizeLabelMinZoom,
	VIEWER_CHOICES
} from './profile.js';
import { LocalGrid } from './grid.js';
import { decodeStringBlock } from './string_coder.js';
import { BUILT_IN_COLOR_BITS, BUILT_IN_COLORS } from './color_schemes.js';
import {
	STYLE_FIELDS,
	STYLE_KEY_PARAMETER,
	STYLE_REFERENCE_PARAMETER,
	STYLE_REMOVE_KEY,
	StyleHistory
} from './style_history.js';

export class StateReader {
	public bits: boolean[];
	public offset: number = 0;
	// the colors, which are referenced by index (see `readPalette`)
	private palette: string[] = [];
	// the strings of the 2 sections of the string table: the words of the format and the others
	// (see `readStringTable`)
	private strings: [string[], string[]] = [[], []];
	// of each section, 1 + the highest index referenced so far (see `readStringRef`)
	private nextString: [number, number] = [0, 0];
	// the styles read so far
	private styleHistory = new StyleHistory();
	// the coordinates of the elements are steps on this grid, from the center of the map
	private grid: LocalGrid | undefined;
	// the parameters k of the Exp-Golomb code of the coordinates of the elements, of longitude and of
	// latitude (see `readExpGolomb`)
	private coordinateParameters: [number, number] = [0, 0];
	// whether the point of a marker or circle is a difference to the one before, else to the origin
	private relativePoints = false;
	// the point of the marker or circle before, on the grid
	private lastPoint: [number, number] = [0, 0];

	constructor(bits: boolean[]) {
		this.bits = bits;
	}

	static fromBase64(text: string): StateReader {
		const bits: boolean[] = [];
		for (let i = 0; i < text.length; i++) {
			const charCode = text.charCodeAt(i);
			const charBits = BASE64_CODE2BITS[charCode];
			if (!charBits) {
				throw new Error(`Invalid character in base64 string: ${text[i]}`);
			}
			bits.push(...charBits);
		}
		return new StateReader(bits);
	}

	static fromBitString(text: string): StateReader {
		return new StateReader(text.split('').map((c) => c === '1'));
	}

	ended(): boolean {
		return this.offset >= this.bits.length;
	}

	readBit(): boolean {
		if (this.ended()) throw new Error('End of bits');
		return this.bits[this.offset++];
	}

	readInteger(bits: number): number {
		try {
			let value = 0;
			for (let i = 0; i < bits; i++) {
				value <<= 1;
				if (this.readBit()) value += 1;
			}
			return value;
		} catch (cause) {
			throw new Error(`Error reading integer`, { cause });
		}
	}

	/** See `StateWriter.writeVarint`. */
	readVarint(signed?: true): number {
		try {
			let value = 0;
			let factor = 1;
			do {
				if (factor > Number.MAX_SAFE_INTEGER) throw new Error('Varint too long');
				value += this.readInteger(5) * factor;
				factor *= 32;
			} while (this.readBit());
			// the last group can still go beyond them, which the writer never writes
			if (!Number.isSafeInteger(value)) throw new Error('Varint beyond the safe integers');
			if (!signed) return value;
			return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
		} catch (cause) {
			throw new Error(`Error reading readVarint`, { cause });
		}
	}

	/** See `StateWriter.writeExpGolomb`. */
	readExpGolomb(k: number, signed?: true): number {
		try {
			let zeros = 0;
			while (!this.readBit()) zeros++;
			// beyond the safe integers
			if (zeros + k > 52) throw new Error('Exp-Golomb code too long');
			// after the leading 1
			let code = 1;
			for (let i = 0; i < zeros + k; i++) code = 2 * code + (this.readBit() ? 1 : 0);
			const value = code - 2 ** k;
			if (!signed) return value;
			return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
		} catch (cause) {
			throw new Error(`Error reading Exp-Golomb code`, { cause });
		}
	}

	readArray<T>(cb: () => T): T[] {
		try {
			const length = this.readVarint();
			const array: T[] = [];
			for (let i = 0; i < length; i++) array.push(cb());
			return array;
		} catch (cause) {
			throw new Error(`Error reading array`, { cause });
		}
	}

	readPoint(resolutionInMeters: number = 1): [number, number] {
		if (!resolutionInMeters || resolutionInMeters < 1) resolutionInMeters = 1;

		try {
			const scale = Math.round(1e5 / resolutionInMeters);
			return [this.readVarint(true) / scale, this.readVarint(true) / scale];
		} catch (cause) {
			throw new Error(`Error reading point`, { cause });
		}
	}

	/** The grid of the element coordinates, which the map of the root sets. */
	private get elementGrid(): LocalGrid {
		if (!this.grid) throw new Error('Element points need the grid of the map');
		return this.grid;
	}

	/** See `StateWriter.writeElementPoint`. */
	readElementPoint(): [number, number] {
		const [px, py] = this.relativePoints ? this.lastPoint : [0, 0];
		const x = px + this.readExpGolomb(this.coordinateParameters[0], true);
		const y = py + this.readExpGolomb(this.coordinateParameters[1], true);
		this.lastPoint = [x, y];
		return checkLatitude(this.elementGrid.fromGrid([x, y]));
	}

	/** The points of an element: each as the difference to the previous one. */
	readElementPoints(): [number, number][] {
		const grid = this.elementGrid;
		const length = this.readVarint();
		const points: [number, number][] = [];
		let x = 0;
		let y = 0;
		for (let i = 0; i < length; i++) {
			x += this.readExpGolomb(this.coordinateParameters[0], true);
			y += this.readExpGolomb(this.coordinateParameters[1], true);
			points.push(checkLatitude(grid.fromGrid([x, y])));
		}
		return points;
	}

	readRoot(): MapState {
		try {
			const root: MapState = { elements: [] };

			this.readVersion();
			this.readPalette();
			this.readStringTable();
			this.styleHistory = new StyleHistory();

			// the camera
			root.view = this.readView();
			if (!root.view) delete root.view;

			this.readGrid();

			const frame = this.readFrame();
			if (frame) root.frame = frame;

			// Read the metadata
			root.meta = this.readMetadata();
			if (!root.meta) delete root.meta;

			// Read the elements
			let previous: StateElement | undefined;
			while (true) {
				const { key, repeat } = this.readElementType(previous);
				const before = repeat ? previous : undefined;
				switch (key) {
					case END_KEY:
						return root;
					case ELEMENT_KEYS.marker:
						previous = this.readElementMarker(before);
						break;
					case ELEMENT_KEYS.line:
						previous = this.readElementLine(before);
						break;
					case ELEMENT_KEYS.polygon:
						previous = this.readElementPolygon(before);
						break;
					case ELEMENT_KEYS.circle:
						previous = this.readElementCircle(before);
						break;
					default:
						// The element's length is unknown, so the rest of the stream cannot be read reliably
						throw new Error(`Unknown element key: ${key}`);
				}
				root.elements.push(previous);
			}
		} catch (cause) {
			throw new Error(`Error reading root`, { cause });
		}
	}

	/** The version of the format, of which only `CODEC_VERSION` is read. */
	readVersion() {
		const version = this.readInteger(3);
		if (version !== CODEC_VERSION) throw new Error(`Unsupported version: ${version}`);
	}

	/** See `StateWriter.writeGrid`. */
	readGrid() {
		// the step of the coordinates: 0.00001° × 2^exponent, each of the 16 values valid
		const exponent = this.readInteger(4);
		// the origin of the coordinates of the frame and the elements
		const origin: [number, number] = [this.readVarint(true) / ORIGIN_SCALE, this.readVarint(true) / ORIGIN_SCALE];
		this.grid = new LocalGrid(origin, exponent);
		// whether longitude and latitude have parameters of their own
		const perAxis = this.readBit();
		const k = this.readInteger(5);
		this.coordinateParameters = [k, perAxis ? this.readInteger(5) : k];
		this.relativePoints = this.readBit();
		this.lastPoint = [0, 0];
	}

	/**
	 * See `StateWriter.writeElementType`: the key of the type (0: no more elements, also at the
	 * end of the bits), and whether the element repeats the type and the styles of `previous`.
	 */
	readElementType(previous: StateElement | undefined): { key: number; repeat: boolean } {
		try {
			const repeat = previous ? this.readBit() : false;
			return { key: repeat ? ELEMENT_KEYS[previous!.type] : this.readInteger(3), repeat };
		} catch (_) {
			return { key: 0, repeat: false };
		}
	}

	/** See `StateWriter.writeFrame`. */
	readFrame(): Bounds | undefined {
		try {
			if (!this.readBit()) return undefined;
			const x0 = this.readVarint(true);
			const y0 = this.readVarint(true);
			const width = this.readVarint();
			const height = this.readVarint();
			if (width < 1 || height < 1) throw new Error('Invalid size of the frame');
			const [west, south] = this.elementGrid.fromGrid([x0, y0]);
			const [east, north] = this.elementGrid.fromGrid([x0 + width, y0 + height]);
			// as the writer writes it
			const frame = sanitizeFrame([west, south, east, north]);
			if (!frame) throw new Error('Frame beyond the map');
			return frame;
		} catch (cause) {
			throw new Error(`Error reading frame`, { cause });
		}
	}

	readView(): MapState['view'] {
		try {
			if (!this.readBit()) return undefined;

			const radius = Math.pow(2, this.readInteger(10) / 40);
			// effective resolution of coordinates is 1000 times the visible radius
			const center = checkLatitude(this.readPoint(radius / 1e3));

			if (this.readBit()) throw new Error('Additional map metadata is not supported yet');

			return { radius, center };
		} catch (cause) {
			throw new Error(`Error reading map`, { cause });
		}
	}

	readMetadata(): StateMetadata | undefined {
		try {
			if (!this.readBit()) return undefined;

			const metadata: StateMetadata = {};
			while (true) {
				const key = this.readInteger(6);
				switch (key) {
					case END_KEY:
						return metadata;
					case METADATA_KEYS.background:
						metadata.background = parseBackground(this.readStringRef(true));
						break;
					case METADATA_KEYS.legend:
						metadata.legend = this.readLegend();
						break;
					case METADATA_KEYS.colorScheme:
						metadata.colorScheme = this.readStringRef(true);
						break;
					case METADATA_KEYS.mapLabelsOnTop:
						metadata.mapLabelsOnTop = true;
						break;
					case METADATA_KEYS.title:
						metadata.title = this.readStringRef();
						break;
					case METADATA_KEYS.viewer:
						metadata.viewer = this.readViewer();
						break;
					case METADATA_KEYS.labelOverlap:
						metadata.labelOverlap = 'hide';
						break;
					case METADATA_KEYS.labelMinZoom: {
						// in tenths of a zoom level
						const zoom = sanitizeLabelMinZoom(this.readVarint() / 10);
						if (zoom === undefined) throw new Error('Invalid zoom level of labels');
						metadata.labelMinZoom = zoom;
						break;
					}
					default:
						throw new Error(`Invalid state key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading metadata`, { cause });
		}
	}

	/** `previous`: the element before, if this one repeats its type and styles. */
	readElementMarker(previous?: StateElement): StateElementMarker {
		try {
			const element: StateElementMarker = { type: 'marker', point: this.readElementPoint() };
			this.readElementStyles(element, previous);
			if (this.readBit()) element.label = this.readStringRef();
			const popup = this.readPopup();
			if (popup) element.popup = popup;
			return element;
		} catch (cause) {
			throw new Error(`Error reading marker element`, { cause });
		}
	}

	readElementLine(previous?: StateElement): StateElementLine {
		try {
			const element: StateElementLine = { type: 'line', points: this.readElementPoints() };
			if (element.points.length < 2) throw new Error('A line of fewer than 2 points');
			if (this.readBit()) element.smooth = true;
			this.readElementStyles(element, previous);
			const popup = this.readPopup();
			if (popup) element.popup = popup;
			return element;
		} catch (cause) {
			throw new Error(`Error reading line element`, { cause });
		}
	}

	readElementPolygon(previous?: StateElement): StateElementPolygon {
		try {
			const element: StateElementPolygon = { type: 'polygon', points: this.readElementPoints() };
			if (element.points.length < 3) throw new Error('An area of fewer than 3 points');
			if (this.readBit()) element.smooth = true;
			this.readElementStyles(element, previous);
			const popup = this.readPopup();
			if (popup) element.popup = popup;
			return element;
		} catch (cause) {
			throw new Error(`Error reading polygon element`, { cause });
		}
	}

	readElementCircle(previous?: StateElement): StateElementCircle {
		try {
			const point = this.readElementPoint();
			const radius = this.readVarint();
			if (radius < 1) throw new Error('A circle without a radius');
			const element: StateElementCircle = { type: 'circle', point, radius };
			this.readElementStyles(element, previous);
			const popup = this.readPopup();
			if (popup) element.popup = popup;
			return element;
		} catch (cause) {
			throw new Error(`Error reading circle element`, { cause });
		}
	}

	/**
	 * The styles of an element: those of the element before (`previous`), if it repeats them, else
	 * read. Copies: a style is shared with the history.
	 */
	private readElementStyles(element: StateElement, previous?: StateElement) {
		const hasStroke = element.type === 'polygon' || element.type === 'circle';
		if (previous) {
			if (previous.style) element.style = { ...previous.style };
			if (hasStroke && 'strokeStyle' in previous && previous.strokeStyle) {
				element.strokeStyle = { ...previous.strokeStyle };
			}
			return;
		}
		if (this.readBit()) element.style = { ...this.readStyle() };
		if (hasStroke && this.readBit()) element.strokeStyle = { ...this.readStyle() };
	}

	readLegend(): StateLegend {
		try {
			const legend: StateLegend = { entries: [] };
			while (true) {
				const key = this.readInteger(4);
				switch (key) {
					case END_KEY:
						return legend;
					case LEGEND_KEYS.layout:
						legend.layout = LEGEND_LAYOUTS[this.readVarint()];
						if (!legend.layout) throw new Error('Invalid legend layout');
						break;
					case LEGEND_KEYS.entries:
						legend.entries = this.readArray(() => this.readLegendEntry());
						break;
					case LEGEND_KEYS.font:
						legend.font = LEGEND_FONTS[this.readVarint()];
						if (!legend.font) throw new Error('Invalid legend font');
						break;
					case LEGEND_KEYS.bold:
						legend.bold = true;
						break;
					case LEGEND_KEYS.italic:
						legend.italic = true;
						break;
					case LEGEND_KEYS.theme:
						legend.theme = LEGEND_THEMES[this.readVarint()];
						if (!legend.theme) throw new Error('Invalid legend theme');
						break;
					default:
						throw new Error(`Invalid legend key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading legend`, { cause });
		}
	}

	/** The settings of the viewer: a choice per control, by its index in `VIEWER_CHOICES`. */
	readViewer(): StateViewer {
		try {
			const viewer: Record<string, string> = {};
			const keys = Object.keys(VIEWER_CHOICES) as (keyof typeof VIEWER_CHOICES)[];
			while (true) {
				const key = this.readInteger(4);
				if (key === END_KEY) return viewer as StateViewer;
				const name = keys[key - 1];
				if (!name) throw new Error(`Invalid viewer key: ${key}`);
				const choice = VIEWER_CHOICES[name][this.readVarint()];
				if (!choice) throw new Error(`Invalid viewer ${name}`);
				viewer[name] = choice;
			}
		} catch (cause) {
			throw new Error(`Error reading viewer`, { cause });
		}
	}

	/** An entry of the legend. */
	readLegendEntry(): StateLegendEntry {
		let type: StateLegendEntry['type'] | undefined;
		let style: StateStyle | undefined;
		let strokeStyle: StateStyle | undefined;
		let label = '';
		while (true) {
			const key = this.readInteger(4);
			switch (key) {
				case END_KEY:
					if (!type) throw new Error('Legend entry without type');
					return { type, ...(style && { style }), ...(strokeStyle && { strokeStyle }), label };
				case LEGEND_ENTRY_KEYS.label:
					label = this.readStringRef();
					break;
				case LEGEND_ENTRY_KEYS.type:
					type = LEGEND_ENTRY_TYPES[this.readVarint()];
					if (!type) throw new Error('Invalid legend entry type');
					break;
				case LEGEND_ENTRY_KEYS.style:
					style = this.readStyle();
					break;
				case LEGEND_ENTRY_KEYS.strokeStyle:
					strokeStyle = this.readStyle();
					break;
				default:
					throw new Error(`Invalid legend entry key: ${key}`);
			}
		}
	}

	/** See `StateWriter.writePopup`: 1 bit whether there is one, then its key/value pairs. */
	readPopup(): StatePopup | undefined {
		try {
			if (!this.readBit()) return undefined;
			const popup: StatePopup = { text: '' };
			while (true) {
				const key = this.readInteger(4);
				switch (key) {
					case END_KEY:
						return popup;
					case POPUP_KEYS.text:
						popup.text = this.readStringRef();
						break;
					default:
						throw new Error(`Invalid popup key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading popup`, { cause });
		}
	}

	/** A style: a reference to an earlier style (0: none) and the differences to it. */
	readStyle(): StateStyle {
		try {
			const ref = this.readExpGolomb(STYLE_REFERENCE_PARAMETER);
			const base = this.styleHistory.get(ref);
			if (ref > 0 && !base) throw new Error(`Invalid style reference: ${ref}`);
			const style = this.readStylePatch({ ...base });
			// the writer leaves it out without an arrowhead
			if (style.arrowSize !== undefined && !hasArrow(style)) throw new Error('Arrow size without an arrowhead');
			if ((style.patternScale !== undefined || style.patternCoverage !== undefined) && !hasPattern(style))
				throw new Error('Pattern size or coverage without a pattern');
			this.styleHistory.remember(style);
			return style;
		} catch (cause) {
			throw new Error(`Error reading style`, { cause });
		}
	}

	/** Apply the changed and removed fields to `style`. */
	/** A varint below `count`, e.g. the index of a name. */
	readIndex(count: number): number {
		const index = this.readVarint();
		if (index >= count) throw new Error(`Invalid index: ${index} of ${count}`);
		return index;
	}

	/** A name of the table, stored as its index. */
	readName<T extends string>(table: readonly T[]): T {
		return table[this.readIndex(table.length)];
	}

	readStylePatch(style: StateStyle): StateStyle {
		while (true) {
			const key = this.readStyleKey();
			if (key === END_KEY) return style;
			if (key === STYLE_REMOVE_KEY) {
				const removed = this.readStyleKey();
				const field = STYLE_FIELDS.find((f) => f.key === removed);
				if (!field) throw new Error(`Invalid state key: ${removed}`);
				delete style[field.name];
				continue;
			}
			// the keys of the fields as the writer has them
			const field = STYLE_FIELDS.find((f) => f.key === key);
			if (!field) throw new Error(`Invalid state key: ${key}`);
			switch (field.name) {
				case 'halo':
					style.halo = this.readVarint() / 10;
					break;
				case 'pattern':
					style.pattern = this.readName(FILL_PATTERN_NAMES);
					break;
				case 'dash':
					style.dash = this.readName(STROKE_STYLE_NAMES);
					break;
				case 'rotate':
					style.rotate = this.readVarint(true);
					if (Math.abs(style.rotate) > 180) throw new Error(`Invalid rotation: ${style.rotate}`);
					break;
				case 'size':
					style.size = this.readVarint() / 10;
					break;
				case 'width':
					style.width = this.readVarint() / 10;
					break;
				case 'labelPosition':
					style.labelPosition = this.readName(LABEL_POSITION_NAMES);
					break;
				case 'arrowStart':
				case 'arrowEnd':
					style[field.name] = this.readName(ARROW_NAMES);
					break;
				case 'arrowSize':
					style.arrowSize = this.readVarint() / 10;
					break;
				// limited, since a large pattern would take long to draw
				case 'patternScale':
					style.patternScale = this.readVarint() / 10;
					if (style.patternScale < PATTERN_SCALE_RANGE[0] || style.patternScale > PATTERN_SCALE_RANGE[1])
						throw new Error(`Invalid pattern scale: ${style.patternScale}`);
					break;
				case 'patternCoverage':
					style.patternCoverage = this.readVarint() / 100;
					if (style.patternCoverage < PATTERN_COVERAGE_RANGE[0] || style.patternCoverage > PATTERN_COVERAGE_RANGE[1])
						throw new Error(`Invalid pattern coverage: ${style.patternCoverage}`);
					break;
				case 'color':
				case 'labelColor':
				case 'haloColor':
					style[field.name] = this.readColorValue();
					break;
				case 'visible':
					// the key alone means "false"
					style.visible = false;
					break;
				case 'symbol':
					style.symbol = this.readStringRef(true);
					break;
				case 'labelSize':
					style.labelSize = this.readVarint() / 10;
					break;
				case 'font':
					style.font = this.readStringRef(true);
					break;
			}
		}
	}

	/** The key of a style field, see `STYLE_KEY_PARAMETER`. */
	readStyleKey(): number {
		return this.readExpGolomb(STYLE_KEY_PARAMETER);
	}

	/** The colors, each once, which are referenced by index afterwards. */
	readPalette() {
		this.palette = this.readArray(() => this.readPaletteColor());
	}

	/** See `StateWriter.writePaletteColor`. */
	readPaletteColor(): string {
		if (!this.readBit()) return this.readColor();
		const index = this.readInteger(BUILT_IN_COLOR_BITS);
		const color = BUILT_IN_COLORS[index];
		if (color === undefined) throw new Error(`Invalid built-in color: ${index}`);
		const rgb = parseColor(color)!;
		return formatHex({ ...rgb, alpha: this.readAlpha() });
	}

	/** The strings of the metadata, the labels and the popups, each once, which are referenced afterwards. */
	readStringTable(): string[] {
		try {
			const count = this.readVarint();
			let strings: string[] = [];
			let formatCount = 0;
			if (count > 0) {
				// the first are words of the format
				formatCount = this.readVarint();
				if (formatCount > count) throw new Error(`Invalid number of words of the format: ${formatCount}`);
				// the block goes on to the end of its bits, which the decoder knows
				const block = decodeStringBlock(this.bits.slice(this.offset), count, formatCount);
				strings = block.strings;
				this.readBlock(block.length);
			}
			this.strings = [strings.slice(0, formatCount), strings.slice(formatCount)];
			this.nextString = [0, 0];
			return strings;
		} catch (cause) {
			throw new Error(`Error reading string table`, { cause });
		}
	}

	/** The next `length` bits, e.g. a block that is decoded by itself. */
	readBlock(length: number): boolean[] {
		if (this.offset + length > this.bits.length) throw new Error('Block beyond the end of bits');
		const block = this.bits.slice(this.offset, this.offset + length);
		this.offset += length;
		return block;
	}

	/** See `StateWriter.writeStringRef`. */
	readStringRef(format = false): string {
		const section = format ? 0 : 1;
		const index = this.readBit() ? this.nextString[section] : this.readVarint();
		const value = this.strings[section][index];
		if (value === undefined) throw new Error(`Invalid string index: ${index}`);
		this.nextString[section] = Math.max(this.nextString[section], index + 1);
		return value;
	}

	/** A color, as its index in the palette. */
	readColorValue(): string {
		const index = this.readVarint();
		const color = this.palette[index];
		if (color === undefined) throw new Error(`Invalid palette index: ${index}`);
		return color;
	}

	/** See `StateWriter.writeAlpha`. */
	private readAlpha(): number {
		return this.readBit() ? this.readInteger(8) / 255 : 1;
	}

	readColor(): string {
		try {
			const r = this.readInteger(8);
			const g = this.readInteger(8);
			const b = this.readInteger(8);

			return formatHex({ r, g, b, alpha: this.readAlpha() });
		} catch (cause) {
			throw new Error(`Error reading color`, { cause });
		}
	}
}

/** The keys of the element types. */

function parseBackground(json: string): StateBackground {
	const background = sanitizeBackground(JSON.parse(json));
	if (!background) throw new Error('Invalid background');
	return background;
}

/** A position whose latitude is on the map, as the writer writes it, which MapLibre needs. */
function checkLatitude(position: [number, number]): [number, number] {
	if (!(Math.abs(position[1]) <= 90)) throw new Error(`Invalid latitude: ${position[1]}`);
	return position;
}
