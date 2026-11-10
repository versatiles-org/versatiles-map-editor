/**
 * The background map: its settings with their defaults, the options of `@versatiles/style` that
 * draw it, and its style for a tile server.
 */
import { osm, satellite, type OsmOptions, type SatelliteOptions, type StyleSpecification } from '@versatiles/style';
import {
	BACKGROUND_COLOR_DEFAULTS,
	BACKGROUND_DEFAULTS,
	BACKGROUND_HALO_WIDTHS,
	sanitizeBackground
} from '../profile.js';
import type { StateBackground } from '../types.js';

/**
 * The settings of the background map, each with a value: those of the map (`StateBackground`),
 * and the defaults of the others.
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
 * The changes of the colors, the same for both maps: `recolor` of the vector map, and the raster
 * properties of the satellite imagery.
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

/** The layer groups of the streets over the imagery, hidden, with the symbols of points of interest along them. */
const STREETS_HIDDEN = (): Options => ({ roads: false, transit: false, markings: false, pois: false });
/** The layer group of the borders over the imagery, hidden. */
const BORDERS_HIDDEN = (): Options => ({ boundaries: false });

/**
 * The labels whose halo width the settings set: those of places, borders, streets, water and
 * transit stops. The others keep theirs, e.g. the thin halos of the points of interest and of the
 * numbers on road shields of the vector map.
 */
const HALO_GROUPS = [['places'], ['boundaries'], ['streets', 'names'], ['water'], ['pois', 'transit']];

// Fewer labels by keeping more space between them
const FEWER_LABELS_SPACING = 2;

type Options = Record<string, unknown>;

/** Told what is not drawn as the background says, e.g. an unknown theme; the package itself logs nothing. */
export type OnWarning = (message: string) => void;

function isObject(value: unknown): value is Options {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The settings of a background, each with a value: its own, else the default. */
export function backgroundSettings(background?: StateBackground): BackgroundSettings {
	const own = sanitizeBackground(background) ?? {};
	const base = own.base ?? BACKGROUND_DEFAULTS.base;
	const { options: _options, ...settings } = own;
	return {
		...BACKGROUND_DEFAULTS,
		haloWidth: BACKGROUND_HALO_WIDTHS[base],
		...settings,
		base,
		colors: { ...BACKGROUND_COLOR_DEFAULTS, ...own.colors },
		// what only one of the base maps has
		...(base === 'vector' ? { streets: true, borders: true } : { buildings: 'flat' as const })
	};
}

/** Rounded, e.g. to keep 0.3 from becoming 0.30000000000000004 in an option. */
const round = (value: number) => Math.round(value * 10000) / 10000 + 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

/** The builder of `@versatiles/style` that draws a background, and its options. */
export interface BackgroundOptions {
	builder: 'osm' | 'satellite';
	options: Options;
}

/**
 * The options of `@versatiles/style` that draw a background: built from its settings, with its own
 * `options` laid over them, which win where both say something. A theme that `@versatiles/style`
 * does not have is the default one, with a warning.
 */
export function backgroundOptions(background?: StateBackground, onWarning?: OnWarning): BackgroundOptions {
	const settings = backgroundSettings(background);
	const built = settings.base === 'satellite' ? satelliteOptions(settings) : vectorOptions(settings, onWarning);
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
	return JSON.stringify(colors) !== JSON.stringify(BACKGROUND_COLOR_DEFAULTS);
}

/** The relief of both maps: shaded, and raised as terrain. */
function reliefOf(settings: BackgroundSettings): Options {
	return { ...(settings.hillshade ? { hillshade: true } : {}), ...(settings.terrain ? { terrain: true } : {}) };
}

/** The options of `osm()` for the vector map. A theme that `@versatiles/style` does not have is the default one. */
function vectorOptions(settings: BackgroundSettings, onWarning?: OnWarning): Options {
	let theme = settings.theme;
	if (!(osm.palettes as readonly string[]).includes(theme)) {
		// e.g. renamed or removed by a newer version of the library, or misspelled in a file
		onWarning?.(`The theme "${theme}" of the background map is unknown, so "${BACKGROUND_DEFAULTS.theme}" is shown`);
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

/** What `backgroundStyle` needs to know of the tile server, and the language of the labels. */
export interface BackgroundStyleOptions {
	/** The tile server of the tiles, fonts and sprites, e.g. "https://tiles.versatiles.org". */
	tileServer: string;
	/**
	 * Whether the vector map shows the landcover of low zoom levels (forests, ice, …), which needs
	 * the landcover tiles of the tile server, like those of tiles.versatiles.org.
	 * @default true
	 */
	landcover?: boolean;
	/**
	 * Whether the map can show the relief of a background that asks for it, which needs the
	 * elevation tiles of the tile server, like those of tiles.versatiles.org.
	 * @default true
	 */
	elevation?: boolean;
	/**
	 * The language of the labels of a background in the language of its viewer ("user"), which a
	 * server does not know: "local" (the local names), a language code, e.g. "en", or "user" in a
	 * browser. A background that names a language keeps it.
	 * @default "local"
	 */
	language?: string;
	/** Told what is not drawn as the background says, e.g. options that `@versatiles/style` refuses. */
	onWarning?: OnWarning;
}

/**
 * The streets, borders and labels over the imagery, as the options have them, with borders and
 * motorways dimmed by `line-layer-opacity`, so where a line overlaps itself (e.g. the two
 * carriageways of a motorway) it does not show brighter. MapLibre GL JS has it from version 6; a
 * renderer without it draws the lines as if it were not there. `false`: the imagery alone.
 */
function overlayOf(options: SatelliteOptions): SatelliteOptions['osmOverlay'] {
	const overlay = options.osmOverlay ?? true;
	if (overlay === false) return false;
	return { ...(overlay === true ? {} : overlay), layerOpacity: true };
}

/**
 * The style of the background map, as the viewer shows it. The tile server and the projection
 * (Mercator) are the caller's, never those of the (shared) options, so a map cannot load tiles or
 * fonts from other servers; so are the way the overlay of the imagery is drawn (see `overlayOf`),
 * and whether the vector map shows the landcover of low zoom levels. A server without elevation
 * tiles shows no relief, whatever the background says. Options that `@versatiles/style` refuses,
 * e.g. of a newer version, draw the default background, with a warning.
 */
export function backgroundStyle(
	background: StateBackground | undefined,
	{ tileServer, landcover = true, elevation = true, language = 'local', onWarning }: BackgroundStyleOptions
): StyleSpecification {
	const fixed = { urls: { base: tileServer }, projection: 'mercator' as const };
	const flat = elevation ? {} : { terrain: false, hillshade: false };
	const vector = (options: OsmOptions) =>
		osm({ ...options, features: { ...options.features, landcover, ...flat }, ...fixed });
	// the language of the viewer, unless the background names one
	const inLanguage = (bg?: StateBackground) =>
		backgroundSettings(bg).language === BACKGROUND_DEFAULTS.language ? { ...bg, language } : bg;
	try {
		const built = backgroundOptions(inLanguage(background), onWarning);
		if (built.builder === 'satellite') {
			const options = built.options as SatelliteOptions;
			const features = elevation ? {} : { features: { ...options.features, ...flat } };
			return satellite({ ...options, ...features, osmOverlay: overlayOf(options), ...fixed });
		}
		return vector(built.options as OsmOptions);
	} catch (error) {
		// e.g. `options` of the background that this version of @versatiles/style does not have
		onWarning?.(`Invalid background map options, so the default background is shown: ${(error as Error).message}`);
		return vector(backgroundOptions(inLanguage()).options as OsmOptions);
	}
}
