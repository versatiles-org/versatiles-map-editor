/**
 * A color of the theme as MapLibre reads it, e.g. `--color-accent-line` at the map: the browser
 * resolves the variable and its color function (e.g. `oklch()`, which MapLibre does not know), and
 * a canvas gives its channels. `fallback` without a browser that can, e.g. in unit tests.
 */
export function themeColor(element: Element, variable: string, fallback: string): string {
	try {
		const value = getComputedStyle(element).getPropertyValue(variable).trim();
		const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		if (!value || !context) return fallback;
		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);
		const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
		return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
	} catch {
		// e.g. the mock of a map, whose container is no element
		return fallback;
	}
}
