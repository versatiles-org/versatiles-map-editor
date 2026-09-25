import { Color } from '@versatiles/style';
import type { StateBackground, StateLegend, StateLegendEntry, StatePopup, StateStyle } from './types.js';
import { LEGEND_FONTS, LEGEND_LAYOUTS, LEGEND_POSITIONS } from './types.js';
import { symbolName, symbolIndexByName } from './symbols.js';

// ---------------------------------------------------------------------------
// Style vocabulary of the serialization format.
//
// The editor keeps the live values in MapLayer stores and projects them to two
// shapes: a numeric, default-stripped `StateStyle` (for State/base64) and a
// human-readable GeoJSON property bag. This module owns the mapping between the
// two so the codec is the single source of truth: the editor's MapLayer classes
// take their default styles and enum names from here.
// ---------------------------------------------------------------------------

type Defaults<K extends keyof StateStyle> = Readonly<Required<Pick<StateStyle, K>>>;

export const FILL_DEFAULTS: Defaults<'color' | 'opacity' | 'pattern'> = { color: '#ff0000', opacity: 1, pattern: 0 };
export const LINE_DEFAULTS: Defaults<'color' | 'pattern' | 'visible' | 'width'> = {
	color: '#ff0000',
	pattern: 0,
	visible: true,
	width: 2
};
export const SYMBOL_DEFAULTS: Defaults<'color' | 'rotate' | 'size' | 'halo' | 'pattern' | 'label' | 'align'> = {
	color: '#ff0000',
	rotate: 0,
	size: 1,
	halo: 1,
	pattern: 38,
	label: '',
	align: 0
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
	try {
		return Color.parse(value).asHex().toLowerCase();
	} catch {
		return undefined;
	}
}

export function sanitizeString(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	return undefined;
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

export function fillPropsFromStyle(style?: StateStyle): GeoJSON.GeoJsonProperties {
	const s = { ...FILL_DEFAULTS, ...style };
	return {
		'fill-color': s.color,
		'fill-opacity': s.opacity,
		'fill-pattern': nameOf(FILL_PATTERN_NAMES, s.pattern)
	};
}

export function fillStyleFromProps(p: GeoJSON.GeoJsonProperties): StateStyle | undefined {
	const s: StateStyle = { ...FILL_DEFAULTS };
	if (p) {
		set(s, 'color', sanitizeColor(p['fill-color']));
		set(s, 'opacity', sanitizeNumber(p['fill-opacity'], 0, 1));
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
		'symbol-pattern': symbolName(s.pattern!),
		'symbol-label': s.label,
		'symbol-label-align': nameOf(LABEL_ALIGN_NAMES, s.align)
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
		if (typeof p['symbol-pattern'] === 'string') set(s, 'pattern', symbolIndexByName(p['symbol-pattern']));
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
export function sanitizeBackground(value: unknown): StateBackground | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { builder, options } = value as Record<string, unknown>;
	if (builder !== 'osm' && builder !== 'satellite') return undefined;
	if (typeof options !== 'object' || options === null || Array.isArray(options)) return undefined;
	return { builder, options: options as Record<string, unknown> };
}

// ----- legend -----

/** A valid legend, or undefined. Invalid entries (e.g. without a color) are skipped. */
export function sanitizeLegend(value: unknown): StateLegend | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const { position, layout, font, entries } = value as Record<string, unknown>;
	if (!Array.isArray(entries)) return undefined;

	const legend: StateLegend = { entries: [] };
	if (LEGEND_POSITIONS.includes(position as StateLegend['position'] & string)) {
		legend.position = position as StateLegend['position'];
	}
	if (LEGEND_LAYOUTS.includes(layout as StateLegend['layout'] & string)) {
		legend.layout = layout as StateLegend['layout'];
	}
	if (LEGEND_FONTS.includes(font as StateLegend['font'] & string)) {
		legend.font = font as StateLegend['font'];
	}
	for (const entry of entries) {
		if (typeof entry !== 'object' || entry === null) continue;
		const e = entry as Record<string, unknown>;
		const color = sanitizeColor(e.color);
		if (!color) continue;
		const result: StateLegendEntry = { color, label: sanitizeString(e.label) ?? '' };
		const symbol = sanitizeNumber(e.symbol, 0);
		if (symbol !== undefined) result.symbol = Math.round(symbol);
		legend.entries.push(result);
	}
	return legend;
}
