import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState } from '../packages/map-state/src/index.js';
import { waitForMapIsReady, type MapWindow } from './lib/utils.js';

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
		if (url.startsWith(OWN_SERVER)) requests.own.push(url);
		if (url.startsWith('https://tiles.versatiles.org')) requests.versatiles.push(url);
	});
	return requests;
}

for (const [page, path] of [
	['editor', '/'],
	['viewer', '/view#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, elements: [] })]
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
