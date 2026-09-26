import { get, writable } from 'svelte/store';
import { MapLayer } from './abstract.js';
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

	color = writable(MapLayerLine.defaultStyle.color);
	dashed = writable(MapLayerLine.defaultStyle.pattern);
	visible = writable(MapLayerLine.defaultStyle.visible);
	width = writable(MapLayerLine.defaultStyle.width);

	constructor(onChange: () => void) {
		super(onChange);
		this.watch(this.color, this.dashed, this.visible, this.width);
	}

	getProperties() {
		// a hidden outline is not drawn at all
		if (!get(this.visible)) return undefined;
		return {
			color: Color.parse(get(this.color)).asString(),
			width: get(this.width),
			// the layer looks up the dash array by the stroke style
			dash: get(this.dashed)
		};
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields(
			{
				color: get(this.color),
				pattern: get(this.dashed),
				visible: get(this.visible),
				width: get(this.width)
			},
			MapLayerLine.defaultStyle
		);
	}

	setState(state: StateStyle) {
		if (state.color != null) this.color.set(state.color);
		if (state.pattern != null) this.dashed.set(state.pattern);
		if (state.visible != null) this.visible.set(state.visible);
		if (state.width != null) this.width.set(state.width);
	}
}
