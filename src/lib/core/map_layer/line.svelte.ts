import { MapLayer } from './abstract.svelte.js';
import { Color } from '@versatiles/style';
import { type StateStyle, LINE_DEFAULTS, STROKE_STYLE_NAMES, removeDefaultFields } from '@versatiles/map-state';

// Dash array per stroke style index; the names come from the codec
const arrays: number[][] = [
	[100], // solid
	[2, 4], // dashed
	[0, 2] // dotted
];

export const dashArrays = new Map<number, { name: string; array: number[] | undefined }>(
	STROKE_STYLE_NAMES.map((name, index) => [index, { name, array: arrays[index] }])
);

export class MapLayerLine extends MapLayer {
	static readonly defaultStyle = LINE_DEFAULTS;

	#color: string = $state(LINE_DEFAULTS.color);
	#dashed: number = $state(LINE_DEFAULTS.pattern);
	#visible: boolean = $state(LINE_DEFAULTS.visible);
	#width: number = $state(LINE_DEFAULTS.width);

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
		return removeDefaultFields(
			{ color: this.color, pattern: this.dashed, visible: this.visible, width: this.width },
			MapLayerLine.defaultStyle
		);
	}

	setState(state: StateStyle) {
		if (state.color != null) this.color = state.color;
		if (state.pattern != null) this.dashed = state.pattern;
		if (state.visible != null) this.visible = state.visible;
		if (state.width != null) this.width = state.width;
	}
}
