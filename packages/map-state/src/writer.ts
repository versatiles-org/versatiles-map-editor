import { parseColor } from './color.js';
import { BASE64_CHARS, CHAR_CODE2VALUE, CODEC_VERSION, MAX_CODEC_VERSION } from './constants.js';
import { StateReader } from './reader.js';
import { LEGEND_FONTS, LEGEND_LAYOUTS, LEGEND_POSITIONS } from './types.js';
import { digitsForResolution, LocalGrid } from './grid.js';
import { colorKey, encodedValue, STYLE_FIELDS, STYLE_REMOVE_KEY, StyleHistory } from './style_history.js';
import type {
	StateElementCircle,
	StateElementLine,
	StateElementMarker,
	StateElementPolygon,
	StateMetadata,
	StateLegend,
	StatePopup,
	StateRoot,
	StateStyle
} from './types.js';

export class StateWriter {
	bits: boolean[] = [];
	readonly version: number;
	// Since version 1: the colors of the state, most frequent first, by their color key
	private palette: Map<string, number> | undefined;
	// Since version 1: the styles written so far
	private styleHistory: StyleHistory | undefined;

	// Since version 1: the coordinates of the elements are steps on this grid
	private grid: LocalGrid | undefined;
	private readonly resolution: number;

	/**
	 * `resolution`: the precision of the element coordinates in meters (since version 1),
	 * rounded to decimal places of degrees. Coarser is shorter. Default: 1 m, as precise as version 0.
	 */
	constructor({ version = CODEC_VERSION, resolution = 1 }: { version?: number; resolution?: number } = {}) {
		if (version < 0 || version > MAX_CODEC_VERSION) throw new Error(`Unsupported version: ${version}`);
		if (!(resolution > 0) || !Number.isFinite(resolution)) throw new Error(`Invalid resolution: ${resolution}`);
		this.version = version;
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

	writeVarint(value: number, signed?: true) {
		if (value % 1 !== 0) throw new Error('value must be an integer');

		if (signed) {
			value = value < 0 ? ((-1 - value) << 1) | 1 : value << 1;
		} else {
			if (value < 0) throw new Error('Unsigned varint cannot be negative');
		}
		while (true) {
			this.writeInteger(value & 0x1f, 5);
			value >>= 5;
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

	writePoints(points: [number, number][], resolutionInMeters: number = 1) {
		this.writeVarint(points.length);
		const scale = Math.round(1e5 / resolutionInMeters);
		let x = 0;
		let y = 0;
		points.forEach((point) => {
			const xi = Math.round(point[0] * scale);
			const yi = Math.round(point[1] * scale);
			this.writeVarint(xi - x, true);
			this.writeVarint(yi - y, true);
			x = xi;
			y = yi;
		});
	}

	writeRoot(root: StateRoot) {
		this.writeInteger(this.version, 3);
		if (this.version >= 1) {
			this.writePalette(collectColors(root));
			this.styleHistory = new StyleHistory();
		}

		const center = this.writeMap(root.map);
		if (this.version >= 1) {
			const digits = digitsForResolution(this.resolution);
			this.writeVarint(digits);
			this.grid = new LocalGrid(center ?? [0, 0], digits);
		}
		this.writeMetadata(root.meta);

		root.elements.forEach((element) => {
			switch (element.type) {
				case 'marker':
					this.writeInteger(1, 3);
					this.writeElementMarker(element);
					break;
				case 'line':
					this.writeInteger(2, 3);
					this.writeElementLine(element);
					break;
				case 'polygon':
					this.writeInteger(3, 3);
					this.writeElementPolygon(element);
					break;
				case 'circle':
					this.writeInteger(4, 3);
					this.writeElementCircle(element);
					break;
			}
		});
	}

	/** Returns the center as the reader decodes it, or undefined without a map. */
	writeMap(map: StateRoot['map']): [number, number] | undefined {
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

	/** A point of an element: absolute (version 0), or on the local grid. */
	writeElementPoint(point: [number, number]) {
		if (!this.grid) return this.writePoint(point);
		const [x, y] = this.grid.toGrid(point);
		this.writeVarint(x, true);
		this.writeVarint(y, true);
	}

	/** The points of an element: each as the difference to the previous one. */
	writeElementPoints(points: [number, number][]) {
		if (!this.grid) return this.writePoints(points);
		this.writeVarint(points.length);
		let px = 0;
		let py = 0;
		for (const point of points) {
			const [x, y] = this.grid.toGrid(point);
			this.writeVarint(x - px, true);
			this.writeVarint(y - py, true);
			px = x;
			py = y;
		}
	}

	writeMetadata(metadata?: StateMetadata) {
		if (!metadata || Object.keys(metadata).length === 0) {
			return this.writeBit(false);
		}

		this.writeBit(true);
		//if (metadata.heading) {
		//	this.writeInteger(1, 6);
		//	this.writeString(metadata.heading);
		//}
		if (metadata.background) {
			this.writeInteger(2, 6);
			// as JSON, so any option of @versatiles/style can be stored
			this.writeString(JSON.stringify(metadata.background));
		}
		if (metadata.legend) {
			this.writeInteger(3, 6);
			this.writeLegend(metadata.legend);
		}
		if (metadata.colorScheme) {
			this.writeInteger(4, 6);
			this.writeString(metadata.colorScheme);
		}
		if (metadata.search) {
			// a flag: the key alone
			this.writeInteger(5, 6);
		}
		this.writeInteger(0, 6);
	}

	writeElementMarker(element: StateElementMarker) {
		this.writeElementPoint(element.point);
		if (element.style) {
			this.writeBit(true);
			this.writeStyle(element.style);
		} else {
			this.writeBit(false);
		}
		this.writePopup(element.popup);
		return element;
	}

	writeElementLine(element: StateElementLine) {
		this.writeElementPoints(element.points);
		if (element.style) {
			this.writeBit(true);
			this.writeStyle(element.style);
		} else {
			this.writeBit(false);
		}
		this.writePopup(element.popup);
		return element;
	}

	writeElementPolygon(element: StateElementPolygon) {
		this.writeElementPoints(element.points);
		if (element.style) {
			this.writeBit(true);
			this.writeStyle(element.style);
		} else {
			this.writeBit(false);
		}
		if (element.strokeStyle) {
			this.writeBit(true);
			this.writeStyle(element.strokeStyle);
		} else {
			this.writeBit(false);
		}
		this.writePopup(element.popup);
	}

	writeElementCircle(element: StateElementCircle) {
		this.writeElementPoint(element.point);
		this.writeVarint(Math.round(element.radius));

		if (element.style) {
			this.writeBit(true);
			this.writeStyle(element.style);
		} else {
			this.writeBit(false);
		}

		if (element.strokeStyle) {
			this.writeBit(true);
			this.writeStyle(element.strokeStyle);
		} else {
			this.writeBit(false);
		}

		this.writePopup(element.popup);
	}

	// key/value pairs like a style, so fields can be added later
	writeLegend(legend: StateLegend) {
		if (legend.position && legend.position !== 'bottom-left') {
			this.writeInteger(1, 4);
			this.writeVarint(LEGEND_POSITIONS.indexOf(legend.position));
		}
		if (legend.layout && legend.layout !== 'vertical') {
			this.writeInteger(2, 4);
			this.writeVarint(LEGEND_LAYOUTS.indexOf(legend.layout));
		}
		if (legend.font && legend.font !== 'sans-serif') {
			this.writeInteger(4, 4);
			this.writeVarint(LEGEND_FONTS.indexOf(legend.font));
		}
		this.writeInteger(3, 4);
		this.writeArray(legend.entries, (entry) => {
			this.writeInteger(1, 4);
			this.writeColorValue(entry.color);
			if (entry.symbol != null) {
				this.writeInteger(2, 4);
				this.writeVarint(entry.symbol);
			}
			if (entry.label) {
				this.writeInteger(3, 4);
				this.writeString(entry.label);
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
		this.writeString(popup.text);
		this.writeInteger(0, 4);
	}

	/**
	 * A style. Since version 1: a reference to a similar earlier style (0: none) and only the
	 * differences to it, whichever is shortest.
	 */
	writeStyle(style: StateStyle) {
		if (!this.styleHistory) return this.writeStylePatch({}, style);

		let best: boolean[] | undefined;
		for (let ref = 0; ref <= this.styleHistory.length; ref++) {
			const writer = this.fork();
			writer.writeVarint(ref);
			writer.writeStylePatch(this.styleHistory.get(ref) ?? {}, style);
			if (!best || writer.bits.length < best.length) best = writer.bits;
		}
		this.bits.push(...best!);
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
			case 'opacity':
				return this.writeVarint(Math.round(style.opacity! * 100));
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
				return this.writeColorValue(style.color!);
			case 'label':
				return this.writeString(style.label!);
			case 'visible':
				// the key alone means "false"
				return;
		}
	}

	/** A writer for trying out an encoding, with the same palette. */
	private fork(): StateWriter {
		const writer = new StateWriter({ version: this.version, resolution: this.resolution });
		writer.palette = this.palette;
		return writer;
	}

	/** The colors, each once, and afterwards only their index (since version 1). */
	writePalette(colors: string[]) {
		this.writeArray(colors, (color) => this.writeColor(color));
		this.palette = new Map(colors.map((color, index) => [colorKey(color), index]));
	}

	/** A color: its index in the palette, or the color itself (version 0). */
	writeColorValue(color: string) {
		if (!this.palette) return this.writeColor(color);
		const index = this.palette.get(colorKey(color));
		if (index === undefined) throw new Error(`Color not in the palette: ${color}`);
		this.writeVarint(index);
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

/** The colors of all styles and of the legend, most frequent first, so they get the shortest indices. */
export function collectColors(root: StateRoot): string[] {
	const colors: string[] = [];
	for (const element of root.elements) {
		if (element.style?.color) colors.push(element.style.color);
		if ('strokeStyle' in element && element.strokeStyle?.color) colors.push(element.strokeStyle.color);
	}
	for (const entry of root.meta?.legend?.entries ?? []) colors.push(entry.color);

	const counts = new Map<string, { color: string; count: number; first: number }>();
	colors.forEach((color, i) => {
		const key = colorKey(color);
		const entry = counts.get(key);
		if (entry) entry.count++;
		else counts.set(key, { color, count: 1, first: i });
	});
	return [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first).map((entry) => entry.color);
}
