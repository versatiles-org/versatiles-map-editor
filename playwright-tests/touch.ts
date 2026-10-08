import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import type { CDPSession, Page } from '@playwright/test';
import {
	mapCenter,
	menuItem,
	project,
	settledStoredState,
	storedState,
	waitForMapIsIdle,
	waitForMapIsReady,
	type MapWindow,
	type Point
} from './lib/utils.js';

// an iPad-like tablet in landscape
test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

// Playwright can only tap. Drags and pinches need raw touch events, which only Chromium provides.
test.skip(({ browserName }) => browserName !== 'chromium', 'touch gestures require the Chrome DevTools Protocol');

class Touchscreen {
	constructor(private readonly cdp: CDPSession) {}

	static async create(page: Page) {
		return new Touchscreen(await page.context().newCDPSession(page));
	}

	private send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Point[]) {
		return this.cdp.send('Input.dispatchTouchEvent', {
			type,
			touchPoints: points.map(([x, y], id) => ({ x, y, id }))
		});
	}

	/** Move the fingers from `from` to `to` in a few steps. */
	async gesture(from: Point[], to: Point[], steps = 5) {
		await this.send('touchStart', from);
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			await this.send(
				'touchMove',
				from.map(([x, y], j) => [x + (to[j][0] - x) * t, y + (to[j][1] - y) * t])
			);
		}
		await this.send('touchEnd', []);
	}

	drag(from: Point, to: Point, steps?: number) {
		return this.gesture([from], [to], steps);
	}
}

const center: Point = [13.4, 52.5];
// a point on the line, away from its nodes (the center is the midpoint node)
const onLine: Point = [13.375, 52.5];
const points: Point[] = [
	[13.35, 52.5],
	[13.45, 52.5]
];
const line: MapState = { elements: [{ type: 'line', points }] };

const linePoints = async (page: Page) => {
	const element = (await storedState(page)).elements[0];
	return element && 'points' in element ? element.points : [];
};

async function openLine(page: Page) {
	await page.goto('/#' + encodeState(line));
	await waitForMapIsReady(page);
	// select the line by tapping it
	await page.touchscreen.tap(...(await project(page, onLine)));
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
	await waitForMapIsIdle(page);
}

test('dragging elements and nodes with a finger', async ({ page }) => {
	await openLine(page);
	const touch = await Touchscreen.create(page);
	const viewCenter = await mapCenter(page);

	// dragging the selected line moves it instead of the map
	const start = await project(page, onLine);
	await touch.drag(start, [start[0], start[1] + 50]);
	await expect.poll(async () => (await linePoints(page))[0][1]).toBeLessThan(52.5);
	expect((await linePoints(page))[1][1]).toBeCloseTo((await linePoints(page))[0][1], 5);
	expect(await mapCenter(page)).toStrictEqual(viewCenter);

	// a node can be hit with a finger next to it, and dragging it reshapes the line
	await waitForMapIsIdle(page);
	// the final position of the line, not an intermediate one of the drag
	const settled = (await settledStoredState(page)).elements[0] as { points: Point[] };
	const [first, second] = settled.points;
	const node = await project(page, second);
	await touch.drag([node[0] + 8, node[1] + 8], [node[0] + 8, node[1] - 42]);
	await expect.poll(async () => (await linePoints(page))[1][1]).toBeGreaterThan(second[1]);
	expect((await linePoints(page))[0]).toStrictEqual(first);
	expect(await mapCenter(page)).toStrictEqual(viewCenter);

	// dragging next to the line pans the map
	await touch.drag([100, 100], [100, 200]);
	await expect.poll(() => mapCenter(page)).not.toStrictEqual(viewCenter);
});

test('deleting a node with a finger', async ({ page }) => {
	await openLine(page);
	const deleteNode = page.getByRole('button', { name: 'Delete node' });

	// a line needs both of its nodes
	await page.touchscreen.tap(...(await project(page, points[1])));
	await expect(deleteNode).toBeDisabled();

	// tapping the midpoint adds a node, which can be deleted
	await page.touchscreen.tap(...(await project(page, center)));
	await expect.poll(async () => (await linePoints(page)).length).toBe(3);
	await expect(deleteNode).toBeEnabled();
	await deleteNode.tap();
	await expect.poll(async () => (await linePoints(page)).length).toBe(2);
	await expect(deleteNode).toBeHidden();
	// the line is still selected
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
});

test('pinch-zoom on a selected element zooms the map', async ({ page }) => {
	await openLine(page);
	const touch = await Touchscreen.create(page);
	const getZoom = () => page.evaluate(() => (window as unknown as MapWindow).map.getZoom());
	const zoom = await getZoom();

	const [x, y] = await project(page, onLine);
	await touch.gesture(
		[
			[x - 20, y],
			[x + 20, y]
		],
		[
			[x - 120, y],
			[x + 120, y]
		]
	);
	await expect.poll(getZoom).toBeGreaterThan(zoom + 1);
	expect(await linePoints(page)).toStrictEqual(points);
});

test('two fingers and the keyboard turn the map, in the viewer and in the editor', async ({ page }) => {
	const camera = async () => {
		const { bearing, pitch } = await page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			return { bearing: map.getBearing(), pitch: map.getPitch() };
		});
		return { bearing: Math.round(bearing), pitch: Math.round(pitch) };
	};
	const [x, y] = [400, 400];
	/** Two fingers turning around the point between them, by a quarter turn. */
	const rotate = (touch: Touchscreen) =>
		touch.gesture(
			[
				[x - 100, y],
				[x + 100, y]
			],
			[
				[x, y - 100],
				[x, y + 100]
			],
			10
		);
	/** Two fingers side by side, moving up. */
	const tilt = (touch: Touchscreen) =>
		touch.gesture(
			[
				[x - 30, y + 100],
				[x + 30, y + 100]
			],
			[
				[x - 30, y - 100],
				[x + 30, y - 100]
			],
			10
		);

	await test.step('the viewer', async () => {
		await page.goto('/view/#' + encodeState(line));
		await waitForMapIsReady(page);
		const touch = await Touchscreen.create(page);
		await rotate(touch);
		await expect.poll(async () => (await camera()).bearing).not.toBe(0);
		await tilt(touch);
		await expect.poll(async () => (await camera()).pitch).toBeGreaterThan(0);
	});

	await test.step('the editor', async () => {
		await page.goto('about:blank');
		await page.goto('/#' + encodeState(line));
		await waitForMapIsReady(page);
		const touch = await Touchscreen.create(page);
		const zoom = await page.evaluate(() => (window as unknown as MapWindow).map.getZoom());
		await rotate(touch);
		await expect.poll(async () => (await camera()).bearing).not.toBe(0);
		await tilt(touch);
		await expect.poll(async () => (await camera()).pitch).toBeGreaterThan(0);
		// Shift and an arrow key turn it on
		await waitForMapIsIdle(page);
		const before = (await camera()).bearing;
		await page.locator('.maplibregl-canvas').focus();
		await page.keyboard.press('Shift+ArrowLeft');
		await expect.poll(async () => (await camera()).bearing).not.toBe(before);
		await waitForMapIsIdle(page);
		// the zoom stays, and nothing of the map was changed
		expect(await page.evaluate(() => (window as unknown as MapWindow).map.getZoom())).toBeCloseTo(zoom, 0);
		expect(await linePoints(page)).toStrictEqual(points);
	});
});

test('drawing a line with taps and the Finish button', async ({ page }) => {
	await page.goto('/#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);

	await page.getByRole('button', { name: 'Line', exact: true }).tap();
	await page.touchscreen.tap(x - 80, y);
	// two taps, not a double tap, which would finish the line (DOUBLE_PRESS_MS of the editor: 400 ms)
	await page.waitForTimeout(500);
	await page.touchscreen.tap(x + 80, y);
	await page.getByRole('button', { name: 'Finish' }).tap();
	await expect.poll(async () => (await linePoints(page)).length).toBe(2);
	await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
});

test('dragging a handle of the visible area with a finger, a bit off the handle', async ({ page }) => {
	const frame: [number, number, number, number] = [13.35, 52.47, 13.45, 52.53];
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements: [] }));
	await waitForMapIsReady(page);
	await (await menuItem(page, 'Shared map…')).click();
	const touch = await Touchscreen.create(page);

	// 10 pixels off the north-east corner: too far for the mouse, near enough for a finger
	const [x, y] = await project(page, [frame[2], frame[3]]);
	const viewCenter = await mapCenter(page);
	await touch.drag([x + 7, y - 7], [x + 87, y - 67]);
	await expect.poll(async () => (await storedState(page)).frame?.bounds?.[2]).toBeGreaterThan(frame[2]);
	const dragged = (await storedState(page)).frame!.bounds!;
	expect(dragged[0]).toBeCloseTo(frame[0], 4);
	expect(dragged[1]).toBeCloseTo(frame[1], 4);
	expect(dragged[3]).toBeGreaterThan(frame[3]);
	// the map stayed where it was
	expect(await mapCenter(page)).toStrictEqual(viewCenter);

	// elsewhere, the finger moves the map, not the frame
	await touch.drag([x - 200, y + 150], [x - 100, y + 150]);
	await waitForMapIsIdle(page);
	expect((await mapCenter(page))[0]).toBeLessThan(viewCenter[0]);
	expect((await settledStoredState(page)).frame?.bounds).toStrictEqual(dragged);
});

test('dragging elements in the list with a finger, by their handles', async ({ page }) => {
	// more than fit into the drawer, so it scrolls
	const elements = Array.from({ length: 40 }, (_, i) => ({
		type: 'marker' as const,
		point: [13.3 + i * 0.005, 52.5] as Point,
		label: `M${i + 1}`
	}));
	await page.goto('/#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Elements', exact: true }).tap();
	const touch = await Touchscreen.create(page);
	const list = page.getByRole('listbox', { name: 'Elements' });
	const option = (label: string) => list.getByRole('option', { name: new RegExp(`: ${label}$`) });
	const order = async () => (await storedState(page)).elements.map((e) => (e.type === 'marker' ? e.label : undefined));
	const box = async (label: string) => (await option(label).boundingBox())!;
	const scrolled = () => list.evaluate((l) => l.closest('.content')!.scrollTop);

	// on a touch screen, the handles are shown without hovering
	const grip = option('M39').locator('.grip');
	await expect(grip).toHaveCSS('opacity', '1');

	// the list is front to back: M40 … M1; M39 by its handle to the upper edge of M40, the front
	const handle = (await grip.boundingBox())!;
	const [x, y] = [handle.x + handle.width / 2, handle.y + handle.height / 2];
	await touch.drag([x, y], [x, (await box('M40')).y + 3]);
	await expect.poll(async () => (await order()).slice(-2)).toStrictEqual(['M40', 'M39']);
	await expect(list.getByRole('option').first()).toHaveText(/M39/);
	const reordered = await order();

	// a swipe over the rows, off the handles, scrolls the list and moves no element
	expect(await scrolled()).toBe(0);
	const row = await box('M30');
	await touch.drag([row.x + 40, row.y + row.height / 2], [row.x + 40, row.y - 200], 10);
	await expect.poll(scrolled).toBeGreaterThan(100);
	await waitForMapIsIdle(page);
	expect(await order()).toStrictEqual(reordered);
});

test('rearranging the entries of the legend with a finger', async ({ page }) => {
	const entries = ['A', 'B', 'C'].map((label) => ({ type: 'area' as const, style: { color: '#ff0000' }, label }));
	await page.goto('/#' + encodeState({ meta: { legend: { entries } }, elements: [] }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Edit legend' }).tap();
	const touch = await Touchscreen.create(page);
	const handle = (await page.getByRole('group', { name: 'Entry 1' }).locator('.grip').boundingBox())!;
	const last = (await page.getByRole('group', { name: 'Entry 3' }).boundingBox())!;
	const x = handle.x + handle.width / 2;
	await touch.drag([x, handle.y + handle.height / 2], [x, last.y + last.height - 5]);
	await expect
		.poll(async () => (await storedState(page)).meta?.legend?.entries.map((e) => e.label))
		.toStrictEqual(['B', 'C', 'A']);
});

test('taking the style of an element for a legend entry with a tap', async ({ page }) => {
	const legend = { entries: [{ type: 'marker' as const, label: 'Route' }] };
	const elements: MapState['elements'] = [{ type: 'line', points, style: { color: '#d55e00', width: 4 } }];
	await page.goto('/#' + encodeState({ meta: { legend }, elements }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Edit legend' }).tap();
	await page.getByRole('button', { name: 'Open entry 1' }).tap();
	await page.getByRole('button', { name: /Take style from/ }).tap();
	// a finger may be a bit off the line
	const [x, y] = await project(page, onLine);
	await page.touchscreen.tap(x, y + 8);
	await expect
		.poll(async () => (await storedState(page)).meta?.legend?.entries[0])
		.toStrictEqual({ type: 'line', style: { color: '#d55e00', width: 4 }, label: 'Route' });
});
