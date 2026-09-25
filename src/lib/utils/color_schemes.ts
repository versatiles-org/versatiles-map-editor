export interface ColorScheme {
	id: string;
	name: string;
	colors: string[];
}

/**
 * Qualitative color schemes: distinct colors for different kinds of things on a map.
 * Paul Tol's schemes and Okabe-Ito are safe for colorblind people. Set 1, Dark 2 and
 * Pastel 1 are from ColorBrewer (colorbrewer2.org) by Cynthia Brewer, Apache License 2.0.
 */
export const COLOR_SCHEMES: ColorScheme[] = [
	{
		id: 'bright',
		name: 'Bright (colorblind-safe)',
		colors: ['#4477aa', '#ee6677', '#228833', '#ccbb44', '#66ccee', '#aa3377', '#bbbbbb']
	},
	{
		id: 'muted',
		name: 'Muted (colorblind-safe)',
		colors: ['#cc6677', '#332288', '#ddcc77', '#117733', '#88ccee', '#882255', '#44aa99', '#999933', '#aa4499']
	},
	{
		id: 'okabe-ito',
		name: 'Okabe-Ito (colorblind-safe)',
		colors: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#000000']
	},
	{
		id: 'set1',
		name: 'Set 1',
		colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999']
	},
	{
		id: 'dark2',
		name: 'Dark 2',
		colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666']
	},
	{
		id: 'pastel1',
		name: 'Pastel 1',
		colors: ['#fbb4ae', '#b3cde3', '#ccebc5', '#decbe4', '#fed9a6', '#ffffcc', '#e5d8bd', '#fddaec', '#f2f2f2']
	}
];

export const DEFAULT_COLOR_SCHEME = COLOR_SCHEMES[0];

/** The scheme with this id, or the default scheme (e.g. for an id of a scheme that no longer exists). */
export function getColorScheme(id: string | undefined): ColorScheme {
	return COLOR_SCHEMES.find((scheme) => scheme.id === id) ?? DEFAULT_COLOR_SCHEME;
}
