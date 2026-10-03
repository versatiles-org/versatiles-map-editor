import { describe, expect, it } from 'vitest';
import { formatHex, parseColor } from './color.js';

// the same results as Color.parse(…).asHex() of @versatiles/style, which the codec used before
describe('parseColor and formatHex', () => {
	const hex = (value: string) => {
		const color = parseColor(value);
		return color && formatHex(color);
	};

	it('read hex colors', () => {
		expect(['#f00', '#F00A', '#ff0000', '#FF000080', '#ff0000ff', ' #ff0000 '].map(hex)).toStrictEqual([
			'#ff0000',
			'#ff0000aa',
			'#ff0000',
			'#ff000080',
			'#ff0000',
			'#ff0000'
		]);
	});

	it('read rgb(), hsl() and transparent', () => {
		expect(
			[
				'rgb(1,2,3)',
				'rgba(1,2,3,0.5)',
				'rgb(1 2 3 / 50%)',
				'hsl(120,100%,50%)',
				'hsla(120,100%,50%,0.5)',
				'transparent'
			].map(hex)
		).toStrictEqual(['#010203', '#01020380', '#01020380', '#00ff00', '#00ff0080', '#00000000']);
	});

	it('read the arguments separated by commas, slashes or spaces, in any mix', () => {
		for (const value of ['rgb(1, 2, 3, 0.5)', 'rgb( 1 2\t3 /0.5 )', 'rgba(1,2 , 3/ 50%)', 'rgb(1,,2,3,,0.5)']) {
			expect(hex(value), value).toBe('#01020380');
		}
	});

	it('read long values quickly, e.g. of a hostile file', () => {
		const start = performance.now();
		expect(parseColor(`rgb(1${' '.repeat(1e6)}2 3)`)).toStrictEqual({ r: 1, g: 2, b: 3, alpha: 1 });
		expect(parseColor(`rgb(${' ,'.repeat(5e5)})`)).toBeUndefined();
		// a few milliseconds; generous for slow test machines
		expect(performance.now() - start).toBeLessThan(1000);
	});

	it('reject other values', () => {
		for (const value of ['red', 'notacolor', '#ff00001', '#ggg', 'rgb(1,2)', 'rgb(a,b,c)', 'hsl(x,1%,1%)', '']) {
			expect(parseColor(value)).toBeUndefined();
		}
	});

	it('return the channels', () => {
		expect(parseColor('#FF000080')).toStrictEqual({ r: 255, g: 0, b: 0, alpha: 128 / 255 });
	});
});
