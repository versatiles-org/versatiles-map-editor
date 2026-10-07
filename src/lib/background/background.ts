import { osm } from '@versatiles/style';
import {
	BACKGROUND_COLOR_DEFAULTS,
	BACKGROUND_DEFAULTS,
	BACKGROUND_HALO_WIDTHS,
	BACKGROUND_LANGUAGES,
	sanitizeBackground,
	type StateBackground
} from '@versatiles/map-state';

/**
 * The settings of the background map, each with a value: those of the map (`StateBackground`),
 * and the defaults of the others. The sidebar shows and changes them.
 */
export interface BackgroundSettings {
	base: 'vector' | 'satellite';
	/**
	 * Whether the satellite map shows streets, railways, ferries and the symbols of points of
	 * interest over the imagery. The vector map always does. Without them, without borders and
	 * without labels, the satellite map is the imagery alone.
	 */
	streets: boolean;
	/** Whether the satellite map shows the borders of countries and states. The vector map always does. */
	borders: boolean;
	/** The theme of the vector map, e.g. "gray", "gray-dark" or "positrino". */
	theme: string;
	font: string;
	/** "user" (browser language), "local" (local names) or a language code. */
	language: string;
	labels: 'none' | 'fewer' | 'normal';
	/** The size of the labels, as a factor of their own size. */
	labelSize: number;
	/** The width of the halo around the labels, in pixels. */
	haloWidth: number;
	/** Changes of the colors of the vector map or the satellite imagery. */
	colors: MapColors;
	/** Whether the relief is shaded: hills and mountains with light and shadow, also seen from above. */
	hillshade: boolean;
	/** Whether the map has the heights of its terrain, which a tilted map shows as hills and mountains. */
	terrain: boolean;
	/**
	 * The buildings of the vector map: flat, or raised to their heights, which a tilted map shows
	 * when zoomed in. The satellite map has no buildings of its own.
	 */
	buildings: 'flat' | 'extruded';
}

/**
 * The changes of the colors that the editor offers, the same for both maps: `recolor` of the vector
 * map, and the raster properties of the satellite imagery.
 */
export interface MapColors {
	/** From -1 (gray) to 1, 0 keeps the colors. */
	saturation: number;
	/**
	 * The lightness that black becomes, and the one that white becomes, where 0 is black and 1
	 * white. All other colors are between them, e.g. black 0.5 fades the map with white, and
	 * white 0.5 with black. Beyond 0 and 1 they add contrast: black −0.5 makes the dark colors black,
	 * white 1.5 the light colors white. Black goes from −1 to 1, white from 0 to 2, and black is
	 * never lighter than white.
	 */
	black: number;
	white: number;
}

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

/** The layer groups of the streets over the imagery, hidden, with the symbols of points of interest along them. */
const STREETS_HIDDEN = (): Options => ({ roads: false, transit: false, markings: false, pois: false });
/** The layer group of the borders over the imagery, hidden. */
const BORDERS_HIDDEN = (): Options => ({ boundaries: false });

/**
 * The labels whose halo width the editor sets: those of places, borders, streets, water and
 * transit stops. The others keep theirs, e.g. the thin halos of the points of interest and of the
 * numbers on road shields of the vector map.
 */
const HALO_GROUPS = [['places'], ['boundaries'], ['streets', 'names'], ['water'], ['pois', 'transit']];

// Fewer labels by keeping more space between them
const FEWER_LABELS_SPACING = 2;

type Options = Record<string, unknown>;

function isObject(value: unknown): value is Options {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The settings of a background, each with a value: its own, else the default. */
export function getSettings(background?: StateBackground): BackgroundSettings {
	const own = sanitizeBackground(background) ?? {};
	const base = own.base ?? BACKGROUND_DEFAULTS.base;
	const { options: _options, ...settings } = own;
	return {
		...BACKGROUND_DEFAULTS,
		haloWidth: BACKGROUND_HALO_WIDTHS[base],
		...settings,
		base,
		colors: { ...DEFAULT_COLORS, ...own.colors },
		// what only one of the base maps has
		...(base === 'vector' ? { streets: true, borders: true } : { buildings: 'flat' as const })
	};
}

/** Rounded, e.g. to keep 0.3 from becoming 0.30000000000000004 in a link. */
const round = (value: number) => Math.round(value * 10000) / 10000 + 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Black and white after one of them changed, as the map can show them: black is never lighter
 * than white, and on the satellite map mid-gray ((black + white) / 2) stays from 0 to 1, see
 * rasterLevels. The changed one pushes the other along, within the ranges of both.
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

/** The smallest distance of `brightnessMin` and `brightnessMax`, which keeps the contrast finite. */
const MIN_RASTER_SPAN = 0.02;

/**
 * The raster properties that map black and white of the imagery. MapLibre scales the colors
 * around mid-gray by the contrast factor, then maps 0 to `brightnessMin` and 1 to
 * `brightnessMax`, without clipping in between. Both must be from 0 to 1, so black below 0 and
 * white above 1 take a contrast. Mid-gray always becomes a lightness from 0 to 1: beyond that,
 * e.g. black −1 and white 0.5, black and white move together until it is 0 or 1.
 */
function rasterLevels(black: number, white: number) {
	const center = clamp((black + white) / 2, 0, 1);
	const range = white - black;
	const room = Math.min(center, 1 - center);
	if (range / 2 <= room) {
		return { brightnessMin: round(center - range / 2), brightnessMax: round(center + range / 2), contrast: 0 };
	}
	// min and max as far apart as they can be around the center, and the contrast for the rest
	const half = Math.max(room, MIN_RASTER_SPAN / 2);
	const min = round(clamp(center - half, 0, 1));
	const max = round(clamp(center + half, 0, 1));
	return { brightnessMin: min, brightnessMax: max, contrast: round(1 - (max - min) / range) };
}

/**
 * `recolor` of the vector map or of the overlay of the imagery. The vector map scales the colors
 * around mid-gray (`contrast`, a factor), then adds a lightness (`brightness`), without clipping
 * in between: black becomes `brightness + (1 − contrast) / 2`, white that plus `contrast`.
 */
function recolor({ saturation, black, white }: MapColors): Options {
	return { saturate: saturation, brightness: round((black + white - 1) / 2), contrast: round(white - black) };
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

/** The builder of `@versatiles/style` that draws a background, and its options. */
export interface BackgroundOptions {
	builder: 'osm' | 'satellite';
	options: Options;
}

/**
 * The options of `@versatiles/style` that draw a background: built from its settings, with its own
 * `options` laid over them, which win where both say something.
 */
export function backgroundOptions(background?: StateBackground): BackgroundOptions {
	const settings = getSettings(background);
	const built = settings.base === 'satellite' ? satelliteOptions(settings) : vectorOptions(settings);
	const own = sanitizeBackground(background)?.options;
	return { builder: settings.base === 'satellite' ? 'satellite' : 'osm', options: own ? merged(built, own) : built };
}

/** Options with others laid over them: objects are merged, everything else is replaced. */
function merged(options: Options, over: Options): Options {
	const result: Options = { ...options };
	for (const [key, value] of Object.entries(over)) {
		const below = result[key];
		result[key] = isObject(value) && isObject(below) ? merged(below, value) : value;
	}
	return result;
}

/**
 * The streets, borders and labels: the options of the vector map itself, or of the overlay of the
 * imagery. Their theme is that of the vector map; the overlay keeps the one of `@versatiles/style`.
 */
function overlayOptions(settings: BackgroundSettings): Options {
	const text: Options = { language: settings.language, scale: settings.labelSize };
	// only another font: the default one is the family of the library, with its bold and italic faces
	if (settings.font !== BACKGROUND_DEFAULTS.font) text.font = settings.font;
	// more space between the labels: fewer of them
	if (settings.labels === 'fewer') text.spacing = FEWER_LABELS_SPACING;
	if (settings.haloWidth !== BACKGROUND_HALO_WIDTHS[settings.base]) {
		for (const path of HALO_GROUPS) {
			let group = text;
			for (const key of path) group = (group[key] ??= {}) as Options;
			group.haloWidth = settings.haloWidth;
		}
	}
	const options: Options = { text };
	const layers: Options = {};
	if (settings.labels === 'none') layers.labels = false;
	if (settings.base === 'satellite') {
		if (!settings.streets) Object.assign(layers, STREETS_HIDDEN());
		if (!settings.borders) Object.assign(layers, BORDERS_HIDDEN());
	}
	if (Object.keys(layers).length > 0) options.layers = layers;
	if (changesColors(settings.colors)) options.recolor = recolor(settings.colors);
	return options;
}

function changesColors(colors: MapColors): boolean {
	return JSON.stringify(colors) !== JSON.stringify(DEFAULT_COLORS);
}

/** The relief of both maps: shaded, and raised as terrain. */
function reliefOf(settings: BackgroundSettings): Options {
	return { ...(settings.hillshade ? { hillshade: true } : {}), ...(settings.terrain ? { terrain: true } : {}) };
}

/** The options of `osm()` for the vector map. A theme that `@versatiles/style` does not have is the default one. */
function vectorOptions(settings: BackgroundSettings): Options {
	let theme = settings.theme;
	if (!(osm.palettes as readonly string[]).includes(theme)) {
		// e.g. renamed or removed by a newer version of the library, or misspelled in a file
		console.warn(`The theme "${theme}" of the background map is unknown, so "${BACKGROUND_DEFAULTS.theme}" is shown`);
		theme = BACKGROUND_DEFAULTS.theme;
	}
	const features = { ...reliefOf(settings), ...(settings.buildings === 'extruded' ? { buildings: 'extruded' } : {}) };
	return { ...overlayOptions(settings), theme, ...(Object.keys(features).length > 0 ? { features } : {}) };
}

/**
 * The options of `satellite()` for the imagery, with its streets, borders and labels over it;
 * without all of them, the imagery alone.
 */
function satelliteOptions(settings: BackgroundSettings): Options {
	const options: Options = {};
	const alone = !settings.streets && !settings.borders && settings.labels === 'none';
	options.osmOverlay = alone ? false : overlayOptions(settings);
	if (changesColors(settings.colors)) {
		const { saturation, black, white } = settings.colors;
		options.raster = { saturation, ...rasterLevels(black, white) };
	}
	const features = reliefOf(settings);
	if (Object.keys(features).length > 0) options.features = features;
	return options;
}
