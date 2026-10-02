import { formatHex, parseColor } from './color.js';
import { FILL_DEFAULTS, oldLegendEntry, sanitizeViewer } from './profile.js';
import type { MapState, StateLegendEntry, StateMetadata, StateStyle } from './types.js';

/** A style as older versions wrote it: a fill with an opacity of its own. */
export type OldStyle = StateStyle & { opacity?: number };

/** The style, with the opacity of an older version as the alpha of its color (a fill's color). */
export function withoutOldOpacity({ opacity, ...style }: OldStyle): StateStyle {
	if (opacity == null) return style;
	const color = parseColor(style.color ?? FILL_DEFAULTS.color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	return { ...style, color: formatHex({ ...color, alpha: color.alpha * opacity }) };
}

/**
 * The metadata as older versions wrote it: the search as a flag, the position in the legend, and
 * one font for the labels of all markers.
 */
export type OldMetadata = StateMetadata & { search?: boolean; legend?: { position?: string }; labelFont?: string };

/** The metadata, with the search and the position of the legend of an older version in the viewer. */
function withoutOldViewer(meta: OldMetadata | undefined): StateMetadata | undefined {
	if (!meta || (meta.search === undefined && meta.legend?.position === undefined)) return meta;
	const { search, legend, ...rest } = meta;
	const upgraded: StateMetadata = { ...rest };
	if (legend) {
		const kept = { ...legend };
		delete kept.position;
		upgraded.legend = kept as StateMetadata['legend'];
	}
	const viewer = sanitizeViewer({
		...(search === true && { search: 'top-left' }),
		...(legend?.position !== undefined && { legend: legend.position }),
		...meta.viewer
	});
	if (viewer) upgraded.viewer = viewer;
	else delete upgraded.viewer;
	return upgraded;
}

/** An entry of the legend as older versions wrote it: a color, and maybe a symbol. */
type OldLegendEntry = { color: string; symbol?: string; label?: string };

/** The metadata with the entries of the legend of an older version as marker or area entries. */
function withoutOldLegendEntries(meta: StateMetadata | undefined): StateMetadata | undefined {
	const entries = meta?.legend?.entries as (StateLegendEntry | OldLegendEntry)[] | undefined;
	if (!meta?.legend || !entries?.some((entry) => !('type' in entry))) return meta;
	const upgraded = entries.map((entry) =>
		'type' in entry ? entry : oldLegendEntry(entry.color, entry.symbol, entry.label ?? '')
	);
	return { ...meta, legend: { ...meta.legend, entries: upgraded } };
}

/**
 * A map state of an older version, e.g. of a saved file or a link, as the current version has it:
 * the opacity of a fill becomes the alpha of its color, the search and the position of the legend
 * become settings of the viewer, the entries of the legend markers or areas, and the label font of
 * all markers the font of each marker.
 */
export function upgradeState(state: MapState): MapState {
	const old = state.meta as OldMetadata | undefined;
	const labelFont = old?.labelFont;
	let meta = withoutOldLegendEntries(withoutOldViewer(old));
	if (meta && 'labelFont' in meta) {
		const { labelFont: _labelFont, ...rest } = meta as OldMetadata;
		meta = rest;
	}
	const upgraded: MapState = {
		...state,
		elements: state.elements.map((element) => {
			if (element.style) element = { ...element, style: withoutOldOpacity(element.style) };
			// the label font of all markers of an older version: of each marker without one
			if (labelFont && element.type === 'marker' && element.style?.font === undefined) {
				element = { ...element, style: { ...element.style, font: labelFont } };
			}
			return element;
		})
	};
	if (meta && Object.keys(meta).length > 0) upgraded.meta = meta;
	else delete upgraded.meta;
	return upgraded;
}
