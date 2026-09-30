import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type Bounds, type MapState } from '../packages/map-state/src/index.js';
import { project, storedState, waitForMapIsReady } from './lib/utils.js';

// The visible area (frame) of a map: what a shared or embedded map shows completely.

const frame: Bounds = [13.3, 52.45, 13.5, 52.55];
const elements: MapState['elements'] = [{ type: 'marker', point: [13.4, 52.5] }];

/** The pixels of the frame on the page. */
async function frameOnPage(page: Page, [west, south, east, north]: Bounds) {
	const [left, top] = await project(page, [west, north]);
	const [right, bottom] = await project(page, [east, south]);
	return { left, top, right, bottom };
}

test('a shared map shows its frame completely, in the viewer and in the editor', async ({ page }) => {
	// the viewer, in a window of another shape
	await page.setViewportSize({ width: 500, height: 800 });
	await page.goto('/view#' + encodeState({ frame, elements }));
	await waitForMapIsReady(page);
	let shown = await frameOnPage(page, frame);
	expect(shown.left).toBeGreaterThanOrEqual(9);
	expect(shown.right).toBeLessThanOrEqual(500 - 9);
	expect(shown.top).toBeGreaterThanOrEqual(0);
	expect(shown.bottom).toBeLessThanOrEqual(800);
	// it fills the width, the narrower side
	expect(shown.right - shown.left).toBeGreaterThan(450);

	// the editor, between its bars: the top bar, the tools, the sidebar and the status line
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto('/#' + encodeState({ frame, elements }));
	await waitForMapIsReady(page);
	shown = await frameOnPage(page, frame);
	expect(shown.top).toBeGreaterThanOrEqual(44 + 9);
	expect(shown.left).toBeGreaterThanOrEqual(48 + 9);
	expect(shown.right).toBeLessThanOrEqual(1280 - 250 + 1);
	expect(shown.bottom).toBeLessThanOrEqual(720 - 26 + 1);
	// the frame is kept, and the editor has a camera of its own from now on
	await expect.poll(async () => (await storedState(page)).frame).toStrictEqual(frame);
});

test('without a frame, a shared map shows its elements, a single marker not closer than zoom 15', async ({ page }) => {
	await page.goto('/view#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	const zoom = await page.evaluate(() => (window as unknown as { map: { getZoom(): number } }).map.getZoom());
	expect(zoom).toBeCloseTo(15, 1);
	const [x, y] = await project(page, [13.4, 52.5]);
	expect(x).toBeCloseTo(640, -1);
	expect(y).toBeCloseTo(360, -1);
});

test('an empty shared map without a frame shows the whole world', async ({ page }) => {
	await page.goto('/view#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	const bounds = await page.evaluate(() =>
		(window as unknown as { map: { getBounds(): { toArray(): number[][] } } }).map.getBounds().toArray()
	);
	expect(bounds[1][0] - bounds[0][0]).toBeGreaterThanOrEqual(300);
});
