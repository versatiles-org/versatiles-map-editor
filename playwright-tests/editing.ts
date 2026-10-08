import { expect, test } from './lib/test.js';
import type { Locator, Page } from '@playwright/test';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	drawElement,
	project,
	storedState,
	waitForMapIsIdle,
	showView,
	waitForMapIsReady,
	type MapWindow,
	type Point,
	sidebar,
	styleOf
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
		const ids = await sidebar(page)
			.locator('[id]')
			.evaluateAll((els) => els.map((el) => el.id));
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
	await page.goto('/#' + encodeState({ elements: [{ type: 'marker', point: center }] }));
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
	await page.goto('/#' + encodeState({ elements: [{ type: 'line', points }] }));
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
		(
			(await storedState(page)).elements[0] as { outlineStyle?: { color?: string } }
		)?.outlineStyle?.color?.toLowerCase();
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
	await page.goto('/#' + encodeState({ elements: [{ type: 'marker', point: center }] }));
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
		elements: [
			{ type: 'polygon', points: square(13.33, 52.47) },
			{ type: 'polygon', points: square(13.4, 52.47), style: { color: '#0000ff' } },
			{ type: 'marker', point: [13.37, 52.52] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await showView(page, { center: [13.4, 52.5], radius: 10000 });
	const elements = async () => (await storedState(page)).elements;
	const fillColors = async () =>
		(await elements()).map((e) => (e.type === 'polygon' ? (e.style?.color ?? '#ff0000').toLowerCase() : e.type));
	// the heading of the inspector: the name of the selected element, or the number of elements
	const styleTitle = sidebar(page).getByRole('heading', { level: 2 });

	// Cmd/Ctrl+click adds the second polygon; the fill colors differ
	const a = await project(page, [13.34, 52.475]);
	const b = await project(page, [13.41, 52.475]);
	await page.mouse.click(...a);
	await expect(styleTitle).toHaveText('Polygon');
	await page.keyboard.down('ControlOrMeta');
	await page.mouse.click(...b);
	await page.keyboard.up('ControlOrMeta');
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
	await expect(styleTitle).toHaveText('Polygon');
	await page.keyboard.down('ControlOrMeta');
	await page.mouse.click(...((await project(page, [13.37, 52.52])).map((v, i) => v + [6, -8][i]) as [number, number]));
	await page.keyboard.up('ControlOrMeta');
	await expect(styleTitle).toHaveText('2 elements');
	await expect(page.getByText('These elements have no style properties in common.')).toBeVisible();

	// Cmd/Ctrl+click on a selected element removes it from the selection
	await page.keyboard.down('ControlOrMeta');
	await page.mouse.click(...moved);
	await page.keyboard.up('ControlOrMeta');
	await expect(styleTitle).toHaveText('Marker');
	await expect(page.getByRole('button', { name: /^Symbol/ })).toBeVisible();
});

test('copying and pasting a style', async ({ page }) => {
	const state: MapState = {
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
			return 'outlineStyle' in e
				? { style: lower(e.style), outlineStyle: lower(e.outlineStyle) }
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
	await page.keyboard.down('ControlOrMeta');
	// the flag icon of the marker is drawn above and right of its point
	const [mx, my] = await project(page, [13.42, 52.5]);
	await page.mouse.click(mx + 6, my - 8);
	await page.keyboard.up('ControlOrMeta');
	await expect(sidebar(page).getByRole('heading', { name: '2 elements' })).toBeVisible();
	await pasteButton.click();

	// the outline of the polygon gets the line style, the marker only its color
	await expect
		.poll(styles)
		.toStrictEqual([
			{ style: { color: '#0000ff', width: 4 } },
			{ style: undefined, outlineStyle: { color: '#0000ff', width: 4 } },
			{ style: { color: '#0000ff' } }
		]);

	// a single undo step reverts both
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await styles()).slice(1).map((s) => JSON.stringify(s))).toStrictEqual(['{}', '{}']);
});

test('Delete and Backspace keep the elements in sliders and dialogs', { tag: '@cross-browser' }, async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto('/#' + encodeState({ elements: [{ type: 'marker', point: center }] }));
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
		// after a zoom of the double-click, if there was one
		await waitForMapIsIdle(page);
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
	await page.goto('/#' + encodeState({ elements: [{ type: 'marker', point: center }] }));
	await waitForMapIsReady(page);
	const title = sidebar(page).getByRole('heading', { level: 2 });
	const bar = page.getByRole('toolbar', { name: 'Selection' });

	// nothing selected: the properties of the map, and no actions
	await expect(title).toHaveText('Map');
	await expect(page.getByRole('region', { name: 'Background map' })).toBeVisible();
	await expect(bar).toBeHidden();

	// a selected marker: its style, and its actions above it
	const [x, y] = await project(page, center);
	await page.mouse.click(x + 6, y - 8);
	await expect(title).toHaveText('Marker');
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
			elements: [
				{
					type: 'polygon',
					points: [
						[13.35, 52.48],
						[13.45, 52.48],
						[13.4, 52.52]
					]
				},
				{ type: 'marker', point: [13.3, 52.5], label: 'Cafe' }
			]
		};
		await page.goto('/#' + encodeState(state));
		await waitForMapIsReady(page);
		const polygon = async () =>
			(await storedState(page)).elements[0] as { style?: { pattern?: string }; outlineStyle?: { width?: number } };
		const pattern = async () => (await polygon()).style?.pattern;

		// the fill pattern in a drop-down list with pictures, chosen by click
		await page.mouse.click(...(await project(page, [13.4, 52.49])));
		const patterns = page.getByRole('combobox', { name: 'Pattern' });
		await expect(patterns).toHaveText('Solid');
		await patterns.click();
		await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(9);
		await page.getByRole('option', { name: 'Diagonal up', exact: true }).click();
		await expect(page.getByRole('listbox')).toHaveCount(0);
		await expect.poll(pattern).toBe('diagonal-up');
		await expect(patterns).toBeFocused();
		// and by keys: closed, an arrow key chooses the next one, as in a list of the browser
		await patterns.press('ArrowDown');
		await expect.poll(pattern).toBe('diagonal-down');
		// open, the arrow keys move and Enter chooses
		await patterns.press('Enter');
		await expect(patterns).toHaveAttribute('aria-expanded', 'true');
		await patterns.press('ArrowDown');
		await patterns.press('Enter');
		await expect.poll(pattern).toBe('horizontal');
		// Escape closes it without a change, and keeps the selection
		await patterns.press('Enter');
		await patterns.press('End');
		await patterns.press('Escape');
		await expect(patterns).toHaveAttribute('aria-expanded', 'false');
		await expect(patterns).toBeVisible();
		await expect.poll(pattern).toBe('horizontal');
		// a letter jumps to a pattern that starts with it, and is no shortcut of the editor
		await patterns.press('v');
		await expect.poll(pattern).toBe('vertical');

		// a slider shows its value
		const width = page.getByRole('slider', { name: 'Width' });
		await width.fill('4');
		await expect(page.getByRole('spinbutton', { name: 'Width' })).toHaveValue('4');

		// or typed exactly, and kept within the range of the slider
		const field = page.getByRole('spinbutton', { name: 'Width' });
		await field.fill('2.3');
		await field.press('Enter');
		await expect.poll(async () => (await polygon()).outlineStyle?.width).toBe(2.3);
		// the slider shows the step next to it, the field the exact value
		await expect(field).toHaveValue('2.3');
		await field.fill('150');
		await field.press('Enter');
		await expect.poll(async () => (await polygon()).outlineStyle?.width).toBe(20);
		await expect(field).toHaveValue('20');

		// the label of a marker, at its place around the symbol
		const [x, y] = await project(page, [13.3, 52.5]);
		await page.mouse.click(x + 6, y - 8);
		const positions = page.getByRole('radiogroup', { name: 'Label position' });
		await expect(positions.getByRole('radio', { name: 'Automatic' })).toBeChecked();
		await positions.getByRole('radio', { name: 'Above', exact: true }).check();
		await expect.poll(async () => styleOf((await storedState(page)).elements[1])?.labelPosition).toBe('top');

		// a typed value between the steps of the slider, e.g. 17° instead of 15° or 30°
		const rotation = page.getByRole('spinbutton', { name: 'Rotation' });
		await rotation.fill('17');
		await rotation.press('Enter');
		await expect.poll(async () => styleOf((await storedState(page)).elements[1])?.rotation).toBe(17);
	}
);

test('the size and the coverage of a fill pattern, only with a pattern', async ({ page }) => {
	const points: [number, number][] = [
		[13.35, 52.48],
		[13.45, 52.48],
		[13.4, 52.52]
	];
	await page.goto('/#' + encodeState({ elements: [{ type: 'polygon', points }] }));
	await waitForMapIsReady(page);
	const fill = async () => (await storedState(page)).elements[0].style;
	const images = () =>
		page.evaluate(() =>
			(window as unknown as MapWindow).map.listImages().filter((id) => id.startsWith('fill-pattern:'))
		);

	await page.mouse.click(...(await project(page, [13.4, 52.49])));
	const size = page.getByRole('spinbutton', { name: 'Pattern size' });
	const coverage = page.getByRole('spinbutton', { name: 'Coverage' });
	await expect(size).toHaveCount(0);

	await page.getByRole('combobox', { name: 'Pattern' }).click();
	await page.getByRole('option', { name: 'Dots', exact: true }).click();
	await expect(coverage).toHaveValue('50');
	await size.fill('2');
	await size.press('Enter');
	await coverage.fill('25');
	await coverage.press('Enter');
	await expect.poll(fill).toStrictEqual({ pattern: 'dots', patternScale: 2, patternCoverage: 0.25 });
	await expect.poll(images).toContain('fill-pattern:dots:2:0.25:#ff0000');

	// one undo step per change
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(fill).toStrictEqual({ pattern: 'dots', patternScale: 2 });

	// a solid fill has neither
	await page.mouse.click(...(await project(page, [13.4, 52.49])));
	await page.getByRole('combobox', { name: 'Pattern' }).click();
	await page.getByRole('option', { name: 'Solid', exact: true }).click();
	await expect(size).toHaveCount(0);
	await expect.poll(fill).toBeUndefined();
});

test(
	'the color picker is a popup, which stays in the viewport and opens where it was moved to',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 560 });
		const state: MapState = {
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
		const side = (await sidebar(page).boundingBox())!;
		expect((await box()).x + (await box()).width).toBeLessThanOrEqual(side.x);
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

test('Escape closes the color picker only from within it, and the element stays selected', async ({ page }) => {
	const state: MapState = {
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

	// on its button, and in it: closed, with the focus on its button
	await fillColor.click();
	await expect(popup).toBeVisible();
	await fillColor.focus();
	await page.keyboard.press('Escape');
	await expect(popup).toBeHidden();
	await fillColor.click();
	await popup.getByRole('textbox').first().focus();
	await page.keyboard.press('Escape');
	await expect(popup).toBeHidden();
	await expect(fillColor).toBeFocused();
	// the area is still selected
	await expect(fillColor).toBeVisible();

	// in another control, the Escape is that one's
	await fillColor.click();
	await strokeColor.focus();
	await page.keyboard.press('Escape');
	await expect(popup).toBeVisible();
	await expect(strokeColor).toBeFocused();
});

test('a marker without symbol has no color, size or rotation of a symbol', async ({ page }) => {
	const center: Point = [13.4, 52.5];
	const state = (symbol?: string): MapState => ({
		elements: [{ type: 'marker', point: center, label: 'Text', style: { ...(symbol === undefined ? {} : { symbol }) } }]
	});
	await page.goto('/#' + encodeState(state('')));
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);
	await page.mouse.click(x, y);
	await expect(page.getByRole('spinbutton', { name: 'Text size' })).toBeVisible();
	await expect(page.getByRole('spinbutton', { name: 'Size', exact: true })).toBeHidden();
	await expect(page.getByRole('spinbutton', { name: 'Rotation' })).toBeHidden();
});

test('moving elements to the front and to the back', { tag: '@cross-browser' }, async ({ page }) => {
	// two markers at the same place: B is drawn over A
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				elements: [
					{ type: 'marker', point: center, label: 'A' },
					{ type: 'marker', point: center, label: 'B' }
				]
			})
	);
	await waitForMapIsReady(page);
	const [x, y] = await project(page, center);
	const label = page.getByRole('textbox', { name: 'Label' });
	const labels = async () => (await storedState(page)).elements.map((e) => (e.type === 'marker' ? e.label : undefined));
	// a click selects the marker in front, the list shows it first
	const clickMarker = () => page.mouse.click(x + 6, y - 8);

	await clickMarker();
	await expect(label).toHaveValue('B');
	await page.keyboard.press('e');
	const list = page.getByRole('listbox', { name: 'Elements' });
	await expect(list.getByRole('option')).toHaveText([/Marker: B/, /Marker: A/]);
	await expect(list.getByRole('option', { selected: true })).toHaveText(/: B/);

	// B to the back: now A is in front and gets the click
	await page.getByRole('button', { name: 'Send to back' }).click();
	await expect.poll(labels).toStrictEqual(['B', 'A']);
	await expect(list.getByRole('option')).toHaveText([/Marker: A/, /Marker: B/]);
	await expect(list.getByRole('option', { selected: true })).toHaveText(/: B/);
	await page.keyboard.press('Escape');
	await clickMarker();
	await expect(label).toHaveValue('A');

	// with the keyboard: A one step backward, and back to the front
	await page.locator('body').press('ControlOrMeta+ArrowDown');
	await expect.poll(labels).toStrictEqual(['A', 'B']);
	await page.locator('body').press('Shift+ControlOrMeta+ArrowUp');
	await expect.poll(labels).toStrictEqual(['B', 'A']);

	// one undo step each
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(labels).toStrictEqual(['A', 'B']);
});

test('a marker without symbol is a letter in the color of its label in the list', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				elements: [
					{ type: 'marker', point: center, label: 'Pin', style: { color: '#00ff00' } },
					{ type: 'marker', point: [13.41, 52.5], label: 'Text', style: { symbol: '', labelColor: '#0000ff' } }
				]
			})
	);
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Elements', exact: true }).click();
	const list = page.getByRole('listbox', { name: 'Elements' });
	const icon = (name: RegExp) => list.getByRole('option', { name }).locator('.type');

	await expect(icon(/: Text/).locator('svg')).toHaveAttribute('data-icon', 'label');
	await expect(icon(/: Text/)).toHaveCSS('color', 'rgb(0, 0, 255)');
	await expect(icon(/: Pin/).locator('svg')).toHaveAttribute('data-icon', 'marker');
	await expect(icon(/: Pin/)).toHaveCSS('color', 'rgb(0, 255, 0)');
});

test('typing the radius or the area of circles', async ({ page }) => {
	const a: [number, number] = [13.38, 52.5];
	const b: [number, number] = [13.42, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				elements: [
					{ type: 'circle', point: a, radius: 500 },
					{ type: 'circle', point: b, radius: 800 }
				]
			})
	);
	await waitForMapIsReady(page);
	const radii = async () => (await storedState(page)).elements.map((e) => (e.type === 'circle' ? e.radius : 0));
	const radius = page.getByRole('textbox', { name: 'Radius' });
	const area = page.getByRole('textbox', { name: 'Area' });

	await test.step('one circle: the radius, the area, and a size that is none', async () => {
		const [x, y] = await project(page, a);
		await page.mouse.click(x, y);
		await expect(radius).toHaveValue('500 m');
		await radius.fill('1 km');
		await radius.press('Enter');
		await expect.poll(radii).toStrictEqual([1000, 800]);
		await expect(radius).toHaveValue('1 km');
		await expect(area).toHaveValue('3.14 km²');
		// a number without unit has the unit of the field
		await radius.fill('2');
		await radius.press('Enter');
		await expect.poll(radii).toStrictEqual([2000, 800]);
		await expect(radius).toHaveValue('2 km');
		// 50 ha: a radius of about 399 m
		await area.fill('50 ha');
		await area.press('Enter');
		await expect(radius).toHaveValue('399 m');
		await expect(area).toHaveValue('50 ha');
		await area.fill('a lot');
		await area.press('Enter');
		await expect(area).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByRole('alert')).toContainText('Type a size');
		await expect(radius).toHaveValue('399 m');
		// one undo step per change
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(radii).toStrictEqual([2000, 800]);
	});

	await test.step('two circles get the same size', async () => {
		await page.mouse.click(...(await project(page, a)));
		await page.keyboard.down('ControlOrMeta');
		await page.mouse.click(...(await project(page, b)));
		await page.keyboard.up('ControlOrMeta');
		await expect(radius).toHaveValue('');
		await expect(radius).toHaveAttribute('placeholder', 'Mixed');
		await radius.fill('600');
		await radius.press('Enter');
		await expect.poll(radii).toStrictEqual([600, 600]);
		await expect(radius).toHaveValue('600 m');
	});
});

test('the tools work on a map that its author has rotated and tilted', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	// a map that is opened is not turned: its author turns it
	await showView(page, { center: [13.4, 52.5], radius: 6000 });
	await page.evaluate(() => (window as unknown as MapWindow).map.jumpTo({ bearing: 50, pitch: 45 }));
	await waitForMapIsIdle(page);
	/** The place on the map at a pixel. */
	const placeAt = (x: number, y: number) =>
		page.evaluate(([x, y]) => (window as unknown as MapWindow).map.unproject([x, y]).toArray(), [x, y]);
	const stored = async () => (await storedState(page)).elements;
	const close = (point: number[] | undefined, expected: number[]) =>
		!!point && Math.abs(point[0] - expected[0]) < 2e-4 && Math.abs(point[1] - expected[1]) < 2e-4;

	await test.step('a marker is where it is clicked, and is dragged to where it is dropped', async () => {
		const place = await placeAt(400, 300);
		await drawElement(page, 'Marker', [[400, 300]]);
		await expect
			.poll(async () => {
				const marker = (await stored())[0];
				return close(marker?.type === 'marker' ? marker.point : undefined, place);
			})
			.toBe(true);
		// the new marker is selected: its node is rendered asynchronously, and dragged once it is visible
		await page.getByRole('button', { name: 'Select', exact: true }).click();
		await page.mouse.click(406, 292);
		await waitForMapIsIdle(page);
		const target = await placeAt(520, 420);
		await page.mouse.move(400, 300);
		await page.mouse.down();
		await page.mouse.move(520, 420, { steps: 8 });
		await page.mouse.up();
		await expect
			.poll(async () => {
				const marker = (await stored())[0];
				return close(marker?.type === 'marker' ? marker.point : undefined, target);
			})
			.toBe(true);
	});

	await test.step('a line goes through the clicked places', async () => {
		const places = [await placeAt(300, 500), await placeAt(450, 560), await placeAt(600, 480)];
		await drawElement(page, 'Line', [
			[300, 500],
			[450, 560],
			[600, 480]
		]);
		await expect
			.poll(async () => {
				const line = (await stored())[1];
				return line?.type === 'line' && line.points.length === 3 && line.points.every((p, i) => close(p, places[i]));
			})
			.toBe(true);
		await page.keyboard.press('Escape');
	});

	await test.step('a circle is around the place where its drag starts, as far as it is dragged', async () => {
		const center = await placeAt(700, 250);
		await drawElement(page, 'Circle', [
			[700, 250],
			[760, 250]
		]);
		await expect
			.poll(async () => {
				const circle = (await stored())[2];
				return circle?.type === 'circle' && close(circle.point, center) && circle.radius > 100;
			})
			.toBe(true);
	});

	// the map is still turned as before
	const camera = await page.evaluate(() => {
		const { map } = window as unknown as MapWindow;
		return [Math.round(map.getBearing()), Math.round(map.getPitch())];
	});
	expect(camera).toStrictEqual([50, 45]);
});

test('a marker is laid flat on the map in its style, its symbol and its label', async ({ page }) => {
	const elements: MapState['elements'] = [
		{ type: 'marker', point: [13.38, 52.5], label: 'A' },
		{ type: 'marker', point: [13.42, 52.5], label: 'B' }
	];
	await page.goto('/#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	const styles = async () => (await storedState(page)).elements.map((element) => element.style);
	/** How the layers of the markers draw them: "map" for flat ones, by the layer of each marker. */
	const alignments = () =>
		page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			const keys = [
				'icon-rotation-alignment',
				'icon-pitch-alignment',
				'text-rotation-alignment',
				'text-pitch-alignment'
			];
			const features = map.querySourceFeatures('elements_symbol');
			const layerOf = (label: string) =>
				features.find((feature) => feature.properties.label === label)?.properties.layer;
			return ['A', 'B'].map((label) =>
				keys.map((key) => map.getLayoutProperty(layerOf(label), key as 'icon-pitch-alignment') ?? 'auto').join()
			);
		});
	const upright = 'auto,auto,auto,auto';
	const flat = page.getByRole('checkbox', { name: 'Flat on the map' });

	// the first marker: its symbol is above its point
	const [x, y] = await project(page, [13.38, 52.5]);
	await page.mouse.click(x + 6, y - 8);
	await expect(flat).not.toBeChecked();
	await flat.check();
	await expect.poll(styles).toStrictEqual([{ flat: true }, undefined]);
	// a layer of its own, which draws its symbol and its label on the map
	await expect.poll(alignments).toStrictEqual(['map,map,map,map', upright]);

	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(styles).toStrictEqual([undefined, undefined]);
	await expect.poll(alignments).toStrictEqual([upright, upright]);
});

test('Shift-drag on the map zooms to a box', async ({ page }) => {
	await page.goto('/#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	const zoom = () => page.evaluate(() => (window as unknown as MapWindow).map.getZoom());
	const before = await zoom();
	await page.keyboard.down('Shift');
	await page.mouse.move(400, 300);
	await page.mouse.down();
	await page.mouse.move(500, 380, { steps: 5 });
	await page.mouse.up();
	await page.keyboard.up('Shift');
	await expect.poll(zoom).toBeGreaterThan(before + 1);
});

test('all elements are shown again with a button on the map or the key 0', async ({ page }) => {
	const points: Point[] = [
		[13.3, 52.45],
		[13.5, 52.55]
	];
	const button = page.getByRole('button', { name: 'Show all elements' });
	/** Whether the map shows both markers, and how it is turned. */
	const shown = () =>
		page.evaluate((points) => {
			const { map } = window as unknown as MapWindow;
			return { all: points.every((point) => map.getBounds().contains(point)), bearing: Math.round(map.getBearing()) };
		}, points);

	// nothing to show on an empty map
	await page.goto('/');
	await waitForMapIsReady(page);
	await expect(button).toBeDisabled();

	await page.goto('/#' + encodeState({ elements: points.map((point) => ({ type: 'marker', point })) }));
	await waitForMapIsReady(page);
	expect(await shown()).toStrictEqual({ all: true, bearing: 0 });

	// somewhere else: the button
	await showView(page, { center: [2.35, 48.85], radius: 2000 });
	expect((await shown()).all).toBe(false);
	await button.click();
	await expect.poll(shown).toStrictEqual({ all: true, bearing: 0 });

	// the key, on a map that is turned, and stays so
	await showView(page, { center: [2.35, 48.85], radius: 2000 });
	await page.evaluate(() => (window as unknown as MapWindow).map.jumpTo({ bearing: 30 }));
	await page.locator('.maplibregl-canvas').focus();
	await page.keyboard.press('0');
	await expect.poll(shown).toStrictEqual({ all: true, bearing: 30 });
});
