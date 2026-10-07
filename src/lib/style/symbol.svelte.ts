import { StylePart } from './abstract.svelte.js';
import { cssColor } from './css_color.js';
import { type LabelPositionName, type StateStyle, SYMBOL_DEFAULTS, removeDefaultFields } from '@versatiles/map-state';
import { getSymbol, type SymbolInfo } from '../background/index.js';
import { splitOpacity } from './opacity.js';

type TextAnchor =
	'center' | 'left' | 'right' | 'bottom' | 'top' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

// The distance of the label from the center of a symbol of 32×32 pixels, in ems, in the direction of its anchor
const LABEL_OFFSET = 0.7;
// The same distance to a corner of the label, on the diagonal
const CORNER_OFFSET = LABEL_OFFSET * Math.SQRT1_2;
// The pixels of an image per em of its label, which have the same scale (`size`)
const EM = 16;

/**
 * Where the image of a symbol is, in ems of its label: the shift of its center from the point
 * (dx, dy), and how much larger than 32×32 pixels its half width and height are (ex, ey). E.g. a
 * pin of 32×38 pixels stands on the point: [0, -1.1875, 0, 0.1875].
 */
export type IconBox = [number, number, number, number];
const NO_BOX: IconBox = [0, 0, 0, 0];

export function iconBox(symbol: SymbolInfo | undefined): IconBox {
	if (!symbol) return NO_BOX;
	const { width, height, center } = symbol;
	// in ems from pixels rounded to hundredths, and without -0, since the box is part of the name of
	// the label place
	const em = (pixels: number) => Math.round(pixels * 100) / 100 / EM + 0;
	return [em((0.5 - center[0]) * width), em((0.5 - center[1]) * height), em(width / 2 - EM), em(height / 2 - EM)];
}

/** The suffix of the name of a label place for an image, "" for one of 32×32 pixels on the point. */
function boxSuffix(box: IconBox): string {
	return box.every((value) => value === 0) ? '' : '@' + box.join(',');
}

/** The possible places of a label around an image, see `LABEL_PLACES`. */
function placesAround([dx, dy, ex, ey]: IconBox): Record<string, (TextAnchor | [number, number])[]> {
	const offsets: Record<TextAnchor, [number, number]> = {
		center: [dx, dy],
		left: [dx + LABEL_OFFSET + ex, dy],
		right: [dx - LABEL_OFFSET - ex, dy],
		top: [dx, dy + LABEL_OFFSET + ey],
		bottom: [dx, dy - LABEL_OFFSET - ey],
		// the corner of the label at the corner of the image, e.g. its bottom left corner above right of it
		'bottom-left': [dx + CORNER_OFFSET + ex, dy - CORNER_OFFSET - ey],
		'bottom-right': [dx - CORNER_OFFSET - ex, dy - CORNER_OFFSET - ey],
		'top-left': [dx + CORNER_OFFSET + ex, dy + CORNER_OFFSET + ey],
		'top-right': [dx - CORNER_OFFSET - ex, dy + CORNER_OFFSET + ey]
	};
	const withOffsets = (anchors: TextAnchor[]) => anchors.flatMap((anchor) => [anchor, offsets[anchor]]);
	const sides = ['left', 'right', 'top', 'bottom'] as const;
	const corners = ['bottom-left', 'top-left', 'bottom-right', 'top-right'] as const;
	return {
		// the sides first, then the corners
		auto: withOffsets([...sides, ...corners]),
		center: withOffsets(['center']),
		...Object.fromEntries([...sides, ...corners].map((anchor) => [anchor, withOffsets([anchor])]))
	};
}

/**
 * The possible places of a label with their offsets, by their name:
 * the chosen side or corner, the first one that fits ("auto"), or on the point ("center", for
 * markers without image). The layer looks them up, since features cannot have array properties.
 * These are for images of 32×32 pixels on the point; `labelPlaceTable` adds the others.
 */
export const LABEL_PLACES = placesAround(NO_BOX);

/**
 * The label places for all images of the symbols: around the image, e.g. beside the head of
 * a pin instead of its tip. The names of other images than those of `LABEL_PLACES` end with
 * their box, e.g. "left@0,-1.1875,0,0.1875".
 */
export function labelPlaceTable(symbols: SymbolInfo[]): Record<string, (TextAnchor | [number, number])[]> {
	const table = { ...LABEL_PLACES };
	for (const symbol of symbols) {
		const box = iconBox(symbol);
		const suffix = boxSuffix(box);
		if (!suffix || table['auto' + suffix]) continue;
		for (const [name, places] of Object.entries(placesAround(box))) table[name + suffix] = places;
	}
	return table;
}

// The text anchor of each position of the label: the side of the label next to the symbol ("auto"
// has variable anchors)
const anchors: Record<LabelPositionName, TextAnchor | undefined> = {
	auto: undefined,
	right: 'left',
	left: 'right',
	top: 'bottom',
	bottom: 'top',
	'top-right': 'bottom-left',
	'top-left': 'bottom-right',
	'bottom-right': 'top-left',
	'bottom-left': 'top-right'
};

export class SymbolStyle extends StylePart {
	static readonly defaultStyle = SYMBOL_DEFAULTS;
	protected readonly defaults = SymbolStyle.defaultStyle;

	#color: string = $state(SYMBOL_DEFAULTS.color);
	#haloWidth: number = $state(SYMBOL_DEFAULTS.haloWidth);
	#rotation: number = $state(SYMBOL_DEFAULTS.rotation);
	#flat: boolean = $state(SYMBOL_DEFAULTS.flat);
	#size: number = $state(SYMBOL_DEFAULTS.size);
	#labelSize: number = $state(SYMBOL_DEFAULTS.labelSize);
	#symbol: string = $state(SYMBOL_DEFAULTS.symbol);
	#label: string = $state('');
	#labelPosition: LabelPositionName = $state(SYMBOL_DEFAULTS.labelPosition);
	#labelColor: string = $state(SYMBOL_DEFAULTS.labelColor);
	#font: string = $state(SYMBOL_DEFAULTS.font);
	#haloColor: string = $state(SYMBOL_DEFAULTS.haloColor);

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	get haloWidth(): number {
		return this.#haloWidth;
	}
	set haloWidth(value: number) {
		if (value === this.#haloWidth) return;
		this.#haloWidth = value;
		this.changed();
	}
	/** Whether the marker lies flat on the map, its symbol and its label; else it faces the viewer. */
	get flat(): boolean {
		return this.#flat;
	}
	set flat(value: boolean) {
		if (value === this.#flat) return;
		this.#flat = value;
		this.changed();
	}

	get rotation(): number {
		return this.#rotation;
	}
	set rotation(value: number) {
		if (value === this.#rotation) return;
		this.#rotation = value;
		this.changed();
	}
	/** The size of the symbol, as a factor. */
	get size(): number {
		return this.#size;
	}
	set size(value: number) {
		if (value === this.#size) return;
		this.#size = value;
		this.changed();
	}
	/** The size of the label, as a factor of 16 pixels. */
	get labelSize(): number {
		return this.#labelSize;
	}
	set labelSize(value: number) {
		if (value === this.#labelSize) return;
		this.#labelSize = value;
		this.changed();
	}
	/** The image of the symbol, e.g. "icons:anchor", or "" for none. */
	get symbol(): string {
		return this.#symbol;
	}
	set symbol(value: string) {
		if (value === this.#symbol) return;
		this.#symbol = value;
		this.changed();
	}
	/**
	 * The text of the label, which this layer draws. It is content, not style: a field of the
	 * marker (`StateElementMarker.label`), so `getState` and `patch` leave it out.
	 */
	get label(): string {
		return this.#label;
	}
	set label(value: string) {
		if (value === this.#label) return;
		this.#label = value;
		this.changed();
	}
	/** The position of the label around the symbol. */
	get labelPosition(): LabelPositionName {
		return this.#labelPosition;
	}
	set labelPosition(value: LabelPositionName) {
		if (value === this.#labelPosition) return;
		this.#labelPosition = value;
		this.changed();
	}

	/** The color of the text of the label. */
	get labelColor(): string {
		return this.#labelColor;
	}
	set labelColor(value: string) {
		if (value === this.#labelColor) return;
		this.#labelColor = value;
		this.changed();
	}
	/** The glyph font of the label, e.g. "noto_sans_bold", or "" for the font of the background map. */
	get font(): string {
		return this.#font;
	}
	set font(value: string) {
		if (value === this.#font) return;
		this.#font = value;
		this.changed();
	}
	/** The color of the halo around the symbol and the label. */
	get haloColor(): string {
		return this.#haloColor;
	}
	set haloColor(value: string) {
		if (value === this.#haloColor) return;
		this.#haloColor = value;
		this.changed();
	}

	readonly symbolInfo = $derived(getSymbol(this.symbol));

	/** The name of the place of the label, see `LABEL_PLACES`. */
	private getPlace(): string {
		const anchor = anchors[this.labelPosition];
		const suffix = boxSuffix(iconBox(this.symbolInfo));
		if (anchor) return anchor + suffix;
		// a label without symbol is on the point
		return this.symbolInfo == null ? 'center' : 'auto' + suffix;
	}

	/**
	 * The opacity of the symbol color and of the text color are properties of their own, so the
	 * symbol and the text fade together with their halo.
	 */
	getProperties() {
		const info = this.symbolInfo;
		const symbol = splitOpacity(this.color);
		const text = splitOpacity(this.labelColor);
		return {
			...(info == null ? {} : { icon: info.name, anchor: info.anchor }),
			color: symbol.color,
			opacity: symbol.opacity,
			rotate: this.rotation,
			size: this.size,
			labelSize: this.labelSize,
			// the label offsets around the symbol, in ems of the label, grow with the symbol
			labelScale: info == null ? 1 : this.size / this.labelSize,
			halo: this.haloWidth,
			label: this.label,
			labelColor: text.color,
			labelOpacity: text.opacity,
			// none: the font of the background map, see `ElementRenderer.applyFonts`
			...(this.font ? { font: this.font } : {}),
			haloColor: cssColor(this.haloColor),
			place: this.getPlace(),
			// only of a flat marker, for the layer of its label if the labels have layers of their own
			...(this.flat ? { flat: true } : {})
		};
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields(
			{
				color: this.color,
				rotation: this.rotation,
				size: this.size,
				labelSize: this.labelSize,
				haloWidth: this.haloWidth,
				symbol: this.symbol,
				labelPosition: this.labelPosition,
				labelColor: this.labelColor,
				font: this.font,
				haloColor: this.haloColor,
				flat: this.flat
			},
			SymbolStyle.defaultStyle
		);
	}

	patch(style: StateStyle) {
		if (style.color != null) this.color = style.color;
		if (style.rotation != null) this.rotation = style.rotation;
		if (style.size != null) this.size = style.size;
		if (style.labelSize != null) this.labelSize = style.labelSize;
		if (style.haloWidth != null) this.haloWidth = style.haloWidth;
		if (style.symbol != null) this.symbol = style.symbol;
		if (style.labelPosition != null) this.labelPosition = style.labelPosition;
		if (style.labelColor != null) this.labelColor = style.labelColor;
		if (style.font != null) this.font = style.font;
		if (style.haloColor != null) this.haloColor = style.haloColor;
		if (style.flat != null) this.flat = style.flat;
	}
}
