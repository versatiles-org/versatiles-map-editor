import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import type { Page } from '@playwright/test';
import { getMiddlePoint } from '../src/lib/geometry.js';
import { curvePoint } from '../src/lib/element/smooth_path.js';
import { project, storedState, waitForMapIsIdle, waitForMapIsReady, type MapWindow } from './lib/utils.js';

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

/** How many blue pixels the map has around a point, within 3 pixels. The mouse moves away first. */
async function blueAt(page: Page, point: [number, number]): Promise<number> {
	await page.mouse.move(5, 5);
	await waitForMapIsIdle(page);
	const [x, y] = await project(page, point);
	const png = await page.screenshot({ clip: { x: x - 3, y: y - 3, width: 6, height: 6 } });
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = 'data:image/png;base64,' + base64;
		await image.decode();
		const canvas = document.createElement('canvas');
		[canvas.width, canvas.height] = [image.width, image.height];
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
		let count = 0;
		for (let i = 0; i < data.length; i += 4) if (data[i + 2] > 200 && data[i] < 60 && data[i + 1] < 60) count++;
		return count;
	}, png.toString('base64'));
}

test(
	'a smooth line is drawn through its nodes, off the straight segments between them',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		const open = async (smooth: boolean) => {
			const state: MapState = {
				map: { center: line[1], radius: 2000 },
				elements: [{ type: 'line', points: line, smooth, style: { color: '#0000ff', width: 4 } }]
			};
			await page.goto('/#' + encodeState(state));
			await waitForMapIsReady(page);
		};
		const straightMiddle = getMiddlePoint(line[0], line[1]);
		const curveMiddle = curvePoint(line, false, 0, 0.5);

		await open(false);
		expect(await blueAt(page, straightMiddle)).toBeGreaterThan(0);

		await open(true);
		for (const node of line) expect(await blueAt(page, node)).toBeGreaterThan(0);
		expect(await blueAt(page, curveMiddle)).toBeGreaterThan(0);
		expect(await blueAt(page, straightMiddle)).toBe(0);
	}
);

test('the handles for new nodes of a smooth line are on its curve', async ({ page }) => {
	const state: MapState = {
		map: { center: line[1], radius: 2000 },
		elements: [{ type: 'line', points: line, smooth: true }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await page.mouse.click(...(await project(page, line[1])));
	await expect(page.getByRole('heading', { name: 'Shape' })).toBeVisible();

	/** The indices of the handles of the selection at a point of the map. */
	const handlesAt = async (point: [number, number]) => {
		const pixel = await project(page, point);
		return page.evaluate(
			([x, y]) =>
				(window as unknown as MapWindow).map
					.queryRenderedFeatures([x, y], { layers: ['selection_nodes'] })
					.map((f) => f.properties.index as number),
			pixel
		);
	};
	const handle = curvePoint(line, false, 0, 0.5);
	await expect.poll(() => handlesAt(handle)).toStrictEqual([0.5]);
	expect(await handlesAt(getMiddlePoint(line[0], line[1]))).toStrictEqual([]);

	// dragged, it becomes a new node
	const [x, y] = await project(page, handle);
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y + 30, { steps: 5 });
	await page.mouse.up();
	const points = async () => ((await storedState(page)).elements[0] as { points: [number, number][] }).points;
	await expect.poll(async () => (await points()).length).toBe(4);
	const [, added] = await points();
	expect(added[0]).toBeCloseTo(handle[0], 3);
	expect(added[1]).toBeLessThan(handle[1]);
});
