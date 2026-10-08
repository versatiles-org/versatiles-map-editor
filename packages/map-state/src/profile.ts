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
	SEARCH_POSITIONS,
	STROKE_STYLE_NAMES,
	MAX_PITCH,
	type Bounds,
	type StateFrame,
	type Position,
	type StateBackground,
	type StateBackgroundColors,
	type StateElement,
	type StateLabels,
	type AreaStyle,
	type LineStyle,
	type MarkerStyle,
	type OutlineStyle,
	STYLE_ROLE_FIELDS,
	type StateLegend,
	type StateLegendEntry,
	type StyleRoleName,
	type StateMetadata,
	type StatePopup,
	type StateStyle,
	type StateViewer
} from './types.js';

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
export const FILL_DEFAULTS: Defaults<'color' | 'pattern' | 'patternScale' | 'patternCoverage'> = {
	color: '#ff0000',
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
/** @category Styles */
export const LINE_DEFAULTS: Defaults<'color' | 'dash' | 'visible' | 'width'> = {
	color: '#ff0000',
	dash: 'solid',
	visible: true,
	width: 2
};
/**
 * The arrowheads of lines, apart from `LINE_DEFAULTS`, which outlines share.
 * @category Styles
 */
export const ARROW_DEFAULTS: Defaults<'arrowStart' | 'arrowEnd' | 'arrowSize'> = {
	arrowStart: 'none',
	arrowEnd: 'none',
	arrowSize: 3
};
/** @category Styles */
export const SYMBOL_DEFAULTS: Defaults<
	| 'color'
	| 'rotation'
	| 'size'
	| 'haloWidth'
	| 'symbol'
	| 'labelPosition'
	| 'labelColor'
	| 'labelSize'
	| 'font'
	| 'haloColor'
	| 'flat'
> = {
	color: '#ff0000',
	rotation: 0,
	size: 1,
	labelSize: 1,
	haloWidth: 1,
	// the flag: the symbol of markers that name none (new markers of the editor get a pin)
	symbol: 'base:icon-embassy',
	labelPosition: 'auto',
	labelColor: '#000000',
	// the font of the labels of the background map
	font: '',
	haloColor: '#ffffff',
	// upright, facing the viewer
	flat: false
};

/** The value, if it is one of the names of the table; undefined for anything else. */
function oneOf<T extends string>(table: readonly T[], value: unknown): T | undefined {
	return (table as readonly unknown[]).includes(value) ? (value as T) : undefined;
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

/** A rotation in whole degrees, normalized to [-180, 180). */
export function sanitizeRotation(value: unknown): number | undefined {
	const n = sanitizeNumber(value);
	if (n === undefined) return undefined;
	return ((((Math.round(n) + 180) % 360) + 360) % 360) - 180;
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
 * A style of the role as JSON has it (e.g. of a legend entry in GeoJSON): only its valid fields
 * of that role, or undefined if none is. Fields of other roles are left out, e.g. `arrowStart` of
 * a marker.
 */
export function sanitizeStyle<R extends StyleRoleName>(role: R, value: unknown): RoleStyles[R] | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const s: StateStyle = {};
	set(s, 'color', sanitizeColor(v.color));
	set(s, 'labelColor', sanitizeColor(v.labelColor));
	set(s, 'haloColor', sanitizeColor(v.haloColor));
	set(s, 'haloWidth', sanitizeNumber(v.haloWidth, 0));
	set(s, 'pattern', oneOf(FILL_PATTERN_NAMES, v.pattern));
	set(s, 'patternScale', sanitizeNumber(v.patternScale, ...PATTERN_SCALE_RANGE));
	set(s, 'patternCoverage', sanitizeNumber(v.patternCoverage, ...PATTERN_COVERAGE_RANGE));
	set(s, 'dash', oneOf(STROKE_STYLE_NAMES, v.dash));
	set(s, 'rotation', sanitizeRotation(v.rotation));
	const size = sanitizeNumber(v.size, 0);
	if (size) s.size = size;
	const labelSize = sanitizeNumber(v.labelSize, 0);
	if (labelSize) s.labelSize = labelSize;
	set(s, 'width', sanitizeNumber(v.width, 0));
	set(s, 'labelPosition', oneOf(LABEL_POSITION_NAMES, v.labelPosition));
	set(s, 'visible', sanitizeBoolean(v.visible));
	set(s, 'flat', sanitizeBoolean(v.flat));
	set(s, 'arrowStart', oneOf(ARROW_NAMES, v.arrowStart));
	set(s, 'arrowEnd', oneOf(ARROW_NAMES, v.arrowEnd));
	const arrowSize = sanitizeNumber(v.arrowSize, 0);
	if (arrowSize) s.arrowSize = arrowSize;
	set(s, 'symbol', sanitizeSymbol(v.symbol));
	set(s, 'font', sanitizeString(v.font));
	const fields: readonly string[] = STYLE_ROLE_FIELDS[role];
	const own: StateStyle = Object.fromEntries(Object.entries(s).filter(([key]) => fields.includes(key)));
	const used = withoutUnusedFields(own);
	return Object.keys(used).length > 0 ? (used as RoleStyles[R]) : undefined;
}

/**
 * Whether a style has an arrowhead at an end of the line.
 * @category Styles
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
	const s = { ...FILL_DEFAULTS, ...style };
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
	const s: StateStyle = { ...FILL_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['fill-color']));
		// the opacity becomes the alpha of the color, also of a color with an alpha of its own
		const opacity = sanitizeNumber(p['fill-opacity'], 0, 1);
		if (opacity !== undefined && opacity < 1) {
			const color = parseColor(s.color ?? FILL_DEFAULTS.color)!;
			s.color = formatHex({ ...color, alpha: color.alpha * opacity });
		}
		set(s, 'pattern', oneOf(FILL_PATTERN_NAMES, p['fill-pattern']));
		set(s, 'patternScale', sanitizeNumber(p['fill-pattern-scale'], ...PATTERN_SCALE_RANGE));
		set(s, 'patternCoverage', sanitizeNumber(p['fill-pattern-coverage'], ...PATTERN_COVERAGE_RANGE));
	}
	return removeDefaultFields(withoutUnusedFields(s), FILL_DEFAULTS);
}

// ----- stroke / line (line, polygon stroke, circle stroke) -----

export function strokePropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...LINE_DEFAULTS, ...style };
	return {
		'stroke-color': s.color,
		'stroke-style': s.dash,
		'stroke-width': s.width,
		'stroke-visibility': s.visible
	};
}

export function strokeStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...LINE_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['stroke-color']));
		set(s, 'dash', oneOf(STROKE_STYLE_NAMES, p['stroke-style']));
		set(s, 'width', sanitizeNumber(p['stroke-width'], 0));
		set(s, 'visible', sanitizeBoolean(p['stroke-visibility']));
	}
	return removeDefaultFields(s, LINE_DEFAULTS);
}

// ----- line: the stroke and the arrowheads -----

export function linePropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...ARROW_DEFAULTS, ...style };
	return {
		...strokePropsFromStyle(style),
		'stroke-arrow-start': s.arrowStart,
		'stroke-arrow-end': s.arrowEnd,
		// only with an arrowhead
		'stroke-arrow-size': hasArrow(s) ? s.arrowSize : undefined
	};
}

export function lineStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...strokeStyleFromProps(p) };
	if (p) {
		set(s, 'arrowStart', oneOf(ARROW_NAMES, p['stroke-arrow-start']));
		set(s, 'arrowEnd', oneOf(ARROW_NAMES, p['stroke-arrow-end']));
		const arrowSize = sanitizeNumber(p['stroke-arrow-size'], 0);
		if (arrowSize) s.arrowSize = arrowSize;
	}
	return removeDefaultFields(withoutUnusedFields(s), ARROW_DEFAULTS);
}

// ----- symbol (marker) -----

/** The label of a marker, as a field of the element: `{ label }`, or nothing for none. */
export function labelOf(value: unknown): { label?: string } {
	const label = sanitizeString(value);
	return label ? { label } : {};
}

export function symbolPropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...SYMBOL_DEFAULTS, ...style };
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
		'symbol-label-font': s.font || undefined,
		'symbol-halo-color': s.haloColor,
		// only of a flat marker
		'symbol-flat': s.flat || undefined
	};
}

export function symbolStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...SYMBOL_DEFAULTS };
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
		set(s, 'font', sanitizeString(p['symbol-label-font']));
		set(s, 'flat', sanitizeBoolean(p['symbol-flat']));
	}
	return removeDefaultFields(s, SYMBOL_DEFAULTS);
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
	const n = sanitizeNumber(value);
	if (n === undefined) return undefined;
	const bearing = ((n % 360) + 360) % 360;
	return bearing > 180 ? bearing - 360 : bearing;
}

/**
 * A valid frame, with its valid parts: without an invalid area, and without the parts that have
 * their default value (north at the top, looking straight down; viewers can move the map and zoom,
 * but not rotate or tilt it).
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
	const pitch = sanitizeNumber(v.pitch, 0, MAX_PITCH);
	if (pitch) frame.pitch = pitch;
	if (v.canPan === false) frame.canPan = false;
	if (v.canZoom === false) frame.canZoom = false;
	if (sanitizeBoolean(v.canRotate)) frame.canRotate = true;
	if (sanitizeBoolean(v.canTilt)) frame.canTilt = true;
	return Object.keys(frame).length > 0 ? frame : undefined;
}

// ----- background map -----

/**
 * The width of the halo of the labels of each base map, if the background does not set one.
 * @category Background map
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
	const theme = sanitizeString(v.theme);
	if (theme && theme !== D.theme) background.theme = theme;
	if (sanitizeBoolean(v.streets) === false) background.streets = false;
	if (sanitizeBoolean(v.borders) === false) background.borders = false;
	const labels = oneOf(BACKGROUND_LABELS, v.labels);
	if (labels && labels !== D.labels) background.labels = labels;
	const language = sanitizeString(v.language);
	if (language && language !== D.language) background.language = language;
	const font = sanitizeString(v.font);
	if (font && font !== D.font) background.font = font;
	const labelSize = sanitizeNumber(v.labelSize, 0);
	if (labelSize && labelSize !== D.labelSize) background.labelSize = labelSize;
	const haloWidth = sanitizeNumber(v.haloWidth, 0);
	if (haloWidth !== undefined && haloWidth !== BACKGROUND_HALO_WIDTHS[base]) background.haloWidth = haloWidth;

	if (typeof v.colors === 'object' && v.colors !== null) {
		const c = v.colors as Record<string, unknown>;
		const colors: StateBackgroundColors = {};
		const saturation = sanitizeNumber(c.saturation, -1, 1);
		if (saturation) colors.saturation = saturation;
		const black = sanitizeNumber(c.black, -1, 1);
		if (black) colors.black = black;
		const white = sanitizeNumber(c.white, 0, 2);
		if (white !== undefined && white !== BACKGROUND_COLOR_DEFAULTS.white) colors.white = white;
		if (Object.keys(colors).length > 0) background.colors = colors;
	}

	if (sanitizeBoolean(v.hillshade)) background.hillshade = true;
	if (sanitizeBoolean(v.terrain)) background.terrain = true;
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
	strokeStyle: unknown,
	label: string
): StateLegendEntry {
	const styles = (s: unknown, role: StyleRoleName) => {
		const sanitized = sanitizeStyle(role, s);
		return sanitized ? { [role === 'outline' ? 'strokeStyle' : 'style']: sanitized } : {};
	};
	switch (type) {
		case 'marker':
			return { type, ...styles(style, 'marker'), label };
		case 'line':
			return { type, ...styles(style, 'line'), label };
		case 'area':
			// only areas have an outline
			return { type, ...styles(style, 'area'), ...styles(strokeStyle, 'outline'), label };
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
		const label = sanitizeString(e.label) ?? '';
		const type = LEGEND_ENTRY_TYPES.find((t) => t === e.type);
		if (!type) continue;
		legend.entries.push(sanitizeLegendEntry(type, e.style, e.strokeStyle, label));
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
	if (v.mapOnTop === true) labels.mapOnTop = true;
	return Object.keys(labels).length > 0 ? labels : undefined;
}

// ----- viewer -----

/**
 * What the viewer shows if the map does not say: no search, the zoom buttons at the top right, the legend at the bottom left.
 * @category Viewer
 */
export const VIEWER_DEFAULTS = { search: 'none', navigation: 'top-right', legend: 'bottom-left' } as const;

/**
 * The choices of each control of the viewer: "none", or one of its positions.
 * @category Viewer
 */
export const VIEWER_CHOICES = {
	search: ['none', ...SEARCH_POSITIONS],
	navigation: ['none', ...NAVIGATION_POSITIONS],
	legend: ['none', ...LEGEND_POSITIONS]
} as const;

/**
 * The settings of the viewer without those with their default value, or undefined if all have it.
 * @category Viewer
 */
export function removeViewerDefaults(viewer: StateViewer | undefined): StateViewer | undefined {
	if (!viewer) return undefined;
	const result: StateViewer = { ...viewer };
	for (const key of Object.keys(VIEWER_DEFAULTS) as (keyof StateViewer)[]) {
		if (result[key] === undefined || result[key] === VIEWER_DEFAULTS[key]) delete result[key];
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

/** Valid settings of the viewer, without defaults, or undefined. Invalid values are left out. */
export function sanitizeViewer(value: unknown): StateViewer | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const viewer: Record<string, string> = {};
	for (const [key, choices] of Object.entries(VIEWER_CHOICES)) {
		const choice = (value as Record<string, unknown>)[key];
		if ((choices as readonly unknown[]).includes(choice)) viewer[key] = choice as string;
	}
	return removeViewerDefaults(viewer as StateViewer);
}

// ----- whole maps, e.g. of a .mapjson file -----

/**
 * A 2D position with finite coordinates (any altitude is dropped), or undefined. Its coordinates
 * have `COORDINATE_DIGITS` decimal places.
 */
export function sanitizePosition(value: unknown): Position | undefined {
	if (!Array.isArray(value) || value.length < 2) return undefined;
	const [x, y] = value;
	if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return [roundCoordinate(x), roundCoordinate(y)];
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

/** The valid properties of the whole map, or undefined if none is. */
export function sanitizeMetadata(value: unknown): StateMetadata | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const meta: StateMetadata = {};
	const background = sanitizeBackground(v.background);
	if (background) meta.background = background;
	const legend = sanitizeLegend(v.legend);
	if (legend) meta.legend = legend;
	const colorScheme = sanitizeString(v.colorScheme);
	if (colorScheme) meta.colorScheme = colorScheme;
	const viewer = sanitizeViewer(v.viewer);
	if (viewer) meta.viewer = viewer;
	const labels = sanitizeLabels(v.labels);
	if (labels) meta.labels = labels;
	const title = sanitizeString(v.title);
	if (title) meta.title = title;
	return Object.keys(meta).length > 0 ? meta : undefined;
}

/** A popup with a text that is not blank, or undefined. */
function sanitizePopup(value: unknown): StatePopup | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const text = sanitizeString((value as Record<string, unknown>).text);
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
			if (sanitizeBoolean(v.smooth)) element.smooth = true;
			break;
		}
		case 'polygon': {
			const points = sanitizePositions(v.points);
			if (!points || points.length < 3) return undefined;
			element = {
				type: 'polygon',
				points,
				style: sanitizeStyle('area', v.style),
				strokeStyle: sanitizeStyle('outline', v.strokeStyle)
			};
			if (sanitizeBoolean(v.smooth)) element.smooth = true;
			break;
		}
		case 'circle': {
			const point = sanitizePosition(v.point);
			const radius = sanitizeNumber(v.radius);
			if (!point || radius === undefined || radius <= 0) return undefined;
			element = {
				type: 'circle',
				point,
				radius,
				style: sanitizeStyle('area', v.style),
				strokeStyle: sanitizeStyle('outline', v.strokeStyle)
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
