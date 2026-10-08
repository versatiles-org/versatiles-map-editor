import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type Bounds, type MapState } from '../packages/map-state/src/index.js';
import {
	menuItem,
	project,
	storedCamera,
	storedState,
	waitForMapIsIdle,
	showView,
	waitForMapIsReady,
	type MapWindow,
	PREVIEW_TIMEOUT,
	sidebar
} from './lib/utils.js';

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

test('a shared map shows its frame completely in the viewer; the editor shows its elements', async ({ page }) => {
	// the viewer, in a window of another shape
	await page.setViewportSize({ width: 500, height: 800 });
	await page.goto('/view/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	const shown = await frameOnPage(page, frame);
	expect(shown.left).toBeGreaterThanOrEqual(9);
	expect(shown.right).toBeLessThanOrEqual(500 - 9);
	expect(shown.top).toBeGreaterThanOrEqual(0);
	expect(shown.bottom).toBeLessThanOrEqual(800);
	// it fills the width, the narrower side
	expect(shown.right - shown.left).toBeGreaterThan(450);

	// the editor shows the elements, here a marker, in the middle between its bars: the top bar, the
	// tools, the sidebar and the status line; whatever the frame, and wherever its author looked last
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	const [x, y] = await project(page, [13.4, 52.5]);
	expect(x).toBeCloseTo((48 + 1280 - 250) / 2, -1);
	expect(y).toBeCloseTo((44 + 720 - 26) / 2, -1);
	// the frame is kept
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toStrictEqual(frame);
});

test('a shared map opens rotated and tilted, with its frame completely in the window', async ({ page }) => {
	/** The rectangle around the corners of the frame on the page, as the map shows them. */
	const corners = async () => {
		const points = await Promise.all(
			[
				[frame[0], frame[1]],
				[frame[2], frame[1]],
				[frame[2], frame[3]],
				[frame[0], frame[3]]
			].map((corner) => project(page, corner as [number, number]))
		);
		const [xs, ys] = [points.map(([x]) => x), points.map(([, y]) => y)];
		return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
	};
	const camera = () =>
		page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			return { bearing: map.getBearing(), pitch: map.getPitch() };
		});

	for (const [width, height] of [
		[900, 500],
		[400, 700]
	]) {
		await test.step(`in a window of ${width} × ${height}`, async () => {
			await page.setViewportSize({ width, height });
			await page.goto('about:blank');
			await page.goto('/view/#' + encodeState({ frame: { bounds: frame, bearing: 40, pitch: 50 }, elements }));
			await waitForMapIsReady(page);
			expect(await camera()).toStrictEqual({ bearing: 40, pitch: 50 });
			// within the padding of the map and of the frame (10 px each), and as large as possible: it
			// reaches two edges
			const shown = await corners();
			expect(shown.left).toBeGreaterThanOrEqual(19);
			expect(shown.top).toBeGreaterThanOrEqual(19);
			expect(shown.right).toBeLessThanOrEqual(width - 19);
			expect(shown.bottom).toBeLessThanOrEqual(height - 19);
			expect(Math.min(shown.left, shown.top)).toBeLessThan(21);
			// in the middle
			expect(Math.abs(shown.left - (width - shown.right))).toBeLessThan(2);
			expect(Math.abs(shown.top - (height - shown.bottom))).toBeLessThan(2);
		});
	}

	// the editor stays north-up and seen from straight above, and keeps how the shared map is turned
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto('about:blank');
	await page.goto('/#' + encodeState({ frame: { bounds: frame, bearing: 40, pitch: 50 }, elements }));
	await waitForMapIsReady(page);
	expect(await camera()).toStrictEqual({ bearing: 0, pitch: 0 });
	await expect
		.poll(async () => (await storedState(page)).frame)
		.toStrictEqual({ bounds: frame, bearing: 40, pitch: 50 });
});

test('visitors rotate and tilt a shared map, back with the compass, unless the author locked it', async ({ page }) => {
	const camera = async () => {
		const { bearing, pitch } = await page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			return { bearing: map.getBearing(), pitch: map.getPitch() };
		});
		return { bearing: Math.round(bearing), pitch: Math.round(pitch) };
	};
	/** Drag with the right mouse button, which turns the map: sideways rotates, up and down tilts. */
	const turn = async (dx: number, dy: number) => {
		await page.mouse.move(400, 300);
		await page.mouse.down({ button: 'right' });
		await page.mouse.move(400 + dx, 300 + dy, { steps: 5 });
		await page.mouse.up({ button: 'right' });
	};
	const open = async (frame: MapState['frame']) => {
		await page.goto('about:blank');
		await page.goto('/view/#' + encodeState({ frame, elements }));
		await waitForMapIsReady(page);
	};
	const compass = page.getByRole('button', { name: 'Reset rotation and tilt' });
	await page.setViewportSize({ width: 800, height: 600 });

	await test.step('free: the map turns, and the compass turns it back to how it opened', async () => {
		await open({ bounds: frame, bearing: 30, pitch: 20 });
		expect(await camera()).toStrictEqual({ bearing: 30, pitch: 20 });
		await turn(120, -60);
		const turned = await camera();
		expect(turned.bearing).not.toBe(30);
		expect(turned.pitch).toBeGreaterThan(20);
		// not steeper than the largest tilt
		await turn(0, -400);
		expect((await camera()).pitch).toBeLessThanOrEqual(60);
		await compass.click();
		await expect.poll(camera).toStrictEqual({ bearing: 30, pitch: 20 });
	});

	await test.step('a map that is not turned can be turned too', async () => {
		await open({ bounds: frame });
		await turn(120, -60);
		const turned = await camera();
		expect(turned.bearing).not.toBe(0);
		expect(turned.pitch).toBeGreaterThan(0);
		await compass.click();
		await expect.poll(camera).toStrictEqual({ bearing: 0, pitch: 0 });
	});

	await test.step('locked rotation: only the tilt changes', async () => {
		await open({ bounds: frame, bearing: 30, lockBearing: true });
		await turn(120, -60);
		const turned = await camera();
		expect(turned.bearing).toBe(30);
		expect(turned.pitch).toBeGreaterThan(0);
	});

	await test.step('locked tilt: only the rotation changes', async () => {
		await open({ bounds: frame, pitch: 40, lockPitch: true });
		await turn(120, -60);
		const turned = await camera();
		expect(turned.bearing).not.toBe(0);
		expect(turned.pitch).toBe(40);
	});

	await test.step('both locked: the map stays, with a compass only if it is turned', async () => {
		await open({ bounds: frame, bearing: -45, lockBearing: true, lockPitch: true });
		await turn(120, -60);
		expect(await camera()).toStrictEqual({ bearing: -45, pitch: 0 });
		await expect(compass).toBeVisible();
		await open({ bounds: frame, lockBearing: true, lockPitch: true });
		await turn(120, -60);
		expect(await camera()).toStrictEqual({ bearing: 0, pitch: 0 });
		await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();
		await expect(compass).toHaveCount(0);
	});

	await test.step('the editor does not open turned like the shared map', async () => {
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.goto('about:blank');
		await page.goto('/#' + encodeState({ frame: { bounds: frame, bearing: 30 }, elements }));
		await waitForMapIsReady(page);
		expect(await camera()).toStrictEqual({ bearing: 0, pitch: 0 });
	});
});

test('a shared map keeps its frame clear of the legend', async ({ page }) => {
	// a window of the shape of the frame, so the frame would fill it, also under the legend
	await page.setViewportSize({ width: 600, height: 500 });
	const entries = ['Cafés', 'Bakeries', 'Parks', 'Museums'].map((label) => ({
		type: 'area' as const,
		style: { color: '#ff0000' },
		label
	}));
	await page.goto('/view/#' + encodeState({ frame: { bounds: frame }, elements, meta: { legend: { entries } } }));
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
	await page.goto('/view/#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	const zoom = await page.evaluate(() => (window as unknown as { map: { getZoom(): number } }).map.getZoom());
	expect(zoom).toBeCloseTo(15, 1);
	const [x, y] = await project(page, [13.4, 52.5]);
	expect(x).toBeCloseTo(640, -1);
	expect(y).toBeCloseTo(360, -1);
});

test('an empty shared map without a frame shows the whole world', async ({ page }) => {
	await page.goto('/view/#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	const bounds = await page.evaluate(() =>
		(window as unknown as { map: { getBounds(): { toArray(): number[][] } } }).map.getBounds().toArray()
	);
	expect(bounds[1][0] - bounds[0][0]).toBeGreaterThanOrEqual(300);
});

test('the viewer shows the frame again when its size changes, until the visitor moves the map', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 600 });
	await page.goto('/view/#' + encodeState({ frame: { bounds: frame }, elements }));
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
	await page.goto('/#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	await showView(page, { center: [13.4, 52.5], radius: 6000 });
	const bar = sidebar(page).getByRole('region', { name: 'Visible area' });
	const shared = sidebar(page).getByRole('region', { name: 'Map', exact: true });
	await expect(shared).toContainText('Shared maps show all elements.');

	// from the Map panel; without a frame, the panel shows the elements (a single marker has no size)
	await shared.getByRole('button', { name: 'Edit shared map…' }).click();
	await expect(bar).toContainText('The elements: 0 m × 0 m');
	await expect(page.locator('.statusbar')).toContainText('Drag the handles');

	// the current view becomes the frame
	await bar.getByRole('button', { name: 'Use current view' }).click();
	await expect(bar.getByRole('status')).toHaveText(/^[\d.,]+ km × [\d.,]+ km$/);
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toBeDefined();
	await expect(bar).toContainText('Shared maps show this area completely');

	// back to the elements, and undo
	await bar.getByRole('button', { name: 'Fit to elements' }).click();
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toBeUndefined();
	await expect(bar.getByRole('button', { name: 'Fit to elements' })).toBeDisabled();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toBeDefined();

	// Escape ends it, and so does the button of the panel, after opening it from the menu
	await page.keyboard.press('Escape');
	await expect(bar).toBeHidden();
	await expect(shared).toContainText('Shared maps show the visible area that you set');
	await (await menuItem(page, 'Shared map…')).click();
	await expect(bar).toBeVisible();
	await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
	await expect(bar).toBeHidden();

	// a tool ends it too
	await (await menuItem(page, 'Shared map…')).click();
	await page.getByRole('button', { name: 'Marker', exact: true }).click();
	await expect(bar).toBeHidden();

	// and so does a new map, which starts with the panel of the map
	await (await menuItem(page, 'Shared map…')).click();
	await expect(bar).toBeVisible();
	await (await menuItem(page, 'New map')).click();
	await expect(bar).toBeHidden();
	await expect(sidebar(page).getByRole('heading', { level: 2 })).toHaveText('Map');
});

test('the rotation and the tilt of a shared map are set in the visible area mode, with a preview', async ({ page }) => {
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	await showView(page, { center: [13.4, 52.5], radius: 15000 });
	const camera = async () => {
		const { bearing, pitch } = await page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			return { bearing: map.getBearing(), pitch: map.getPitch() };
		});
		return { bearing: Math.round(bearing), pitch: Math.round(pitch) };
	};
	const stored = async () => (await storedState(page)).frame;
	const bar = sidebar(page).getByRole('region', { name: 'Visible area' });
	await (await menuItem(page, 'Shared map…')).click();

	await test.step('the sliders turn the map at once, and are stored', async () => {
		const rotation = sidebar(page).getByRole('spinbutton', { name: 'Rotation' });
		await rotation.fill('40');
		await rotation.press('Enter');
		await expect.poll(camera).toStrictEqual({ bearing: 40, pitch: 0 });
		const tilt = sidebar(page).getByRole('spinbutton', { name: 'Tilt' });
		await tilt.fill('50');
		await tilt.press('Enter');
		await expect.poll(camera).toStrictEqual({ bearing: 40, pitch: 50 });
		await expect.poll(stored).toStrictEqual({ bounds: frame, bearing: 40, pitch: 50 });
		// not steeper than the largest tilt
		await tilt.fill('85');
		await tilt.press('Enter');
		await expect.poll(stored).toStrictEqual({ bounds: frame, bearing: 40, pitch: 60 });
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(stored).toStrictEqual({ bounds: frame, bearing: 40, pitch: 50 });
		await expect.poll(camera).toStrictEqual({ bearing: 40, pitch: 50 });
	});

	await test.step('visitors can be kept from rotating and tilting', async () => {
		const rotate = sidebar(page).getByRole('checkbox', { name: 'Visitors can rotate' });
		const tilt = sidebar(page).getByRole('checkbox', { name: 'Visitors can tilt' });
		await expect(rotate).toBeChecked();
		await rotate.uncheck();
		await expect.poll(stored).toStrictEqual({ bounds: frame, bearing: 40, pitch: 50, lockBearing: true });
		await tilt.uncheck();
		await expect
			.poll(stored)
			.toStrictEqual({ bounds: frame, bearing: 40, pitch: 50, lockBearing: true, lockPitch: true });
		await tilt.check();
		await expect.poll(stored).toStrictEqual({ bounds: frame, bearing: 40, pitch: 50, lockBearing: true });
	});

	await test.step('a handle moves its side on the turned map', async () => {
		const [x, y] = await project(page, [frame[2], (frame[1] + frame[3]) / 2]);
		const [tx, ty] = await project(page, [frame[2] + 0.05, (frame[1] + frame[3]) / 2]);
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(tx, ty, { steps: 5 });
		await page.mouse.up();
		await expect.poll(async () => (await stored())?.bounds?.[2]).toBeCloseTo(frame[2] + 0.05, 2);
		const dragged = (await stored())!.bounds!;
		expect(dragged[0]).toBeCloseTo(frame[0], 4);
		expect(dragged[1]).toBeCloseTo(frame[1], 4);
		expect(dragged[3]).toBeCloseTo(frame[3], 4);
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await stored())?.bounds).toStrictEqual(frame);
	});

	await test.step('"Use current view" takes an area around the center of the turned map', async () => {
		const center = await page.evaluate(() => (window as unknown as MapWindow).map.getCenter().toArray());
		await bar.getByRole('button', { name: 'Use current view' }).click();
		await expect.poll(async () => (await stored())?.bounds).not.toStrictEqual(frame);
		const [west, south, east, north] = (await stored())!.bounds!;
		expect((west + east) / 2).toBeCloseTo(center[0], 2);
		expect(south).toBeLessThan(center[1]);
		expect(north).toBeGreaterThan(center[1]);
		// all of it is in the window
		for (const corner of [
			[west, south],
			[east, south],
			[east, north],
			[west, north]
		] as [number, number][]) {
			const [px, py] = await project(page, corner);
			expect(px).toBeGreaterThanOrEqual(48);
			expect(px).toBeLessThanOrEqual(1280 - 250);
			expect(py).toBeGreaterThanOrEqual(44);
			expect(py).toBeLessThanOrEqual(720 - 26);
		}
	});

	await test.step('the editor is turned only in this mode', async () => {
		await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
		await expect.poll(camera).toStrictEqual({ bearing: 0, pitch: 0 });
		expect(await stored()).toMatchObject({ bearing: 40, pitch: 50, lockBearing: true });
		await (await menuItem(page, 'Shared map…')).click();
		await expect.poll(camera).toStrictEqual({ bearing: 40, pitch: 50 });
		await expect(sidebar(page).getByRole('spinbutton', { name: 'Rotation' })).toHaveValue('40');
		await expect(sidebar(page).getByRole('checkbox', { name: 'Visitors can rotate' })).not.toBeChecked();
	});
});

test('the author turns the map of the editor, which has a compass that is faded while it is not turned', async ({
	page
}) => {
	await page.goto('/#' + encodeState({ frame: { bounds: frame, bearing: 40 }, elements }));
	await waitForMapIsReady(page);
	const camera = async () => {
		const { bearing, pitch } = await page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			return { bearing: map.getBearing(), pitch: map.getPitch() };
		});
		return { bearing: Math.round(bearing), pitch: Math.round(pitch) };
	};
	/** Drag with the right mouse button, which turns a map that can be turned; until it has come to rest. */
	const turn = async (dx: number, dy: number) => {
		await page.mouse.move(500, 350);
		await page.mouse.down({ button: 'right' });
		await page.mouse.move(500 + dx, 350 + dy, { steps: 5 });
		await page.mouse.up({ button: 'right' });
		await waitForMapIsIdle(page);
	};
	const compass = page.getByRole('button', { name: 'Reset rotation and tilt' });
	const bar = sidebar(page).getByRole('region', { name: 'Visible area' });
	let own = { bearing: 0, pitch: 0 };

	await test.step('the map turns, and the editor keeps it', async () => {
		// always there, so the buttons below it stay where they are
		await expect(compass).toBeVisible();
		await expect(compass).toContainClass('compass-idle');
		await turn(120, -60);
		own = await camera();
		expect(own.bearing).not.toBe(0);
		expect(own.pitch).toBeGreaterThan(0);
		await expect(compass).not.toContainClass('compass-idle');
		await expect.poll(async () => Math.round((await storedCamera(page))?.bearing ?? 0)).toBe(own.bearing);
		// how the shared map is turned is another thing
		expect((await storedState(page)).frame).toStrictEqual({ bounds: frame, bearing: 40 });
		await page.reload();
		await waitForMapIsReady(page);
		expect(await camera()).toStrictEqual(own);
	});

	await test.step('in the visible area mode, turning the map turns the shared map, then the own turn is back', async () => {
		await (await menuItem(page, 'Shared map…')).click();
		await expect.poll(camera).toStrictEqual({ bearing: 40, pitch: 0 });
		const rotation = sidebar(page).getByRole('spinbutton', { name: 'Rotation' });
		const tilt = sidebar(page).getByRole('spinbutton', { name: 'Tilt' });
		await expect(rotation).toHaveValue('40');
		// by hand: the sliders follow, in whole degrees, and the shared map is stored
		await turn(120, -60);
		const shared = await camera();
		expect(shared.bearing).not.toBe(40);
		expect(shared.pitch).toBeGreaterThan(0);
		await expect(rotation).toHaveValue(String(shared.bearing));
		await expect(tilt).toHaveValue(String(shared.pitch));
		await expect.poll(async () => (await storedState(page)).frame).toStrictEqual({ bounds: frame, ...shared });
		// "Use current view" takes the area that the turned map shows, and keeps the turn
		await bar.getByRole('button', { name: 'Use current view' }).click();
		await expect.poll(async () => (await storedState(page)).frame?.bounds).not.toStrictEqual(frame);
		expect(await storedState(page)).toMatchObject({ frame: shared });
		await page.getByRole('button', { name: 'Undo' }).click();
		// one undo step for the turn by hand
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await storedState(page)).frame).toStrictEqual({ bounds: frame, bearing: 40 });
		await expect.poll(camera).toStrictEqual({ bearing: 40, pitch: 0 });
		// the compass turns the shared map back to north at the top
		await compass.click();
		await expect.poll(async () => (await storedState(page)).frame).toStrictEqual({ bounds: frame });
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await storedState(page)).frame).toStrictEqual({ bounds: frame, bearing: 40 });

		await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
		await expect.poll(camera).toStrictEqual(own);
		expect((await storedState(page)).frame).toStrictEqual({ bounds: frame, bearing: 40 });
	});

	await test.step('the compass turns the map back', async () => {
		await compass.click();
		await expect.poll(camera).toStrictEqual({ bearing: 0, pitch: 0 });
		await expect(compass).toContainClass('compass-idle');
		await expect.poll(async () => (await storedCamera(page))?.bearing).toBeUndefined();
	});
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
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements: outside }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	await expect(dialog).toContainText('1 element is outside the visible area.');
	// the precision follows the size of the frame (about 14 × 11 km), not the camera
	await expect(dialog.getByRole('slider', { name: 'Precision' })).toHaveAttribute('aria-valuetext', '18 m');

	// editing the visible area, and back with the button of the panel
	await dialog.getByRole('button', { name: 'Edit shared map…' }).click();
	await expect(dialog).toBeHidden();
	await expect(sidebar(page).getByRole('region', { name: 'Visible area' })).toBeVisible();
	await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
	await expect(dialog).toBeVisible();

	// all elements instead: no warning any more
	await dialog.getByRole('button', { name: 'Fit to elements' }).click();
	await expect(dialog).not.toContainText('outside the visible area');
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toBeUndefined();
});

test('the share dialog tells that an empty map without a visible area shows the whole world', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	await expect(dialog).toContainText('The map is empty and has no visible area, so it shows the whole world.');
});

test('the preview of the share dialog shows the frame completely in all three aspect ratios', async ({ page }) => {
	// the preview loads three times, which may take longer than the timeout of a test (see PREVIEW_TIMEOUT)
	test.slow();
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	/** Where the frame is in the preview, and the size of the preview, once its map is ready. */
	const inPreview = async () => {
		const preview = page.frames().find((f) => f.url().includes('/view/#'));
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
				{ message: ratio, timeout: PREVIEW_TIMEOUT }
			)
			.toBe(true);
	}
});

test('dragging a handle changes the frame, one undo step per drag', async ({ page }) => {
	// a view with the whole frame, left of the sidebar
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	await showView(page, { center: [13.4, 52.5], radius: 15000 });
	await (await menuItem(page, 'Shared map…')).click();

	// the north-east corner, 80 pixels to the east and 60 to the north
	const [x, y] = await project(page, [frame[2], frame[3]]);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 80, y - 60, { steps: 5 });
	await page.mouse.up();
	await expect.poll(async () => (await storedState(page)).frame?.bounds?.[2]).toBeGreaterThan(frame[2]);
	const dragged = (await storedState(page)).frame!.bounds!;
	// only the dragged sides
	expect(dragged[0]).toBeCloseTo(frame[0], 4);
	expect(dragged[1]).toBeCloseTo(frame[1], 4);
	expect(dragged[3]).toBeGreaterThan(frame[3]);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toStrictEqual(frame);
});

test('the keyboard moves the sides of the frame, one undo step per key', async ({ page }) => {
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	await showView(page, { center: [13.4, 52.5], radius: 15000 });
	await (await menuItem(page, 'Shared map…')).click();
	const size = sidebar(page).getByRole('region', { name: 'Visible area' }).getByRole('status');
	const before = await size.textContent();

	// focus on the map, which would rotate with Shift and an arrow key
	await page.locator('.maplibregl-canvas').focus();
	await page.keyboard.press('Shift+ArrowRight');
	await page.keyboard.press('Shift+ArrowRight');
	await expect(size).not.toHaveText(before!);
	await expect.poll(async () => (await storedState(page)).frame?.bounds?.[2]).toBeGreaterThan(frame[2]);
	const moved = (await storedState(page)).frame!.bounds!;
	expect(moved[0]).toBeCloseTo(frame[0], 4);
	expect(await page.evaluate(() => (window as unknown as { map: { getBearing(): number } }).map.getBearing())).toBe(0);

	// inwards again
	await page.keyboard.press('Alt+Shift+ArrowRight');
	await expect.poll(async () => (await storedState(page)).frame?.bounds?.[2]).toBeLessThan(moved[2]);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toStrictEqual(moved);
});

test('importing a file with a frame gives a frame that covers both', async ({ page }) => {
	await page.goto('/#' + encodeState({ frame: { bounds: frame }, elements }));
	await waitForMapIsReady(page);
	const file = { type: 'FeatureCollection', features: [], frame: { bounds: [13.45, 52.5, 13.6, 52.6] } };
	const importGeoJSON = await menuItem(page, 'Import', 'GeoJSON…');
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importGeoJSON.click()]);
	await chooser.setFiles({
		name: 'area.geojson',
		mimeType: 'application/geo+json',
		buffer: Buffer.from(JSON.stringify(file))
	});
	await expect.poll(async () => (await storedState(page)).frame?.bounds).toStrictEqual([13.3, 52.45, 13.6, 52.6]);
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
