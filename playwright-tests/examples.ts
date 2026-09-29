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
	'chernobyl-exclusion-zone'
];

for (const name of EXAMPLES) {
	const file = `examples/${name}.mapjson`;
	const state: MapState = JSON.parse(readFileSync(file, 'utf-8'));
	const types = state.elements.map((e) => e.type);
	const legend = state.meta!.legend!.entries.map((e) => e.label);

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
			await expect(overlay.getByRole('listitem')).toHaveText(legend);
			await waitForMapIsIdle(page);
			// the background of the example, e.g. the satellite imagery
			const sources = await page.evaluate(() =>
				Object.keys((window as unknown as MapWindow).map.getStyle()?.sources ?? {})
			);
			expect(sources).toContain(
				state.meta?.background?.builder === 'satellite' ? 'satellite' : 'versatiles-shortbread'
			);
			// nothing of the editor covers the legend
			expect(await coveredPoints(overlay)).toStrictEqual([]);
			expect(pageErrors).toStrictEqual([]);

			// the file is what the editor writes, except for the view, which depends on the window
			await (await menuItem(page, 'Download…')).click();
			const [download] = await Promise.all([
				page.waitForEvent('download'),
				page.getByRole('dialog').getByRole('button', { name: 'Download' }).click()
			]);
			const downloaded: MapState = JSON.parse(readFileSync(await download.path(), 'utf-8'));
			expect({ ...downloaded, map: state.map }).toStrictEqual(state);
		});

		test('shared as a link, in the viewer', async ({ page }) => {
			await page.setViewportSize({ width: 500, height: 500 });
			await page.goto('/#' + encodeState(state));
			await waitForMapIsReady(page);
			await expect(page.getByRole('list', { name: 'Legend' }).getByRole('listitem')).toHaveText(legend);
			await expect(page.getByRole('toolbar', { name: 'Tools' })).toHaveCount(0);
		});
	});
}
