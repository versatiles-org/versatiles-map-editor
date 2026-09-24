import { derived, get, writable } from 'svelte/store';
import type { LayerLine } from './types.js';
import { MapLayer } from './abstract.js';
import { Color } from '@versatiles/style';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateStyle } from '$lib/codec/types.js';
import { LINE_DEFAULTS, STROKE_STYLE_NAMES, removeDefaultFields } from '$lib/codec/profile.js';

// Dash array per stroke style index; the names come from the codec
const arrays: number[][] = [
	[100], // solid
	[2, 4], // dashed
	[0, 2] // dotted
];

export const dashArrays = new Map<number, { name: string; array: number[] | undefined }>(
	STROKE_STYLE_NAMES.map((name, index) => [index, { name, array: arrays[index] }])
);

export class MapLayerLine extends MapLayer<LayerLine> {
	static readonly defaultStyle = LINE_DEFAULTS;

	color = writable(MapLayerLine.defaultStyle.color);
	dashed = writable(MapLayerLine.defaultStyle.pattern);
	visible = writable(MapLayerLine.defaultStyle.visible);
	width = writable(MapLayerLine.defaultStyle.width);

	dashArray = derived(this.dashed, (dashed) => dashArrays.get(dashed)?.array ?? [100]);

	constructor(manager: GeometryManager, id: string, source: string) {
		super(manager, id);

		this.addLayer(
			source,
			'line',
			{
				'line-cap': 'round',
				'line-join': 'round',
				visibility: get(this.visible) ? 'visible' : 'none'
			},
			{
				'line-color': Color.parse(get(this.color)).asHex(),
				'line-dasharray': get(this.dashArray),
				'line-width': get(this.width)
			}
		);

		this.color.subscribe((v) => this.updatePaint('line-color', Color.parse(v)));
		this.dashArray.subscribe((v) => this.updatePaint('line-dasharray', v));
		this.visible.subscribe((v) => this.updateLayout('visibility', v ? 'visible' : 'none'));
		this.width.subscribe((v) => this.updatePaint('line-width', v));
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
