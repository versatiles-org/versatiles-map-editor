import { readFileSync } from 'fs';
import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import type { Page } from '@playwright/test';
import {
	drawElement,
	drawnElements,
	menuItem,
	storedState,
	trackServerRequests,
	waitForMapIsReady
} from './lib/utils.js';

const mapUrl =
	'/#IVUAACybKM64mNZKaQomnQRMQQr0K4L5RjzgxOQoxnQpyAgxrwsgxGQkxJRBwsRskTI9PRn4oDShQAAv6hNphQvZxJGfCIUAefwpRQoUlbCDICAZGMYmPRyKDbAAZB6EYxPYJDKA';

// The controls of the top bar, the tools and the sidebar at the start, in this order. Only names and states
// are compared, so e.g. a separator or an icon does not matter.
const topbarAria = `
- button "Menu" [expanded=false]
- heading "VersaTiles Map Editor"
- button "Undo" [disabled]
- button "Redo" [disabled]
- button /^Share/
`;
const railAria = `
- toolbar "Tools":
  - button "Select" [pressed]
  - button "Marker"
  - button "Line"
  - button "Polygon"
  - button "Circle"
  - button "Elements" [expanded=false]
`;
const sidebarAria = `
- heading "Map" [level=2]
- region "Background map":
  - heading "Background map" [level=3]
  - radiogroup "Base map"
  - combobox "Theme"
  - combobox "Font"
  - combobox "Language"
  - radiogroup "Labels"
- region "Legend":
  - heading "Legend" [level=3]
  - button /^Add a legend/
- region "Shared map":
  - heading "Shared map" [level=3]
  - checkbox "Address search for visitors"
`;

/**
 * Check the requests to the tile server. Tiles, sprite sheets and TileJSON depend only on the
 * viewport and are compared exactly. The glyph ranges depend on the label texts in the
 * current tile data, so only the font and the basic Latin range are checked. The editor also
 * loads the list of the fonts, to offer them.
 */
function expectServerRequests(requests: string[], expected: string[]) {
	expect(requests).toContain('assets/glyphs/font_families.json');
	const glyphs = requests.filter((url) => url.startsWith('assets/glyphs/') && url.endsWith('.pbf'));
	expect(glyphs).toContain('assets/glyphs/noto_sans_regular/0-255.pbf');
	for (const url of glyphs) expect(url).toMatch(/^assets\/glyphs\/noto_sans_regular\/\d+-\d+\.pbf$/);
	expect(requests.filter((url) => !url.startsWith('assets/glyphs/'))).toStrictEqual(expected);
}

test('empty map', { tag: '@cross-browser' }, async ({ page }) => {
	const tracker = await trackServerRequests(page);

	await page.goto('/');
	await waitForMapIsReady(page);

	expect(await page.locator('.wrapper').count()).toBe(1);
	expect(await page.locator('.wrapper').boundingBox()).toStrictEqual({
		x: 0,
		y: 0,
		width: 1280,
		height: 720
	});

	expectServerRequests(tracker(), [
		// the editor loads the list of the sheets and their symbols too
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.png',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.png',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.png',
		'assets/sprites/index.json',
		'tiles/osm/5/15/10',
		'tiles/osm/5/15/11',
		'tiles/osm/5/16/10',
		'tiles/osm/5/16/11',
		'tiles/osm/5/17/10',
		'tiles/osm/5/17/11',
		'tiles/osm/5/18/10',
		'tiles/osm/5/18/11',
		'tiles/osm/tiles.json'
	]);

	await expect(page.getByRole('banner')).toMatchAriaSnapshot(topbarAria);
	await expect(page.getByRole('toolbar', { name: 'Tools' })).toMatchAriaSnapshot(railAria);
	await expect(page.locator('.sidebar')).toMatchAriaSnapshot(sidebarAria);
	// the search is on the map, right of the tools
	const search = (await page.getByRole('combobox', { name: 'Search address or place' }).boundingBox())!;
	expect(search.x).toBeGreaterThan(48);
	expect(search.y).toBeGreaterThan(44);

	// the page has a title and a description
	await expect(page).toHaveTitle('VersaTiles Map Editor');
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /map/);
});

test('filled map', async ({ page }) => {
	const tracker = await trackServerRequests(page);

	await page.goto(mapUrl);
	await waitForMapIsReady(page);

	expectServerRequests(tracker(), [
		// the editor loads the list of the sheets and their symbols too
		'assets/sprites/base.json',
		'assets/sprites/base.json',
		'assets/sprites/base.png',
		'assets/sprites/extras.json',
		'assets/sprites/extras.json',
		'assets/sprites/extras.png',
		'assets/sprites/icons.json',
		'assets/sprites/icons.json',
		'assets/sprites/icons.png',
		'assets/sprites/index.json',
		'tiles/osm/13/4399/2686',
		'tiles/osm/13/4399/2687',
		'tiles/osm/13/4400/2686',
		'tiles/osm/13/4400/2687',
		'tiles/osm/tiles.json'
	]);

	await expect(page.locator('.sidebar')).toMatchAriaSnapshot(sidebarAria);
});

test('invalid hash', async ({ page }) => {
	const pageErrors: Error[] = [];
	page.on('pageerror', (error) => pageErrors.push(error));
	const consoleErrors: string[] = [];
	page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));

	await page.goto('/#this-is-not-a-valid-state');
	await waitForMapIsReady(page, { expectedMessages: [/^Invalid map state in URL hash/] });

	expect(pageErrors).toStrictEqual([]);
	expect(consoleErrors).toStrictEqual([expect.stringMatching(/^Invalid map state in URL hash/)]);
	// the map is empty, and a message says why
	const message = page.getByRole('alert');
	await expect(message).toHaveText(/The map in the link could not be read/);
	await message.getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.locator('.sidebar')).toMatchAriaSnapshot(sidebarAria);
});

test('keeps an opened map in the URL', async ({ page }) => {
	const state = { map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'marker', point: [13.4, 52.5] }] };
	await page.goto('/#' + encodeState(state as MapState));
	await waitForMapIsReady(page);
	// the viewport is written before the elements have loaded, which must not drop them
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);
});

test('keeps the map in the URL across reloads', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Marker');

	// a single change is written to the hash immediately
	const elementsInUrl = async () => (await storedState(page)).elements.map((e) => e.type);
	await expect.poll(elementsInUrl).toStrictEqual(['marker']);

	await page.reload();
	await waitForMapIsReady(page);

	const exportGeoJSON = await menuItem(page, 'Export', 'GeoJSON');
	const [download] = await Promise.all([page.waitForEvent('download'), exportGeoJSON.click()]);
	const doc = JSON.parse(readFileSync(await download.path(), 'utf-8'));
	expect(doc.features.map((f: { geometry: { type: string } }) => f.geometry.type)).toStrictEqual(['Point']);
});

test('a map near a pole keeps its elements', async ({ page }) => {
	// half the height of the view reaches beyond the latitudes of the map
	const state: MapState = {
		map: { center: [0, 70], radius: 3_061_000 },
		elements: [{ type: 'marker', point: [10, 70] }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await expect.poll(async () => (await drawnElements(page)).symbol.length).toBe(1);

	// panning writes the map, with its marker, to the URL
	await page.mouse.move(400, 300);
	await page.mouse.down();
	await page.mouse.move(450, 350, { steps: 5 });
	await page.mouse.up();
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);
});

test('the stored map keeps the elements while the map is loading', async ({ page }) => {
	// a slow network: the style waits for its TileJSON until the test releases it
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/tiles.json', async (route) => {
		await released;
		await route.fallback();
	});
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
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

test('a loading indicator shows until the map has loaded', async ({ page }) => {
	// hold back the tiles, so the map keeps loading
	let release = () => {};
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/tiles/**', async (route) => {
		await released;
		await route.fallback();
	});
	await page.goto(mapUrl);
	await expect(page.getByRole('status').filter({ hasText: 'Loading map…' })).toBeVisible();
	release();
	await waitForMapIsReady(page);
	await expect(page.getByText('Loading map…')).toHaveCount(0);
});

test('the editor keeps its map, history and camera in the browser, not in the URL', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [{ type: 'marker', point: [13.4, 52.5] }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	// the link is opened, and removed from the URL
	await expect.poll(() => new URL(page.url()).hash).toBe('');
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);

	await drawElement(page, 'Marker');
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(2);
	const camera = (await storedState(page)).map;

	// a reload continues the map, with its camera and the step to undo
	await page.reload();
	await waitForMapIsReady(page);
	expect(new URL(page.url()).hash).toBe('');
	await expect.poll(() => drawnElements(page).then((drawn) => drawn.symbol.length)).toBe(2);
	expect((await storedState(page)).map).toStrictEqual(camera);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(1);
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect.poll(async () => (await storedState(page)).elements.length).toBe(2);
});

test('each tab edits its own map, and a reload keeps it', async ({ page, context }) => {
	const mapOf = (lng: number): MapState => ({
		map: { center: [lng, 52.5], radius: 10000 },
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
	await duplicate.addInitScript((id) => sessionStorage.setItem('versatiles-map-editor:session', id!), id);
	await duplicate.goto('/');
	await waitForMapIsReady(duplicate);
	await expect.poll(() => lng(duplicate)).toBe(13.4);
	expect(await duplicate.evaluate(() => sessionStorage.getItem('versatiles-map-editor:session'))).not.toBe(id);
});
