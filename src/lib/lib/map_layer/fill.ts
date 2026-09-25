import { get, writable } from 'svelte/store';
import type { LayerFill } from './types.js';
import { MapLayer } from './abstract.js';
import { Color } from '@versatiles/style';
import type { GeometryManager } from '../geometry_manager.js';
import { type StateStyle, FILL_DEFAULTS, FILL_PATTERN_NAMES, removeDefaultFields } from '@versatiles/map-state';

const size = 32;

interface Fill {
	xf: number;
	yf: number;
	pattern: string;
}

// Rendering data per fill pattern index; the names come from the codec
const fills: (Fill | undefined)[] = [
	undefined, // solid
	{ xf: 1, yf: 1, pattern: '00002552' }, // diagonal
	{ xf: 1, yf: 1, pattern: '0252' } // diagonal-thin
];

export const fillPatterns = new Map<number, { name: string; fill: Fill | undefined }>(
	FILL_PATTERN_NAMES.map((name, index) => [index, { name, fill: fills[index] }])
);

export class MapLayerFill extends MapLayer<LayerFill> {
	static readonly defaultStyle = FILL_DEFAULTS;

	color = writable(MapLayerFill.defaultStyle.color);
	opacity = writable(MapLayerFill.defaultStyle.opacity);
	pattern = writable(MapLayerFill.defaultStyle.pattern);

	constructor(manager: GeometryManager, id: string, source: string) {
		super(manager, id);

		this.addLayer(
			source,
			'fill',
			{},
			{
				'fill-color': Color.parse(get(this.color)).asHex(),
				'fill-opacity': get(this.opacity)
			}
		);

		const updatePattern = () => {
			const fill = fillPatterns.get(get(this.pattern))?.fill ?? undefined;
			const color = Color.parse(get(this.color));

			if (fill == null) {
				this.updatePaint('fill-color', color);
				this.updatePaint('fill-pattern', undefined);
				return;
			}

			const { xf, yf, pattern: p } = fill;
			const alpha = p.split('').map((c) => parseInt(c, 10) * 51);
			const length = alpha.length;

			const data = new Uint8ClampedArray(size * size * 4);
			const c = color.to('srgb').asArray();

			for (let y = 0; y < size; y++) {
				for (let x = 0; x < size; x++) {
					const v = x * xf + y * yf;
					const i = (y * size + x) * 4;
					data[i] = c[0];
					data[i + 1] = c[1];
					data[i + 2] = c[2];
					data[i + 3] = alpha[v % length];
				}
			}

			const name = this.patternImageName;
			if (this.map.hasImage(name)) this.map.removeImage(name);
			this.map.addImage(name, { width: size, height: size, data });
			this.updatePaint('fill-pattern', name);
		};

		this.color.subscribe(() => updatePattern());
		this.pattern.subscribe(() => updatePattern());
		// A new background map removes all images, so the pattern is added again when it is missing
		manager.imageResolvers.set(this.patternImageName, updatePattern);
		this.opacity.subscribe((value) => this.updatePaint('fill-opacity', value));
	}

	private get patternImageName(): string {
		return 'fill-pattern-' + this.id;
	}

	destroy(): void {
		this.manager.imageResolvers.delete(this.patternImageName);
		super.destroy();
		if (this.map.hasImage(this.patternImageName)) this.map.removeImage(this.patternImageName);
	}

	getState(): StateStyle | undefined {
		return removeDefaultFields(
			{
				color: get(this.color),
				opacity: get(this.opacity),
				pattern: get(this.pattern)
			},
			MapLayerFill.defaultStyle
		);
	}

	setState(state: StateStyle) {
		if (state.color != null) this.color.set(state.color);
		if (state.opacity != null) this.opacity.set(state.opacity);
		if (state.pattern != null) this.pattern.set(state.pattern);
	}
}
