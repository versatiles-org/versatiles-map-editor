import { osm, satellite, type OsmOptions, type SatelliteOptions } from '@versatiles/style';
import type { StateBackground } from '$lib/codec/types.js';

/**
 * The few background options the editor offers, as a view on the `@versatiles/style` options of
 * the map. Changing a setting keeps all other options, so maps can use options the editor does
 * not offer (yet).
 */
export interface BackgroundSettings {
	base: 'vector' | 'satellite';
	/** Color preset of the vector map. */
	theme: string;
	font: string;
	/** "user" (browser language), "local" (local names) or a language code. */
	language: string;
	labels: 'none' | 'fewer' | 'normal';
}

/** The editor's default: the vector map with labels in the browser language. */
export const DEFAULT_BACKGROUND: StateBackground = { builder: 'osm', options: { text: { language: 'user' } } };

export const THEMES = [
	{ id: 'colorful', name: 'Colorful' },
	{ id: 'natural', name: 'Natural' },
	{ id: 'muted', name: 'Muted' },
	{ id: 'gray', name: 'Gray' },
	{ id: 'toner', name: 'Black & white' }
];

// Faces available as map glyphs on tiles.versatiles.org
export const FONTS = [
	{ id: 'noto_sans_regular', name: 'Noto Sans' },
	{ id: 'fira_sans_regular', name: 'Fira Sans' },
	{ id: 'lato_regular', name: 'Lato' },
	{ id: 'libre_baskerville_regular', name: 'Libre Baskerville' },
	{ id: 'merriweather_sans_regular', name: 'Merriweather Sans' },
	{ id: 'nunito_regular', name: 'Nunito' },
	{ id: 'open_sans_regular', name: 'Open Sans' },
	{ id: 'pt_sans_regular', name: 'PT Sans' },
	{ id: 'roboto_regular', name: 'Roboto' },
	{ id: 'source_sans_3_regular', name: 'Source Sans 3' }
];

// Languages of the names in the OSM tiles of tiles.versatiles.org
export const LANGUAGES = ['ar', 'de', 'el', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'uk'];

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
	let labels: BackgroundSettings['labels'] = 'normal';
	if (layers.labels === false) labels = 'none';
	else if (typeof text.spacing === 'number' && text.spacing > 1) labels = 'fewer';

	return {
		base: background.builder === 'satellite' ? 'satellite' : 'vector',
		theme: typeof overlay.theme === 'string' ? overlay.theme : 'colorful',
		font: typeof text.font === 'string' ? text.font : 'noto_sans_regular',
		language: typeof text.language === 'string' ? text.language : 'local',
		labels
	};
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
		// The labels are kept. The colors of the vector map do not apply to the satellite map.
		const overlay = overlayOf({ builder, options });
		const kept: Options = {};
		if (overlay.text !== undefined) kept.text = overlay.text;
		if (overlay.layers !== undefined) kept.layers = overlay.layers;
		options = newBuilder === 'osm' ? kept : { osmOverlay: kept };
		builder = newBuilder;
	}

	let overlay: Options = options;
	if (builder === 'satellite') {
		if (!isObject(options.osmOverlay)) options.osmOverlay = {};
		overlay = options.osmOverlay as Options;
	}
	if (!isObject(overlay.text)) overlay.text = {};
	const text = overlay.text as Options;

	if (change.theme) overlay.theme = change.theme;
	if (change.font) text.font = change.font;
	if (change.language) text.language = change.language;
	if (change.labels) {
		if (!isObject(overlay.layers)) overlay.layers = {};
		const layers = overlay.layers as Options;
		if (change.labels === 'none') layers.labels = false;
		else delete layers.labels;
		if (change.labels === 'fewer') text.spacing = FEWER_LABELS_SPACING;
		else delete text.spacing;
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
