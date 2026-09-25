/** A color with channels 0…255 and an alpha of 0…1. */
export interface RGBA {
	r: number;
	g: number;
	b: number;
	alpha: number;
}

/**
 * Parse a CSS color: "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", "rgb()", "rgba()", "hsl()",
 * "hsla()" (with commas or spaces, and "/ alpha") or "transparent". Returns undefined otherwise,
 * e.g. for named colors.
 */
export function parseColor(value: string): RGBA | undefined {
	const text = value.trim().toLowerCase();
	if (text === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };

	const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
	if (hex) {
		let digits = hex[1];
		if (digits.length <= 4) digits = digits.replace(/./g, (c) => c + c);
		const n = (i: number) => parseInt(digits.slice(i, i + 2), 16);
		return { r: n(0), g: n(2), b: n(4), alpha: digits.length === 8 ? n(6) / 255 : 1 };
	}

	const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(text);
	if (!fn) return undefined;
	const args = fn[2].split(/\s*[,/]\s*|\s+/).filter(Boolean);
	if (args.length !== 3 && args.length !== 4) return undefined;
	const alpha = args.length === 4 ? parseValue(args[3], 1) : 1;
	if (alpha === undefined) return undefined;

	if (fn[1].startsWith('rgb')) {
		const [r, g, b] = args.slice(0, 3).map((a) => parseValue(a, 255));
		if (r === undefined || g === undefined || b === undefined) return undefined;
		return { r: clamp(r, 255), g: clamp(g, 255), b: clamp(b, 255), alpha: clamp(alpha, 1) };
	}

	const h = parseFloat(args[0]);
	const s = parseValue(args[1], 1);
	const l = parseValue(args[2], 1);
	if (!Number.isFinite(h) || s === undefined || l === undefined) return undefined;
	const [r, g, b] = hslToRgb(h, clamp(s, 1), clamp(l, 1));
	return { r, g, b, alpha: clamp(alpha, 1) };
}

/** A number, or a percentage of `max`. */
function parseValue(value: string, max: number): number | undefined {
	const percent = value.endsWith('%');
	const n = Number(percent ? value.slice(0, -1) : value);
	if (!Number.isFinite(n)) return undefined;
	return percent ? (n / 100) * max : n;
}

function clamp(value: number, max: number): number {
	return Math.min(max, Math.max(0, value));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const a = s * Math.min(l, 1 - l);
		return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
	};
	return [f(0), f(8), f(4)];
}

/** "#RRGGBB", or "#RRGGBBAA" for a transparent color. */
export function formatHex({ r, g, b, alpha }: RGBA): string {
	const hex = (v: number) => Math.round(clamp(v, 255)).toString(16).padStart(2, '0').toUpperCase();
	const a = Math.round(clamp(alpha, 1) * 255);
	return '#' + hex(r) + hex(g) + hex(b) + (a < 255 ? hex(a) : '');
}
