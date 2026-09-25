export interface StateRoot {
	map?: {
		center: [number, number];
		radius: number;
	};
	meta?: StateMetadata;
	elements: StateElement[];
}

export type StateElement = StateElementMarker | StateElementLine | StateElementPolygon | StateElementCircle;

export interface StateElementMarker {
	type: 'marker';
	point: [number, number];
	style?: StateStyle;
	popup?: StatePopup;
}

export interface StateElementLine {
	type: 'line';
	points: [number, number][];
	style?: StateStyle;
	popup?: StatePopup;
}

export interface StateElementPolygon {
	type: 'polygon';
	points: [number, number][];
	style?: StateStyle;
	strokeStyle?: StateStyle;
	popup?: StatePopup;
}

export interface StateElementCircle {
	type: 'circle';
	point: [number, number];
	radius: number;
	style?: StateStyle;
	strokeStyle?: StateStyle;
	popup?: StatePopup;
}

export interface StateStyle {
	halo?: number;
	opacity?: number;
	pattern?: number;
	rotate?: number;
	size?: number;
	width?: number;
	align?: number;
	color?: string;
	label?: string;
	visible?: boolean;
}

export interface StateMetadata {
	/** The background map. Without it, the map has the editor's default background. */
	background?: StateBackground;
	/** A legend, defined by the author, not generated from the elements. */
	legend?: StateLegend;
	/** The id of the color scheme offered for the map's colors. Without it, the default scheme. */
	colorScheme?: string;
	/** Show an address search in the read-only viewer, e.g. in an embedded map. */
	search?: boolean;
}

export const LEGEND_POSITIONS = [
	'bottom-left',
	'bottom',
	'bottom-right',
	'right',
	'top-right',
	'top',
	'top-left',
	'left'
] as const;
export const LEGEND_LAYOUTS = ['vertical', 'horizontal', 'inline'] as const;
/** Generic CSS font families, which every browser has, unlike the glyph fonts of the map. */
export const LEGEND_FONTS = ['sans-serif', 'serif', 'monospace'] as const;

export interface StateLegend {
	/** A side (centered) or a corner of the map. Default: "bottom-left". */
	position?: (typeof LEGEND_POSITIONS)[number];
	/** How the entries are arranged. "inline" flows like text. Default: "vertical". */
	layout?: (typeof LEGEND_LAYOUTS)[number];
	/** Default: "sans-serif". */
	font?: (typeof LEGEND_FONTS)[number];
	entries: StateLegendEntry[];
}

/** A row of the legend: a color, or a symbol in this color, and a text. */
export interface StateLegendEntry {
	color: string;
	/** Index of a marker symbol. Without it, the entry shows a color swatch. */
	symbol?: number;
	label: string;
}

/**
 * A background map built with `@versatiles/style`: the builder and its options, minimized
 * (e.g. with `osm.minimizeOptions`). Storing the options instead of a preset keeps every
 * current and future option of `@versatiles/style` available.
 */
export interface StateBackground {
	builder: 'osm' | 'satellite';
	options: Record<string, unknown>;
}

/** A popup that opens when the element is clicked or tapped in the viewer. */
export interface StatePopup {
	/** Plain text with simple formatting: **bold**, line breaks and links. */
	text: string;
}
