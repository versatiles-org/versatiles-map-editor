import { osm, type OsmOptions } from '@versatiles/style';
import { getLanguage } from './location.js';

export function getMapStyle(
	styleOptions: OsmOptions & {
		darkMode?: boolean;
		transitionDuration?: number;
	} = {}
) {
	const { darkMode = isDarkMode(), transitionDuration, ...osmOptions } = styleOptions;
	const style = osm({
		urls: { base: 'https://tiles.versatiles.org' },
		text: { language: getLanguage() ?? 'local' },
		theme: darkMode ? 'colorful-dark' : 'colorful',
		projection: 'mercator',
		...osmOptions
	});
	if (transitionDuration != null) {
		style.transition = { duration: transitionDuration, delay: 0 };
	}
	return style;
}

export function isDarkMode(element?: HTMLElement): boolean {
	if (element != null) {
		const colorScheme = getComputedStyle(element).getPropertyValue('color-scheme');
		if (colorScheme.includes('dark')) return true;
		if (colorScheme.includes('light')) return false;
	}

	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
