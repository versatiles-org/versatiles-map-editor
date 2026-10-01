import { expect, test } from './lib/test.js';
import { decodeState, encodeState, type MapState, type StateElementMarker } from '../packages/map-state/src/index.js';
import {
	boxesOverlap,
	project,
	storedState,
	waitForMapIsIdle,
	waitForMapIsReady,
	type MapWindow
} from './lib/utils.js';

test.describe('small screens', () => {
	// wide enough for the hint to fit on one line, next to the attribution
	test.use({ viewport: { width: 500, height: 500 } });

	test('show the map read-only with a hint', async ({ page }) => {
		await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [] }));
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
			map: { center: [13.4, 52.5], radius: 10000 },
			elements: [{ type: 'marker', point: [13.4, 52.5] }]
		});
		await page.goto('/view#' + hash);
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
			map: { center: [13.4, 52.5], radius: 10000 },
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
		await page.goto('/view#' + encodeState(state));
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

test('precision of a shared map', async ({ page }) => {
	const point: [number, number] = [13.412341, 52.512341];
	await page.goto(
		'/#' +
			encodeState({
				map: { center: [13.4, 52.5], radius: 10000 },
				// about 11 × 11 km
				frame: [13.33, 52.45, 13.49, 52.55],
				elements: [{ type: 'marker', point }]
			})
	);
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: /^Share/ }).click();
	const precision = page.getByRole('combobox', { name: 'Precision' });
	const shared = async () => {
		const link = await page.getByLabel('Link', { exact: true }).inputValue();
		// the shared map opens in the viewer
		expect(new URL(link).pathname).toBe('/view');
		const element = decodeState(new URL(link).hash.slice(1)).elements[0] as StateElementMarker;
		return { point: element.point, length: link.length };
	};

	// automatic: a thousandth of the size of the visible area, about 11 m
	await expect(precision.getByRole('option').first()).toHaveText('Automatic (about 11 m)');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.4123, 52.5123]);
	const automatic = await shared();

	await precision.selectOption('About 1 m');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.41234, 52.51234]);
	await precision.selectOption('About 1.11 km');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.41, 52.51]);
	expect((await shared()).length).toBeLessThan(automatic.length);

	// the map in the editor keeps its precision
	expect(((await storedState(page)).elements[0] as StateElementMarker).point).toStrictEqual([13.41234, 52.51234]);
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
						map: { center: [13.4, 52.5], radius: 10000 },
						meta: {
							viewer: { search: search ? 'top-left' : 'none', legend: position },
							legend: {
								entries: [
									{ color: '#ff0000', label: 'A long legend entry' },
									{ color: '#00ff00', label: 'Another entry' }
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
			dialog.getByRole('combobox', { name: 'Precision' }),
			dialog.getByRole('checkbox', { name: 'Address search' }),
			dialog.getByRole('checkbox', { name: 'Zoom buttons' }),
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
	const title = page.locator('.sidebar').getByRole('heading', { level: 2 });
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
	const map = { center: [13.4, 52.5] as [number, number], radius: 3000 };
	const marker = (color: string) =>
		encodeState({ map, elements: [{ type: 'marker', point: map.center, style: { color, size: 4, halo: 2 } }] });

	/** The pixels around the marker, with the opacity of its symbols set to `opacity` if given. */
	async function pixels(state: string, opacity?: number): Promise<number[]> {
		await page.goto('/view#' + state);
		await waitForMapIsReady(page);
		if (opacity !== undefined) {
			await page.evaluate(
				(o) => (window as unknown as MapWindow).map.setPaintProperty('elements_symbol', 'icon-opacity', o),
				opacity
			);
		}
		await waitForMapIsIdle(page);
		const [x, y] = await project(page, map.center);
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
			'/view#' +
				encodeState({
					map: { center: a, radius: 2000 },
					elements: [
						{ type: 'marker', point: a, style: { label: labelOfA, color: '#0000ff', size: 2, align: 1 } },
						{ type: 'marker', point: b, style: { label: 'B', color: '#ff0000', size: 2, align: 1 } }
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
	const legend = { entries: [{ color: '#ff0000', label: 'Park' }] };
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, meta: { legend }, elements: [] }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });
	const preview = page.frameLocator('iframe[title=preview]');
	await expect(preview.getByRole('list', { name: 'Legend' })).toBeVisible();

	await dialog.getByRole('checkbox', { name: 'Legend' }).uncheck();
	await expect.poll(async () => (await storedState(page)).meta?.viewer).toStrictEqual({ legend: 'none' });
	await expect(preview.getByRole('list', { name: 'Legend' })).toHaveCount(0);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('list', { name: 'Legend' })).toBeVisible();

	// shown again at its default place
	await page.getByRole('button', { name: /^Share/ }).click();
	await dialog.getByRole('checkbox', { name: 'Legend' }).check();
	await expect.poll(async () => (await storedState(page)).meta?.viewer).toBeUndefined();
	await expect(preview.getByRole('list', { name: 'Legend' })).toBeVisible();
});

test('the preview shows the map as visitors see it, over the editor', { tag: '@cross-browser' }, async ({ page }) => {
	const point: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				map: { center: point, radius: 3000 },
				elements: [{ type: 'marker', point, style: { label: 'Cafe' }, popup: { text: 'A café' } }]
			})
	);
	await waitForMapIsReady(page);
	// the marker is selected in the editor
	const [x, y] = await project(page, point);
	await page.mouse.click(x + 6, y - 8);
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();

	const button = page.getByRole('button', { name: 'Preview' });
	await button.click();
	await expect(button).toHaveAttribute('aria-pressed', 'true');
	const preview = page.frameLocator('iframe[title="Preview of the shared map"]');
	await expect(preview.getByRole('button', { name: 'Zoom in' })).toBeVisible();
	await expect
		.poll(() =>
			page
				.locator('iframe[title="Preview of the shared map"]')
				.evaluate((f: HTMLIFrameElement) => (f.contentWindow as unknown as MapWindow).map?.loaded() === true)
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
	await button.focus();
	await page.locator('body').press('Escape');
	await expect(button).toHaveAttribute('aria-pressed', 'false');
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
	await button.click();
	await expect(page.locator('iframe[title="Preview of the shared map"]')).toHaveCount(0);
});
