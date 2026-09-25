import { describe, expect, it } from 'vitest';
import { changeSettings, getSettings, minimizeBackground } from './background.js';

describe('getSettings', () => {
	it('reads the editor default', () => {
		expect(getSettings()).toStrictEqual({
			base: 'vector',
			theme: 'colorful',
			font: 'noto_sans_regular',
			language: 'user',
			labels: 'normal'
		});
	});

	it('reads the vector and the satellite map', () => {
		expect(
			getSettings({
				builder: 'osm',
				options: { theme: 'gray', text: { font: 'lato_regular', spacing: 2 } }
			})
		).toStrictEqual({ base: 'vector', theme: 'gray', font: 'lato_regular', language: 'local', labels: 'fewer' });
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
