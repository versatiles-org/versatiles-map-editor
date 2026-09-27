import type * as maplibregl from 'maplibre-gl';
import { LEGACY_SYMBOLS } from '@versatiles/map-state';
import { parseHex } from '$lib/utils/color.js';
import { TILE_SERVER } from '$lib/utils/map_style.js';

/** The point of the image that is placed on the point of a marker, e.g. the tip of a pin. */
export type IconAnchor =
	'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SymbolInfo {
	/** The image in the map style, e.g. "icons:anchor": the sprite sheet and the name in it. */
	name: string;
	title: string;
	/** Other words for the symbol, e.g. to find it. */
	aliases: string[];
	anchor: IconAnchor;
}

/** The sprite sheets of the tile server, with their symbols. */
export interface SymbolCatalog {
	sheets: string[];
	symbols: SymbolInfo[];
}

/** The symbol of new markers. */
export const NEW_MARKER_SYMBOL = 'extras:pin-teardrop';

const SPRITES_URL = `${TILE_SERVER}/assets/sprites/`;

/**
 * The symbols of older maps, which were all in the "base" sheet. Used until the server's are
 * loaded. Some of their names have the same image: the first one is its title, the others aliases.
 */
const LEGACY_CATALOG: SymbolCatalog = { sheets: ['base'], symbols: [] };
for (const [, title, name] of LEGACY_SYMBOLS) {
	if (!name) continue;
	const known = LEGACY_CATALOG.symbols.find((symbol) => symbol.name === name);
	if (known) known.aliases.push(title);
	else LEGACY_CATALOG.symbols.push({ name, title, aliases: [], anchor: 'center' });
}

let catalog = LEGACY_CATALOG;
let byName = indexByName(catalog);
let loading: Promise<SymbolCatalog> | undefined;

function indexByName({ symbols }: SymbolCatalog): Map<string, SymbolInfo> {
	return new Map(symbols.map((symbol) => [symbol.name, symbol]));
}

/**
 * Load the sprite sheets of the tile server once, with the titles and aliases of their symbols.
 * Patterns are no symbols: only images that can be recolored (SDF) are. Without the server, the
 * symbols of older maps are used.
 */
export function loadSymbols(): Promise<SymbolCatalog> {
	loading ??= fetchCatalog().then(
		(loaded) => {
			catalog = loaded;
			byName = indexByName(loaded);
			return loaded;
		},
		(error) => {
			console.warn('Failed to load the symbols of the map', error);
			return catalog;
		}
	);
	return loading;
}

async function fetchCatalog(): Promise<SymbolCatalog> {
	const sheets = await fetchJSON<string[]>('index.json');
	if (!Array.isArray(sheets) || sheets.some((sheet) => typeof sheet !== 'string')) throw new Error('Invalid index');
	const images = await Promise.all(sheets.map((sheet) => fetchJSON<Record<string, SpriteImage>>(`${sheet}.json`)));
	const symbols = sheets.flatMap((sheet, i) =>
		Object.entries(images[i])
			.filter(([, image]) => image.sdf)
			.map(([name, image]) => ({
				name: `${sheet}:${name}`,
				title: typeof image.title === 'string' ? image.title : name,
				aliases: Array.isArray(image.aliases) ? image.aliases.filter((a) => typeof a === 'string') : [],
				anchor: anchorOf(image.center)
			}))
	);
	return { sheets, symbols };
}

interface SpriteImage {
	sdf?: boolean;
	title?: unknown;
	aliases?: unknown[];
	/** The point of the image on the point of the map, as fractions of its width and height. */
	center?: unknown;
}

async function fetchJSON<T>(path: string): Promise<T> {
	const response = await fetch(SPRITES_URL + path);
	if (!response.ok) throw new Error(`${response.status} for ${path}`);
	return (await response.json()) as T;
}

/** The anchor of an image by its center, e.g. [0.5, 1] (a pin) is "bottom". */
export function anchorOf(center: unknown): IconAnchor {
	if (!Array.isArray(center) || center.length !== 2) return 'center';
	const [x, y] = center as number[];
	const horizontal = x <= 0.25 ? 'left' : x >= 0.75 ? 'right' : '';
	const vertical = y <= 0.25 ? 'top' : y >= 0.75 ? 'bottom' : '';
	if (horizontal && vertical) return `${vertical}-${horizontal}` as IconAnchor;
	return (vertical || horizontal || 'center') as IconAnchor;
}

/** The sprite sheets for the map style, all with symbols. */
export function spriteSheets(): { id: string; url: string }[] {
	return catalog.sheets.map((id) => ({ id, url: SPRITES_URL + id }));
}

/** All symbols, in the order of their sheets. */
export function allSymbols(): SymbolInfo[] {
	return catalog.symbols;
}

/** The symbol of an image, or undefined for no symbol (""). An unknown image gets its name as title. */
export function getSymbol(name: string): SymbolInfo | undefined {
	if (!name) return undefined;
	return byName.get(name) ?? { name, title: name.replace(/^.*:/, ''), aliases: [], anchor: 'center' };
}

export class SymbolLibrary {
	private map: maplibregl.Map;
	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	/**
	 * Draw the symbol into the canvas: black, or in `color`, or with a white `halo` (in pixels).
	 */
	drawSymbol(canvas: HTMLCanvasElement, name: string, options: { halo?: number; color?: string } = {}): void {
		this.draw(canvas, name, options, true);
	}

	private draw(canvas: HTMLCanvasElement, name: string, options: { halo?: number; color?: string }, retry: boolean) {
		if (!name) return;

		// throws while the map has no style yet (e.g. a legend in a shared map)
		const image = this.map.style ? this.map.getImage(name) : undefined;
		if (!image) {
			// The sprite is not loaded yet: try once more when the map has settled
			if (retry) this.map.once('idle', () => this.draw(canvas, name, options, false));
			return;
		}
		const halo = options.halo ?? 0;
		const rgb = (options.color && parseHex(options.color)) || { r: 0, g: 0, b: 0 };
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
					if (halo) {
						const gray = Math.min(255, Math.max(0, 127.5 - v));
						dataDst[i] = dataDst[i + 1] = dataDst[i + 2] = gray;
						dataDst[i + 3] = Math.min(255, Math.max(0, 256 * border + v));
					} else {
						dataDst[i] = rgb.r;
						dataDst[i + 1] = rgb.g;
						dataDst[i + 2] = rgb.b;
						dataDst[i + 3] = Math.min(255, Math.max(0, v));
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
}
