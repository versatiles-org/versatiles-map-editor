import { formatHex, parseColor } from './color.js';
import { FILL_DEFAULTS } from './profile.js';
import type { MapState, StateStyle } from './types.js';

/** A style as older versions wrote it: a fill with an opacity of its own. */
export type OldStyle = StateStyle & { opacity?: number };

/** The style, with the opacity of an older version as the alpha of its color (a fill's color). */
export function withoutOldOpacity({ opacity, ...style }: OldStyle): StateStyle {
	if (opacity == null) return style;
	const color = parseColor(style.color ?? FILL_DEFAULTS.color) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	return { ...style, color: formatHex({ ...color, alpha: color.alpha * opacity }) };
}

/**
 * A map state of an older version, e.g. of a saved file, as the current version has it: the
 * opacity of a fill becomes the alpha of its color.
 */
export function upgradeState(state: MapState): MapState {
	return {
		...state,
		elements: state.elements.map((element) =>
			'style' in element && element.style ? { ...element, style: withoutOldOpacity(element.style) } : element
		)
	};
}
