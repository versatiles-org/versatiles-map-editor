import { derived, get, writable, type Writable } from 'svelte/store';
import type { LayerSymbol } from './types.js';
import { MapLayer } from './abstract.js';
import { Color } from '@versatiles/style';
import type { GeometryManager } from '../geometry_manager.js';
import { type StateStyle, LABEL_ALIGN_NAMES, SYMBOL_DEFAULTS, removeDefaultFields } from '@versatiles/map-state';
import { getSymbol } from '../symbols.js';

type TextAnchor = 'center' | 'left' | 'right' | 'bottom' | 'top';

interface LabelAlign {
	index: number;
	name: string;
	anchor?: TextAnchor;
}

// Text anchor per label alignment index ("auto" uses variable anchors); the names come from the codec
const anchors: (TextAnchor | undefined)[] = [
	undefined, // auto
	'left', // right
	'right', // left
	'bottom', // top
	'top' // bottom
];

export const labelPositions: LabelAlign[] = LABEL_ALIGN_NAMES.map((name, index) => ({
	index,
	name,
	anchor: anchors[index]
}));

type TextVariableAnchor = LayerSymbol['layout']['text-variable-anchor'];

export class MapLayerSymbol extends MapLayer<LayerSymbol> {
	static readonly defaultStyle = SYMBOL_DEFAULTS;

	color = writable(MapLayerSymbol.defaultStyle.color);
	halo = writable(MapLayerSymbol.defaultStyle.halo);
	rotate = writable(MapLayerSymbol.defaultStyle.rotate);
	size = writable(MapLayerSymbol.defaultStyle.size);
	symbolIndex = writable(MapLayerSymbol.defaultStyle.pattern);
	label = writable(MapLayerSymbol.defaultStyle.label);
	labelAlign = writable(MapLayerSymbol.defaultStyle.align);

	symbolInfo = derived(this.symbolIndex, (index) => getSymbol(index));
	textAnchor = derived(this.labelAlign, (index) => {
		return lookupLabelAlign(index).anchor;
	});
	textVariableAnchor = derived([this.labelAlign, this.symbolInfo], ([index, symbol]) => {
		if (index !== 0) return undefined;
		if (symbol.image == null) {
			return ['center', 'left', 'right', 'top', 'bottom'] as TextVariableAnchor;
		}
		return ['left', 'right', 'top', 'bottom'] as TextVariableAnchor;
	});

	private readonly unsubscribeFont: () => void;

	constructor(manager: GeometryManager, id: string, source: string) {
		super(manager, id);

		this.addLayer(
			source,
			'symbol',
			{
				'icon-image': get(this.symbolInfo).image,
				'icon-offset': get(this.symbolInfo).offset,
				'icon-allow-overlap': true,
				'icon-rotate': get(this.rotate),
				'icon-size': get(this.size),

				'text-field': get(this.label),
				'text-font': [get(manager.font)],
				'text-justify': 'left',
				'text-overlap': 'always',
				'text-radial-offset': 0.7,
				'text-variable-anchor': get(this.textVariableAnchor),
				'text-anchor': get(this.textAnchor)
			},
			{
				'icon-color': get(this.color),
				'icon-halo-blur': 0,
				'icon-halo-color': '#FFFFFF',
				'icon-halo-width': get(this.halo),
				'icon-opacity': 1,
				'text-halo-blur': 0,
				'text-halo-color': '#FFFFFF',
				'text-halo-width': get(this.halo)
			}
		);

		this.color.subscribe((v) => this.updatePaint('icon-color', Color.parse(v)));
		this.halo.subscribe((v) => {
			this.updatePaint('icon-halo-width', v);
			this.updatePaint('text-halo-width', v);
		});
		this.label.subscribe((v) => this.updateLayout('text-field', v));
		this.textAnchor.subscribe((v) => this.updateLayout('text-anchor', v));
		this.textVariableAnchor.subscribe((v) => this.updateLayout('text-variable-anchor', v));
		this.rotate.subscribe((v) => this.updateLayout('icon-rotate', v));
		this.size.subscribe((v) => {
			this.updateLayout('icon-size', v);
			this.updateLayout('text-size', v * 16);
		});
		// marker labels use the font of the map labels
		this.unsubscribeFont = manager.font.subscribe((font) => this.updateLayout('text-font', [font]));
		this.symbolInfo.subscribe((v) => {
			if (v.image == null) {
				this.updateLayout('icon-image', undefined);
			} else {
				this.updateLayout('icon-image', v.image);
				this.updateLayout('icon-offset', v.offset);
			}
		});
	}

	destroy(): void {
		this.unsubscribeFont();
		super.destroy();
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields(
			{
				color: get(this.color),
				rotate: get(this.rotate),
				size: get(this.size),
				halo: get(this.halo),
				pattern: get(this.symbolIndex),
				label: get(this.label),
				align: get(this.labelAlign)
			},
			MapLayerSymbol.defaultStyle
		);
	}

	setState(state: StateStyle) {
		if (state.color != null) this.color.set(state.color);
		if (state.rotate != null) this.rotate.set(state.rotate);
		if (state.size != null) this.size.set(state.size);
		if (state.halo != null) this.halo.set(state.halo);
		if (state.pattern != null) this.symbolIndex.set(state.pattern);
		if (state.label != null) this.label.set(state.label);
		if (state.align != null) this.labelAlign.set(lookupLabelAlign(state.align).index);
	}
}

function lookupLabelAlign(index: number | string | Writable<number>): LabelAlign {
	let pos;

	if (typeof index === 'object') {
		index = get(index);
	}

	if (typeof index === 'number') {
		pos = labelPositions.find((p) => p.index === index);
	} else if (typeof index === 'string') {
		pos = labelPositions.find((p) => p.name === index);
	}

	if (pos == null) return labelPositions[0];
	return pos;
}
