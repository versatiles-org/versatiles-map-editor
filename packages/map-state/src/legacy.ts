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

/** The metadata as older versions wrote it: the search as a flag, and the position in the legend. */
type OldMetadata = StateMetadata & { search?: boolean; legend?: { position?: string } };

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
 * A map state of an older version, e.g. of a saved file, as the current version has it: the
 * opacity of a fill becomes the alpha of its color, the search and the position of the legend
 * become settings of the viewer, and the entries of the legend markers or areas.
 */
export function upgradeState(state: MapState): MapState {
	const meta = withoutOldLegendEntries(withoutOldViewer(state.meta as OldMetadata | undefined));
	return {
		...state,
		...(meta && { meta }),
		elements: state.elements.map((element) =>
			'style' in element && element.style ? { ...element, style: withoutOldOpacity(element.style) } : element
		)
	};
}
