import { expect, test } from './lib/test.js';
import { encodeState } from '../packages/map-state/src/index.js';
import { drawElement, menuItem, storedState, waitForMapIsReady } from './lib/utils.js';

test('dialogs are named, can be closed and are usable by keyboard', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	// the share dialog: a name, a labelled close button, and aspect ratios reachable by keyboard
	await page.getByRole('button', { name: /^Share/ }).click();
	const share = page.getByRole('dialog', { name: 'Share or embed the map' });
	await expect(share).toBeVisible();
	const square = share.getByRole('radio', { name: 'square' });
	await square.focus();
	await page.keyboard.press('Space');
	await expect(square).toBeChecked();
	await share.getByRole('button', { name: 'Close' }).click();
	await expect(share).toBeHidden();

	// Escape closes it, also after the preview has loaded, which must not take the focus
	await page.getByRole('button', { name: /^Share/ }).click();
	await expect(share.getByRole('button', { name: /^Copy link/ })).toBeFocused();
	await page.waitForTimeout(1000);
	await page.keyboard.press('Escape');
	await expect(share).toBeHidden();

	// the download dialog: the file name can be typed at once
	await (await menuItem(page, 'Download…')).click();
	const download = page.getByRole('dialog', { name: 'Download File' });
	await expect(download.getByRole('textbox', { name: 'File name' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(download).toBeHidden();

	// the symbol picker
	await drawElement(page, 'Marker');
	await page.getByRole('button', { name: /^Symbol/ }).click();
	await expect(page.getByRole('dialog', { name: 'Select a symbol' })).toBeVisible();
});

test(
	'screen readers hear the state of the search and of copying',
	{ tag: '@cross-browser' },
	async ({ page, browserName, context }) => {
		let answer: 'two' | 'none' | 'error' = 'two';
		await page.route('https://geocode.versatiles.org/**', (route) => {
			if (answer === 'error') return route.fulfill({ status: 500 });
			const feature = (name: string) => ({
				type: 'Feature',
				properties: { name },
				geometry: { type: 'Point', coordinates: [13.4, 52.5] }
			});
			const features = answer === 'two' ? [feature('Berlin'), feature('Bern')] : [];
			return route.fulfill({ json: { type: 'FeatureCollection', features } });
		});
		await page.goto('/');
		await waitForMapIsReady(page, { expectedMessages: [/status of 500/, /Geocoding failed/, /^Error$/] });
		const search = page.getByRole('combobox', { name: 'Search address or place' });
		const status = page.locator('.search [role=status]');

		await search.fill('Ber');
		await expect(status).toHaveText('2 results');
		answer = 'none';
		await search.fill('Bxx');
		await expect(status).toHaveText('No results');
		answer = 'error';
		await search.fill('Byy');
		await expect(status).toHaveText('Search failed. Please try again.');

		// copying the link is announced, not only shown as a check mark
		if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.getByRole('button', { name: /^Share/ }).click();
		const copy = page.getByRole('button', { name: /^Copy link/ });
		await copy.click();
		await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Link copied');
		// and the check mark is shown
		await expect.poll(() => copy.evaluate((button) => getComputedStyle(button, '::after').opacity)).toBe('1');
	}
);

test('elements can be chosen and deleted with the keyboard in the list of elements', async ({ page }) => {
	const state = encodeState({
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{ type: 'marker', point: [13.4, 52.5], style: { label: 'Berlin' } },
			{
				type: 'line',
				points: [
					[13.35, 52.5],
					[13.45, 52.5]
				]
			},
			{
				type: 'polygon',
				points: [
					[13.35, 52.48],
					[13.45, 52.48],
					[13.4, 52.52]
				],
				popup: { text: 'Park\nwith trees' }
			}
		]
	});
	await page.goto('/#' + state);
	await waitForMapIsReady(page);

	await page.getByRole('button', { name: 'Elements' }).click();
	const list = page.getByRole('listbox', { name: 'Elements' });
	const options = list.getByRole('option');
	// the element in front first
	await expect(options).toHaveText(['Polygon 1: Park', 'Line 1', 'Marker 1: Berlin']);

	// the selection follows the focus, and Shift adds to it
	await list.focus();
	await page.keyboard.press('ArrowDown');
	await expect(list.getByRole('option', { selected: true })).toHaveText(['Line 1']);
	await page.keyboard.press('Shift+ArrowDown');
	await expect(list.getByRole('option', { selected: true })).toHaveText(['Line 1', 'Marker 1: Berlin']);
	await expect(page.locator('.sidebar').getByRole('heading', { name: '2 elements' })).toBeVisible();

	// Delete removes the selected elements
	await page.keyboard.press('Delete');
	await expect(options).toHaveText(['Polygon 1: Park']);
	await expect.poll(async () => (await storedState(page)).elements.map((e) => e.type)).toStrictEqual(['polygon']);

	// Enter selects the element, like a click on the map
	await page.keyboard.press('Home');
	await page.keyboard.press('Enter');
	await expect(list.getByRole('option', { selected: true })).toHaveText(['Polygon 1: Park']);
	await expect(page.locator('.sidebar').getByRole('heading', { level: 2 })).toHaveText('Polygon 1');
});

test.describe('dark mode and reduced motion', { tag: '@cross-browser' }, () => {
	test.use({ colorScheme: 'dark', reducedMotion: 'reduce' });

	test('the editor follows the dark mode and does without transitions', async ({ page }) => {
		await page.goto('/');
		await waitForMapIsReady(page);
		const style = (selector: string, property: string) =>
			page
				.locator(selector)
				.first()
				.evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);

		expect(await style('.page', 'color-scheme')).toBe('dark');
		// pure white text
		expect(await style('.sidebar', 'color')).toBe('rgb(255, 255, 255)');
		// white on the accent, also in dark mode
		expect(await style('button.btn:not([disabled])', 'color')).toBe('rgb(255, 255, 255)');
		expect(await style('button.btn', 'transition-duration')).toBe('0s');
	});

	test('the viewer keeps the colors of the map', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 700 });
		await page.goto('/');
		await waitForMapIsReady(page);
		expect(await page.locator('.page').evaluate((el) => getComputedStyle(el).colorScheme)).toBe('normal');
	});
});

test('the drawer of elements opens with E, and chooses the map, the legend or elements', async ({ page }) => {
	const state = encodeState({
		map: { center: [13.4, 52.5], radius: 10000 },
		meta: { legend: { entries: [{ color: '#ff0000', label: 'A' }] } },
		elements: [{ type: 'marker', point: [13.4, 52.5] }]
	});
	await page.goto('/#' + state);
	await waitForMapIsReady(page);
	const drawer = page.getByRole('complementary', { name: /^Elements/ });
	const toggle = page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: 'Elements' });
	const title = page.locator('.sidebar').getByRole('heading', { level: 2 });

	await expect(drawer).toBeHidden();
	await page.keyboard.press('e');
	await expect(drawer).toBeVisible();
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(drawer.getByRole('button', { name: 'Map settings' })).toHaveAttribute('aria-pressed', 'true');

	await drawer.getByRole('button', { name: 'Legend' }).click();
	await expect(title).toHaveText('Legend');
	await drawer.getByRole('option', { name: 'Marker 1' }).click();
	await expect(title).toHaveText('Marker 1');
	await drawer.getByRole('button', { name: 'Map settings' }).click();
	await expect(title).toHaveText('Map');

	await drawer.getByRole('button', { name: 'Close the elements' }).click();
	await expect(drawer).toBeHidden();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('the status line explains the tool and the selection, and ? lists all shortcuts', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const status = page.locator('.statusbar');

	await expect(status).toContainText('Click an element to select it');
	await expect(status).toContainText('Zoom');
	await page.keyboard.press('l');
	await expect(status).toContainText('Double-click or Enter finishes');
	await page.keyboard.press('Escape');
	await expect(status).toContainText('Click an element to select it');

	// the dialog of the shortcuts, with the key or from the menu
	const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
	await page.keyboard.press('?');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('table', { name: 'Tools' }).getByRole('row')).toHaveCount(6);
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await (await menuItem(page, 'Keyboard shortcuts')).click();
	await expect(dialog).toBeVisible();
});

test('names show the popup text without its formatting', async ({ page }) => {
	const state = encodeState({
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'polygon',
				points: [
					[13.35, 52.48],
					[13.45, 52.48],
					[13.4, 52.52]
				],
				popup: { text: '**Low-emission zone**\nSee [the rules](https://example.org)' }
			}
		]
	});
	await page.goto('/#' + state);
	await waitForMapIsReady(page);
	await page.keyboard.press('e');
	const option = page.getByRole('listbox', { name: 'Elements' }).getByRole('option');
	await expect(option).toHaveText('Polygon 1: Low-emission zone');
	await option.click();
	await expect(page.locator('.sidebar .subtitle')).toHaveText('Low-emission zone');
});
