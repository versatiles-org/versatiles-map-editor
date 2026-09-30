import { parseColor } from '@versatiles/map-state';

/**
 * A color without its opacity, as the layers read it, e.g. "rgb(255,0,0)", and its opacity (0…1)
 * on its own, e.g. for "icon-opacity", which also fades the halo, unlike an opacity in the color.
 * An unreadable color is opaque black.
 */
export function splitOpacity(value: string): { color: string; opacity: number } {
	const { r, g, b, alpha } = parseColor(value) ?? { r: 0, g: 0, b: 0, alpha: 1 };
	return { color: `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`, opacity: alpha };
}
