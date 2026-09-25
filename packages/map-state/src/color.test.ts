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
			'#FF0000',
			'#FF0000AA',
			'#FF0000',
			'#FF000080',
			'#FF0000',
			'#FF0000'
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
		).toStrictEqual(['#010203', '#01020380', '#01020380', '#00FF00', '#00FF0080', '#00000000']);
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
