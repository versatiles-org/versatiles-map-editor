import { describe, expect, it } from 'vitest';
import { belowElement, besideElement, keepInViewport } from './popup_position.js';

const viewport = { width: 1000, height: 600 };
const size = { width: 240, height: 400 };

describe('keepInViewport', () => {
	it('keeps a position that fits', () => {
		expect(keepInViewport({ x: 100, y: 50 }, size, viewport)).toStrictEqual({ x: 100, y: 50 });
	});

	it('moves the popup back into the viewport, with a margin', () => {
		expect(keepInViewport({ x: -50, y: -20 }, size, viewport)).toStrictEqual({ x: 8, y: 8 });
		expect(keepInViewport({ x: 900, y: 500 }, size, viewport)).toStrictEqual({ x: 752, y: 192 });
	});

	it('shows the top left of a popup that is larger than the viewport', () => {
		expect(keepInViewport({ x: 300, y: 300 }, size, { width: 200, height: 300 })).toStrictEqual({ x: 8, y: 8 });
	});
});

describe('besideElement', () => {
	const sidebar = { left: 750, top: 44, right: 1000 };

	it('opens left of the element, at the height of the button', () => {
		expect(besideElement(sidebar, 300, size, viewport)).toStrictEqual({ x: 502, y: 192 });
		expect(besideElement(sidebar, 100, size, viewport)).toStrictEqual({ x: 502, y: 100 });
	});

	it('opens right of the element, without room on the left', () => {
		expect(besideElement({ left: 100, top: 0, right: 300 }, 100, size, viewport)).toStrictEqual({ x: 308, y: 100 });
	});
});

describe('belowElement', () => {
	const list = { width: 200, height: 300 };

	it('opens below the element, at its left edge', () => {
		expect(belowElement({ left: 800, top: 100, right: 980, bottom: 128 }, list, viewport)).toStrictEqual({
			x: 792,
			y: 130
		});
	});

	it('opens above the element, without room below', () => {
		expect(belowElement({ left: 500, top: 400, right: 680, bottom: 428 }, list, viewport)).toStrictEqual({
			x: 500,
			y: 98
		});
	});
});
