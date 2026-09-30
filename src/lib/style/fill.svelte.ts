import { StylePart } from './abstract.svelte.js';
import {
	type StateStyle,
	FILL_DEFAULTS,
	FILL_PATTERN_NAMES,
	formatHex,
	parseColor,
	removeDefaultFields
} from '@versatiles/map-state';

/** The fill patterns by their index, with their names from the codec, e.g. for choosing one. */
export const fillPatterns = new Map<number, { name: string }>(
	FILL_PATTERN_NAMES.map((name, index) => [index, { name }])
);

const PATTERN_PREFIX = 'fill-pattern:';

/** The name of the image that fills an area with the pattern in the color, shared by all such areas. */
export function fillPatternName(pattern: number, color: string): string {
	return `${PATTERN_PREFIX}${pattern}:${color.toLowerCase()}`;
}

/** The pattern and the color of an image of `fillPatternName`, or undefined for other images. */
export function parseFillPatternName(name: string): { pattern: number; color: string } | undefined {
	if (!name.startsWith(PATTERN_PREFIX)) return undefined;
	const [pattern, color] = name.slice(PATTERN_PREFIX.length).split(':');
	return { pattern: Number(pattern), color };
}

export class FillStyle extends StylePart {
	static readonly defaultStyle = FILL_DEFAULTS;
	protected readonly defaults = FillStyle.defaultStyle;

	#color: string = $state(FILL_DEFAULTS.color);
	#pattern: number = $state(FILL_DEFAULTS.pattern);

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	get pattern(): number {
		return this.#pattern;
	}
	set pattern(value: number) {
		if (value === this.#pattern) return;
		this.#pattern = value;
		this.changed();
	}

	/**
	 * The image of the pattern in the color without its opacity, which is a property of its own, so
	 * the colors of all opacities share one image.
	 */
	getProperties() {
		const { r, g, b, alpha } = parseColor(this.color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
		return { pattern: fillPatternName(this.pattern, formatHex({ r, g, b, alpha: 1 })), opacity: alpha };
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields({ color: this.color, pattern: this.pattern }, FillStyle.defaultStyle);
	}

	patch(state: StateStyle) {
		if (state.color != null) this.color = state.color;
		if (state.pattern != null) this.pattern = state.pattern;
	}
}
