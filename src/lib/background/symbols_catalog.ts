import {
	fetchSymbolCatalog,
	spriteSheets as sheetsOf,
	symbolLookup,
	type IconAnchor,
	type SymbolCatalog,
	type SymbolInfo
} from '@versatiles/map-state/maplibre';
import { config } from './config.svelte.js';

export type { IconAnchor, SymbolCatalog, SymbolInfo };

// empty until the symbols of the server are loaded
let catalog: SymbolCatalog = { sheets: [], symbols: [] };
let lookup = symbolLookup(catalog);
let loading: Promise<SymbolCatalog> | undefined;

/**
 * Load the sprite sheets of the configured tile server once, with the titles and aliases of their
 * symbols (see `fetchSymbolCatalog`). Without the server, there are no symbols.
 */
export function loadSymbols(): Promise<SymbolCatalog> {
	loading ??= fetchSymbolCatalog({ tileServer: config.current.tileServer }).then(
		(loaded) => {
			catalog = loaded;
			lookup = symbolLookup(loaded);
			return loaded;
		},
		(error) => {
			console.warn('Failed to load the symbols of the map', error);
			return catalog;
		}
	);
	return loading;
}

/** The sprite sheets for the map style, all with symbols. */
export function spriteSheets(): { id: string; url: string }[] {
	return sheetsOf(catalog, config.current.tileServer);
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
	return lookup(name);
}
