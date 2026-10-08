/**
 * A geographic area: west, south, east and north, in degrees (WGS 84).
 * @category Map state
 */
export type Bounds = [west: number, south: number, east: number, north: number];

/**
 * A position on the map: longitude and latitude, in degrees (WGS 84).
 * @category Map state
 */
export type Position = [longitude: number, latitude: number];

/**
 * A color as hex code: "#rrggbb", or "#rrggbbaa" with its opacity (alpha). Written in lower case.
 * @pattern ^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$
 * @category Colors
 */
export type HexColor = string;

/**
 * The largest tilt of a map, in degrees from looking straight down.
 * @category Map state
 */
export const MAX_PITCH = 60;

/**
 * What the wheel does over a shared map, see `StateFrame.scrollZoom`.
 * @category Map state
 */
export const SCROLL_ZOOMS = ['free', 'protected'] as const;

/**
 * The largest zoom level of a map, and so of the limits of a frame.
 * @category Map state
 */
export const MAX_ZOOM = 22;

/**
 * What a shared or embedded map shows when it opens: an area, seen from a direction, and what its
 * viewers can do from there: move it and zoom, unless that is switched off; rotate and tilt it, if
 * that is switched on.
 * @category Map state
 */
export interface StateFrame {
	/**
	 * The visible area: what the map shows completely, whatever the size and the shape of the
	 * window. Without it, the bounds of the elements are shown.
	 */
	bounds?: Bounds;
	/**
	 * The rotation of the map: the compass direction at the top of the window, in degrees
	 * clockwise from north, e.g. 90 with east at the top. Default: 0, north at the top.
	 * @minimum -180
	 * @maximum 180
	 */
	bearing?: number;
	/**
	 * The tilt of the map, in degrees: 0 looks straight down, more looks towards the horizon.
	 * Default: 0.
	 * @minimum 0
	 * @maximum 60
	 */
	pitch?: number;
	/** Viewers can move the map. Default: true. */
	canPan?: boolean;
	/** Viewers can zoom in and out. Default: true. */
	canZoom?: boolean;
	/** Viewers can rotate the map. Default: false. */
	canRotate?: boolean;
	/** Viewers can tilt the map. Default: false. */
	canTilt?: boolean;
	/**
	 * Viewers stay in the area that the map shows when it opens: they cannot zoom out further, nor
	 * move the map beyond it. Default: false.
	 */
	confine?: boolean;
	/**
	 * The least zoom level that viewers can zoom out to, in steps of 0.5. What a zoom level shows
	 * depends on the size of the window, so `confine` is the better way to keep viewers from zooming
	 * out. Default: none.
	 * @minimum 0
	 * @maximum 22
	 * @multipleOf 0.5
	 */
	minZoom?: number;
	/**
	 * The largest zoom level that viewers can zoom in to, in steps of 0.5, e.g. if the map is not
	 * meant to be looked at more closely. Not less than `minZoom`. Default: none.
	 * @minimum 0
	 * @maximum 22
	 * @multipleOf 0.5
	 */
	maxZoom?: number;
	/**
	 * What the wheel does over the map, e.g. of a map that is embedded in a page: "free" zooms the
	 * map; "protected" scrolls the page, and the map zooms with Ctrl (or ⌘) and the wheel, and moves
	 * on touch screens with two fingers. Default: "free".
	 */
	scrollZoom?: (typeof SCROLL_ZOOMS)[number];
}

/**
 * A map: what a shared map shows of it, its properties and its elements. Where its author looks in
 * the editor is not part of it.
 * @category Map state
 */
export interface MapState {
	/** What a shared or embedded map shows when it opens, and how its viewers can turn it. */
	frame?: StateFrame;
	meta?: StateMetadata;
	/** The elements, in drawing order: the first one at the back, the last one in front. */
	elements: StateElement[];
}

/** @category Elements */
export type StateElement = StateElementMarker | StateElementLine | StateElementPolygon | StateElementCircle;

/**
 * A symbol at a point, with an optional label.
 * @category Elements
 */
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

/**
 * A line through points.
 * @category Elements
 */
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

/**
 * An area within points; the last point connects to the first one.
 * @category Elements
 */
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

/**
 * A circle around a point.
 * @category Elements
 */
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

/**
 * The arrowheads at the ends of a line; "none" is a plain end.
 * @category Styles
 */
export const ARROW_NAMES = ['none', 'triangle', 'chevron', 'circle'] as const;
/** @category Styles */
export type ArrowName = (typeof ARROW_NAMES)[number];

/**
 * The positions of the label of a marker around its symbol.
 * @category Styles
 */
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
/** @category Styles */
export type LabelPositionName = (typeof LABEL_POSITION_NAMES)[number];

/**
 * The patterns of the fill of an area: solid, lines in a direction ("diagonal-up" is "/"), lines in
 * two directions, or dots in rows or diagonally. Their size and coverage are fields of their own.
 * @category Styles
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
/** @category Styles */
export type FillPatternName = (typeof FILL_PATTERN_NAMES)[number];

/**
 * The dashes of a line or an outline.
 * @category Styles
 */
export const STROKE_STYLE_NAMES = ['solid', 'dashed', 'dotted', 'long-dash', 'dash-dot'] as const;
/** @category Styles */
export type DashName = (typeof STROKE_STYLE_NAMES)[number];

/**
 * The style of a marker: its symbol, and the look of its label. Missing fields have their default.
 * @category Styles
 */
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
	/**
	 * The marker lies flat on the map, its symbol and its label: on a map that is rotated or
	 * tilted, it turns and tilts with the map, so e.g. an arrow keeps its compass direction, and
	 * the positions of the label are compass directions. Else it stands upright and faces the
	 * viewer, however the map is turned.
	 * @default false
	 */
	flat?: boolean;
}

/**
 * The style of a line: its color, width and dashes, and its arrowheads. Missing fields have their default.
 * @category Styles
 */
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

/**
 * The style of an area (of a polygon or a circle): its color and pattern. Missing fields have their default.
 * @category Styles
 */
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

/**
 * The style of the outline of an area. Missing fields have their default.
 * @category Styles
 */
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

/**
 * All fields of the styles of all roles, e.g. for the codec, which writes any style alike.
 * @category Styles
 */
export type StateStyle = MarkerStyle & LineStyle & AreaStyle & OutlineStyle;

/**
 * What a style styles: a marker, a line, an area, or the outline of an area.
 * @category Styles
 */
export type StyleRoleName = 'marker' | 'line' | 'area' | 'outline';

/** @category Map state */
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

/**
 * How the labels are shown: those of markers, and those of the background map.
 * @category Map state
 */
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

/** @category Legend */
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
/** @category Legend */
export const LEGEND_LAYOUTS = ['vertical', 'horizontal', 'inline'] as const;
/**
 * The background and the border of the legend: white, black, or a blurred glass over the map.
 * @category Legend
 */
export const LEGEND_THEMES = ['light', 'dark', 'glass'] as const;
/**
 * Generic CSS font families, which every browser has, unlike the glyph fonts of the map.
 * @category Legend
 */
export const LEGEND_FONTS = ['sans-serif', 'serif', 'monospace'] as const;

/**
 * The places of the address search: at the top, since its results open downwards.
 * @category Viewer
 */
export const SEARCH_POSITIONS = ['top-left', 'top-right'] as const;
/**
 * The places of the buttons for zooming: the corners.
 * @category Viewer
 */
export const NAVIGATION_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

/**
 * What the viewer shows over the map, and where: a control at a position, or "none"; a button
 * (e.g. `reset`) with the buttons for zooming, or not. Controls in the same corner are stacked. Defaults in `VIEWER_DEFAULTS`.
 * @category Viewer
 */
export interface StateViewer {
	/** The address search. Default: "none". */
	search?: (typeof SEARCH_POSITIONS)[number] | 'none';
	/** The buttons for zooming in and out. Default: "top-right". */
	navigation?: (typeof NAVIGATION_POSITIONS)[number] | 'none';
	/** The legend, if the map has one: a side (centered) or a corner. Default: "bottom-left". */
	legend?: (typeof LEGEND_POSITIONS)[number] | 'none';
	/**
	 * A button that shows the map as it opened: its area, its rotation and its tilt. With the
	 * buttons for zooming, or where they would be. Default: false.
	 */
	reset?: boolean;
	/**
	 * A button that shows the map on the whole screen, and back. With the buttons for zooming, or
	 * where they would be. An embedded map needs the permission of its page: `allow="fullscreen"`
	 * on its iframe. Default: false.
	 */
	fullscreen?: boolean;
}

/** @category Legend */
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

/**
 * What a legend entry shows: a marker, a line, or an area (e.g. of a polygon or a circle).
 * @category Legend
 */
export const LEGEND_ENTRY_TYPES = ['marker', 'line', 'area'] as const;

/**
 * A row of the legend: a small copy of an element, and a text. Its styles are those of an element
 * of its kind, with the same defaults (see the elements).
 * @category Legend
 */
export type StateLegendEntry = StateLegendMarker | StateLegendLine | StateLegendArea;

/**
 * A legend entry with a marker.
 * @category Legend
 */
export interface StateLegendMarker {
	type: 'marker';
	style?: MarkerStyle;
	/** The text next to it. */
	label: string;
}

/**
 * A legend entry with a line.
 * @category Legend
 */
export interface StateLegendLine {
	type: 'line';
	style?: LineStyle;
	/** The text next to it. */
	label: string;
}

/**
 * A legend entry with an area, e.g. of a polygon or a circle.
 * @category Legend
 */
export interface StateLegendArea {
	type: 'area';
	style?: AreaStyle;
	/** The outline of the area. */
	strokeStyle?: OutlineStyle;
	/** The text next to it. */
	label: string;
}

/**
 * The base maps: the vector map of OpenStreetMap, or satellite imagery.
 * @category Background map
 */
export const BACKGROUND_BASES = ['vector', 'satellite'] as const;

/**
 * The themes of the vector map, as `@versatiles/style` names them. A link stores a theme as its
 * index here, so new ones are added at the end; a theme that is not listed is stored as text.
 * @category Background map
 */
export const BACKGROUND_THEMES = [
	'colorful',
	'colorful-dark',
	'natural',
	'natural-dark',
	'muted',
	'muted-dark',
	'gray',
	'gray-dark',
	'toner',
	'toner-dark',
	'positrino',
	'positrino-dark',
	'fnord',
	'protocol',
	'protocol-dark',
	'protostar',
	'protostar-dark',
	'protozoa',
	'classic',
	'googol',
	'freedom',
	'macbob',
	'mactaylor',
	'bingo'
] as const;

/**
 * How many labels the background map shows.
 * @category Background map
 */
export const BACKGROUND_LABELS = ['normal', 'fewer', 'none'] as const;

/**
 * The languages of the labels of the background map: of the browser ("user"), the local names
 * ("local"), or a language of the names in the tiles. A link stores a language as its index here;
 * one that is not listed is stored as text.
 * @category Background map
 */
export const BACKGROUND_LANGUAGES = [
	'user',
	'local',
	'ar',
	'de',
	'el',
	'en',
	'es',
	'fr',
	'it',
	'nl',
	'pl',
	'pt',
	'uk'
] as const;

/**
 * The buildings of the vector map: their outlines, or raised to their heights.
 * @category Background map
 */
export const BACKGROUND_BUILDINGS = ['flat', 'extruded'] as const;

/**
 * The background map, as its author set it: the base map, its theme, its labels, its colors and
 * its relief. The editor builds the map from these settings, with `@versatiles/style`. Missing
 * fields have their default; the background with only defaults is not stored at all.
 * @category Background map
 */
export interface StateBackground {
	/**
	 * The vector map of OpenStreetMap, or satellite imagery.
	 * @default "vector"
	 */
	base?: (typeof BACKGROUND_BASES)[number];
	/**
	 * The theme of the vector map, one of `@versatiles/style`, e.g. "gray" or "gray-dark".
	 * @default "colorful"
	 */
	theme?: string;
	/**
	 * Whether the satellite map shows streets, railways and the symbols of points of interest over
	 * the imagery. The vector map always does.
	 * @default true
	 */
	streets?: boolean;
	/**
	 * Whether the satellite map shows the borders of countries and states over the imagery. The
	 * vector map always does.
	 * @default true
	 */
	borders?: boolean;
	/**
	 * How many labels the map shows: all, fewer (with more space between them), or none.
	 * @default "normal"
	 */
	labels?: (typeof BACKGROUND_LABELS)[number];
	/**
	 * The language of the labels: "user" (of the browser), "local" (the local names), or a
	 * language code, e.g. "de".
	 * @default "user"
	 */
	language?: string;
	/**
	 * The glyph font of the labels.
	 * @default "noto_sans_regular"
	 */
	font?: string;
	/**
	 * The size of the labels, as a factor.
	 * @exclusiveMinimum 0
	 * @default 1
	 */
	labelSize?: number;
	/**
	 * The width of the halo around the labels, in pixels. Default: 2 on the vector map, 1 over the
	 * imagery.
	 * @minimum 0
	 */
	haloWidth?: number;
	/** Changes of the colors of the map. */
	colors?: StateBackgroundColors;
	/**
	 * The relief shaded: hills and mountains with light and shadow.
	 * @default false
	 */
	hillshade?: boolean;
	/**
	 * The terrain raised to its heights, which a tilted map shows.
	 * @default false
	 */
	terrain?: boolean;
	/**
	 * The buildings of the vector map: "flat", or "extruded" to their heights, which a tilted map
	 * shows when zoomed in.
	 * @default "flat"
	 */
	buildings?: (typeof BACKGROUND_BUILDINGS)[number];
	/**
	 * Options of `@versatiles/style` for what the settings cannot say, e.g.
	 * `{ "features": { "terrain": { "exaggeration": 2 } } }`: of `osm()` for the vector map, of
	 * `satellite()` for the imagery. They are laid over the options that the editor builds from the
	 * settings, so they win where both say something. The editor does not write them itself.
	 */
	options?: Record<string, unknown>;
}

/**
 * Changes of the colors of the background map; without them, its colors are as they are.
 * @category Background map
 */
export interface StateBackgroundColors {
	/**
	 * From -1 (gray) to 1.
	 * @minimum -1
	 * @maximum 1
	 * @default 0
	 */
	saturation?: number;
	/**
	 * The lightness that black becomes, where 0 is black and 1 white.
	 * @minimum -1
	 * @maximum 1
	 * @default 0
	 */
	black?: number;
	/**
	 * The lightness that white becomes.
	 * @minimum 0
	 * @maximum 2
	 * @default 1
	 */
	white?: number;
}

/**
 * A popup that opens when the element is clicked or tapped in the viewer.
 * @category Elements
 */
export interface StatePopup {
	/** Plain text with simple formatting: **bold**, line breaks and links. */
	text: string;
}
