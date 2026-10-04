import { parseColor } from '@versatiles/map-state';

/**
 * A color as MapLibre takes it in a style: "rgb(r,g,b)", or "rgba(r,g,b,a)" with the alpha to three
 * decimals if it is translucent. A color that cannot be parsed stays as it is.
 */
export function cssColor(color: string): string {
	const parsed = parseColor(color);
	if (!parsed) return color;
	const { r, g, b, alpha } = parsed;
	const rgb = [r, g, b].map(Math.round).join(',');
	return alpha === 1 ? `rgb(${rgb})` : `rgba(${rgb},${Math.round(alpha * 1000) / 1000})`;
}
