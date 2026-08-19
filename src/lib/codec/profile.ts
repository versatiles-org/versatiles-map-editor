import type { StateStyle } from './types.js';
import { symbolName, symbolIndexByName } from './symbols.js';

// ---------------------------------------------------------------------------
// Style vocabulary of the serialization format.
//
// The editor keeps the live values in MapLayer stores and projects them to two
// shapes: a numeric, default-stripped `StateStyle` (for State/base64) and a
// human-readable GeoJSON property bag. This module owns the mapping between the
// two so the codec is the single source of truth. The default styles and enum
// name tables here must match the editor's MapLayer definitions — `profile.test`
// guards against drift.
// ---------------------------------------------------------------------------

export const FILL_DEFAULTS: StateStyle = { color: '#ff0000', opacity: 1, pattern: 0 };
export const LINE_DEFAULTS: StateStyle = { color: '#ff0000', pattern: 0, visible: true, width: 2 };
export const SYMBOL_DEFAULTS: StateStyle = {
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

/**
 * Remove fields whose value equals the corresponding default (or is undefined),
 * mirroring the editor's `removeDefaultFields`. Returns undefined when nothing
 * remains, so `StateElement.style` stays absent for fully-default styles.
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
		if (p['fill-color'] != null) s.color = p['fill-color'];
		if (p['fill-opacity'] != null) s.opacity = p['fill-opacity'];
		const pattern = indexOf(FILL_PATTERN_NAMES, p['fill-pattern']);
		if (pattern != null) s.pattern = pattern;
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
		if (p['stroke-color'] != null) s.color = p['stroke-color'];
		const pattern = indexOf(STROKE_STYLE_NAMES, p['stroke-style']);
		if (pattern != null) s.pattern = pattern;
		if (p['stroke-width'] != null) s.width = p['stroke-width'];
		if (p['stroke-visibility'] != null) s.visible = p['stroke-visibility'];
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
		if (p['symbol-color'] != null) s.color = p['symbol-color'];
		if (p['symbol-halo-width'] != null) s.halo = p['symbol-halo-width'];
		if (p['symbol-rotate'] != null) s.rotate = p['symbol-rotate'];
		if (p['symbol-size'] != null) s.size = p['symbol-size'];
		if (p['symbol-label'] != null) s.label = p['symbol-label'];
		const align = indexOf(LABEL_ALIGN_NAMES, p['symbol-label-align']);
		if (align != null) s.align = align;
		if (typeof p['symbol-pattern'] === 'string') {
			const pattern = symbolIndexByName(p['symbol-pattern']);
			if (pattern != null) s.pattern = pattern;
		}
	}
	return removeDefaultFields(s, SYMBOL_DEFAULTS);
}
