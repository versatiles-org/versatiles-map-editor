import { formatHex } from './color.js';
import type {
	Bounds,
	StateBackground,
	StateElementCircle,
	StateElementLine,
	StateElementMarker,
	StateElementPolygon,
	StateMetadata,
	StateLegend,
	StateLegendEntry,
	StatePopup,
	MapState,
	StateStyle,
	StateViewer
} from './types.js';
import { BASE64_CODE2BITS, CHAR_VALUE2CODE, CODEC_VERSION, ORIGIN_SCALE } from './constants.js';
import {
	oldLegendEntry,
	removeViewerDefaults,
	sanitizeBackground,
	sanitizeLabelMinZoom,
	VIEWER_CHOICES
} from './profile.js';
import { withoutOldOpacity, type OldStyle } from './legacy.js';
import { LocalGrid, MAX_DIGITS } from './grid.js';
import { OLD_OPACITY_KEY, STYLE_FIELDS, STYLE_REMOVE_KEY, StyleHistory } from './style_history.js';
import { LEGEND_ENTRY_TYPES, LEGEND_FONTS, LEGEND_LAYOUTS, LEGEND_POSITIONS } from './types.js';

export class StateReader {
	public bits: boolean[];
	public offset: number = 0;
	// the colors, which are referenced by index (see `readPalette`)
	private palette: string[] = [];
	// the names of the symbols, which are referenced by index (see `readSymbols`)
	private symbols: string[] = [];
	// the styles read so far
	private styleHistory = new StyleHistory();
	// the coordinates of the elements are steps on this grid, from the center of the map
	private grid: LocalGrid | undefined;

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

	readInteger(bits: number, signed?: true): number {
		try {
			let value = 0;
			for (let i = 0; i < bits; i++) {
				value <<= 1;
				if (this.readBit()) value += 1;
			}
			if (signed && value >= 1 << (bits - 1)) {
				value -= 1 << bits;
			}
			return value;
		} catch (cause) {
			throw new Error(`Error reading integer`, { cause });
		}
	}

	read6pack(): number {
		let value = 0;
		for (let i = 0; i < 6; i++) {
			value <<= 1;
			if (this.bits[this.offset++]) value += 1;
		}
		return value;
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
			if (!signed) return value;
			return value % 2 === 1 ? -(value + 1) / 2 : value / 2;
		} catch (cause) {
			throw new Error(`Error reading readVarint`, { cause });
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

	/** A point of an element, on the grid. */
	readElementPoint(): [number, number] {
		return this.elementGrid.fromGrid([this.readVarint(true), this.readVarint(true)]);
	}

	/** The points of an element: each as the difference to the previous one. */
	readElementPoints(): [number, number][] {
		const grid = this.elementGrid;
		const length = this.readVarint();
		const points: [number, number][] = [];
		let x = 0;
		let y = 0;
		for (let i = 0; i < length; i++) {
			x += this.readVarint(true);
			y += this.readVarint(true);
			points.push(grid.fromGrid([x, y]));
		}
		return points;
	}

	readRoot(): MapState {
		try {
			const root: MapState = { elements: [] };

			const version = this.readInteger(3);
			if (version !== CODEC_VERSION) throw new Error(`Unsupported version: ${version}`);
			this.readPalette();
			this.symbols = [];
			this.styleHistory = new StyleHistory();

			// the camera
			root.map = this.readMap();
			if (!root.map) delete root.map;

			const digits = this.readVarint();
			if (digits > MAX_DIGITS) throw new Error(`Invalid resolution: ${digits}`);
			// the origin of the coordinates of the frame and the elements
			const origin: [number, number] = [this.readVarint(true) / ORIGIN_SCALE, this.readVarint(true) / ORIGIN_SCALE];
			this.grid = new LocalGrid(origin, digits);

			const frame = this.readFrame();
			if (frame) root.frame = frame;

			// Read the metadata
			root.meta = this.readMetadata();
			if (!root.meta) delete root.meta;

			// Read the elements
			while (true) {
				let key: number;
				try {
					key = this.readInteger(3);
				} catch (_) {
					key = 0;
				}
				switch (key) {
					case 0:
						return root;
					case 1:
						root.elements.push(this.readElementMarker());
						break;
					case 2:
						root.elements.push(this.readElementLine());
						break;
					case 3:
						root.elements.push(this.readElementPolygon());
						break;
					case 4:
						root.elements.push(this.readElementCircle());
						break;
					default:
						// The element's length is unknown, so the rest of the stream cannot be read reliably
						throw new Error(`Unknown element key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading root`, { cause });
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
			return [west, south, east, north];
		} catch (cause) {
			throw new Error(`Error reading frame`, { cause });
		}
	}

	readMap(): MapState['map'] {
		try {
			if (!this.readBit()) return undefined;

			const radius = Math.pow(2, this.readInteger(10) / 40);
			// effective resolution of coordinates is 1000 times the visible radius
			const center = this.readPoint(radius / 1e3);

			if (this.readBit()) throw new Error('Addtional map meta data is not supported yet');

			return { radius, center };
		} catch (cause) {
			throw new Error(`Error reading map`, { cause });
		}
	}

	readMetadata(): StateMetadata | undefined {
		try {
			if (!this.readBit()) return undefined;

			const metadata: StateMetadata = {};
			// of older links: the search as a flag, and the position in the legend
			let oldSearch = false;
			this.oldLegendPosition = undefined;
			while (true) {
				const key = this.readInteger(6);
				switch (key) {
					case 0: {
						if (!metadata.viewer && (oldSearch || this.oldLegendPosition)) {
							const viewer = removeViewerDefaults({
								search: oldSearch ? 'top-left' : undefined,
								legend: this.oldLegendPosition
							});
							if (viewer) metadata.viewer = viewer;
						}
						// no metadata, like the writer does now (older hashes could store it empty)
						return Object.keys(metadata).length > 0 ? metadata : undefined;
					}
					//case 1:
					//	metadata.heading = this.readString();
					//	break;
					case 2:
						metadata.background = parseBackground(this.readString());
						break;
					case 3:
						metadata.legend = this.readLegend();
						break;
					case 4:
						metadata.colorScheme = this.readString();
						break;
					case 5:
						// older links: the address search, as a flag
						oldSearch = true;
						break;
					case 6:
						metadata.labelFont = this.readString();
						break;
					case 7:
						metadata.mapLabelsOnTop = true;
						break;
					case 9:
						metadata.title = this.readString();
						break;
					case 10:
						metadata.viewer = this.readViewer();
						break;
					case 11:
						metadata.labelOverlap = 'hide';
						break;
					case 12: {
						// in tenths of a zoom level
						const zoom = sanitizeLabelMinZoom(this.readVarint() / 10);
						if (zoom === undefined) throw new Error('Invalid zoom level of labels');
						metadata.labelMinZoom = zoom;
						break;
					}
					case 8:
						// not a field of the metadata: the symbols of the styles and of the legend
						this.readSymbols();
						break;
					default:
						throw new Error(`Invalid state key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading metadata`, { cause });
		}
	}

	readElementMarker(): StateElementMarker {
		try {
			const element: StateElementMarker = { type: 'marker', point: this.readElementPoint() };
			// a copy: the style can be shared with other elements, e.g. as the base of their styles
			if (this.readBit()) element.style = { ...this.readStyle() };
			if (this.readBit()) element.popup = this.readPopup();
			return element;
		} catch (cause) {
			throw new Error(`Error reading marker element`, { cause });
		}
	}

	readElementLine(): StateElementLine {
		try {
			const element: StateElementLine = { type: 'line', points: this.readElementPoints() };
			if (this.readBit()) element.style = this.readStyle();
			if (this.readBit()) element.popup = this.readPopup();
			return element;
		} catch (cause) {
			throw new Error(`Error reading line element`, { cause });
		}
	}

	readElementPolygon(): StateElementPolygon {
		try {
			const element: StateElementPolygon = { type: 'polygon', points: this.readElementPoints() };
			if (this.readBit()) element.style = this.readStyle();
			if (this.readBit()) element.strokeStyle = this.readStyle();
			if (this.readBit()) element.popup = this.readPopup();
			return element;
		} catch (cause) {
			throw new Error(`Error reading polygon element`, { cause });
		}
	}

	readElementCircle(): StateElementCircle {
		try {
			const point = this.readElementPoint();
			const radius = this.readVarint();
			const element: StateElementCircle = { type: 'circle', point, radius };
			if (this.readBit()) element.style = this.readStyle();
			if (this.readBit()) element.strokeStyle = this.readStyle();
			if (this.readBit()) element.popup = this.readPopup();
			return element;
		} catch (cause) {
			throw new Error(`Error reading circle element`, { cause });
		}
	}

	readLegend(): StateLegend {
		try {
			const legend: StateLegend = { entries: [] };
			while (true) {
				const key = this.readInteger(4);
				switch (key) {
					case 0:
						return legend;
					case 1:
						// older links: the position of the legend, which is one of the viewer now
						this.oldLegendPosition = LEGEND_POSITIONS[this.readVarint()];
						if (!this.oldLegendPosition) throw new Error('Invalid legend position');
						break;
					case 2:
						legend.layout = LEGEND_LAYOUTS[this.readVarint()];
						if (!legend.layout) throw new Error('Invalid legend layout');
						break;
					case 3:
						legend.entries = this.readArray(() => this.readLegendEntry());
						break;
					case 4:
						legend.font = LEGEND_FONTS[this.readVarint()];
						if (!legend.font) throw new Error('Invalid legend font');
						break;
					case 5:
						legend.bold = true;
						break;
					case 6:
						legend.italic = true;
						break;
					default:
						throw new Error(`Invalid legend key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading legend`, { cause });
		}
	}

	/** The position of the legend in an older link, kept for the viewer settings. */
	private oldLegendPosition: (typeof LEGEND_POSITIONS)[number] | undefined;

	/** The settings of the viewer: a choice per control, by its index in `VIEWER_CHOICES`. */
	readViewer(): StateViewer {
		try {
			const viewer: Record<string, string> = {};
			const keys = Object.keys(VIEWER_CHOICES) as (keyof typeof VIEWER_CHOICES)[];
			while (true) {
				const key = this.readInteger(4);
				if (key === 0) return viewer as StateViewer;
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

	/** An entry of the legend. Older links have a color and maybe a symbol instead (see `oldLegendEntry`). */
	readLegendEntry(): StateLegendEntry {
		let type: StateLegendEntry['type'] | undefined;
		let style: StateStyle | undefined;
		let strokeStyle: StateStyle | undefined;
		let label = '';
		let old: { color?: string; symbol?: string } = {};
		while (true) {
			const key = this.readInteger(4);
			switch (key) {
				case 0: {
					if (type) return { type, ...(style && { style }), ...(strokeStyle && { strokeStyle }), label };
					return oldLegendEntry(old.color ?? '#000000', old.symbol, label);
				}
				case 1:
					old = { ...old, color: this.readColorValue() };
					break;
				case 3:
					label = this.readString();
					break;
				case 4:
					old = { ...old, symbol: this.readSymbolValue() };
					break;
				case 5:
					type = LEGEND_ENTRY_TYPES[this.readVarint()];
					if (!type) throw new Error('Invalid legend entry type');
					break;
				case 6:
					style = this.readStyle();
					break;
				case 7:
					strokeStyle = this.readStyle();
					break;
				default:
					throw new Error(`Invalid legend entry key: ${key}`);
			}
		}
	}

	readPopup(): StatePopup {
		try {
			const popup: StatePopup = { text: '' };
			while (true) {
				const key = this.readInteger(4);
				switch (key) {
					case 0:
						return popup;
					case 1:
						popup.text = this.readString();
						break;
					default:
						throw new Error(`Invalid popup key: ${key}`);
				}
			}
		} catch (cause) {
			throw new Error(`Error reading popup`, { cause });
		}
	}

	/**
	 * A style: a reference to an earlier style (0: none) and the differences to it. The opacity of
	 * a fill in an older string becomes the alpha of its color; the style history keeps the style
	 * as it was written, since later styles of the string refer to it.
	 */
	readStyle(): StateStyle {
		try {
			const ref = this.readVarint();
			const base = this.styleHistory.get(ref);
			if (ref > 0 && !base) throw new Error(`Invalid style reference: ${ref}`);
			const style = this.readStylePatch({ ...base });
			this.styleHistory.remember(style);
			return withoutOldOpacity(style);
		} catch (cause) {
			throw new Error(`Error reading style`, { cause });
		}
	}

	/** Apply the changed and removed fields to `style`, also the opacity of older strings. */
	readStylePatch(style: OldStyle): OldStyle {
		while (true) {
			const key = this.readInteger(4);
			switch (key) {
				case 0:
					return style;
				case 1:
					style.halo = this.readVarint() / 10;
					break;
				case OLD_OPACITY_KEY:
					style.opacity = this.readVarint() / 100;
					break;
				case 3:
					style.pattern = this.readVarint();
					break;
				case 4:
					style.rotate = this.readVarint(true);
					break;
				case 5:
					style.size = this.readVarint() / 10;
					break;
				case 6:
					style.width = this.readVarint() / 10;
					break;
				case 7:
					style.align = this.readVarint();
					break;
				case 8:
					style.color = this.readColorValue();
					break;
				case 9:
					style.label = this.readString();
					break;
				case 10:
					style.visible = false;
					break;
				case 11:
					style.labelColor = this.readColorValue();
					break;
				case 12:
					style.haloColor = this.readColorValue();
					break;
				case 13:
					style.symbol = this.readSymbolValue();
					break;
				case STYLE_REMOVE_KEY: {
					const removed = this.readInteger(4);
					if (removed === OLD_OPACITY_KEY) {
						delete style.opacity;
						break;
					}
					const field = STYLE_FIELDS.find((f) => f.key === removed);
					if (!field) throw new Error(`Invalid state key: ${removed}`);
					delete style[field.name];
					break;
				}
				default:
					throw new Error(`Invalid state key: ${key}`);
			}
		}
	}

	/** The colors, each once, which are referenced by index afterwards. */
	readPalette() {
		this.palette = this.readArray(() => this.readColor());
	}

	/** The names of the symbols, each as the length of the beginning it shares with the previous one and the rest. */
	readSymbols() {
		let previous = '';
		this.symbols = this.readArray(() => {
			const shared = this.readVarint();
			if (shared > previous.length) throw new Error(`Invalid symbol name: ${shared} shared characters`);
			previous = previous.slice(0, shared) + this.readString();
			return previous;
		});
	}

	/** A symbol, as its index in the list of symbols. */
	readSymbolValue(): string {
		const index = this.readVarint();
		const name = this.symbols[index];
		if (name === undefined) throw new Error(`Invalid symbol index: ${index}`);
		return name;
	}

	/** A color, as its index in the palette. */
	readColorValue(): string {
		const index = this.readVarint();
		const color = this.palette[index];
		if (color === undefined) throw new Error(`Invalid palette index: ${index}`);
		return color;
	}

	readColor(): string {
		try {
			const r = this.readInteger(8);
			const g = this.readInteger(8);
			const b = this.readInteger(8);

			let a = 1;
			if (this.readBit()) a = this.readInteger(8) / 255;
			return formatHex({ r, g, b, alpha: a });
		} catch (cause) {
			throw new Error(`Error reading color`, { cause });
		}
	}

	readString(): string {
		try {
			const length = this.readVarint();
			const charCodes: number[] = [];
			for (let i = 0; i < length; i++) {
				const value = this.readVarint();
				charCodes.push(value < 128 ? CHAR_VALUE2CODE[value] : value);
			}
			// in chunks: spreading a long array into the arguments overflows the stack
			let text = '';
			for (let i = 0; i < charCodes.length; i += 8192) {
				text += String.fromCharCode(...charCodes.slice(i, i + 8192));
			}
			return text;
		} catch (cause) {
			throw new Error(`Error reading string`, { cause });
		}
	}
}

function parseBackground(json: string): StateBackground {
	const background = sanitizeBackground(JSON.parse(json));
	if (!background) throw new Error('Invalid background');
	return background;
}
