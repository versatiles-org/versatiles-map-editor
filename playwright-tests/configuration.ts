import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { decodeState, encodeState } from '../packages/map-state/src/index.js';
import { drawElement, settledStoredState, waitForMapIsIdle, waitForMapIsReady, type MapWindow } from './lib/utils.js';

const OWN_SERVER = 'https://tiles.example.test';

/**
 * A configuration with an own tile server, which answers like tiles.versatiles.org (from the
 * request cache of the tests). Returns the URLs that the page asks for at both servers.
 */
async function useOwnTileServer(page: Page): Promise<{ own: string[]; versatiles: string[] }> {
	await page.route('**/map-editor.config.jsonc', (route) =>
		route.fulfill({ body: `{ "tileServer": "${OWN_SERVER}/" } // with a slash, which is ignored` })
	);
	await page.route(OWN_SERVER + '/**', (route) =>
		route.fallback({ url: route.request().url().replace(OWN_SERVER, 'https://tiles.versatiles.org') })
	);
	const requests = { own: [] as string[], versatiles: [] as string[] };
	page.on('request', (request) => {
		const url = request.url();
		// by the server, not by the start of the address, which another host could have too
		const { origin } = new URL(url);
		if (origin === OWN_SERVER) requests.own.push(url);
		if (origin === 'https://tiles.versatiles.org') requests.versatiles.push(url);
	});
	return requests;
}

for (const [page, path] of [
	['editor', '/'],
	['viewer', '/view/#' + encodeState({ elements: [] })]
] as const) {
	test(`the ${page} loads the map, its symbols and fonts from the configured tile server`, async ({ page: tab }) => {
		const requests = await useOwnTileServer(tab);
		await tab.goto(path);
		await waitForMapIsReady(tab);
		const paths = requests.own.map((url) => new URL(url).pathname);
		expect(paths.some((p) => p.startsWith('/tiles/'))).toBe(true);
		expect(paths.some((p) => p.startsWith('/assets/sprites/'))).toBe(true);
		// the fonts of the labels, which the map loads when it shows labels
		const glyphs = await tab.evaluate(() => (window as unknown as MapWindow).map.getStyle().glyphs);
		expect(glyphs).toMatch(new RegExp('^' + OWN_SERVER + '/assets/glyphs/'));
		expect(requests.versatiles).toStrictEqual([]);
	});
}

test('a new map starts in the configured view, with the starting background and color scheme', async ({ page }) => {
	await page.route('**/map-editor.config.jsonc', (route) =>
		route.fulfill({
			body: `{
				"startView": [9.73, 53.39, 10.33, 53.74], // Hamburg
				"startBackground": { "theme": "gray" },
				"defaultLanguage": "de",
				"defaultColorScheme": "dark2"
			}`
		})
	);
	await page.goto('/');
	await waitForMapIsReady(page);

	const center = await page.evaluate(() => (window as unknown as MapWindow).map.getCenter().toArray());
	expect(center[0]).toBeCloseTo(10.03, 1);
	expect(center[1]).toBeCloseTo(53.57, 1);

	// the background of the map, stored with it, e.g. for a shared link
	await drawElement(page, 'Marker');
	const background = { theme: 'gray', language: 'de' };
	expect((await settledStoredState(page)).meta?.background).toStrictEqual(background);

	await page.getByLabel('Color').first().click();
	await expect(page.getByRole('combobox', { name: 'Color scheme' })).toHaveValue('dark2');
});

test('the share dialog makes links of the configured form, and keeps the hash in the embed code', async ({ page }) => {
	await page.route('**/map-editor.config.jsonc', (route) =>
		route.fulfill({ body: '{ "shareLink": "view/?map={map}&from=share" }' })
	);
	await page.goto('/#' + encodeState({ elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Shared' }] }));
	await waitForMapIsReady(page, { count: 1 });
	await page.getByRole('button', { name: /^Share/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Share or embed the map' });

	// the map in the query, which reaches the server; the rest of the address as configured
	const link = new URL(await dialog.getByLabel('Link', { exact: true }).inputValue());
	expect(link.pathname).toBe('/view/');
	expect(link.hash).toBe('');
	expect(link.searchParams.get('from')).toBe('share');
	const map = link.searchParams.get('map')!;
	expect(decodeState(map).elements).toMatchObject([{ label: 'Shared' }]);
	// embedded in the hash of the editor's own viewer, which works at any length
	const embed = await dialog.getByLabel('Embed code', { exact: true }).inputValue();
	expect(embed).toContain(`src="${link.origin}/view/#${map}"`);
	// the bar of what the link holds measures the map, wherever it is in the link
	await expect(dialog.getByRole('img', { name: /^The link holds:/ })).toHaveAttribute('aria-label', /Labels \d+ %/);

	// the link opens the map
	await page.goto(link.href);
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);
	const labels = await page.evaluate(() =>
		(window as unknown as MapWindow).map
			.queryRenderedFeatures({ layers: ['elements_symbol'] })
			.map((f) => f.properties.label)
	);
	expect(labels).toStrictEqual(['Shared']);
});
