import { OptionDefaults } from 'typedoc';

/**
 * How the API documentation of the package is generated (`npm run doc-api`): from the sources
 * that are built, and with the tags that the JSON Schema of `.mapjson` is generated from too
 * (see `schema/generate.mjs`), which are the limits of a value.
 */
const CATEGORIES = [
	'Links',
	'Files',
	'Map state',
	'Elements',
	'Styles',
	'Colors',
	'Legend',
	'Background map',
	'Viewer',
	'*'
];

export default {
	tsconfig: 'tsconfig.build.json',
	// The exports by what they are for (the tag `@category` of each), not by their kind, so e.g. the
	// type of the legend, its defaults and its tables of names are together. In the order in which
	// a developer needs them: first how a map is read and written, then what it holds.
	// what the editor needs of how states are normalized, but nobody should build on (`@internal`)
	excludeInternal: true,
	categorizeByGroup: false,
	categoryOrder: CATEGORIES,
	defaultCategory: 'Other',
	navigation: { includeCategories: true, includeGroups: false },
	// a helper type of the defaults, which says nothing on its own
	intentionallyNotExported: ['Defaults'],
	blockTags: [
		...OptionDefaults.blockTags,
		'@pattern',
		'@minimum',
		'@maximum',
		'@exclusiveMinimum',
		'@multipleOf',
		'@minItems',
		'@maxItems',
		'@asType'
	]
};
