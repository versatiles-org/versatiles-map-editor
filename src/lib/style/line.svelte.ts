import { StylePart } from './abstract.svelte.js';
import { Color } from '@versatiles/style';
import {
	type StateStyle,
	ARROW_DEFAULTS,
	ARROW_NAMES,
	LINE_DEFAULTS,
	STROKE_STYLE_NAMES,
	hasArrow,
	removeDefaultFields,
	withoutUnusedFields
} from '@versatiles/map-state';

// Dash array per stroke style index; the names come from the codec
const arrays: number[][] = [
	[100], // solid
	[2, 4], // dashed
	[0, 2] // dotted
];

export const dashArrays = new Map<number, { name: string; array: number[] | undefined }>(
	STROKE_STYLE_NAMES.map((name, index) => [index, { name, array: arrays[index] }])
);

/** The arrowheads of a line, which the layer of the arrowheads draws, see `arrowHeadFeatures`. */
export interface ArrowProperties {
	/** The names of the arrowheads (see `ARROW_NAMES`), "none" for none. */
	start: string;
	end: string;
	/** The width of the arrowheads across the line, as a factor of `width`. */
	size: number;
	width: number;
	color: string;
}

export class LineStyle extends StylePart {
	static readonly defaultStyle = LINE_DEFAULTS;
	protected readonly defaults: StateStyle;

	#color: string = $state(LINE_DEFAULTS.color);
	#dashed: number = $state(LINE_DEFAULTS.pattern);
	#visible: boolean = $state(LINE_DEFAULTS.visible);
	#width: number = $state(LINE_DEFAULTS.width);
	#arrowStart: number = $state(ARROW_DEFAULTS.arrowStart);
	#arrowEnd: number = $state(ARROW_DEFAULTS.arrowEnd);
	#arrowSize: number = $state(ARROW_DEFAULTS.arrowSize);
	/** Whether it can be hidden: the outline of an area can, a line cannot (it would be invisible). */
	readonly canHide: boolean;
	/** Whether it can have arrowheads: a line can, the outline of an area cannot (it has no ends). */
	readonly canHaveArrows: boolean;

	constructor(onChange: () => void, { canHide = true, arrows = false }: { canHide?: boolean; arrows?: boolean } = {}) {
		super(onChange);
		this.canHide = canHide;
		this.canHaveArrows = arrows;
		this.defaults = arrows ? { ...LINE_DEFAULTS, ...ARROW_DEFAULTS } : LINE_DEFAULTS;
	}

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	get dashed(): number {
		return this.#dashed;
	}
	set dashed(value: number) {
		if (value === this.#dashed) return;
		this.#dashed = value;
		this.changed();
	}
	get visible(): boolean {
		return this.#visible;
	}
	set visible(value: boolean) {
		// e.g. from a link or a file with `visible: false` for a line
		if (!this.canHide) value = true;
		if (value === this.#visible) return;
		this.#visible = value;
		this.changed();
	}
	get width(): number {
		return this.#width;
	}
	set width(value: number) {
		if (value === this.#width) return;
		this.#width = value;
		this.changed();
	}

	/** The arrowhead at the first point, an index of `ARROW_NAMES` (0: none). */
	get arrowStart(): number {
		return this.#arrowStart;
	}
	set arrowStart(value: number) {
		if (!this.canHaveArrows || value === this.#arrowStart) return;
		this.#arrowStart = value;
		this.changed();
	}
	/** The arrowhead at the last point, an index of `ARROW_NAMES` (0: none). */
	get arrowEnd(): number {
		return this.#arrowEnd;
	}
	set arrowEnd(value: number) {
		if (!this.canHaveArrows || value === this.#arrowEnd) return;
		this.#arrowEnd = value;
		this.changed();
	}
	/** The width of the arrowheads across the line, as a factor of the width of the line. */
	get arrowSize(): number {
		return this.#arrowSize;
	}
	set arrowSize(value: number) {
		if (!this.canHaveArrows || value === this.#arrowSize) return;
		this.#arrowSize = value;
		this.changed();
	}

	/** The arrowheads to draw, or undefined if there are none. */
	getArrowProperties(): ArrowProperties | undefined {
		if (!hasArrow({ arrowStart: this.arrowStart, arrowEnd: this.arrowEnd })) return undefined;
		return {
			start: ARROW_NAMES[this.arrowStart] ?? 'none',
			end: ARROW_NAMES[this.arrowEnd] ?? 'none',
			size: this.arrowSize,
			width: this.width,
			color: Color.parse(this.color).asString()
		};
	}

	getProperties() {
		// a hidden outline is not drawn at all
		if (!this.visible) return undefined;
		return {
			color: Color.parse(this.color).asString(),
			width: this.width,
			// the layer looks up the dash array by the stroke style
			dash: this.dashed
		};
	}

	getState(): StateStyle | undefined {
		const style: StateStyle = { color: this.color, pattern: this.dashed, visible: this.visible, width: this.width };
		if (this.canHaveArrows) {
			style.arrowStart = this.arrowStart;
			style.arrowEnd = this.arrowEnd;
			style.arrowSize = this.arrowSize;
		}
		// e.g. the size of arrowheads that are switched off is not stored
		return removeDefaultFields(withoutUnusedFields(style), this.defaults);
	}

	patch(state: StateStyle) {
		if (state.color != null) this.color = state.color;
		if (state.pattern != null) this.dashed = state.pattern;
		if (state.visible != null) this.visible = state.visible;
		if (state.width != null) this.width = state.width;
		if (state.arrowStart != null) this.arrowStart = state.arrowStart;
		if (state.arrowEnd != null) this.arrowEnd = state.arrowEnd;
		if (state.arrowSize != null) this.arrowSize = state.arrowSize;
	}
}
