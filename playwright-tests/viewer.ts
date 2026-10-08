import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { decodeState, encodeState, type MapState, type StateElementMarker } from '../packages/map-state/src/index.js';
import {
	boxesOverlap,
	project,
	storedState,
	waitForMapIsIdle,
	waitForMapIsReady,
	type MapWindow,
	PREVIEW_TIMEOUT,
	sidebar
} from './lib/utils.js';

test.describe('small screens', () => {
	// wide enough for the hint to fit on one line, next to the attribution
	test.use({ viewport: { width: 500, height: 500 } });

	test('show the map read-only with a hint', async ({ page }) => {
		await page.goto('/#' + encodeState({ view: { center: [13.4, 52.5], radius: 10000 }, elements: [] }));
		await waitForMapIsReady(page);
		const hint = page.getByText('Open this page on a larger screen to edit the map.');
		await expect(hint).toBeVisible();

		// the hint must not cover the attribution, which is expanded at first
		await expect(page.locator('.maplibregl-compact-show')).toBeVisible();
		const a = (await hint.boundingBox())!;
		const b = (await page.locator('.maplibregl-ctrl-attrib').boundingBox())!;
		expect(boxesOverlap(a, b)).toBe(false);
		await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	});
});

test.describe('view page', () => {
	test('shows the map read-only, also on a large screen', async ({ page }) => {
		const hash = encodeState({
			view: { center: [13.4, 52.5], radius: 10000 },
			elements: [{ type: 'marker', point: [13.4, 52.5] }]
		});
		await page.goto('/view/#' + hash);
		await waitForMapIsReady(page);
		await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
		await expect(page.getByText('Open this page on a larger screen to edit the map.')).toHaveCount(0);
		// the viewer does not write its map to the URL
		await waitForMapIsIdle(page);
		expect(new URL(page.url()).hash).toBe('#' + hash);
	});
});

test.describe('viewer', () => {
	// the size of an embedded map
	test.use({ viewport: { width: 500, height: 500 } });

	test('opens popups on click', { tag: '@cross-browser' }, async ({ page }) => {
		const state: MapState = {
			view: { center: [13.4, 52.5], radius: 10000 },
			elements: [
				{
					type: 'polygon',
					points: [
						[13.3, 52.45],
						[13.5, 52.45],
						[13.4, 52.55]
					],
					popup: { text: 'A **polygon**\n[VersaTiles](https://versatiles.org/)' }
				},
				{ type: 'circle', point: [13.5, 52.55], radius: 1000 }
			]
		};
		await page.goto('/view/#' + encodeState(state));
		await waitForMapIsReady(page);
		await waitForMapIsIdle(page);
		const cursor = () =>
			page.evaluate(() => document.querySelector<HTMLElement>('.maplibregl-canvas-container')!.style.cursor);

		// an element with a popup shows a pointer cursor
		const [x, y] = await project(page, [13.4, 52.49]);
		await page.mouse.move(x, y);
		await expect.poll(cursor).toBe('pointer');

		// a click opens the formatted popup
		await page.mouse.click(x, y);
		const popup = page.locator('.maplibregl-popup');
		await expect(popup.locator('strong')).toHaveText('polygon');
		await expect(popup.getByRole('link', { name: 'VersaTiles' })).toHaveAttribute('href', 'https://versatiles.org/');

		// an element without a popup does not react
		const [cx, cy] = await project(page, [13.5, 52.55]);
		await page.mouse.move(cx, cy);
		await expect.poll(cursor).toBe('');

		// a click elsewhere closes the popup
		await page.mouse.click(cx, cy);
		await expect(popup).toBeHidden();
	});
});

test('the attribution starts as its button alone where its text would cover the legend', async ({ page }) => {
	const entries: NonNullable<NonNullable<MapState['meta']>['legend']>['entries'] = [
		{ type: 'marker', label: 'A place' },
		{ type: 'line', label: 'A route' }
	];
	const state: MapState = { meta: { legend: { entries } }, elements: [{ type: 'marker', point: [13.4, 52.5] }] };
	const attribution = page.locator('.maplibregl-ctrl-attrib');
	const legend = page.getByRole('list', { name: 'Legend' });
	const overlap = async () => {
		const [a, b] = [(await attribution.boundingBox())!, (await legend.boundingBox())!];
		return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
	};

	await test.step('a narrow map: the text would reach the legend in the other corner', async () => {
		await page.setViewportSize({ width: 420, height: 700 });
		await page.goto('/view/#' + encodeState(state));
		await waitForMapIsReady(page);
		await expect(attribution).not.toContainClass('maplibregl-compact-show');
		expect(await overlap()).toBe(false);
		// its button shows the text, which then stays, as its reader wants it
		await attribution.locator('summary').click();
		await expect(attribution).toContainClass('maplibregl-compact-show');
		await expect(attribution).toContainText('OpenStreetMap');
		await page.setViewportSize({ width: 410, height: 700 });
		await waitForMapIsIdle(page);
		await expect(attribution).toContainClass('maplibregl-compact-show');
	});

	await test.step('a wide map: the text is shown, as before', async () => {
		await page.setViewportSize({ width: 1000, height: 700 });
		await page.goto('about:blank');
		await page.goto('/view/#' + encodeState(state));
		await waitForMapIsReady(page);
		await waitForMapIsIdle(page);
		await expect(attribution).toContainClass('maplibregl-compact-show');
		await expect(attribution).toContainText('OpenStreetMap');
		expect(await overlap()).toBe(false);
	});
});

test('precision of a shared map', async ({ page }) => {
	const point: [number, number] = [13.412341, 52.512341];
	// the point in steps of 0.00008° (automatic) and of 0.00064°
	const AUTO_POINT = [13.41232, 52.51232];
	const COARSE_POINT = [13.41248, 52.51264];
	await page.goto(
		'/#' +
			encodeState({
				view: { center: [13.4, 52.5], radius: 10000 },
				// about 11 × 11 km
				frame: { bounds: [13.33, 52.45, 13.49, 52.55] },
				elements: [{ type: 'marker', point }]
			})
	);
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: /^Share/ }).click();
	const precision = page.getByRole('slider', { name: 'Precision' });
	const automatic = page.getByRole('checkbox', { name: /^Automatic/ });
	const shared = async () => {
		const link = await page.getByLabel('Link', { exact: true }).inputValue();
		// the shared map opens in the viewer
		expect(new URL(link).pathname).toBe('/view/');
		const element = decodeState(new URL(link).hash.slice(1)).elements[0] as StateElementMarker;
		return { point: element.point, length: link.length };
	};

	// automatic: about a thousandth of the larger side of the visible area, in steps of
	// 0.00001° × 2^n: 0.00008°, about 9 m; the coordinates keep at most 5 decimal places
	await expect(automatic).toBeChecked();
	await expect(precision).toHaveAttribute('aria-valuetext', '9 m');
	await expect.poll(async () => (await shared()).point).toStrictEqual(AUTO_POINT);
	const auto = await shared();

	// from 1 m to about a hundredth of the larger side: 0.00128°, about 140 m; moving the slider
	// ends "Automatic"
	await precision.focus();
	await page.keyboard.press('End');
	await expect(precision).toHaveAttribute('aria-valuetext', '140 m');
	await expect(automatic).not.toBeChecked();
	await page.keyboard.press('Home');
	await expect(precision).toHaveAttribute('aria-valuetext', '1 m');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.41234, 52.51234]);
	// 0.00064°
	await precision.fill('6');
	await expect(page.getByRole('dialog').locator('.slider .text')).toHaveText('71 m');
	await expect.poll(async () => (await shared()).point).toStrictEqual(COARSE_POINT);
	expect((await shared()).length).toBeLessThan(auto.length);

	// automatic again
	await automatic.check();
	await expect(precision).toHaveAttribute('aria-valuetext', '9 m');
	await expect.poll(async () => (await shared()).point).toStrictEqual(AUTO_POINT);

	// the map in the editor keeps its precision
	expect(((await storedState(page)).elements[0] as StateElementMarker).point).toStrictEqual([13.41234, 52.51234]);
});

test('a copy shows its check mark for 2 s after the last copy', async ({ page, context, browserName }) => {
	if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.clock.install();
	await page.goto('/');
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: /^Share/ }).click();
	const status = page.getByRole('dialog').getByRole('status');
	const copyLink = page.getByRole('button', { name: /^Copy link/ });
	const copyEmbed = page.getByRole('button', { name: /^Copy embed code/ });
	const checked = (button: typeof copyLink) => button.evaluate((b) => b.classList.contains('success'));

	await copyLink.click();
	await expect(status).toHaveText('Link copied');
	await page.clock.runFor(1500);
	// again: its 2 s start anew
	await copyLink.click();
	await page.clock.runFor(1000);
	expect(await checked(copyLink)).toBe(true);
	await expect(status).toHaveText('Link copied');

	// the other one: the link keeps its own time, the announcement is of the last copy
	await copyEmbed.click();
	await expect(status).toHaveText('Embed code copied');
	await page.clock.runFor(1100);
	expect(await checked(copyLink)).toBe(false);
	expect(await checked(copyEmbed)).toBe(true);
	await expect(status).toHaveText('Embed code copied');
	await page.clock.runFor(1000);
	expect(await checked(copyEmbed)).toBe(false);
	await expect(status).toHaveText('');
});

test('precision of a shared map with a single marker follows the view', async ({ page }) => {
	// a point has no size: the precision is that of the area that the editor shows, about 20 km
	const point: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ view: { center: point, radius: 10000 }, elements: [{ type: 'marker', point }] })
	);
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: /^Share/ }).click();
	const precision = page.getByRole('slider', { name: 'Precision' });
	await expect.poll(async () => Number(await precision.inputValue())).toBeGreaterThan(2);
	const max = Number(await precision.getAttribute('max'));
	expect(max).toBeGreaterThan(5);
	expect(max).toBeLessThan(15);
});

test.describe('overlays of the viewer on a phone', () => {
	// narrow, so the hint wraps into two lines
	test.use({ viewport: { width: 390, height: 700 } });

	// one page for all cases: a new map in the URL hash replaces the legend without a reload
	test('a legend does not cover the hint or the search, wherever it is at the top', async ({ page }) => {
		for (const search of [false, true]) {
			for (const position of ['top-left', 'top', 'top-right'] as const) {
				await test.step(`a legend at ${position}${search ? ', with search' : ''}`, async () => {
					const state: MapState = {
						view: { center: [13.4, 52.5], radius: 10000 },
						meta: {
							viewer: { search: search ? 'top-left' : 'none', legend: position },
							legend: {
								entries: [
									{ type: 'area' as const, style: { color: '#ff0000' }, label: 'A long legend entry' },
									{ type: 'area' as const, style: { color: '#00ff00' }, label: 'Another entry' }
								]
							}
						},
						elements: []
					};
					await page.goto('/#' + encodeState(state));
					await waitForMapIsReady(page);
					const legendList = page.getByRole('list', { name: 'Legend' });
					await expect(legendList).toContainClass(`position-${position}`);
					const field = page.getByRole('combobox', { name: 'Search address or place' });
					await expect(field).toHaveCount(search ? 1 : 0);
					// the legend moves below the search a moment after a new map, so the layout is polled
					const overlaps = async () => {
						const legend = (await legendList.boundingBox())!;
						const hint = (await page.getByText('Open this page on a larger screen').boundingBox())!;
						const box = search ? (await field.boundingBox())! : undefined;
						return [
							boxesOverlap(legend, hint),
							box ? boxesOverlap(legend, box) : false,
							box ? boxesOverlap(hint, box) : false
						];
					};
					await expect.poll(overlaps).toStrictEqual([false, false, false]);
				});
			}
		}
	});
});

test.describe('the share dialog on the smallest editor screen', { tag: '@cross-browser' }, () => {
	test.use({ viewport: { width: 600, height: 400 } });

	test('keeps all its controls reachable', async ({ page }) => {
		await page.goto('/');
		await waitForMapIsReady(page);
		await page.getByRole('button', { name: /^Share/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });

		for (const control of [
			dialog.getByRole('button', { name: 'Copy embed code' }),
			dialog.getByRole('slider', { name: 'Precision' }),
			dialog.getByRole('button', { name: 'Edit shared map…' }),
			dialog.getByRole('button', { name: 'Reload' })
		]) {
			await control.scrollIntoViewIfNeeded();
			await expect(control).toBeInViewport();
		}
	});
});

test('the sidebar can be hidden, without moving the map content', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const title = sidebar(page).getByRole('heading', { level: 2 });
	await expect(title).toHaveText('Map');
	const hide = page.getByRole('button', { name: 'Hide sidebar' });
	await expect(hide).toHaveAttribute('aria-expanded', 'true');
	const berlin = await project(page, [13.4, 52.5]);

	await hide.click();
	await expect(title).toBeHidden();
	const show = page.getByRole('button', { name: 'Show sidebar' });
	await expect(show).toHaveAttribute('aria-expanded', 'false');
	// the tab is at the right edge of the map now
	expect((await show.boundingBox())!.x).toBeGreaterThan(page.viewportSize()!.width - 30);
	const moved = await project(page, [13.4, 52.5]);
	expect(moved[0]).toBeCloseTo(berlin[0], 0);
	expect(moved[1]).toBeCloseTo(berlin[1], 0);

	// the sidebar comes back
	await show.click();
	await expect(title).toHaveText('Map');
	const back = await project(page, [13.4, 52.5]);
	expect(back[0]).toBeCloseTo(berlin[0], 0);
});

test('a marker with an opacity fades together with its halo', async ({ page }) => {
	const view = { center: [13.4, 52.5] as [number, number], radius: 3000 };
	const marker = (color: string) =>
		encodeState({ view, elements: [{ type: 'marker', point: view.center, style: { color, size: 4, haloWidth: 2 } }] });

	/** The pixels around the marker, with the opacity of its symbols set to `opacity` if given. */
	async function pixels(state: string, opacity?: number): Promise<number[]> {
		await page.goto('/view/#' + state);
		await waitForMapIsReady(page);
		if (opacity !== undefined) {
			await page.evaluate(
				(o) => (window as unknown as MapWindow).map.setPaintProperty('elements_symbol', 'icon-opacity', o),
				opacity
			);
		}
		await waitForMapIsIdle(page);
		const [x, y] = await project(page, view.center);
		const png = await page.screenshot({ clip: { x: x - 50, y: y - 50, width: 100, height: 100 } });
		return page.evaluate(async (base64) => {
			const image = new Image();
			image.src = 'data:image/png;base64,' + base64;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			return [...context.getImageData(0, 0, image.width, image.height).data];
		}, png.toString('base64'));
	}
	const difference = (a: number[], b: number[]) => Math.max(...a.map((value, i) => Math.abs(value - b[i])));

	const translucent = await pixels(marker('#d55e0080'));
	// not the same as the opaque marker
	expect(difference(translucent, await pixels(marker('#d55e00')))).toBeGreaterThan(50);
	// but the same as the opaque marker with a lower opacity, which also fades the halo. Last,
	// since the next map of a link keeps the opacity of the layer.
	expect(difference(translucent, await pixels(marker('#d55e00'), 128 / 255))).toBeLessThanOrEqual(2);
});

// MapLibre draws the labels of a layer over all its symbols, so the markers are drawn in groups by
// several layers: a marker in front covers the label of a marker behind it.
test('a marker in front covers the label of a marker behind it', { tag: '@cross-browser' }, async ({ page }) => {
	const a: [number, number] = [13.4, 52.5];
	const b: [number, number] = [13.4035, 52.5];
	/** The red pixels of the flag of B, which is in front of the long label of A at the right of A. */
	async function redOfB(labelOfA: string): Promise<number> {
		await page.goto(
			'/view/#' +
				encodeState({
					view: { center: a, radius: 2000 },
					elements: [
						{ type: 'marker', point: a, label: labelOfA, style: { color: '#0000ff', size: 2, labelPosition: 'right' } },
						{ type: 'marker', point: b, label: 'B', style: { color: '#ff0000', size: 2, labelPosition: 'right' } }
					]
				})
		);
		await waitForMapIsReady(page);
		const [x, y] = await project(page, b);
		const png = await page.screenshot({ clip: { x: x - 10, y: y - 40, width: 40, height: 40 } });
		return page.evaluate(async (base64) => {
			const image = new Image();
			image.src = 'data:image/png;base64,' + base64;
			await image.decode();
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const { data } = context.getImageData(0, 0, image.width, image.height);
			let red = 0;
			for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) red++;
			return red;
		}, png.toString('base64'));
	}
	const alone = await redOfB('');
	expect(alone).toBeGreaterThan(50);
	// the label of A, under B, covers nothing of it
	expect(await redOfB('AAAAAAAAAAAAAAAA')).toBeGreaterThanOrEqual(alone * 0.95);
});

test('a legend hidden in the viewer stays in the editor, to be edited', async ({ page }) => {
	const legend = { entries: [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'Park' }] };
	await page.goto('/#' + encodeState({ view: { center: [13.4, 52.5], radius: 3000 }, meta: { legend }, elements: [] }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	const preview = page.frameLocator('iframe[title=preview]');
	const shown = sidebar(page).getByRole('region', { name: 'Controls' }).getByRole('checkbox', { name: 'Legend' });
	await expect(preview.getByRole('list', { name: 'Legend' })).toBeVisible();

	// hidden in the panel of the shared map, to which the dialog leads, and from which it comes back
	await dialog.getByRole('button', { name: 'Edit shared map…' }).click();
	await shown.uncheck();
	await expect.poll(async () => (await storedState(page)).meta?.viewer).toStrictEqual({ legend: 'none' });
	// the map shows it as visitors see it, while the shared map is edited
	await expect(page.getByRole('list', { name: 'Legend' })).toHaveCount(0);
	await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
	await expect(preview.getByRole('list', { name: 'Legend' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('list', { name: 'Legend' })).toBeVisible();

	// shown again at its default place
	await page.getByRole('button', { name: /^Share/ }).click();
	await dialog.getByRole('button', { name: 'Edit shared map…' }).click();
	await shown.check();
	await expect.poll(async () => (await storedState(page)).meta?.viewer).toBeUndefined();
	await sidebar(page).getByRole('button', { name: 'Back to the map' }).click();
	await expect(preview.getByRole('list', { name: 'Legend' })).toBeVisible();
});

test('the place of the legend is set in its panel and in the panel of the shared map alike', async ({ page }) => {
	const legend = { entries: [{ type: 'area' as const, style: { color: '#ff0000' }, label: 'Park' }] };
	await page.goto('/#' + encodeState({ view: { center: [13.4, 52.5], radius: 3000 }, meta: { legend }, elements: [] }));
	await waitForMapIsReady(page);
	const viewer = async () => (await storedState(page)).meta?.viewer;
	// the legend panel
	await page.getByRole('button', { name: 'Edit legend' }).click();
	const panel = sidebar(page);
	const shown = panel.getByRole('checkbox', { name: 'Shown' });
	await expect(shown).toBeChecked();
	await expect(panel.getByRole('radio', { name: 'Bottom left' })).toBeChecked();

	// set in the panel, shown in the one of the shared map
	await panel.getByRole('radio', { name: 'Top right' }).check();
	await expect.poll(viewer).toStrictEqual({ legend: 'top-right' });
	await panel.getByRole('button', { name: 'Edit shared map…' }).click();
	const place = panel.getByRole('radiogroup', { name: 'Place of the legend' });
	await expect(place.getByRole('radio', { name: 'Top right' })).toBeChecked();

	// set there, shown in the panel of the legend, which is selected as before
	await place.getByRole('radio', { name: 'Bottom', exact: true }).check();
	await page.keyboard.press('Escape');
	await expect(panel.getByRole('radio', { name: 'Bottom', exact: true })).toBeChecked();

	// hidden in shared maps, as an undo step
	await shown.uncheck();
	await expect.poll(viewer).toStrictEqual({ legend: 'none' });
	await expect(panel.getByRole('radio', { name: 'Bottom', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(viewer).toStrictEqual({ legend: 'bottom' });
	await page.getByRole('button', { name: 'Edit legend' }).click();
	await expect(shown).toBeChecked();
	await expect(panel.getByRole('radio', { name: 'Bottom', exact: true })).toBeChecked();
});

test('the preview shows the map as visitors see it, over the editor', { tag: '@cross-browser' }, async ({ page }) => {
	const point: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				view: { center: point, radius: 3000 },
				elements: [{ type: 'marker', point, label: 'Cafe', popup: { text: 'A café' } }]
			})
	);
	await waitForMapIsReady(page);
	// the marker is selected in the editor
	const [x, y] = await project(page, point);
	await page.mouse.click(x + 6, y - 8);
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();

	// the button of the top bar is "Preview" in the editor and "Editor" in the preview
	const button = page.getByRole('button', { name: 'Preview' });
	const back = page.getByRole('button', { name: 'Editor' });
	await button.click();
	await expect(back).toBeVisible();
	await expect(button).toHaveCount(0);
	// measured again for its new text: as wide as whole pixels, and the text fits
	const size = () => back.evaluate((b) => [b.getBoundingClientRect().width % 1, b.scrollWidth - b.clientWidth]);
	await expect.poll(size).toStrictEqual([0, 0]);
	const preview = page.frameLocator('iframe[title="Preview of the shared map"]');
	await expect(preview.getByRole('button', { name: 'Zoom in' })).toBeVisible();
	await expect
		.poll(
			() =>
				page
					.locator('iframe[title="Preview of the shared map"]')
					.evaluate((f: HTMLIFrameElement) => (f.contentWindow as unknown as MapWindow).map?.loaded() === true),
			{ timeout: PREVIEW_TIMEOUT }
		)
		.toBe(true);

	// the popups of the viewer open on click
	const frame = page.locator('iframe[title="Preview of the shared map"]');
	const box = (await frame.boundingBox())!;
	const [px, py] = await frame.evaluate((f: HTMLIFrameElement, p) => {
		const { x, y } = (f.contentWindow as unknown as MapWindow).map.project(p);
		return [x, y];
	}, point);
	await page.mouse.click(box.x + px + 6, box.y + py - 8);
	await expect(preview.getByText('A café')).toBeVisible();

	// the keys of the editor do nothing behind it, e.g. Delete
	await page.locator('body').press('Delete');
	await expect.poll(async () => (await storedState(page)).elements).toHaveLength(1);

	// it follows the changes of the map
	await back.focus();
	await page.locator('body').press('Escape');
	await expect(button).toBeVisible();
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();
	await page.getByRole('button', { name: 'Delete' }).click();
	await button.click();
	await expect
		.poll(() =>
			page
				.locator('iframe[title="Preview of the shared map"]')
				.evaluate(
					(f: HTMLIFrameElement) =>
						(f.contentWindow as unknown as MapWindow).map?.queryRenderedFeatures({ layers: ['elements_symbol'] }).length
				)
		)
		.toBe(0);
	// e.g. an undo with the button of the top bar (the keys belong to the preview)
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).elements).toHaveLength(1);

	// back to the editor, which kept its selection
	await back.click();
	await expect(page.locator('iframe[title="Preview of the shared map"]')).toHaveCount(0);
});

/** How many pixels of the page in the box are near the color, e.g. red: [255, 0, 0]. */
async function pixelsOfColor(page: Page, clip: { x: number; y: number; width: number; height: number }, rgb: number[]) {
	const png = await page.screenshot({ clip });
	return page.evaluate(
		async ([base64, rgb]) => {
			const image = new Image();
			image.src = 'data:image/png;base64,' + base64;
			await image.decode();
			const canvas = new OffscreenCanvas(image.width, image.height);
			const context = canvas.getContext('2d')!;
			context.drawImage(image, 0, 0);
			const { data } = context.getImageData(0, 0, image.width, image.height);
			let count = 0;
			for (let i = 0; i < data.length; i += 4) {
				if (rgb.every((value, j) => Math.abs(data[i + j] - value) < 60)) count++;
			}
			return count;
		},
		[png.toString('base64'), rgb] as const
	);
}

// Each element at its place in the drawing order, also across kinds, e.g. an area over a marker
test('an area in front of a marker covers it', { tag: '@cross-browser' }, async ({ page }) => {
	const point: [number, number] = [13.4, 52.5];
	const marker: StateElementMarker = { type: 'marker', point, style: { color: '#ff0000', size: 2 } };
	const area: MapState['elements'][number] = {
		type: 'polygon',
		points: [
			[13.39, 52.495],
			[13.41, 52.495],
			[13.41, 52.505],
			[13.39, 52.505]
		],
		style: { color: '#0000ff' }
	};
	/** The red pixels of the marker. */
	async function redOfMarker(elements: MapState['elements']): Promise<number> {
		await page.goto('/view/#' + encodeState({ view: { center: point, radius: 2000 }, elements }));
		await page.reload();
		await waitForMapIsReady(page);
		const [x, y] = await project(page, point);
		return pixelsOfColor(page, { x: x - 20, y: y - 40, width: 40, height: 40 }, [255, 0, 0]);
	}
	expect(await redOfMarker([area, marker])).toBeGreaterThan(50);
	expect(await redOfMarker([marker, area])).toBe(0);
});

// With the labels of the background map over areas and lines, the markers are drawn over all
// areas and lines, under which the labels are; but areas and lines keep their order among
// themselves, e.g. the outline of an area behind another one is covered by it
test('areas keep their order under the labels of the background map', { tag: '@cross-browser' }, async ({ page }) => {
	const point: [number, number] = [13.4, 52.5];
	const square = (size: number): [number, number][] => [
		[13.4 - size, 52.5 - size / 1.6],
		[13.4 + size, 52.5 - size / 1.6],
		[13.4 + size, 52.5 + size / 1.6],
		[13.4 - size, 52.5 + size / 1.6]
	];
	// a blue outline, crossing the green area
	const behind: MapState['elements'][number] = {
		type: 'polygon',
		points: [
			[13.4, 52.49],
			[13.4, 52.51],
			[13.42, 52.5]
		],
		style: { color: '#00000000' },
		strokeStyle: { color: '#0000ff', width: 8 }
	};
	const area: MapState['elements'][number] = {
		type: 'polygon',
		points: square(0.004),
		style: { color: '#00ff00' },
		strokeStyle: { visible: false }
	};
	const marker: StateElementMarker = { type: 'marker', point, style: { color: '#ff0000', size: 2 } };
	async function colors(elements: MapState['elements']) {
		const meta = { labels: { mapOnTop: true } };
		await page.goto('/view/#' + encodeState({ view: { center: point, radius: 2000 }, meta, elements }));
		await page.reload();
		await waitForMapIsReady(page);
		const [x, y] = await project(page, point);
		const clip = { x: x - 60, y: y - 40, width: 120, height: 80 };
		return { blue: await pixelsOfColor(page, clip, [0, 0, 255]), red: await pixelsOfColor(page, clip, [255, 0, 0]) };
	}
	// the marker behind the areas is still on top of them
	const back = await colors([marker, behind, area]);
	expect(back.blue).toBe(0);
	expect(back.red).toBeGreaterThan(50);
	expect((await colors([marker, area, behind])).blue).toBeGreaterThan(50);
});

// With more than 200 layers (here: labeled markers), the labels of the markers get one layer of
// their own; with overlapping labels hidden, they are placed from the front, so the marker in front
// keeps its label
test('with many labels, the marker in front keeps its label where labels overlap', async ({ page }) => {
	const point: [number, number] = [13.4, 52.5];
	const many = Array.from({ length: 220 }, (_, i) => ({
		type: 'marker' as const,
		point: [13.3 + (i % 20) * 0.002, 52.45 + Math.floor(i / 20) * 0.002] as [number, number],
		label: `L${i}`
	}));
	const state: MapState = {
		view: { center: point, radius: 2000 },
		meta: { labels: { overlap: 'hide' } },
		elements: [
			...many,
			{ type: 'marker', point, label: 'Blue behind', style: { color: '#0000ff' } },
			{ type: 'marker', point, label: 'Red in front', style: { color: '#ff0000' } }
		]
	};
	await page.goto('/view/#' + encodeState(state));
	await waitForMapIsReady(page);
	const [x, y] = await project(page, point);
	const shown = () =>
		page.evaluate(
			({ x, y }) =>
				(window as unknown as MapWindow).map
					.queryRenderedFeatures(
						[
							[x - 100, y - 60],
							[x + 200, y + 60]
						],
						{ layers: ['elements_labels'] }
					)
					.map((f) => f.properties.label),
			{ x, y }
		);
	// the label of the marker behind moves to another side, if there is room
	await expect.poll(shown).toContain('Red in front');
});

// The middle of the capitals of each text is the middle of its symbol or swatch, measured in the
// pixels, at four times the resolution of the screen
test.describe('the texts of the legend', { tag: '@cross-browser' }, () => {
	test.use({ deviceScaleFactor: 4 });

	test('are centered on their symbols and swatches', async ({ page }) => {
		const entries = [
			{ type: 'area' as const, style: { color: '#0072b2' }, label: 'HHHH' },
			{ type: 'marker' as const, style: { color: '#d55e00', symbol: 'icons:anchor' }, label: 'HHHH' }
		];
		for (const font of ['sans-serif', 'serif', 'monospace'] as const) {
			for (const layout of ['vertical', 'horizontal', 'inline'] as const) {
				const legend = { font, layout, bold: font === 'serif', entries };
				await page.goto(
					'/view/#' + encodeState({ view: { center: [13.4, 52.5], radius: 3000 }, meta: { legend }, elements: [] })
				);
				// at four times the resolution, the canvas of the map is too large for MapLibre
				await waitForMapIsReady(page, { expectedMessages: [/The canvas is larger than maxCanvasSize/] });
				const rows = page.getByRole('list', { name: 'Legend' }).getByRole('listitem');
				for (const [i, kind] of ['swatch', 'symbol'].entries()) {
					const row = rows.nth(i);
					const box = (await row.boundingBox())!;
					const mark = (await row.locator('canvas, .swatch').boundingBox())!;
					const png = await row.screenshot();
					// the rows of pixels with ink: of the symbol or swatch, and of the text right of it
					const [ink, text] = await page.evaluate(
						async ([base64, split]) => {
							const image = new Image();
							image.src = 'data:image/png;base64,' + base64;
							await image.decode();
							const canvas = new OffscreenCanvas(image.width, image.height);
							const context = canvas.getContext('2d')!;
							context.drawImage(image, 0, 0);
							const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
							const rows = (from: number, to: number) => {
								const found: number[] = [];
								for (let y = 0; y < height; y++) {
									for (let x = from; x < to; x++) {
										const k = (y * width + x) * 4;
										if (data[k] + data[k + 1] + data[k + 2] < 500) {
											found.push(y);
											break;
										}
									}
								}
								return [Math.min(...found), Math.max(...found) + 1];
							};
							return [rows(0, split), rows(split, width)];
						},
						[png.toString('base64'), Math.round((mark.x + mark.width - box.x) * 4)] as const
					);
					const middle = ([top, bottom]: number[]) => (top + bottom) / 2 / 4;
					expect(Math.abs(middle(text) - middle(ink)), `${kind}, ${font}, ${layout}`).toBeLessThanOrEqual(0.6);
				}
			}
		}
	});
});
