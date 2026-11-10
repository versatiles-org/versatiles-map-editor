import { osm } from '@versatiles/style';
import {
	BACKGROUND_COLOR_DEFAULTS,
	BACKGROUND_DEFAULTS,
	BACKGROUND_LANGUAGES,
	sanitizeBackground,
	type StateBackground
} from '@versatiles/map-state';
import type { BackgroundSettings, MapColors } from '@versatiles/map-state/maplibre';

/** The colors of the background map as they are, e.g. for the reset of the sidebar. */
export const DEFAULT_COLORS: MapColors = { ...BACKGROUND_COLOR_DEFAULTS };

/**
 * All themes of `@versatiles/style`, in its order, so a dark theme follows its light one: the color
 * presets, e.g. "gray" and "gray-dark", and the lookalikes of other maps, e.g. "positrino". The name
 * is the id in words, e.g. "Gray Dark".
 */
export const THEMES: { id: string; name: string }[] = osm.palettes.map((id) => ({
	id,
	name: id.replace(/(^|-)(\w)/g, (_, dash: string, letter: string) => (dash ? ' ' : '') + letter.toUpperCase())
}));

/** The languages of the names in the OSM tiles of tiles.versatiles.org, next to "user" and "local". */
export const LANGUAGES: string[] = BACKGROUND_LANGUAGES.filter(
	(language) => language !== 'user' && language !== 'local'
);

/** Rounded, e.g. to keep 0.3 from becoming 0.30000000000000004 in a link. */
const round = (value: number) => Math.round(value * 10000) / 10000 + 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Black and white after one of them changed, as the map can show them: black is never lighter
 * than white, and on the satellite map mid-gray ((black + white) / 2) stays from 0 to 1, as its
 * raster properties need (see `backgroundOptions`). The changed one pushes the other along, within the ranges of both.
 */
export function pushLevels(colors: MapColors, changed: 'black' | 'white', base: BackgroundSettings['base']): MapColors {
	let { black, white } = colors;
	if (changed === 'black') {
		white = Math.max(white, black);
		if (base === 'satellite') white = clamp(white, -black, 2 - black);
	} else {
		black = Math.min(black, white);
		if (base === 'satellite') black = clamp(black, -white, 2 - white);
	}
	return { ...colors, black: round(clamp(black, -1, 1)), white: round(clamp(white, 0, 2)) };
}

/**
 * The background with changed settings. Returns undefined for the editor's default background,
 * which is not stored.
 */
export function changeSettings(
	background: StateBackground | undefined,
	change: Partial<BackgroundSettings>
): StateBackground | undefined {
	const changed: StateBackground = { ...background, ...change };
	// what the other base map has is not kept, e.g. the theme of the vector map
	if ((changed.base ?? BACKGROUND_DEFAULTS.base) === 'satellite') {
		delete changed.theme;
		delete changed.buildings;
	} else {
		delete changed.streets;
		delete changed.borders;
	}
	return sanitizeBackground(changed);
}

/**
 * The background of a new map, e.g. of the configuration of this editor instance: `base` with the
 * labels in `language`, unless `base` names a language itself. Undefined for the editor's default
 * background, which is not stored.
 */
export function startingBackground(base: StateBackground = {}, language?: string): StateBackground | undefined {
	if (!language || typeof base.language === 'string') return sanitizeBackground(base);
	return sanitizeBackground({ ...base, language });
}

/** Whether both are the same background map, e.g. to keep the style that shows it. */
export function sameBackground(a: StateBackground | undefined, b: StateBackground | undefined): boolean {
	// with their settings in the same order, and without those that have their default
	return JSON.stringify(sanitizeBackground(a) ?? {}) === JSON.stringify(sanitizeBackground(b) ?? {});
}
