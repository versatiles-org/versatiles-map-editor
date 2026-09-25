import { describe, expect, it } from 'vitest';
import { ColorPalette, PALETTE_SIZE } from './color_palette.js';

describe('ColorPalette', () => {
	it('lists the used colors once, newest element first', () => {
		const palette = new ColorPalette(() => ['#ff0000', '#00ff00', '#FF0000', '#0000ff']);
		expect(palette.getColors()).toStrictEqual(['#0000ff', '#00ff00', '#ff0000']);
	});

	it('lists recently used colors first', () => {
		const palette = new ColorPalette(() => ['#ff0000', '#00ff00', '#0000ff']);
		palette.use('#00FF00');
		palette.use('#ff0000');
		palette.use('#00ff00');
		expect(palette.getColors()).toStrictEqual(['#00ff00', '#ff0000', '#0000ff']);
	});

	it('skips colors that are no longer used', () => {
		let used = ['#ff0000', '#00ff00'];
		const palette = new ColorPalette(() => used);
		palette.use('#00ff00');
		used = ['#ff0000'];
		expect(palette.getColors()).toStrictEqual(['#ff0000']);
	});

	it('is limited in size', () => {
		const used = Array.from({ length: 40 }, (_, i) => '#0000' + i.toString(16).padStart(2, '0'));
		const palette = new ColorPalette(() => used);
		palette.use(used[0]);
		const colors = palette.getColors();
		expect(colors.length).toBe(PALETTE_SIZE);
		expect(colors[0]).toBe(used[0]);
		expect(colors[1]).toBe(used[39]);
	});
});
