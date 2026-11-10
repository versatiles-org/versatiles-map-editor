import type { StyleSpecification } from '@versatiles/style';
import type { StateBackground } from '@versatiles/map-state';
import { backgroundStyle } from '@versatiles/map-state/maplibre';
import { config } from './config.svelte.js';

/**
 * The style of the background map, with the tile server of the configuration (see `configReady`)
 * and what it has: landcover and elevation tiles. Labels in the language of the browser ("user")
 * stay so: `@versatiles/style` picks it.
 */
export function getMapStyle(background?: StateBackground): StyleSpecification {
	const { tileServer, landcover, elevation } = config.current;
	return backgroundStyle(background, {
		tileServer,
		landcover,
		elevation,
		language: 'user',
		onWarning: (message) => console.warn(message)
	});
}
