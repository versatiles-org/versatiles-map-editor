import { StylePart } from './abstract.svelte.js';
import { type FillPatternName, type StateStyle, AREA_DEFAULTS } from '@versatiles/map-state';
import { fillProperties } from '@versatiles/map-state/maplibre';
import { storedStyle } from './defaults.js';

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
		return fillProperties(this);
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
