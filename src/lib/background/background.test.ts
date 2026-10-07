import { describe, expect, it, vi } from 'vitest';
import { osm } from '@versatiles/style';
import { BACKGROUND_THEMES, type StateBackground } from '@versatiles/map-state';
import {
	backgroundOptions,
	changeSettings,
	DEFAULT_COLORS,
	getSettings,
	LANGUAGES,
	pushLevels,
	sameBackground,
	startingBackground,
	THEMES
} from './background.js';

/** The options of `@versatiles/style` that draw a background. */
const optionsOf = (background?: StateBackground) => backgroundOptions(background).options;

describe('THEMES', () => {
	it('lists all themes of @versatiles/style, named in words', () => {
		expect(THEMES).toContainEqual({ id: 'colorful', name: 'Colorful' });
		expect(THEMES).toContainEqual({ id: 'gray-dark', name: 'Gray Dark' });
		// a lookalike, and one that is dark without the suffix
		expect(THEMES).toContainEqual({ id: 'positrino-dark', name: 'Positrino Dark' });
		expect(THEMES).toContainEqual({ id: 'fnord', name: 'Fnord' });
		// the dark theme right after its light one
		const ids = THEMES.map((theme) => theme.id);
		expect(ids.indexOf('gray-dark')).toBe(ids.indexOf('gray') + 1);
	});

	it('are those of the format, which stores them by their place in its list', () => {
		// a new theme of @versatiles/style is added at the end of BACKGROUND_THEMES; until then, links store its name
		expect([...osm.palettes]).toStrictEqual([...BACKGROUND_THEMES]);
	});

	it('offers the languages of the format, without the two that are no language', () => {
		expect(LANGUAGES).toContain('de');
		expect(LANGUAGES).not.toContain('user');
		expect(LANGUAGES).not.toContain('local');
	});
});

describe('getSettings', () => {
	const defaults = {
		base: 'vector',
		streets: true,
		borders: true,
		theme: 'colorful',
		font: 'noto_sans_regular',
		language: 'user',
		labels: 'normal',
		labelSize: 1,
		haloWidth: 2,
		colors: DEFAULT_COLORS,
		hillshade: false,
		terrain: false,
		buildings: 'flat'
	};

	it('has the defaults of the editor without a background', () => {
		expect(getSettings()).toStrictEqual(defaults);
		expect(getSettings({})).toStrictEqual(defaults);
	});

	it('has the settings of a background, and the defaults of the others', () => {
		expect(getSettings({ theme: 'gray', labels: 'fewer', colors: { black: 0.3 } })).toStrictEqual({
			...defaults,
			theme: 'gray',
			labels: 'fewer',
			colors: { saturation: 0, black: 0.3, white: 1 }
		});
	});

	it('has a thinner halo over the imagery, unless the background sets one', () => {
		expect(getSettings({ base: 'satellite' })).toMatchObject({ base: 'satellite', haloWidth: 1 });
		expect(getSettings({ base: 'satellite', haloWidth: 2 }).haloWidth).toBe(2);
	});

	it('knows what only one of the base maps has', () => {
		// the vector map always has its streets and borders, the satellite map no buildings of its own
		expect(getSettings({ streets: false, borders: false })).toMatchObject({ streets: true, borders: true });
		expect(getSettings({ base: 'satellite', buildings: 'extruded' }).buildings).toBe('flat');
	});

	it('leaves out the options of @versatiles/style, which are no setting', () => {
		expect(getSettings({ options: { sky: false } })).toStrictEqual(defaults);
	});
});

describe('changeSettings', () => {
	it('sets a setting, and keeps the others', () => {
		const gray = changeSettings(undefined, { theme: 'gray' });
		expect(gray).toStrictEqual({ theme: 'gray' });
		expect(changeSettings(gray, { labels: 'none' })).toStrictEqual({ theme: 'gray', labels: 'none' });
		expect(changeSettings(gray, { theme: 'gray-dark' })).toStrictEqual({ theme: 'gray-dark' });
	});

	it('returns undefined for the editor default, which is not stored', () => {
		expect(changeSettings(undefined, { theme: 'colorful' })).toBeUndefined();
		expect(changeSettings({ theme: 'gray' }, { theme: 'colorful' })).toBeUndefined();
		expect(changeSettings({ labels: 'fewer' }, { labels: 'normal' })).toBeUndefined();
		expect(changeSettings({ colors: { black: 0.2 } }, { colors: DEFAULT_COLORS })).toBeUndefined();
	});

	it('stores only what differs from the defaults', () => {
		const colors = { saturation: -1, black: 0, white: 1 };
		expect(changeSettings(undefined, { colors })).toStrictEqual({ colors: { saturation: -1 } });
		expect(changeSettings(undefined, { haloWidth: 2, labelSize: 1.5 })).toStrictEqual({ labelSize: 1.5 });
	});

	it('keeps the labels, the colors and the relief when the base map changes, not what the other map has', () => {
		const vector: StateBackground = {
			theme: 'gray',
			labels: 'fewer',
			language: 'de',
			colors: { saturation: -0.5 },
			hillshade: true,
			buildings: 'extruded'
		};
		const satellite = changeSettings(vector, { base: 'satellite' });
		expect(satellite).toStrictEqual({
			base: 'satellite',
			labels: 'fewer',
			language: 'de',
			colors: { saturation: -0.5 },
			hillshade: true
		});
		const hidden = changeSettings(changeSettings(satellite, { streets: false }), { borders: false });
		expect(hidden).toMatchObject({ streets: false, borders: false });
		// back: the vector map always has its streets and borders
		expect(changeSettings(hidden, { base: 'vector' })).toStrictEqual({
			labels: 'fewer',
			language: 'de',
			colors: { saturation: -0.5 },
			hillshade: true
		});
	});

	it('keeps the options of @versatiles/style that a background has', () => {
		const background: StateBackground = { options: { sky: false } };
		expect(changeSettings(background, { theme: 'gray' })).toStrictEqual({ theme: 'gray', options: { sky: false } });
	});
});

describe('backgroundOptions', () => {
	it('builds the vector map, with labels in the language of the browser by default', () => {
		expect(backgroundOptions()).toStrictEqual({
			builder: 'osm',
			options: { text: { language: 'user', scale: 1 }, theme: 'colorful' }
		});
		expect(optionsOf({ theme: 'gray-dark', language: 'de' })).toStrictEqual({
			text: { language: 'de', scale: 1 },
			theme: 'gray-dark'
		});
	});

	it('shows the default theme for one that @versatiles/style does not have, e.g. a renamed one', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(optionsOf({ theme: 'crate' }).theme).toBe('colorful');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"crate"'));
		warn.mockRestore();
	});

	it('sets the labels: how many, their font, their size and their halo', () => {
		expect(optionsOf({ labels: 'fewer' }).text).toStrictEqual({ language: 'user', scale: 1, spacing: 2 });
		expect(optionsOf({ labels: 'none' }).layers).toStrictEqual({ labels: false });
		// only another font: the default one is the family of the library, with its bold and italic faces
		expect(optionsOf({ font: 'lato_regular', labelSize: 1.5 }).text).toStrictEqual({
			language: 'user',
			scale: 1.5,
			font: 'lato_regular'
		});
		// the halo of the labels of places, borders, streets, water and transit stops
		expect(optionsOf({ haloWidth: 0.5 }).text).toStrictEqual({
			language: 'user',
			scale: 1,
			places: { haloWidth: 0.5 },
			boundaries: { haloWidth: 0.5 },
			streets: { names: { haloWidth: 0.5 } },
			water: { haloWidth: 0.5 },
			pois: { transit: { haloWidth: 0.5 } }
		});
	});

	it('builds the satellite map with streets, borders and labels over the imagery, independently', () => {
		expect(backgroundOptions({ base: 'satellite' })).toStrictEqual({
			builder: 'satellite',
			options: { osmOverlay: { text: { language: 'user', scale: 1 } } }
		});
		const overlay = (background: StateBackground) => optionsOf(background).osmOverlay as { layers?: object };
		expect(overlay({ base: 'satellite', streets: false }).layers).toStrictEqual({
			roads: false,
			transit: false,
			markings: false,
			pois: false
		});
		expect(overlay({ base: 'satellite', borders: false }).layers).toStrictEqual({ boundaries: false });
		expect(overlay({ base: 'satellite', borders: false, labels: 'none' }).layers).toStrictEqual({
			labels: false,
			boundaries: false
		});
		// none of them: the imagery alone
		expect(optionsOf({ base: 'satellite', streets: false, borders: false, labels: 'none' })).toStrictEqual({
			osmOverlay: false
		});
		// the theme of the vector map is not that of the overlay
		expect(overlay({ base: 'satellite', theme: 'gray-dark' })).not.toHaveProperty('theme');
	});

	it('changes the colors of the vector map: a contrast factor, then a lightness added', () => {
		expect(optionsOf({ colors: { saturation: -1 } }).recolor).toStrictEqual({
			saturate: -1,
			brightness: 0,
			contrast: 1
		});
		// black becomes 20 % and white 90 %
		expect(optionsOf({ colors: { saturation: -1, black: 0.2, white: 0.9 } }).recolor).toStrictEqual({
			saturate: -1,
			brightness: 0.05,
			contrast: 0.7
		});
		expect(optionsOf({ theme: 'gray' })).not.toHaveProperty('recolor');
	});

	it('maps black and white of the vector map exactly where they are set', () => {
		for (const [black, white] of [
			[0.5, 1],
			[0, 0.3],
			[0.35, 0.35],
			[0.1, 0.75],
			[-1, 2],
			[-0.5, 0.5],
			[1, 2],
			[-1, 0]
		]) {
			const recolor = optionsOf({ colors: { black, white } }).recolor as { brightness: number; contrast: number };
			// as @versatiles/style computes it: scaled around mid-gray, then shifted, without clipping in between
			const channel = (c: number) => (c - 127.5) * recolor.contrast + 127.5 + 255 * recolor.brightness;
			expect(channel(0)).toBeCloseTo(255 * black);
			expect(channel(255)).toBeCloseTo(255 * white);
		}
	});

	it('changes the colors of the imagery with its raster properties, and those of what is over it alike', () => {
		const faded = optionsOf({ base: 'satellite', colors: { saturation: -1, black: 0.5 } });
		expect(faded.raster).toStrictEqual({ saturation: -1, brightnessMin: 0.5, brightnessMax: 1, contrast: 0 });
		expect((faded.osmOverlay as { recolor: object }).recolor).toStrictEqual({
			saturate: -1,
			brightness: 0.25,
			contrast: 0.5
		});
		// the imagery alone has only its own
		const alone = optionsOf({
			base: 'satellite',
			streets: false,
			borders: false,
			labels: 'none',
			colors: { white: 0.7 }
		});
		expect(alone).toStrictEqual({
			osmOverlay: false,
			raster: { saturation: 0, brightnessMin: 0, brightnessMax: 0.7, contrast: 0 }
		});
	});

	/** The lightness of a channel from 0 to 1, as MapLibre's raster shader computes it, clipped at the end. */
	function rasterChannel(raster: Record<string, number>, c: number): number {
		const contrast = raster.contrast ?? 0;
		const factor = contrast > 0 ? 1 / (1 - contrast) : 1 + contrast;
		const min = raster.brightnessMin ?? 0;
		const max = raster.brightnessMax ?? 1;
		return Math.min(1, Math.max(0, min + (max - min) * ((c - 0.5) * factor + 0.5)));
	}

	it('maps black and white of the imagery exactly where they are set, also beyond black and white', () => {
		for (const [black, white] of [
			[0.2, 0.9],
			[-1, 2],
			[-0.5, 1],
			[0, 1.5],
			[-0.3, 0.5],
			[0.3, 1.7],
			[-1, 1],
			[0.4, 0.4]
		]) {
			const raster = optionsOf({ base: 'satellite', colors: { black, white } }).raster as Record<string, number>;
			for (const key of ['brightnessMin', 'brightnessMax', 'contrast']) {
				expect(raster[key], key).toBeGreaterThanOrEqual(key === 'contrast' ? -1 : 0);
				expect(raster[key], key).toBeLessThan(key === 'contrast' ? 1 : 1.0001);
			}
			// clipped, as the map shows it; within 1 %, since a contrast near 1 is rounded
			for (const c of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
				const expected = Math.min(1, Math.max(0, black + (white - black) * c));
				expect(Math.abs(rasterChannel(raster, c) - expected), `${black}…${white} at ${c}`).toBeLessThan(0.01);
			}
		}
	});

	it('shades the relief and raises the terrain on both maps, and the buildings of the vector map', () => {
		expect(optionsOf({ hillshade: true }).features).toStrictEqual({ hillshade: true });
		expect(optionsOf({ hillshade: true, terrain: true, buildings: 'extruded' }).features).toStrictEqual({
			hillshade: true,
			terrain: true,
			buildings: 'extruded'
		});
		expect(optionsOf({ base: 'satellite', terrain: true, buildings: 'extruded' }).features).toStrictEqual({
			terrain: true
		});
		expect(optionsOf({ theme: 'gray' })).not.toHaveProperty('features');
	});

	it('lays the options of the background over those of its settings, which they replace where both say something', () => {
		const background: StateBackground = {
			theme: 'gray',
			terrain: true,
			options: { theme: 'toner', sky: false, text: { spacing: 3 }, features: { terrain: { exaggeration: 2 } } }
		};
		expect(optionsOf(background)).toStrictEqual({
			text: { language: 'user', scale: 1, spacing: 3 },
			theme: 'toner',
			sky: false,
			features: { terrain: { exaggeration: 2 } }
		});
	});
});

describe('startingBackground', () => {
	it('is the background of the configuration, with its language for the labels', () => {
		expect(startingBackground()).toBeUndefined();
		expect(startingBackground(undefined, 'user')).toBeUndefined();
		expect(startingBackground(undefined, 'de')).toStrictEqual({ language: 'de' });
		expect(startingBackground({ theme: 'gray' }, 'de')).toStrictEqual({ theme: 'gray', language: 'de' });
	});

	it('keeps a language that the background names itself, also the default one', () => {
		expect(startingBackground({ language: 'local' }, 'de')).toStrictEqual({ language: 'local' });
		expect(startingBackground({ theme: 'gray', language: 'user' }, 'de')).toStrictEqual({ theme: 'gray' });
	});
});

describe('sameBackground', () => {
	it('compares the settings, not the objects, and knows the defaults', () => {
		expect(sameBackground({ theme: 'gray', labels: 'none' }, { labels: 'none', theme: 'gray' })).toBe(true);
		expect(sameBackground(undefined, {})).toBe(true);
		expect(sameBackground(undefined, { theme: 'colorful', haloWidth: 2 })).toBe(true);
		expect(sameBackground({ theme: 'gray' }, undefined)).toBe(false);
		expect(sameBackground({ theme: 'gray' }, { theme: 'gray', options: { sky: false } })).toBe(false);
	});
});

describe('pushLevels', () => {
	const colors = (black: number, white: number) => ({ saturation: 0, black, white });

	it('keeps black from being lighter than white, on both maps', () => {
		for (const base of ['vector', 'satellite'] as const) {
			expect(pushLevels(colors(0.6, 0.5), 'black', base)).toStrictEqual(colors(0.6, 0.6));
			expect(pushLevels(colors(0.6, 0.5), 'white', base)).toStrictEqual(colors(0.5, 0.5));
		}
	});

	it('moves black and white together on the satellite map, where mid-gray stays from 0 to 1', () => {
		// white 200 %, then black 50 %: mid-gray would be 125 %, so white comes down to 150 %
		expect(pushLevels(colors(0.5, 2), 'black', 'satellite')).toStrictEqual(colors(0.5, 1.5));
		// black −100 %, then white 50 %: mid-gray would be −25 %, so black comes up to −50 %
		expect(pushLevels(colors(-1, 0.5), 'white', 'satellite')).toStrictEqual(colors(-0.5, 0.5));
		// within the range nothing moves
		expect(pushLevels(colors(-1, 2), 'black', 'satellite')).toStrictEqual(colors(-1, 2));
		// the vector map can show all of them
		expect(pushLevels(colors(0.5, 2), 'black', 'vector')).toStrictEqual(colors(0.5, 2));
	});
});
