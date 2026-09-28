import { expect, test } from './lib/test.js';
import { decodeState, encodeState, type MapState, type StateElementMarker } from '../packages/map-state/src/index.js';
import { boxesOverlap, project, stateInUrl, waitForMapIsIdle, waitForMapIsReady } from './lib/utils.js';

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

test.describe('viewer', () => {
	// small screens show the read-only viewer, like embedded maps
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
		await page.goto('/#' + encodeState(state));
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
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'marker', point }] })
	);
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: /^Share/ }).click();
	const precision = page.getByRole('combobox', { name: 'Precision' });
	const shared = async () => {
		const link = await page.getByLabel('Link', { exact: true }).inputValue();
		const element = decodeState(new URL(link).hash.slice(1)).elements[0] as StateElementMarker;
		return { point: element.point, length: link.length };
	};

	// automatic: a thousandth of the 10 km viewport radius, about 11 m
	await expect(precision.getByRole('option').first()).toHaveText('Automatic (about 11 m)');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.4123, 52.5123]);
	const automatic = await shared();

	await precision.selectOption('About 1 m');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.41234, 52.51234]);
	await precision.selectOption('About 1.11 km');
	await expect.poll(async () => (await shared()).point).toStrictEqual([13.41, 52.51]);
	expect((await shared()).length).toBeLessThan(automatic.length);

	// the map in the editor keeps its precision
	expect((stateInUrl(page).elements[0] as StateElementMarker).point).toStrictEqual([13.41234, 52.51234]);
});

test.describe('overlays of the viewer on a phone', () => {
	// narrow, so the hint wraps into two lines
	test.use({ viewport: { width: 390, height: 700 } });

	for (const search of [false, true]) {
		for (const position of ['top-left', 'top', 'top-right'] as const) {
			test(`a legend at ${position}${search ? ', with search,' : ''} does not cover the hint`, async ({ page }) => {
				const state: MapState = {
					map: { center: [13.4, 52.5], radius: 10000 },
					meta: {
						search,
						legend: {
							position,
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
				const legend = (await page.getByRole('list', { name: 'Legend' }).boundingBox())!;
				const hint = (await page.getByText('Open this page on a larger screen').boundingBox())!;
				expect(boxesOverlap(legend, hint)).toBe(false);
				if (search) {
					const field = (await page.getByRole('combobox', { name: 'Search address or place' }).boundingBox())!;
					expect(boxesOverlap(legend, field)).toBe(false);
					expect(boxesOverlap(hint, field)).toBe(false);
				}
			});
		}
	}
});

test.describe('the share dialog on the smallest editor screen', { tag: '@cross-browser' }, () => {
	test.use({ viewport: { width: 600, height: 400 } });

	test('keeps all its controls reachable', async ({ page }) => {
		await page.goto('/');
		await waitForMapIsReady(page);
		await page.getByRole('button', { name: /^Share/ }).click();
		const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });

		for (const control of [
			dialog.getByRole('button', { name: 'Copy Embed Code' }),
			dialog.getByRole('combobox', { name: 'Precision' }),
			dialog.getByRole('checkbox', { name: 'Address search in the map' }),
			dialog.getByRole('button', { name: 'Reload' })
		]) {
			await control.scrollIntoViewIfNeeded();
			await expect(control).toBeInViewport();
		}

		// the caption of the aspect ratios does not cover the "Reload" button
		const caption = (await dialog.getByText('Aspect ratio of the preview').boundingBox())!;
		const reload = (await dialog.getByRole('button', { name: 'Reload' }).boundingBox())!;
		expect(boxesOverlap(caption, reload)).toBe(false);
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
