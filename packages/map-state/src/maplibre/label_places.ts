import type { LabelPositionName } from '../types.js';
import type { SymbolInfo } from './types.js';

/** A side or a corner of a label, as MapLibre's `text-anchor` names them. */
export type TextAnchor =
	'center' | 'left' | 'right' | 'bottom' | 'top' | 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';

// The distance of the label from the center of a symbol of 32×32 pixels, in ems, in the direction of its anchor
const LABEL_OFFSET = 0.7;
// The same distance to a corner of the label, on the diagonal
const CORNER_OFFSET = LABEL_OFFSET * Math.SQRT1_2;
// The pixels of an image per em of its label, which have the same scale (`size`)
const EM = 16;

/**
 * Where the image of a symbol is, in ems of its label: the shift of its center from the point
 * (dx, dy), and how much larger than 32×32 pixels its half width and height are (ex, ey). E.g. a
 * pin of 32×38 pixels stands on the point: [0, -1.1875, 0, 0.1875].
 */
export type IconBox = [number, number, number, number];
const NO_BOX: IconBox = [0, 0, 0, 0];

export function iconBox(symbol: SymbolInfo | undefined): IconBox {
	if (!symbol) return NO_BOX;
	const { width, height, center } = symbol;
	// in ems from pixels rounded to hundredths, and without -0, since the box is part of the name of
	// the label place
	const em = (pixels: number) => Math.round(pixels * 100) / 100 / EM + 0;
	return [em((0.5 - center[0]) * width), em((0.5 - center[1]) * height), em(width / 2 - EM), em(height / 2 - EM)];
}

/** The suffix of the name of a label place for an image, "" for one of 32×32 pixels on the point. */
function boxSuffix(box: IconBox): string {
	return box.every((value) => value === 0) ? '' : '@' + box.join(',');
}

/** The possible places of a label around an image, see `LABEL_PLACES`. */
function placesAround([dx, dy, ex, ey]: IconBox): Record<string, (TextAnchor | [number, number])[]> {
	const offsets: Record<TextAnchor, [number, number]> = {
		center: [dx, dy],
		left: [dx + LABEL_OFFSET + ex, dy],
		right: [dx - LABEL_OFFSET - ex, dy],
		top: [dx, dy + LABEL_OFFSET + ey],
		bottom: [dx, dy - LABEL_OFFSET - ey],
		// the corner of the label at the corner of the image, e.g. its bottom left corner above right of it
		'bottom-left': [dx + CORNER_OFFSET + ex, dy - CORNER_OFFSET - ey],
		'bottom-right': [dx - CORNER_OFFSET - ex, dy - CORNER_OFFSET - ey],
		'top-left': [dx + CORNER_OFFSET + ex, dy + CORNER_OFFSET + ey],
		'top-right': [dx - CORNER_OFFSET - ex, dy + CORNER_OFFSET + ey]
	};
	const withOffsets = (anchors: TextAnchor[]) => anchors.flatMap((anchor) => [anchor, offsets[anchor]]);
	const sides = ['left', 'right', 'top', 'bottom'] as const;
	const corners = ['bottom-left', 'top-left', 'bottom-right', 'top-right'] as const;
	return {
		// the sides first, then the corners
		auto: withOffsets([...sides, ...corners]),
		center: withOffsets(['center']),
		...Object.fromEntries([...sides, ...corners].map((anchor) => [anchor, withOffsets([anchor])]))
	};
}

/**
 * The possible places of a label with their offsets, by their name:
 * the chosen side or corner, the first one that fits ("auto"), or on the point ("center", for
 * markers without image). The layer looks them up, since features cannot have array properties.
 * These are for images of 32×32 pixels on the point; `labelPlaceTable` adds the others.
 */
export const LABEL_PLACES = placesAround(NO_BOX);

/**
 * The label places for all images of the symbols: around the image, e.g. beside the head of
 * a pin instead of its tip. The names of other images than those of `LABEL_PLACES` end with
 * their box, e.g. "left@0,-1.1875,0,0.1875".
 */
export function labelPlaceTable(symbols: SymbolInfo[]): Record<string, (TextAnchor | [number, number])[]> {
	const table = { ...LABEL_PLACES };
	for (const symbol of symbols) {
		const box = iconBox(symbol);
		const suffix = boxSuffix(box);
		if (!suffix || table['auto' + suffix]) continue;
		for (const [name, places] of Object.entries(placesAround(box))) table[name + suffix] = places;
	}
	return table;
}

// The text anchor of each position of the label: the side of the label next to the symbol ("auto"
// has variable anchors)
const anchors: Record<LabelPositionName, TextAnchor | undefined> = {
	auto: undefined,
	right: 'left',
	left: 'right',
	top: 'bottom',
	bottom: 'top',
	'top-right': 'bottom-left',
	'top-left': 'bottom-right',
	'bottom-right': 'top-left',
	'bottom-left': 'top-right'
};

/** The name of the place of a label at a position around the image of a symbol, see `LABEL_PLACES`. */
export function labelPlace(position: LabelPositionName, symbol: SymbolInfo | undefined): string {
	const anchor = anchors[position];
	const suffix = boxSuffix(iconBox(symbol));
	if (anchor) return anchor + suffix;
	// a label without symbol is on the point
	return symbol == null ? 'center' : 'auto' + suffix;
}
