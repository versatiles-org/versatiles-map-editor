import { OptionDefaults } from 'typedoc';

/**
 * How the API documentation of the package is generated (`npm run doc-api`): from the sources
 * that are built, and with the tags that the JSON Schema of `.mapjson` is generated from too
 * (see `schema/generate.mjs`), which are the limits of a value.
 */
export default {
	tsconfig: 'tsconfig.build.json',
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
