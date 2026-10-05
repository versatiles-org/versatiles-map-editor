import { parseColor } from './color.js';
import { withoutUnusedFields } from './profile.js';
import type { STYLE_ROLE_FIELDS, StateElement, StateLegendEntry, StateStyle, StyleRoleName } from './types.js';

/** How a field of a style is encoded: values that encode identically are equal, e.g. a halo of 1.04 and 1. */
const ENCODED: { [K in keyof StateStyle]-?: (value: NonNullable<StateStyle[K]>) => unknown } = {
	color: (v) => colorKey(v),
	symbol: (v) => v,
	labelColor: (v) => colorKey(v),
	font: (v) => v,
	size: (v) => Math.round(v * 10),
	labelSize: (v) => Math.round(v * 10),
	labelPosition: (v) => v,
	width: (v) => Math.round(v * 10),
	dash: (v) => v,
	arrowStart: (v) => v,
	arrowEnd: (v) => v,
	arrowSize: (v) => Math.round(v * 10),
	haloWidth: (v) => Math.round(v * 10),
	haloColor: (v) => colorKey(v),
	rotation: (v) => Math.round(v),
	// only "false" is stored, "true" is the default
	visible: (v) => (v === false ? false : undefined),
	pattern: (v) => v,
	patternScale: (v) => Math.round(v * 10),
	patternCoverage: (v) => Math.round(v * 100)
};

/** In a style patch: the next key is that of a field to remove. */
export const STYLE_REMOVE = 'remove';

/**
 * The keys of the fields of a style in the base64 format, by its role: the position in the list,
 * from 1 (0 is the end of a style). The keys are written in an Exp-Golomb code
 * (`STYLE_KEY_PARAMETER`), so the fields that styles of the role change most often come first;
 * fields that belong together (e.g. the arrowheads) stay next to each other. Measured with the
 * examples: of the markers, the sizes have the shorter keys rather than the label position, so
 * that no example gets longer.
 */
export const STYLE_KEYS: {
	[R in StyleRoleName]: readonly ((typeof STYLE_ROLE_FIELDS)[R][number] | typeof STYLE_REMOVE)[];
} = {
	marker: [
		'color',
		'symbol',
		'font',
		'labelColor',
		'labelSize',
		'size',
		'labelPosition',
		'haloWidth',
		'haloColor',
		STYLE_REMOVE,
		'rotation'
	],
	line: ['color', 'width', 'dash', 'arrowStart', 'arrowEnd', 'arrowSize', STYLE_REMOVE],
	area: ['color', 'pattern', 'patternScale', 'patternCoverage', STYLE_REMOVE],
	outline: ['color', 'width', 'visible', 'dash', STYLE_REMOVE]
};

/** The role of the style of an element or of a legend entry of the type (an area also has an outline). */
export function roleOf(type: StateElement['type'] | StateLegendEntry['type']): StyleRoleName {
	return type === 'marker' || type === 'line' ? type : 'area';
}

/** A field of a style with its key in the base64 format, and how its value is encoded. */
export interface StyleField {
	key: number;
	name: keyof StateStyle;
	encoded: (value: never) => unknown;
}

/** The fields of the styles of a role, with their keys. */
export function styleFields(role: StyleRoleName): StyleField[] {
	return STYLE_KEYS[role].flatMap((name, index) =>
		name === STYLE_REMOVE ? [] : [{ key: index + 1, name, encoded: ENCODED[name] as (value: never) => unknown }]
	);
}

/** The key that announces a field to remove, in a style of the role. */
export function styleRemoveKey(role: StyleRoleName): number {
	return STYLE_KEYS[role].indexOf(STYLE_REMOVE) + 1;
}

/**
 * The parameter k of the Exp-Golomb code of the keys of a style patch: the end (0) costs 1 bit, 1
 * and 2 3 bits, 3 to 6 5 bits, 7 to 14 7 bits.
 */
export const STYLE_KEY_PARAMETER = 0;

/** Colors that are written identically have the same key, e.g. "#FF0000" and "#ff0000". */
export function colorKey(color: string): string {
	const parsed = parseColor(color);
	if (!parsed) throw new Error(`Invalid color: ${color}`);
	const { r, g, b, alpha } = parsed;
	return [r, g, b, alpha * 255].map(Math.round).join(',');
}

/** The value of a field as it is encoded, or undefined if the style does not store it. */
export function encodedValue(style: StateStyle, field: StyleField): unknown {
	const value = style[field.name];
	return value == null ? undefined : field.encoded(value as never);
}

/** A style of the role as it is encoded: styles that encode identically have the same one. */
export function canonical(role: StyleRoleName, style: StateStyle): string {
	const used = withoutUnusedFields(style);
	return role + JSON.stringify(styleFields(role).map((field) => encodedValue(used, field)));
}

/**
 * The parameter k of the Exp-Golomb code of style references: 0 (no reference) costs 1 bit, 1 and 2 (the
 * latest styles) 3 bits, 3 to 6 5 bits.
 */
export const STYLE_REFERENCE_PARAMETER = 0;

/** Styles are referenced by their distance from the end, so the size is limited. */
export const STYLE_HISTORY_SIZE = 32;

/**
 * The styles written or read so far, so a style can refer to a similar earlier
 * one. Writer and reader update it identically. A style that is used again moves to the end,
 * so frequently used styles have short references.
 */
export class StyleHistory {
	private styles: { role: StyleRoleName; style: StateStyle; key: string }[] = [];

	/** Reference 1 is the latest style; a reference to a style of another role is none. */
	get(ref: number, role: StyleRoleName): StateStyle | undefined {
		const entry = ref >= 1 ? this.styles[this.styles.length - ref] : undefined;
		return entry?.role === role ? entry.style : undefined;
	}

	/** Whether reference `ref` is to a style of the role, which a style of the role can refer to. */
	isOfRole(ref: number, role: StyleRoleName): boolean {
		return ref >= 1 && this.styles[this.styles.length - ref]?.role === role;
	}

	get length(): number {
		return this.styles.length;
	}

	remember(role: StyleRoleName, style: StateStyle) {
		const key = canonical(role, style);
		this.styles = this.styles.filter((s) => s.key !== key);
		this.styles.push({ role, style, key });
		if (this.styles.length > STYLE_HISTORY_SIZE) this.styles.shift();
	}
}
