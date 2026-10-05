import { parseColor } from './color.js';
import { withoutUnusedFields } from './profile.js';
import type { StateStyle } from './types.js';

/**
 * The fields of a style with their key in the base64 format, and the value as it is encoded:
 * values that encode identically are equal, e.g. a halo of 1.04 and 1. The keys are written in an
 * Exp-Golomb code (`STYLE_KEY_PARAMETER`), so small keys are short: the fields that styles change
 * most often have the smallest keys.
 */
export const STYLE_FIELDS: { key: number; name: keyof StateStyle; encoded: (value: never) => unknown }[] = [
	{ key: 1, name: 'color', encoded: (v: string) => colorKey(v) },
	{ key: 2, name: 'symbol', encoded: (v: string) => v },
	{ key: 3, name: 'labelColor', encoded: (v: string) => colorKey(v) },
	{ key: 4, name: 'font', encoded: (v: string) => v },
	{ key: 5, name: 'size', encoded: (v: number) => Math.round(v * 10) },
	{ key: 6, name: 'labelSize', encoded: (v: number) => Math.round(v * 10) },
	{ key: 7, name: 'labelPosition', encoded: (v: string) => v },
	{ key: 8, name: 'width', encoded: (v: number) => Math.round(v * 10) },
	{ key: 9, name: 'dash', encoded: (v: string) => v },
	{ key: 10, name: 'arrowStart', encoded: (v: string) => v },
	{ key: 11, name: 'arrowEnd', encoded: (v: string) => v },
	{ key: 12, name: 'arrowSize', encoded: (v: number) => Math.round(v * 10) },
	{ key: 13, name: 'halo', encoded: (v: number) => Math.round(v * 10) },
	{ key: 14, name: 'haloColor', encoded: (v: string) => colorKey(v) },
	{ key: 15, name: 'rotate', encoded: (v: number) => Math.round(v) },
	// only "false" is stored, "true" is the default
	{ key: 16, name: 'visible', encoded: (v: boolean) => (v === false ? false : undefined) },
	// the fill pattern of areas, rarer than the dashes of lines
	{ key: 19, name: 'pattern', encoded: (v: string) => v },
	// the size and the coverage of a pattern, only with one
	{ key: 20, name: 'patternScale', encoded: (v: number) => Math.round(v * 10) },
	{ key: 21, name: 'patternCoverage', encoded: (v: number) => Math.round(v * 100) }
];

/**
 * The parameter k of the Exp-Golomb code of the keys of a style patch: the end (0) costs 1 bit, 1
 * and 2 3 bits, 3 to 6 5 bits, 7 to 14 7 bits, 15 to 30 9 bits.
 */
export const STYLE_KEY_PARAMETER = 0;

/** In a style patch: the next key is that of a field to remove. */
export const STYLE_REMOVE_KEY = 17;

/** Colors that are written identically have the same key, e.g. "#FF0000" and "#ff0000". */
export function colorKey(color: string): string {
	const parsed = parseColor(color);
	if (!parsed) throw new Error(`Invalid color: ${color}`);
	const { r, g, b, alpha } = parsed;
	return [r, g, b, alpha * 255].map(Math.round).join(',');
}

/** The value of a field as it is encoded, or undefined if the style does not store it. */
export function encodedValue(style: StateStyle, field: (typeof STYLE_FIELDS)[number]): unknown {
	const value = style[field.name];
	return value == null ? undefined : field.encoded(value as never);
}

/** The fields of a style as they are encoded: styles that encode identically have the same one. */
export function canonical(style: StateStyle): string {
	const used = withoutUnusedFields(style);
	return JSON.stringify(STYLE_FIELDS.map((field) => encodedValue(used, field)));
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
	private styles: StateStyle[] = [];

	/** Reference 1 is the latest style. */
	get(ref: number): StateStyle | undefined {
		return ref >= 1 ? this.styles[this.styles.length - ref] : undefined;
	}

	get length(): number {
		return this.styles.length;
	}

	remember(style: StateStyle) {
		const key = canonical(style);
		this.styles = this.styles.filter((s) => canonical(s) !== key);
		this.styles.push(style);
		if (this.styles.length > STYLE_HISTORY_SIZE) this.styles.shift();
	}
}
