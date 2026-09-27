import { readFileSync } from 'fs';
import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type MapState, type StateElementMarker } from '../packages/map-state/src/index.js';
import { stateInUrl, waitForMapIsReady } from './lib/utils.js';

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
	expect(mapFile.suggestedFilename()).toBe('map.mapjson');
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
	const fileName = dialog.getByRole('textbox', { name: 'File name' });
	await fileName.fill('my-map.mapjson');
	const [download] = await Promise.all([page.waitForEvent('download'), fileName.press('Enter')]);
	expect(download.suggestedFilename()).toBe('my-map.mapjson');
	// otherwise closing the page has to cancel the unfinished download, which is slow in Firefox
	await download.path();
	await expect(dialog).toBeHidden();

	// "New" → "Create new map" clears the map
	await page.getByRole('button', { name: /^New/ }).click();
	await expect(dialog).toContainText('It replaces the current map.');
	await dialog.getByRole('button', { name: /^Create new map/ }).click();
	await expect(dialog).toBeHidden();
	await expect(deleteButton).toBeHidden();
});

test('opening a map file and a new map can be undone and are kept in the URL', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		meta: { legend: { entries: [{ color: '#ff0000', label: 'A' }] } },
		elements: [{ type: 'marker', point: [13.4, 52.5] }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const types = () => stateInUrl(page).elements.map((e) => e.type);
	const dialog = page.getByRole('dialog');
	const file: MapState = {
		elements: [
			{
				type: 'line',
				points: [
					[13.3, 52.4],
					[13.5, 52.6]
				]
			}
		]
	};
	const openFile = async () => {
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			page.getByRole('button', { name: /^Open/ }).click()
		]);
		await chooser.setFiles({
			name: 'map.mapjson',
			mimeType: 'application/json',
			buffer: Buffer.from(JSON.stringify(file))
		});
	};

	// opening asks before replacing the map
	await openFile();
	await expect(dialog).toContainText('Open this map? It replaces the current map.');
	await dialog.getByRole('button', { name: /^Cancel/ }).click();
	await expect.poll(types).toStrictEqual(['marker']);

	await openFile();
	await dialog.getByRole('button', { name: /^Replace map/ }).click();
	await expect.poll(types).toStrictEqual(['line']);
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect.poll(types).toStrictEqual(['marker']);
	await page.getByRole('button', { name: /^Redo/ }).click();
	await expect.poll(types).toStrictEqual(['line']);
	// kept in the URL
	await page.reload();
	await waitForMapIsReady(page);
	await expect.poll(types).toStrictEqual(['line']);

	// a new map is empty, without legend, and undoable. Only the hash changes, so the editor
	// loads the map without reloading the page.
	await page.goto('/#' + encodeState(state));
	await expect.poll(types).toStrictEqual(['marker']);
	await page.getByRole('button', { name: /^New/ }).click();
	await dialog.getByRole('button', { name: /^Create new map/ }).click();
	await expect.poll(() => stateInUrl(page)).toMatchObject({ elements: [] });
	expect(stateInUrl(page).meta).toBeUndefined();
	await page.getByRole('button', { name: /^Undo/ }).click();
	await expect.poll(types).toStrictEqual(['marker']);
	await expect.poll(() => stateInUrl(page).meta?.legend?.entries.length).toBe(1);
});

test('exporting and importing KML', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		meta: {
			background: { builder: 'osm', options: { theme: 'gray' } },
			legend: { entries: [{ color: '#00ff00', label: 'Park' }] }
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
	await page.getByRole('button', { name: 'Import/Export' }).click();
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('btnExportKML').click()]);
	expect(download.suggestedFilename()).toBe('map.kml');
	const kml = readFileSync(await download.path(), 'utf-8');
	expect(kml).toContain('<Placemark><name>Café</name><description>Open</description>');

	// importing it into an empty map restores the map
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Import/Export' }).click();
	const group = page.getByRole('group', { name: 'KML (Google Earth)' });
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		group.getByRole('button', { name: /^Import/ }).click()
	]);
	await chooser.setFiles({
		name: 'map.kml',
		mimeType: 'application/vnd.google-earth.kml+xml',
		buffer: Buffer.from(kml)
	});

	const lower = (value: unknown) => JSON.parse(JSON.stringify(value).toLowerCase());
	await expect.poll(() => lower(stateInUrl(page).elements)).toStrictEqual(lower(state.elements));
	await expect.poll(() => lower(stateInUrl(page).meta)).toStrictEqual(lower(state.meta));
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
			// the 4th line of the spreadsheet, with the header in line 1
			'Row 4: x, 13 — invalid coordinates'
		);
		await dialog.getByRole('button', { name: /^Done/ }).click();

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

		await expect(dialog.getByText('Imported 1 marker.')).toBeVisible();
		await expect(dialog.getByRole('list', { name: 'Rows not imported' })).toHaveText(
			'Row 3: Nirgendwo 5 — address not found'
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
	await page.getByRole('button', { name: 'Import/Export' }).click();
	await page.getByRole('button', { name: 'Import table…' }).click();
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
	expect(stateInUrl(page).elements).toStrictEqual([]);
});

test('a file that cannot be imported shows a message instead of a browser dialog', async ({ page }) => {
	page.on('dialog', () => {
		throw new Error('No browser dialog expected');
	});
	await page.goto('/');
	await waitForMapIsReady(page, { expectedMessages: [/JSON/, /^SyntaxError/] });
	await page.getByRole('button', { name: 'Import/Export' }).click();
	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		page
			.getByRole('group', { name: 'GeoJSON' })
			.getByRole('button', { name: /^Import/ })
			.click()
	]);
	await chooser.setFiles({ name: 'broken.geojson', mimeType: 'application/geo+json', buffer: Buffer.from('{ broken') });
	await expect(page.getByRole('alert')).toHaveText(/Failed to import GeoJSON. Please check the file format./);
});
