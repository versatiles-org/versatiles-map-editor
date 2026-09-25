import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import type { CDPSession, Page } from '@playwright/test';
import { stateInUrl, waitForMapIsIdle, waitForMapIsReady } from './lib/utils';

// an iPad-like tablet in landscape
test.use({ hasTouch: true, viewport: { width: 1024, height: 768 } });

// Playwright can only tap. Drags and pinches need raw touch events, which only Chromium provides.
test.skip(({ browserName }) => browserName !== 'chromium', 'touch gestures require the Chrome DevTools Protocol');

type Point = [number, number];

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

	drag(from: Point, to: Point) {
		return this.gesture([from], [to]);
	}
}

const center: Point = [13.4, 52.5];
// a point on the line, away from its nodes (the center is the midpoint node)
const onLine: Point = [13.375, 52.5];
const points: Point[] = [
	[13.35, 52.5],
	[13.45, 52.5]
];
const line: MapState = { map: { center, radius: 10000 }, elements: [{ type: 'line', points }] };

async function project(page: Page, point: Point): Promise<Point> {
	return page.evaluate((point) => {
		const { x, y } = (window as unknown as { map: import('maplibre-gl').Map }).map.project(point);
		return [x, y] as Point;
	}, point);
}

async function mapCenter(page: Page): Promise<Point> {
	return page.evaluate(() => (window as unknown as { map: import('maplibre-gl').Map }).map.getCenter().toArray());
}

const linePoints = (page: Page) => {
	const element = stateInUrl(page).elements[0];
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
	await expect.poll(() => linePoints(page)[0][1]).toBeLessThan(52.5);
	expect(linePoints(page)[1][1]).toBeCloseTo(linePoints(page)[0][1], 5);
	expect(await mapCenter(page)).toStrictEqual(viewCenter);

	// a node can be hit with a finger next to it, and dragging it reshapes the line
	await waitForMapIsIdle(page);
	const [first, second] = linePoints(page);
	const node = await project(page, second);
	await touch.drag([node[0] + 8, node[1] + 8], [node[0] + 8, node[1] - 42]);
	await expect.poll(() => linePoints(page)[1][1]).toBeGreaterThan(second[1]);
	expect(linePoints(page)[0]).toStrictEqual(first);
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
	await expect.poll(() => linePoints(page).length).toBe(3);
	await expect(deleteNode).toBeEnabled();
	await deleteNode.tap();
	await expect.poll(() => linePoints(page).length).toBe(2);
	await expect(deleteNode).toBeHidden();
	// the line is still selected
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
});

test('pinch-zoom on a selected element zooms the map', async ({ page }) => {
	await openLine(page);
	const touch = await Touchscreen.create(page);
	const getZoom = () => page.evaluate(() => (window as unknown as { map: import('maplibre-gl').Map }).map.getZoom());
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
	expect(linePoints(page)).toStrictEqual(points);
});
