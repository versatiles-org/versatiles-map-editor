import { ADDRESS_PARTS, guessColumns, type AddressPart, type Table } from './table.js';
import { markerStyle, tableCategories, type Category, type LocationBias, type TableMapping } from './table_import.js';

/** What the user chooses before the import: the columns, the search and the style. -1 is no column. */
export interface ImportSettings {
	positionType: 'coordinates' | 'address';
	latitude: number;
	longitude: number;
	/** The columns of the address parts. */
	address: Record<AddressPart, number>;
	bias: LocationBias;
	/** Whether rows are imported whose address was found only roughly, e.g. another street. */
	importUncertain: boolean;
	label: number;
	popup: number;
	color: string;
	symbol: string;
	category: number;
	/** The values of the category column, each with its style. */
	categories: Category[];
	/** The number of values of the category column, if there are too many for categories. */
	tooManyCategories: number;
	/** Whether the categories are added to the legend. */
	addLegend: boolean;
}

/** No column for any part of the address. */
export function noAddress(): Record<AddressPart, number> {
	return Object.fromEntries(ADDRESS_PARTS.map((part) => [part, -1])) as Record<AddressPart, number>;
}

/** The settings before a table is chosen, with the style of new markers. */
export function defaultSettings(color: string, symbol: string): ImportSettings {
	return {
		positionType: 'coordinates',
		latitude: 0,
		longitude: 1,
		address: noAddress(),
		bias: 'region',
		importUncertain: true,
		label: -1,
		popup: -1,
		color,
		symbol,
		category: -1,
		categories: [],
		tooManyCategories: 0,
		addLegend: true
	};
}

/**
 * The columns guessed from their names: coordinates if there are, else an address (the first
 * column without a guess), and the label, the popup and the category.
 */
export function guessSettings(
	columns: string[]
): Pick<ImportSettings, 'positionType' | 'latitude' | 'longitude' | 'address' | 'label' | 'popup' | 'category'> {
	const guess = guessColumns(columns);
	const guessedAddress = ADDRESS_PARTS.some((part) => guess[part] != null);
	const address = noAddress();
	for (const part of ADDRESS_PARTS) address[part] = guess[part] ?? -1;
	// without a guess, the first column holds the address
	if (!guessedAddress) address.address = 0;
	return {
		positionType: guess.latitude == null && guessedAddress ? 'address' : 'coordinates',
		latitude: guess.latitude ?? 0,
		longitude: guess.longitude ?? Math.min(1, columns.length - 1),
		address,
		label: guess.label ?? -1,
		popup: guess.popup ?? -1,
		category: guess.category ?? -1
	};
}

/** Choose the category column: each of its values gets the next color of the scheme. */
export function applyCategory(settings: ImportSettings, table: Table | undefined, column: number, colors: string[]) {
	settings.category = column;
	settings.categories = [];
	settings.tooManyCategories = 0;
	if (column < 0 || !table) return;
	const { categories, tooMany } = tableCategories(table, column, colors, settings.symbol);
	settings.categories = categories;
	settings.tooManyCategories = tooMany;
}

/** Whether the settings have a column for the position: coordinates, or at least one part of an address. */
export function hasPosition(settings: ImportSettings): boolean {
	return settings.positionType === 'coordinates' || ADDRESS_PARTS.some((part) => settings.address[part] >= 0);
}

/** The mapping of the table to markers, from the settings. */
export function mappingOf(settings: ImportSettings): TableMapping {
	const { positionType, latitude, longitude, address, label, popup, category, categories } = settings;
	return {
		position:
			positionType === 'coordinates'
				? { latitude, longitude }
				: {
						address: Object.fromEntries(
							ADDRESS_PARTS.filter((part) => address[part] >= 0).map((part) => [part, address[part]])
						)
					},
		label: label >= 0 ? label : undefined,
		popup: popup >= 0 ? popup : undefined,
		style: markerStyle(settings.color, settings.symbol),
		category:
			categories.length > 0
				? {
						column: category,
						styles: Object.fromEntries(categories.map((c) => [c.value, markerStyle(c.color, c.symbol)]))
					}
				: undefined
	};
}
