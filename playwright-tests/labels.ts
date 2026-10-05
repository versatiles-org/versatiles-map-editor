import { expect, test } from './lib/test.js';
import { encodeState } from '../packages/map-state/src/index.js';
import {
	type Point,
	type MapWindow,
	project,
	blueAndRedAround,
	waitForMapIsReady,
	waitForMapIsIdle,
	storedState
} from './lib/utils.js';

// The labels of markers: their text, colors, size, font, position, and which are shown.

test('marker labels with braces are drawn as they are', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const center: [number, number] = [13.4, 52.5];
	const marker = { type: 'marker' as const, point: center, style: { label: 'Price {EUR}' } };
	await page.goto('/#' + encodeState({ view: { center, radius: 10000 }, elements: [marker] }));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);
	const [textField, labels] = await page.evaluate(() => {
		const map = (window as unknown as MapWindow).map;
		const features = map.queryRenderedFeatures({ layers: ['elements_symbol'] });
		return [map.getLayoutProperty('elements_symbol', 'text-field'), features.map((f) => f.properties.label)];
	});
	// read as a property: in a plain string, maplibre would replace "{EUR}" with a feature property
	expect(textField).toStrictEqual(['get', 'label']);
	expect(labels).toStrictEqual(['Price {EUR}']);
	expect(errors).toStrictEqual([]);
});

test('the text color and the halo color of a label', async ({ page }) => {
	const center: Point = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				view: { center, radius: 10000 },
				elements: [{ type: 'marker', point: center, style: { label: 'Cafe' } }]
			})
	);
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);
	await page.mouse.click(x + 6, y - 8);
	const setColor = async (name: string, hex: string) => {
		await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
		await page.getByLabel('Hex').fill(hex);
		await page.getByLabel('Hex').press('Enter');
		await page.keyboard.press('Escape');
	};

	await setColor('Text color', '#123456');
	await setColor('Halo color', '#fedcba');
	await expect
		.poll(async () => (await storedState(page)).elements[0].style)
		.toMatchObject({ labelColor: '#123456', haloColor: '#fedcba' });

	// the map draws the label with them
	await waitForMapIsIdle(page);
	const drawn = await page.evaluate(
		() => (window as unknown as MapWindow).map.queryRenderedFeatures({ layers: ['elements_symbol'] })[0]?.properties
	);
	expect(drawn).toMatchObject({ labelColor: 'rgb(18,52,86)', haloColor: 'rgb(254,220,186)' });
});

test('the size of a label apart from the size of its symbol', async ({ page }) => {
	const center: Point = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				view: { center, radius: 10000 },
				// a blue symbol, a red label to the right of it, no halo: the colors are easy to count
				elements: [
					{
						type: 'marker',
						point: center,
						style: { color: '#0000ff', label: 'MMM', labelColor: '#ff0000', halo: 0, labelPosition: 'right' }
					}
				]
			})
	);
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);

	const drawn = () => blueAndRedAround(page, [x, y]);

	const before = await drawn();
	expect(before.blue.count).toBeGreaterThan(20);
	expect(before.red.count).toBeGreaterThan(20);
	expect(before.red.left).toBeGreaterThan(before.blue.right);

	// a text twice as large: the label grows, the symbol stays
	await page.mouse.click(x, y);
	const textSize = page.getByRole('spinbutton', { name: 'Text size' });
	await textSize.fill('2');
	await textSize.press('Enter');
	await expect.poll(async () => (await storedState(page)).elements[0].style).toMatchObject({ labelSize: 2 });
	await page.keyboard.press('Escape');
	const larger = await drawn();
	expect(larger.red.count).toBeGreaterThan(before.red.count * 2.5);
	// (the edges of the symbol, since its anti-aliased pixels may differ)
	expect(Math.abs(larger.blue.left - before.blue.left)).toBeLessThanOrEqual(1);
	expect(Math.abs(larger.blue.right - before.blue.right)).toBeLessThanOrEqual(1);
	expect(larger.red.left).toBeGreaterThan(larger.blue.right);

	// a symbol three times as large as its label: the label moves out with its edge
	await page.mouse.click(x, y);
	await textSize.fill('1');
	await textSize.press('Enter');
	const size = page.getByRole('spinbutton', { name: 'Size', exact: true });
	await size.fill('3');
	await size.press('Enter');
	await page.keyboard.press('Escape');
	const both = await drawn();
	expect(both.blue.right - both.blue.left).toBeGreaterThan((larger.blue.right - larger.blue.left) * 2.5);
	expect(both.red.left).toBeGreaterThan(both.blue.right);
});

test('a label at a corner of its symbol, and a label without symbol on the point', async ({ page }) => {
	const center: Point = [13.4, 52.5];
	const style = { color: '#0000ff', label: 'MMM', labelColor: '#ff0000', halo: 0 };
	await page.goto(
		'/#' + encodeState({ view: { center, radius: 10000 }, elements: [{ type: 'marker', point: center, style }] })
	);
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);
	const positions = page.getByRole('radiogroup', { name: 'Label position' });
	const labelPosition = async () => (await storedState(page)).elements[0].style?.labelPosition;
	const middle = (box: { left: number; right: number; top: number; bottom: number }) => ({
		x: (box.left + box.right) / 2,
		y: (box.top + box.bottom) / 2
	});

	await test.step('above right and below left of the symbol', async () => {
		await page.mouse.click(x, y);
		await expect(positions.getByRole('radio', { name: 'Automatic' })).toBeChecked();
		await positions.getByRole('radio', { name: 'Above right' }).check();
		await expect.poll(labelPosition).toBe('top-right');
		let { blue, red } = await blueAndRedAround(page, [x, y]);
		// beside the symbol, the bottom left corner of the label at its top right corner
		expect(red.left).toBeGreaterThan(middle(blue).x);
		expect(red.bottom).toBeLessThan(middle(blue).y);
		expect(red.left).toBeGreaterThanOrEqual(blue.right - 3);
		expect(red.bottom).toBeLessThanOrEqual(blue.top + 3);

		await page.mouse.click(x, y);
		await positions.getByRole('radio', { name: 'Below left' }).check();
		await expect.poll(labelPosition).toBe('bottom-left');
		({ blue, red } = await blueAndRedAround(page, [x, y]));
		expect(red.right).toBeLessThan(middle(blue).x);
		expect(red.top).toBeGreaterThan(middle(blue).y);
	});

	await test.step('without symbol: "Center", on the point', async () => {
		await page.mouse.click(x, y);
		await positions.getByRole('radio', { name: 'Automatic' }).check();
		await page.getByRole('button', { name: /^Symbol/ }).click();
		await page.getByRole('button', { name: 'No symbol', exact: true }).click();
		await expect.poll(async () => (await storedState(page)).elements[0].style).toMatchObject({ symbol: '' });
		await expect(positions.getByRole('radio', { name: 'On the point' })).toBeChecked();
		await expect(positions.getByText('Center')).toBeVisible();
		const { blue, red } = await blueAndRedAround(page, [x, y]);
		expect(blue.count).toBe(0);
		expect(Math.abs(middle(red).x)).toBeLessThan(3);
		expect(Math.abs(middle(red).y)).toBeLessThan(3);
	});
});

test('a font for the label of each marker, else the one of the background map', async ({ page }) => {
	const a: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				view: { center: a, radius: 10000 },
				elements: [
					{ type: 'marker', point: a, style: { label: 'A' } },
					{ type: 'marker', point: [13.45, 52.5], style: { label: 'B' } }
				]
			})
	);
	await waitForMapIsReady(page);
	const glyphs: string[] = [];
	page.on('request', (request) => {
		const match = /glyphs\/([^/]+)\//.exec(decodeURIComponent(request.url()));
		if (match) glyphs.push(match[1]);
	});
	const symbolFont = () =>
		page.evaluate(() => (window as unknown as MapWindow).map.getLayoutProperty('elements_symbol', 'text-font'));
	const fonts = async () => (await storedState(page)).elements.map((e) => e.style?.font);
	const label = page.getByRole('region', { name: 'Label', exact: true });
	const background = page.getByRole('region', { name: 'Background labels' });
	const [x, y] = await project(page, a);
	await page.mouse.click(x + 6, y - 8);

	// like the background map, at first
	await expect(label.getByRole('combobox', { name: 'Font' })).toHaveValue('');
	await expect(label.getByRole('combobox', { name: 'Style' })).toHaveCount(0);
	await expect.poll(symbolFont).toStrictEqual(['literal', ['noto_sans_regular']]);

	// a font of its own, for this label only
	await label.getByRole('combobox', { name: 'Font' }).selectOption('Lato');
	await label.getByRole('combobox', { name: 'Style' }).selectOption('Bold');
	await expect.poll(fonts).toStrictEqual(['lato_bold', undefined]);
	const own = (fallback: string) => [
		'match',
		['get', 'font'],
		'lato_bold',
		['literal', ['lato_bold']],
		['literal', [fallback]]
	];
	await expect.poll(symbolFont).toStrictEqual(own('noto_sans_regular'));
	await expect.poll(() => glyphs.includes('lato_bold')).toBe(true);

	// the other label follows the font of the background map
	await page.keyboard.press('Escape');
	await background.getByRole('combobox', { name: 'Font' }).selectOption('Open Sans');
	await expect
		.poll(async () => (await storedState(page)).meta?.background?.options)
		.toMatchObject({ text: { font: 'open_sans_regular' } });
	await expect.poll(symbolFont).toStrictEqual(own('open_sans_regular'));

	// kept in the map, e.g. when it is opened again
	await page.reload();
	await waitForMapIsReady(page);
	await expect.poll(symbolFont).toStrictEqual(own('open_sans_regular'));

	// like the background map again
	await page.mouse.click(x + 6, y - 8);
	await label.getByRole('combobox', { name: 'Font' }).selectOption('Like the background map');
	await expect.poll(fonts).toStrictEqual([undefined, undefined]);
	await expect.poll(symbolFont).toStrictEqual(['literal', ['open_sans_regular']]);
});

test('labels of markers: overlapping ones hidden, and shown from a zoom level', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				view: { center, radius: 10000 },
				elements: [
					{ type: 'marker', point: center, style: { label: 'A' } },
					{ type: 'marker', point: center, style: { label: 'B' } }
				]
			})
	);
	await waitForMapIsReady(page);
	const labels = page.getByRole('region', { name: 'Marker labels' });
	/** A layout property of every layer of markers (two labels: two layers). */
	const layout = (key: string) =>
		page.evaluate((key) => {
			const map = (window as unknown as MapWindow).map;
			const ids = map.getLayersOrder().filter((id) => id.startsWith('elements_symbol'));
			return ids.map((id) => JSON.stringify(map.getLayoutProperty(id, key as 'text-field')));
		}, key);
	const meta = async () => (await storedState(page)).meta;

	await expect.poll(() => layout('text-overlap')).toStrictEqual(['"always"', '"always"']);
	await labels.getByRole('radiogroup', { name: 'Overlapping' }).getByRole('radio', { name: 'Hide' }).check();
	await expect.poll(() => layout('text-overlap')).toStrictEqual(['"never"', '"never"']);
	expect(await layout('text-optional')).toStrictEqual(['true', 'true']);
	await expect.poll(meta).toStrictEqual({ labelOverlap: 'hide' });

	const shownFrom = labels.getByRole('spinbutton', { name: 'Shown from' });
	await shownFrom.fill('14.5');
	await shownFrom.press('Enter');
	const step = JSON.stringify(['step', ['zoom'], '', 14.5, ['get', 'label']]);
	await expect.poll(() => layout('text-field')).toStrictEqual([step, step]);
	await expect.poll(meta).toStrictEqual({ labelOverlap: 'hide', labelMinZoom: 14.5 });

	// kept in the map, e.g. when it is opened again
	await page.reload();
	await waitForMapIsReady(page);
	await expect.poll(() => layout('text-field')).toStrictEqual([step, step]);
	await expect(shownFrom).toHaveValue('14.5');

	// from the zoom level the map is at
	const zoom = await page.evaluate(() => (window as unknown as MapWindow).map.getZoom());
	await labels.getByRole('button', { name: /^From this zoom/ }).click();
	await expect.poll(meta).toStrictEqual({ labelOverlap: 'hide', labelMinZoom: Math.floor(zoom * 10) / 10 });

	// one undo step each
	await page.locator('body').press('ControlOrMeta+z');
	await expect.poll(meta).toStrictEqual({ labelOverlap: 'hide', labelMinZoom: 14.5 });
});
