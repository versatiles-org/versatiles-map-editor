import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	drawElement,
	drawnElements,
	mapCenter,
	menuItem,
	showView,
	storedCamera,
	storedState,
	waitForMapIsReady
} from './lib/utils.js';

// The editor keeps its maps in the browser storage (IndexedDB), each tab its own map, instead of
// the URL. Each test starts with an empty storage.

/** A map with one marker at the longitude, and its title. */
const mapAt = (lng: number, title?: string): MapState => ({
	...(title ? { meta: { title } } : {}),
	elements: [{ type: 'marker', point: [lng, 52.5] }]
});

/** The recent maps in the menu, which it opens, without the buttons that delete them. */
async function recentMaps(page: Page) {
	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('menu', { name: 'Menu' }).getByRole('menuitem', { name: 'Recent maps', exact: true }).click();
	return page
		.getByRole('menu', { name: 'Recent maps' })
		.getByRole('menuitem')
		.filter({ hasNotText: /^(Delete)?$/ });
}

test('the stored map keeps the elements while the map is loading', async ({ page }) => {
	// a slow network: the style waits for its TileJSON until the test releases it
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/tiles.json', async (route) => {
		await released;
		await route.fallback();
	});
	const state: MapState = {
		elements: [{ type: 'marker', point: [13.4, 52.5] }]
	};
	await page.goto('/#' + encodeState(state));
	// The viewport is already set, the elements wait for the style. Something must *not* happen
	// here (storing the map without elements), so the test has to give it time to happen.
	await page.waitForTimeout(1000);
	expect((await storedState(page)).elements.length).toBe(1);

	release();
	await waitForMapIsReady(page);
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);
});

test('the editor keeps its map, history and camera in the browser, not in the URL', async ({ page }) => {
	const state: MapState = {
		elements: [{ type: 'marker', point: [13.4, 52.5] }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	// the link is opened, and removed from the URL
	await expect.poll(() => new URL(page.url()).hash).toBe('');
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);

	await drawElement(page, 'Marker');
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(2);
	// somewhere else: where the editor looks is kept with the map, not in it
	await showView(page, { center: [13.45, 52.48], radius: 20000 });
	await expect.poll(async () => (await storedCamera(page))?.center[0]).toBeCloseTo(13.45, 3);
	const camera = await storedCamera(page);

	// a reload continues the map, with its camera and the step to undo
	await page.reload();
	await waitForMapIsReady(page);
	expect(new URL(page.url()).hash).toBe('');
	await expect.poll(() => drawnElements(page).then((drawn) => drawn.symbol.length)).toBe(2);
	expect(await storedCamera(page)).toStrictEqual(camera);
	expect((await mapCenter(page))[0]).toBeCloseTo(13.45, 3);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(2);
});

test('each tab edits its own map, and a reload keeps it', async ({ page, context }) => {
	const mapOf = (lng: number): MapState => ({
		elements: [{ type: 'marker', point: [lng, 52.5] }]
	});
	const lng = async (page: Page) => {
		const element = (await storedState(page)).elements[0];
		return element && 'point' in element ? element.point[0] : undefined;
	};
	await page.goto('/#' + encodeState(mapOf(13.4)));
	await waitForMapIsReady(page);
	await expect.poll(() => lng(page)).toBe(13.4);

	// the last map is open in the first tab, so a second tab starts a new map
	const second = await context.newPage();
	await second.goto('/');
	await waitForMapIsReady(second);
	await expect(second.getByText('Your last map is open in another tab.')).toBeVisible();
	await expect.poll(() => drawnElements(second).then((drawn) => drawn.symbol.length)).toBe(0);
	await drawElement(second, 'Marker');
	await expect.poll(async () => (await storedState(second)).elements.length).toBe(1);

	// a reload keeps the map of each tab
	await page.reload();
	await waitForMapIsReady(page);
	await expect.poll(() => lng(page)).toBe(13.4);
	await expect.poll(() => drawnElements(page).then((drawn) => drawn.symbol.length)).toBe(1);
	await second.reload();
	await waitForMapIsReady(second);
	await expect(second.getByText('Your last map is open in another tab.')).toHaveCount(0);
	expect((await storedState(second)).elements).toHaveLength(1);
	expect(await lng(second)).not.toBe(13.4);

	// a duplicated tab (with the session id of the first tab) gets a copy of its map
	const duplicate = await context.newPage();
	const id = await page.evaluate(() => sessionStorage.getItem('versatiles-map-editor:session'));
	// only in the page: its iframes (e.g. an empty one) share its sessionStorage, and would set it
	// again after the editor has set the id of the copy
	await duplicate.addInitScript((id) => {
		if (window === window.top) sessionStorage.setItem('versatiles-map-editor:session', id!);
	}, id);
	await duplicate.goto('/');
	await waitForMapIsReady(duplicate);
	await expect.poll(() => lng(duplicate)).toBe(13.4);
	expect(await duplicate.evaluate(() => sessionStorage.getItem('versatiles-map-editor:session'))).not.toBe(id);
});

test('a link to a map that is already stored opens that map, not a copy', async ({ page }) => {
	await page.goto('/#' + encodeState(mapAt(13.4, 'Berlin')));
	await waitForMapIsReady(page);
	await expect.poll(async () => (await storedState(page)).meta?.title).toBe('Berlin');
	// another map in the tab, then the link again
	await (await menuItem(page, 'New map')).click();
	await drawElement(page, 'Marker');
	await expect.poll(async () => (await storedState(page)).meta).toBeUndefined();
	await page.goto('/#' + encodeState(mapAt(13.4, 'Berlin')));
	await expect.poll(async () => (await storedState(page)).meta?.title).toBe('Berlin');
	// opening it is no change, so the other map stays the most recent one
	await expect(await recentMaps(page)).toHaveText([/^1 marker\s*\S/, /^Berlin\s*This map$/]);
});

test('an unreadable link opens the last map, with a note', async ({ page }) => {
	await page.goto('/#' + encodeState(mapAt(13.4, 'Berlin')));
	await waitForMapIsReady(page);
	await expect.poll(async () => (await storedState(page)).meta?.title).toBe('Berlin');

	// the tab opens a broken link, after another page
	await page.goto('about:blank');
	await page.goto('/#this-is-not-a-valid-state');
	await waitForMapIsReady(page, { expectedMessages: [/^Invalid map state in URL hash/] });
	await expect(page.getByRole('alert')).toHaveText(/The map in the link could not be read/);
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Berlin');
	expect(new URL(page.url()).hash).toBe('');
});

test('the recent maps mark the maps of other tabs, and follow their changes', async ({ page, context }) => {
	await page.goto('/#' + encodeState(mapAt(13.4, 'Berlin')));
	await waitForMapIsReady(page);
	const second = await context.newPage();
	await second.goto('/#' + encodeState(mapAt(10, 'Hamburg')));
	await waitForMapIsReady(second);
	await expect.poll(async () => (await storedState(second)).meta?.title).toBe('Hamburg');

	// the map of the other tab cannot be opened or deleted
	const recent = await recentMaps(page);
	await expect(recent).toHaveText([/^Hamburg\s*Open in another tab$/, /^Berlin\s*This map$/]);
	await expect(recent.first()).toBeDisabled();
	await expect(page.getByRole('menu', { name: 'Recent maps' }).getByRole('menuitem', { name: /Delete/ })).toHaveCount(
		0
	);

	// a new title in the other tab is shown at once
	const title = second.getByRole('textbox', { name: 'Title' });
	await title.fill('Hamburg harbour');
	await title.press('Enter');
	await expect(recent.first()).toHaveText(/^Hamburg harbour/);

	// once the other tab is closed, its map can be opened
	await second.close();
	await page.keyboard.press('Escape');
	const reopened = await recentMaps(page);
	await expect(reopened.first()).toBeEnabled();
	await expect(reopened.first()).toHaveText(/^Hamburg harbour\s*\S/);
	await reopened.first().click();
	await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Hamburg harbour');
});

test('without a browser storage, the editor keeps the map in memory and says so', async ({ page }) => {
	// e.g. a private window that blocks the storage
	await page.addInitScript(() => {
		Object.defineProperty(window, 'indexedDB', {
			get: () => {
				throw new DOMException('Blocked', 'SecurityError');
			}
		});
	});
	await page.goto('/');
	await waitForMapIsReady(page, { expectedMessages: [/^The browser storage is not available/] });
	await expect(page.getByText('This browser does not keep maps. Download the map to keep it.')).toBeVisible();
	await expect(page.locator('.statusbar')).toContainText('Not saved: this browser keeps no maps');

	// editing and undo work as before
	await drawElement(page, 'Marker');
	await expect.poll(() => drawnElements(page).then((drawn) => drawn.symbol.length)).toBe(1);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => drawnElements(page).then((drawn) => drawn.symbol.length)).toBe(0);
	await expect(await recentMaps(page)).toHaveCount(0);
	await expect(page.getByRole('menu', { name: 'Recent maps' })).toContainText('No maps yet');
});
