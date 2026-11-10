import { describe, expect, it } from 'vitest';
import { osm } from '@versatiles/style';
import { BACKGROUND_THEMES, type StateBackground } from '@versatiles/map-state';
import {
	changeSettings,
	DEFAULT_COLORS,
	LANGUAGES,
	pushLevels,
	sameBackground,
	startingBackground,
	THEMES
} from './background.js';

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
