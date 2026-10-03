import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import { project, storedState, waitForMapIsReady } from './lib/utils.js';

const line: [number, number][] = [
	[13.38, 52.5],
	[13.4, 52.505],
	[13.42, 52.5]
];
const polygon: [number, number][] = [
	[13.38, 52.49],
	[13.42, 52.49],
	[13.4, 52.48]
];

test('lines and polygons are made smooth in the section "Shape", together, in one undo step', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.495], radius: 3000 },
		elements: [
			{ type: 'line', points: line },
			{ type: 'polygon', points: polygon },
			{ type: 'marker', point: [13.36, 52.495] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const smoothness = async () =>
		(await storedState(page)).elements.map((e) =>
			e.type === 'line' || e.type === 'polygon' ? e.smooth === true : undefined
		);
	const shape = page.getByRole('heading', { name: 'Shape' });
	const smooth = page.getByRole('checkbox', { name: 'Smooth' });

	// a line, with its button to reverse it
	await page.mouse.click(...(await project(page, line[0])));
	await expect(shape).toBeVisible();
	await expect(page.getByRole('button', { name: 'Reverse line' })).toBeVisible();
	await smooth.check();
	await expect.poll(smoothness).toStrictEqual([true, false, undefined]);

	// a line and a polygon: mixed, and set together; a polygon cannot be reversed
	await page.keyboard.down('ControlOrMeta');
	await page.mouse.click(...(await project(page, [13.4, 52.486])));
	await page.keyboard.up('ControlOrMeta');
	await expect(page.getByText('(mixed)')).toBeVisible();
	await expect(page.getByRole('button', { name: /^Reverse/ })).toHaveCount(0);
	// it shows the value of the first one, like the switch of the outline; a click sets both
	await expect(smooth).toBeChecked();
	await smooth.click();
	await expect.poll(smoothness).toStrictEqual([false, false, undefined]);
	await smooth.click();
	await expect.poll(smoothness).toStrictEqual([true, true, undefined]);

	// one undo step per click
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(smoothness).toStrictEqual([false, false, undefined]);

	// a marker has no shape to smooth
	await page.mouse.click(...(await project(page, [13.36, 52.495])));
	await expect(page.getByRole('heading', { name: 'Marker' })).toBeVisible();
	await expect(shape).toHaveCount(0);
});
