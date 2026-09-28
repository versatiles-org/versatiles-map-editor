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
	 * Whether the satellite map shows streets, railways and ferries over the imagery. The vector
	 * map always does. Without them and without labels, the satellite map is the imagery alone.
	 */
	streets: boolean;
	/** Color preset of the vector map. */
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
}

/**
 * The changes of the colors that the editor offers, the same for both maps: `recolor` of the vector
 * map, and the raster properties of the satellite imagery.
 */
export interface MapColors {
	/** From -1 (gray) to 1, 0 keeps the colors. */
	saturation: number;
	/**
	 * The lightness that black becomes, and the one that white becomes, from 0 (black) to 1
	 * (white). All other colors are between them, e.g. black 0.5 fades the map with white, and
	 * white 0.5 with black. Black is never lighter than white.
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
	{ id: 'toner', name: 'Black & white' }
];

// Languages of the names in the OSM tiles of tiles.versatiles.org
export const LANGUAGES = ['ar', 'de', 'el', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'uk'];

/** The layer groups of the streets over the imagery, hidden. */
const STREETS_HIDDEN = (): Options => ({ roads: false, transit: false, markings: false });

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
		theme: typeof overlay.theme === 'string' ? overlay.theme : 'colorful',
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
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The colors of a map. The vector map scales the colors around mid-gray (`contrast`, a factor), then
 * adds a lightness (`brightness`), without clipping in between: black becomes
 * `brightness + (1 − contrast) / 2`, white that plus `contrast`. The imagery maps black and white
 * with `brightnessMin` and `brightnessMax`.
 */
function getColors({ builder, options }: StateBackground): MapColors {
	if (builder === 'osm') {
		const recolor = isObject(options.recolor) ? options.recolor : {};
		const contrast = number(recolor.contrast, 1);
		const black = number(recolor.brightness, 0) + (1 - contrast) / 2;
		return levels(number(recolor.saturate, 0), black, black + contrast);
	}
	const raster = isObject(options.raster) ? options.raster : {};
	return levels(number(raster.saturation, 0), number(raster.brightnessMin, 0), number(raster.brightnessMax, 1));
}

function levels(saturation: number, black: number, white: number): MapColors {
	return { saturation, black: round(clamp01(black)), white: round(clamp01(Math.max(black, white))) };
}

/** The options of `@versatiles/style` for the colors; other options of the builder are kept. */
function setColors(builder: StateBackground['builder'], options: Options, colors: MapColors) {
	if (builder === 'osm') {
		setRecolor(options, colors);
		return;
	}
	const { saturation, black, white } = colors;
	// the contrast of the imagery would move black and white again
	const { contrast: _, ...raster } = isObject(options.raster) ? options.raster : {};
	options.raster = { ...raster, saturation, brightnessMin: black, brightnessMax: white };
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
		// The labels and the changes of the colors are kept. The theme of the vector map does not
		// apply to the satellite map.
		const overlay = overlayOf({ builder, options });
		const kept: Options = {};
		if (overlay.text !== undefined) kept.text = overlay.text;
		if (overlay.layers !== undefined) kept.layers = overlay.layers;
		const colors = getColors({ builder, options });
		options = newBuilder === 'osm' ? kept : { osmOverlay: kept };
		builder = newBuilder;
		if (JSON.stringify(colors) !== JSON.stringify(DEFAULT_COLORS)) setColors(builder, options, colors);
	}

	if (change.colors) setColors(builder, options, change.colors);

	let overlay: Options = options;
	if (builder === 'satellite') {
		if (options.osmOverlay === false) {
			// the imagery alone: showing streets or labels again starts the overlay with its defaults,
			// and with the colors of the imagery, but only with what is shown
			const shown = change.streets === true || (change.labels !== undefined && change.labels !== 'none');
			if (!shown) return minimizeBackground({ builder, options });
			const colors = getColors({ builder, options });
			options.osmOverlay = { layers: change.streets ? { labels: false } : STREETS_HIDDEN() };
			setColors(builder, options, colors);
		}
		if (!isObject(options.osmOverlay)) options.osmOverlay = {};
		overlay = options.osmOverlay as Options;
	}
	if (!isObject(overlay.text)) overlay.text = {};
	const text = overlay.text as Options;

	if (change.theme) overlay.theme = change.theme;

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
	if (builder === 'satellite' && change.streets !== undefined) {
		if (!isObject(overlay.layers)) overlay.layers = {};
		const layers = overlay.layers as Options;
		for (const [group, value] of Object.entries(STREETS_HIDDEN())) {
			if (change.streets) delete layers[group];
			else layers[group] = value;
		}
	}
	// neither streets nor labels: the imagery alone, also without borders and points of interest
	if (builder === 'satellite') {
		const { streets, labels } = getSettings({ builder, options });
		if (!streets && labels === 'none') options.osmOverlay = false;
	}

	return minimizeBackground({ builder, options });
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
