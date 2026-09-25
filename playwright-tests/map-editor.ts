import { readFileSync } from 'fs';
import { expect, test } from './lib/test.js';
import { decodeState, encodeState, type MapState } from '../src/lib/codec/index.js';
import type { Page } from '@playwright/test';
import { trackServerRequests, waitForMapIsIdle, waitForMapIsReady } from './lib/utils';

const mapUrl =
	'/#Fk2UZ1xMayU0hNExzxiEwxgqXoVwXyjHnBichRjOhTkBBjXhZBiMhJiSiDhYjZImR6ejPxWlCiqAAAAm2vxielvgqXEiqAABIz4RCgDLDPGJ7HGCpcSKoAAElbCDICAZDotMYhLcYKhyKDbAAZB6ExIqgAABZSKoAAAA';

const ariaResult = `- region "Map"
- group:
  - link "© OpenStreetMap contributors":
    - /url: https://www.openstreetmap.org/copyright
  - text: ·
  - link "CC BY 4.0":
    - /url: http://creativecommons.org/licenses/by/4.0/
  - link "ESA WorldCover 2021":
    - /url: https://esa-worldcover.org/en/data-access
- button "Undo ✓" [disabled]
- button "Redo ✓" [disabled]
- separator
- button "Map":
  - text: Map
  - img
- button "New ✓"
- button "Open… ✓"
- button "Download ✓"
- button "Share/Embed ✓"
- separator
- button "Import/Export":
  - text: Import/Export
  - img
- group "GeoJSON:":
  - text: "GeoJSON:"
  - button "Import ✓"
  - button "Export ✓"
- separator
- button "Add new":
  - text: Add new
  - img
- button "Marker ✓"
- button "Line ✓"
- button "Polygon ✓"
- button "Circle ✓"
- separator
- button "Style":
  - text: Style
  - img
- separator
- button "Actions":
  - text: Actions
  - img
- separator
- button "Help":
  - text: Help
  - img
- paragraph:
  - text: Submit bugs and feature requests as
  - link "Repository on GitHub":
    - /url: https://github.com/versatiles-org/versatiles-map-editor/issues
    - text: GitHub Issues`;

/**
 * The map state in the URL. Rapid changes are throttled, so the hash can be missing or
 * outdated for a moment. Returns an empty state if there is no valid hash (yet).
 */
function stateInUrl(page: Page): MapState {
	try {
		return decodeState(new URL(page.url()).hash.slice(1));
	} catch {
		return { elements: [] };
	}
}

/**
 * Check the requests to the tile server. Tiles, sprites and TileJSON depend only on the
 * viewport and are compared exactly. The glyph ranges depend on the label texts in the
 * current tile data, so only the font and the basic Latin range are checked.
 */
function expectServerRequests(requests: string[], expected: string[]) {
	const glyphs = requests.filter((url) => url.startsWith('assets/glyphs/'));
	expect(glyphs).toContain('assets/glyphs/noto_sans_regular/0-255.pbf');
	for (const url of glyphs) expect(url).toMatch(/^assets\/glyphs\/noto_sans_regular\/\d+-\d+\.pbf$/);
	expect(requests.filter((url) => !url.startsWith('assets/glyphs/'))).toStrictEqual(expected);
}

test('empty map', async ({ page }) => {
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
		'assets/sprites/base.json',
		'assets/sprites/base.png',
		'tiles/osm/5/16/10',
		'tiles/osm/5/16/11',
		'tiles/osm/5/17/10',
		'tiles/osm/5/17/11',
		'tiles/osm/5/18/10',
		'tiles/osm/5/18/11',
		'tiles/osm/tiles.json'
	]);

	expect(await page.locator('.wrapper').ariaSnapshot()).toBe(ariaResult);
});

test('filled map', async ({ page }) => {
	const tracker = await trackServerRequests(page);

	await page.goto(mapUrl);
	await waitForMapIsReady(page);

	expectServerRequests(tracker(), [
		'assets/sprites/base.json',
		'assets/sprites/base.png',
		'tiles/osm/13/4399/2686',
		'tiles/osm/13/4399/2687',
		'tiles/osm/13/4400/2686',
		'tiles/osm/13/4400/2687',
		'tiles/osm/tiles.json'
	]);

	expect(await page.locator('.wrapper').ariaSnapshot()).toBe(ariaResult);
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
	expect(await page.locator('.wrapper').ariaSnapshot()).toBe(ariaResult);
});

test('dragging a slider creates a single undo step', async ({ page }) => {
	const undo = page.getByRole('button', { name: 'Undo' });
	const addPolygon = () => page.getByRole('button', { name: 'Polygon' }).click();

	async function countUndoSteps(): Promise<number> {
		let steps = 0;
		while (await undo.isEnabled()) {
			await undo.click();
			steps++;
		}
		return steps;
	}

	await page.goto('/');
	await waitForMapIsReady(page);

	await addPolygon();
	// undoes everything, so the map is empty again
	const baseline = await countUndoSteps();

	await addPolygon();
	// a slider drag fires many input events, but only one change event on release
	await page.getByLabel('Opacity').evaluate((input: HTMLInputElement) => {
		for (const value of ['0.9', '0.8', '0.7', '0.6', '0.5']) {
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	expect(await countUndoSteps()).toBe(baseline + 1);
});

test('adding an element creates an undo step', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	const undo = page.getByRole('button', { name: 'Undo' });
	const redo = page.getByRole('button', { name: 'Redo' });
	await expect(undo).toBeDisabled();

	await page.getByRole('button', { name: 'Marker' }).click();
	await expect(undo).toBeEnabled();

	await undo.click();
	await expect(undo).toBeDisabled();
	await expect(redo).toBeEnabled();
});

test('selecting a symbol closes the symbol picker', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	await page.getByRole('button', { name: 'Marker' }).click();
	await page.getByRole('button', { name: 'flag' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	await dialog.getByRole('button', { name: 'airplane', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('button', { name: 'airplane' })).toBeVisible();
});

test('style editor controls have unique ids and labels', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	async function expectUniqueIds() {
		const ids = await page.locator('.sidebar [id]').evaluateAll((els) => els.map((el) => el.id));
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	}

	// polygon: fill and outline editors are shown together
	await page.getByRole('button', { name: 'Polygon' }).click();
	await expectUniqueIds();
	await expect(page.getByLabel('Color')).toHaveCount(2);
	await expect(page.getByLabel('Width')).toHaveCount(1);

	// marker: symbol button and label field are labelled separately
	await page.getByRole('button', { name: 'Marker' }).click();
	await expectUniqueIds();
	await expect(page.getByRole('button', { name: 'Symbol flag' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Label' })).toBeVisible();
});

test('downloads the map as GeoJSON and as map file', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Marker' }).click();

	await page.getByRole('button', { name: 'Import/Export' }).click();
	const [geojson] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btnExportGeoJSON').click()]);
	expect(geojson.suggestedFilename()).toBe('map.geojson');
	const doc = JSON.parse(readFileSync(await geojson.path(), 'utf-8'));
	expect(doc.type).toBe('FeatureCollection');
	expect(doc.features.map((f: { geometry: { type: string } }) => f.geometry.type)).toStrictEqual(['Point']);

	await page.getByRole('button', { name: 'Download' }).click();
	const [mapFile] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('dialog').getByRole('button', { name: 'Download' }).click()
	]);
	expect(mapFile.suggestedFilename()).toBe('default.mapjson');
	const state = JSON.parse(readFileSync(await mapFile.path(), 'utf-8'));
	expect(state.elements.map((e: { type: string }) => e.type)).toStrictEqual(['marker']);
});

test('file dialogs confirm and cancel', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Marker' }).click();
	const dialog = page.getByRole('dialog');
	const deleteButton = page.getByRole('button', { name: 'Delete' });

	// "New" → Cancel keeps the map
	await page.getByRole('button', { name: /^New/ }).click();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toBeHidden();
	await expect(deleteButton).toBeVisible();

	// "Download" → Enter in the file name field confirms
	await page.getByRole('button', { name: 'Download' }).click();
	const fileName = dialog.getByRole('textbox', { name: 'File name:' });
	await fileName.fill('my-map.mapjson');
	const [download] = await Promise.all([page.waitForEvent('download'), fileName.press('Enter')]);
	expect(download.suggestedFilename()).toBe('my-map.mapjson');
	// otherwise closing the page has to cancel the unfinished download, which is slow in Firefox
	await download.path();
	await expect(dialog).toBeHidden();

	// "New" → OK clears the map
	await page.getByRole('button', { name: /^New/ }).click();
	await dialog.getByRole('button', { name: 'OK' }).click();
	await expect(dialog).toBeHidden();
	await expect(deleteButton).toBeHidden();
});

test('keeps an opened map in the URL', async ({ page }) => {
	const state = { map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'marker', point: [13.4, 52.5] }] };
	await page.goto('/#' + encodeState(state as MapState));
	await waitForMapIsReady(page);
	// the viewport is written before the elements have loaded, which must not drop them
	await expect.poll(() => stateInUrl(page).elements.length).toBe(1);
});

test('keeps the map in the URL across reloads', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Marker' }).click();

	// a single change is written to the hash immediately
	const elementsInUrl = () => stateInUrl(page).elements.map((e) => e.type);
	await expect.poll(elementsInUrl).toStrictEqual(['marker']);

	await page.reload();
	await waitForMapIsReady(page);

	await page.getByRole('button', { name: 'Import/Export' }).click();
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btnExportGeoJSON').click()]);
	const doc = JSON.parse(readFileSync(await download.path(), 'utf-8'));
	expect(doc.features.map((f: { geometry: { type: string } }) => f.geometry.type)).toStrictEqual(['Point']);
});

test('duplicating an element', async ({ page }) => {
	// a marker in the center of the map
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);

	const pointsInUrl = () => stateInUrl(page).elements.map((e) => ('point' in e ? e.point : undefined));
	// the map is centered in the area left of the 250px sidebar
	const viewport = page.viewportSize()!;
	const x = (viewport.width - 250) / 2;
	const y = viewport.height / 2;

	// select the marker by clicking its flag icon, which is drawn above and right of its point
	await page.mouse.click(x + 6, y - 8);
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();

	// button and keyboard shortcut place the copy with an offset
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await page.keyboard.press('ControlOrMeta+d');
	await expect.poll(async () => (await pointsInUrl()).length).toBe(3);
	const [original, copy1, copy2] = pointsInUrl();
	expect(original).toStrictEqual(center);
	expect(copy1![0]).toBeGreaterThan(center[0]);
	expect(copy1![1]).toBeLessThan(center[1]);
	expect(copy2![0]).toBeGreaterThan(copy1![0]);

	// alt-drag moves a copy of the selected marker and keeps the original
	await page.mouse.click(x + 6, y - 8);
	// the selection node is rendered asynchronously, and it can only be dragged once it is visible
	await waitForMapIsIdle(page);
	await page.keyboard.down('Alt');
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x - 50, y - 50, { steps: 5 });
	await page.mouse.up();
	await page.keyboard.up('Alt');
	await expect.poll(async () => (await pointsInUrl()).length).toBe(4);
	const points = pointsInUrl();
	expect(points[0]).toStrictEqual(center);
	expect(points[3]![0]).toBeLessThan(center[0]);
	expect(points[3]![1]).toBeGreaterThan(center[1]);
});
