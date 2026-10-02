import { describe, expect, it } from 'vitest';
import { textColor } from './legend_marks.js';

describe('the text color of a legend entry', () => {
	it('is the color of the symbol or the line, also translucent', () => {
		expect(textColor({ type: 'marker', style: { color: '#0072b280' }, label: '' })).toBe('#0072b280');
		expect(textColor({ type: 'line', style: { color: '#d55e00' }, label: '' })).toBe('#d55e00');
		// the defaults of elements
		expect(textColor({ type: 'marker', label: '' })).toBe('#ff0000');
		expect(textColor({ type: 'line', label: '' })).toBe('#ff0000');
	});

	it('is the opaque color of the outline of an area, else of its fill', () => {
		const fill = { color: '#009e734d' };
		expect(textColor({ type: 'polygon', style: fill, strokeStyle: { color: '#0072b2' }, label: '' })).toBe('#0072b2');
		expect(textColor({ type: 'polygon', style: fill, strokeStyle: { visible: false }, label: '' })).toBe('#009e73');
		expect(textColor({ type: 'polygon', style: fill, strokeStyle: { color: '#0072b280' }, label: '' })).toBe('#0072b2');
	});
});
