import { describe, expect, it } from 'vitest';
import { changeSettings, DEFAULT_COLORS, getSettings, minimizeBackground } from './background.js';

describe('getSettings', () => {
	it('reads the editor default', () => {
		expect(getSettings()).toStrictEqual({
			base: 'vector',
			streets: true,
			theme: 'colorful',
			font: 'noto_sans_regular',
			language: 'user',
			labels: 'normal',
			colors: DEFAULT_COLORS
		});
	});

	it('reads the vector and the satellite map', () => {
		expect(
			getSettings({
				builder: 'osm',
				options: { theme: 'gray', text: { font: 'lato_regular', spacing: 2 } }
			})
		).toStrictEqual({
			base: 'vector',
			streets: true,
			theme: 'gray',
			font: 'lato_regular',
			language: 'local',
			labels: 'fewer',
			colors: DEFAULT_COLORS
		});
		expect(getSettings({ builder: 'satellite', options: { osmOverlay: { layers: { labels: false } } } })).toMatchObject(
			{ base: 'satellite', labels: 'none' }
		);
	});
});

describe('changeSettings', () => {
	it('returns undefined for the editor default', () => {
		expect(changeSettings(undefined, { theme: 'colorful' })).toBeUndefined();
		const gray = changeSettings(undefined, { theme: 'gray' });
		expect(changeSettings(gray, { theme: 'colorful' })).toBeUndefined();
	});

	it('stores the minimized options', () => {
		expect(changeSettings(undefined, { theme: 'muted', font: 'lato_regular', language: 'de' })).toStrictEqual({
			builder: 'osm',
			options: { theme: 'muted', text: { font: 'lato_regular', language: 'de' } }
		});
		expect(changeSettings(undefined, { language: 'local' })).toStrictEqual({ builder: 'osm', options: {} });
	});

	it('sets the number of labels', () => {
		const none = changeSettings(undefined, { labels: 'none' });
		expect(none?.options).toStrictEqual({ text: { language: 'user' }, layers: { labels: false } });
		const fewer = changeSettings(none, { labels: 'fewer' });
		expect(fewer?.options).toStrictEqual({ text: { language: 'user', spacing: 2 } });
		expect(changeSettings(fewer, { labels: 'normal' })).toBeUndefined();
	});

	it('keeps the labels, but not the colors, when switching to the satellite map and back', () => {
		const vector = changeSettings(undefined, { theme: 'gray', language: 'fr', labels: 'fewer' });
		const sat = changeSettings(vector, { base: 'satellite' });
		expect(sat).toStrictEqual({
			builder: 'satellite',
			options: { osmOverlay: { text: { language: 'fr', spacing: 2 } } }
		});
		expect(getSettings(sat)).toMatchObject({ language: 'fr', labels: 'fewer' });
		expect(changeSettings(sat, { base: 'vector' })).toStrictEqual({
			builder: 'osm',
			options: { text: { language: 'fr', spacing: 2 } }
		});
	});

	it('shows the streets and the labels over the imagery independently', () => {
		const sat = changeSettings(undefined, { base: 'satellite', language: 'fr' });
		expect(getSettings(sat)).toMatchObject({ streets: true, labels: 'normal' });

		// labels without streets: the roads, railways, ferries and one-way arrows are hidden
		const labelsOnly = changeSettings(sat, { streets: false });
		expect(labelsOnly?.options.osmOverlay).toStrictEqual({
			text: { language: 'fr' },
			layers: { roads: false, transit: false, markings: false }
		});
		expect(getSettings(labelsOnly)).toMatchObject({ streets: false, labels: 'normal' });

		// streets without labels
		const streetsOnly = changeSettings(sat, { labels: 'none' });
		expect(getSettings(streetsOnly)).toMatchObject({ streets: true, labels: 'none' });

		// neither: the imagery alone
		const imagery = changeSettings(labelsOnly, { labels: 'none' });
		expect(imagery).toStrictEqual({ builder: 'satellite', options: { osmOverlay: false } });
		expect(changeSettings(streetsOnly, { streets: false })).toStrictEqual(imagery);
		expect(getSettings(imagery)).toMatchObject({ base: 'satellite', streets: false, labels: 'none' });
		// hiding more changes nothing
		expect(changeSettings(imagery, { labels: 'none' })).toStrictEqual(imagery);

		// from the imagery alone, each comes back on its own
		expect(getSettings(changeSettings(imagery, { streets: true }))).toMatchObject({ streets: true, labels: 'none' });
		expect(getSettings(changeSettings(imagery, { labels: 'fewer' }))).toMatchObject({
			streets: false,
			labels: 'fewer'
		});

		// the vector map always has its streets
		expect(getSettings(changeSettings(imagery, { base: 'vector' })).streets).toBe(true);
	});

	it('changes the colors of the vector map, and stores only changed values', () => {
		const gray = changeSettings(undefined, { colors: { ...DEFAULT_COLORS, saturation: -1 } });
		expect(gray?.options.recolor).toStrictEqual({ saturate: -1 });
		// black becomes 20 % and white 90 %: a contrast factor, then a lightness added
		const changed = changeSettings(gray, { colors: { saturation: -1, black: 0.2, white: 0.9 } });
		expect(changed?.options.recolor).toStrictEqual({ saturate: -1, brightness: 0.05, contrast: 0.7 });
		expect(getSettings(changed).colors).toStrictEqual({ saturation: -1, black: 0.2, white: 0.9 });
		// back to the unchanged colors: the default background again
		expect(changeSettings(changed, { colors: DEFAULT_COLORS })).toBeUndefined();
	});

	it('maps black and white of the vector map exactly where they are set', () => {
		for (const [black, white] of [
			[0.5, 1],
			[0, 0.3],
			[0.35, 0.35],
			[0.1, 0.75]
		]) {
			const recolor = changeSettings(undefined, { colors: { ...DEFAULT_COLORS, black, white } })!.options.recolor as {
				brightness?: number;
				contrast?: number;
			};
			// as @versatiles/style computes it: scaled around mid-gray, then shifted, without clipping in between
			const channel = (c: number) => (c - 127.5) * (recolor.contrast ?? 1) + 127.5 + 255 * (recolor.brightness ?? 0);
			expect(channel(0)).toBeCloseTo(255 * black);
			expect(channel(255)).toBeCloseTo(255 * white);
		}
	});

	it('reads colors of older maps as black and white', () => {
		const older = { builder: 'osm' as const, options: { recolor: { brightness: 0.1, contrast: 1.5 } } };
		// too much contrast: black and white are kept within black and white
		expect(getSettings(older).colors).toStrictEqual({ saturation: 0, black: 0, white: 1 });
		const faded = { builder: 'osm' as const, options: { recolor: { brightness: 0.25, contrast: 0.5 } } };
		expect(getSettings(faded).colors).toStrictEqual({ saturation: 0, black: 0.5, white: 1 });
	});

	it('changes the colors of the satellite imagery with its raster properties', () => {
		const sat = changeSettings(undefined, { base: 'satellite' });
		const faded = changeSettings(sat, { colors: { saturation: -0.5, black: 0.2, white: 1 } });
		expect(faded?.options.raster).toStrictEqual({ saturation: -0.5, brightnessMin: 0.2 });
		expect(getSettings(faded).colors).toStrictEqual({ saturation: -0.5, black: 0.2, white: 1 });
		const darker = changeSettings(sat, { colors: { ...DEFAULT_COLORS, white: 0.7 } });
		expect(darker?.options.raster).toStrictEqual({ brightnessMax: 0.7 });
		// the contrast of older maps is removed, since it would move black and white again
		const older = { builder: 'satellite' as const, options: { osmOverlay: false, raster: { contrast: 0.4 } } };
		expect(changeSettings(older, { colors: { ...DEFAULT_COLORS, black: 0.1 } })?.options).toStrictEqual({
			osmOverlay: false,
			raster: { brightnessMin: 0.1 }
		});
	});

	it('gives the streets and labels over the imagery the colors of the imagery', () => {
		const sat = changeSettings(undefined, { base: 'satellite' });
		const faded = changeSettings(sat, { colors: { saturation: -1, black: 0.5, white: 1 } });
		expect(faded?.options).toStrictEqual({
			raster: { saturation: -1, brightnessMin: 0.5 },
			osmOverlay: { text: { language: 'user' }, recolor: { saturate: -1, brightness: 0.25, contrast: 0.5 } }
		});
		// the imagery alone keeps its colors, and the overlay gets them again when it is shown
		const imagery = changeSettings(changeSettings(faded, { streets: false }), { labels: 'none' });
		expect(imagery?.options).toStrictEqual({ osmOverlay: false, raster: { saturation: -1, brightnessMin: 0.5 } });
		expect(changeSettings(imagery, { streets: true })?.options).toStrictEqual({
			raster: { saturation: -1, brightnessMin: 0.5 },
			osmOverlay: { layers: { labels: false }, recolor: { saturate: -1, brightness: 0.25, contrast: 0.5 } }
		});
		// and back to the unchanged colors
		expect(changeSettings(faded, { colors: DEFAULT_COLORS })?.options).toStrictEqual({
			osmOverlay: { text: { language: 'user' } }
		});
		// the vector map gets them from the imagery
		expect(changeSettings(faded, { base: 'vector' })?.options.recolor).toStrictEqual({
			saturate: -1,
			brightness: 0.25,
			contrast: 0.5
		});
	});

	it('keeps other options of recolor, and the colors when switching the map', () => {
		const background = { builder: 'osm' as const, options: { recolor: { rotateHue: 90 } } };
		const changed = changeSettings(background, { colors: { ...DEFAULT_COLORS, saturation: -1 } });
		expect(changed?.options.recolor).toStrictEqual({ rotateHue: 90, saturate: -1 });
		const sat = changeSettings(changed, { base: 'satellite' });
		expect(sat?.options.raster).toStrictEqual({ saturation: -1 });
		expect(getSettings(sat).colors).toStrictEqual({ ...DEFAULT_COLORS, saturation: -1 });
		expect(changeSettings(sat, { base: 'vector' })?.options.recolor).toStrictEqual({ saturate: -1 });
	});

	it('keeps options the editor does not offer', () => {
		const background = { builder: 'osm' as const, options: { recolor: { rotateHue: 90 }, text: { scale: 1.5 } } };
		expect(changeSettings(background, { font: 'lato_regular' })?.options).toStrictEqual({
			recolor: { rotateHue: 90 },
			text: { scale: 1.5, font: 'lato_regular' }
		});
	});
});

describe('minimizeBackground', () => {
	it('drops default values', () => {
		expect(
			minimizeBackground({ builder: 'osm', options: { theme: 'colorful', text: { language: 'local' } } })
		).toStrictEqual({
			builder: 'osm',
			options: {}
		});
	});
});
