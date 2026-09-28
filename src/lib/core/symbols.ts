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
	/** The size of the image in pixels, at an icon size of 1. */
	width: number;
	height: number;
	/** The point of the image on the point of the marker, as fractions of its width and height. */
	center: [number, number];
}

/** The image of 32×32 pixels, centered on the point, of the symbols of older maps. */
function centered(): Pick<SymbolInfo, 'anchor' | 'width' | 'height' | 'center'> {
	return { anchor: 'center', width: 32, height: 32, center: [0.5, 0.5] };
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
	else LEGACY_CATALOG.symbols.push({ name, title, aliases: [], ...centered() });
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
			.map(([name, image]): SymbolInfo => {
				const pixelRatio = positive(image.pixelRatio) ?? 1;
				const center = validCenter(image.center);
				return {
					name: `${sheet}:${name}`,
					title: typeof image.title === 'string' ? image.title : name,
					aliases: Array.isArray(image.aliases) ? image.aliases.filter((a) => typeof a === 'string') : [],
					anchor: anchorOf(center),
					width: (positive(image.width) ?? 32 * pixelRatio) / pixelRatio,
					height: (positive(image.height) ?? 32 * pixelRatio) / pixelRatio,
					center
				};
			})
	);
	return { sheets, symbols };
}

/** A positive number, or undefined. */
function positive(value: unknown): number | undefined {
	return typeof value === 'number' && value > 0 ? value : undefined;
}

/** The center of a sprite image, or the middle of the image without a valid one. */
function validCenter(center: unknown): [number, number] {
	if (!Array.isArray(center) || center.length !== 2) return [0.5, 0.5];
	const [x, y] = center as unknown[];
	return typeof x === 'number' && typeof y === 'number' ? [x, y] : [0.5, 0.5];
}

interface SpriteImage {
	sdf?: boolean;
	width?: unknown;
	height?: unknown;
	pixelRatio?: unknown;
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

/** The words of a text, in lower case and without accents, e.g. "Café-Bar" → ["cafe", "bar"]. */
function words(text: string): string[] {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

/**
 * Whether a text matches a filter: every word of the filter starts a word of the text, e.g.
 * "fire st" matches "Fire station", but "pin" does not match "camping". An empty filter matches
 * everything.
 */
export function matchesFilter(text: string, filter: string): boolean {
	const textWords = words(text);
	return words(filter).every((word) => textWords.some((textWord) => textWord.startsWith(word)));
}

/** The symbols whose title, aliases or name match a filter, see `matchesFilter`. */
export function filterSymbols(symbols: SymbolInfo[], filter: string): SymbolInfo[] {
	if (!filter.trim()) return symbols;
	return symbols.filter((symbol) => matchesFilter([symbol.title, ...symbol.aliases, symbol.name].join(' '), filter));
}

/** The symbol of an image, or undefined for no symbol (""). An unknown image gets its name as title. */
export function getSymbol(name: string): SymbolInfo | undefined {
	if (!name) return undefined;
	return byName.get(name) ?? { name, title: name.replace(/^.*:/, ''), aliases: [], ...centered() };
}

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
