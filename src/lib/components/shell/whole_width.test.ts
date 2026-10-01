import { describe, expect, it } from 'vitest';
import { wholeWidth } from './whole_width.js';

describe('wholeWidth', () => {
	it('gives an element its natural width rounded up, and gives it back', () => {
		const element = document.createElement('span');
		// a text of 133.4 pixels, measured without a width of its own
		element.getBoundingClientRect = () => ({ width: element.style.width ? 999 : 133.4 }) as DOMRect;
		const stop = wholeWidth(element);
		expect(element.style.width).toBe('134px');
		stop();
		expect(element.style.width).toBe('');
	});

	it('leaves an element without a width alone, e.g. one that is not shown', () => {
		const element = document.createElement('span');
		element.getBoundingClientRect = () => ({ width: 0 }) as DOMRect;
		wholeWidth(element);
		expect(element.style.width).toBe('');
	});
});
