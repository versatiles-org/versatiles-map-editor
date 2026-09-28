import { LEGACY_SYMBOLS } from '@versatiles/map-state';
import { TILE_SERVER } from '../background/index.js';

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
