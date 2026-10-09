import {
	AREA_DEFAULTS,
	LINE_DEFAULTS,
	OUTLINE_DEFAULTS,
	MARKER_DEFAULTS,
	sanitizeStyle,
	type StateStyle
} from '@versatiles/map-state';

/**
 * What a style styles: a marker (its symbol and label), the area of a polygon or a circle, a line,
 * or the outline of an area. A line can have arrowheads, an outline cannot: it has no ends.
 */
export type StyleRole = 'symbol' | 'fill' | 'line' | 'outline';

/** Every field of each role with its default: what a style of the role is without any field set. */
export const ROLE_DEFAULTS = {
	symbol: MARKER_DEFAULTS,
	fill: AREA_DEFAULTS,
	line: LINE_DEFAULTS,
	outline: OUTLINE_DEFAULTS
} as const;

type Complete<R extends StyleRole> = StateStyle & (typeof ROLE_DEFAULTS)[R];

/** The style with every field of its role, the missing ones with their defaults, e.g. to draw it. */
export function completeStyle<R extends StyleRole>(role: R, style?: StateStyle): Complete<R> {
	return { ...ROLE_DEFAULTS[role], ...style } as Complete<R>;
}

/**
 * The style as it is stored: without the fields that have their default, and without those that
 * have no effect (the size of arrowheads without one, arrowheads on an outline, and whether a
 * line is visible). Undefined if no field is left.
 */
export function storedStyle(role: StyleRole, style: StateStyle): StateStyle | undefined {
	// as the format has a style of the role, which names the roles of markers and areas otherwise
	return sanitizeStyle(role === 'symbol' ? 'marker' : role === 'fill' ? 'area' : role, style);
}
