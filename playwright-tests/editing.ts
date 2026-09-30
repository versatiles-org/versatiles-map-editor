import { expect, test } from './lib/test.js';
import type { Locator, Page } from '@playwright/test';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	drawElement,
	project,
	storedState,
	waitForMapIsIdle,
	waitForMapIsReady,
	type MapWindow,
	type Point
} from './lib/utils.js';

test('dragging a slider creates a single undo step', { tag: '@cross-browser' }, async ({ page }) => {
	const undo = page.getByRole('button', { name: 'Undo' });
	const addPolygon = () => drawElement(page, 'Polygon');

	async function countUndoSteps(): Promise<number> {
		let steps = 0;
		while (await undo.isEnabled()) {
			await undo.click();
			steps++;
		}
		return steps;
	}

	await page.goto('/');
	await waitForMapIsReady(page);

	await addPolygon();
	// undoes everything, so the map is empty again
	const baseline = await countUndoSteps();

	await addPolygon();
	// a slider drag fires many input events, but only one change event on release
	await page.getByRole('slider', { name: 'Width' }).evaluate((input: HTMLInputElement) => {
		for (const value of ['1', '1.5', '2.5', '3', '3.5']) {
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		input.dispatchEvent(new Event('change', { bubbles: true }));
	});
	expect(await countUndoSteps()).toBe(baseline + 1);
});

test('adding an element creates an undo step', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	const undo = page.getByRole('button', { name: 'Undo' });
	const redo = page.getByRole('button', { name: 'Redo' });
	await expect(undo).toBeDisabled();

	await drawElement(page, 'Marker');
	await expect(undo).toBeEnabled();

	await undo.click();
	await expect(undo).toBeDisabled();
	await expect(redo).toBeEnabled();
});

test('undo and redo with the keyboard, but not in text fields', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const types = async () => (await storedState(page)).elements.map((e) => e.type);

	await drawElement(page, 'Marker');
	await drawElement(page, 'Line');
	await expect.poll(types).toStrictEqual(['marker', 'line']);

	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(types).toStrictEqual(['marker']);
	await page.keyboard.press('Shift+ControlOrMeta+z');
	await expect.poll(types).toStrictEqual(['marker', 'line']);
	await page.keyboard.press('ControlOrMeta+z');
	await page.keyboard.press('Control+y');
	await expect.poll(types).toStrictEqual(['marker', 'line']);

	// in a text field (of the new, selected marker), the keys undo the typing, not the map
	await drawElement(page, 'Marker');
	const popup = page.getByRole('textbox', { name: 'Popup' });
	await popup.fill('Hello');
	await popup.press('ControlOrMeta+z');
	await expect.poll(types).toStrictEqual(['marker', 'line', 'marker']);
});

test('the symbol picker', async ({ page }) => {
	await page.setViewportSize({ width: 1600, height: 900 });
	await page.goto('/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Marker');
	const dialog = page.getByRole('dialog');

	await test.step('selecting a symbol closes the picker', async () => {
		// a new marker is a map pin
		await page.getByRole('button', { name: 'Symbol Map pin' }).click();
		await expect(dialog).toBeVisible();
		// the symbols of all sprite sheets of the server
		await dialog.getByRole('button', { name: 'Anchor', exact: true }).click();
		await expect(dialog).toBeHidden();
		await expect(page.getByRole('button', { name: 'Symbol Anchor' })).toBeVisible();
		await expect
			.poll(async () => (await storedState(page)).elements[0].style)
			.toMatchObject({ symbol: 'icons:anchor' });
	});

	await test.step('the picker filters the symbols while typing', async () => {
		await page.getByRole('button', { name: 'Symbol Anchor' }).click();
		const filter = dialog.getByRole('searchbox', { name: 'Filter symbols' });
		await expect(filter).toBeFocused();

		// at most 16 columns in a wide window, scrolling vertically
		const list = dialog.locator('.list');
		const columns = await list.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
		expect(columns).toBe(16);
		expect(
			await list.evaluate((el) => [el.scrollWidth <= el.clientWidth, el.scrollHeight > el.clientHeight])
		).toStrictEqual([true, true]);

		// by title, alias or name, ignoring case and accents
		const items = list.getByRole('button');
		await filter.fill('cafe');
		await expect(items).toHaveText(['Café']);
		await filter.fill('HARBOUR marina');
		await expect(items).toHaveText(['Anchor']);
		await filter.fill('nothing like this');
		await expect(items).toHaveCount(0);
		await expect(dialog.getByRole('status')).toHaveText('No symbol matches “nothing like this”.');

		// Enter selects the first match
		await filter.fill('cafe');
		await filter.press('Enter');
		await expect(dialog).toBeHidden();
		await expect(page.getByRole('button', { name: 'Symbol Café' })).toBeVisible();

		// the filter is empty again when the picker opens again
		await page.getByRole('button', { name: 'Symbol Café' }).click();
		await expect(filter).toHaveValue('');
		await expect(items.first()).toHaveText('No symbol');
	});

	await test.step('the symbols have the color of the text, with a halo in the color of the background', async () => {
		/** The colors of the opaque pixels of a canvas, as "r,g,b". */
		const colors = (canvas: Locator) =>
			canvas.evaluate((c: HTMLCanvasElement) => {
				const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
				const found = new Set<string>();
				for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 255) found.add(data.slice(i, i + 3).join(','));
				return [...found];
			});
		await dialog.getByRole('searchbox', { name: 'Filter symbols' }).fill('anchor');
		const symbol = dialog.getByRole('button', { name: 'Anchor', exact: true }).locator('canvas');
		const button = page.getByRole('button', { name: 'Symbol Café' }).locator('canvas');

		// black on white
		await expect.poll(() => colors(symbol)).toEqual(expect.arrayContaining(['0,0,0', '255,255,255']));
		expect(await colors(button)).toContain('0,0,0');

		// white on the dark background in dark mode, drawn again while the picker is open
		await page.emulateMedia({ colorScheme: 'dark' });
		await expect.poll(() => colors(symbol)).toEqual(expect.arrayContaining(['255,255,255', '27,27,31']));
		expect(await colors(symbol)).not.toContain('0,0,0');
		await expect.poll(() => colors(button)).toContain('255,255,255');
		expect(await colors(button)).not.toContain('0,0,0');
	});
});

test('style editor controls have unique ids and labels', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	async function expectUniqueIds() {
		const ids = await page.locator('.sidebar [id]').evaluateAll((els) => els.map((el) => el.id));
		expect(ids.length).toBeGreaterThan(0);
		expect(new Set(ids).size).toBe(ids.length);
	}

	// polygon: fill and outline editors are shown together
	await drawElement(page, 'Polygon');
	await expectUniqueIds();
	await expect(page.getByLabel('Color')).toHaveCount(2);
	await expect(page.getByRole('slider', { name: 'Width' })).toHaveCount(1);

	// marker: symbol button and label field are labelled separately
	await drawElement(page, 'Marker');
	await expectUniqueIds();
	await expect(page.getByRole('button', { name: 'Symbol Map pin' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Label' })).toBeVisible();
});

test('duplicating an element', { tag: '@cross-browser' }, async ({ page }) => {
	// a marker in the center of the map
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);

	const pointsInUrl = async () => (await storedState(page)).elements.map((e) => ('point' in e ? e.point : undefined));
	const [x, y] = await project(page, center);

	// select the marker by clicking its flag icon, which is drawn above and right of its point
	await page.mouse.click(x + 6, y - 8);
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();

	// button and keyboard shortcut place the copy with an offset
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await page.keyboard.press('ControlOrMeta+d');
	await expect.poll(async () => (await await pointsInUrl()).length).toBe(3);
	const [original, copy1, copy2] = await pointsInUrl();
	expect(original).toStrictEqual(center);
	expect(copy1![0]).toBeGreaterThan(center[0]);
	expect(copy1![1]).toBeLessThan(center[1]);
	expect(copy2![0]).toBeGreaterThan(copy1![0]);

	// alt-drag moves a copy of the selected marker and keeps the original. Escape deselects the
	// copy first, since the bar of its actions covers the original.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeHidden();
	await page.mouse.click(x + 6, y - 8);
	// the selection node is rendered asynchronously, and it can only be dragged once it is visible
	await waitForMapIsIdle(page);
	await page.keyboard.down('Alt');
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x - 50, y - 50, { steps: 5 });
	await page.mouse.up();
	await page.keyboard.up('Alt');
	await expect.poll(async () => (await await pointsInUrl()).length).toBe(4);
	const points = await pointsInUrl();
	expect(points[0]).toStrictEqual(center);
	expect(points[3]![0]).toBeLessThan(center[0]);
	expect(points[3]![1]).toBeGreaterThan(center[1]);
});

test('deleting nodes and elements with the keyboard', { tag: '@cross-browser' }, async ({ page }) => {
	const points: [number, number][] = [
		[13.35, 52.5],
		[13.4, 52.52],
		[13.45, 52.5]
	];
	await page.goto(
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'line', points }] })
	);
	await waitForMapIsReady(page);
	const linePoints = async () => (await storedState(page)).elements.map((e) => ('points' in e ? e.points.length : 0));

	// select the line, then its middle node
	const [x, y] = await project(page, [13.375, 52.51]);
	await page.mouse.click(x, y);
	await waitForMapIsIdle(page);
	await page.mouse.click(...(await project(page, points[1])));
	await expect(page.getByRole('button', { name: 'Delete node' })).toBeEnabled();

	// Delete removes the node, Backspace without a selected node the element
	await page.keyboard.press('Delete');
	await expect.poll(linePoints).toStrictEqual([2]);
	await expect(page.getByRole('button', { name: 'Delete node' })).toBeHidden();
	await page.keyboard.press('Backspace');
	await expect.poll(linePoints).toStrictEqual([]);
});

test('color picker', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Polygon');
	// the codec returns colors in upper case
	const fill = async () =>
		((await storedState(page)).elements[0] as { style?: { color?: string } })?.style?.color?.toLowerCase();
	const stroke = async () =>
		((await storedState(page)).elements[0] as { strokeStyle?: { color?: string } })?.strokeStyle?.color?.toLowerCase();
	const [fillColor, strokeColor] = await page.getByLabel('Color').all();

	// a hex value sets the fill color
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff00');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(async () => await fill()).toBe('#00ff00');
	await expect(fillColor).toHaveText('#00ff00');

	// Escape closes the picker
	await page.keyboard.press('Escape');
	await expect(page.getByLabel('Hex')).toBeHidden();

	// the outline offers the used colors, most recently used first
	await strokeColor.click();
	const palette = page.getByRole('group', { name: 'Used colors' }).getByRole('button');
	await expect
		.poll(() => palette.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label'))))
		.toStrictEqual(['#00ff00', '#ff0000']);
	await palette.first().click();
	await expect.poll(async () => await stroke()).toBe('#00ff00');

	// a color of the scheme keeps the opacity; the old color is restored with a click
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff0080');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(async () => await fill()).toBe('#00ff0080');
	const scheme = page.getByRole('group', { name: 'Bright (colorblind-safe)' }).getByRole('button').first();
	const schemeColor = await scheme.getAttribute('aria-label');
	await scheme.click();
	await expect.poll(async () => await fill()).toBe(schemeColor + '80');
	await page.getByRole('button', { name: /^Old color/ }).click();
	await expect.poll(async () => await fill()).toBe('#00ff00');
	await page.keyboard.press('Escape');

	// dragging a slider creates a single undo step
	await fillColor.click();
	const green = page.getByRole('slider', { name: 'Green' });
	const box = (await green.boundingBox())!;
	await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	// green about half; the rounding of the mouse position can change it by a few steps
	const channels = (hex = '') => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
	await expect.poll(async () => Math.abs(channels(await fill())[1] - 128)).toBeLessThanOrEqual(6);
	expect(
		Math.abs(Number(await page.getByRole('spinbutton', { name: 'Green' }).inputValue()) - 128)
	).toBeLessThanOrEqual(6);
	await page.screenshot({ path: 'test-results/color-picker.png' });
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => await fill()).toBe('#00ff00');
});

test('editing a popup', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);
	// select the marker by clicking its flag icon, which is drawn above and right of its point
	await page.mouse.click(x + 6, y - 8);

	const popup = page.getByRole('textbox', { name: 'Popup' });
	await popup.fill('Hello **world**\nhttps://versatiles.org');
	// Backspace in the text field must not delete the element
	await popup.press('Backspace');
	await popup.blur();
	await expect
		.poll(async () => (await storedState(page)).elements[0]?.popup)
		.toStrictEqual({ text: 'Hello **world**\nhttps://versatiles.or' });
});

test('selecting multiple elements', { tag: '@cross-browser' }, async ({ page }) => {
	const square = (x: number, y: number): [number, number][] => [
		[x, y],
		[x + 0.02, y],
		[x + 0.02, y + 0.01],
		[x, y + 0.01]
	];
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{ type: 'polygon', points: square(13.33, 52.47) },
			{ type: 'polygon', points: square(13.4, 52.47), style: { color: '#0000ff' } },
			{ type: 'marker', point: [13.37, 52.52] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);
	const elements = async () => (await storedState(page)).elements;
	const fillColors = async () =>
		(await elements()).map((e) => (e.type === 'polygon' ? (e.style?.color ?? '#ff0000').toLowerCase() : e.type));
	// the heading of the inspector: the name of the selected element, or the number of elements
	const styleTitle = page.locator('.sidebar').getByRole('heading', { level: 2 });

	// Shift+click adds the second polygon; the fill colors differ
	const a = await project(page, [13.34, 52.475]);
	const b = await project(page, [13.41, 52.475]);
	await page.mouse.click(...a);
	await expect(styleTitle).toHaveText('Polygon 1');
	await page.keyboard.down('Shift');
	await page.mouse.click(...b);
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('2 elements');
	const fillColor = page.getByRole('button', { name: /^Color/ }).first();
	await expect(page.getByText('(mixed)').first()).toBeVisible();

	// the style changes for both polygons
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff00');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(fillColors).toStrictEqual(['#00ff00', '#00ff00', 'marker']);
	await page.keyboard.press('Escape');

	// dragging one of them moves both polygons south, but not the marker
	const firstLatitudes = async () => (await elements()).map((e) => ('points' in e ? e.points[0][1] : e.point[1]));
	const before = await firstLatitudes();
	await page.mouse.move(...a);
	await page.mouse.down();
	await page.mouse.move(a[0], a[1] + 40, { steps: 5 });
	await page.mouse.up();
	await expect.poll(async () => (await firstLatitudes())[0]).toBeLessThan(before[0]);
	const after = await firstLatitudes();
	expect(after[1] - before[1]).toBeCloseTo(after[0] - before[0], 4);
	expect(after[2]).toBe(before[2]);
	await expect(styleTitle).toHaveText('2 elements');

	// duplicate and delete act on all selected elements
	await page.keyboard.press('ControlOrMeta+d');
	await expect.poll(async () => (await elements()).length).toBe(5);
	await expect(styleTitle).toHaveText('2 elements');
	await page.keyboard.press('Delete');
	await expect.poll(async () => (await elements()).length).toBe(3);

	// a marker and polygons have no style properties in common
	const moved = await project(page, [13.34, 52.465]);
	await page.mouse.click(...moved);
	await expect(styleTitle).toHaveText('Polygon 1');
	await page.keyboard.down('Shift');
	await page.mouse.click(...((await project(page, [13.37, 52.52])).map((v, i) => v + [6, -8][i]) as [number, number]));
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('2 elements');
	await expect(page.getByText('These elements have no style properties in common.')).toBeVisible();

	// Shift+click on a selected element removes it from the selection
	await page.keyboard.down('Shift');
	await page.mouse.click(...moved);
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Marker 1');
	await expect(page.getByRole('button', { name: /^Symbol/ })).toBeVisible();
});

test('copying and pasting a style', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'line',
				points: [
					[13.33, 52.52],
					[13.38, 52.52]
				],
				style: { color: '#0000ff', width: 4 }
			},
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.36, 52.47],
					[13.36, 52.49]
				]
			},
			{ type: 'marker', point: [13.42, 52.5] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);
	// the style parts of all elements, with colors in lower case like in the state
	const styles = async () =>
		(await storedState(page)).elements.map((e) => {
			const lower = (style?: { color?: string }) => style && { ...style, color: style.color?.toLowerCase() };
			return 'strokeStyle' in e
				? { style: lower(e.style), strokeStyle: lower(e.strokeStyle) }
				: { style: lower(e.style) };
		});
	const pasteButton = page.getByRole('button', { name: 'Paste style' });

	// copy the style of the line with the keyboard
	await page.mouse.click(...(await project(page, [13.355, 52.52])));
	await expect(page.getByRole('button', { name: 'Copy style' })).toBeEnabled();
	await expect(pasteButton).toBeDisabled();
	await page.keyboard.press('ControlOrMeta+Alt+c');
	await expect(pasteButton).toBeEnabled();

	// paste it onto the polygon and the marker at once
	await page.mouse.click(...(await project(page, [13.35, 52.475])));
	await page.keyboard.down('Shift');
	// the flag icon of the marker is drawn above and right of its point
	const [mx, my] = await project(page, [13.42, 52.5]);
	await page.mouse.click(mx + 6, my - 8);
	await page.keyboard.up('Shift');
	await expect(page.locator('.sidebar').getByRole('heading', { name: '2 elements' })).toBeVisible();
	await pasteButton.click();

	// the outline of the polygon gets the line style, the marker only its color
	await expect
		.poll(styles)
		.toStrictEqual([
			{ style: { color: '#0000ff', width: 4 } },
			{ style: undefined, strokeStyle: { color: '#0000ff', width: 4 } },
			{ style: { color: '#0000ff' } }
		]);

	// a single undo step reverts both
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await styles()).slice(1).map((s) => JSON.stringify(s))).toStrictEqual(['{}', '{}']);
});

test('Delete and Backspace keep the elements in sliders and dialogs', { tag: '@cross-browser' }, async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);
	// select the marker by clicking its flag icon, which is drawn above and right of its point
	const selectMarker = () => page.mouse.click(x + 6, y - 8);
	await selectMarker();
	const markers = async () => (await storedState(page)).elements.length;

	// in a slider of the color picker
	await page.getByRole('button', { name: /^Color/ }).click();
	await page.getByRole('slider', { name: 'Red' }).focus();
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Delete');
	await page.keyboard.press('Escape');

	// in the symbol picker dialog
	await page.getByRole('button', { name: /^Symbol/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Delete');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
	expect(await markers()).toBe(1);

	// on the map, Delete deletes the selected marker
	await selectMarker();
	await page.keyboard.press('Delete');
	await expect.poll(markers).toBe(0);
});

test('marker labels with braces are drawn as they are', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	const center: [number, number] = [13.4, 52.5];
	const marker = { type: 'marker' as const, point: center, style: { label: 'Price {EUR}' } };
	await page.goto('/#' + encodeState({ map: { center, radius: 10000 }, elements: [marker] }));
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

test.describe('drawing with the tools', { tag: '@cross-browser' }, () => {
	const view = { map: { center: [13.4, 52.5], radius: 10000 }, elements: [] } as MapState;
	const types = async (page: Page) => (await storedState(page)).elements.map((e) => e.type);
	const tool = (page: Page, name: string) => page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name });

	test.beforeEach(async ({ page }) => {
		await page.goto('/#' + encodeState(view));
		await waitForMapIsReady(page);
	});

	test('a line is finished with a double-click, which does not zoom', async ({ page }) => {
		const [x, y] = await project(page, [13.4, 52.5]);
		const zoom = () => page.evaluate(() => (window as unknown as MapWindow).map.getZoom());
		const before = await zoom();

		await tool(page, 'Line').click();
		await expect(tool(page, 'Line')).toHaveAttribute('aria-pressed', 'true');
		await page.mouse.click(x - 80, y);
		await page.mouse.click(x, y - 40);
		await expect(page.getByRole('group', { name: 'Drawing' })).toContainText('2 nodes');
		await page.mouse.dblclick(x + 80, y);

		await expect.poll(async () => await types(page)).toStrictEqual(['line']);
		expect(((await storedState(page)).elements[0] as { points: Point[] }).points).toHaveLength(3);
		// back to selecting, with the new line selected
		await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();
		await page.waitForTimeout(500);
		expect(await zoom()).toBe(before);
	});

	test('a polygon is closed with a click on its first node', async ({ page }) => {
		const [x, y] = await project(page, [13.4, 52.5]);
		await tool(page, 'Polygon').click();
		for (const [dx, dy] of [
			[-60, 40],
			[60, 40],
			[0, -60],
			[-60, 40]
		])
			await page.mouse.click(x + dx, y + dy);
		await expect.poll(async () => await types(page)).toStrictEqual(['polygon']);
		expect(((await storedState(page)).elements[0] as { points: Point[] }).points).toHaveLength(3);
	});

	test('tools have keyboard shortcuts, and Escape cancels', async ({ page }) => {
		const [x, y] = await project(page, [13.4, 52.5]);
		await page.keyboard.press('m');
		await expect(tool(page, 'Marker')).toHaveAttribute('aria-pressed', 'true');
		await page.mouse.click(x, y);
		await expect.poll(async () => await types(page)).toStrictEqual(['marker']);

		// an unfinished line is dropped
		await page.keyboard.press('l');
		await page.mouse.click(x - 80, y + 60);
		await page.keyboard.press('Escape');
		await expect(tool(page, 'Select')).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('group', { name: 'Drawing' })).toBeHidden();

		// a circle, dragged from its center
		await page.keyboard.press('c');
		await page.mouse.move(x + 100, y + 100);
		await page.mouse.down();
		await page.mouse.move(x + 160, y + 100, { steps: 5 });
		await page.mouse.up();
		await expect.poll(async () => await types(page)).toStrictEqual(['marker', 'circle']);
		const radius = ((await storedState(page)).elements[1] as { radius: number }).radius;
		expect(radius).toBeGreaterThan(200);
	});
});

test('the inspector and the actions follow the selection', async ({ page }) => {
	const center: Point = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const title = page.locator('.sidebar').getByRole('heading', { level: 2 });
	const bar = page.getByRole('toolbar', { name: 'Selection' });

	// nothing selected: the properties of the map, and no actions
	await expect(title).toHaveText('Map');
	await expect(page.getByRole('region', { name: 'Background map' })).toBeVisible();
	await expect(bar).toBeHidden();

	// a selected marker: its style, and its actions above it
	const [x, y] = await project(page, center);
	await page.mouse.click(x + 6, y - 8);
	await expect(title).toHaveText('Marker 1');
	await expect(page.getByRole('region', { name: 'Symbol' })).toBeVisible();
	const box = (await bar.boundingBox())!;
	expect(box.y + box.height).toBeLessThan(y - 8);
	expect(Math.abs(box.x + box.width / 2 - x)).toBeLessThan(box.width / 2);

	// the actions act on the selection
	await bar.getByRole('button', { name: 'Delete' }).click();
	await expect.poll(async () => (await storedState(page)).elements).toStrictEqual([]);
	await expect(bar).toBeHidden();
	await expect(title).toHaveText('Map');
});

test(
	'style controls: pictures, a grid of positions, and sliders with their value',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		const state: MapState = {
			map: { center: [13.4, 52.5], radius: 10000 },
			elements: [
				{
					type: 'polygon',
					points: [
						[13.35, 52.48],
						[13.45, 52.48],
						[13.4, 52.52]
					]
				},
				{ type: 'marker', point: [13.3, 52.5], style: { label: 'Cafe' } }
			]
		};
		await page.goto('/#' + encodeState(state));
		await waitForMapIsReady(page);
		const polygon = async () =>
			(await storedState(page)).elements[0] as { style?: { pattern?: number }; strokeStyle?: { width?: number } };

		// the fill pattern as pictures, chosen by click and by arrow keys
		await page.mouse.click(...(await project(page, [13.4, 52.49])));
		const patterns = page.getByRole('radiogroup', { name: 'Pattern' });
		await expect(patterns.getByRole('radio')).toHaveCount(3);
		await patterns.getByRole('radio', { name: 'diagonal', exact: true }).check();
		await expect.poll(async () => (await polygon()).style?.pattern).toBe(1);
		await page.keyboard.press('ArrowRight');
		await expect.poll(async () => (await polygon()).style?.pattern).toBe(2);

		// a slider shows its value
		const width = page.getByRole('slider', { name: 'Width' });
		await width.fill('4');
		await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('4');

		// or typed exactly, and kept within the range of the slider
		const field = page.getByRole('spinbutton', { name: 'Width' });
		await field.fill('2.3');
		await field.press('Enter');
		await expect.poll(async () => (await polygon()).strokeStyle?.width).toBe(2.3);
		// the slider shows the step next to it, the field the exact value
		await expect(field).toHaveValue('2.3');
		await field.fill('150');
		await field.press('Enter');
		await expect.poll(async () => (await polygon()).strokeStyle?.width).toBe(5);
		await expect(field).toHaveValue('5');

		// the label of a marker, at its place around the symbol
		const [x, y] = await project(page, [13.3, 52.5]);
		await page.mouse.click(x + 6, y - 8);
		const positions = page.getByRole('radiogroup', { name: 'Label position' });
		await expect(positions.getByRole('radio', { name: 'Automatic' })).toBeChecked();
		await positions.getByRole('radio', { name: 'Above' }).check();
		await expect
			.poll(async () => ((await storedState(page)).elements[1] as { style?: { align?: number } }).style?.align)
			.toBe(3);

		// a typed value between the steps of the slider, e.g. 17° instead of 15° or 30°
		const rotation = page.getByRole('spinbutton', { name: 'Rotation' });
		await rotation.fill('17');
		await rotation.press('Enter');
		await expect
			.poll(async () => ((await storedState(page)).elements[1] as { style?: { rotate?: number } }).style?.rotate)
			.toBe(17);
	}
);

test(
	'the color picker is a popup, which stays in the viewport and opens where it was moved to',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 560 });
		const state: MapState = {
			map: { center: [13.4, 52.5], radius: 10000 },
			elements: [
				{
					type: 'polygon',
					points: [
						[13.35, 52.48],
						[13.45, 52.48],
						[13.4, 52.52]
					]
				}
			]
		};
		await page.goto('/#' + encodeState(state));
		await waitForMapIsReady(page);
		await page.mouse.click(...(await project(page, [13.4, 52.49])));
		const [fillColor, strokeColor] = await page.getByRole('button', { name: /^Color/ }).all();
		const popup = page.getByRole('dialog', { name: 'Color' });
		const box = async () => (await popup.boundingBox())!;
		const viewport = () => page.viewportSize()!;
		const inViewport = async () => {
			const { x, y, width, height } = await box();
			const { width: w, height: h } = viewport();
			return x >= 0 && y >= 0 && x + width <= w && y + height <= h;
		};

		// next to the sidebar, over the map, and not inside the scrolling sidebar
		await fillColor.click();
		await expect(popup).toBeVisible();
		const sidebar = (await page.locator('.sidebar').boundingBox())!;
		expect((await box()).x + (await box()).width).toBeLessThanOrEqual(sidebar.x);
		expect(await inViewport()).toBe(true);

		// moved by its title bar
		const title = popup.getByText('Color', { exact: true });
		const start = await box();
		const handle = (await title.boundingBox())!;
		await page.mouse.move(handle.x + 5, handle.y + 5);
		await page.mouse.down();
		await page.mouse.move(handle.x - 95, handle.y - 25, { steps: 5 });
		await page.mouse.up();
		expect((await box()).x).toBeCloseTo(start.x - 100, 0);
		expect((await box()).y).toBeCloseTo(start.y - 30, 0);

		// but not out of the viewport
		await page.mouse.move(handle.x - 95, handle.y - 25);
		await page.mouse.down();
		await page.mouse.move(-500, -500, { steps: 5 });
		await page.mouse.up();
		expect(await inViewport()).toBe(true);
		expect((await box()).x).toBe(8);
		expect((await box()).y).toBe(8);

		// another color picker opens where the popup was moved to
		await page.keyboard.press('Escape');
		await expect(popup).toBeHidden();
		await strokeColor.click();
		expect((await box()).x).toBe(8);
		expect((await box()).y).toBe(8);

		// and a smaller window keeps it in the viewport
		await page.setViewportSize({ width: 700, height: 440 });
		await expect.poll(inViewport).toBe(true);
	}
);

test('the text color and the halo color of a label', async ({ page }) => {
	const center: Point = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				map: { center, radius: 10000 },
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
