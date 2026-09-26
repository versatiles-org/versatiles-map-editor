import { derived, get, writable, type Writable } from 'svelte/store';
import { MapLayer } from './abstract.js';
import { Color } from '@versatiles/style';
import { type StateStyle, LABEL_ALIGN_NAMES, SYMBOL_DEFAULTS, removeDefaultFields } from '@versatiles/map-state';
import { getSymbol } from '../symbols.js';

type TextAnchor = 'center' | 'left' | 'right' | 'bottom' | 'top';

// The distance of the label from the point, in ems, in the direction of its anchor
const LABEL_OFFSET = 0.7;
const anchorOffsets: Record<TextAnchor, [number, number]> = {
	center: [0, 0],
	left: [LABEL_OFFSET, 0],
	right: [-LABEL_OFFSET, 0],
	top: [0, LABEL_OFFSET],
	bottom: [0, -LABEL_OFFSET]
};
const withOffsets = (anchors: TextAnchor[]) => anchors.flatMap((anchor) => [anchor, anchorOffsets[anchor]]);

/**
 * The possible places of a label with their offsets, by the name of the label position:
 * the chosen side, or the first side that fits ("auto"; "auto-center" also on the point, for
 * markers without image). The layer looks them up, since features cannot have array properties.
 */
export const LABEL_POSITIONS: Record<string, (TextAnchor | [number, number])[]> = {
	auto: withOffsets(['left', 'right', 'top', 'bottom']),
	'auto-center': withOffsets(['center', 'left', 'right', 'top', 'bottom']),
	...Object.fromEntries((['left', 'right', 'top', 'bottom'] as const).map((anchor) => [anchor, withOffsets([anchor])]))
};

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

export class MapLayerSymbol extends MapLayer {
	static readonly defaultStyle = SYMBOL_DEFAULTS;

	color = writable(MapLayerSymbol.defaultStyle.color);
	halo = writable(MapLayerSymbol.defaultStyle.halo);
	rotate = writable(MapLayerSymbol.defaultStyle.rotate);
	size = writable(MapLayerSymbol.defaultStyle.size);
	symbolIndex = writable(MapLayerSymbol.defaultStyle.pattern);
	label = writable(MapLayerSymbol.defaultStyle.label);
	labelAlign = writable(MapLayerSymbol.defaultStyle.align);

	symbolInfo = derived(this.symbolIndex, (index) => getSymbol(index));

	constructor(onChange: () => void) {
		super(onChange);
		this.watch(this.color, this.halo, this.rotate, this.size, this.symbolIndex, this.label, this.labelAlign);
	}

	/** The name of the label position, see `LABEL_POSITIONS`. */
	private getPosition(): string {
		const anchor = lookupLabelAlign(get(this.labelAlign)).anchor;
		if (anchor) return anchor;
		return get(this.symbolInfo).image == null ? 'auto-center' : 'auto';
	}

	getProperties() {
		const { image } = get(this.symbolInfo);
		return {
			...(image == null ? {} : { icon: image }),
			// the layer looks up the offset of the icon by the symbol
			symbol: get(this.symbolIndex),
			color: Color.parse(get(this.color)).asString(),
			rotate: get(this.rotate),
			size: get(this.size),
			halo: get(this.halo),
			label: get(this.label),
			position: this.getPosition()
		};
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
