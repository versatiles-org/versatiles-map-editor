import { osm, satellite, type OsmOptions, type SatelliteOptions, type StyleSpecification } from '@versatiles/style';
import type { StateBackground } from '@versatiles/map-state';
import { DEFAULT_BACKGROUND } from './background.js';
import { config } from './config.svelte.js';

/**
 * The streets, borders and labels over the imagery, as the options have them, with borders and
 * motorways dimmed by `line-layer-opacity`, so where a line overlaps itself (e.g. the two
 * carriageways of a motorway) it does not show brighter. MapLibre GL JS has it from version 6;
 * MapLibre Native has not, but only the editor and its viewer draw these styles. `false`: the
 * imagery alone.
 */
function overlayOf(options: SatelliteOptions): SatelliteOptions['osmOverlay'] {
	const overlay = options.osmOverlay ?? true;
	if (overlay === false) return false;
	return { ...(overlay === true ? {} : overlay), layerOpacity: true };
}

/**
 * The style of the background map. The tile server (of the configuration, see `configReady`) and the
 * projection are set by the editor, never by the (shared) options, so a map cannot load tiles or
 * fonts from other servers; so is the
 * way the overlay of the imagery is drawn (see `overlayOf`).
 */
export function getMapStyle(background: StateBackground = DEFAULT_BACKGROUND): StyleSpecification {
	const fixed = { urls: { base: config.current.tileServer }, projection: 'mercator' as const };
	try {
		if (background.builder === 'satellite') {
			const options = background.options as SatelliteOptions;
			return satellite({ ...options, osmOverlay: overlayOf(options), ...fixed });
		}
		return osm({ ...(background.options as OsmOptions), ...fixed });
	} catch (error) {
		// e.g. options of a newer version of @versatiles/style
		console.error('Invalid background map options', error);
		return osm({ ...(DEFAULT_BACKGROUND.options as OsmOptions), ...fixed });
	}
}
