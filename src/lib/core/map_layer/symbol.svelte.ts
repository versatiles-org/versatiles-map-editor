import { MapLayer } from './abstract.svelte.js';
import { Color } from '@versatiles/style';
import {
	type StateStyle,
	LABEL_ALIGN_NAMES,
	SYMBOL_DEFAULTS,
	legacyMarkerStyle,
	removeDefaultFields
} from '@versatiles/map-state';
import { getSymbol } from '../symbols.js';

type TextAnchor = 'center' | 'left' | 'right' | 'bottom' | 'top';

// The distance of the label from the point, in ems, in the direction of its anchor
const LABEL_OFFSET = 0.7;
const anchorOffsets: Record<TextAnchor, [number, number]> = {
	center: [0, 0],
	left: [LABEL_OFFSET, 0],
	right: [-LABEL_OFFSET, 0],
	top: [0, LABEL_OFFSET],
	bottom: [0, -LABEL_OFFSET]
};
const withOffsets = (anchors: TextAnchor[]) => anchors.flatMap((anchor) => [anchor, anchorOffsets[anchor]]);

/**
 * The possible places of a label with their offsets, by the name of the label position:
 * the chosen side, or the first side that fits ("auto"; "auto-center" also on the point, for
 * markers without image). The layer looks them up, since features cannot have array properties.
 */
export const LABEL_POSITIONS: Record<string, (TextAnchor | [number, number])[]> = {
	auto: withOffsets(['left', 'right', 'top', 'bottom']),
	'auto-center': withOffsets(['center', 'left', 'right', 'top', 'bottom']),
	...Object.fromEntries((['left', 'right', 'top', 'bottom'] as const).map((anchor) => [anchor, withOffsets([anchor])]))
};

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
		if (anchor) return anchor;
		return this.symbolInfo == null ? 'auto-center' : 'auto';
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
