export interface RGB {
	r: number; // 0…255
	g: number;
	b: number;
}

export interface HSV {
	h: number; // hue in degrees, 0…360
	s: number; // saturation, 0…1
	v: number; // value (brightness), 0…1
}

/** Parse "#rgb", "#rrggbb" or "#rrggbbaa". The alpha channel is ignored. Returns undefined if invalid. */
export function parseHex(hex: string): RGB | undefined {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
	if (!m) return undefined;
	let digits = m[1];
	if (digits.length === 3) digits = digits.replace(/./g, (c) => c + c);
	const n = parseInt(digits.slice(0, 6), 16);
	return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
}

/** Format as lowercase "#rrggbb". Channels are rounded and clamped. */
export function toHex({ r, g, b }: RGB): string {
	const channel = (c: number) =>
		Math.max(0, Math.min(255, Math.round(c)))
			.toString(16)
			.padStart(2, '0');
	return '#' + channel(r) + channel(g) + channel(b);
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const d = max - Math.min(r, g, b);
	let h = 0;
	if (d > 0) {
		if (max === r) h = ((g - b) / d + 6) % 6;
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
	}
	return { h: h * 60, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
	const f = (n: number) => {
		const k = (n + h / 60) % 6;
		return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
	};
	return { r: f(5), g: f(3), b: f(1) };
}
