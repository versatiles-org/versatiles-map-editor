import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import { drawnElements, storedState, trackServerRequests, waitForMapIsReady, sidebar } from './lib/utils.js';

const mapUrl =
	'/#ISqAAAIAniYwRbIEOHuiK52TZRnXExrJTSBDOIaioOE0Ekg4oy5SodrrPg3njXInA8NvM4NZk6VH8TKkHo_xV-0oUAACOcmY17OIGhIkOnYyAtOGtIdiCDYBAWHoxPcJGUAAAA';

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
- region "Map":
  - heading "Map" [level=3]
  - textbox "Title"
  - paragraph: /set in “Share”/
- region "Background map":
  - heading "Background map" [level=3]
  - radiogroup "Base map"
  - combobox "Theme"
- region "Background colors":
  - heading "Background colors" [level=3]
- region "Background labels":
  - heading "Background labels" [level=3]
  - radiogroup "Labels"
  - combobox "Font"
  - combobox "Language"
- region "Marker labels":
  - heading "Marker labels" [level=3]
- region "Legend":
  - heading "Legend" [level=3]
  - button /^Add a legend/
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
	await expect(sidebar(page)).toMatchAriaSnapshot(sidebarAria);
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

	await expect(sidebar(page)).toMatchAriaSnapshot(sidebarAria);
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
	await expect(sidebar(page)).toMatchAriaSnapshot(sidebarAria);
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
