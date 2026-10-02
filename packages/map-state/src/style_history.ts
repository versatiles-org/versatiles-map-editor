import { parseColor } from './color.js';
import type { StateStyle } from './types.js';

/**
 * The fields of a style with their key in the base64 format, and the value as it is encoded:
 * values that encode identically are equal, e.g. a halo of 1.04 and 1. Key 2 was the opacity of
 * fills, which older strings have; it is the alpha of the color now (see `OLD_OPACITY_KEY`).
 */
export const STYLE_FIELDS: { key: number; name: keyof StateStyle; encoded: (value: never) => unknown }[] = [
	{ key: 1, name: 'halo', encoded: (v: number) => Math.round(v * 10) },
	{ key: 3, name: 'pattern', encoded: (v: number) => v },
	{ key: 4, name: 'rotate', encoded: (v: number) => v },
	{ key: 5, name: 'size', encoded: (v: number) => Math.round(v * 10) },
	{ key: 6, name: 'width', encoded: (v: number) => Math.round(v * 10) },
	{ key: 7, name: 'align', encoded: (v: number) => v },
	{ key: 8, name: 'color', encoded: (v: string) => colorKey(v) },
	{ key: 9, name: 'label', encoded: (v: string) => v },
	// only "false" is stored, "true" is the default
	{ key: 10, name: 'visible', encoded: (v: boolean) => (v === false ? false : undefined) },
	{ key: 11, name: 'labelColor', encoded: (v: string) => colorKey(v) },
	{ key: 12, name: 'haloColor', encoded: (v: string) => colorKey(v) },
	{ key: 13, name: 'symbol', encoded: (v: string) => v }
];

/** The key of the opacity of fills in older strings, which the reader turns into the alpha of the color. */
export const OLD_OPACITY_KEY = 2;

/** In a style patch: the next 4 bits are the key of a field to remove. */
export const STYLE_REMOVE_KEY = 15;

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
	return JSON.stringify(STYLE_FIELDS.map((field) => encodedValue(style, field)));
}

/** A style without its label, which an element stores by itself; a copy. */
export function withoutLabel(style: StateStyle): StateStyle {
	const { label: _label, ...rest } = style;
	return rest;
}

/**
 * The order of the Exp-Golomb code of style references: 0 (no reference) costs 1 bit, 1 and 2 (the
 * latest styles) 3 bits, 3 to 6 5 bits.
 */
export const STYLE_REFERENCE_ORDER = 0;

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
