import { expect, test } from './lib/test.js';
import { waitForMapIsReady } from './lib/utils.js';

test('dialogs are named, can be closed and are usable by keyboard', async ({ page }) => {
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

	// the download dialog: the file name can be typed at once
	await page.getByRole('button', { name: /^Download/ }).click();
	const download = page.getByRole('dialog', { name: 'Download File' });
	await expect(download.getByRole('textbox', { name: 'File name:' })).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(download).toBeHidden();

	// the symbol picker
	await page.getByRole('button', { name: /^Marker/ }).click();
	await page.getByRole('button', { name: /^Symbol/ }).click();
	await expect(page.getByRole('dialog', { name: 'Select a symbol' })).toBeVisible();
});

test('screen readers hear the state of the search and of copying', async ({ page, browserName, context }) => {
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
	await waitForMapIsReady(page, { expectedMessages: [/status of 500/, /Geocoding failed/, /^Error$/, /JSHandle/] });
	const search = page.getByRole('combobox', { name: 'Search address or place' });
	const status = page.locator('.search [role=status]');

	await search.fill('Ber');
	await expect(status).toHaveText('2 results');
	answer = 'none';
	await search.fill('Bxx');
	await expect(status).toHaveText('No results');
	answer = 'error';
	await search.fill('Byy');
	await expect(status).toHaveText('Search failed, please try again.');

	// copying the link is announced, not only shown as a check mark
	if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.getByRole('button', { name: /^Share/ }).click();
	await page.getByRole('button', { name: /^Copy Link/ }).click();
	await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Link copied');
});
