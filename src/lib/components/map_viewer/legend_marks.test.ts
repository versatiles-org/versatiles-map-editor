import { describe, expect, it } from 'vitest';
import type { StateStyle } from '@versatiles/map-state';
import { drawLine, MARK_WIDTH, textColor } from './legend_marks.js';

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
		expect(textColor({ type: 'area', style: fill, strokeStyle: { color: '#0072b2' }, label: '' })).toBe('#0072b2');
		expect(textColor({ type: 'area', style: fill, strokeStyle: { visible: false }, label: '' })).toBe('#009e73');
		expect(textColor({ type: 'area', style: fill, strokeStyle: { color: '#0072b280' }, label: '' })).toBe('#0072b2');
	});
});

describe('the mark of a line', () => {
	/** Draw the mark on a canvas whose context records the calls, e.g. ["moveTo 2,9", …]. */
	function draw(style: StateStyle): string[] {
		const calls: string[] = [];
		const context = new Proxy(
			{},
			{
				get:
					(_, name: string) =>
					(...args: unknown[]) => {
						calls.push(`${name} ${args.map((a) => (typeof a === 'number' ? Math.round(a * 10) / 10 : a)).join()}`);
					},
				set: () => true
			}
		);
		const canvas = { width: MARK_WIDTH, height: 18, getContext: () => context } as unknown as HTMLCanvasElement;
		drawLine(canvas, style);
		return calls;
	}

	it('has its round ends in the mark', () => {
		const calls = draw({ width: 4 });
		expect(calls).toContain('moveTo 3,9');
		expect(calls).toContain(`lineTo ${MARK_WIDTH - 3},9`);
		expect(calls.some((call) => call.startsWith('fill'))).toBe(false);
	});

	it('has its arrowheads within the mark, pointing outwards', () => {
		const calls = draw({ width: 2, arrowStart: 'circle', arrowEnd: 'triangle' });
		// a circle as wide as 3 times the line, centered on the start, and the triangle's tip at the end
		expect(calls).toContain('moveTo 4,9');
		expect(calls).toContain(`translate ${MARK_WIDTH - 1 - 2.2},9`);
		expect(calls.filter((call) => call.startsWith('rotate'))).toStrictEqual([
			`rotate ${Math.round(Math.PI * 10) / 10}`,
			'rotate 0'
		]);
		expect(calls.filter((call) => call.startsWith('fill'))).toHaveLength(2);
	});

	it('has arrowheads no wider than the mark allows', () => {
		const calls = draw({ width: 6, arrowEnd: 'circle', arrowSize: 8 });
		// a circle 12 pixels wide at most
		expect(calls).toContain(`lineTo ${MARK_WIDTH - 1 - 6},9`);
	});
});
