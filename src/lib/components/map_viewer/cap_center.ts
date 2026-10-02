/** Where the browser put the first line of a text, in pixels from the top of the page. */
export interface LinePlace {
	/** The middle of the line box. */
	middle: number;
	baseline: number;
	/** The height of the capitals of the font. */
	capHeight: number;
}

/**
 * How far a text must move down so that the middle of its capitals is the middle of its line: a
 * line centers the whole height of the font (ascent and descent), whose capitals are not in its
 * middle. Negative: up.
 */
export function capCenterShift({ middle, baseline, capHeight }: LinePlace): number {
	return middle - (baseline - capHeight / 2);
}

/**
 * Where the browser put the first line of the text element, measured: its baseline by an empty
 * inline block on it, the height of the capitals by a canvas with its font. Without the
 * translation `applied`, which the element has now. Undefined if it cannot be measured, e.g. in
 * tests without layout.
 */
export function measureLine(text: HTMLElement, applied: number): LinePlace | undefined {
	const style = getComputedStyle(text);
	const context = document.createElement('canvas').getContext('2d');
	if (!context) return undefined;
	context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	const capHeight = context.measureText('H').actualBoundingBoxAscent;
	const probe = document.createElement('span');
	probe.style.cssText = 'display: inline-block; width: 0; height: 0; vertical-align: baseline';
	text.prepend(probe);
	const baseline = probe.getBoundingClientRect().bottom - applied;
	probe.remove();
	const top = text.getBoundingClientRect().top - applied;
	const lineHeight = parseFloat(style.lineHeight);
	if (!capHeight || !lineHeight) return undefined;
	return { middle: top + lineHeight / 2, baseline, capHeight };
}
