import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type MapState, type StateStyle } from '../packages/map-state/src/index.js';
import { project, storedState, waitForMapIsReady, type MapWindow } from './lib/utils.js';

/** The arrowheads that the map draws, as their images, e.g. ["arrow-triangle"]. */
async function drawnArrowheads(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const map = (window as unknown as MapWindow).map;
		const layers = map.getLayersOrder().filter((id) => id.startsWith('elements_arrows'));
		return map.queryRenderedFeatures({ layers }).map((f) => f.properties.icon as string);
	});
}

test('the arrowheads of a line are chosen for its start and its end, and swapped', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 3000 },
		elements: [
			{
				type: 'line',
				points: [
					[13.38, 52.5],
					[13.42, 52.5]
				],
				style: { width: 4 }
			},
			{
				type: 'polygon',
				points: [
					[13.38, 52.49],
					[13.42, 52.49],
					[13.4, 52.48]
				]
			}
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const lineStyle = async () => ((await storedState(page)).elements[0].style ?? {}) as StateStyle;

	await page.mouse.click(...(await project(page, [13.4, 52.5])));
	const start = page.getByRole('radiogroup', { name: 'Start' });
	const end = page.getByRole('radiogroup', { name: 'End' });
	await expect(start.getByRole('radio', { name: 'None' })).toBeChecked();
	await expect(end.getByRole('radio')).toHaveCount(4);
	// the size only with an arrowhead
	const size = page.getByRole('spinbutton', { name: 'Arrowhead size' });
	await expect(size).toHaveCount(0);

	await end.getByRole('radio', { name: 'Triangle' }).check();
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowEnd: 1 });
	await expect.poll(() => drawnArrowheads(page)).toStrictEqual(['arrow-triangle']);
	await size.fill('5');
	await size.press('Enter');
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowEnd: 1, arrowSize: 5 });

	await page.getByRole('button', { name: 'Swap the arrowheads of start and end' }).click();
	await expect(start.getByRole('radio', { name: 'Triangle' })).toBeChecked();
	await expect(end.getByRole('radio', { name: 'None' })).toBeChecked();
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowStart: 1, arrowSize: 5 });

	// one undo step per change
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowEnd: 1, arrowSize: 5 });
	await page.getByRole('button', { name: 'Redo' }).click();
	// undo and redo end the selection
	await page.mouse.click(...(await project(page, [13.4, 52.5])));

	// without arrowheads, the size is not stored
	await start.getByRole('radio', { name: 'None' }).check();
	await expect.poll(lineStyle).toStrictEqual({ width: 4 });
	await expect(size).toHaveCount(0);
	await expect.poll(() => drawnArrowheads(page)).toStrictEqual([]);

	// an area has no ends
	await page.mouse.click(...(await project(page, [13.4, 52.486])));
	await expect(page.getByRole('heading', { name: 'Outline' })).toBeVisible();
	await expect(page.getByRole('radiogroup', { name: 'End' })).toHaveCount(0);
});
