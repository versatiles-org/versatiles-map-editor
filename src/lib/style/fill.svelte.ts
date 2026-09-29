import { StylePart } from './abstract.svelte.js';
import { type StateStyle, FILL_DEFAULTS, FILL_PATTERN_NAMES, removeDefaultFields } from '@versatiles/map-state';

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

	#color: string = $state(FILL_DEFAULTS.color);
	#opacity: number = $state(FILL_DEFAULTS.opacity);
	#pattern: number = $state(FILL_DEFAULTS.pattern);

	get color(): string {
		return this.#color;
	}
	set color(value: string) {
		if (value === this.#color) return;
		this.#color = value;
		this.changed();
	}
	get opacity(): number {
		return this.#opacity;
	}
	set opacity(value: number) {
		if (value === this.#opacity) return;
		this.#opacity = value;
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

	getProperties() {
		return { pattern: fillPatternName(this.pattern, this.color), opacity: this.opacity };
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields(
			{ color: this.color, opacity: this.opacity, pattern: this.pattern },
			FillStyle.defaultStyle
		);
	}

	setState(state: StateStyle) {
		if (state.color != null) this.color = state.color;
		if (state.opacity != null) this.opacity = state.opacity;
		if (state.pattern != null) this.pattern = state.pattern;
	}
}
