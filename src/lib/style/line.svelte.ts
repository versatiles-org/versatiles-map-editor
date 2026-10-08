import { StylePart } from './abstract.svelte.js';
import { cssColor } from './css_color.js';
import {
	type ArrowName,
	type DashName,
	type StateStyle,
	LINE_DEFAULTS,
	OUTLINE_DEFAULTS,
	hasArrow
} from '@versatiles/map-state';
import { ROLE_DEFAULTS, storedStyle, type StyleRole } from './defaults.js';

/**
 * The dashes and gaps of each dash style, in multiples of the width of the line. The lines have
 * round caps, which add half the width at each end of a dash: "dashed" shows dashes and gaps of 3
 * widths, a dash of 0 is a dot.
 */
export const dashArrays: Record<DashName, number[]> = {
	solid: [100],
	dashed: [2, 4],
	dotted: [0, 2],
	// dashes of 6 widths, gaps of 3
	'long-dash': [5, 4],
	// a dash of 3 widths, a gap of 2, a dot, a gap of 2
	'dash-dot': [2, 3, 0, 3]
};

/** The arrowheads of a line, which the layer of the arrowheads draws, see `arrowHeadFeatures`. */
export interface ArrowProperties {
	/** The arrowheads, "none" for none. */
	start: ArrowName;
	end: ArrowName;
	/** The width of the arrowheads across the line, as a factor of `width`. */
	size: number;
	width: number;
	color: string;
}

export class LineStyle extends StylePart {
	static readonly defaultStyle = OUTLINE_DEFAULTS;
	protected readonly defaults: StateStyle;
	/** A line, with arrowheads, or the outline of an area. */
	readonly role: StyleRole;

	#color: string = $state(LINE_DEFAULTS.color);
	#dash: DashName = $state(LINE_DEFAULTS.dash);
	#visible: boolean = $state(OUTLINE_DEFAULTS.visible);
	#width: number = $state(LINE_DEFAULTS.width);
	#arrowStart: ArrowName = $state(ROLE_DEFAULTS.line.arrowStart);
	#arrowEnd: ArrowName = $state(ROLE_DEFAULTS.line.arrowEnd);
	#arrowSize: number = $state(ROLE_DEFAULTS.line.arrowSize);
	/** Whether it can be hidden: the outline of an area can, a line cannot (it would be invisible). */
	readonly canHide: boolean;
	/** Whether it can have arrowheads: a line can, the outline of an area cannot (it has no ends). */
	readonly canHaveArrows: boolean;

	constructor(onChange: () => void, { canHide = true, arrows = false }: { canHide?: boolean; arrows?: boolean } = {}) {
		super(onChange);
		this.canHide = canHide;
		this.canHaveArrows = arrows;
		this.role = arrows ? 'line' : 'outline';
		this.defaults = ROLE_DEFAULTS[this.role];
	}

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	/** Solid, dashed, dotted, long dashes, or dashes and dots. */
	get dash(): DashName {
		return this.#dash;
	}
	set dash(value: DashName) {
		if (value === this.#dash) return;
		this.#dash = value;
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

	/** The arrowhead at the first point, "none" for none. */
	get arrowStart(): ArrowName {
		return this.#arrowStart;
	}
	set arrowStart(value: ArrowName) {
		if (!this.canHaveArrows || value === this.#arrowStart) return;
		this.#arrowStart = value;
		this.changed();
	}
	/** The arrowhead at the last point, "none" for none. */
	get arrowEnd(): ArrowName {
		return this.#arrowEnd;
	}
	set arrowEnd(value: ArrowName) {
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
			start: this.arrowStart,
			end: this.arrowEnd,
			size: this.arrowSize,
			width: this.width,
			color: cssColor(this.color)
		};
	}

	getProperties() {
		// a hidden outline is not drawn at all
		if (!this.visible) return undefined;
		return {
			color: cssColor(this.color),
			width: this.width,
			// the layer looks up the dash array by the stroke style
			dash: this.dash
		};
	}

	getState(): StateStyle | undefined {
		const style: StateStyle = { color: this.color, dash: this.dash, width: this.width };
		// a line is always visible, and has no field for it
		if (this.canHide) style.visible = this.visible;
		if (this.canHaveArrows) {
			style.arrowStart = this.arrowStart;
			style.arrowEnd = this.arrowEnd;
			style.arrowSize = this.arrowSize;
		}
		// e.g. the size of arrowheads that are switched off is not stored
		return storedStyle(this.role, style);
	}

	patch(state: StateStyle) {
		if (state.color != null) this.color = state.color;
		if (state.dash != null) this.dash = state.dash;
		if (state.visible != null) this.visible = state.visible;
		if (state.width != null) this.width = state.width;
		if (state.arrowStart != null) this.arrowStart = state.arrowStart;
		if (state.arrowEnd != null) this.arrowEnd = state.arrowEnd;
		if (state.arrowSize != null) this.arrowSize = state.arrowSize;
	}
}
