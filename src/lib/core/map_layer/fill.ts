import type * as maplibregl from 'maplibre-gl';
import { get, writable } from 'svelte/store';
import { MapLayer } from './abstract.js';
import { Color } from '@versatiles/style';
import { type StateStyle, FILL_DEFAULTS, FILL_PATTERN_NAMES, removeDefaultFields } from '@versatiles/map-state';

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

const PATTERN_PREFIX = 'fill-pattern:';
const PATTERN_SIZE = 32;

/** The name of the image that fills an area with the pattern in the color, shared by all such areas. */
export function fillPatternName(pattern: number, color: string): string {
	return `${PATTERN_PREFIX}${pattern}:${color.toLowerCase()}`;
}

/**
 * Add the image of a fill pattern, when the map asks for it (e.g. again after a new map style).
 * Returns false for other images.
 */
export function addFillPatternImage(map: maplibregl.Map, name: string): boolean {
	if (!name.startsWith(PATTERN_PREFIX)) return false;
	const [index, color] = name.slice(PATTERN_PREFIX.length).split(':');
	// a solid fill is a pattern without gaps
	const fill = fillPatterns.get(Number(index))?.fill ?? { xf: 1, yf: 1, pattern: '5' };
	const alpha = fill.pattern.split('').map((c) => parseInt(c, 10) / 5);
	const [r, g, b, a = 1] = Color.parse(color).to('srgb').asArray();

	const data = new Uint8ClampedArray(PATTERN_SIZE * PATTERN_SIZE * 4);
	for (let y = 0; y < PATTERN_SIZE; y++) {
		for (let x = 0; x < PATTERN_SIZE; x++) {
			const i = (y * PATTERN_SIZE + x) * 4;
			data[i] = r;
			data[i + 1] = g;
			data[i + 2] = b;
			data[i + 3] = 255 * a * alpha[(x * fill.xf + y * fill.yf) % alpha.length];
		}
	}
	if (!map.hasImage(name)) map.addImage(name, { width: PATTERN_SIZE, height: PATTERN_SIZE, data });
	return true;
}

export class MapLayerFill extends MapLayer {
	static readonly defaultStyle = FILL_DEFAULTS;

	color = writable(MapLayerFill.defaultStyle.color);
	opacity = writable(MapLayerFill.defaultStyle.opacity);
	pattern = writable(MapLayerFill.defaultStyle.pattern);

	constructor(onChange: () => void) {
		super(onChange);
		this.watch(this.color, this.opacity, this.pattern);
	}

	getProperties() {
		return { pattern: fillPatternName(get(this.pattern), get(this.color)), opacity: get(this.opacity) };
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
