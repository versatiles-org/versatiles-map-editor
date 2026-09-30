import type * as maplibregl from 'maplibre-gl';
import { getContext, setContext } from 'svelte';
import { parseColor } from '@versatiles/map-state';

/** Options for drawing a symbol, see `SymbolLibrary.drawSymbol`. */
export interface DrawOptions {
	/** The color of an SDF symbol, black by default. */
	color?: string;
	/** An outline around an SDF symbol in this color, `outlineWidth` canvas pixels wide. */
	outline?: string;
	outlineWidth?: number;
	/**
	 * A halo around the symbol and its outline in this color, `haloWidth` canvas pixels wide: the
	 * color of the background behind it, which separates the symbol from what is around it.
	 */
	halo?: string;
	haloWidth?: number;
	/** Scale the shape to fill the canvas, instead of the whole image with its empty border. */
	crop?: boolean;
}

/** The value of an SDF image on the edge of the shape, and per pixel of distance. */
const SDF_EDGE = 191.25;
const SDF_PER_PIXEL = 32;

/** Draws the symbols of the map's sprites, e.g. into the legend. */
export class SymbolLibrary {
	/** The map with the sprites. Nothing is drawn before it is set. */
	public map: maplibregl.Map | undefined;
	constructor(map?: maplibregl.Map) {
		this.map = map;
	}

	/**
	 * Draw the symbol into the canvas: black, or in `color`, and with an `outline` and a `halo`.
	 * If the sprite is not loaded yet, it is drawn once it is, while the canvas is on the page.
	 */
	drawSymbol(canvas: HTMLCanvasElement, name: string, options: DrawOptions = {}): void {
		this.draw(canvas, name, options, true);
	}

	private draw(canvas: HTMLCanvasElement, name: string, options: DrawOptions, retry: boolean) {
		const map = this.map;
		if (!name || !map) return;

		// throws while the map has no style yet (e.g. a legend in a shared map)
		const image = map.style ? map.getImage(name) : undefined;
		if (!image) {
			// The sprite is not loaded yet: try again when the map has settled, e.g. after it has
			// loaded the style and then the sprite. Only once for a canvas that is not on the page.
			if (retry) map.once('idle', () => this.draw(canvas, name, options, canvas.isConnected === true));
			return;
		}
		const pixels = drawImage(image.data, image.sdf, canvas, options);
		canvas.getContext('2d')!.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
	}
}

const contextKey = Symbol('symbol library');

/**
 * The symbol library of the editor, for the components that draw symbols, e.g. the legend and
 * the symbol selector. MapFrame sets it.
 */
export function getSymbolLibrary(): SymbolLibrary {
	const library = getContext<SymbolLibrary | undefined>(contextKey);
	if (!library) throw new Error('no symbol library: MapFrame sets it, or the context of mount()');
	return library;
}

export function setSymbolLibrary(library: SymbolLibrary): void {
	setContext(contextKey, library);
}

/** The context of `mount()` with the symbol library, e.g. to mount a component in a test. */
export function symbolLibraryContext(library: SymbolLibrary): Map<symbol, SymbolLibrary> {
	return new Map([[contextKey, library]]);
}

/** The pixels of an image, 4 values (red, green, blue, alpha) per pixel, row by row. */
interface Pixels {
	width: number;
	height: number;
	data: ArrayLike<number>;
}

/** Writes the pixel at `i` of the canvas for a point `distance` canvas pixels inside the shape's edge. */
type Painter = (data: Uint8ClampedArray, i: number, distance: number) => void;

/** The pixels of the image drawn into a canvas of the size, as `drawSymbol` describes. */
export function drawImage(
	image: Pixels,
	sdf: boolean,
	{ width, height }: { width: number; height: number },
	options: DrawOptions
): Uint8ClampedArray<ArrayBuffer> {
	const rims = sdfRims(options).reduce((sum, rim) => sum + rim.width, 0);
	const shape = options.crop ? shapeBox(image, sdf) : undefined;
	// the outline, the halo and the antialiasing, in canvas pixels, around the scaled shape
	const { scale, x0, y0 } = placement(image, shape, width, height, rims + 0.5);
	const paint = sdfPainter(options);

	const data = new Uint8ClampedArray(width * height * 4);
	for (let yi = 0; yi < height; yi++) {
		for (let xi = 0; xi < width; xi++) {
			// the center of the canvas pixel in the image
			const x = (xi + 0.5 - x0) / scale - 0.5;
			const y = (yi + 0.5 - y0) / scale - 0.5;
			const i = (yi * width + xi) * 4;
			if (sdf) {
				// the distance to the edge in canvas pixels, positive inside the shape
				paint(data, i, ((interpolate(image, x, y, 3) - SDF_EDGE) / SDF_PER_PIXEL) * scale);
			} else {
				for (let c = 0; c < 4; c++) data[i + c] = interpolate(image, x, y, c);
			}
		}
	}
	return data;
}

/**
 * How the image is placed in the canvas: its scale, and where its top left corner is. The whole
 * image fits the canvas, or the `shape`, with `margin` canvas pixels around it.
 */
function placement(
	image: Pixels,
	shape: Box | undefined,
	width: number,
	height: number,
	margin: number
): { scale: number; x0: number; y0: number } {
	let box: Box = { x: 0, y: 0, width: image.width, height: image.height };
	let scale = Math.min(width / box.width, height / box.height);
	if (shape) {
		scale = Math.min((width - 2 * margin) / shape.width, (height - 2 * margin) / shape.height);
		const m = margin / scale;
		box = { x: shape.x - m, y: shape.y - m, width: shape.width + 2 * m, height: shape.height + 2 * m };
	}
	return {
		scale,
		x0: (width - box.width * scale) / 2 - box.x * scale,
		y0: (height - box.height * scale) / 2 - box.y * scale
	};
}

type RGB = { r: number; g: number; b: number };

/** The outline and the halo around an SDF symbol, from the inside out; without an invalid color. */
function sdfRims(options: DrawOptions): { rgb: RGB; width: number }[] {
	const rims: { rgb: RGB; width: number }[] = [];
	const outline = options.outline ? parseColor(options.outline) : undefined;
	if (outline) rims.push({ rgb: outline, width: options.outlineWidth ?? 1 });
	const halo = options.halo ? parseColor(options.halo) : undefined;
	if (halo) rims.push({ rgb: halo, width: options.haloWidth ?? 1 });
	return rims;
}

/**
 * How an SDF image is painted: in its color, then its outline and its halo around it. Each part
 * covers a pixel as far as it reaches into it, antialiased over one pixel around its edge.
 */
function sdfPainter(options: DrawOptions): Painter {
	const rgb = (options.color && parseColor(options.color)) || { r: 0, g: 0, b: 0 };
	const parts = [{ rgb, width: 0 }, ...sdfRims(options)];
	return (data, i, distance) => {
		let r = 0;
		let g = 0;
		let b = 0;
		// the coverage of the parts up to the current one, from the inside out
		let covered = 0;
		let reach = 0;
		for (const part of parts) {
			reach += part.width;
			const coverage = clamp(distance + reach + 0.5);
			const share = coverage - covered;
			r += part.rgb.r * share;
			g += part.rgb.g * share;
			b += part.rgb.b * share;
			covered = coverage;
		}
		if (covered > 0) {
			data[i] = r / covered;
			data[i + 1] = g / covered;
			data[i + 2] = b / covered;
		}
		data[i + 3] = 255 * covered;
	};
}

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** The box of the shape, from edge to edge. Undefined for an empty image. */
function shapeBox(image: Pixels, sdf: boolean): Box | undefined {
	const { width, height, data } = image;
	const threshold = sdf ? SDF_EDGE : 1;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] < threshold) continue;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}
	if (maxX < minX) return undefined;
	// in the coordinates of the pixel edges, like the whole image: the edge of the shape lies
	// about halfway between the center of the last pixel inside and of the next one
	return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** The value of channel `c` at a point between the pixel centers, interpolated bilinearly. 0 outside. */
function interpolate(image: Pixels, x: number, y: number, c: number): number {
	const { width, height, data } = image;
	if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
	const x0 = Math.floor(x);
	const y0 = Math.floor(y);
	const x1 = Math.min(x0 + 1, width - 1);
	const y1 = Math.min(y0 + 1, height - 1);
	const xa = x - x0;
	const ya = y - y0;
	const v00 = data[(y0 * width + x0) * 4 + c];
	const v01 = data[(y0 * width + x1) * 4 + c];
	const v10 = data[(y1 * width + x0) * 4 + c];
	const v11 = data[(y1 * width + x1) * 4 + c];
	const v0 = v00 * (1 - xa) + v01 * xa;
	const v1 = v10 * (1 - xa) + v11 * xa;
	return v0 * (1 - ya) + v1 * ya;
}

function clamp(value: number): number {
	return Math.min(1, Math.max(0, value));
}
