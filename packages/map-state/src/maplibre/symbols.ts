/**
 * The symbols of markers: the images of the sprite sheets of a tile server that can be recolored
 * (SDF images), with their sizes and the points that stand on a marker's point, e.g. the tip of a
 * pin. Markers name them as "sheet:name", e.g. "icons:anchor".
 */
import type { IconAnchor, SymbolInfo } from './types.js';

/** The sprite sheets of a tile server, with their symbols. */
export interface SymbolCatalog {
	sheets: string[];
	symbols: SymbolInfo[];
}

/** What `fetchSymbolCatalog` needs of a fetch function, e.g. of browsers and Node.js. */
export type FetchJSON = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** The folder of the sprite sheets on a tile server, e.g. "https://tiles.versatiles.org/assets/sprites/". */
function spritesUrl(tileServer: string): string {
	return `${tileServer.replace(/\/+$/, '')}/assets/sprites/`;
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

/**
 * Load the sprite sheets of a tile server (its `assets/sprites/index.json`, then each sheet's JSON),
 * with the titles and aliases of their symbols. Patterns are no symbols: only images that can be
 * recolored (SDF) are. Rejects if the server does not answer.
 */
export async function fetchSymbolCatalog({
	tileServer,
	fetch = (globalThis as unknown as { fetch: FetchJSON }).fetch
}: {
	tileServer: string;
	fetch?: FetchJSON;
}): Promise<SymbolCatalog> {
	const fetchJSON = async <T>(path: string): Promise<T> => {
		const response = await fetch(spritesUrl(tileServer) + path);
		if (!response.ok) throw new Error(`${response.status} for ${path}`);
		return (await response.json()) as T;
	};
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

/** The anchor of an image by its center, e.g. [0.5, 1] (a pin) is "bottom". */
export function anchorOf(center: unknown): IconAnchor {
	if (!Array.isArray(center) || center.length !== 2) return 'center';
	const [x, y] = center as number[];
	const horizontal = x <= 0.25 ? 'left' : x >= 0.75 ? 'right' : '';
	const vertical = y <= 0.25 ? 'top' : y >= 0.75 ? 'bottom' : '';
	if (horizontal && vertical) return `${vertical}-${horizontal}` as IconAnchor;
	return (vertical || horizontal || 'center') as IconAnchor;
}

/**
 * The symbol of an image by its name in the catalog, e.g. for `elementFeatures`: undefined for no
 * symbol (""). An image that the catalog does not have, e.g. of another server or before the
 * catalog is loaded, is taken as 32×32 pixels centered on the point, with its name as title.
 */
export function symbolLookup(catalog: SymbolCatalog): (name: string) => SymbolInfo | undefined {
	const byName = new Map(catalog.symbols.map((symbol) => [symbol.name, symbol]));
	return (name) => {
		if (!name) return undefined;
		return (
			byName.get(name) ?? {
				name,
				title: name.replace(/^.*:/, ''),
				aliases: [],
				anchor: 'center',
				width: 32,
				height: 32,
				center: [0.5, 0.5]
			}
		);
	};
}

/** The sprite sheets for a map style (its `sprite`), all with symbols, as markers name them. */
export function spriteSheets(catalog: SymbolCatalog, tileServer: string): { id: string; url: string }[] {
	return catalog.sheets.map((id) => ({ id, url: spritesUrl(tileServer) + id }));
}
