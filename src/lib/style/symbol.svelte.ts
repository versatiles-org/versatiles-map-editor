import { StylePart } from './abstract.svelte.js';
import { type LabelPositionName, type StateStyle, MARKER_DEFAULTS } from '@versatiles/map-state';
import { symbolProperties } from '@versatiles/map-state/maplibre';
import { storedStyle } from './defaults.js';
import { getSymbol } from '../background/index.js';

export class SymbolStyle extends StylePart {
	static readonly defaultStyle = MARKER_DEFAULTS;
	protected readonly defaults = SymbolStyle.defaultStyle;

	#color: string = $state(MARKER_DEFAULTS.color);
	#haloWidth: number = $state(MARKER_DEFAULTS.haloWidth);
	#rotation: number = $state(MARKER_DEFAULTS.rotation);
	#flat: boolean = $state(MARKER_DEFAULTS.flat);
	#size: number = $state(MARKER_DEFAULTS.size);
	#labelSize: number = $state(MARKER_DEFAULTS.labelSize);
	#symbol: string = $state(MARKER_DEFAULTS.symbol);
	#label: string = $state('');
	#labelPosition: LabelPositionName = $state(MARKER_DEFAULTS.labelPosition);
	#labelColor: string = $state(MARKER_DEFAULTS.labelColor);
	#labelFont: string = $state(MARKER_DEFAULTS.labelFont);
	#haloColor: string = $state(MARKER_DEFAULTS.haloColor);

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
	get labelFont(): string {
		return this.#labelFont;
	}
	set labelFont(value: string) {
		if (value === this.#labelFont) return;
		this.#labelFont = value;
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

	/**
	 * The opacity of the symbol color and of the text color are properties of their own, so the
	 * symbol and the text fade together with their halo, see `symbolProperties`.
	 */
	getProperties() {
		return symbolProperties(this, this.label, this.symbolInfo);
	}

	getState(): StateStyle | undefined {
		return storedStyle('symbol', {
			color: this.color,
			rotation: this.rotation,
			size: this.size,
			labelSize: this.labelSize,
			haloWidth: this.haloWidth,
			symbol: this.symbol,
			labelPosition: this.labelPosition,
			labelColor: this.labelColor,
			labelFont: this.labelFont,
			haloColor: this.haloColor,
			flat: this.flat
		});
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
		if (style.labelFont != null) this.labelFont = style.labelFont;
		if (style.haloColor != null) this.haloColor = style.haloColor;
		if (style.flat != null) this.flat = style.flat;
	}
}
