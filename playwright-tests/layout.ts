import { expect, test } from './lib/test.js';
import type { Locator, Page } from '@playwright/test';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import { coveredPoints, menuItem, project, waitForMapIsReady, type MapWindow } from './lib/utils.js';

// Nothing of the editor may cover a control that is shown, e.g. a bar at the edge a menu or a
// drop-down. Each situation opens as many overlays at once as possible.

const center: [number, number] = [13.4, 52.5];
const state: MapState = {
	map: { center, radius: 10000 },
	meta: {
		viewer: { legend: 'top-left' },
		legend: { entries: [{ type: 'polygon' as const, style: { color: '#ff0000' }, label: 'Route' }] }
	},
	elements: [
		{
			type: 'polygon',
			points: [
				[13.33, 52.47],
				[13.47, 52.47],
				[13.4, 52.53]
			]
		},
		{ type: 'marker', point: [13.3, 52.52] }
	]
};

async function open(page: Page) {
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
}

/** Each of the elements is on top, where it is shown. */
async function expectOnTop(...locators: Locator[]) {
	for (const locator of locators) {
		for (const element of await locator.all()) {
			if (!(await element.isVisible())) continue;
			const description = await element.evaluate((e) => e.outerHTML.slice(0, 80));
			expect(await coveredPoints(element), description).toStrictEqual([]);
		}
	}
}

// one page for all situations of the editor, which are opened and closed one after another
test('overlays of the editor are above what they open over', async ({ page }) => {
	await page.route('https://geocode.versatiles.org/**', (route) => {
		const feature = (name: string) => ({
			type: 'Feature',
			properties: { name, city: 'Berlin', country: 'Deutschland' },
			geometry: { type: 'Point', coordinates: center }
		});
		return route.fulfill({
			json: { type: 'FeatureCollection', features: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => feature(`Place ${n}`)) }
		});
	});
	await open(page);
	await page.keyboard.press('e');

	await test.step('the bars, the drawer and the sidebar are above the map and its overlays', async () => {
		// a selected polygon, whose bar of actions floats over the map
		await page.mouse.click(...(await project(page, [13.4, 52.49])));
		await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible();
		await expectOnTop(
			page.getByRole('banner').getByRole('button'),
			page.getByRole('toolbar', { name: 'Tools' }).getByRole('button'),
			page.getByRole('complementary', { name: /^Elements/ }).getByRole('button'),
			page.getByRole('toolbar', { name: 'Selection' }).getByRole('button'),
			page.locator('.statusbar'),
			page.getByRole('combobox', { name: 'Search address or place' }),
			page.getByRole('list', { name: 'Legend' }),
			page.getByRole('button', { name: 'Hide sidebar' })
		);
	});

	await test.step('the color picker is above the rest of the sidebar', async () => {
		await page
			.getByRole('button', { name: /^Color/ })
			.first()
			.click();
		await expect(page.getByLabel('Hex')).toBeVisible();
		await expectOnTop(
			page.getByRole('slider', { name: 'Red' }),
			page.getByLabel('Hex'),
			page.getByRole('group', { name: 'Used colors' }).getByRole('button')
		);
		await page.keyboard.press('Escape');
		await expect(page.getByLabel('Hex')).toBeHidden();
	});

	await test.step('the search results are above the legend and the bar of the selection', async () => {
		// the marker, near the search, with its bar of actions
		const [x, y] = await project(page, [13.3, 52.52]);
		await page.mouse.click(x + 6, y - 8);
		const search = page.getByRole('combobox', { name: 'Search address or place' });
		await search.fill('Place');
		const results = page.getByRole('listbox', { name: 'Search results' });
		await expect(results.getByRole('option')).toHaveCount(6);
		await expectOnTop(results.getByRole('option'));
		await search.press('Escape');
		await expect(results).toBeHidden();
	});

	await test.step('the bar of the drawing is above the map overlays', async () => {
		await page.locator('.map canvas.maplibregl-canvas').focus();
		await page.keyboard.press('l');
		await expect(page.getByRole('group', { name: 'Drawing' })).toBeVisible();
		await expectOnTop(page.getByRole('group', { name: 'Drawing' }).getByRole('button'));
		await page.keyboard.press('Escape');
		await expect(page.getByRole('group', { name: 'Drawing' })).toBeHidden();
	});

	await test.step('the menu is above the bars, the drawer and the sidebar', async () => {
		await page.getByRole('button', { name: 'Menu' }).click();
		const menu = page.getByRole('menu', { name: 'Menu' });
		// the longest menu, over the rail, the drawer and down to the status line
		await menu.getByRole('menuitem', { name: 'Import', exact: true }).click();
		await menu.getByRole('menuitem', { name: 'Export', exact: true }).click();
		await expect(menu.getByRole('menuitem').first()).toBeVisible();
		await expectOnTop(menu.getByRole('menuitem'));
	});
});

test('the groups of the menu open as submenus beside it, by hover, click and keyboard', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Menu' }).click();
	const menu = page.getByRole('menu', { name: 'Menu' });
	const importItem = menu.getByRole('menuitem', { name: 'Import', exact: true });
	const importMenu = page.getByRole('menu', { name: 'Import' });
	const exportMenu = page.getByRole('menu', { name: 'Export' });
	const box = async (locator: Locator) => (await locator.boundingBox())!;

	await test.step('hovering a group opens its submenu beside the menu, at its height, in the window', async () => {
		await importItem.hover();
		await expect(importMenu).toBeVisible();
		const [outer, row, sub] = [await box(menu), await box(importItem), await box(importMenu)];
		expect(sub.x).toBeGreaterThanOrEqual(outer.x + outer.width - 6);
		expect(Math.abs(sub.y - row.y)).toBeLessThan(12);
		expect(sub.y + sub.height).toBeLessThanOrEqual(page.viewportSize()!.height);
		// the menu does not grow
		expect((await box(menu)).height).toBe(outer.height);
		await expect(importItem).toHaveAttribute('aria-expanded', 'true');
	});

	await test.step('another group replaces it, and a plain item closes it', async () => {
		await menu.getByRole('menuitem', { name: 'Export', exact: true }).hover();
		await expect(exportMenu).toBeVisible();
		await expect(importMenu).toBeHidden();
		await menu.getByRole('menuitem', { name: 'Download…' }).hover();
		await expect(exportMenu).toBeHidden();
	});

	await test.step('a submenu stays open while the pointer moves towards it over another item', async () => {
		await importItem.hover();
		await expect(importMenu).toBeVisible();
		// from the middle of "Import" diagonally down to the lower half of its submenu, across "Export"
		const from = await box(importItem);
		const to = await box(importMenu);
		const exportRow = await box(menu.getByRole('menuitem', { name: 'Export', exact: true }));
		await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
		const target = { x: to.x + 20, y: Math.min(to.y + to.height - 4, exportRow.y + exportRow.height * 2) };
		await page.mouse.move(target.x, target.y, { steps: 12 });
		await expect(importMenu).toBeVisible();
		await expect(exportMenu).toBeHidden();
		await expect(importItem).toHaveAttribute('aria-expanded', 'true');
	});

	await test.step('the keyboard opens it with the focus inside, and goes back', async () => {
		await importItem.focus();
		await page.keyboard.press('ArrowRight');
		await expect(importMenu.getByRole('menuitem').first()).toBeFocused();
		await page.keyboard.press('ArrowDown');
		await expect(importMenu.getByRole('menuitem').nth(1)).toBeFocused();
		await page.keyboard.press('ArrowLeft');
		await expect(importMenu).toBeHidden();
		await expect(importItem).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(importMenu.getByRole('menuitem').first()).toBeFocused();
		// Escape closes the submenu first, then the menu
		await page.keyboard.press('Escape');
		await expect(importMenu).toBeHidden();
		await expect(menu).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(menu).toBeHidden();
	});

	await test.step('a click on an item of a submenu runs it and closes the menu', async () => {
		await page.getByRole('button', { name: 'Menu' }).click();
		await importItem.click();
		await importMenu.getByRole('menuitem', { name: 'Table (CSV/TSV)…' }).click();
		await expect(menu).toBeHidden();
		await expect(page.getByRole('dialog')).toBeVisible();
	});
});

test('a message is above the drawer and the bars', async ({ page }) => {
	await page.goto('/#this-is-not-a-valid-state');
	await waitForMapIsReady(page, { expectedMessages: [/^Invalid map state in URL hash/] });
	await page.keyboard.press('e');
	await expectOnTop(page.getByRole('alert'));
});

// one page for all positions: a new map in the URL hash replaces the legend without a reload
test('the legend keeps its corner, stacked with the search or the zoom buttons there', async ({ page }) => {
	const legendList = page.getByRole('list', { name: 'Legend' });
	const box = async (locator: Locator) => {
		const b = (await locator.boundingBox())!;
		return { top: b.y, bottom: b.y + b.height, left: b.x, right: b.x + b.width };
	};
	const search = page.getByRole('combobox', { name: 'Search address or place' });
	const zoom = page.locator('.maplibregl-ctrl-group').filter({ has: zoomIn(page) });
	const attribution = page.locator('.maplibregl-ctrl-attrib');
	for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
		await test.step(`a legend at ${position}`, async () => {
			await page.goto('/#' + encodeState({ ...state, meta: { ...state.meta, viewer: { legend: position } } }));
			await waitForMapIsReady(page);
			await expect(legendList).toContainClass(`position-${position}`);
			const map = (await page.locator('.map').boundingBox())!;
			const edges = {
				top: map.y + 44 + 10,
				bottom: map.y + map.height - 26 - 10,
				left: map.x + 48 + 10,
				right: map.x + map.width - 250 - 10
			};
			const [vertical, horizontal] = position.split('-') as ['top' | 'bottom', 'left' | 'right'];
			// at most 10px from the edge of the map between the bars, e.g. of the tools
			await expect.poll(async () => (await box(legendList))[horizontal]).toBeCloseTo(edges[horizontal], -1);
			const legend = await box(legendList);
			if (vertical === 'top') {
				// below the search (top left) or the zoom buttons (top right) of the editor
				const above = await box(horizontal === 'left' ? search : zoom);
				expect(above.top).toBeCloseTo(edges.top, -1);
				expect(legend.top).toBeCloseTo(above.bottom + 10, -1);
			} else {
				expect(legend.bottom).toBeCloseTo(edges.bottom, -1);
			}
			// the zoom buttons stay at the top right; the attribution is in the other bottom corner
			expect((await box(zoom)).right).toBeCloseTo(edges.right, -1);
			const middle = map.x + map.width / 2;
			const a = await box(attribution);
			if (position === 'bottom-left') expect(a.left).toBeGreaterThan(middle);
			else expect(a.right).toBeLessThan(middle);
		});
	}
});

const zoomIn = (page: Page) => page.getByRole('button', { name: 'Zoom in' });

test('the editor has buttons for zooming, the viewer too unless the map has none', async ({ page }) => {
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const zoom = () => page.evaluate(() => (window as unknown as MapWindow).map.getZoom());
	const before = await zoom();
	await zoomIn(page).click();
	await expect.poll(zoom).toBeCloseTo(before + 1, 1);
	await page.getByRole('button', { name: 'Zoom out' }).click();
	await expect.poll(zoom).toBeCloseTo(before, 1);

	await page.goto('/view#' + encodeState(state));
	await waitForMapIsReady(page);
	await expect(zoomIn(page)).toBeVisible();
	await page.goto('/view#' + encodeState({ ...state, meta: { ...state.meta, viewer: { navigation: 'none' } } }));
	await page.reload();
	await waitForMapIsReady(page);
	await expect(zoomIn(page)).toHaveCount(0);
});

test.describe('in the viewer', () => {
	test.use({ viewport: { width: 500, height: 500 } });

	test('the search results are above the legend', async ({ page }) => {
		await page.route('https://geocode.versatiles.org/**', (route) =>
			route.fulfill({
				json: {
					type: 'FeatureCollection',
					features: ['A', 'B', 'C', 'D'].map((n) => ({
						type: 'Feature',
						properties: { name: `Place ${n}`, city: 'Berlin', country: 'Deutschland' },
						geometry: { type: 'Point', coordinates: center }
					}))
				}
			})
		);
		await page.goto(
			'/#' + encodeState({ ...state, meta: { ...state.meta, viewer: { ...state.meta!.viewer, search: 'top-left' } } })
		);
		await waitForMapIsReady(page);
		await page.getByRole('combobox', { name: 'Search address or place' }).fill('Place');
		const results = page.getByRole('listbox', { name: 'Search results' });
		await expect(results.getByRole('option')).toHaveCount(4);
		// the open list may cover the hint below the search, but nothing covers the list
		await expectOnTop(results.getByRole('option'));
	});
});

/**
 * Containers that scroll where it does not make sense: sideways (e.g. by a few pixels of a
 * button), or with a scrollbar although everything fits (`overflow: scroll`). Scrolling long
 * content up and down is fine. Also the page itself must not scroll.
 */
async function needlessScrolling(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const found: string[] = [];
		for (const element of document.querySelectorAll<HTMLElement>('body *')) {
			if (!element.checkVisibility()) continue;
			const style = getComputedStyle(element);
			const classes = [...element.classList].filter((c) => !c.startsWith('svelte-'));
			const name = [element.tagName.toLowerCase(), ...classes].join('.');
			const x = element.scrollWidth - element.clientWidth;
			const y = element.scrollHeight - element.clientHeight;
			if (['auto', 'scroll'].includes(style.overflowX) && x > 1) found.push(`${name} scrolls sideways by ${x}px`);
			if (style.overflowX === 'scroll' && x <= 1) found.push(`${name} has a horizontal scrollbar without need`);
			if (style.overflowY === 'scroll' && y <= 1) found.push(`${name} has a vertical scrollbar without need`);
		}
		const page = document.documentElement;
		if (page.scrollWidth > page.clientWidth) found.push('the page scrolls sideways');
		if (page.scrollHeight > page.clientHeight) found.push('the page scrolls up and down');
		return found;
	});
}

for (const viewport of [
	{ width: 1280, height: 720 },
	{ width: 800, height: 500 }
]) {
	test.describe(`no needless scrolling at ${viewport.width}×${viewport.height}`, { tag: '@cross-browser' }, () => {
		test.use({ viewport });

		// one page for the panels and the dialogs, which are opened one after another
		test('in the panels and the dialogs', async ({ page }) => {
			await open(page);
			expect(await needlessScrolling(page), 'map settings').toStrictEqual([]);
			await page.keyboard.press('e');
			expect(await needlessScrolling(page), 'drawer').toStrictEqual([]);
			await page.mouse.click(...(await project(page, [13.4, 52.49])));
			expect(await needlessScrolling(page), 'polygon').toStrictEqual([]);
			await page
				.getByRole('button', { name: /^Color/ })
				.first()
				.click();
			expect(await needlessScrolling(page), 'color picker').toStrictEqual([]);
			await page.keyboard.press('Escape');
			// from the list, since on a small screen the bar of the selected polygon may cover the marker
			await page
				.getByRole('listbox', { name: 'Elements' })
				.getByRole('option', { name: /^Marker/ })
				.click();
			await page.getByRole('button', { name: /^Symbol/ }).click();
			expect(await needlessScrolling(page), 'symbol picker').toStrictEqual([]);
			await page.keyboard.press('Escape');
			await page.getByRole('list', { name: 'Legend' }).click();
			expect(await needlessScrolling(page), 'legend').toStrictEqual([]);
			await page.getByRole('button', { name: 'Menu' }).click();
			await page.getByRole('menuitem', { name: 'Import', exact: true }).click();
			await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
			expect(await needlessScrolling(page), 'menu').toStrictEqual([]);
			await page.keyboard.press('Escape');
			await expect(page.getByRole('menu', { name: 'Menu' })).toBeHidden();

			const dialog = page.getByRole('dialog');
			await page.getByRole('button', { name: /^Share/ }).click();
			await expect(dialog.locator('iframe')).toBeVisible();
			expect(await needlessScrolling(page), 'share').toStrictEqual([]);
			await dialog.getByRole('button', { name: 'Close' }).click();
			await (await menuItem(page, 'Import', 'Table (CSV/TSV)…')).click();
			expect(await needlessScrolling(page), 'table import').toStrictEqual([]);
			await dialog.getByRole('button', { name: 'Close' }).click();
			await page.keyboard.press('?');
			expect(await needlessScrolling(page), 'shortcuts').toStrictEqual([]);
			await dialog.getByRole('button', { name: 'Close' }).click();
			await (await menuItem(page, 'Download…')).click();
			expect(await needlessScrolling(page), 'download').toStrictEqual([]);
		});
	});
}

// An icon between two pixels is smoothed by each browser in its own way, e.g. a pixel higher or
// blurred: on whole pixels, all browsers draw it alike. Icons, not pictures, e.g. of patterns.
test('the icons of the editor are on whole pixels', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	// the drawer, and the selection bar and the inspector of an element
	await page.keyboard.press('e');
	const drawer = page.getByRole('complementary', { name: /^Elements/ });
	await drawer.getByRole('option').first().click();
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible();

	const between = await page.evaluate(() =>
		[...document.querySelectorAll('svg.icon, button svg')]
			.map((svg) => {
				const box = svg.getBoundingClientRect();
				const owner = svg.closest('[aria-label], button, [role=option], a');
				const name = owner?.getAttribute('aria-label') ?? owner?.textContent?.trim() ?? '';
				return { name, x: box.x, y: box.y, width: box.width };
			})
			.filter(({ x, y, width }) => width > 0 && (x % 1 !== 0 || y % 1 !== 0))
	);
	// also after a text, whose width differs by browser: undo and redo after the name of the
	// editor, and the icons of "Preview" and "Share" after the texts of the buttons left of them
	expect(between).toStrictEqual([]);

	// the names in the drawer start in one column: "Map settings", "Legend" and the elements
	const starts = await drawer.evaluate((aside) =>
		[...aside.querySelectorAll('.row, [role=option] .name')].map((row) => {
			// the text after the icon
			const text = [...row.childNodes].reverse().find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
			const range = document.createRange();
			range.selectNodeContents(text ?? row);
			return Math.round(range.getBoundingClientRect().left);
		})
	);
	expect(starts.length).toBeGreaterThan(2);
	expect(new Set(starts).size).toBe(1);

	// and centered in their 24×24 grid, so they are centered in their buttons, e.g. the cursor of
	// "Select": at most 1.25 units off (1px of an icon of 20px), for slanted shapes like the brush
	const offCenter = await page.evaluate(() =>
		[...document.querySelectorAll<SVGSVGElement>('svg.icon')]
			// those that are shown, e.g. not in a closed menu
			.filter((svg) => svg.getBBox().width > 0)
			.map((svg) => {
				const box = svg.getBBox();
				const owner = svg.closest('[aria-label], button, [role=option], a');
				const name = owner?.getAttribute('aria-label') ?? owner?.textContent?.trim() ?? '';
				const off = [box.x + box.width / 2 - 12, box.y + box.height / 2 - 12];
				return { name, off: off.map((v) => Math.round(v * 100) / 100) };
			})
			.filter(({ off }) => off.some((v) => Math.abs(v) > 1.25))
	);
	expect(offCenter).toStrictEqual([]);
});

test('fullscreen with F or from the menu, and back', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const isFullscreen = () => page.evaluate(() => document.fullscreenElement !== null);

	await page.keyboard.press('f');
	await expect.poll(isFullscreen).toBe(true);
	await (await menuItem(page, 'Exit fullscreen')).click();
	await expect.poll(isFullscreen).toBe(false);
	await (await menuItem(page, 'Fullscreen')).click();
	await expect.poll(isFullscreen).toBe(true);
	await page.keyboard.press('f');
	await expect.poll(isFullscreen).toBe(false);
});
