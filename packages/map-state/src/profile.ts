import type * as GeoJSON from 'geojson';
import { formatHex, parseColor } from './color.js';
import type {
	StateBackground,
	StateLegend,
	StateLegendEntry,
	StatePopup,
	StateStyle,
	StateViewer,
	Bounds
} from './types.js';
import { LEGEND_FONTS, LEGEND_LAYOUTS, LEGEND_POSITIONS, NAVIGATION_POSITIONS, SEARCH_POSITIONS } from './types.js';

// ---------------------------------------------------------------------------
// Style vocabulary of the serialization format.
//
// The editor keeps the live values in StylePart stores and projects them to two
// shapes: a numeric, default-stripped `StateStyle` (for State/base64) and a
// human-readable GeoJSON property bag. This module owns the mapping between the
// two so the codec is the single source of truth: the editor's StylePart classes
// take their default styles and enum names from here.
// ---------------------------------------------------------------------------

type Defaults<K extends keyof StateStyle> = Readonly<Required<Pick<StateStyle, K>>>;

export const FILL_DEFAULTS: Defaults<'color' | 'pattern'> = { color: '#ff0000', pattern: 0 };
export const LINE_DEFAULTS: Defaults<'color' | 'pattern' | 'visible' | 'width'> = {
	color: '#ff0000',
	pattern: 0,
	visible: true,
	width: 2
};
export const SYMBOL_DEFAULTS: Defaults<
	'color' | 'rotate' | 'size' | 'halo' | 'symbol' | 'label' | 'align' | 'labelColor' | 'haloColor'
> = {
	color: '#ff0000',
	rotate: 0,
	size: 1,
	halo: 1,
	// the flag: the symbol of markers that name none (new markers of the editor get a pin)
	symbol: 'base:icon-embassy',
	label: '',
	align: 0,
	labelColor: '#000000',
	haloColor: '#ffffff'
};

// index -> name enum tables (the numeric index lives in State, the name in GeoJSON)
export const FILL_PATTERN_NAMES = ['solid', 'diagonal', 'diagonal-thin'];
export const STROKE_STYLE_NAMES = ['solid', 'dashed', 'dotted'];
export const LABEL_ALIGN_NAMES = ['auto', 'right', 'left', 'top', 'bottom'];

function nameOf(table: string[], index: number | undefined): string | undefined {
	if (index == null) return undefined;
	return table[index];
}
function indexOf(table: string[], name: unknown): number | undefined {
	if (typeof name !== 'string') return undefined;
	const index = table.indexOf(name);
	return index < 0 ? undefined : index;
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
		'fill-pattern': nameOf(FILL_PATTERN_NAMES, s.pattern)
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
		set(s, 'pattern', indexOf(FILL_PATTERN_NAMES, p['fill-pattern']));
	}
	return removeDefaultFields(s, FILL_DEFAULTS);
}

// ----- stroke / line (line, polygon stroke, circle stroke) -----

export function strokePropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...LINE_DEFAULTS, ...style };
	return {
		'stroke-color': s.color,
		'stroke-style': nameOf(STROKE_STYLE_NAMES, s.pattern),
		'stroke-width': s.width,
		'stroke-visibility': s.visible
	};
}

export function strokeStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...LINE_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['stroke-color']));
		set(s, 'pattern', indexOf(STROKE_STYLE_NAMES, p['stroke-style']));
		set(s, 'width', sanitizeNumber(p['stroke-width'], 0));
		set(s, 'visible', sanitizeBoolean(p['stroke-visibility']));
	}
	return removeDefaultFields(s, LINE_DEFAULTS);
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
		'symbol-label-align': nameOf(LABEL_ALIGN_NAMES, s.align),
		'symbol-label-color': s.labelColor,
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
		set(s, 'align', indexOf(LABEL_ALIGN_NAMES, p['symbol-label-align']));
		set(s, 'labelColor', sanitizeColor(p['symbol-label-color']));
		set(s, 'haloColor', sanitizeColor(p['symbol-halo-color']));
		set(s, 'symbol', sanitizeSymbol(p['symbol-pattern']));
	}
	return removeDefaultFields(s, SYMBOL_DEFAULTS);
}

// ----- popup (all elements) -----

/** The popup text as the `description` property, like in simplestyle and KML. */
export function popupFromProps(p: GeoJSON.GeoJsonProperties): StatePopup | undefined {
	const text = sanitizeString(p?.description);
	return text?.trim() ? { text } : undefined;
}

// ----- background map -----

/** A valid background, or undefined. The options are not checked, since they belong to `@versatiles/style`. */
/** A valid frame: four numbers, west < east and south < north, within the latitudes of the map. */
export function sanitizeFrame(value: unknown): Bounds | undefined {
	if (!Array.isArray(value) || value.length !== 4) return undefined;
	const [west, south, east, north] = value;
	if (![west, south, east, north].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined;
	if (!(west < east && south < north && south >= -90 && north <= 90 && west >= -180 && east <= 180)) return undefined;
	return [west, south, east, north];
}

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
	italic: false
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

/** A valid legend, or undefined. Invalid entries (e.g. without a color) are skipped. */
export function sanitizeLegend(value: unknown): StateLegend | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { layout, font, bold, italic, entries } = value as Record<string, unknown>;
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
	for (const entry of entries) {
		if (typeof entry !== 'object' || entry === null) continue;
		const e = entry as Record<string, unknown>;
		const color = sanitizeColor(e.color);
		if (!color) continue;
		const result: StateLegendEntry = { color, label: sanitizeString(e.label) ?? '' };
		const symbol = sanitizeSymbol(e.symbol);
		if (symbol) result.symbol = symbol;
		legend.entries.push(result);
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
