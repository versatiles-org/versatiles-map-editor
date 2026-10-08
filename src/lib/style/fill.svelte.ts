import { StylePart } from './abstract.svelte.js';
import {
	type FillPatternName,
	type StateStyle,
	AREA_DEFAULTS,
	FILL_PATTERN_NAMES,
	formatHex,
	parseColor
} from '@versatiles/map-state';
import { storedStyle } from './defaults.js';

const PATTERN_PREFIX = 'fill-pattern:';

/** A fill pattern with its size and coverage, in a color: what an image of a pattern shows. */
export interface FillPatternImage {
	pattern: FillPatternName;
	scale: number;
	coverage: number;
	color: string;
}

/**
 * The name of the image that fills an area with the pattern in the color, shared by all such
 * areas, e.g. "fill-pattern:dots:1.5:0.25:#ff0000".
 */
export function fillPatternName({ pattern, scale, coverage, color }: FillPatternImage): string {
	return `${PATTERN_PREFIX}${pattern}:${scale}:${coverage}:${color.toLowerCase()}`;
}

/** What an image of `fillPatternName` shows, or undefined for other images. */
export function parseFillPatternName(name: string): FillPatternImage | undefined {
	if (!name.startsWith(PATTERN_PREFIX)) return undefined;
	const [value, scale, coverage, color] = name.slice(PATTERN_PREFIX.length).split(':');
	const pattern = FILL_PATTERN_NAMES.find((pattern) => pattern === value);
	if (!pattern || !color) return undefined;
	return { pattern, scale: Number(scale), coverage: Number(coverage), color };
}

export class FillStyle extends StylePart {
	static readonly defaultStyle = AREA_DEFAULTS;
	protected readonly defaults = FillStyle.defaultStyle;

	#color: string = $state(AREA_DEFAULTS.color);
	#pattern: FillPatternName = $state(AREA_DEFAULTS.pattern);
	#patternScale: number = $state(AREA_DEFAULTS.patternScale);
	#patternCoverage: number = $state(AREA_DEFAULTS.patternCoverage);

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
	/** The size of the pattern, a factor; at 1 its lines or dots are 8 pixels apart. */
	get patternScale(): number {
		return this.#patternScale;
	}
	set patternScale(value: number) {
		if (value === this.#patternScale) return;
		this.#patternScale = value;
		this.changed();
	}
	/** The share of the area that the lines or dots of the pattern cover, from 0.05 to 0.95. */
	get patternCoverage(): number {
		return this.#patternCoverage;
	}
	set patternCoverage(value: number) {
		if (value === this.#patternCoverage) return;
		this.#patternCoverage = value;
		this.changed();
	}

	/**
	 * The image of the pattern in the color without its opacity, which is a property of its own, so
	 * the colors of all opacities share one image.
	 */
	getProperties() {
		const { r, g, b, alpha } = parseColor(this.color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
		const color = formatHex({ r, g, b, alpha: 1 });
		// all solid fills of a color share one image
		const image =
			this.pattern === 'solid'
				? { pattern: this.pattern, scale: 1, coverage: 1, color }
				: { pattern: this.pattern, scale: this.patternScale, coverage: this.patternCoverage, color };
		return { pattern: fillPatternName(image), opacity: alpha };
	}

	getState(): StateStyle | undefined {
		const { color, pattern, patternScale, patternCoverage } = this;
		// without the size and the coverage of a solid fill
		return storedStyle('fill', { color, pattern, patternScale, patternCoverage });
	}

	patch(state: StateStyle) {
		if (state.color != null) this.color = state.color;
		if (state.pattern != null) this.pattern = state.pattern;
		if (state.patternScale != null) this.patternScale = state.patternScale;
		if (state.patternCoverage != null) this.patternCoverage = state.patternCoverage;
	}
}
