import type * as GeoJSON from 'geojson';
import { formatHex, parseColor } from './color.js';
import {
	ARROW_NAMES,
	BACKGROUND_BASES,
	BACKGROUND_BUILDINGS,
	BACKGROUND_LABELS,
	FILL_PATTERN_NAMES,
	LABEL_POSITION_NAMES,
	LEGEND_ENTRY_TYPES,
	LEGEND_FONTS,
	LEGEND_LAYOUTS,
	LEGEND_THEMES,
	LEGEND_POSITIONS,
	NAVIGATION_POSITIONS,
	SCALE_POSITIONS,
	SEARCH_POSITIONS,
	DASH_NAMES,
	MAX_PITCH,
	MAX_ZOOM,
	type Bounds,
	type StateFrame,
	type Position,
	type StateBackground,
	type StateBackgroundColors,
	type StateElement,
	type StateLabels,
	type AreaStyle,
	type LineStyle,
	type MapState,
	type MarkerStyle,
	type OutlineStyle,
	type StateLegend,
	type StateLegendEntry,
	type StyleRoleName,
	type StateMetadata,
	type StatePopup,
	type StateStyle,
	type StateViewer
} from './types.js';
import { STYLE_ROLE_FIELDS } from './style_roles.js';

// ---------------------------------------------------------------------------
// Style vocabulary of the serialization format.
//
// The editor keeps the live values in StylePart stores and projects them to two
// shapes: a default-stripped `StateStyle` (for State and .mapjson; the base64
// codec writes its names as indexes) and a GeoJSON property bag. This module owns
// the defaults and the mapping between the two, and the names are tables in
// `types.ts`, so the codec is the single source of truth: the editor's StylePart
// classes take their default styles and names from here.
// ---------------------------------------------------------------------------

type Defaults<K extends keyof StateStyle> = Readonly<Required<Pick<StateStyle, K>>>;

/** @category Styles */
export const AREA_DEFAULTS: Defaults<'color' | 'pattern' | 'patternScale' | 'patternCoverage'> = {
	// translucent, so the map under an area stays readable
	color: '#ff000040',
	pattern: 'solid',
	patternScale: 1,
	patternCoverage: 0.5
};
/**
 * The range of the size of a pattern, a factor (`patternScale`).
 * @category Styles
 */
export const PATTERN_SCALE_RANGE = [0.5, 4] as const;
/**
 * The range of the share of an area that a pattern covers (`patternCoverage`).
 * @category Styles
 */
export const PATTERN_COVERAGE_RANGE = [0.05, 0.95] as const;
/**
 * A line, with its arrowheads. It is always visible: only the outline of an area can be hidden.
 * @category Styles
 */
export const LINE_DEFAULTS: Defaults<'color' | 'dash' | 'width' | 'arrowStart' | 'arrowEnd' | 'arrowSize'> = {
	color: '#ff0000',
	dash: 'solid',
	width: 2,
	arrowStart: 'none',
	arrowEnd: 'none',
	arrowSize: 3
};
/**
 * The outline of an area: drawn like a line, without arrowheads, and it can be hidden.
 * @category Styles
 */
export const OUTLINE_DEFAULTS: Defaults<'color' | 'dash' | 'visible' | 'width'> = {
	color: LINE_DEFAULTS.color,
	dash: LINE_DEFAULTS.dash,
	visible: true,
	width: LINE_DEFAULTS.width
};
/** @category Styles */
export const MARKER_DEFAULTS: Defaults<
	| 'color'
	| 'rotation'
	| 'size'
	| 'haloWidth'
	| 'symbol'
	| 'labelPosition'
	| 'labelColor'
	| 'labelSize'
	| 'labelFont'
	| 'haloColor'
	| 'flat'
> = {
	color: '#ff0000',
	rotation: 0,
	size: 1,
	labelSize: 1,
	haloWidth: 1,
	// a pin: the symbol of markers that name none, e.g. the new markers of the editor
	symbol: 'extras:pin-teardrop',
	labelPosition: 'auto',
	labelColor: '#000000',
	// the font of the labels of the background map
	labelFont: '',
	haloColor: '#ffffff',
	// upright, facing the viewer
	flat: false
};

/** The value, if it is one of the names of the table; undefined for anything else. */
function oneOf<T extends string>(table: readonly T[], value: unknown): T | undefined {
	return (table as readonly unknown[]).includes(value) ? (value as T) : undefined;
}

// ----- the values of a map state, e.g. of a .mapjson file -----
// Only the types that the schema of the files has: a number is a number, not "3". What is read
// once is read for good, so nothing is read by guessing. Numbers beyond their range are the
// nearest value in it.

function strictNumber(value: unknown, min = -Infinity, max = Infinity): number | undefined {
	return typeof value === 'number' ? sanitizeNumber(value, min, max) : undefined;
}

function strictRotation(value: unknown): number | undefined {
	return typeof value === 'number' ? sanitizeRotation(value) : undefined;
}

function strictString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function strictBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

/** A color as the files have it, "#rrggbb" or "#rrggbbaa", in lower case. */
function strictColor(value: unknown): string | undefined {
	return typeof value === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? sanitizeColor(value) : undefined;
}

// ----- sanitizers for foreign GeoJSON property values -----
// Imported GeoJSON may contain anything; these return undefined for values the
// encoder cannot represent, so the corresponding default is used instead.

/** A finite number (numeric strings are accepted), clamped to [min, max]. */
export function sanitizeNumber(value: unknown, min = -Infinity, max = Infinity): number | undefined {
	if (typeof value === 'string' && value.trim() !== '') value = Number(value);
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	return Math.min(max, Math.max(min, value));
}

/** A rotation in whole degrees, normalized to (-180, 180], like the rotation of a map (`sanitizeBearing`). */
export function sanitizeRotation(value: unknown): number | undefined {
	const n = sanitizeNumber(value);
	if (n === undefined) return undefined;
	const rotation = ((Math.round(n) % 360) + 360) % 360;
	// + 0: not -0
	return (rotation > 180 ? rotation - 360 : rotation) + 0;
}

/** A parseable color, normalized to lowercase hex (#rrggbb or #rrggbbaa). */
export function sanitizeColor(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const color = parseColor(value);
	return color && formatHex(color).toLowerCase();
}

export function sanitizeString(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return undefined;
}

/**
 * A symbol, named by its image in the sprites of the tile server, e.g. "icons:anchor", or "" for
 * no symbol. Undefined for anything else.
 */
export function sanitizeSymbol(value: unknown): string | undefined {
	return typeof value === 'string' && (value === '' || value.includes(':')) ? value : undefined;
}

export function sanitizeBoolean(value: unknown): boolean | undefined {
	if (typeof value === 'boolean') return value;
	if (value === 'true') return true;
	if (value === 'false') return false;
	return undefined;
}

/** The type of the style of each role. */
export interface RoleStyles {
	marker: MarkerStyle;
	line: LineStyle;
	area: AreaStyle;
	outline: OutlineStyle;
}

/**
 * A style of the role as a map state has it, e.g. in a .mapjson file: only its valid fields
 * of that role, or undefined if none is. Fields of other roles are left out, e.g. `arrowStart` of
 * a marker.
 */
export function sanitizeStyle<R extends StyleRoleName>(role: R, value: unknown): RoleStyles[R] | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const s: StateStyle = {};
	set(s, 'color', strictColor(v.color));
	set(s, 'labelColor', strictColor(v.labelColor));
	set(s, 'haloColor', strictColor(v.haloColor));
	set(s, 'haloWidth', strictNumber(v.haloWidth, 0));
	set(s, 'pattern', oneOf(FILL_PATTERN_NAMES, v.pattern));
	set(s, 'patternScale', strictNumber(v.patternScale, ...PATTERN_SCALE_RANGE));
	set(s, 'patternCoverage', strictNumber(v.patternCoverage, ...PATTERN_COVERAGE_RANGE));
	set(s, 'dash', oneOf(DASH_NAMES, v.dash));
	set(s, 'rotation', strictRotation(v.rotation));
	const size = strictNumber(v.size, 0);
	if (size) s.size = size;
	const labelSize = strictNumber(v.labelSize, 0);
	if (labelSize) s.labelSize = labelSize;
	set(s, 'width', strictNumber(v.width, 0));
	set(s, 'labelPosition', oneOf(LABEL_POSITION_NAMES, v.labelPosition));
	set(s, 'visible', strictBoolean(v.visible));
	set(s, 'flat', strictBoolean(v.flat));
	set(s, 'arrowStart', oneOf(ARROW_NAMES, v.arrowStart));
	set(s, 'arrowEnd', oneOf(ARROW_NAMES, v.arrowEnd));
	const arrowSize = strictNumber(v.arrowSize, 0);
	if (arrowSize) s.arrowSize = arrowSize;
	set(s, 'symbol', sanitizeSymbol(v.symbol));
	set(s, 'labelFont', strictString(v.labelFont));
	const fields: readonly string[] = STYLE_ROLE_FIELDS[role];
	const own: StateStyle = Object.fromEntries(Object.entries(s).filter(([key]) => fields.includes(key)));
	const used = withoutUnusedFields(own);
	return Object.keys(used).length > 0 ? (used as RoleStyles[R]) : undefined;
}

/**
 * Whether a style has an arrowhead at an end of the line.
 * @category Styles
 * @internal
 */
export function hasArrow(style: StateStyle | undefined): boolean {
	return (style?.arrowStart ?? 'none') !== 'none' || (style?.arrowEnd ?? 'none') !== 'none';
}

/**
 * Whether a style fills its area with a pattern, not solid.
 * @category Styles
 */
export function hasPattern(style: StateStyle | undefined): boolean {
	return (style?.pattern ?? 'solid') !== 'solid';
}

/**
 * A style without the fields that have no effect: the size of arrowheads without one, and the
 * size and the coverage of a pattern without one.
 * @category Styles
 * @internal
 */
export function withoutUnusedFields(style: StateStyle): StateStyle {
	let used = style;
	if (used.arrowSize !== undefined && !hasArrow(used)) {
		const { arrowSize: _arrowSize, ...rest } = used;
		used = rest;
	}
	if ((used.patternScale !== undefined || used.patternCoverage !== undefined) && !hasPattern(used)) {
		const { patternScale: _scale, patternCoverage: _coverage, ...rest } = used;
		used = rest;
	}
	return used;
}

/** Assign `value` to `style[key]` unless it is undefined. */
function set<K extends keyof StateStyle>(style: StateStyle, key: K, value: StateStyle[K] | undefined) {
	if (value !== undefined) style[key] = value;
}

/**
 * Remove fields whose value equals the corresponding default (or is undefined).
 * Returns undefined when nothing remains, so `StateElement.style` stays absent
 * for fully-default styles.
 * @category Styles
 * @internal
 */
export function removeDefaultFields(value: StateStyle, def: StateStyle): StateStyle | undefined {
	const entries = Object.entries(value).filter(([k, v]) => {
		if (v === undefined) return false;
		if (v === (def as Record<string, unknown>)[k]) return false;
		return true;
	});
	if (entries.length === 0) return undefined;
	return Object.fromEntries(entries);
}

// ----- fill (polygon fill, circle fill) -----

/**
 * The opacity of a fill is the alpha of its color. GeoJSON has them apart, as simplestyle does,
 * so other tools read them: the color without alpha, and `fill-opacity`.
 */
export function fillPropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...AREA_DEFAULTS, ...style };
	const { r, g, b, alpha } = parseColor(s.color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	return {
		'fill-color': formatHex({ r, g, b, alpha: 1 }),
		'fill-opacity': Math.round(alpha * 1000) / 1000,
		'fill-pattern': s.pattern,
		// only with a pattern
		'fill-pattern-scale': hasPattern(s) ? s.patternScale : undefined,
		'fill-pattern-coverage': hasPattern(s) ? s.patternCoverage : undefined
	};
}

export function fillStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...AREA_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['fill-color']));
		// the opacity becomes the alpha of the color, also of a color with an alpha of its own
		const opacity = sanitizeNumber(p['fill-opacity'], 0, 1);
		if (opacity !== undefined && opacity < 1) {
			const color = parseColor(s.color ?? AREA_DEFAULTS.color)!;
			s.color = formatHex({ ...color, alpha: color.alpha * opacity });
		}
		set(s, 'pattern', oneOf(FILL_PATTERN_NAMES, p['fill-pattern']));
		set(s, 'patternScale', sanitizeNumber(p['fill-pattern-scale'], ...PATTERN_SCALE_RANGE));
		set(s, 'patternCoverage', sanitizeNumber(p['fill-pattern-coverage'], ...PATTERN_COVERAGE_RANGE));
	}
	return removeDefaultFields(withoutUnusedFields(s), AREA_DEFAULTS);
}

// ----- the outline of an area, and a line: both are strokes in GeoJSON -----

/** What a line and an outline share. */
function strokeProps(s: Pick<StateStyle, 'color' | 'dash' | 'width'>): GeoJSON.GeoJsonProperties {
	return { 'stroke-color': s.color, 'stroke-style': s.dash, 'stroke-width': s.width };
}

function strokeFromProps(s: StateStyle, p: GeoJSON.GeoJsonProperties) {
	if (!p) return;
	set(s, 'color', sanitizeColor(p['stroke-color']));
	set(s, 'dash', oneOf(DASH_NAMES, p['stroke-style']));
	set(s, 'width', sanitizeNumber(p['stroke-width'], 0));
}

export function outlinePropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...OUTLINE_DEFAULTS, ...style };
	return { ...strokeProps(s), 'stroke-visibility': s.visible };
}

export function outlineStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...OUTLINE_DEFAULTS };
	strokeFromProps(s, p);
	if (p) set(s, 'visible', sanitizeBoolean(p['stroke-visibility']));
	return removeDefaultFields(s, OUTLINE_DEFAULTS);
}

/** A line has no `stroke-visibility`: it is always visible. */
export function linePropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...LINE_DEFAULTS, ...style };
	return {
		...strokeProps(s),
		'stroke-arrow-start': s.arrowStart,
		'stroke-arrow-end': s.arrowEnd,
		// only with an arrowhead
		'stroke-arrow-size': hasArrow(s) ? s.arrowSize : undefined
	};
}

export function lineStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...LINE_DEFAULTS };
	strokeFromProps(s, p);
	if (p) {
		set(s, 'arrowStart', oneOf(ARROW_NAMES, p['stroke-arrow-start']));
		set(s, 'arrowEnd', oneOf(ARROW_NAMES, p['stroke-arrow-end']));
		const arrowSize = sanitizeNumber(p['stroke-arrow-size'], 0);
		if (arrowSize) s.arrowSize = arrowSize;
	}
	return removeDefaultFields(withoutUnusedFields(s), LINE_DEFAULTS);
}

// ----- symbol (marker) -----

/**
 * The label of a marker, as a field of the element: `{ label }`, or nothing for none. It can have
 * several lines, each ended by a line feed (also in a text of Windows).
 */
export function labelOf(value: unknown): { label?: string } {
	const label = strictString(value)?.replace(/\r\n?/g, '\n');
	return label ? { label } : {};
}

export function symbolPropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...MARKER_DEFAULTS, ...style };
	return {
		'symbol-color': s.color,
		'symbol-halo-width': s.haloWidth,
		'symbol-rotation': s.rotation,
		'symbol-size': s.size,
		'symbol-pattern': s.symbol,
		'symbol-label-position': s.labelPosition,
		'symbol-label-color': s.labelColor,
		'symbol-label-size': s.labelSize,
		// none: the font of the labels of the background map
		'symbol-label-font': s.labelFont || undefined,
		'symbol-halo-color': s.haloColor,
		// only of a flat marker
		'symbol-flat': s.flat || undefined
	};
}

export function symbolStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...MARKER_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['symbol-color']));
		set(s, 'haloWidth', sanitizeNumber(p['symbol-halo-width'], 0));
		set(s, 'rotation', sanitizeRotation(p['symbol-rotation']));
		set(s, 'size', sanitizeNumber(p['symbol-size'], 0));
		set(s, 'labelPosition', oneOf(LABEL_POSITION_NAMES, p['symbol-label-position']));
		set(s, 'labelColor', sanitizeColor(p['symbol-label-color']));
		const labelSize = sanitizeNumber(p['symbol-label-size'], 0);
		if (labelSize) s.labelSize = labelSize;
		set(s, 'haloColor', sanitizeColor(p['symbol-halo-color']));
		set(s, 'symbol', sanitizeSymbol(p['symbol-pattern']));
		set(s, 'labelFont', sanitizeString(p['symbol-label-font']));
		set(s, 'flat', sanitizeBoolean(p['symbol-flat']));
	}
	return removeDefaultFields(s, MARKER_DEFAULTS);
}

// ----- popup (all elements) -----

/** The popup text as the `description` property, like in simplestyle and KML. */
export function popupFromProps(p: GeoJSON.GeoJsonProperties): StatePopup | undefined {
	const text = sanitizeString(p?.description);
	return text?.trim() ? { text } : undefined;
}

// ----- visible area -----

/**
 * The decimal places of a coordinate, in degrees: 0.00001° is about 1 m, and the finest step of
 * the coordinates of a link. A map has no finer coordinates, in none of its forms.
 * @category Map state
 */
export const COORDINATE_DIGITS = 5;

const COORDINATE_STEPS = 10 ** COORDINATE_DIGITS;

/** The map ends at this latitude, north and south. */
const MAX_LATITUDE = 90;

/**
 * A longitude or a latitude with `COORDINATE_DIGITS` decimal places.
 * @category Map state
 */
export function roundCoordinate(value: number): number {
	// + 0: not -0, e.g. of -0.000001
	return Math.round(value * COORDINATE_STEPS) / COORDINATE_STEPS + 0;
}

/**
 * A valid area: four numbers, west < east and south < north, within the latitudes of the map. Its
 * sides have `COORDINATE_DIGITS` decimal places.
 * @category Map state
 */
export function sanitizeBounds(value: unknown): Bounds | undefined {
	if (!Array.isArray(value) || value.length !== 4) return undefined;
	if (!value.every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
	const [west, south, east, north] = (value as number[]).map(roundCoordinate);
	if (!(west < east && south < north && south >= -90 && north <= 90 && west >= -180 && east <= 180)) return undefined;
	return [west, south, east, north];
}

/** A rotation of the map in degrees, normalized to (-180, 180]. */
export function sanitizeBearing(value: unknown): number | undefined {
	const n = strictNumber(value);
	if (n === undefined) return undefined;
	const bearing = ((n % 360) + 360) % 360;
	return bearing > 180 ? bearing - 360 : bearing;
}

/**
 * A valid frame, with its valid parts: without an invalid area, and without the parts that have
 * their default value (north at the top, looking straight down).
 * Undefined if nothing is left, which is the frame of a map without one.
 * @category Map state
 */
export function sanitizeFrame(value: unknown): StateFrame | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const v = value as Record<string, unknown>;
	const frame: StateFrame = {};
	const bounds = sanitizeBounds(v.bounds);
	if (bounds) frame.bounds = bounds;
	const bearing = sanitizeBearing(v.bearing);
	if (bearing) frame.bearing = bearing;
	const pitch = strictNumber(v.pitch, 0, MAX_PITCH);
	if (pitch) frame.pitch = pitch;
	return Object.keys(frame).length > 0 ? frame : undefined;
}

// ----- background map -----

/**
 * The width of the halo of the labels of each base map, if the background does not set one.
 * @category Background map
 * @internal
 */
export const BACKGROUND_HALO_WIDTHS = { vector: 2, satellite: 1 } as const;

/**
 * The settings of the background map that have the same default on both base maps.
 * @category Background map
 */
export const BACKGROUND_DEFAULTS = {
	base: 'vector',
	theme: 'colorful',
	streets: true,
	borders: true,
	labels: 'normal',
	language: 'user',
	font: 'noto_sans_regular',
	labelSize: 1,
	hillshade: false,
	terrain: false,
	buildings: 'flat'
} as const;

/**
 * The colors of the background map as they are: no change.
 * @category Background map
 */
export const BACKGROUND_COLOR_DEFAULTS = { saturation: 0, black: 0, white: 1 } as const;

/**
 * A valid background with its valid settings, without those that have their default value.
 * Undefined if nothing is left, which is the default background. The `options` are not checked,
 * since they belong to `@versatiles/style`.
 * @category Background map
 */
export function sanitizeBackground(value: unknown): StateBackground | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const v = value as Record<string, unknown>;
	const background: StateBackground = {};
	const D = BACKGROUND_DEFAULTS;

	const base = oneOf(BACKGROUND_BASES, v.base) ?? D.base;
	if (base !== D.base) background.base = base;
	const theme = strictString(v.theme);
	if (theme && theme !== D.theme) background.theme = theme;
	if (strictBoolean(v.streets) === false) background.streets = false;
	if (strictBoolean(v.borders) === false) background.borders = false;
	const labels = oneOf(BACKGROUND_LABELS, v.labels);
	if (labels && labels !== D.labels) background.labels = labels;
	const language = strictString(v.language);
	if (language && language !== D.language) background.language = language;
	const font = strictString(v.font);
	if (font && font !== D.font) background.font = font;
	const labelSize = strictNumber(v.labelSize, 0);
	if (labelSize && labelSize !== D.labelSize) background.labelSize = labelSize;
	const haloWidth = strictNumber(v.haloWidth, 0);
	if (haloWidth !== undefined && haloWidth !== BACKGROUND_HALO_WIDTHS[base]) background.haloWidth = haloWidth;
	if (strictBoolean(v.labelsOnTop)) background.labelsOnTop = true;

	if (typeof v.colors === 'object' && v.colors !== null) {
		const c = v.colors as Record<string, unknown>;
		const colors: StateBackgroundColors = {};
		const saturation = strictNumber(c.saturation, -1, 1);
		if (saturation) colors.saturation = saturation;
		const black = strictNumber(c.black, -1, 1);
		if (black) colors.black = black;
		const white = strictNumber(c.white, 0, 2);
		if (white !== undefined && white !== BACKGROUND_COLOR_DEFAULTS.white) colors.white = white;
		if (Object.keys(colors).length > 0) background.colors = colors;
	}

	if (strictBoolean(v.hillshade)) background.hillshade = true;
	if (strictBoolean(v.terrain)) background.terrain = true;
	if (oneOf(BACKGROUND_BUILDINGS, v.buildings) === 'extruded') background.buildings = 'extruded';

	if (typeof v.options === 'object' && v.options !== null && !Array.isArray(v.options)) {
		if (Object.keys(v.options).length > 0) background.options = v.options as Record<string, unknown>;
	}
	return Object.keys(background).length > 0 ? background : undefined;
}

// ----- legend -----

/**
 * The values of a legend that are not stored: entries below each other, a sans-serif font,
 * neither bold nor italic. Its position is one of the viewer, see `VIEWER_DEFAULTS`.
 */
/** A legend entry of the type, with the valid fields of its styles. */
function sanitizeLegendEntry(
	type: StateLegendEntry['type'],
	style: unknown,
	outlineStyle: unknown,
	label: string
): StateLegendEntry {
	const styles = (s: unknown, role: StyleRoleName) => {
		const sanitized = sanitizeStyle(role, s);
		return sanitized ? { [role === 'outline' ? 'outlineStyle' : 'style']: sanitized } : {};
	};
	switch (type) {
		case 'marker':
			return { type, ...styles(style, 'marker'), label };
		case 'line':
			return { type, ...styles(style, 'line'), label };
		case 'area':
			// only areas have an outline
			return { type, ...styles(style, 'area'), ...styles(outlineStyle, 'outline'), label };
	}
}

/** @category Legend */
export const LEGEND_DEFAULTS = {
	layout: 'vertical',
	font: 'sans-serif',
	bold: false,
	italic: false,
	theme: 'light'
} as const;

/**
 * The legend without the fields that have their default value, as the base64 string stores it, so
 * a legend is the same whether it comes from a link, a file or the editor.
 * @category Legend
 * @internal
 */
export function removeLegendDefaults(legend: StateLegend): StateLegend {
	const result = { ...legend };
	for (const key of Object.keys(LEGEND_DEFAULTS) as (keyof typeof LEGEND_DEFAULTS)[]) {
		if (result[key] === LEGEND_DEFAULTS[key]) delete result[key];
	}
	return result;
}

/** A valid legend, or undefined. Invalid entries (e.g. without a type or a color) are skipped. */
export function sanitizeLegend(value: unknown): StateLegend | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { layout, font, bold, italic, theme, entries } = value as Record<string, unknown>;
	if (!Array.isArray(entries)) return undefined;

	const legend: StateLegend = { entries: [] };
	if (LEGEND_LAYOUTS.includes(layout as StateLegend['layout'] & string)) {
		legend.layout = layout as StateLegend['layout'];
	}
	if (LEGEND_FONTS.includes(font as StateLegend['font'] & string)) {
		legend.font = font as StateLegend['font'];
	}
	if (bold === true) legend.bold = true;
	if (italic === true) legend.italic = true;
	if (LEGEND_THEMES.includes(theme as StateLegend['theme'] & string)) {
		legend.theme = theme as StateLegend['theme'];
	}
	for (const entry of entries) {
		if (typeof entry !== 'object' || entry === null) continue;
		const e = entry as Record<string, unknown>;
		const label = strictString(e.label) ?? '';
		const type = LEGEND_ENTRY_TYPES.find((t) => t === e.type);
		if (!type) continue;
		legend.entries.push(sanitizeLegendEntry(type, e.style, e.outlineStyle, label));
	}
	return removeLegendDefaults(legend);
}

// ----- labels of markers -----

/**
 * A zoom level from which the labels of markers are shown, with one decimal place, above 0 and up
 * to 24, else undefined. Other numbers are rounded to one decimal place.
 */
export function sanitizeLabelMinZoom(value: unknown): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
	const zoom = Math.round(value * 10) / 10;
	return zoom > 0 && zoom <= 24 ? zoom : undefined;
}

/** The settings of the labels that differ from the defaults, or undefined if none does. */
export function sanitizeLabels(value: unknown): StateLabels | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const labels: StateLabels = {};
	if (v.overlap === 'hide') labels.overlap = 'hide';
	const minZoom = sanitizeLabelMinZoom(v.minZoom);
	if (minZoom !== undefined) labels.minZoom = minZoom;
	return Object.keys(labels).length > 0 ? labels : undefined;
}

// ----- viewer -----

/**
 * What the viewer shows if the map does not say: no search, the zoom buttons at the top right, the
 * legend at the bottom left, no scale bar, no other buttons; its viewers can move the map and
 * zoom, but not rotate or tilt it, without limits (`minZoom` and `maxZoom` have no default); an
 * embedded map leaves the wheel to its page.
 * @category Viewer
 */
export const VIEWER_DEFAULTS = {
	search: 'none',
	navigation: 'top-right',
	zoomButtons: true,
	legend: 'bottom-left',
	scale: 'none',
	reset: false,
	fullscreen: false,
	locate: false,
	canPan: true,
	canZoom: true,
	canRotate: false,
	canTilt: false,
	confine: false,
	scrollZoom: 'protected'
} as const;

/**
 * The navigation buttons of the viewer that are off unless the map switches them on. (The buttons
 * for zooming are on unless `zoomButtons` is false; the compass comes with a map that can be turned.)
 * @category Viewer
 * @internal
 */
export const VIEWER_BUTTONS = ['reset', 'fullscreen', 'locate'] as const;

/**
 * The choices of each control of the viewer that has a position: "none", or one of its positions.
 * The navigation buttons are always somewhere; which of them are shown, each of them says.
 * @category Viewer
 * @internal
 */
export const VIEWER_CHOICES = {
	search: ['none', ...SEARCH_POSITIONS],
	navigation: [...NAVIGATION_POSITIONS],
	legend: ['none', ...LEGEND_POSITIONS],
	scale: ['none', ...SCALE_POSITIONS]
} as const;

/**
 * The settings of the viewer without those with their default value, or undefined if all have it.
 * @category Viewer
 * @internal
 */
export function removeViewerDefaults(viewer: StateViewer | undefined): StateViewer | undefined {
	if (!viewer) return undefined;
	const result: StateViewer = { ...viewer };
	for (const key of Object.keys(VIEWER_DEFAULTS) as (keyof typeof VIEWER_DEFAULTS)[]) {
		if (result[key] === undefined || result[key] === VIEWER_DEFAULTS[key]) delete result[key];
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Valid settings of the viewer, without those that have their default value, or undefined if
 * none is left. Invalid values are left out.
 * @category Viewer
 */
export function sanitizeViewer(value: unknown): StateViewer | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const viewer: Record<string, string | boolean | number> = {};
	for (const [key, choices] of Object.entries(VIEWER_CHOICES)) {
		const choice = v[key];
		if ((choices as readonly unknown[]).includes(choice)) viewer[key] = choice as string;
	}
	for (const button of VIEWER_BUTTONS) {
		if (v[button] === true) viewer[button] = true;
	}
	if (v.zoomButtons === false) viewer.zoomButtons = false;
	// what its viewers can do
	if (v.canPan === false) viewer.canPan = false;
	if (v.canZoom === false) viewer.canZoom = false;
	if (strictBoolean(v.canRotate)) viewer.canRotate = true;
	if (strictBoolean(v.canTilt)) viewer.canTilt = true;
	if (strictBoolean(v.confine)) viewer.confine = true;
	// in steps of 0.5; a least zoom above the largest one is the largest one
	const zoom = (value: unknown) => {
		const level = strictNumber(value, 0, MAX_ZOOM);
		return level === undefined ? undefined : Math.round(level * 2) / 2;
	};
	const maxZoom = zoom(v.maxZoom);
	const minZoom = zoom(v.minZoom);
	if (minZoom !== undefined) viewer.minZoom = maxZoom === undefined ? minZoom : Math.min(minZoom, maxZoom);
	if (maxZoom !== undefined) viewer.maxZoom = maxZoom;
	if (v.scrollZoom === 'free') viewer.scrollZoom = 'free';
	return removeViewerDefaults(viewer as StateViewer);
}

// ----- whole maps, e.g. of a .mapjson file -----

/**
 * A 2D position with finite coordinates (any altitude is dropped), or undefined. Its coordinates
 * have `COORDINATE_DIGITS` decimal places, and its latitude is between -90 and 90.
 */
export function sanitizePosition(value: unknown): Position | undefined {
	if (!Array.isArray(value) || value.length < 2) return undefined;
	const [x, y] = value;
	if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	// The latitude on the map: beyond a pole is the pole. The longitude as it is: a line across
	// the date line goes on beyond 180°, and bringing it back would tear the line.
	return [roundCoordinate(x), roundCoordinate(Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, y)))];
}

/** All positions, or undefined if any of them is invalid. */
export function sanitizePositions(value: unknown): Position[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const positions: Position[] = [];
	for (const item of value) {
		const position = sanitizePosition(item);
		if (!position) return undefined;
		positions.push(position);
	}
	return positions;
}

/**
 * The valid parts of a map: its elements that can be drawn, with the valid fields of their styles,
 * a valid frame and valid properties. What a file and a link keep.
 */
export function sanitizeState(value: { elements: unknown[]; frame?: unknown; meta?: unknown }): MapState {
	const state: MapState = { elements: value.elements.map(sanitizeElement).filter((element) => element !== undefined) };
	const frame = sanitizeFrame(value.frame);
	if (frame) state.frame = frame;
	const meta = sanitizeMetadata(value.meta);
	if (meta) state.meta = meta;
	return state;
}

/** The valid properties of the whole map, or undefined if none is. */
export function sanitizeMetadata(value: unknown): StateMetadata | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const meta: StateMetadata = {};
	const background = sanitizeBackground(v.background);
	if (background) meta.background = background;
	const legend = sanitizeLegend(v.legend);
	if (legend) meta.legend = legend;
	const colorScheme = strictString(v.colorScheme);
	if (colorScheme) meta.colorScheme = colorScheme;
	const viewer = sanitizeViewer(v.viewer);
	if (viewer) meta.viewer = viewer;
	const labels = sanitizeLabels(v.labels);
	if (labels) meta.labels = labels;
	const title = strictString(v.title);
	if (title) meta.title = title;
	return Object.keys(meta).length > 0 ? meta : undefined;
}

/** A popup with a text that is not blank, or undefined. */
function sanitizePopup(value: unknown): StatePopup | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const text = strictString((value as Record<string, unknown>).text);
	return text?.trim() ? { text } : undefined;
}

/**
 * An element as the map state has it, with its valid styles and popup, or undefined if it cannot
 * be drawn: e.g. a line of fewer than 2 points, an area of fewer than 3, a circle without a
 * positive radius.
 */
export function sanitizeElement(value: unknown): StateElement | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	let element: StateElement;
	switch (v.type) {
		case 'marker': {
			const point = sanitizePosition(v.point);
			if (!point) return undefined;
			element = { type: 'marker', point, ...labelOf(v.label), style: sanitizeStyle('marker', v.style) };
			break;
		}
		case 'line': {
			const points = sanitizePositions(v.points);
			if (!points || points.length < 2) return undefined;
			element = { type: 'line', points, style: sanitizeStyle('line', v.style) };
			if (strictBoolean(v.smooth)) element.smooth = true;
			break;
		}
		case 'polygon': {
			const points = sanitizePositions(v.points);
			if (!points || points.length < 3) return undefined;
			element = {
				type: 'polygon',
				points,
				style: sanitizeStyle('area', v.style),
				outlineStyle: sanitizeStyle('outline', v.outlineStyle)
			};
			if (strictBoolean(v.smooth)) element.smooth = true;
			break;
		}
		case 'circle': {
			const point = sanitizePosition(v.point);
			const radius = strictNumber(v.radius);
			if (!point || radius === undefined || radius <= 0) return undefined;
			element = {
				type: 'circle',
				point,
				radius,
				style: sanitizeStyle('area', v.style),
				outlineStyle: sanitizeStyle('outline', v.outlineStyle)
			};
			break;
		}
		default:
			return undefined;
	}
	element.popup = sanitizePopup(v.popup);
	// absent, not undefined, like in a decoded state
	for (const key of Object.keys(element) as (keyof StateElement)[]) {
		if (element[key] === undefined) delete element[key];
	}
	return element;
}
