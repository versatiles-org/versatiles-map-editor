import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type MapState, type StateStyle } from '../packages/map-state/src/index.js';
import { blueAndRedAround, project, storedState, waitForMapIsReady, type MapWindow } from './lib/utils.js';

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
		view: { center: [13.4, 52.5], radius: 3000 },
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
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowEnd: 'triangle' });
	await expect.poll(() => drawnArrowheads(page)).toStrictEqual(['arrow-triangle']);
	await size.fill('5');
	await size.press('Enter');
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowEnd: 'triangle', arrowSize: 5 });

	await page.getByRole('button', { name: 'Swap the arrowheads of start and end' }).click();
	await expect(start.getByRole('radio', { name: 'Triangle' })).toBeChecked();
	await expect(end.getByRole('radio', { name: 'None' })).toBeChecked();
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowStart: 'triangle', arrowSize: 5 });

	// one undo step per change
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(lineStyle).toStrictEqual({ width: 4, arrowEnd: 'triangle', arrowSize: 5 });
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

test('a line is reversed in the inspector, so its arrowheads point the other way', async ({ page }) => {
	const points: [number, number][] = [
		[13.38, 52.5],
		[13.42, 52.5]
	];
	await page.goto(
		'/#' +
			encodeState({
				view: { center: [13.4, 52.5], radius: 3000 },
				elements: [{ type: 'line', points, style: { arrowEnd: 'triangle' } }]
			})
	);
	await waitForMapIsReady(page);
	const line = async () => (await storedState(page)).elements[0] as { points: [number, number][]; style?: StateStyle };

	await page.mouse.click(...(await project(page, [13.4, 52.5])));
	await page.getByRole('button', { name: 'Reverse line' }).click();
	await expect.poll(async () => (await line()).points).toStrictEqual([...points].reverse());
	// the style keeps its start and its end
	expect((await line()).style).toStrictEqual({ arrowEnd: 'triangle' });

	// one undo step
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await line()).points).toStrictEqual(points);
});

test(
	'the arrowheads are drawn at the ends of the line, as wide as the size times its width',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		const [start, end]: [number, number][] = [
			[13.37, 52.5],
			[13.4, 52.5]
		];
		/**
		 * How far the blue pixels of a blue line with this style reach beyond its end (or its start)
		 * and across it, in whole pixels. Smooth edges are not counted, so a slanted edge, e.g. of a
		 * triangle, looks up to 2 pixels smaller.
		 */
		async function measure(atEnd: boolean, style: StateStyle) {
			const state: MapState = {
				view: { center: end, radius: 2000 },
				elements: [{ type: 'line', points: [start, end], style: { color: '#0000ff', width: 4, ...style } }]
			};
			await page.goto('/#' + encodeState(state));
			await waitForMapIsReady(page);
			const { blue } = await blueAndRedAround(page, await project(page, atEnd ? end : start));
			return { beyond: atEnd ? blue.right + 1 : 1 - blue.left, across: blue.bottom - blue.top + 1 };
		}
		const near = (value: number, expected: number, tolerance = 1) =>
			expect(Math.abs(value - expected), `${value} near ${expected}`).toBeLessThanOrEqual(tolerance);

		// the round end of a line 4 pixels wide
		const plain = await measure(true, {});
		near(plain.beyond, 2);
		near(plain.across, 4);

		await test.step('a triangle, with its tip so far beyond the end that the round end is within it', async () => {
			const triangle = await measure(true, { arrowEnd: 'triangle' });
			expect(triangle.beyond).toBeGreaterThan(plain.beyond);
			// its half angle has a sine of 1/√5, so its tip is 2 · √5 pixels beyond the end
			near(triangle.beyond, 2 * Math.sqrt(5), 2.5);
			near(triangle.across, 12, 2.5);
		});

		await test.step('a chevron and a circle on the end point', async () => {
			const chevron = await measure(true, { arrowEnd: 'chevron' });
			near(chevron.beyond, 2);
			near(chevron.across, 12);
			const circle = await measure(true, { arrowEnd: 'circle', arrowSize: 5 });
			near(circle.beyond, 10);
			near(circle.across, 20);
		});

		await test.step('at the start, pointing the other way', async () => {
			const triangle = await measure(false, { arrowStart: 'triangle', arrowSize: 4 });
			near(triangle.beyond, 2 * Math.sqrt(5), 2.5);
			near(triangle.across, 16, 2.5);
		});
	}
);
