import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState } from '../packages/map-state/src/index.js';
import { drawElement, waitForMapIsReady } from './lib/utils.js';

const SUBFOLDER = '/tools/map-editor';

/**
 * Serve the editor in a subfolder, as on another web server: the files of the build answer under
 * `SUBFOLDER`, and every other request to this server fails. Returns the paths that were asked
 * for, outside of the subfolder and in it.
 */
async function serveInSubfolder(page: Page): Promise<{ outside: string[]; inside: string[] }> {
	const requests = { outside: [] as string[], inside: [] as string[] };
	await page.route(/^http:\/\/localhost:4173\//, async (route) => {
		const url = new URL(route.request().url());
		if (!url.pathname.startsWith(SUBFOLDER + '/')) {
			requests.outside.push(url.pathname);
			return route.fulfill({ status: 404, body: 'outside of the subfolder' });
		}
		requests.inside.push(url.pathname);
		url.pathname = url.pathname.slice(SUBFOLDER.length);
		return route.fulfill({ response: await route.fetch({ url: url.href }) });
	});
	return requests;
}

test('the editor and the viewer work in a subfolder of a web server', async ({ page }) => {
	const requests = await serveInSubfolder(page);

	await page.goto(SUBFOLDER + '/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Marker');
	// the configuration of the instance, in the root folder of the editor
	expect(requests.inside).toContain(SUBFOLDER + '/map-editor.config.jsonc');

	// the link of the shared map opens the viewer in the subfolder
	await page.getByRole('button', { name: /^Share/ }).click();
	const link = new URL(await page.getByLabel('Link', { exact: true }).inputValue());
	expect(link.pathname).toBe(SUBFOLDER + '/view/');

	await page.goto(link.pathname + link.hash);
	await waitForMapIsReady(page);
	await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0);
	// the viewer (here, and in the preview of the share dialog) reads the configuration of the
	// editor's folder too, not one in view/
	const configs = requests.inside.filter((path) => path.endsWith('.jsonc'));
	expect(configs.length).toBeGreaterThan(1);
	expect(new Set(configs)).toStrictEqual(new Set([SUBFOLDER + '/map-editor.config.jsonc']));
	expect(requests.outside).toStrictEqual([]);
});

test('a shared link opens the viewer in a subfolder directly', async ({ page }) => {
	const requests = await serveInSubfolder(page);
	const state = encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, elements: [] });
	await page.goto(SUBFOLDER + '/view/#' + state);
	await waitForMapIsReady(page);
	expect(requests.outside).toStrictEqual([]);
});
