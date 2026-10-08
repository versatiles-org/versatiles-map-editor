import type { AreaStyle, LineStyle, MarkerStyle, OutlineStyle } from './types.js';

/**
 * The fields of the style of each role, e.g. to check the style of a file (a test compares them
 * with the types). Not exported by the package.
 */
export const STYLE_ROLE_FIELDS = {
	marker: [
		'symbol',
		'color',
		'size',
		'rotation',
		'haloWidth',
		'haloColor',
		'labelColor',
		'labelSize',
		'font',
		'labelPosition',
		'flat'
	],
	line: ['color', 'width', 'dash', 'arrowStart', 'arrowEnd', 'arrowSize'],
	area: ['color', 'pattern', 'patternScale', 'patternCoverage'],
	outline: ['visible', 'color', 'width', 'dash']
} as const satisfies {
	marker: readonly (keyof MarkerStyle)[];
	line: readonly (keyof LineStyle)[];
	area: readonly (keyof AreaStyle)[];
	outline: readonly (keyof OutlineStyle)[];
};
