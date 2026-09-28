import type * as maplibregl from 'maplibre-gl';
import { parseHex } from '../../utils/index.js';

/** Options for drawing a symbol, see `SymbolLibrary.drawSymbol`. */
export interface DrawOptions {
	/** The color of an SDF symbol, black by default. */
	color?: string;
	/** A white halo around an SDF symbol, in canvas pixels, with the symbol in gray. */
	halo?: number;
	/** An outline around an SDF symbol in this color, `outlineWidth` canvas pixels wide. */
	outline?: string;
	outlineWidth?: number;
	/** Scale the shape to fill the canvas, instead of the whole image with its empty border. */
	crop?: boolean;
}

/** The value of an SDF image on the edge of the shape, and per pixel of distance. */
const SDF_EDGE = 191.25;
const SDF_PER_PIXEL = 32;

export class SymbolLibrary {
	private map: maplibregl.Map;
	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	/**
	 * Draw the symbol into the canvas: black, or in `color`, or with a white `halo` or an `outline`.
	 * If the sprite is not loaded yet, it is drawn once it is, while the canvas is on the page.
	 */
	drawSymbol(canvas: HTMLCanvasElement, name: string, options: DrawOptions = {}): void {
		this.draw(canvas, name, options, true);
	}

	private draw(canvas: HTMLCanvasElement, name: string, options: DrawOptions, retry: boolean) {
		if (!name) return;

		// throws while the map has no style yet (e.g. a legend in a shared map)
		const image = this.map.style ? this.map.getImage(name) : undefined;
		if (!image) {
			// The sprite is not loaded yet: try again when the map has settled, e.g. after it has
			// loaded the style and then the sprite. Only once for a canvas that is not on the page.
			if (retry) this.map.once('idle', () => this.draw(canvas, name, options, canvas.isConnected === true));
			return;
		}
		const halo = options.halo ?? 0;
		const rgb = (options.color && parseHex(options.color)) || { r: 0, g: 0, b: 0 };
		const outline = options.outline ? parseHex(options.outline) : undefined;
		const outlineWidth = outline ? (options.outlineWidth ?? 1) : 0;
		const { sdf, data: imageDataSrc } = image;
		const { data: dataSrc, width: widthSrc, height: heightSrc } = imageDataSrc;
		const { width: widthDst, height: heightDst } = canvas;

		// the part of the image to draw: all of it, or the shape with room for its outline
		let box = { x: 0, y: 0, width: widthSrc, height: heightSrc };
		let scale = Math.min(widthDst / box.width, heightDst / box.height);
		const shape = options.crop ? shapeBox() : undefined;
		if (shape) {
			// the outline and the antialiasing, in canvas pixels, around the scaled shape
			const margin = outlineWidth + halo + 0.5;
			scale = Math.min((widthDst - 2 * margin) / shape.width, (heightDst - 2 * margin) / shape.height);
			const m = margin / scale;
			box = { x: shape.x - m, y: shape.y - m, width: shape.width + 2 * m, height: shape.height + 2 * m };
		}
		const x0 = (widthDst - box.width * scale) / 2 - box.x * scale;
		const y0 = (heightDst - box.height * scale) / 2 - box.y * scale;

		const dataDst = new Uint8ClampedArray(widthDst * heightDst * 4);
		for (let yi = 0; yi < heightDst; yi++) {
			for (let xi = 0; xi < widthDst; xi++) {
				// the center of the canvas pixel in the image
				const x = (xi + 0.5 - x0) / scale - 0.5;
				const y = (yi + 0.5 - y0) / scale - 0.5;
				const i = (yi * widthDst + xi) * 4;

				if (sdf) {
					// the distance to the edge in canvas pixels, positive inside the shape
					const distance = ((interpolate(x, y, 3) - SDF_EDGE) / SDF_PER_PIXEL) * scale;
					// covered pixels, antialiased over one pixel around the edge
					const fill = clamp(distance + 0.5);
					if (halo) {
						const gray = 255 * clamp(0.5 - distance);
						dataDst[i] = dataDst[i + 1] = dataDst[i + 2] = gray;
						dataDst[i + 3] = 255 * clamp(distance + halo + 0.5);
					} else if (outline) {
						// the symbol over its outline
						const alpha = clamp(distance + outlineWidth + 0.5);
						const mix = alpha > 0 ? fill / alpha : 0;
						dataDst[i] = rgb.r * mix + outline.r * (1 - mix);
						dataDst[i + 1] = rgb.g * mix + outline.g * (1 - mix);
						dataDst[i + 2] = rgb.b * mix + outline.b * (1 - mix);
						dataDst[i + 3] = 255 * alpha;
					} else {
						dataDst[i] = rgb.r;
						dataDst[i + 1] = rgb.g;
						dataDst[i + 2] = rgb.b;
						dataDst[i + 3] = 255 * fill;
					}
				} else {
					dataDst[i] = interpolate(x, y, 0);
					dataDst[i + 1] = interpolate(x, y, 1);
					dataDst[i + 2] = interpolate(x, y, 2);
					dataDst[i + 3] = interpolate(x, y, 3);
				}
			}
		}

		const ctx = canvas.getContext('2d')!;
		ctx.putImageData(new ImageData(dataDst, widthDst, heightDst), 0, 0);

		/** The box of the shape, from edge to edge. Undefined for an empty image. */
		function shapeBox() {
			const threshold = sdf ? SDF_EDGE : 1;
			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (let y = 0; y < heightSrc; y++) {
				for (let x = 0; x < widthSrc; x++) {
					if (dataSrc[(y * widthSrc + x) * 4 + 3] < threshold) continue;
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

		function interpolate(x: number, y: number, c: number): number {
			if (x < 0 || y < 0 || x > widthSrc - 1 || y > heightSrc - 1) return 0;
			const x0 = Math.floor(x);
			const y0 = Math.floor(y);
			const x1 = Math.min(x0 + 1, widthSrc - 1);
			const y1 = Math.min(y0 + 1, heightSrc - 1);
			const xa = x - x0;
			const ya = y - y0;
			const v00 = dataSrc[(y0 * widthSrc + x0) * 4 + c];
			const v01 = dataSrc[(y0 * widthSrc + x1) * 4 + c];
			const v10 = dataSrc[(y1 * widthSrc + x0) * 4 + c];
			const v11 = dataSrc[(y1 * widthSrc + x1) * 4 + c];
			const v0 = v00 * (1 - xa) + v01 * xa;
			const v1 = v10 * (1 - xa) + v11 * xa;
			return v0 * (1 - ya) + v1 * ya;
		}
	}
}

function clamp(value: number): number {
	return Math.min(1, Math.max(0, value));
}
