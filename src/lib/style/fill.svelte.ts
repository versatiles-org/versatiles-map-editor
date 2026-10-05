import { StylePart } from './abstract.svelte.js';
import {
	type FillPatternName,
	type StateStyle,
	FILL_DEFAULTS,
	FILL_PATTERN_NAMES,
	formatHex,
	parseColor,
	removeDefaultFields
} from '@versatiles/map-state';

const PATTERN_PREFIX = 'fill-pattern:';

/** The name of the image that fills an area with the pattern in the color, shared by all such areas. */
export function fillPatternName(pattern: FillPatternName, color: string): string {
	return `${PATTERN_PREFIX}${pattern}:${color.toLowerCase()}`;
}

/** The pattern and the color of an image of `fillPatternName`, or undefined for other images. */
export function parseFillPatternName(name: string): { pattern: FillPatternName; color: string } | undefined {
	if (!name.startsWith(PATTERN_PREFIX)) return undefined;
	const [value, color] = name.slice(PATTERN_PREFIX.length).split(':');
	const pattern = FILL_PATTERN_NAMES.find((pattern) => pattern === value);
	return pattern && color ? { pattern, color } : undefined;
}

export class FillStyle extends StylePart {
	static readonly defaultStyle = FILL_DEFAULTS;
	protected readonly defaults = FillStyle.defaultStyle;

	#color: string = $state(FILL_DEFAULTS.color);
	#pattern: FillPatternName = $state(FILL_DEFAULTS.pattern);

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	get pattern(): FillPatternName {
		return this.#pattern;
	}
	set pattern(value: FillPatternName) {
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
