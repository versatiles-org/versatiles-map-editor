import { parseColor } from './color.js';
import {
	COLOR_INDEX_K,
	STRING_INDEX_K,
	BACKGROUND_KEYS,
	BACKGROUND_LANGUAGE_TEXT,
	BACKGROUND_STEPS,
	BACKGROUND_THEME_TEXT,
	bitsToBase64,
	CODEC_VERSION,
	ELEMENT_KEYS,
	ELEMENT_END,
	END_KEY,
	KEY_PARAMETERS,
	FRAME_KEYS,
	LEGEND_ENTRY_KEYS,
	LEGEND_KEYS,
	METADATA_KEYS,
	ORIGIN_SCALE,
	ELEMENT_FIELD_KEYS,
	VIEWER_KEYS
} from './constants.js';
import { boundsOf, centerOf } from './bounds.js';
import {
	LEGEND_DEFAULTS,
	removeViewerDefaults,
	sanitizeBackground,
	sanitizeFrame,
	sanitizeState,
	sanitizeLabels,
	VIEWER_BUTTONS,
	VIEWER_CHOICES,
	withoutUnusedFields
} from './profile.js';
import { encodeStrings } from './string_coder.js';
import {
	ARROW_NAMES,
	BACKGROUND_LABELS,
	BACKGROUND_LANGUAGES,
	BACKGROUND_THEMES,
	FILL_PATTERN_NAMES,
	LABEL_POSITION_NAMES,
	STROKE_STYLE_NAMES,
	LEGEND_ENTRY_TYPES,
	LEGEND_FONTS,
	LEGEND_LAYOUTS,
	LEGEND_THEMES,
	type Bounds,
	type StateBackground,
	type StateFrame,
	type StateElement,
	type StateElementCircle,
	type StateElementLine,
	type StateElementMarker,
	type StateElementPolygon,
	type StateMetadata,
	type StateLegend,
	type MapState,
	type StateStyle,
	type StyleRoleName,
	type StateViewer
} from './types.js';
import { exponentForResolution, LocalGrid } from './grid.js';
import {
	canonical,
	colorKey,
	encodedValue,
	roleOf,
	styleFields,
	STYLE_KEY_PARAMETER,
	styleRemoveKey,
	STYLE_REFERENCE_PARAMETER,
	StyleHistory
} from './style_history.js';

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
	/** Whether an element of the map has fields (see `writeElementFields`): without one, the elements have no bit for them. */
	private hasFields = true;
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
		// not wrapped: the reader would read another value
		if (value < 0 || value >= 2 ** bits) throw new Error(`${value} does not fit ${bits} bits`);
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

	/**
	 * The whole map. Only its valid parts, as a file is read (see `sanitizeState`): so that the
	 * reader reads every link that is written.
	 */
	writeRoot(state: MapState) {
		const root = sanitizeState(state);
		this.writeKey(CODEC_VERSION, KEY_PARAMETERS.version);
		this.writePalette(collectColors(root));
		this.writeStringTable(collectStrings(root), collectFormatStrings(root));
		this.styleHistory = new StyleHistory();

		// as links keep it: the rotation and the tilt in whole degrees
		const frame = sanitizeFrame(
			root.frame && {
				...root.frame,
				bearing: Math.round(root.frame.bearing ?? 0),
				pitch: Math.round(root.frame.pitch ?? 0)
			}
		);
		this.writeGrid(root, frame?.bounds);
		this.writeFrame(frame);
		this.writeMetadata(root.meta);
		this.hasFields = root.elements.some((element) => !!element.popup?.text);
		this.writeBit(this.hasFields);

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
		// the end of the elements: no more bits is an error for the reader, e.g. of a link that was cut off
		if (root.elements.length > 0) this.writeBit(false);
		this.writeKey(ELEMENT_END, KEY_PARAMETERS.element);
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
		// numbers stay small: the center of the frame, else of the elements
		const near = (frame && centerOf(frame)) ?? centerOf(boundsOf(root.elements) ?? [0, 0, 0, 0]);
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
	 * the element before; unless it does, its type as a key (`ELEMENT_KEYS`). After the last element
	 * comes `ELEMENT_END` in place of a type, see `writeRoot`.
	 */
	private writeElementType(element: StateElement, repeat: boolean, first: boolean) {
		if (!first) this.writeBit(repeat);
		if (!repeat) this.writeKey(ELEMENT_KEYS[element.type], KEY_PARAMETERS.element);
	}

	/** The styles of an element, unless it repeats those of the element before: the style, and for areas the outline. */
	private writeElementStyles(element: StateElement, repeat: boolean) {
		if (repeat) return;
		this.writeOptionalStyle(roleOf(element.type), element.style);
		if (element.type === 'polygon' || element.type === 'circle')
			this.writeOptionalStyle('outline', element.outlineStyle);
	}

	private writeOptionalStyle(role: StyleRoleName, style: StateStyle | undefined) {
		this.writeBit(style !== undefined);
		if (style) this.writeStyle(role, style);
	}

	/** The label of a marker: 1 bit whether it has one, then the string. */
	private writeMarkerLabel(element: StateElementMarker) {
		this.writeBit(Boolean(element.label));
		if (element.label) this.writeStringRef(element.label);
	}

	/**
	 * The frame, each part only if the map has it. Its area: the south-west corner on the grid, and
	 * the width and height in steps of the grid. Then its settings as
	 * key/value pairs (`FRAME_KEYS`), so settings can be added later: the rotation (9 bits, whole degrees from 0 to 359), the tilt
	 * (7 bits, whole degrees), and a flag for each thing that viewers can do other than by default.
	 */
	writeFrame(frame: StateFrame | undefined) {
		if (!frame) return this.writeBit(false);
		this.writeBit(true);

		const bounds = frame.bounds;
		this.writeBit(!!bounds);
		if (bounds) {
			// on the map, also where the grid is coarse
			let [x0, y0] = this.elementGrid.toGrid([bounds[0], bounds[1]], true);
			const [x1, y1] = this.elementGrid.toGrid([bounds[2], bounds[3]], true);
			// at least one step, so an area never becomes empty: to the inside, at the end of the map
			const [endX, endY] = this.elementGrid.toGrid([180, 90], true);
			if (x1 === x0 && x0 === endX) x0--;
			if (y1 === y0 && y0 === endY) y0--;
			this.writeVarint(x0, true);
			this.writeVarint(y0, true);
			this.writeVarint(Math.max(1, x1 - x0));
			this.writeVarint(Math.max(1, y1 - y0));
		}

		// most frames are only an area: the end of its settings is 1 bit
		const key = (name: keyof typeof FRAME_KEYS) => this.writeKey(FRAME_KEYS[name], KEY_PARAMETERS.frame);
		if (frame.bearing) {
			key('bearing');
			this.writeInteger(((frame.bearing % 360) + 360) % 360, 9);
		}
		if (frame.pitch) {
			key('pitch');
			// 7 bits: up to 127°, more than a map can be tilted (MapLibre: 85°), not only `MAX_PITCH`
			this.writeInteger(frame.pitch, 7);
		}
		if (frame.canPan === false) key('noPan');
		if (frame.canZoom === false) key('noZoom');
		if (frame.canRotate === true) key('rotate');
		if (frame.canTilt === true) key('tilt');
		if (frame.confine === true) key('confine');
		// zoom levels in steps of 0.5: 6 bits, up to 22
		if (frame.minZoom !== undefined) {
			key('minZoom');
			this.writeInteger(Math.round(frame.minZoom * 2), 6);
		}
		if (frame.maxZoom !== undefined) {
			key('maxZoom');
			this.writeInteger(Math.round(frame.maxZoom * 2), 6);
		}
		if (frame.scrollZoom === 'free') key('scrollFree');
		this.writeKey(END_KEY, KEY_PARAMETERS.frame);
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
	/**
	 * A key of a list of fields, the type of an element or the version: an Exp-Golomb code with the
	 * parameter of its list (`KEY_PARAMETERS`), so the numbers have no limit.
	 */
	writeKey(key: number, parameter: number) {
		this.writeExpGolomb(key, parameter);
	}

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
			(linkBackground(metadata.background) ||
				metadata.legend ||
				metadata.colorScheme ||
				removeViewerDefaults(metadata.viewer) ||
				sanitizeLabels(metadata.labels) ||
				metadata.title);
		if (!stored) {
			return this.writeBit(false);
		}

		this.writeBit(true);
		// first the words of the format, as they are first in the string table
		const background = linkBackground(metadata.background);
		if (background) {
			this.writeKey(METADATA_KEYS.background, KEY_PARAMETERS.metadata);
			this.writeBackground(background);
		}
		if (metadata.colorScheme) {
			this.writeKey(METADATA_KEYS.colorScheme, KEY_PARAMETERS.metadata);
			this.writeStringRef(metadata.colorScheme, true);
		}
		if (metadata.legend) {
			this.writeKey(METADATA_KEYS.legend, KEY_PARAMETERS.metadata);
			this.writeLegend(metadata.legend);
		}
		const labels = sanitizeLabels(metadata.labels);
		if (labels?.mapOnTop) {
			// a flag: the key alone
			this.writeKey(METADATA_KEYS.mapLabelsOnTop, KEY_PARAMETERS.metadata);
		}
		if (metadata.title) {
			this.writeKey(METADATA_KEYS.title, KEY_PARAMETERS.metadata);
			this.writeStringRef(metadata.title);
		}
		if (labels?.overlap === 'hide') {
			// a flag: the key alone
			this.writeKey(METADATA_KEYS.labelOverlap, KEY_PARAMETERS.metadata);
		}
		if (labels?.minZoom !== undefined) {
			this.writeKey(METADATA_KEYS.labelMinZoom, KEY_PARAMETERS.metadata);
			// in tenths of a zoom level
			this.writeVarint(Math.round(labels.minZoom * 10));
		}
		const viewer = removeViewerDefaults(metadata.viewer);
		if (viewer) {
			this.writeKey(METADATA_KEYS.viewer, KEY_PARAMETERS.metadata);
			this.writeViewer(viewer);
		}
		this.writeKey(END_KEY, KEY_PARAMETERS.metadata);
	}

	/**
	 * The settings of the background map that differ from their defaults, as key/value pairs, in the
	 * order of `backgroundStrings`: a flag is its key alone, a theme and a language their index in
	 * the lists of the format (or their name), and the numbers are stored in the steps of their
	 * sliders (`BACKGROUND_STEPS`), of the colors only those that change something.
	 */
	writeBackground(background: StateBackground) {
		const key = (name: keyof typeof BACKGROUND_KEYS) => this.writeKey(BACKGROUND_KEYS[name], KEY_PARAMETERS.background);
		/** The index of a name in its list, or the index that says its name follows, and the name. */
		const name = (list: readonly string[], value: string, bits: number, text: number) => {
			const index = list.indexOf(value);
			this.writeInteger(index >= 0 && index < text ? index : text, bits);
			if (index < 0 || index >= text) this.writeStringRef(value, true);
		};
		const { labelSize, haloWidth, colors } = BACKGROUND_STEPS;

		if (background.base === 'satellite') key('satellite');
		if (background.theme !== undefined) {
			key('theme');
			name(BACKGROUND_THEMES, background.theme, 5, BACKGROUND_THEME_TEXT);
		}
		if (background.streets === false) key('noStreets');
		if (background.borders === false) key('noBorders');
		if (background.labels !== undefined) {
			key('labels');
			// a varint like every index of a name, so the list can grow
			this.writeVarint(BACKGROUND_LABELS.indexOf(background.labels));
		}
		if (background.language !== undefined) {
			key('language');
			name(BACKGROUND_LANGUAGES, background.language, 4, BACKGROUND_LANGUAGE_TEXT);
		}
		if (background.font !== undefined) {
			key('font');
			this.writeStringRef(background.font, true);
		}
		if (background.labelSize !== undefined) {
			key('labelSize');
			this.writeVarint(Math.max(1, Math.round(background.labelSize * labelSize)));
		}
		if (background.haloWidth !== undefined) {
			key('haloWidth');
			this.writeVarint(Math.round(background.haloWidth * haloWidth));
		}
		if (background.colors) {
			key('colors');
			// 1 bit each whether it is changed, then from its lowest value in steps, in 6 bits
			const { saturation, black, white } = background.colors;
			for (const [value, lowest] of [
				[saturation, -1],
				[black, -1],
				[white, 0]
			] as const) {
				this.writeBit(value !== undefined);
				if (value !== undefined) this.writeInteger(Math.round((value - lowest) * colors), 6);
			}
		}
		if (background.hillshade) key('hillshade');
		if (background.terrain) key('terrain');
		if (background.buildings === 'extruded') key('extruded');
		if (background.options) {
			key('options');
			this.writeStringRef(JSON.stringify(background.options), true);
		}
		this.writeKey(END_KEY, KEY_PARAMETERS.background);
	}

	/** `repeat`: the element has the type and the styles of the element before, which are not written. */
	writeElementMarker(element: StateElementMarker, repeat = false) {
		this.writeElementPoint(element.point);
		this.writeElementStyles(element, repeat);
		this.writeMarkerLabel(element);
		this.writeElementFields(element);
	}

	writeElementLine(element: StateElementLine, repeat = false) {
		this.writeElementPoints(element.points);
		this.writeBit(element.smooth === true);
		this.writeElementStyles(element, repeat);
		this.writeElementFields(element);
	}

	writeElementPolygon(element: StateElementPolygon, repeat = false) {
		this.writeElementPoints(element.points);
		this.writeBit(element.smooth === true);
		this.writeElementStyles(element, repeat);
		this.writeElementFields(element);
	}

	writeElementCircle(element: StateElementCircle, repeat = false) {
		this.writeElementPoint(element.point);
		// a circle smaller than 1 m, e.g. drawn by a short drag, is not 0 m
		this.writeVarint(Math.max(1, Math.round(element.radius)));
		this.writeElementStyles(element, repeat);
		this.writeElementFields(element);
	}

	/**
	 * The choices that differ from the defaults, as key/value pairs like a style: the key of the
	 * control, and the index of its choice in `VIEWER_CHOICES`; a button is its key alone (`VIEWER_KEYS`).
	 */
	writeViewer(viewer: StateViewer) {
		for (const [name, choices] of Object.entries(VIEWER_CHOICES)) {
			const choice = viewer[name as keyof typeof VIEWER_CHOICES];
			if (choice === undefined) continue;
			this.writeKey(VIEWER_KEYS[name as keyof typeof VIEWER_CHOICES], KEY_PARAMETERS.viewer);
			this.writeVarint((choices as readonly string[]).indexOf(choice));
		}
		for (const button of VIEWER_BUTTONS) {
			if (viewer[button]) this.writeKey(VIEWER_KEYS[button], KEY_PARAMETERS.viewer);
		}
		if (viewer.zoom === false) this.writeKey(VIEWER_KEYS.noZoom, KEY_PARAMETERS.viewer);
		this.writeKey(END_KEY, KEY_PARAMETERS.viewer);
	}

	// key/value pairs like a style, so fields can be added later
	writeLegend(legend: StateLegend) {
		if (legend.layout && legend.layout !== LEGEND_DEFAULTS.layout) {
			this.writeKey(LEGEND_KEYS.layout, KEY_PARAMETERS.legend);
			this.writeVarint(LEGEND_LAYOUTS.indexOf(legend.layout));
		}
		if (legend.font && legend.font !== LEGEND_DEFAULTS.font) {
			this.writeKey(LEGEND_KEYS.font, KEY_PARAMETERS.legend);
			this.writeVarint(LEGEND_FONTS.indexOf(legend.font));
		}
		// only the key: they are false without it
		if (legend.bold) this.writeKey(LEGEND_KEYS.bold, KEY_PARAMETERS.legend);
		if (legend.italic) this.writeKey(LEGEND_KEYS.italic, KEY_PARAMETERS.legend);
		if (legend.theme && legend.theme !== LEGEND_DEFAULTS.theme) {
			this.writeKey(LEGEND_KEYS.theme, KEY_PARAMETERS.legend);
			this.writeVarint(LEGEND_THEMES.indexOf(legend.theme));
		}
		this.writeKey(LEGEND_KEYS.entries, KEY_PARAMETERS.legend);
		this.writeArray(legend.entries, (entry) => {
			const type = LEGEND_ENTRY_TYPES.indexOf(entry.type);
			if (type < 0) throw new Error(`Invalid legend entry type: ${entry.type}`);
			this.writeKey(LEGEND_ENTRY_KEYS.type, KEY_PARAMETERS.legendEntry);
			this.writeVarint(type);
			// the styles like those of elements, which can refer to them
			if (entry.style) {
				this.writeKey(LEGEND_ENTRY_KEYS.style, KEY_PARAMETERS.legendEntry);
				this.writeStyle(roleOf(entry.type), entry.style);
			}
			if ('outlineStyle' in entry && entry.outlineStyle) {
				this.writeKey(LEGEND_ENTRY_KEYS.outlineStyle, KEY_PARAMETERS.legendEntry);
				this.writeStyle('outline', entry.outlineStyle);
			}
			if (entry.label) {
				this.writeKey(LEGEND_ENTRY_KEYS.label, KEY_PARAMETERS.legendEntry);
				this.writeStringRef(entry.label);
			}
			this.writeKey(END_KEY, KEY_PARAMETERS.legendEntry);
		});
		this.writeKey(END_KEY, KEY_PARAMETERS.legend);
	}

	/**
	 * The fields of an element besides its geometry and its styles, as key/value pairs: the text of
	 * its popup. Nothing if no element of the map has fields; else an element without fields costs
	 * the end of the list, 1 bit.
	 */
	writeElementFields(element: StateElement) {
		if (!this.hasFields) return;
		if (element.popup?.text) {
			this.writeKey(ELEMENT_FIELD_KEYS.popupText, KEY_PARAMETERS.elementFields);
			this.writeStringRef(element.popup.text);
		}
		this.writeKey(END_KEY, KEY_PARAMETERS.elementFields);
	}

	/**
	 * A style of the role: a reference to a similar earlier style of the role (0: none) and only the
	 * differences to it, whichever is shortest.
	 */
	writeStyle(role: StyleRoleName, style: StateStyle) {
		style = withoutUnusedFields(style);
		let best: StateWriter | undefined;
		for (let ref = 0; ref <= this.styleHistory.count(role); ref++) {
			const writer = this.fork();
			writer.writeStyleReference(ref);
			writer.writeStylePatch(role, this.styleHistory.get(ref, role) ?? {}, style);
			if (!best || writer.bits.length < best.bits.length) best = writer;
		}
		// not with a spread: a style can have many bits
		for (const bit of best!.bits) this.bits.push(bit);
		// the strings the chosen encoding referenced
		this.nextString = [...best!.nextString];
		this.styleHistory.remember(role, style);
	}

	/** A reference to an earlier style of the role: 0 for none, 1 for the latest, see `StyleHistory`. */
	writeStyleReference(ref: number) {
		this.writeExpGolomb(ref, STYLE_REFERENCE_PARAMETER);
	}

	/** The fields of the role that differ from `base`: changed ones with their value, missing ones as removed. */
	writeStylePatch(role: StyleRoleName, base: StateStyle, style: StateStyle) {
		for (const field of styleFields(role)) {
			const value = encodedValue(style, field);
			if (value === encodedValue(base, field)) continue;
			if (value === undefined) {
				this.writeStyleKey(styleRemoveKey(role));
				this.writeStyleKey(field.key);
				continue;
			}
			this.writeStyleKey(field.key);
			this.writeStyleValue(field.name, style);
		}
		this.writeStyleKey(END_KEY);
	}

	/** A name of the table, as its index. */
	private writeName(table: readonly string[], name: string) {
		const index = table.indexOf(name);
		if (index < 0) throw new Error(`Invalid name: ${name}`);
		this.writeVarint(index);
	}

	/** The key of a style field, see `STYLE_KEY_PARAMETER`. */
	private writeStyleKey(key: number) {
		this.writeExpGolomb(key, STYLE_KEY_PARAMETER);
	}

	private writeStyleValue(name: keyof StateStyle, style: StateStyle) {
		switch (name) {
			case 'haloWidth':
				return this.writeVarint(Math.round(style.haloWidth! * 10));
			case 'pattern':
				return this.writeName(FILL_PATTERN_NAMES, style.pattern!);
			case 'dash':
				return this.writeName(STROKE_STYLE_NAMES, style.dash!);
			case 'rotation':
				return this.writeVarint(Math.round(style.rotation!), true);
			case 'size':
				return this.writeVarint(Math.round(style.size! * 10));
			case 'labelSize':
				return this.writeVarint(Math.round(style.labelSize! * 10));
			case 'width':
				return this.writeVarint(Math.round(style.width! * 10));
			case 'labelPosition':
				return this.writeName(LABEL_POSITION_NAMES, style.labelPosition!);
			case 'arrowStart':
			case 'arrowEnd':
				return this.writeName(ARROW_NAMES, style[name]!);
			case 'arrowSize':
				return this.writeVarint(Math.round(style.arrowSize! * 10));
			case 'patternScale':
				return this.writeVarint(Math.round(style.patternScale! * 10));
			case 'patternCoverage':
				return this.writeVarint(Math.round(style.patternCoverage! * 100));
			case 'color':
			case 'labelColor':
			case 'haloColor':
				return this.writeColorValue(style[name]!);
			case 'symbol':
				return this.writeStringRef(style.symbol!, true);
			case 'labelFont':
				return this.writeStringRef(style.labelFont!, true);
			case 'visible':
				// the key alone means "false"
				return;
			case 'flat':
				// the key alone means "true"
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
		this.writeExpGolomb(index, COLOR_INDEX_K);
	}

	/**
	 * The strings of the map, each once in its section, in the order they are written, and
	 * afterwards only a reference (see `writeStringRef`). 2 sections: the words of the format
	 * (`formatStrings`: the words of the background, the color scheme, the label font, the names of
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
			this.writeExpGolomb(index, STRING_INDEX_K);
		}
		this.nextString[section] = Math.max(this.nextString[section], index + 1);
	}

	/**
	 * A color of the palette: 1 bit whether it is black or white, then 1 bit which (white: 1), else
	 * its red, green and blue; then its alpha (see `writeColor`). Black and white are the colors
	 * that maps of any design have, e.g. for labels and halos; the format knows no other colors.
	 */
	writePaletteColor(color: string) {
		const rgb = parseColor(color);
		if (!rgb) throw new Error(`Invalid color: ${color}`);
		const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(Math.round);
		const gray = r === g && g === b && (r === 0 || r === 255);
		this.writeBit(gray);
		if (!gray) return this.writeColor(color);
		this.writeBit(r === 255);
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
		...('outlineStyle' in item && item.outlineStyle ? [item.outlineStyle] : [])
	]);
}

/**
 * The background as a link stores it: its numbers in the steps of their sliders
 * (`BACKGROUND_STEPS`), and without the settings that have their default value then, e.g. a label
 * size of 1.01. Undefined if nothing is left.
 */
function linkBackground(background: StateBackground | undefined): StateBackground | undefined {
	const valid = sanitizeBackground(background);
	if (!valid) return undefined;
	const steps = (value: number | undefined, per: number) =>
		value === undefined ? undefined : Math.round((Math.round(value * per) / per) * 1e4) / 1e4;
	const { labelSize, haloWidth, colors } = BACKGROUND_STEPS;
	return sanitizeBackground({
		...valid,
		labelSize: steps(valid.labelSize, labelSize),
		haloWidth: steps(valid.haloWidth, haloWidth),
		colors: valid.colors && {
			saturation: steps(valid.colors.saturation, colors),
			black: steps(valid.colors.black, colors),
			white: steps(valid.colors.white, colors)
		}
	});
}

/**
 * The words of the background of a map in the string table, in the order `writeBackground` writes
 * them: a theme and a language that the lists of the format do not have, the font of the labels,
 * and the options of `@versatiles/style` as JSON.
 */
function backgroundStrings(meta: StateMetadata | undefined): string[] {
	const background = linkBackground(meta?.background);
	if (!background) return [];
	const unlisted = (list: readonly string[], value: string | undefined, text: number) => {
		const index = value === undefined ? 0 : list.indexOf(value);
		return index < 0 || index >= text ? value : undefined;
	};
	return [
		unlisted(BACKGROUND_THEMES, background.theme, BACKGROUND_THEME_TEXT),
		unlisted(BACKGROUND_LANGUAGES, background.language, BACKGROUND_LANGUAGE_TEXT),
		background.font,
		background.options && JSON.stringify(background.options)
	].filter((value): value is string => value !== undefined);
}

/**
 * The words of the format in the string table, in the order the writer writes them: the
 * words of the background, the color scheme, the label font, and the names of the symbols of the
 * legend and of the elements.
 */
function collectFormatStrings(root: MapState): string[] {
	const meta = root.meta;
	const strings = [...backgroundStrings(meta), ...(meta?.colorScheme ? [meta.colorScheme] : [])];
	for (const item of [...(meta?.legend?.entries ?? []), ...root.elements]) {
		const styles: (StateStyle | undefined)[] = [item.style, 'outlineStyle' in item ? item.outlineStyle : undefined];
		for (const style of styles) {
			// in the order of the keys of the style
			if (style?.symbol != null) strings.push(style.symbol);
			if (style?.labelFont != null) strings.push(style.labelFont);
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
	const meta = root.meta;
	for (const entry of meta?.legend?.entries ?? []) if (entry.label) strings.push(entry.label);
	if (meta?.title) strings.push(meta.title);
	for (const element of root.elements) {
		if (element.type === 'marker' && element.label) strings.push(element.label);
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
	const key = (role: StyleRoleName, style: StateStyle | undefined) => (style ? canonical(role, style) : '-');
	const outlineStyle = 'outlineStyle' in element ? element.outlineStyle : undefined;
	return [element.type, key(roleOf(element.type), element.style), key('outline', outlineStyle)].join('|');
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
