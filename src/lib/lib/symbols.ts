import type * as maplibregl from 'maplibre-gl';
import { symbolEntries as entries } from '$lib/codec/symbols.js';

export interface SymbolInfo {
	index: number;
	name: string;
	image?: string;
	offset?: [number, number];
	icon?: string;
}

const symbols = new Map<number, SymbolInfo>(
	entries.map(([index, name, image, offset]) => [index, { index, name, image, offset }])
);
const defaultSymbol = symbols.get(38)!;

export function getSymbol(index: number): SymbolInfo {
	return symbols.get(index) ?? defaultSymbol!;
}

export function getSymbolIndexByName(name: string): number | undefined {
	const entry = entries.find((entry) => entry[1] === name);
	return entry ? entry[0] : undefined;
}

export class SymbolLibrary {
	private map: maplibregl.Map;
	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	getSymbol(index: number): SymbolInfo {
		return symbols.get(index) ?? defaultSymbol!;
	}

	drawSymbol(canvas: HTMLCanvasElement, index: number, halo = 0, retry = true): void {
		const symbol = this.getSymbol(index);
		if (!symbol.image) return;

		const image = this.map.getImage(symbol.image);
		if (!image) {
			// The sprite is not loaded yet: try once more when the map has settled
			if (retry) this.map.once('idle', () => this.drawSymbol(canvas, index, halo, false));
			return;
		}
		const { sdf, data: imageDataSrc } = image;
		const { data: dataSrc, width: widthSrc, height: heightSrc } = imageDataSrc;

		const { width: widthDst, height: heightDst } = canvas;
		const scale = Math.min(widthDst / widthSrc, heightDst / heightSrc);
		const x0 = (widthDst - widthSrc * scale) / 2;
		const y0 = (heightDst - heightSrc * scale) / 2;

		const border = halo;

		const dataDst = new Uint8ClampedArray(widthDst * heightDst * 4);
		for (let yi = 0; yi < heightDst; yi++) {
			for (let xi = 0; xi < widthDst; xi++) {
				const x = (xi - x0) / scale;
				const y = (yi - y0) / scale;
				const i = (yi * widthDst + xi) * 4;

				if (sdf) {
					const v = (interpolate(x, y, 3) - 191) * 8 * scale;
					let alpha, color;
					if (halo) {
						color = Math.min(255, Math.max(0, 127.5 - v));
						alpha = Math.min(255, Math.max(0, 256 * border + v));
					} else {
						color = 0;
						alpha = Math.min(255, Math.max(0, v));
					}
					dataDst[i] = color;
					dataDst[i + 1] = color;
					dataDst[i + 2] = color;
					dataDst[i + 3] = alpha;
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

		function interpolate(x: number, y: number, c: number): number {
			if (x < 0 || y < 0 || x >= widthSrc - 1 || y >= heightSrc - 1) return 0;
			const x0 = Math.floor(x);
			const y0 = Math.floor(y);
			const x1 = Math.ceil(x);
			const y1 = Math.ceil(y);
			const xa = (x - x0) / Math.max(1, x1 - x0);
			const ya = (y - y0) / Math.max(1, y1 - y0);
			const v00 = dataSrc[(y0 * widthSrc + x0) * 4 + c];
			const v01 = dataSrc[(y0 * widthSrc + x1) * 4 + c];
			const v10 = dataSrc[(y1 * widthSrc + x0) * 4 + c];
			const v11 = dataSrc[(y1 * widthSrc + x1) * 4 + c];
			const v0 = v00 * (1 - xa) + v01 * xa;
			const v1 = v10 * (1 - xa) + v11 * xa;
			return v0 * (1 - ya) + v1 * ya;
		}
	}

	asList(): SymbolInfo[] {
		return Array.from(symbols.values());
	}
}
