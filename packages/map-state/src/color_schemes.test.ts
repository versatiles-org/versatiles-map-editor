import { describe, expect, it } from 'vitest';
import { BUILT_IN_COLOR_BITS, BUILT_IN_COLORS, COLOR_SCHEMES } from './color_schemes.js';
import { StateReader } from './reader.js';
import { StateWriter } from './writer.js';

describe('COLOR_SCHEMES', () => {
	it('have unique ids and 6 to 10 distinct lowercase hex colors', () => {
		expect(new Set(COLOR_SCHEMES.map((s) => s.id)).size).toBe(COLOR_SCHEMES.length);
		for (const { colors } of COLOR_SCHEMES) {
			expect(colors.length).toBeGreaterThanOrEqual(6);
			expect(colors.length).toBeLessThanOrEqual(10);
			expect(new Set(colors).size).toBe(colors.length);
			for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
		}
	});
});

describe('the built-in colors', () => {
	it('fit their index', () => {
		expect(BUILT_IN_COLORS.length).toBeLessThanOrEqual(2 ** BUILT_IN_COLOR_BITS);
		expect(new Set(BUILT_IN_COLORS).size).toBe(BUILT_IN_COLORS.length);
	});

	it('keep their order, since links store their index', () => {
		// new schemes may add colors at the end
		expect(BUILT_IN_COLORS.slice(0, 51).join(' ')).toMatchInlineSnapshot(
			`"#4477aa #ee6677 #228833 #ccbb44 #66ccee #aa3377 #bbbbbb #cc6677 #332288 #ddcc77 #117733 #88ccee #882255 #44aa99 #999933 #aa4499 #e69f00 #56b4e9 #009e73 #f0e442 #0072b2 #d55e00 #cc79a7 #000000 #e41a1c #377eb8 #4daf4a #984ea3 #ff7f00 #ffff33 #a65628 #f781bf #999999 #1b9e77 #d95f02 #7570b3 #e7298a #66a61e #e6ab02 #a6761d #666666 #fbb4ae #b3cde3 #ccebc5 #decbe4 #fed9a6 #ffffcc #e5d8bd #fddaec #f2f2f2 #ffffff"`
		);
	});

	it('cost 8 bits in a palette, a color of their own 26, each 8 more with alpha', () => {
		const bits = (color: string) => {
			const writer = new StateWriter();
			writer.writePaletteColor(color);
			return writer.bits.length;
		};
		expect([bits('#0072b2'), bits('#0072b24d'), bits('#00664a'), bits('#00664a80')]).toStrictEqual([8, 16, 26, 34]);
	});

	it('are read with their alpha, like other colors', () => {
		const colors = ['#0072b2', '#0072b24d', '#ffffff', '#00664a', '#00664a80', '#0072B2'];
		const writer = new StateWriter();
		for (const color of colors) writer.writePaletteColor(color);
		const reader = new StateReader(writer.bits);
		expect(colors.map(() => reader.readPaletteColor())).toStrictEqual([
			'#0072b2',
			'#0072b24d',
			'#ffffff',
			'#00664a',
			'#00664a80',
			'#0072b2'
		]);
	});

	it('reject an index beyond the list', () => {
		const writer = new StateWriter();
		writer.writeBit(true);
		writer.writeInteger(63, BUILT_IN_COLOR_BITS);
		writer.writeBit(false);
		expect(() => new StateReader(writer.bits).readPaletteColor()).toThrow('Invalid built-in color: 63');
	});
});
