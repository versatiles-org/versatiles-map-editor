/**
 * An image that a style uses and the sprites of the tile server do not have, as MapLibre's
 * `map.addImage(name, { width, height, data }, { pixelRatio, sdf })` takes it: RGBA pixels, row by
 * row; of an SDF image only the alpha channel counts, as a distance field that the layer colors.
 */
export interface StyleImage {
	width: number;
	height: number;
	data: Uint8Array | Uint8ClampedArray;
	/** Image pixels per pixel of the map. */
	pixelRatio: number;
	sdf: boolean;
}

/** The point of the image that is placed on the point of a marker, e.g. the tip of a pin. */
export type IconAnchor =
	'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** A symbol of the sprite sheets of the tile server, as a marker draws it. */
export interface SymbolInfo {
	/** The image in the map style, e.g. "icons:anchor": the sprite sheet and the name in it. */
	name: string;
	title: string;
	/** Other words for the symbol, e.g. to find it. */
	aliases: string[];
	anchor: IconAnchor;
	/** The size of the image in pixels, at an icon size of 1. */
	width: number;
	height: number;
	/** The point of the image on the point of the marker, as fractions of its width and height. */
	center: [number, number];
}
