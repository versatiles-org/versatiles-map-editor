import { osm, satellite, type OsmOptions, type SatelliteOptions } from '@versatiles/style';
import type { StateBackground } from '@versatiles/map-state';

/**
 * The few background options the editor offers, as a view on the `@versatiles/style` options of
 * the map. Changing a setting keeps all other options, so maps can use options the editor does
 * not offer (yet).
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
	/** Color preset of the vector map, e.g. "gray", light or `dark`. */
	theme: string;
	/** Whether the vector map has the dark theme of its color preset, e.g. "gray-dark". */
	dark: boolean;
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

export const DEFAULT_COLORS: MapColors = { saturation: 0, black: 0, white: 1 };

/** The editor's default: the vector map with labels in the browser language. */
export const DEFAULT_BACKGROUND: StateBackground = { builder: 'osm', options: { text: { language: 'user' } } };

export const THEMES = [
	{ id: 'colorful', name: 'Colorful' },
	{ id: 'natural', name: 'Natural' },
	{ id: 'muted', name: 'Muted' },
	{ id: 'gray', name: 'Gray' },
	{ id: 'toner', name: 'Toner' }
];

/** The suffix of the dark theme of a color preset of `@versatiles/style`, e.g. "gray-dark". */
const DARK_SUFFIX = '-dark';

/** The color preset of a theme and whether it is its dark theme. Unknown themes are kept as they are. */
function splitTheme(theme: string): { theme: string; dark: boolean } {
	const preset = theme.slice(0, -DARK_SUFFIX.length);
	if (theme.endsWith(DARK_SUFFIX) && THEMES.some((t) => t.id === preset)) return { theme: preset, dark: true };
	return { theme, dark: false };
}

// Languages of the names in the OSM tiles of tiles.versatiles.org
export const LANGUAGES = ['ar', 'de', 'el', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'uk'];

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
/** The halo of these labels: 2 pixels on the vector map, 1 over the imagery. */
const DEFAULT_HALO_WIDTH = { vector: 2, satellite: 1 };

// Fewer labels by keeping more space between them
const FEWER_LABELS_SPACING = 2;

type Options = Record<string, unknown>;

function isObject(value: unknown): value is Options {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The options of the OSM layers: the root for the vector map, the overlay for the satellite map. */
function overlayOf({ builder, options }: StateBackground): Options {
	if (builder === 'osm') return options;
	return isObject(options.osmOverlay) ? options.osmOverlay : {};
}

export function getSettings(background: StateBackground = DEFAULT_BACKGROUND): BackgroundSettings {
	const overlay = overlayOf(background);
	const text = isObject(overlay.text) ? overlay.text : {};
	const layers = isObject(overlay.layers) ? overlay.layers : {};
	const base = background.builder === 'satellite' ? 'satellite' : 'vector';
	const imageryAlone = base === 'satellite' && background.options.osmOverlay === false;
	let labels: BackgroundSettings['labels'] = 'normal';
	if (imageryAlone || layers.labels === false) labels = 'none';
	else if (typeof text.spacing === 'number' && text.spacing > 1) labels = 'fewer';

	return {
		base,
		streets: background.builder !== 'satellite' || (!imageryAlone && layers.roads !== false),
		borders: background.builder !== 'satellite' || (!imageryAlone && layers.boundaries !== false),
		...splitTheme(typeof overlay.theme === 'string' ? overlay.theme : 'colorful'),
		font: typeof text.font === 'string' ? text.font : 'noto_sans_regular',
		language: typeof text.language === 'string' ? text.language : 'local',
		labels,
		labelSize: number(text.scale, 1),
		haloWidth: inherited(text, HALO_GROUPS[0], 'haloWidth') ?? DEFAULT_HALO_WIDTH[base],
		colors: getColors(background)
	};
}

const number = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback);

/**
 * A number set at a path or at one of its parents, the nearest one, e.g. `text.places.haloWidth`
 * or else `text.haloWidth`: minimized options can keep a value shared by all labels at the root.
 */
function inherited(options: Options, path: string[], key: string): number | undefined {
	let value: number | undefined;
	let current: unknown = options;
	for (const step of [undefined, ...path]) {
		if (step !== undefined) current = isObject(current) ? current[step] : undefined;
		if (isObject(current) && typeof current[key] === 'number') value = current[key];
	}
	return value;
}

/** The options at a path, e.g. `text.streets.names`; `create` adds the missing ones. */
function childOf(options: Options, path: string[], create = false): Options {
	let current = options;
	for (const key of path) {
		if (!isObject(current[key])) {
			if (!create) return {};
			current[key] = {};
		}
		current = current[key] as Options;
	}
	return current;
}

/** Rounded, e.g. to keep 0.3 from becoming 0.30000000000000004 in a link. */
const round = (value: number) => Math.round(value * 10000) / 10000 + 0;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * The colors of a map. The vector map scales the colors around mid-gray (`contrast`, a factor), then
 * adds a lightness (`brightness`), without clipping in between: black becomes
 * `brightness + (1 − contrast) / 2`, white that plus `contrast`. The imagery works the same way
 * with a contrast factor (from `contrast`), then `brightnessMin` and `brightnessMax`, see
 * rasterLevels.
 */
function getColors({ builder, options }: StateBackground): MapColors {
	if (builder === 'osm') {
		const recolor = isObject(options.recolor) ? options.recolor : {};
		const contrast = number(recolor.contrast, 1);
		const black = number(recolor.brightness, 0) + (1 - contrast) / 2;
		return levels(number(recolor.saturate, 0), black, black + contrast);
	}
	const raster = isObject(options.raster) ? options.raster : {};
	const min = number(raster.brightnessMin, 0);
	const span = number(raster.brightnessMax, 1) - min;
	const factor = contrastFactor(number(raster.contrast, 0));
	const black = min + (span * (1 - factor)) / 2;
	return levels(number(raster.saturation, 0), black, black + span * factor);
}

function levels(saturation: number, black: number, white: number): MapColors {
	const b = clamp(black, -1, 1);
	return { saturation, black: round(b), white: round(clamp(Math.max(b, white), 0, 2)) };
}

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

/** The factor of MapLibre's `raster-contrast`, from -1 (all gray) to 1 (infinite). */
function contrastFactor(contrast: number): number {
	return contrast > 0 ? 1 / (1 - contrast) : 1 + contrast;
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

/** The options of `@versatiles/style` for the colors; other options of the builder are kept. */
function setColors(builder: StateBackground['builder'], options: Options, colors: MapColors) {
	if (builder === 'osm') {
		setRecolor(options, colors);
		return;
	}
	const { saturation, black, white } = colors;
	const raster = isObject(options.raster) ? options.raster : {};
	options.raster = { ...raster, saturation, ...rasterLevels(black, white) };
	// the streets and labels over the imagery get the same colors (`true` or none: the default overlay)
	if (options.osmOverlay !== false) {
		const overlay = isObject(options.osmOverlay) ? options.osmOverlay : {};
		setRecolor(overlay, colors);
		options.osmOverlay = overlay;
	}
}

/** `recolor` of the vector map or of the overlay of the imagery, see getColors. */
function setRecolor(options: Options, { saturation, black, white }: MapColors) {
	const recolor = isObject(options.recolor) ? options.recolor : {};
	const contrast = round(white - black);
	options.recolor = { ...recolor, saturate: saturation, brightness: round((black + white - 1) / 2), contrast };
}

/**
 * Apply changed settings to the background. Returns undefined for the editor's default
 * background, which is not stored.
 */
export function changeSettings(
	background: StateBackground = DEFAULT_BACKGROUND,
	change: Partial<BackgroundSettings>
): StateBackground | undefined {
	let builder = background.builder;
	let options: Options = structuredClone(background.options);

	const newBuilder = change.base === 'satellite' ? 'satellite' : change.base === 'vector' ? 'osm' : builder;
	if (newBuilder !== builder) {
		options = switchBuilder({ builder, options }, newBuilder);
		builder = newBuilder;
	}

	if (change.colors) setColors(builder, options, change.colors);

	const overlay = overlayFor(builder, options, change);
	// the imagery alone, which stays so
	if (!overlay) return minimizeBackground({ builder, options });
	setText(overlay, change);
	if (builder === 'satellite') {
		setSatelliteLayers(overlay, change);
		// neither streets nor borders nor labels: the imagery alone
		const { streets, borders, labels } = getSettings({ builder, options });
		if (!streets && !borders && labels === 'none') options.osmOverlay = false;
	}

	return minimizeBackground({ builder, options });
}

/**
 * The options of the other builder. The labels and the changes of the colors are kept. The theme
 * of the vector map does not apply to the satellite map.
 */
function switchBuilder(background: StateBackground, builder: StateBackground['builder']): Options {
	const overlay = overlayOf(background);
	const kept: Options = {};
	if (overlay.text !== undefined) kept.text = overlay.text;
	if (overlay.layers !== undefined) kept.layers = overlay.layers;
	// the vector map always has its streets and borders, which only the satellite map can hide
	if (builder === 'osm' && isObject(kept.layers)) {
		const layers: Options = { ...kept.layers };
		for (const group of Object.keys({ ...STREETS_HIDDEN(), ...BORDERS_HIDDEN() })) delete layers[group];
		if (Object.keys(layers).length > 0) kept.layers = layers;
		else delete kept.layers;
	}
	const colors = getColors(background);
	const options = builder === 'osm' ? kept : { osmOverlay: kept };
	if (JSON.stringify(colors) !== JSON.stringify(DEFAULT_COLORS)) setColors(builder, options, colors);
	return options;
}

/**
 * The options of the streets, borders and labels: of the vector map itself, or of the overlay of
 * the imagery. Undefined for the imagery alone that the change does not give any of them again.
 */
function overlayFor(
	builder: StateBackground['builder'],
	options: Options,
	change: Partial<BackgroundSettings>
): Options | undefined {
	if (builder !== 'satellite') return options;
	if (options.osmOverlay === false) {
		// the imagery alone: showing streets, borders or labels again starts the overlay with its
		// defaults, and with the colors of the imagery, but only with what is shown
		const labels = change.labels !== undefined && change.labels !== 'none';
		if (!change.streets && !change.borders && !labels) return undefined;
		const colors = getColors({ builder, options });
		options.osmOverlay = {
			layers: {
				...(change.streets ? {} : STREETS_HIDDEN()),
				...(change.borders ? {} : BORDERS_HIDDEN()),
				...(labels ? {} : { labels: false })
			}
		};
		setColors(builder, options, colors);
	}
	if (!isObject(options.osmOverlay)) options.osmOverlay = {};
	return options.osmOverlay as Options;
}

/** The theme and the labels: their font, size, halo, language and how many. */
function setText(overlay: Options, change: Partial<BackgroundSettings>) {
	if (!isObject(overlay.text)) overlay.text = {};
	const text = overlay.text as Options;

	if (change.theme || change.dark !== undefined) {
		// the color preset and light or dark: a change of one keeps the other
		const current = splitTheme(typeof overlay.theme === 'string' ? overlay.theme : 'colorful');
		const dark = change.dark ?? current.dark;
		overlay.theme = (change.theme || current.theme) + (dark ? DARK_SUFFIX : '');
	}

	if (change.font) text.font = change.font;
	if (change.labelSize !== undefined) text.scale = change.labelSize;
	if (change.haloWidth !== undefined) {
		for (const path of HALO_GROUPS) childOf(text, path, true).haloWidth = change.haloWidth;
	}
	if (change.language) text.language = change.language;
	if (change.labels) {
		if (!isObject(overlay.layers)) overlay.layers = {};
		const layers = overlay.layers as Options;
		if (change.labels === 'none') layers.labels = false;
		else delete layers.labels;
		if (change.labels === 'fewer') text.spacing = FEWER_LABELS_SPACING;
		else delete text.spacing;
	}
}

/** The streets and the borders over the imagery, shown or hidden. */
function setSatelliteLayers(overlay: Options, change: Partial<BackgroundSettings>) {
	for (const [shown, hidden] of [
		[change.streets, STREETS_HIDDEN()],
		[change.borders, BORDERS_HIDDEN()]
	] as const) {
		if (shown === undefined) continue;
		if (!isObject(overlay.layers)) overlay.layers = {};
		const layers = overlay.layers as Options;
		for (const [group, value] of Object.entries(hidden)) {
			if (shown) delete layers[group];
			else layers[group] = value;
		}
	}
}

/**
 * The background of a new map, e.g. of the configuration of this editor instance: `base` with the
 * labels in `language`, unless `base` sets a language itself. Undefined for the editor's default
 * background, which is not stored.
 */
export function startingBackground(
	base: StateBackground = DEFAULT_BACKGROUND,
	language?: string
): StateBackground | undefined {
	const text = overlayOf(base).text;
	if (!language || (isObject(text) && typeof text.language === 'string')) return minimizeBackground(base);
	return changeSettings(base, { language });
}

/** The smallest options that build the same map, or undefined for the editor's default background. */
export function minimizeBackground({ builder, options }: StateBackground): StateBackground | undefined {
	const minimized =
		builder === 'osm'
			? osm.minimizeOptions(options as OsmOptions)
			: satellite.minimizeOptions(options as SatelliteOptions);
	const result: StateBackground = { builder, options: minimized as Options };
	return JSON.stringify(result) === JSON.stringify(DEFAULT_BACKGROUND) ? undefined : result;
}

/** Whether both are the same background map, e.g. to keep the style that shows it. */
export function sameBackground(a: StateBackground | undefined, b: StateBackground | undefined): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}
