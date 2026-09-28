import { osm, satellite, type OsmOptions, type SatelliteOptions, type StyleSpecification } from '@versatiles/style';
import type { StateBackground } from '@versatiles/map-state';
import { DEFAULT_BACKGROUND } from './background.js';

export const TILE_SERVER = 'https://tiles.versatiles.org';

/**
 * The style of the background map. The tile server and the projection are set by the editor,
 * never by the (shared) options, so a map cannot load tiles or fonts from other servers.
 */
export function getMapStyle(background: StateBackground = DEFAULT_BACKGROUND): StyleSpecification {
	const fixed = { urls: { base: TILE_SERVER }, projection: 'mercator' as const };
	try {
		if (background.builder === 'satellite') {
			return satellite({ ...(background.options as SatelliteOptions), ...fixed });
		}
		return osm({ ...(background.options as OsmOptions), ...fixed });
	} catch (error) {
		// e.g. options of a newer version of @versatiles/style
		console.error('Invalid background map options', error);
		return osm({ ...(DEFAULT_BACKGROUND.options as OsmOptions), ...fixed });
	}
}

export function isDarkMode(element?: HTMLElement): boolean {
	if (element != null) {
		const colorScheme = getComputedStyle(element).getPropertyValue('color-scheme');
		if (colorScheme.includes('dark')) return true;
		if (colorScheme.includes('light')) return false;
	}

	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
