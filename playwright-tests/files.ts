import { readFileSync } from 'fs';
import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type MapState, type StateElementMarker } from '../packages/map-state/src/index.js';
import { drawElement, menuItem, storedState, waitForMapIsReady } from './lib/utils.js';

test('downloads the map as GeoJSON and as map file', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Marker');

	const exportGeoJSON = await menuItem(page, 'Export', 'GeoJSON');
	const [geojson] = await Promise.all([page.waitForEvent('download'), exportGeoJSON.click()]);
	expect(geojson.suggestedFilename()).toBe('map.geojson');
	const doc = JSON.parse(readFileSync(await geojson.path(), 'utf-8'));
	expect(doc.type).toBe('FeatureCollection');
	expect(doc.features.map((f: { geometry: { type: string } }) => f.geometry.type)).toStrictEqual(['Point']);

	await (await menuItem(page, 'Download…')).click();
	const [mapFile] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('dialog').getByRole('button', { name: 'Download' }).click()
	]);
	expect(mapFile.suggestedFilename()).toBe('map.mapjson');
	const state = JSON.parse(readFileSync(await mapFile.path(), 'utf-8'));
	expect(state.elements.map((e: { type: string }) => e.type)).toStrictEqual(['marker']);
});

test('the title of the map names the page, the files and the shared map', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await expect(page).toHaveTitle('VersaTiles Map Editor');
	const title = page.getByRole('textbox', { name: 'Title' });
	await expect(title).toHaveAttribute('placeholder', 'Untitled map');

	// the page title changes while it is typed
	await title.fill('Cafés in Berlin');
	await expect(page).toHaveTitle('Cafés in Berlin – VersaTiles Map Editor');
	await title.press('Enter');
	await expect.poll(async () => (await storedState(page)).meta?.title).toBe('Cafés in Berlin');

	// the names of the files
	const exportGeoJSON = await menuItem(page, 'Export', 'GeoJSON');
	const [geojson] = await Promise.all([page.waitForEvent('download'), exportGeoJSON.click()]);
	expect(geojson.suggestedFilename()).toBe('Cafés in Berlin.geojson');
	await (await menuItem(page, 'Download…')).click();
	await expect(page.getByRole('dialog').getByRole('textbox')).toHaveValue('Cafés in Berlin.mapjson');
	await page.keyboard.press('Escape');

	// the shared map has it too
	const hash = encodeState(await storedState(page));
	await page.goto('/view#' + hash);
	await waitForMapIsReady(page);
	await expect(page).toHaveTitle('Cafés in Berlin – VersaTiles Map');

	// undoable
	await page.goto('/');
	await waitForMapIsReady(page);
	await expect(title).toHaveValue('Cafés in Berlin');
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(title).toHaveValue('');
	await expect(page).toHaveTitle('VersaTiles Map Editor');
});

test('the download dialog confirms with Enter, and cancels', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Marker');
	const dialog = page.getByRole('dialog');

	await (await menuItem(page, 'Download…')).click();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(dialog).toBeHidden();

	await (await menuItem(page, 'Download…')).click();
	const fileName = dialog.getByRole('textbox', { name: 'File name' });
	await fileName.fill('my-map.mapjson');
	const [download] = await Promise.all([page.waitForEvent('download'), fileName.press('Enter')]);
	expect(download.suggestedFilename()).toBe('my-map.mapjson');
	// otherwise closing the page has to cancel the unfinished download, which is slow in Firefox
	await download.path();
	await expect(dialog).toBeHidden();
});

test('a new or opened map is a new map, and the one before is kept in the recent maps', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		meta: {
			title: 'Markers',
			legend: { entries: [{ type: 'polygon' as const, style: { color: '#ff0000' }, label: 'A' }] }
		},
		elements: [{ type: 'marker', point: [13.4, 52.5] }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const types = async () => (await storedState(page)).elements.map((e) => e.type);
	const title = page.getByRole('textbox', { name: 'Title' });
	await expect.poll(types).toStrictEqual(['marker']);

	// opening a file asks nothing, and names the map after the file
	const open = await menuItem(page, 'Open…');
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
	await chooser.setFiles({
		name: 'lines.mapjson',
		mimeType: 'application/json',
		buffer: Buffer.from(
			JSON.stringify({
				elements: [
					{
						type: 'line',
						points: [
							[13.3, 52.4],
							[13.5, 52.6]
						]
					}
				]
			})
		)
	});
	await expect.poll(types).toStrictEqual(['line']);
	await expect(title).toHaveValue('lines');
	// a new start of the history
	await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

	// a new map asks nothing either, and is empty, without legend
	await (await menuItem(page, 'New map')).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await expect(title).toHaveValue('');
	await drawElement(page, 'Circle');
	await expect.poll(types).toStrictEqual(['circle']);
	expect((await storedState(page)).meta).toBeUndefined();

	// the maps before are in the recent maps, the most recently changed first, with the time of the change
	await (await menuItem(page, 'Recent maps', 'Markers')).isVisible();
	// the maps, without the buttons that delete them (an icon, or "Delete" to confirm)
	const recent = page
		.getByRole('menu', { name: 'Recent maps' })
		.getByRole('menuitem')
		.filter({ hasNotText: /^(Delete)?$/ });
	await expect(recent).toHaveText([/^1 circle\s*This map$/, /^lines\s*\S/, /^Markers\s*\S/]);
	await recent.filter({ hasText: 'Markers' }).click();
	await expect.poll(types).toStrictEqual(['marker']);
	await expect(title).toHaveValue('Markers');
	await expect(page.getByRole('list', { name: 'Legend' })).toBeVisible();

	// a map can be deleted, with a second click
	await (await menuItem(page, 'Recent maps', 'lines')).isVisible();
	const deleteLines = page.getByRole('menuitem', { name: 'Delete lines' });
	await deleteLines.click();
	await page.getByRole('menuitem', { name: 'Really delete lines' }).click();
	await expect(recent.filter({ hasText: 'lines' })).toHaveCount(0);
	await expect(recent).toHaveCount(2);
});

test('the status line tells whether the map is saved, and downloads it', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const status = page.locator('.statusbar');
	await expect(status).toContainText('Saved in this browser');
	await drawElement(page, 'Marker');
	await status.getByRole('button', { name: 'Download' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('textbox', { name: 'File name' })).toHaveValue('map.mapjson');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		dialog.getByRole('button', { name: 'Download' }).click()
	]);
	expect(JSON.parse(readFileSync(await download.path(), 'utf-8')).elements).toHaveLength(1);
});

test('exporting and importing KML', { tag: '@cross-browser' }, async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		meta: {
			background: { builder: 'osm', options: { theme: 'gray' } },
			legend: { entries: [{ type: 'polygon' as const, style: { color: '#00ff00' }, label: 'Park' }] }
		},
		elements: [
			{ type: 'marker', point: [13.41, 52.51], style: { color: '#0000ff', label: 'Café' }, popup: { text: 'Open' } },
			{
				type: 'polygon',
				points: [
					[13.3, 52.4],
					[13.4, 52.4],
					[13.4, 52.5]
				],
				style: { color: '#00ff00', pattern: 1 }
			},
			{ type: 'circle', point: [13.45, 52.55], radius: 800 }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const exportKML = await menuItem(page, 'Export', 'KML (Google Earth)');
	const [download] = await Promise.all([page.waitForEvent('download'), exportKML.click()]);
	expect(download.suggestedFilename()).toBe('map.kml');
	const kml = readFileSync(await download.path(), 'utf-8');
	expect(kml).toContain('<Placemark><name>Café</name><description>Open</description>');

	// importing it into an empty map restores the map (the editor itself would continue the last map)
	await page.goto('/#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	await expect.poll(async () => (await storedState(page)).elements).toStrictEqual([]);
	const importKML = await menuItem(page, 'Import', 'KML (Google Earth)…');
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importKML.click()]);
	await chooser.setFiles({
		name: 'map.kml',
		mimeType: 'application/vnd.google-earth.kml+xml',
		buffer: Buffer.from(kml)
	});

	const lower = (value: unknown) => JSON.parse(JSON.stringify(value).toLowerCase());
	await expect.poll(async () => lower((await storedState(page)).elements)).toStrictEqual(lower(state.elements));
	await expect.poll(async () => lower((await storedState(page)).meta)).toStrictEqual(lower(state.meta));
});

test.describe('importing a table', () => {
	async function openImport(page: Page) {
		await page.goto('/');
		await waitForMapIsReady(page);
		await (await menuItem(page, 'Import', 'Table (CSV/TSV)…')).click();
		return page.getByRole('dialog');
	}
	const markers = async (page: Page) => (await storedState(page)).elements as StateElementMarker[];

	test('pasted from a spreadsheet, with coordinates', { tag: '@cross-browser' }, async ({ page }) => {
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
			// the 4th line of the spreadsheet, with the header in line 1
			'Row 4: x, 13 — invalid coordinates'
		);
		await dialog.getByRole('button', { name: /^Done/ }).click();

		await expect
			.poll(async () => (await markers(page)).map((m) => [m.point, m.style?.label, m.popup?.text]))
			.toStrictEqual([
				[[13.4, 52.5], 'Café', 'Open **daily**'],
				[[13.41, 52.51], 'Shop', undefined]
			]);
		// the imported markers are selected, and one undo step removes them
		await expect(page.locator('.sidebar').getByRole('heading', { name: '2 elements' })).toBeVisible();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await markers(page)).length).toBe(0);
	});

	test('from a file, with addresses', { tag: '@cross-browser' }, async ({ page }) => {
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

		await expect(dialog.getByText('Imported 1 marker.')).toBeVisible();
		await expect(dialog.getByRole('list', { name: 'Rows not imported' })).toHaveText(
			'Row 3: Nirgendwo 5 — address not found'
		);
		await expect
			.poll(async () => (await markers(page)).map((m) => [m.point, m.style?.label]))
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

		const colors = async () =>
			((await storedState(page)).elements as StateElementMarker[]).map((m) => m.style?.color?.toLowerCase());
		await expect.poll(colors).toStrictEqual(['#4477aa', '#000000', '#4477aa', '#228833']);
		await expect
			.poll(async () =>
				(await storedState(page)).meta?.legend?.entries.map((e) => [e.label, e.style?.color?.toLowerCase()])
			)
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

test('Escape cancels a running table import', async ({ page }) => {
	// the geocoder answers only when the test releases it
	let release!: () => void;
	const released = new Promise<void>((resolve) => (release = resolve));
	await page.route('https://geocode.versatiles.org/**', async (route) => {
		await released;
		const q = new URL(route.request().url()).searchParams.get('q');
		await route.fulfill({
			json: {
				type: 'FeatureCollection',
				features: [{ type: 'Feature', properties: { name: q }, geometry: { type: 'Point', coordinates: [13.4, 52.5] } }]
			}
		});
	});
	await page.goto('/');
	await waitForMapIsReady(page);
	await (await menuItem(page, 'Import', 'Table (CSV/TSV)…')).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Or paste the table here:').fill('Address\nMain St 1\nMain St 2\nMain St 3');
	await dialog.getByRole('button', { name: /^Continue/ }).click();
	await dialog.getByRole('button', { name: /^Import 3 rows/ }).click();
	await expect(dialog.getByText('Searching the addresses')).toBeVisible();

	// Escape closes the dialog, which cancels the import
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	release();
	// Something must *not* happen here (markers added later), so the test gives it time
	await page.waitForTimeout(1000);
	expect((await storedState(page)).elements).toStrictEqual([]);
});

test('a file that cannot be imported shows a message instead of a browser dialog', async ({ page }) => {
	page.on('dialog', () => {
		throw new Error('No browser dialog expected');
	});
	await page.goto('/');
	await waitForMapIsReady(page, { expectedMessages: [/JSON/, /^SyntaxError/] });
	const importGeoJSON = await menuItem(page, 'Import', 'GeoJSON…');
	const [chooser] = await Promise.all([page.waitForEvent('filechooser'), importGeoJSON.click()]);
	await chooser.setFiles({ name: 'broken.geojson', mimeType: 'application/geo+json', buffer: Buffer.from('{ broken') });
	await expect(page.getByRole('alert')).toHaveText(/Failed to import GeoJSON. Please check the file format./);
});
