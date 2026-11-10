import { beforeEach, describe, expect, it, vi } from 'vitest';
import { osm, satellite } from '@versatiles/style';
import { BACKGROUND_COLOR_DEFAULTS } from '../profile.js';
import type { StateBackground } from '../types.js';
import { backgroundOptions, backgroundSettings, backgroundStyle, type BackgroundStyleOptions } from './background.js';

vi.mock('@versatiles/style', { spy: true });

/** The options of `@versatiles/style` that draw a background. */
const optionsOf = (background?: StateBackground) => backgroundOptions(background).options;

describe('backgroundSettings', () => {
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
		colors: BACKGROUND_COLOR_DEFAULTS,
		hillshade: false,
		terrain: false,
		buildings: 'flat'
	};

	it('has the defaults of the editor without a background', () => {
		expect(backgroundSettings()).toStrictEqual(defaults);
		expect(backgroundSettings({})).toStrictEqual(defaults);
	});

	it('has the settings of a background, and the defaults of the others', () => {
		expect(backgroundSettings({ theme: 'gray', labels: 'fewer', colors: { black: 0.3 } })).toStrictEqual({
			...defaults,
			theme: 'gray',
			labels: 'fewer',
			colors: { saturation: 0, black: 0.3, white: 1 }
		});
	});

	it('has a thinner halo over the imagery, unless the background sets one', () => {
		expect(backgroundSettings({ base: 'satellite' })).toMatchObject({ base: 'satellite', haloWidth: 1 });
		expect(backgroundSettings({ base: 'satellite', haloWidth: 2 }).haloWidth).toBe(2);
	});

	it('knows what only one of the base maps has', () => {
		// the vector map always has its streets and borders, the satellite map no buildings of its own
		expect(backgroundSettings({ streets: false, borders: false })).toMatchObject({ streets: true, borders: true });
		expect(backgroundSettings({ base: 'satellite', buildings: 'extruded' }).buildings).toBe('flat');
	});

	it('leaves out the options of @versatiles/style, which are no setting', () => {
		expect(backgroundSettings({ options: { sky: false } })).toStrictEqual(defaults);
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
		const warn = vi.fn();
		expect(backgroundOptions({ theme: 'crate' }, warn).options.theme).toBe('colorful');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('"crate"'));
		// without a callback, nothing is logged
		const log = vi.spyOn(console, 'warn');
		expect(optionsOf({ theme: 'crate' }).theme).toBe('colorful');
		expect(log).not.toHaveBeenCalled();
		log.mockRestore();
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

const TILES = 'https://tiles.versatiles.org';
const getMapStyle = (background?: StateBackground, options: Partial<BackgroundStyleOptions> = {}) =>
	backgroundStyle(background, { tileServer: TILES, language: 'user', ...options });

describe('the style of the background map', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('backgroundStyle', () => {
		const fixed = { urls: { base: 'https://tiles.versatiles.org' }, projection: 'mercator' };
		// the vector map as the settings build it, with the landcover of low zoom levels by default
		const text = { language: 'user', scale: 1 };
		const vector = { text, theme: 'colorful', features: { landcover: true }, ...fixed };

		it('builds the default background with labels in the browser language', () => {
			getMapStyle();
			expect(osm).toHaveBeenCalledWith(vector);
		});

		it('builds the stored background from its settings', () => {
			getMapStyle({ theme: 'gray' });
			expect(osm).toHaveBeenCalledWith({ ...vector, theme: 'gray' });
			getMapStyle({ base: 'satellite', streets: false, borders: false, labels: 'none' });
			expect(satellite).toHaveBeenCalledWith({ osmOverlay: false, ...fixed });
		});

		it('dims the borders and motorways over the imagery with line-layer-opacity', () => {
			getMapStyle({ base: 'satellite' });
			expect(satellite).toHaveBeenLastCalledWith({ osmOverlay: { text, layerOpacity: true }, ...fixed });
			getMapStyle({ base: 'satellite', options: { osmOverlay: { theme: 'gray', layerOpacity: false } } });
			expect(satellite).toHaveBeenLastCalledWith({
				osmOverlay: { text, theme: 'gray', layerOpacity: true },
				...fixed
			});
			const style = getMapStyle({ base: 'satellite' });
			const dimmed = style.layers.filter(
				(layer) => 'paint' in layer && layer.paint && 'line-layer-opacity' in layer.paint
			);
			expect(dimmed.map((layer) => layer.id).sort()).toStrictEqual([
				'boundary-country',
				'boundary-state',
				'street-motorway'
			]);
		});

		it('takes the tile server of the caller', () => {
			getMapStyle({ options: { urls: { base: 'https://example.com' } } }, { tileServer: 'https://tiles.example.org' });
			expect(osm).toHaveBeenLastCalledWith({ ...vector, urls: { base: 'https://tiles.example.org' } });
		});

		it('draws the labels in the language of the caller, unless the background names one', () => {
			const inLanguage = (language: string) => ({ ...vector, text: { ...text, language } });
			backgroundStyle(undefined, { tileServer: TILES });
			expect(osm).toHaveBeenLastCalledWith(inLanguage('local'));
			getMapStyle(undefined, { language: 'en' });
			expect(osm).toHaveBeenLastCalledWith(inLanguage('en'));
			getMapStyle({ language: 'de' }, { language: 'en' });
			expect(osm).toHaveBeenLastCalledWith(inLanguage('de'));
			getMapStyle({ language: 'local' }, { language: 'en' });
			expect(osm).toHaveBeenLastCalledWith(inLanguage('local'));
			getMapStyle({ base: 'satellite' }, { language: 'en' });
			expect(satellite).toHaveBeenLastCalledWith(
				expect.objectContaining({ osmOverlay: { text: { ...text, language: 'en' }, layerOpacity: true } })
			);
		});

		it('shows the landcover of low zoom levels as the caller says, not the options', () => {
			const landcoverLayers = (style: ReturnType<typeof getMapStyle>) =>
				style.layers.filter((layer) => 'source' in layer && layer.source === 'versatiles-landcover').length;
			const withLandcover = getMapStyle({ options: { features: { landcover: false } } });
			expect(osm).toHaveBeenLastCalledWith(vector);
			const without = getMapStyle({ options: { features: { landcover: true } } }, { landcover: false });
			expect(osm).toHaveBeenLastCalledWith({ ...vector, features: { landcover: false } });
			// the fills drawn from the landcover tiles of low zoom levels
			expect(landcoverLayers(withLandcover)).toBeGreaterThan(0);
			expect(landcoverLayers(without)).toBe(0);
		});

		it('shows the relief only if the tile server has elevation tiles, as the caller says', () => {
			const relief = { hillshade: true, terrain: true };
			const shaded = getMapStyle(relief);
			expect(osm).toHaveBeenLastCalledWith({ ...vector, features: { ...relief, landcover: true } });
			expect(shaded.terrain).toBeDefined();
			expect(shaded.layers.some((layer) => layer.type === 'hillshade')).toBe(true);
			getMapStyle({ base: 'satellite', ...relief });
			expect(satellite).toHaveBeenLastCalledWith(expect.objectContaining({ features: relief }));

			const flat = { terrain: false, hillshade: false };
			const vectorMap = getMapStyle(relief, { elevation: false });
			expect(osm).toHaveBeenLastCalledWith({ ...vector, features: { landcover: true, ...flat } });
			expect(vectorMap.terrain).toBeUndefined();
			expect(vectorMap.layers.some((layer) => layer.type === 'hillshade')).toBe(false);
			const imagery = getMapStyle({ base: 'satellite', ...relief }, { elevation: false });
			expect(satellite).toHaveBeenLastCalledWith(expect.objectContaining({ features: flat }));
			expect(imagery.terrain).toBeUndefined();
		});

		it('never takes the tile server or the projection from the options', () => {
			getMapStyle({ options: { urls: { base: 'https://example.org' }, projection: 'globe' } });
			expect(osm).toHaveBeenCalledWith(vector);
		});

		it('shows the default theme for one that @versatiles/style does not have', () => {
			const onWarning = vi.fn();
			const style = getMapStyle({ theme: 'no such theme' }, { onWarning });
			expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('no such theme'));
			expect(osm).toHaveBeenLastCalledWith(vector);
			expect(style.layers.length).toBeGreaterThan(0);
		});

		it('falls back to the default background for options that @versatiles/style refuses', () => {
			const onWarning = vi.fn();
			const style = getMapStyle({ theme: 'gray', options: { theme: 'no such theme' } }, { onWarning });
			expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('Invalid background map options'));
			expect(osm).toHaveBeenLastCalledWith(vector);
			expect(style.layers.length).toBeGreaterThan(0);
		});
	});
});
