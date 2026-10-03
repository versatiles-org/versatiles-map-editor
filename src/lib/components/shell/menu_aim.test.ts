import { describe, expect, it } from 'vitest';
import { inTriangle, MenuAim } from './menu_aim.js';

describe('inTriangle', () => {
	const [a, b, c] = [
		{ x: 0, y: 0 },
		{ x: 10, y: 0 },
		{ x: 0, y: 10 }
	];

	it('is true inside and on the edges, in either direction of the corners', () => {
		expect(inTriangle({ x: 2, y: 2 }, a, b, c)).toBe(true);
		expect(inTriangle({ x: 5, y: 5 }, a, b, c)).toBe(true);
		expect(inTriangle({ x: 2, y: 2 }, a, c, b)).toBe(true);
	});

	it('is false outside', () => {
		expect(inTriangle({ x: 6, y: 6 }, a, b, c)).toBe(false);
		expect(inTriangle({ x: -1, y: 2 }, a, b, c)).toBe(false);
	});
});

describe('MenuAim', () => {
	// a submenu right of the menu, from y 100 to 300
	const submenu = { left: 200, right: 400, top: 100, bottom: 300 };

	it('sees a pointer that moves towards the submenu, not one that moves along the menu', () => {
		const aim = new MenuAim();
		aim.add({ x: 100, y: 120 }, 0);
		// diagonally down towards the submenu, over the next item
		expect(aim.aimsAt({ x: 130, y: 140 }, submenu, 20)).toBe(true);
		// straight down the menu
		expect(aim.aimsAt({ x: 100, y: 160 }, submenu, 20)).toBe(false);
		// away from it
		expect(aim.aimsAt({ x: 80, y: 130 }, submenu, 20)).toBe(false);
	});

	it('sees a submenu left of the menu too', () => {
		const aim = new MenuAim();
		aim.add({ x: 300, y: 120 }, 0);
		expect(aim.aimsAt({ x: 270, y: 140 }, { left: 0, right: 200, top: 100, bottom: 300 }, 20)).toBe(true);
	});

	it('looks only at the last moment, and at nothing without a trail', () => {
		const aim = new MenuAim();
		expect(aim.aimsAt({ x: 130, y: 140 }, submenu, 0)).toBe(false);
		aim.add({ x: 100, y: 120 }, 0);
		// long after: the pointer now moves straight down from here
		aim.add({ x: 130, y: 130 }, 500);
		expect(aim.aimsAt({ x: 130, y: 160 }, submenu, 510)).toBe(false);
	});

	it('forgets where the pointer went before it turned, also before the next position is added', () => {
		const aim = new MenuAim();
		// down the menu to the item of the submenu
		aim.add({ x: 100, y: 60 }, 0);
		aim.add({ x: 100, y: 120 }, 90);
		// then towards the submenu: the pointer enters the next item before its position is added
		aim.add({ x: 110, y: 125 }, 120);
		expect(aim.aimsAt({ x: 130, y: 135 }, submenu, 160)).toBe(true);
	});

	it('takes the direction of the last moves, also right after a quick turn', () => {
		const aim = new MenuAim();
		// quickly down the menu, then diagonally towards the submenu, all within 100 ms
		for (const [x, y, t] of [
			[100, 40, 0],
			[100, 80, 10],
			[100, 120, 20],
			[110, 125, 30],
			[120, 130, 40],
			[130, 135, 50]
		]) {
			aim.add({ x, y }, t);
		}
		expect(aim.aimsAt({ x: 140, y: 140 }, submenu, 60)).toBe(true);
	});
});
