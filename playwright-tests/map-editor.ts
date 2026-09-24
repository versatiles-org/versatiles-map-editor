import { expect, test } from './lib/test.js';
import { trackServerRequests, waitForMapIsReady } from './lib/utils';

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

	expect(tracker()).toStrictEqual([
		'assets/glyphs/noto_sans_regular/0-255.pbf',
		'assets/glyphs/noto_sans_regular/256-511.pbf',
		'assets/glyphs/noto_sans_regular/512-767.pbf',
		'assets/glyphs/noto_sans_regular/8192-8447.pbf',
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

	expect(tracker()).toStrictEqual([
		'assets/glyphs/noto_sans_regular/0-255.pbf',
		'assets/sprites/base.json',
		'assets/sprites/base.png',
		'tiles/osm/13/4399/2686',
		'tiles/osm/13/4399/2687',
		'tiles/osm/13/4400/2686',
		'tiles/osm/13/4400/2687',
		'tiles/osm/tiles.json'
	]);

	expect(await page.locator('.wrapper').ariaSnapshot()).toBe(ariaResult);

	/*
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btnExportGeoJSON').click()]);
	const content = JSON.parse(readFileSync(await download.path(), 'utf-8'));
	expect(content).toStrictEqual({
		type: 'FeatureCollection'
	});
	*/
});

test('invalid hash', async ({ page }) => {
	const pageErrors: Error[] = [];
	page.on('pageerror', (error) => pageErrors.push(error));

	await page.goto('/#this-is-not-a-valid-state');
	await waitForMapIsReady(page);

	expect(pageErrors).toStrictEqual([]);
	expect(await page.locator('.wrapper').ariaSnapshot()).toBe(ariaResult);
});

test('dragging a slider creates a single undo step', async ({ page }) => {
	const undo = page.getByRole('button', { name: 'Undo' });

	async function addPolygon() {
		await page.goto('/');
		await waitForMapIsReady(page);
		await page.getByRole('button', { name: 'Polygon' }).click();
	}

	async function countUndoSteps(): Promise<number> {
		let steps = 0;
		while (await undo.isEnabled()) {
			await undo.click();
			steps++;
		}
		return steps;
	}

	await addPolygon();
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
