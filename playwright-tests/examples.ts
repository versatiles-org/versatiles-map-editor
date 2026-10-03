import { readFileSync } from 'fs';
import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	coveredPoints,
	menuItem,
	storedState,
	waitForMapIsIdle,
	waitForMapIsReady,
	type MapWindow
} from './lib/utils.js';

// The example maps in /examples, opened like a user would, in the editor and in the viewer
const EXAMPLES = [
	'paris-2024-venues',
	'hamburg-berlin-railway',
	'berlin-low-emission-zone',
	'chernobyl-exclusion-zone',
	'london-pharmacies',
	'warsaw-christmas-markets-2025',
	'napoleon-russia-1812'
];

for (const name of EXAMPLES) {
	const file = `examples/${name}.mapjson`;
	const state: MapState = JSON.parse(readFileSync(file, 'utf-8'));
	const types = state.elements.map((e) => e.type);
	// none, e.g. where a label on the map explains it
	const legend = state.meta?.legend?.entries.map((e) => e.label) ?? [];

	test.describe(name, () => {
		test('opened in the editor, and downloaded again', async ({ page }) => {
			const pageErrors: string[] = [];
			page.on('pageerror', (error) => pageErrors.push(error.message));
			await page.goto('/');
			await waitForMapIsReady(page);
			const open = await menuItem(page, 'Open…');
			const [chooser] = await Promise.all([page.waitForEvent('filechooser'), open.click()]);
			await chooser.setFiles(file);

			await expect.poll(async () => (await storedState(page)).elements.map((e) => e.type)).toStrictEqual(types);
			await expect.poll(async () => (await storedState(page)).meta?.background).toStrictEqual(state.meta?.background);
			const overlay = page.getByRole('list', { name: 'Legend' });
			if (legend.length > 0) await expect(overlay.getByRole('listitem')).toHaveText(legend);
			else await expect(overlay).toHaveCount(0);
			await waitForMapIsIdle(page);
			// the background of the example, e.g. the satellite imagery
			const sources = await page.evaluate(() =>
				Object.keys((window as unknown as MapWindow).map.getStyle()?.sources ?? {})
			);
			expect(sources).toContain(
				state.meta?.background?.builder === 'satellite' ? 'satellite' : 'versatiles-shortbread'
			);
			// nothing of the editor covers the legend
			if (legend.length > 0) expect(await coveredPoints(overlay)).toStrictEqual([]);
			expect(pageErrors).toStrictEqual([]);

			// the file is what the editor writes, except for the view, which depends on the window
			await (await menuItem(page, 'Download…')).click();
			const [download] = await Promise.all([
				page.waitForEvent('download'),
				page.getByRole('dialog').getByRole('button', { name: 'Download' }).click()
			]);
			const downloaded: MapState = JSON.parse(readFileSync(await download.path(), 'utf-8'));
			// with its title, and its visible area
			expect({ ...downloaded, map: state.map }).toStrictEqual(state);
		});

		test('shared as a link, in the viewer', async ({ page }) => {
			await page.setViewportSize({ width: 500, height: 500 });
			await page.goto('/#' + encodeState(state));
			await waitForMapIsReady(page);
			// the legend, unless the map hides it in the viewer
			const items = page.getByRole('list', { name: 'Legend' }).getByRole('listitem');
			if (state.meta?.viewer?.legend === 'none') await expect(items).toHaveCount(0);
			else await expect(items).toHaveText(legend);
			await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0);
		});
	});
}

// the examples in the menu, as links without their view, so they show all of it
test('the examples open from the menu', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const menu = page.getByRole('menu', { name: 'Menu' });
	await (await menuItem(page, 'Open example', 'Paris 2024 Olympic venues')).click();
	const state: MapState = JSON.parse(readFileSync('examples/paris-2024-venues.mapjson', 'utf-8'));
	await expect.poll(async () => (await storedState(page)).elements).toStrictEqual(state.elements);
	expect((await storedState(page)).meta).toStrictEqual(state.meta);
	await expect(menu).toBeHidden();
	// the visible area of the example, whatever the window
	const [west, south, east, north] = state.frame!;
	const bounds = await page.evaluate(() => (window as unknown as MapWindow).map.getBounds().toArray().flat());
	expect(bounds[0]).toBeLessThanOrEqual(west);
	expect(bounds[1]).toBeLessThanOrEqual(south);
	expect(bounds[2]).toBeGreaterThanOrEqual(east);
	expect(bounds[3]).toBeGreaterThanOrEqual(north);

	// all examples, by their titles
	await page.getByRole('button', { name: 'Menu' }).click();
	await menu.getByRole('menuitem', { name: 'Open example', exact: true }).click();
	const titles = EXAMPLES.map(
		(name) => (JSON.parse(readFileSync(`examples/${name}.mapjson`, 'utf-8')) as MapState).meta!.title!
	).sort((a, b) => a.localeCompare(b, 'en'));
	await expect(menu.getByRole('menu', { name: 'Examples' }).getByRole('menuitem')).toHaveText(titles);
});

// the largest example: 557 markers with 536 labels, more than the 100 that are drawn in order
test('the map with many markers opens within a few seconds, in the editor and in the viewer', async ({ page }) => {
	const state: MapState = JSON.parse(readFileSync('examples/london-pharmacies.mapjson', 'utf-8'));
	for (const path of ['/', '/view']) {
		const start = Date.now();
		await page.goto(path + '#' + encodeState(state));
		await waitForMapIsReady(page);
		await waitForMapIsIdle(page);
		expect(Date.now() - start, path).toBeLessThan(10000);
	}
});
