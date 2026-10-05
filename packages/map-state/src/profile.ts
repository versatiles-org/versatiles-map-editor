import type * as GeoJSON from 'geojson';
import { formatHex, parseColor } from './color.js';
import {
	ARROW_NAMES,
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
	type Bounds,
	type MapState,
	type Position,
	type StateBackground,
	type StateElement,
	type StateLegend,
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

export const FILL_DEFAULTS: Defaults<'color' | 'pattern' | 'patternScale' | 'patternCoverage'> = {
	color: '#ff0000',
	pattern: 'solid',
	patternScale: 1,
	patternCoverage: 0.5
};
/** The range of the size of a pattern, a factor (`patternScale`). */
export const PATTERN_SCALE_RANGE = [0.5, 4] as const;
/** The range of the share of an area that a pattern covers (`patternCoverage`). */
export const PATTERN_COVERAGE_RANGE = [0.05, 0.95] as const;
export const LINE_DEFAULTS: Defaults<'color' | 'dash' | 'visible' | 'width'> = {
	color: '#ff0000',
	dash: 'solid',
	visible: true,
	width: 2
};
/** The arrowheads of lines, apart from `LINE_DEFAULTS`, which outlines share. */
export const ARROW_DEFAULTS: Defaults<'arrowStart' | 'arrowEnd' | 'arrowSize'> = {
	arrowStart: 'none',
	arrowEnd: 'none',
	arrowSize: 3
};
export const SYMBOL_DEFAULTS: Defaults<
	| 'color'
	| 'rotate'
	| 'size'
	| 'halo'
	| 'symbol'
	| 'label'
	| 'labelPosition'
	| 'labelColor'
	| 'labelSize'
	| 'font'
	| 'haloColor'
> = {
	color: '#ff0000',
	rotate: 0,
	size: 1,
	labelSize: 1,
	halo: 1,
	// the flag: the symbol of markers that name none (new markers of the editor get a pin)
	symbol: 'base:icon-embassy',
	label: '',
	labelPosition: 'auto',
	labelColor: '#000000',
	// the font of the labels of the background map
	font: '',
	haloColor: '#ffffff'
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

/**
 * A style as JSON has it (e.g. of a legend entry in GeoJSON): only its valid fields, or undefined
 * if none is.
 */
export function sanitizeStyle(value: unknown): StateStyle | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const v = value as Record<string, unknown>;
	const s: StateStyle = {};
	set(s, 'color', sanitizeColor(v.color));
	set(s, 'labelColor', sanitizeColor(v.labelColor));
	set(s, 'haloColor', sanitizeColor(v.haloColor));
	set(s, 'halo', sanitizeNumber(v.halo, 0));
	set(s, 'pattern', oneOf(FILL_PATTERN_NAMES, v.pattern));
	set(s, 'patternScale', sanitizeNumber(v.patternScale, ...PATTERN_SCALE_RANGE));
	set(s, 'patternCoverage', sanitizeNumber(v.patternCoverage, ...PATTERN_COVERAGE_RANGE));
	set(s, 'dash', oneOf(STROKE_STYLE_NAMES, v.dash));
	set(s, 'rotate', sanitizeRotation(v.rotate));
	const size = sanitizeNumber(v.size, 0);
	if (size) s.size = size;
	const labelSize = sanitizeNumber(v.labelSize, 0);
	if (labelSize) s.labelSize = labelSize;
	set(s, 'width', sanitizeNumber(v.width, 0));
	set(s, 'labelPosition', oneOf(LABEL_POSITION_NAMES, v.labelPosition));
	set(s, 'label', sanitizeString(v.label));
	set(s, 'visible', sanitizeBoolean(v.visible));
	set(s, 'arrowStart', oneOf(ARROW_NAMES, v.arrowStart));
	set(s, 'arrowEnd', oneOf(ARROW_NAMES, v.arrowEnd));
	const arrowSize = sanitizeNumber(v.arrowSize, 0);
	if (arrowSize) s.arrowSize = arrowSize;
	set(s, 'symbol', sanitizeSymbol(v.symbol));
	set(s, 'font', sanitizeString(v.font));
	const used = withoutUnusedFields(s);
	return Object.keys(used).length > 0 ? used : undefined;
}

/** Whether a style has an arrowhead at an end of the line. */
export function hasArrow(style: StateStyle | undefined): boolean {
	return (style?.arrowStart ?? 'none') !== 'none' || (style?.arrowEnd ?? 'none') !== 'none';
}

/** Whether a style fills its area with a pattern, not solid. */
export function hasPattern(style: StateStyle | undefined): boolean {
	return (style?.pattern ?? 'solid') !== 'solid';
}

/**
 * A style without the fields that have no effect: the size of arrowheads without one, and the
 * size and the coverage of a pattern without one.
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

export function symbolPropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...SYMBOL_DEFAULTS, ...style };
	return {
		'symbol-color': s.color,
		'symbol-halo-width': s.halo,
		'symbol-rotate': s.rotate,
		'symbol-size': s.size,
		'symbol-pattern': s.symbol,
		'symbol-label': s.label,
		'symbol-label-position': s.labelPosition,
		'symbol-label-color': s.labelColor,
		'symbol-label-size': s.labelSize,
		// none: the font of the labels of the background map
		'symbol-label-font': s.font || undefined,
		'symbol-halo-color': s.haloColor
	};
}

export function symbolStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...SYMBOL_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['symbol-color']));
		set(s, 'halo', sanitizeNumber(p['symbol-halo-width'], 0));
		set(s, 'rotate', sanitizeRotation(p['symbol-rotate']));
		set(s, 'size', sanitizeNumber(p['symbol-size'], 0));
		set(s, 'label', sanitizeString(p['symbol-label']));
		set(s, 'labelPosition', oneOf(LABEL_POSITION_NAMES, p['symbol-label-position']));
		set(s, 'labelColor', sanitizeColor(p['symbol-label-color']));
		const labelSize = sanitizeNumber(p['symbol-label-size'], 0);
		if (labelSize) s.labelSize = labelSize;
		set(s, 'haloColor', sanitizeColor(p['symbol-halo-color']));
		set(s, 'symbol', sanitizeSymbol(p['symbol-pattern']));
		set(s, 'font', sanitizeString(p['symbol-label-font']));
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

/** A valid frame: four numbers, west < east and south < north, within the latitudes of the map. */
export function sanitizeFrame(value: unknown): Bounds | undefined {
	if (!Array.isArray(value) || value.length !== 4) return undefined;
	const [west, south, east, north] = value;
	if (![west, south, east, north].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
	if (!(west < east && south < north && south >= -90 && north <= 90 && west >= -180 && east <= 180)) return undefined;
	return [west, south, east, north];
}

// ----- background map -----

/** A valid background, or undefined. The options are not checked, since they belong to `@versatiles/style`. */
export function sanitizeBackground(value: unknown): StateBackground | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { builder, options } = value as Record<string, unknown>;
	if (builder !== 'osm' && builder !== 'satellite') return undefined;
	if (typeof options !== 'object' || options === null || Array.isArray(options)) return undefined;
	return { builder, options: options as Record<string, unknown> };
}

// ----- legend -----

/**
 * The values of a legend that are not stored: entries below each other, a sans-serif font,
 * neither bold nor italic. Its position is one of the viewer, see `VIEWER_DEFAULTS`.
 */
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
		const style = sanitizeStyle(e.style);
		// only areas have an outline
		const strokeStyle = type === 'polygon' ? sanitizeStyle(e.strokeStyle) : undefined;
		legend.entries.push({ type, ...(style && { style }), ...(strokeStyle && { strokeStyle }), label });
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

// ----- viewer -----

/** What the viewer shows if the map does not say: no search, the zoom buttons at the top right, the legend at the bottom left. */
export const VIEWER_DEFAULTS = { search: 'none', navigation: 'top-right', legend: 'bottom-left' } as const;

/** The choices of each control of the viewer: "none", or one of its positions. */
export const VIEWER_CHOICES = {
	search: ['none', ...SEARCH_POSITIONS],
	navigation: ['none', ...NAVIGATION_POSITIONS],
	legend: ['none', ...LEGEND_POSITIONS]
} as const;

/** The settings of the viewer without those with their default value, or undefined if all have it. */
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

/** A 2D position with finite coordinates (any altitude is dropped), or undefined. */
export function sanitizePosition(value: unknown): Position | undefined {
	if (!Array.isArray(value) || value.length < 2) return undefined;
	const [x, y] = value;
	if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return [x, y];
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

/** The camera of the editor: a center and a radius in meters, or undefined. */
export function sanitizeView(value: unknown): MapState['view'] {
	if (typeof value !== 'object' || value === null) return undefined;
	const { center, radius } = value as Record<string, unknown>;
	const position = sanitizePosition(center);
	const meters = sanitizeNumber(radius, 0);
	return position && meters !== undefined ? { center: position, radius: meters } : undefined;
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
	if (v.labelOverlap === 'hide') meta.labelOverlap = 'hide';
	const labelMinZoom = sanitizeLabelMinZoom(v.labelMinZoom);
	if (labelMinZoom !== undefined) meta.labelMinZoom = labelMinZoom;
	if (v.mapLabelsOnTop === true) meta.mapLabelsOnTop = true;
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
			element = { type: 'marker', point, style: sanitizeStyle(v.style) };
			break;
		}
		case 'line': {
			const points = sanitizePositions(v.points);
			if (!points || points.length < 2) return undefined;
			element = { type: 'line', points, style: sanitizeStyle(v.style) };
			if (sanitizeBoolean(v.smooth)) element.smooth = true;
			break;
		}
		case 'polygon': {
			const points = sanitizePositions(v.points);
			if (!points || points.length < 3) return undefined;
			element = { type: 'polygon', points, style: sanitizeStyle(v.style), strokeStyle: sanitizeStyle(v.strokeStyle) };
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
				style: sanitizeStyle(v.style),
				strokeStyle: sanitizeStyle(v.strokeStyle)
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
