import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type Bounds, type MapState } from '../packages/map-state/src/index.js';
import { menuItem, project, storedState, waitForMapIsReady, type MapWindow } from './lib/utils.js';

// The visible area (frame) of a map: what a shared or embedded map shows completely.

const frame: Bounds = [13.3, 52.45, 13.5, 52.55];
const elements: MapState['elements'] = [{ type: 'marker', point: [13.4, 52.5] }];

/** The pixels of the frame on the page. */
async function frameOnPage(page: Page, [west, south, east, north]: Bounds) {
	const [left, top] = await project(page, [west, north]);
	const [right, bottom] = await project(page, [east, south]);
	return { left, top, right, bottom };
}

/** The pixel of a point once the map has come to rest, e.g. after the inertia of a drag. */
async function settledPosition(page: Page, point: [number, number]): Promise<[number, number]> {
	let last = await project(page, point);
	for (let i = 0; i < 50; i++) {
		await page.waitForTimeout(100);
		const next = await project(page, point);
		if (Math.abs(next[0] - last[0]) < 0.5 && Math.abs(next[1] - last[1]) < 0.5) return next;
		last = next;
	}
	return last;
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

test('a shared map keeps its frame clear of the legend', async ({ page }) => {
	// a window of the shape of the frame, so the frame would fill it, also under the legend
	await page.setViewportSize({ width: 600, height: 500 });
	const entries = ['Cafés', 'Bakeries', 'Parks', 'Museums'].map((label) => ({
		type: 'polygon' as const,
		style: { color: '#ff0000' },
		label
	}));
	await page.goto('/view#' + encodeState({ frame, elements, meta: { legend: { entries } } }));
	await waitForMapIsReady(page);
	const legend = (await page.getByRole('list', { name: 'Legend' }).boundingBox())!;
	await expect
		.poll(async () => {
			const shown = await frameOnPage(page, frame);
			const clear =
				shown.right <= legend.x ||
				shown.left >= legend.x + legend.width ||
				shown.bottom <= legend.y ||
				shown.top >= legend.y + legend.height;
			// and still completely on the map
			return clear && shown.left >= 0 && shown.top >= 0 && shown.right <= 600 && shown.bottom <= 500;
		})
		.toBe(true);
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

test('the viewer shows the frame again when its size changes, until the visitor moves the map', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 600 });
	await page.goto('/view#' + encodeState({ frame, elements }));
	await waitForMapIsReady(page);

	// e.g. a rotated phone: the frame fits the new, narrower width, and fills it (without the padding
	// of the map and of the frame, 10 px each on both sides)
	await page.setViewportSize({ width: 400, height: 700 });
	await expect.poll(async () => (await frameOnPage(page, frame)).right).toBeLessThanOrEqual(400 - 9);
	const shown = await frameOnPage(page, frame);
	expect(shown.left).toBeGreaterThanOrEqual(9);
	expect(shown.right - shown.left).toBeGreaterThanOrEqual(355);

	// once the visitor has moved the map, a new size keeps the view
	await page.mouse.move(200, 350);
	await page.mouse.down();
	await page.mouse.move(100, 250, { steps: 5 });
	await page.mouse.up();
	const moved = await settledPosition(page, [13.4, 52.5]);
	// the marker is left of the middle, where showing the frame again would put it
	expect(moved[0]).toBeLessThan(150);
	await page.setViewportSize({ width: 400, height: 600 });
	const after = await settledPosition(page, [13.4, 52.5]);
	expect(after[0]).toBeCloseTo(moved[0], -1);
});

test('the visible area is edited in a mode of its own, from the menu or the Map panel', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 6000 }, elements }));
	await waitForMapIsReady(page);
	const bar = page.getByRole('group', { name: 'Visible area' });
	const shared = page.locator('.sidebar').getByRole('region', { name: 'Map', exact: true });
	await expect(shared).toContainText('Shared maps show all elements.');

	// from the Map panel; without a frame, the bar shows the elements (a single marker has no size)
	await shared.getByRole('button', { name: 'Edit visible area…' }).click();
	await expect(bar).toContainText('The elements: 0 m × 0 m');
	await expect(page.locator('.statusbar')).toContainText('Drag the handles');

	// the current view becomes the frame
	await bar.getByRole('button', { name: 'Use current view' }).click();
	await expect(bar).toContainText(/^Visible area: [\d.,]+ km × [\d.,]+ km/);
	await expect.poll(async () => (await storedState(page)).frame).toBeDefined();
	await expect(shared).toContainText('Shared maps show the visible area that you set');

	// back to the elements, and undo
	await bar.getByRole('button', { name: 'Fit to elements' }).click();
	await expect.poll(async () => (await storedState(page)).frame).toBeUndefined();
	await expect(bar.getByRole('button', { name: 'Fit to elements' })).toBeDisabled();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).frame).toBeDefined();

	// Escape ends it, and so does Done, after opening it from the menu
	await page.keyboard.press('Escape');
	await expect(bar).toBeHidden();
	await (await menuItem(page, 'Visible area…')).click();
	await expect(bar).toBeVisible();
	await bar.getByRole('button', { name: 'Done' }).click();
	await expect(bar).toBeHidden();

	// a tool ends it too
	await (await menuItem(page, 'Visible area…')).click();
	await page.getByRole('button', { name: 'Marker', exact: true }).click();
	await expect(bar).toBeHidden();
});

test('the share dialog warns about elements outside the visible area, and edits it', async ({ page }) => {
	const outside: MapState['elements'] = [
		{ type: 'marker', point: [13.4, 52.5] },
		// partly outside
		{
			type: 'line',
			points: [
				[13.4, 52.5],
				[13.6, 52.5]
			]
		}
	];
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 6000 }, frame, elements: outside }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	await expect(dialog).toContainText('1 element is outside the visible area.');
	// the precision follows the size of the frame (about 14 × 11 km), not the camera
	await expect(dialog.getByRole('combobox', { name: 'Precision' })).toContainText('Automatic (about 11 m)');

	// editing the visible area, and back with Done
	await dialog.getByRole('button', { name: 'Edit visible area' }).click();
	await expect(dialog).toBeHidden();
	const bar = page.getByRole('group', { name: 'Visible area' });
	await bar.getByRole('button', { name: 'Done' }).click();
	await expect(dialog).toBeVisible();

	// all elements instead: no warning any more
	await dialog.getByRole('button', { name: 'Fit to elements' }).click();
	await expect(dialog).not.toContainText('outside the visible area');
	await expect.poll(async () => (await storedState(page)).frame).toBeUndefined();
});

test('the share dialog tells that an empty map without a visible area shows the whole world', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	await expect(dialog).toContainText('The map is empty and has no visible area, so it shows the whole world.');
});

test('the preview of the share dialog shows the frame completely in all three aspect ratios', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 6000 }, frame, elements }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	/** Where the frame is in the preview, and the size of the preview, once its map is ready. */
	const inPreview = async () => {
		const preview = page.frames().find((f) => f.url().includes('/view#'));
		if (!preview) return undefined;
		// undefined while the preview loads again, e.g. for another aspect ratio
		return preview
			.evaluate(([west, south, east, north]) => {
				const map = (window as unknown as { map?: { project(p: [number, number]): { x: number; y: number } } }).map;
				if (!map || !(window as unknown as { mapReady?: boolean }).mapReady) return undefined;
				const topLeft = map.project([west, north]);
				const bottomRight = map.project([east, south]);
				return {
					...{ left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y },
					width: innerWidth,
					height: innerHeight
				};
			}, frame)
			.catch(() => undefined);
	};
	for (const ratio of ['Horizontal', 'Square', 'Vertical']) {
		await dialog.getByRole('radio', { name: ratio }).check({ force: true });
		// the frame is inside the preview, and fills its width or its height
		await expect
			.poll(
				async () => {
					const shown = await inPreview();
					if (!shown) return false;
					const inside =
						shown.left >= 0 && shown.top >= 0 && shown.right <= shown.width && shown.bottom <= shown.height;
					const fills = shown.right - shown.left > shown.width - 50 || shown.bottom - shown.top > shown.height - 50;
					return inside && fills;
				},
				{ message: ratio, timeout: 10_000 }
			)
			.toBe(true);
	}
});

test('dragging a handle changes the frame, one undo step per drag', async ({ page }) => {
	// a view with the whole frame, left of the sidebar
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 15000 }, frame, elements }));
	await waitForMapIsReady(page);
	await (await menuItem(page, 'Visible area…')).click();

	// the north-east corner, 80 pixels to the east and 60 to the north
	const [x, y] = await project(page, [frame[2], frame[3]]);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 80, y - 60, { steps: 5 });
	await page.mouse.up();
	await expect.poll(async () => (await storedState(page)).frame?.[2]).toBeGreaterThan(frame[2]);
	const dragged = (await storedState(page)).frame!;
	// only the dragged sides
	expect(dragged[0]).toBeCloseTo(frame[0], 4);
	expect(dragged[1]).toBeCloseTo(frame[1], 4);
	expect(dragged[3]).toBeGreaterThan(frame[3]);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).frame).toStrictEqual(frame);
});

test('the keyboard moves the sides of the frame, one undo step per key', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 15000 }, frame, elements }));
	await waitForMapIsReady(page);
	await (await menuItem(page, 'Visible area…')).click();
	const size = page.getByRole('group', { name: 'Visible area' }).getByRole('status');
	const before = await size.textContent();

	// focus on the map, which would rotate with Shift and an arrow key
	await page.locator('.maplibregl-canvas').focus();
	await page.keyboard.press('Shift+ArrowRight');
	await page.keyboard.press('Shift+ArrowRight');
	await expect(size).not.toHaveText(before!);
	await expect.poll(async () => (await storedState(page)).frame?.[2]).toBeGreaterThan(frame[2]);
	const moved = (await storedState(page)).frame!;
	expect(moved[0]).toBeCloseTo(frame[0], 4);
	expect(await page.evaluate(() => (window as unknown as { map: { getBearing(): number } }).map.getBearing())).toBe(0);

	// inwards again
	await page.keyboard.press('Alt+Shift+ArrowRight');
	await expect.poll(async () => (await storedState(page)).frame?.[2]).toBeLessThan(moved[2]);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).frame).toStrictEqual(moved);
});

test('importing a file with a frame gives a frame that covers both', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 6000 }, frame, elements }));
	await waitForMapIsReady(page);
	const file = { type: 'FeatureCollection', features: [], frame: [13.45, 52.5, 13.6, 52.6] };
	const importGeoJSON = await menuItem(page, 'Import', 'GeoJSON…');
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importGeoJSON.click()]);
	await chooser.setFiles({
		name: 'area.geojson',
		mimeType: 'application/geo+json',
		buffer: Buffer.from(JSON.stringify(file))
	});
	await expect.poll(async () => (await storedState(page)).frame).toStrictEqual([13.3, 52.45, 13.6, 52.6]);
});

test("the editor's marks on the map have the accent of the theme", { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const [onMap, ofTheme] = await page.evaluate(() => {
		const map = (window as unknown as MapWindow).map;
		// --color-accent-line as the browser draws it, whatever the numbers of the theme are
		const context = document.createElement('canvas').getContext('2d')!;
		context.fillStyle = getComputedStyle(map.getContainer()).getPropertyValue('--color-accent-line');
		context.fillRect(0, 0, 1, 1);
		const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
		return [String(map.getPaintProperty('visible_area_border', 'line-color')), `rgba(${r}, ${g}, ${b}, 1)`];
	});
	expect(onMap).toBe(ofTheme);
	// a purple, not the black of a color that could not be read
	const [r, g, b] = /^rgba\((\d+), (\d+), (\d+), 1\)$/.exec(onMap)!.slice(1).map(Number);
	expect(b).toBeGreaterThan(g + 50);
	expect(r).toBeGreaterThan(g + 30);
});
