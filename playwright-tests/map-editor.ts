import { readFileSync } from 'fs';
import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { decodeState, encodeState, type MapState, type StateElementMarker } from '../src/lib/codec/index.js';
import { stateInUrl, trackServerRequests, waitForMapIsIdle, waitForMapIsReady } from './lib/utils';

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
- combobox "Search address or place"
- separator
- button "Map":
  - text: Map
  - img
- button "New ✓"
- button "Open… ✓"
- button "Download ✓"
- button "Share/Embed ✓"
- separator
- button "Background map":
  - text: Background map
  - img
- text: Base map
- combobox "Base map":
  - option "Vector map" [selected]
  - option "Satellite"
- text: Theme
- combobox "Theme":
  - option "Colorful" [selected]
  - option "Natural"
  - option "Muted"
  - option "Gray"
  - option "Black & white"
- text: Font
- combobox "Font":
  - option "Noto Sans" [selected]
  - option "Fira Sans"
  - option "Lato"
  - option "Libre Baskerville"
  - option "Merriweather Sans"
  - option "Nunito"
  - option "Open Sans"
  - option "PT Sans"
  - option "Roboto"
  - option "Source Sans 3"
- text: Language
- combobox "Language":
  - option "Browser language" [selected]
  - option "Local names"
  - option "Arabic"
  - option "Dutch"
  - option "English"
  - option "French"
  - option "German"
  - option "Greek"
  - option "Italian"
  - option "Polish"
  - option "Portuguese"
  - option "Spanish"
  - option "Ukrainian"
- text: Labels
- combobox "Labels":
  - option "Normal" [selected]
  - option "Fewer"
  - option "None"
- separator
- button "Legend":
  - text: Legend
  - img
- button "Add legend entry ✓"
- separator
- button "Import/Export":
  - text: Import/Export
  - img
- group "GeoJSON:":
  - text: "GeoJSON:"
  - button "Import ✓"
  - button "Export ✓"
- group "Table (CSV/TSV):":
  - text: "Table (CSV/TSV):"
  - button "Import table… ✓"
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

test('deleting nodes and elements with the keyboard', async ({ page }) => {
	const points: [number, number][] = [
		[13.35, 52.5],
		[13.4, 52.52],
		[13.45, 52.5]
	];
	await page.goto(
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'line', points }] })
	);
	await waitForMapIsReady(page);
	const project = (point: [number, number]) =>
		page.evaluate((point) => {
			const { x, y } = (window as unknown as { map: import('maplibre-gl').Map }).map.project(point);
			return [x, y] as const;
		}, point);
	const linePoints = () => stateInUrl(page).elements.map((e) => ('points' in e ? e.points.length : 0));

	// select the line, then its middle node
	const [x, y] = await project([13.375, 52.51]);
	await page.mouse.click(x, y);
	await waitForMapIsIdle(page);
	await page.mouse.click(...(await project(points[1])));
	await expect(page.getByRole('button', { name: 'Delete node' })).toBeEnabled();

	// Delete removes the node, Backspace without a selected node the element
	await page.keyboard.press('Delete');
	await expect.poll(linePoints).toStrictEqual([2]);
	await expect(page.getByRole('button', { name: 'Delete node' })).toBeHidden();
	await page.keyboard.press('Backspace');
	await expect.poll(linePoints).toStrictEqual([]);
});

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
		const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
		expect(overlap).toBe(false);
		await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(0);
	});
});

test('color picker', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Polygon' }).click();
	// the codec returns colors in upper case
	const fill = () => (stateInUrl(page).elements[0] as { style?: { color?: string } })?.style?.color?.toLowerCase();
	const stroke = () =>
		(stateInUrl(page).elements[0] as { strokeStyle?: { color?: string } })?.strokeStyle?.color?.toLowerCase();
	const [fillColor, strokeColor] = await page.getByLabel('Color').all();

	// a hex value sets the fill color
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff00');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(() => fill()).toBe('#00ff00');
	await expect(fillColor).toHaveText('#00ff00');

	// Escape closes the picker
	await page.keyboard.press('Escape');
	await expect(page.getByLabel('Hex')).toBeHidden();

	// the outline offers the used colors, most recently used first
	await strokeColor.click();
	const palette = page.getByRole('group', { name: 'Used colors' }).getByRole('button');
	await expect
		.poll(() => palette.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label'))))
		.toStrictEqual(['#00ff00', '#ff0000']);
	await palette.first().click();
	await expect.poll(() => stroke()).toBe('#00ff00');

	// dragging in the saturation/brightness field creates a single undo step
	await fillColor.click();
	const field = page.getByRole('slider', { name: 'Saturation and brightness' });
	const box = (await field.boundingBox())!;
	await page.mouse.move(box.x + box.width - 1, box.y + 1);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	// the center is half saturation and half brightness of the hue green
	await expect.poll(() => fill()).toBe('#408040');
	await expect(page.getByLabel('Green')).toHaveValue('128');
	await page.screenshot({ path: 'test-results/color-picker.png' });
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => fill()).toBe('#00ff00');
});

test('editing a popup', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const viewport = page.viewportSize()!;
	// select the marker by clicking its flag icon, which is drawn above and right of its point
	await page.mouse.click((viewport.width - 250) / 2 + 6, viewport.height / 2 - 8);

	const popup = page.getByRole('textbox', { name: 'Popup' });
	await popup.fill('Hello **world**\nhttps://versatiles.org');
	// Backspace in the text field must not delete the element
	await popup.press('Backspace');
	await popup.blur();
	await expect
		.poll(() => stateInUrl(page).elements[0]?.popup)
		.toStrictEqual({ text: 'Hello **world**\nhttps://versatiles.or' });
});

test.describe('viewer', () => {
	// small screens show the read-only viewer, like embedded maps
	test.use({ viewport: { width: 500, height: 500 } });

	test('opens popups on click', async ({ page }) => {
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
		const project = (point: [number, number]) =>
			page.evaluate((point) => {
				const { x, y } = (window as unknown as { map: import('maplibre-gl').Map }).map.project(point);
				return [x, y] as const;
			}, point);
		const cursor = () =>
			page.evaluate(() => document.querySelector<HTMLElement>('.maplibregl-canvas-container')!.style.cursor);

		// an element with a popup shows a pointer cursor
		const [x, y] = await project([13.4, 52.49]);
		await page.mouse.move(x, y);
		await expect.poll(cursor).toBe('pointer');

		// a click opens the formatted popup
		await page.mouse.click(x, y);
		const popup = page.locator('.maplibregl-popup');
		await expect(popup.locator('strong')).toHaveText('polygon');
		await expect(popup.getByRole('link', { name: 'VersaTiles' })).toHaveAttribute('href', 'https://versatiles.org/');

		// an element without a popup does not react
		const [cx, cy] = await project([13.5, 52.55]);
		await page.mouse.move(cx, cy);
		await expect.poll(cursor).toBe('');

		// a click elsewhere closes the popup
		await page.mouse.click(cx, cy);
		await expect(popup).toBeHidden();
	});
});

test('searching a place', async ({ page }) => {
	const requests: URLSearchParams[] = [];
	let fail = false;
	await page.route('https://geocode.versatiles.org/**', (route) => {
		requests.push(new URL(route.request().url()).searchParams);
		if (fail) return route.fulfill({ status: 500 });
		const feature = (name: string, coordinates: [number, number], extent?: number[]) => ({
			type: 'Feature',
			properties: { name, city: 'Berlin', country: 'Deutschland', extent },
			geometry: { type: 'Point', coordinates }
		});
		return route.fulfill({
			json: {
				type: 'FeatureCollection',
				features: [
					feature('Brandenburger Tor', [13.3777, 52.5163]),
					feature('Tiergarten', [13.35, 52.515], [13.33, 52.52, 13.37, 52.51])
				]
			}
		});
	});
	await page.goto('/');
	// the last search fails on purpose
	await waitForMapIsReady(page, { expectedMessages: [/status of 500/, /Geocoding failed/, /^Error$/] });
	const mapCenter = () =>
		page.evaluate(() => (window as unknown as { map: import('maplibre-gl').Map }).map.getCenter().toArray());

	const search = page.getByRole('combobox', { name: 'Search address or place' });
	await search.fill('Brandenburger');
	const options = page.getByRole('listbox', { name: 'Search results' }).getByRole('option');
	await expect(options).toHaveText(['Brandenburger Tor, Berlin, Deutschland', 'Tiergarten, Berlin, Deutschland']);
	// one request after typing, preferring results near the current view
	expect(requests.length).toBe(1);
	expect(requests[0].get('q')).toBe('Brandenburger');
	expect(requests[0].has('lat') && requests[0].has('lon')).toBe(true);

	// the keyboard selects a place, and the map moves to its extent
	await search.press('ArrowDown');
	await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
	await search.press('Enter');
	await expect(search).toHaveValue('Tiergarten, Berlin, Deutschland');
	await expect(page.getByRole('listbox')).toBeHidden();
	await expect.poll(mapCenter).toStrictEqual([expect.closeTo(13.35, 2), expect.closeTo(52.515, 2)]);

	// a click selects a place without extent, which can be marked
	await search.fill('Brandenburger Tor');
	await options.first().click();
	await expect.poll(mapCenter).toStrictEqual([expect.closeTo(13.3777, 3), expect.closeTo(52.5163, 3)]);
	await page.getByRole('button', { name: 'Add marker here' }).click();
	await expect.poll(() => stateInUrl(page).elements).toStrictEqual([{ type: 'marker', point: [13.3777, 52.5163] }]);
	await expect(page.getByRole('button', { name: 'Add marker here' })).toBeHidden();

	// errors are shown
	fail = true;
	await search.fill('Somewhere');
	await expect(page.getByRole('listbox')).toContainText('Search failed');
});

test('selecting multiple elements', async ({ page }) => {
	const square = (x: number, y: number): [number, number][] => [
		[x, y],
		[x + 0.02, y],
		[x + 0.02, y + 0.01],
		[x, y + 0.01]
	];
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{ type: 'polygon', points: square(13.33, 52.47) },
			{ type: 'polygon', points: square(13.4, 52.47), style: { color: '#0000ff' } },
			{ type: 'marker', point: [13.37, 52.52] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);
	const project = (point: [number, number]) =>
		page.evaluate((point) => {
			const { x, y } = (window as unknown as { map: import('maplibre-gl').Map }).map.project(point);
			return [x, y] as const;
		}, point);
	const elements = () => stateInUrl(page).elements;
	const fillColors = () =>
		elements().map((e) => (e.type === 'polygon' ? (e.style?.color ?? '#ff0000').toLowerCase() : e.type));
	const styleTitle = page.getByRole('button', { name: /^Style/ });

	// Shift+click adds the second polygon; the fill colors differ
	const a = await project([13.34, 52.475]);
	const b = await project([13.41, 52.475]);
	await page.mouse.click(...a);
	await expect(styleTitle).toHaveText('Style');
	await page.keyboard.down('Shift');
	await page.mouse.click(...b);
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Style of 2 elements');
	const fillColor = page.getByRole('button', { name: /^Color/ }).first();
	await expect(page.getByText('(mixed)').first()).toBeVisible();

	// the style changes for both polygons
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff00');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(fillColors).toStrictEqual(['#00ff00', '#00ff00', 'marker']);
	await page.keyboard.press('Escape');

	// dragging one of them moves both polygons south, but not the marker
	const firstLatitudes = () => elements().map((e) => ('points' in e ? e.points[0][1] : e.point[1]));
	const before = firstLatitudes();
	await page.mouse.move(...a);
	await page.mouse.down();
	await page.mouse.move(a[0], a[1] + 40, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => firstLatitudes()[0]).toBeLessThan(before[0]);
	const after = firstLatitudes();
	expect(after[1] - before[1]).toBeCloseTo(after[0] - before[0], 4);
	expect(after[2]).toBe(before[2]);
	await expect(styleTitle).toHaveText('Style of 2 elements');

	// duplicate and delete act on all selected elements
	await page.keyboard.press('ControlOrMeta+d');
	await expect.poll(() => elements().length).toBe(5);
	await expect(styleTitle).toHaveText('Style of 2 elements');
	await page.keyboard.press('Delete');
	await expect.poll(() => elements().length).toBe(3);

	// a marker and polygons have no style properties in common
	const moved = await project([13.34, 52.465]);
	await page.mouse.click(...moved);
	await expect(styleTitle).toHaveText('Style');
	await page.keyboard.down('Shift');
	await page.mouse.click(...((await project([13.37, 52.52])).map((v, i) => v + [6, -8][i]) as [number, number]));
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Style of 2 elements');
	await expect(page.getByText('These elements have no style properties in common.')).toBeVisible();

	// Shift+click on a selected element removes it from the selection
	await page.keyboard.down('Shift');
	await page.mouse.click(...moved);
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Style');
	await expect(page.getByRole('button', { name: /^Symbol/ })).toBeVisible();
});

test('copying and pasting a style', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'line',
				points: [
					[13.33, 52.52],
					[13.38, 52.52]
				],
				style: { color: '#0000ff', width: 4 }
			},
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.36, 52.47],
					[13.36, 52.49]
				]
			},
			{ type: 'marker', point: [13.42, 52.5] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);
	const project = (point: [number, number]) =>
		page.evaluate((point) => {
			const { x, y } = (window as unknown as { map: import('maplibre-gl').Map }).map.project(point);
			return [x, y] as const;
		}, point);
	// the style parts of all elements, with colors in lower case like in the state
	const styles = () =>
		stateInUrl(page).elements.map((e) => {
			const lower = (style?: { color?: string }) => style && { ...style, color: style.color?.toLowerCase() };
			return 'strokeStyle' in e
				? { style: lower(e.style), strokeStyle: lower(e.strokeStyle) }
				: { style: lower(e.style) };
		});
	const pasteButton = page.getByRole('button', { name: 'Paste style' });

	// copy the style of the line with the keyboard
	await page.mouse.click(...(await project([13.355, 52.52])));
	await expect(page.getByRole('button', { name: 'Copy style' })).toBeEnabled();
	await expect(pasteButton).toBeDisabled();
	await page.keyboard.press('ControlOrMeta+Alt+c');
	await expect(pasteButton).toBeEnabled();

	// paste it onto the polygon and the marker at once
	await page.mouse.click(...(await project([13.35, 52.475])));
	await page.keyboard.down('Shift');
	// the flag icon of the marker is drawn above and right of its point
	const [mx, my] = await project([13.42, 52.5]);
	await page.mouse.click(mx + 6, my - 8);
	await page.keyboard.up('Shift');
	await expect(page.getByRole('button', { name: 'Style of 2 elements' })).toBeVisible();
	await pasteButton.click();

	// the outline of the polygon gets the line style, the marker only its color
	await expect
		.poll(styles)
		.toStrictEqual([
			{ style: { color: '#0000ff', width: 4 } },
			{ style: undefined, strokeStyle: { color: '#0000ff', width: 4 } },
			{ style: { color: '#0000ff' } }
		]);

	// a single undo step reverts both
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect
		.poll(() =>
			styles()
				.slice(1)
				.map((s) => JSON.stringify(s))
		)
		.toStrictEqual(['{}', '{}']);
});

test('styling the background map', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.38, 52.47],
					[13.38, 52.5]
				],
				// a pattern is an image, which a new style must not lose
				style: { pattern: 1 }
			},
			{ type: 'marker', point: [13.42, 52.5] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);

	// what the map shows: the element layers, the images of their patterns, the selection nodes
	const mapContent = () =>
		page.evaluate(() => {
			const map = (window as unknown as { map: import('maplibre-gl').Map }).map;
			// undefined while a new style loads
			const style = map.getStyle();
			if (!style) return undefined;
			const layers = style.layers.filter((l) => 'source' in l && l.source.startsWith('source_'));
			const nodes = map.getSource<import('maplibre-gl').GeoJSONSource>('selection_nodes')!.serialize().data as {
				features: unknown[];
			};
			return {
				elementLayers: layers.length,
				patterns: layers.filter((l) => l.type === 'fill' && map.hasImage('fill-pattern-' + l.id)).length,
				selectionNodes: nodes.features.length,
				satellite: 'satellite' in style.sources
			};
		});
	const background = () => stateInUrl(page).meta?.background;
	const [x, y] = await page.evaluate(() => {
		const { x, y } = (window as unknown as { map: import('maplibre-gl').Map }).map.project([13.36, 52.48]);
		return [x, y];
	});
	await page.mouse.click(x, y);
	const before = await mapContent();
	expect(before).toStrictEqual({ elementLayers: 3, patterns: 1, selectionNodes: 6, satellite: false });

	await page.getByRole('button', { name: 'Background map' }).click();
	await page.getByRole('combobox', { name: 'Theme' }).selectOption('Gray');
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'osm', options: { theme: 'gray', text: { language: 'user' } } });
	// the elements, their patterns and the selection survive the new style
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual(before);

	await page.getByRole('combobox', { name: 'Language' }).selectOption('German');
	await page.getByRole('combobox', { name: 'Labels' }).selectOption('Fewer');
	await page.getByRole('combobox', { name: 'Base map' }).selectOption('Satellite');
	// the colors of the vector map do not apply to the satellite map, the labels are kept
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'satellite', options: { osmOverlay: { text: { language: 'de', spacing: 2 } } } });
	await expect(page.getByRole('combobox', { name: 'Theme' })).toBeHidden();
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual({ ...before, satellite: true });

	// undoable: back to the gray map with fewer German labels
	const undone = { builder: 'osm', options: { theme: 'gray', text: { language: 'de', spacing: 2 } } };
	await page.getByRole('button', { name: 'Undo' }).click();
	// the URL is written throttled, so wait for the final state before reloading
	await expect.poll(background).toStrictEqual(undone);
	await expect(page.getByRole('combobox', { name: 'Base map' })).toHaveValue('vector');

	// kept in the URL, and shown in the read-only viewer
	await page.setViewportSize({ width: 500, height: 500 });
	await page.reload();
	await waitForMapIsReady(page);
	await expect(page.getByText('Open this page on a larger screen')).toBeVisible();
	expect(background()).toStrictEqual(undone);
	const labelsInGerman = () =>
		page.evaluate(() =>
			JSON.stringify((window as unknown as { map: import('maplibre-gl').Map }).map.getStyle()?.layers).includes(
				'name_de'
			)
		);
	await expect.poll(labelsInGerman).toBe(true);
});

test('editing the legend', async ({ page }) => {
	// e.g. a symbol drawn before the map has a style, when a map with a legend is opened
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.38, 52.47],
					[13.38, 52.5]
				],
				style: { color: '#00aa00' },
				strokeStyle: { visible: false }
			}
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const legendInUrl = () => {
		const legend = stateInUrl(page).meta?.legend;
		return legend && { ...legend, entries: legend.entries.map((e) => ({ ...e, color: e.color.toLowerCase() })) };
	};
	const overlay = page.getByRole('list', { name: 'Legend' });

	// a new entry starts with a color of the map
	await page.getByRole('button', { name: 'Legend', exact: true }).click();
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	await page.getByRole('textbox', { name: 'Text' }).fill('Park');
	await page.getByRole('textbox', { name: 'Text' }).press('Enter');
	await expect(overlay.getByRole('listitem')).toHaveText(['Park']);

	// a second entry with a blue symbol
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	const entry = page.getByRole('group', { name: 'Entry 2' });
	await entry.getByRole('textbox', { name: 'Text' }).fill('Cafe');
	await entry.getByRole('textbox', { name: 'Text' }).press('Enter');
	await entry.getByRole('button', { name: /^Color/ }).click();
	await entry.getByLabel('Hex').fill('#0000ff');
	await entry.getByLabel('Hex').press('Enter');
	await entry.getByRole('button', { name: /^Symbol/ }).click();
	await page.getByRole('button', { name: 'cafe', exact: true }).click();

	await page.getByRole('combobox', { name: 'Position' }).selectOption('Top right');
	await page.getByRole('combobox', { name: 'Layout' }).selectOption('Horizontal');
	await expect.poll(legendInUrl).toMatchObject({
		position: 'top-right',
		layout: 'horizontal',
		entries: [
			{ color: '#00aa00', label: 'Park' },
			{ color: '#0000ff', label: 'Cafe', symbol: expect.any(Number) }
		]
	});
	await expect(overlay.getByRole('listitem')).toHaveText(['Park', 'Cafe']);
	await expect(overlay.locator('canvas')).toHaveCount(1);
	await page.screenshot({ path: 'test-results/legend.png' });

	// shown in the read-only viewer
	await page.setViewportSize({ width: 500, height: 500 });
	await page.reload();
	await waitForMapIsReady(page);
	await expect(overlay.getByRole('listitem')).toHaveText(['Park', 'Cafe']);
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.reload();
	await waitForMapIsReady(page);

	// without entries, there is no legend
	await page.getByRole('button', { name: 'Legend', exact: true }).click();
	await page.getByRole('button', { name: 'Remove entry 2' }).click();
	await page.getByRole('button', { name: 'Remove entry 1' }).click();
	await expect(overlay).toBeHidden();
	await expect.poll(legendInUrl).toBeUndefined();
	expect(pageErrors).toStrictEqual([]);
});

test('choosing a color scheme', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Polygon' }).click();
	const [fillColor, strokeColor] = await page.getByLabel('Color').all();
	const swatches = (name: string) =>
		page
			.getByRole('group', { name })
			.getByRole('button')
			.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
	const polygon = () => stateInUrl(page).elements[0] as { style?: { color?: string } };

	// the default scheme is offered, and not stored
	await fillColor.click();
	const scheme = page.getByRole('combobox', { name: 'Color scheme' });
	await expect(scheme).toHaveValue('bright');
	expect((await swatches('Bright (colorblind-safe)')).length).toBe(7);

	// another scheme, and one of its colors
	await scheme.selectOption('Okabe-Ito (colorblind-safe)');
	await expect.poll(() => stateInUrl(page).meta?.colorScheme).toBe('okabe-ito');
	await page
		.getByRole('group', { name: 'Okabe-Ito (colorblind-safe)' })
		.getByRole('button', { name: '#0072b2' })
		.click();
	await expect.poll(() => polygon().style?.color?.toLowerCase()).toBe('#0072b2');
	await page.keyboard.press('Escape');

	// the scheme belongs to the map, so every color picker offers it
	await strokeColor.click();
	await expect(page.getByRole('combobox', { name: 'Color scheme' })).toHaveValue('okabe-ito');
	await page.keyboard.press('Escape');

	// undo reverts the color, then the scheme
	await page.getByRole('button', { name: 'Undo' }).click();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => stateInUrl(page).meta?.colorScheme).toBeUndefined();
});

test('color schemes and fonts of an organisation', async ({ page }) => {
	await page.route('**/map-editor.config.json', (route) =>
		route.fulfill({
			json: {
				colorSchemes: [{ id: 'ci', name: 'Corporate', colors: ['#003366', '#e30613', '#f5a800'] }],
				replaceDefaultSchemes: true,
				fonts: ['lato_bold']
			}
		})
	);
	await page.goto('/');
	await waitForMapIsReady(page);
	const symbolFont = () =>
		page.evaluate(() => {
			const map = (window as unknown as { map: import('maplibre-gl').Map }).map;
			const layer = map.getStyle().layers.find((l) => l.type === 'symbol' && l.id.startsWith('symbol_'));
			return layer && map.getLayoutProperty(layer.id, 'text-font');
		});

	// only the corporate color scheme is offered, as the default
	await page.getByRole('button', { name: 'Marker' }).click();
	await page.getByLabel('Color').first().click();
	const scheme = page.getByRole('combobox', { name: 'Color scheme' });
	await expect(scheme.getByRole('option')).toHaveText(['Corporate']);
	await expect(page.getByRole('group', { name: 'Corporate' }).getByRole('button')).toHaveCount(3);
	await page.keyboard.press('Escape');

	// the configured font comes first, with its name from the tile server
	await page.getByRole('button', { name: 'Background map' }).click();
	const font = page.getByRole('combobox', { name: 'Font' });
	await expect(font.getByRole('option').first()).toHaveText('Lato Bold');

	// marker labels use the font of the map
	await expect.poll(symbolFont).toStrictEqual(['noto_sans_regular']);
	await font.selectOption('Lato Bold');
	await expect.poll(symbolFont).toStrictEqual(['lato_bold']);
	await expect.poll(() => stateInUrl(page).meta?.background?.options).toMatchObject({ text: { font: 'lato_bold' } });

	// the legend has a generic font of its own
	await page.getByRole('button', { name: 'Legend', exact: true }).click();
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	await page.getByRole('combobox', { name: 'Font' }).last().selectOption('Serif');
	await expect(page.getByRole('list', { name: 'Legend' })).toHaveCSS('font-family', 'serif');
	await expect.poll(() => stateInUrl(page).meta?.legend?.font).toBe('serif');
});

test.describe('importing a table', () => {
	async function openImport(page: Page) {
		await page.goto('/');
		await waitForMapIsReady(page);
		await page.getByRole('button', { name: 'Import/Export' }).click();
		await page.getByRole('button', { name: 'Import table…' }).click();
		return page.getByRole('dialog');
	}
	const markers = (page: Page) => stateInUrl(page).elements as StateElementMarker[];

	test('pasted from a spreadsheet, with coordinates', async ({ page }) => {
		const dialog = await openImport(page);
		await dialog
			.getByLabel('Or paste the table here:')
			.fill('Name\tBreite\tLänge\tInfo\nCafé\t52,5\t13,4\tOpen **daily**\nShop\t52,51\t13,41\t\nBroken\tx\t13\t');
		await dialog.getByRole('button', { name: 'Continue' }).click();

		// the columns are recognized
		await expect(dialog.getByRole('radio', { name: 'Latitude and longitude' })).toBeChecked();
		await expect(dialog.getByRole('combobox', { name: 'Latitude' })).toHaveValue('1');
		await expect(dialog.getByRole('combobox', { name: 'Longitude' })).toHaveValue('2');
		await expect(dialog.getByRole('combobox', { name: 'Label' })).toHaveValue('0');
		await expect(dialog.getByRole('combobox', { name: 'Popup' })).toHaveValue('3');

		await dialog.getByRole('button', { name: 'Import 3 rows' }).click();
		await expect(dialog.getByText('Imported 2 markers.')).toBeVisible();
		await expect(dialog.getByRole('list', { name: 'Rows not imported' })).toHaveText(
			'Row 3: x, 13 — invalid coordinates'
		);
		await dialog.getByRole('button', { name: /^Close/ }).click();

		await expect
			.poll(() => markers(page).map((m) => [m.point, m.style?.label, m.popup?.text]))
			.toStrictEqual([
				[[13.4, 52.5], 'Café', 'Open **daily**'],
				[[13.41, 52.51], 'Shop', undefined]
			]);
		// the imported markers are selected, and one undo step removes them
		await expect(page.getByRole('button', { name: 'Style of 2 elements' })).toBeVisible();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(() => markers(page).length).toBe(0);
	});

	test('from a file, with addresses', async ({ page }) => {
		await page.route('https://geocode.versatiles.org/**', (route) => {
			const q = new URL(route.request().url()).searchParams.get('q');
			const features =
				q === 'Hauptstraße 1, Berlin'
					? [{ type: 'Feature', properties: { name: q }, geometry: { type: 'Point', coordinates: [13.4, 52.5] } }]
					: [];
			return route.fulfill({ json: { type: 'FeatureCollection', features } });
		});
		const dialog = await openImport(page);

		// a CSV file from an older Excel: semicolons, Windows-1252
		const csv = 'Adresse;Name\r\nHauptstraße 1, Berlin;Bäckerei\r\nNirgendwo 5;Kiosk\r\n';
		const bytes = Buffer.from([...csv].map((c) => ({ ß: 0xdf, ä: 0xe4 })[c] ?? c.charCodeAt(0)));
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			dialog.getByRole('button', { name: 'Choose a file…' }).click()
		]);
		await chooser.setFiles({ name: 'places.csv', mimeType: 'text/csv', buffer: bytes });

		await expect(dialog.getByRole('radio', { name: 'Address (searched)' })).toBeChecked();
		await expect(dialog.getByRole('cell', { name: 'Bäckerei' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Import 2 rows' }).click();

		await expect(dialog.getByText('Imported 1 markers.')).toBeVisible();
		await expect(dialog.getByRole('list', { name: 'Rows not imported' })).toHaveText(
			'Row 2: Nirgendwo 5 — address not found'
		);
		await expect
			.poll(() => markers(page).map((m) => [m.point, m.style?.label]))
			.toStrictEqual([[[13.4, 52.5], 'Bäckerei']]);
	});

	test('styled by a category column, with a legend', async ({ page }) => {
		const dialog = await openImport(page);
		await dialog
			.getByLabel('Or paste the table here:')
			.fill('lat,lon,Kategorie\n52.50,13.40,Cafe\n52.51,13.41,Shop\n52.52,13.42,Cafe\n52.53,13.43,');
		await dialog.getByRole('button', { name: 'Continue' }).click();

		// the category column is recognized, and each value gets a color of the color scheme
		await expect(dialog.getByRole('combobox', { name: 'Category' })).toHaveValue('2');
		const categories = dialog.getByRole('group', { name: 'Style per category' });
		await expect(categories.getByRole('button', { name: /^Cafe \(2\)/ })).toHaveText('#4477aa');
		await expect(categories.getByRole('button', { name: /^Shop \(1\)/ })).toHaveText('#ee6677');
		await expect(categories.getByRole('button', { name: /^\(empty\) \(1\)/ })).toHaveText('#228833');

		// the colors can be changed
		await categories.getByRole('button', { name: /^Shop/ }).first().click();
		await categories.getByLabel('Hex').fill('#000000');
		await categories.getByLabel('Hex').press('Enter');

		await dialog.getByRole('button', { name: 'Import 4 rows' }).click();
		await expect(dialog.getByText('Imported 4 markers.')).toBeVisible();

		const colors = () => (stateInUrl(page).elements as StateElementMarker[]).map((m) => m.style?.color?.toLowerCase());
		await expect.poll(colors).toStrictEqual(['#4477aa', '#000000', '#4477aa', '#228833']);
		await expect
			.poll(() => stateInUrl(page).meta?.legend?.entries.map((e) => [e.label, e.color.toLowerCase()]))
			.toStrictEqual([
				['Cafe', '#4477aa'],
				['Shop', '#000000'],
				['(empty)', '#228833']
			]);
		await expect(page.getByRole('list', { name: 'Legend' }).getByRole('listitem')).toHaveText([
			'Cafe',
			'Shop',
			'(empty)'
		]);
	});
});

test.describe('address search in the viewer', () => {
	test('is enabled in the share dialog', async ({ page }) => {
		await page.goto('/');
		await waitForMapIsReady(page, { count: 1 });
		await page.getByRole('button', { name: 'Share/Embed' }).click();
		const option = page.getByRole('checkbox', { name: 'Address search in the map' });
		await expect(option).not.toBeChecked();
		await option.check();

		await expect.poll(() => stateInUrl(page).meta?.search).toBe(true);
		const link = await page.getByLabel('Link:').inputValue();
		expect(decodeState(new URL(link).hash.slice(1)).meta?.search).toBe(true);
		// the preview is the embedded viewer, with the search
		await expect(
			page.frameLocator('iframe[title=preview]').getByRole('combobox', { name: 'Search address or place' })
		).toBeVisible();
	});

	test.describe('small screens', () => {
		test.use({ viewport: { width: 500, height: 500 } });

		const boxesOverlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
			a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

		test('finds places without changing the map', async ({ page }) => {
			await page.route('https://geocode.versatiles.org/**', (route) =>
				route.fulfill({
					json: {
						type: 'FeatureCollection',
						features: [
							{
								type: 'Feature',
								properties: { name: 'Hamburg' },
								geometry: { type: 'Point', coordinates: [10, 53.55] }
							}
						]
					}
				})
			);
			const state: MapState = {
				map: { center: [13.4, 52.5], radius: 10000 },
				meta: { search: true, legend: { position: 'top-left', entries: [{ color: '#ff0000', label: 'Area' }] } },
				elements: [{ type: 'marker', point: [13.4, 52.5] }]
			};
			const hash = encodeState(state);
			await page.goto('/#' + hash);
			await waitForMapIsReady(page);

			const search = page.getByRole('combobox', { name: 'Search address or place' });
			const legend = page.getByRole('list', { name: 'Legend' });
			const hint = page.getByText('Open this page on a larger screen');
			expect(boxesOverlap((await search.boundingBox())!, (await legend.boundingBox())!)).toBe(false);
			expect(boxesOverlap((await search.boundingBox())!, (await hint.boundingBox())!)).toBe(false);

			await search.fill('Hamburg');
			await expect(page.getByRole('option')).toHaveText(['Hamburg']);
			await search.press('Enter');
			await expect
				.poll(() => page.evaluate(() => (window as unknown as { map: import('maplibre-gl').Map }).map.getCenter().lng))
				.toBeCloseTo(10, 1);
			// the viewer cannot change the map
			await expect(page.getByRole('button', { name: 'Add marker here' })).toHaveCount(0);
			expect(new URL(page.url()).hash.slice(1)).toBe(hash);
		});

		test('is hidden by default', async ({ page }) => {
			await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [] }));
			await waitForMapIsReady(page);
			await expect(page.getByRole('combobox', { name: 'Search address or place' })).toHaveCount(0);
		});
	});
});

test('precision of a shared map', async ({ page }) => {
	const point: [number, number] = [13.412341, 52.512341];
	await page.goto(
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'marker', point }] })
	);
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: 'Share/Embed' }).click();
	const precision = page.getByRole('combobox', { name: 'Precision:' });
	const shared = async () => {
		const link = await page.getByLabel('Link:').inputValue();
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
