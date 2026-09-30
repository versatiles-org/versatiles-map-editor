/** A map: its viewport, its properties and its elements. */
/** A geographic area: west, south, east and north, in degrees. */
export type Bounds = [west: number, south: number, east: number, north: number];

export interface MapState {
	/**
	 * The camera: where the author's editor looks, e.g. after a reload. Links for sharing and
	 * embedding leave it out; they show the `frame`, else the elements.
	 */
	map?: {
		center: [number, number];
		radius: number;
	};
	/**
	 * The visible area: what a shared or embedded map shows completely, whatever the size and
	 * the shape of the window. Without it, the bounds of the elements are shown.
	 */
	frame?: Bounds;
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
	pattern?: number;
	rotate?: number;
	size?: number;
	width?: number;
	align?: number;
	color?: string;
	label?: string;
	visible?: boolean;
	/** The symbol of a marker: the name of its image, e.g. "icons:anchor", or "" for none. */
	symbol?: string;
	/** The color of the text of a marker's label. */
	labelColor?: string;
	/** The color of the halo around a marker's symbol and label. */
	haloColor?: string;
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
	/**
	 * The glyph font of the labels of all markers, e.g. "noto_sans_bold". Without it, they have the
	 * font of the labels of the background map.
	 */
	labelFont?: string;
	/**
	 * Draw the labels of the background map over the areas and lines of the elements. Without it,
	 * they are under them. The labels of markers are always on top.
	 */
	mapLabelsOnTop?: boolean;
	/** The title of the map, e.g. for the list of maps, the title of the page and file names. */
	title?: string;
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
	/** A marker symbol, by the name of its image. Without it, the entry shows a color swatch. */
	symbol?: string;
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
