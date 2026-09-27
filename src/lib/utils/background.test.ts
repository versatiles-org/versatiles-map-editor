import { describe, expect, it } from 'vitest';
import { changeSettings, DEFAULT_COLORS, getSettings, minimizeBackground } from './background.js';

describe('getSettings', () => {
	it('reads the editor default', () => {
		expect(getSettings()).toStrictEqual({
			base: 'vector',
			overlay: true,
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
			overlay: true,
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

	it('shows the satellite imagery without the overlay, and with it again', () => {
		const sat = changeSettings(undefined, { base: 'satellite', language: 'fr' });
		expect(getSettings(sat).overlay).toBe(true);
		const imagery = changeSettings(sat, { overlay: false });
		expect(imagery).toStrictEqual({ builder: 'satellite', options: { osmOverlay: false } });
		expect(getSettings(imagery)).toMatchObject({ base: 'satellite', overlay: false });
		// labels need the overlay
		expect(changeSettings(imagery, { labels: 'none' })).toStrictEqual(imagery);
		// the overlay comes back with its defaults
		expect(changeSettings(imagery, { overlay: true })).toStrictEqual({ builder: 'satellite', options: {} });
		// the vector map always has its streets and labels
		expect(getSettings(changeSettings(imagery, { base: 'vector' })).overlay).toBe(true);
	});

	it('changes the colors of the vector map, and stores only changed values', () => {
		const gray = changeSettings(undefined, { colors: { ...DEFAULT_COLORS, saturation: -1 } });
		expect(gray?.options.recolor).toStrictEqual({ saturate: -1 });
		const changed = changeSettings(gray, { colors: { saturation: -1, brightness: 0.2, contrast: 0.5 } });
		// the contrast of the vector map is a factor
		expect(changed?.options.recolor).toStrictEqual({ saturate: -1, brightness: 0.2, contrast: 1.5 });
		expect(getSettings(changed).colors).toStrictEqual({ saturation: -1, brightness: 0.2, contrast: 0.5 });
		// back to the unchanged colors: the default background again
		expect(changeSettings(changed, { colors: DEFAULT_COLORS })).toBeUndefined();
	});

	it('changes the colors of the satellite imagery with its raster properties', () => {
		const sat = changeSettings(undefined, { base: 'satellite' });
		const brighter = changeSettings(sat, { colors: { saturation: -0.5, brightness: 0.2, contrast: 0.3 } });
		expect(brighter?.options.raster).toStrictEqual({ saturation: -0.5, contrast: 0.3, brightnessMin: 0.2 });
		expect(getSettings(brighter).colors).toStrictEqual({ saturation: -0.5, brightness: 0.2, contrast: 0.3 });
		const darker = changeSettings(sat, { colors: { ...DEFAULT_COLORS, brightness: -0.3 } });
		expect(darker?.options.raster).toStrictEqual({ brightnessMax: 0.7 });
		expect(getSettings(darker).colors.brightness).toBeCloseTo(-0.3);
		// also without the overlay
		const imagery = changeSettings(sat, { overlay: false });
		expect(changeSettings(imagery, { colors: { ...DEFAULT_COLORS, contrast: 0.4 } })?.options).toStrictEqual({
			osmOverlay: false,
			raster: { contrast: 0.4 }
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
