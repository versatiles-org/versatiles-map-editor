import { expect, test } from './lib/test.js';
import type { Locator, Page } from '@playwright/test';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import { coveredPoints, menuItem, project, waitForMapIsReady } from './lib/utils.js';

// Nothing of the editor may cover a control that is shown, e.g. a bar at the edge a menu or a
// drop-down. Each situation opens as many overlays at once as possible.

const center: [number, number] = [13.4, 52.5];
const state: MapState = {
	map: { center, radius: 10000 },
	meta: { legend: { position: 'top-left', entries: [{ color: '#ff0000', label: 'Route' }] } },
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
			page.getByRole('slider', { name: 'Saturation and brightness' }),
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
		await page.locator('.map canvas').focus();
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

test('a message is above the drawer and the bars', async ({ page }) => {
	await page.goto('/#this-is-not-a-valid-state');
	await waitForMapIsReady(page, { expectedMessages: [/^Invalid map state in URL hash/] });
	await page.keyboard.press('e');
	await expectOnTop(page.getByRole('alert'));
});

// one page for all positions: a new map in the URL hash replaces the legend without a reload
test('the legend keeps its corner, and the search and the attribution go to the other side', async ({ page }) => {
	const legendList = page.getByRole('list', { name: 'Legend' });
	const search = page.getByRole('combobox', { name: 'Search address or place' });
	const attribution = page.locator('.maplibregl-ctrl-attrib');
	for (const position of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
		await test.step(`a legend at ${position}`, async () => {
			await page.goto('/#' + encodeState({ ...state, meta: { legend: { ...state.meta!.legend!, position } } }));
			await waitForMapIsReady(page);
			await expect(legendList).toContainClass(`position-${position}`);
			const map = (await page.locator('.map').boundingBox())!;
			const [vertical, horizontal] = position.split('-');
			// the legend is at most 10px from the edges of the map between the bars, e.g. of the tools
			const legend = async () => {
				const box = (await legendList.boundingBox())!;
				return { top: box.y, bottom: box.y + box.height, left: box.x, right: box.x + box.width };
			};
			await expect
				.poll(async () => (await legend())[vertical as 'top' | 'bottom'])
				.toBeCloseTo(vertical === 'top' ? map.y + 44 + 10 : map.y + map.height - 26 - 10, -1);
			await expect
				.poll(async () => (await legend())[horizontal as 'left' | 'right'])
				.toBeCloseTo(horizontal === 'left' ? map.x + 48 + 10 : map.x + map.width - 250 - 10, -1);

			// the search at the top and the attribution at the bottom are on the other side of the map
			const other = vertical === 'top' ? search : attribution;
			const box = (await other.boundingBox())!;
			const middle = map.x + map.width / 2;
			if (horizontal === 'left') expect(box.x).toBeGreaterThan(middle);
			else expect(box.x + box.width).toBeLessThan(middle);
		});
	}
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
		await page.goto('/#' + encodeState({ ...state, meta: { ...state.meta, search: true } }));
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
			const [x, y] = await project(page, [13.3, 52.52]);
			await page.mouse.click(x + 6, y - 8);
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
