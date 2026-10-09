// only the SCSS files and the <style> blocks know the rules of SCSS, e.g. of // comments
const scssRules = {
	// empty lines are a matter of taste, see below
	'scss/double-slash-comment-empty-line-before': null
};

/** @type {import('stylelint').Config} */
export default {
	extends: ['stylelint-config-standard'],
	overrides: [
		{ files: ['**/*.scss'], extends: ['stylelint-config-standard-scss'], rules: scssRules },
		// the <style> blocks of the components, some of them in SCSS
		{
			files: ['**/*.svelte'],
			extends: ['stylelint-config-standard-scss', 'stylelint-config-html/svelte'],
			rules: scssRules
		},
		// the design (src/lib/app/theme.css): font sizes, corners and colors come from its variables
		{
			files: ['src/lib/components/**/*.{svelte,css}', 'src/lib/app/*.svelte'],
			rules: {
				'declaration-property-value-allowed-list': {
					'font-size': ['/^var\\(--font-size-/', 'inherit'],
					'border-radius': ['/^(var\\(--radius-[a-z]+\\)|0|50%)( (var\\(--radius-[a-z]+\\)|0|50%))*$/']
				},
				'color-no-hex': true
			}
		}
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
		'at-rule-empty-line-before': null
	},
	ignoreFiles: [
		'build/**',
		'release/**',
		'coverage/**',
		'playwright-report/**',
		'test-results/**',
		'packages/*/dist/**'
	]
};
