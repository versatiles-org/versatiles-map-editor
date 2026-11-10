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
