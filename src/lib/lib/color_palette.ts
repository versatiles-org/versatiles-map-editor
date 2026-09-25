/** Number of colors in the palette. */
export const PALETTE_SIZE = 16;

/**
 * The colors used in the map, so they can easily be reused: most recently used first,
 * then the remaining colors of the map, newest element first.
 */
export class ColorPalette {
	// Colors picked in this session, most recent first
	private recent: string[] = [];
	private readonly getUsedColors: () => string[];

	/** `getUsedColors` returns the colors of all elements, in the order of the elements. */
	constructor(getUsedColors: () => string[]) {
		this.getUsedColors = getUsedColors;
	}

	/** Mark a color as used just now. */
	public use(color: string) {
		color = color.toLowerCase();
		this.recent = [color, ...this.recent.filter((c) => c !== color)];
	}

	public getColors(): string[] {
		const used = new Set(this.getUsedColors().map((c) => c.toLowerCase()));
		// Colors that were picked but are no longer used (e.g. after undo) are not offered
		const colors = this.recent.filter((c) => used.has(c));
		for (const color of [...used].reverse()) {
			if (!colors.includes(color)) colors.push(color);
		}
		return colors.slice(0, PALETTE_SIZE);
	}
}
