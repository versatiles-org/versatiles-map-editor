/** Where a popup is, as the position of its top left corner in the viewport. */
export interface Position {
	x: number;
	y: number;
}

interface Size {
	width: number;
	height: number;
}

interface Rect {
	left: number;
	top: number;
	right: number;
}

/** The distance of a popup to the edges of the viewport and to what it opens next to. */
const MARGIN = 8;

/** The position moved into the viewport, so all of the popup can be seen, or at least its top left. */
export function keepInViewport(position: Position, size: Size, viewport: Size): Position {
	const maxX = Math.max(MARGIN, viewport.width - size.width - MARGIN);
	const maxY = Math.max(MARGIN, viewport.height - size.height - MARGIN);
	return {
		x: Math.min(Math.max(position.x, MARGIN), maxX),
		y: Math.min(Math.max(position.y, MARGIN), maxY)
	};
}

/**
 * Next to an element, e.g. the sidebar: left of it, where the map is, or right of it if there is no
 * room on the left, and at the height of `top`, e.g. of the button that opens the popup.
 */
export function besideElement(element: Rect, top: number, size: Size, viewport: Size): Position {
	let x = element.left - MARGIN - size.width;
	if (x < MARGIN) x = element.right + MARGIN;
	return keepInViewport({ x, y: top }, size, viewport);
}
