import { MapLayer } from './abstract.svelte.js';
import { Color } from '@versatiles/style';
import {
	type StateStyle,
	LABEL_ALIGN_NAMES,
	SYMBOL_DEFAULTS,
	legacyMarkerStyle,
	removeDefaultFields
} from '@versatiles/map-state';
import { getSymbol, type SymbolInfo } from '../symbols_catalog.js';

type TextAnchor = 'center' | 'left' | 'right' | 'bottom' | 'top';

// The distance of the label from the center of a symbol of 32×32 pixels, in ems, in the direction of its anchor
const LABEL_OFFSET = 0.7;
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
	// the label position
	const em = (pixels: number) => Math.round(pixels * 100) / 100 / EM + 0;
	return [em((0.5 - center[0]) * width), em((0.5 - center[1]) * height), em(width / 2 - EM), em(height / 2 - EM)];
}

/** The suffix of the name of a label position for an image, "" for one of 32×32 pixels on the point. */
function boxSuffix(box: IconBox): string {
	return box.every((value) => value === 0) ? '' : '@' + box.join(',');
}

/** The possible places of a label around an image, see `LABEL_POSITIONS`. */
function positionsAround([dx, dy, ex, ey]: IconBox): Record<string, (TextAnchor | [number, number])[]> {
	const offsets: Record<TextAnchor, [number, number]> = {
		center: [dx, dy],
		left: [dx + LABEL_OFFSET + ex, dy],
		right: [dx - LABEL_OFFSET - ex, dy],
		top: [dx, dy + LABEL_OFFSET + ey],
		bottom: [dx, dy - LABEL_OFFSET - ey]
	};
	const withOffsets = (anchors: TextAnchor[]) => anchors.flatMap((anchor) => [anchor, offsets[anchor]]);
	return {
		auto: withOffsets(['left', 'right', 'top', 'bottom']),
		'auto-center': withOffsets(['center', 'left', 'right', 'top', 'bottom']),
		...Object.fromEntries(
			(['left', 'right', 'top', 'bottom'] as const).map((anchor) => [anchor, withOffsets([anchor])])
		)
	};
}

/**
 * The possible places of a label with their offsets, by the name of the label position:
 * the chosen side, or the first side that fits ("auto"; "auto-center" also on the point, for
 * markers without image). The layer looks them up, since features cannot have array properties.
 * These are for images of 32×32 pixels on the point; `labelPositionTable` adds the others.
 */
export const LABEL_POSITIONS = positionsAround(NO_BOX);

/**
 * The label positions for all images of the symbols: around the image, e.g. beside the head of
 * a pin instead of its tip. The names of other images than those of `LABEL_POSITIONS` end with
 * their box, e.g. "left@0,-1.1875,0,0.1875".
 */
export function labelPositionTable(symbols: SymbolInfo[]): Record<string, (TextAnchor | [number, number])[]> {
	const table = { ...LABEL_POSITIONS };
	for (const symbol of symbols) {
		const box = iconBox(symbol);
		const suffix = boxSuffix(box);
		if (!suffix || table['auto' + suffix]) continue;
		for (const [name, places] of Object.entries(positionsAround(box))) table[name + suffix] = places;
	}
	return table;
}

interface LabelAlign {
	index: number;
	name: string;
	anchor?: TextAnchor;
}

// Text anchor per label alignment index ("auto" uses variable anchors); the names come from the codec
const anchors: (TextAnchor | undefined)[] = [
	undefined, // auto
	'left', // right
	'right', // left
	'bottom', // top
	'top' // bottom
];

export const labelPositions: LabelAlign[] = LABEL_ALIGN_NAMES.map((name, index) => ({
	index,
	name,
	anchor: anchors[index]
}));

export class MapLayerSymbol extends MapLayer {
	static readonly defaultStyle = SYMBOL_DEFAULTS;

	#color: string = $state(SYMBOL_DEFAULTS.color);
	#halo: number = $state(SYMBOL_DEFAULTS.halo);
	#rotate: number = $state(SYMBOL_DEFAULTS.rotate);
	#size: number = $state(SYMBOL_DEFAULTS.size);
	#symbol: string = $state(SYMBOL_DEFAULTS.symbol);
	#label: string = $state(SYMBOL_DEFAULTS.label);
	#labelAlign: number = $state(SYMBOL_DEFAULTS.align);
	#labelColor: string = $state(SYMBOL_DEFAULTS.labelColor);
	#haloColor: string = $state(SYMBOL_DEFAULTS.haloColor);

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	get halo(): number {
		return this.#halo;
	}
	set halo(value: number) {
		if (value === this.#halo) return;
		this.#halo = value;
		this.changed();
	}
	get rotate(): number {
		return this.#rotate;
	}
	set rotate(value: number) {
		if (value === this.#rotate) return;
		this.#rotate = value;
		this.changed();
	}
	get size(): number {
		return this.#size;
	}
	set size(value: number) {
		if (value === this.#size) return;
		this.#size = value;
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
	get label(): string {
		return this.#label;
	}
	set label(value: string) {
		if (value === this.#label) return;
		this.#label = value;
		this.changed();
	}
	get labelAlign(): number {
		return this.#labelAlign;
	}
	set labelAlign(value: number) {
		if (value === this.#labelAlign) return;
		this.#labelAlign = value;
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

	/** The name of the label position, see `LABEL_POSITIONS`. */
	private getPosition(): string {
		const anchor = lookupLabelAlign(this.labelAlign).anchor;
		const suffix = boxSuffix(iconBox(this.symbolInfo));
		if (anchor) return anchor + suffix;
		return this.symbolInfo == null ? 'auto-center' : 'auto' + suffix;
	}

	getProperties() {
		const info = this.symbolInfo;
		return {
			...(info == null ? {} : { icon: info.name, anchor: info.anchor }),
			color: Color.parse(this.color).asString(),
			rotate: this.rotate,
			size: this.size,
			halo: this.halo,
			label: this.label,
			labelColor: Color.parse(this.labelColor).asString(),
			haloColor: Color.parse(this.haloColor).asString(),
			position: this.getPosition()
		};
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields(
			{
				color: this.color,
				rotate: this.rotate,
				size: this.size,
				halo: this.halo,
				symbol: this.symbol,
				label: this.label,
				align: this.labelAlign,
				labelColor: this.labelColor,
				haloColor: this.haloColor
			},
			MapLayerSymbol.defaultStyle
		);
	}

	setState(style: StateStyle) {
		// e.g. a file of an older version, with the number of the symbol
		const state = legacyMarkerStyle(style);
		if (state.color != null) this.color = state.color;
		if (state.rotate != null) this.rotate = state.rotate;
		if (state.size != null) this.size = state.size;
		if (state.halo != null) this.halo = state.halo;
		if (state.symbol != null) this.symbol = state.symbol;
		if (state.label != null) this.label = state.label;
		if (state.align != null) this.labelAlign = lookupLabelAlign(state.align).index;
		if (state.labelColor != null) this.labelColor = state.labelColor;
		if (state.haloColor != null) this.haloColor = state.haloColor;
	}
}

function lookupLabelAlign(index: number | string): LabelAlign {
	let pos;

	if (typeof index === 'number') {
		pos = labelPositions.find((p) => p.index === index);
	} else if (typeof index === 'string') {
		pos = labelPositions.find((p) => p.name === index);
	}

	if (pos == null) return labelPositions[0];
	return pos;
}
