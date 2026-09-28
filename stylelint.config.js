/** @type {import('stylelint').Config} */
export default {
	extends: ['stylelint-config-standard'],
	overrides: [
		{ files: ['**/*.scss'], extends: ['stylelint-config-standard-scss'] },
		// the <style> blocks of the components, some of them in SCSS
		{ files: ['**/*.svelte'], extends: ['stylelint-config-standard-scss', 'stylelint-config-html/svelte'] }
	],
	rules: {
		// the scope of Svelte's styles
		'selector-pseudo-class-no-unknown': [true, { ignorePseudoClasses: ['global'] }],
		// Safari still needs it
		'property-no-vendor-prefix': [true, { ignoreProperties: ['-webkit-user-select'] }],
		// empty lines are a matter of taste: rules and comments follow each other without them
		'rule-empty-line-before': null,
		'comment-empty-line-before': null,
		'declaration-empty-line-before': null,
		'at-rule-empty-line-before': null,
		'scss/double-slash-comment-empty-line-before': null
	},
	ignoreFiles: ['build/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'packages/*/dist/**']
};
