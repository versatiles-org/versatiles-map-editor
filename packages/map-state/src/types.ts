/** A geographic area: west, south, east and north, in degrees (WGS 84). */
export type Bounds = [west: number, south: number, east: number, north: number];

/** A position on the map: longitude and latitude, in degrees (WGS 84). */
export type Position = [longitude: number, latitude: number];

/**
 * A color as hex code: "#rrggbb", or "#rrggbbaa" with its opacity (alpha). Written in lower case.
 * @pattern ^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$
 */
export type HexColor = string;

/** A map: its viewport, its properties and its elements. */
export interface MapState {
	/**
	 * The camera: where the author's editor looks, e.g. after a reload. Links for sharing and
	 * embedding leave it out; they show the `frame`, else the elements.
	 */
	view?: {
		center: Position;
		/**
		 * The radius of the largest circle that the window shows, in meters.
		 * @exclusiveMinimum 0
		 */
		radius: number;
	};
	/**
	 * The visible area: what a shared or embedded map shows completely, whatever the size and
	 * the shape of the window. Without it, the bounds of the elements are shown.
	 */
	frame?: Bounds;
	meta?: StateMetadata;
	/** The elements, in drawing order: the first one at the back, the last one in front. */
	elements: StateElement[];
}

export type StateElement = StateElementMarker | StateElementLine | StateElementPolygon | StateElementCircle;

/** A symbol at a point, with an optional label. */
export interface StateElementMarker {
	type: 'marker';
	point: Position;
	/**
	 * The text of the label next to the symbol; none if it is missing or "".
	 * @default ""
	 */
	label?: string;
	/** The symbol and the look of the label. */
	style?: MarkerStyle;
	popup?: StatePopup;
}

/** A line through points. */
export interface StateElementLine {
	type: 'line';
	/** @minItems 2 */
	points: Position[];
	/**
	 * Drawn as a smooth curve through the points, instead of straight from point to point.
	 * @default false
	 */
	smooth?: boolean;
	/** The line: its color, width and dashes, and the arrowheads. */
	style?: LineStyle;
	popup?: StatePopup;
}

/** An area within points; the last point connects to the first one. */
export interface StateElementPolygon {
	type: 'polygon';
	/** @minItems 3 */
	points: Position[];
	/**
	 * Drawn as a smooth curve through the points, instead of straight from point to point.
	 * @default false
	 */
	smooth?: boolean;
	/** The area: its color (with its opacity) and pattern. */
	style?: AreaStyle;
	/** The outline: whether it is drawn, its color, width and dashes. */
	strokeStyle?: OutlineStyle;
	popup?: StatePopup;
}

/** A circle around a point. */
export interface StateElementCircle {
	type: 'circle';
	point: Position;
	/**
	 * The radius, in meters.
	 * @exclusiveMinimum 0
	 */
	radius: number;
	/** The area: its color (with its opacity) and pattern. */
	style?: AreaStyle;
	/** The outline: whether it is drawn, its color, width and dashes. */
	strokeStyle?: OutlineStyle;
	popup?: StatePopup;
}

// The names of the choices of a style. Rules, since they are part of .mapjson files and links:
// - lowercase ASCII, words joined by "-";
// - the default is the first name of its table;
// - the tables only grow, at their end: links store the index of a name, so a name is never
//   inserted, reordered, renamed or removed once released;
// - a variant adds a word to the name of its base ("diagonal-up", "long-dash", a later "triangle-open");
// - positions name the vertical side first ("top-right"), as the legend and the viewer do.

/** The arrowheads at the ends of a line; "none" is a plain end. */
export const ARROW_NAMES = ['none', 'triangle', 'chevron', 'circle'] as const;
export type ArrowName = (typeof ARROW_NAMES)[number];

/** The positions of the label of a marker around its symbol. */
export const LABEL_POSITION_NAMES = [
	'auto',
	'right',
	'left',
	'top',
	'bottom',
	'top-right',
	'top-left',
	'bottom-right',
	'bottom-left'
] as const;
export type LabelPositionName = (typeof LABEL_POSITION_NAMES)[number];

/**
 * The patterns of the fill of an area: solid, lines in a direction ("diagonal-up" is "/"), lines in
 * two directions, or dots in rows or diagonally. Their size and coverage are fields of their own.
 */
export const FILL_PATTERN_NAMES = [
	'solid',
	'diagonal-up',
	'diagonal-down',
	'horizontal',
	'vertical',
	'cross',
	'diagonal-cross',
	'dots',
	'diagonal-dots'
] as const;
export type FillPatternName = (typeof FILL_PATTERN_NAMES)[number];

/** The dashes of a line or an outline. */
export const STROKE_STYLE_NAMES = ['solid', 'dashed', 'dotted', 'long-dash', 'dash-dot'] as const;
export type DashName = (typeof STROKE_STYLE_NAMES)[number];

/** The style of a marker: its symbol, and the look of its label. Missing fields have their default. */
export interface MarkerStyle {
	/** The image of the symbol, e.g. "icons:anchor", or "" for none. Default: a flag. */
	symbol?: string;
	/**
	 * The color of the symbol, with its opacity.
	 * @default "#ff0000"
	 */
	color?: HexColor;
	/**
	 * The size of the symbol, as a factor.
	 * @exclusiveMinimum 0
	 * @default 1
	 */
	size?: number;
	/**
	 * The rotation of the symbol, in whole degrees clockwise.
	 * @asType integer
	 * @minimum -180
	 * @maximum 180
	 * @default 0
	 */
	rotation?: number;
	/**
	 * The width of the halo around the symbol and the label, in pixels.
	 * @minimum 0
	 * @default 1
	 */
	haloWidth?: number;
	/**
	 * The color of the halo around the symbol and the label.
	 * @default "#ffffff"
	 */
	haloColor?: HexColor;
	/**
	 * The color of the text of the label.
	 * @default "#000000"
	 */
	labelColor?: HexColor;
	/**
	 * The size of the label, as a factor of 16 pixels.
	 * @exclusiveMinimum 0
	 * @default 1
	 */
	labelSize?: number;
	/**
	 * The glyph font of the label, e.g. "noto_sans_bold"; "" for the font of the labels of the
	 * background map.
	 * @default ""
	 */
	font?: string;
	/**
	 * The position of the label around the symbol; "auto" where it fits, or on the point without a
	 * symbol.
	 * @default "auto"
	 */
	labelPosition?: LabelPositionName;
}

/** The style of a line: its color, width and dashes, and its arrowheads. Missing fields have their default. */
export interface LineStyle {
	/**
	 * The color of the line, with its opacity.
	 * @default "#ff0000"
	 */
	color?: HexColor;
	/**
	 * The width, in pixels.
	 * @minimum 0
	 * @default 2
	 */
	width?: number;
	/**
	 * Solid, dashed, dotted, long dashes, or dashes and dots.
	 * @default "solid"
	 */
	dash?: DashName;
	/**
	 * The arrowhead at the first point.
	 * @default "none"
	 */
	arrowStart?: ArrowName;
	/**
	 * The arrowhead at the last point.
	 * @default "none"
	 */
	arrowEnd?: ArrowName;
	/**
	 * The width of the arrowheads across the line, as a factor of the width of the line. Only with
	 * an arrowhead.
	 * @exclusiveMinimum 0
	 * @default 3
	 */
	arrowSize?: number;
}

/** The style of an area (of a polygon or a circle): its color and pattern. Missing fields have their default. */
export interface AreaStyle {
	/**
	 * The color of the area, with its opacity.
	 * @default "#ff0000"
	 */
	color?: HexColor;
	/**
	 * The pattern of the fill.
	 * @default "solid"
	 */
	pattern?: FillPatternName;
	/**
	 * The size of the pattern, as a factor; at 1 the lines (across them) or the dots are 8 pixels
	 * apart. Only with a pattern.
	 * @minimum 0.5
	 * @maximum 4
	 * @default 1
	 */
	patternScale?: number;
	/**
	 * The share of the area that the lines or dots of the pattern cover, from 0.05 to 0.95. Only
	 * with a pattern.
	 * @minimum 0.05
	 * @maximum 0.95
	 * @default 0.5
	 */
	patternCoverage?: number;
}

/** The style of the outline of an area. Missing fields have their default. */
export interface OutlineStyle {
	/**
	 * Whether the outline is drawn.
	 * @default true
	 */
	visible?: boolean;
	/**
	 * The color of the outline, with its opacity.
	 * @default "#ff0000"
	 */
	color?: HexColor;
	/**
	 * The width, in pixels.
	 * @minimum 0
	 * @default 2
	 */
	width?: number;
	/**
	 * Solid, dashed, dotted, long dashes, or dashes and dots.
	 * @default "solid"
	 */
	dash?: DashName;
}

/** All fields of the styles of all roles, e.g. for the codec, which writes any style alike. */
export type StateStyle = MarkerStyle & LineStyle & AreaStyle & OutlineStyle;

/** What a style styles: a marker, a line, an area, or the outline of an area. */
export type StyleRoleName = 'marker' | 'line' | 'area' | 'outline';

/** The fields of the style of each role, e.g. to check the style of a file (a test compares them with the types). */
export const STYLE_ROLE_FIELDS = {
	marker: [
		'symbol',
		'color',
		'size',
		'rotation',
		'haloWidth',
		'haloColor',
		'labelColor',
		'labelSize',
		'font',
		'labelPosition'
	],
	line: ['color', 'width', 'dash', 'arrowStart', 'arrowEnd', 'arrowSize'],
	area: ['color', 'pattern', 'patternScale', 'patternCoverage'],
	outline: ['visible', 'color', 'width', 'dash']
} as const satisfies {
	marker: readonly (keyof MarkerStyle)[];
	line: readonly (keyof LineStyle)[];
	area: readonly (keyof AreaStyle)[];
	outline: readonly (keyof OutlineStyle)[];
};

export interface StateMetadata {
	/** The background map. Without it, the map has the editor's default background. */
	background?: StateBackground;
	/** A legend, defined by the author, not generated from the elements. */
	legend?: StateLegend;
	/** The id of the color scheme offered for the map's colors. Without it, the default scheme. */
	colorScheme?: string;
	/** What a shared or embedded map shows over it, and where: the search, the zoom buttons, the legend. */
	viewer?: StateViewer;
	/** How the labels are shown: those of markers, and those of the background map. */
	labels?: StateLabels;
	/** The title of the map, e.g. for the list of maps, the title of the page and file names. */
	title?: string;
}

/** How the labels are shown: those of markers, and those of the background map. */
export interface StateLabels {
	/**
	 * Labels of markers that would overlap other labels: "show" them all, also on top of each
	 * other, or "hide" them (their symbols stay).
	 * @default "show"
	 */
	overlap?: 'show' | 'hide';
	/**
	 * The zoom level from which the labels of markers are shown, with one decimal place, above 0 and
	 * up to 24, e.g. 12.5. Without it, at every zoom level.
	 * @exclusiveMinimum 0
	 * @maximum 24
	 * @multipleOf 0.1
	 */
	minZoom?: number;
	/**
	 * Draw the labels of the background map over the areas and lines of the elements, instead of
	 * under them. The labels of markers are always on top.
	 * @default false
	 */
	mapOnTop?: boolean;
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
/** The background and the border of the legend: white, black, or a blurred glass over the map. */
export const LEGEND_THEMES = ['light', 'dark', 'glass'] as const;
/** Generic CSS font families, which every browser has, unlike the glyph fonts of the map. */
export const LEGEND_FONTS = ['sans-serif', 'serif', 'monospace'] as const;

/** The places of the address search: at the top, since its results open downwards. */
export const SEARCH_POSITIONS = ['top-left', 'top-right'] as const;
/** The places of the buttons for zooming: the corners. */
export const NAVIGATION_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/**
 * What the viewer shows over the map, and where: each at a position, or "none". Controls in the
 * same corner are stacked. Defaults in `VIEWER_DEFAULTS`.
 */
export interface StateViewer {
	/** The address search. Default: "none". */
	search?: (typeof SEARCH_POSITIONS)[number] | 'none';
	/** The buttons for zooming in and out. Default: "top-right". */
	navigation?: (typeof NAVIGATION_POSITIONS)[number] | 'none';
	/** The legend, if the map has one: a side (centered) or a corner. Default: "bottom-left". */
	legend?: (typeof LEGEND_POSITIONS)[number] | 'none';
}

export interface StateLegend {
	/** How the entries are arranged. "inline" flows like text. Default: "vertical". */
	layout?: (typeof LEGEND_LAYOUTS)[number];
	/** Default: "sans-serif". */
	font?: (typeof LEGEND_FONTS)[number];
	/** The texts of all entries in bold. Default: false. */
	bold?: boolean;
	/** The texts of all entries in italic. Default: false. */
	italic?: boolean;
	/** The background and the border of the legend. Default: "light". */
	theme?: (typeof LEGEND_THEMES)[number];
	entries: StateLegendEntry[];
}

/** What a legend entry shows: a marker, a line, or an area (e.g. of a polygon or a circle). */
export const LEGEND_ENTRY_TYPES = ['marker', 'line', 'area'] as const;

/**
 * A row of the legend: a small copy of an element, and a text. Its styles are those of an element
 * of its kind, with the same defaults (see the elements).
 */
export type StateLegendEntry = StateLegendMarker | StateLegendLine | StateLegendArea;

/** A legend entry with a marker. */
export interface StateLegendMarker {
	type: 'marker';
	style?: MarkerStyle;
	/** The text next to it. */
	label: string;
}

/** A legend entry with a line. */
export interface StateLegendLine {
	type: 'line';
	style?: LineStyle;
	/** The text next to it. */
	label: string;
}

/** A legend entry with an area, e.g. of a polygon or a circle. */
export interface StateLegendArea {
	type: 'area';
	style?: AreaStyle;
	/** The outline of the area. */
	strokeStyle?: OutlineStyle;
	/** The text next to it. */
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
