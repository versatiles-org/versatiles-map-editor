/** Number of colors in the palette. */
export const PALETTE_SIZE = 16;

/**
 * The colors used in the map, so they can easily be reused: most recently used first,
 * then the remaining colors of the map, newest element first.
 */
export class ColorPalette {
	/** The id of the color scheme of the map. Undefined for the default scheme. */
	public scheme: string | undefined = $state(undefined);
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
		const used = this.getUsedColors().map((c) => c.toLowerCase());
		const isUsed = new Set(used);
		// Colors that were picked but are no longer used (e.g. after undo) are not offered
		const colors = new Set(this.recent.filter((c) => isUsed.has(c)));
		// then each color at its newest element
		for (let i = used.length - 1; i >= 0 && colors.size < PALETTE_SIZE; i--) colors.add(used[i]);
		return [...colors].slice(0, PALETTE_SIZE);
	}
}
