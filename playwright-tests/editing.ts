import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import { project, stateInUrl, waitForMapIsIdle, waitForMapIsReady, type MapWindow } from './lib/utils.js';

test('dragging a slider creates a single undo step', async ({ page }) => {
	const undo = page.getByRole('button', { name: 'Undo' });
	const addPolygon = () => page.getByRole('button', { name: 'Polygon' }).click();

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
	await page.getByLabel('Opacity').evaluate((input: HTMLInputElement) => {
		for (const value of ['0.9', '0.8', '0.7', '0.6', '0.5']) {
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

	await page.getByRole('button', { name: 'Marker' }).click();
	await expect(undo).toBeEnabled();

	await undo.click();
	await expect(undo).toBeDisabled();
	await expect(redo).toBeEnabled();
});

test('undo and redo with the keyboard, but not in text fields', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	const types = () => stateInUrl(page).elements.map((e) => e.type);

	await page.getByRole('button', { name: 'Marker' }).click();
	await page.getByRole('button', { name: 'Line' }).click();
	await expect.poll(types).toStrictEqual(['marker', 'line']);

	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(types).toStrictEqual(['marker']);
	await page.keyboard.press('Shift+ControlOrMeta+z');
	await expect.poll(types).toStrictEqual(['marker', 'line']);
	await page.keyboard.press('ControlOrMeta+z');
	await page.keyboard.press('Control+y');
	await expect.poll(types).toStrictEqual(['marker', 'line']);

	// in a text field (of the new, selected marker), the keys undo the typing, not the map
	await page.getByRole('button', { name: 'Marker' }).click();
	const popup = page.getByRole('textbox', { name: 'Popup' });
	await popup.fill('Hello');
	await popup.press('ControlOrMeta+z');
	await expect.poll(types).toStrictEqual(['marker', 'line', 'marker']);
});

test('selecting a symbol closes the symbol picker', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);

	await page.getByRole('button', { name: 'Marker' }).click();
	await page.getByRole('button', { name: 'flag' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();

	await dialog.getByRole('button', { name: 'airplane', exact: true }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('button', { name: 'airplane' })).toBeVisible();
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
	await page.getByRole('button', { name: 'Polygon' }).click();
	await expectUniqueIds();
	await expect(page.getByLabel('Color')).toHaveCount(2);
	await expect(page.getByLabel('Width')).toHaveCount(1);

	// marker: symbol button and label field are labelled separately
	await page.getByRole('button', { name: 'Marker' }).click();
	await expectUniqueIds();
	await expect(page.getByRole('button', { name: 'Symbol flag' })).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Label' })).toBeVisible();
});

test('duplicating an element', async ({ page }) => {
	// a marker in the center of the map
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);

	const pointsInUrl = () => stateInUrl(page).elements.map((e) => ('point' in e ? e.point : undefined));
	// the map is centered in the area left of the 250px sidebar
	const viewport = page.viewportSize()!;
	const x = (viewport.width - 250) / 2;
	const y = viewport.height / 2;

	// select the marker by clicking its flag icon, which is drawn above and right of its point
	await page.mouse.click(x + 6, y - 8);
	await expect(page.getByRole('button', { name: 'Duplicate' })).toBeEnabled();

	// button and keyboard shortcut place the copy with an offset
	await page.getByRole('button', { name: 'Duplicate' }).click();
	await page.keyboard.press('ControlOrMeta+d');
	await expect.poll(async () => (await pointsInUrl()).length).toBe(3);
	const [original, copy1, copy2] = pointsInUrl();
	expect(original).toStrictEqual(center);
	expect(copy1![0]).toBeGreaterThan(center[0]);
	expect(copy1![1]).toBeLessThan(center[1]);
	expect(copy2![0]).toBeGreaterThan(copy1![0]);

	// alt-drag moves a copy of the selected marker and keeps the original
	await page.mouse.click(x + 6, y - 8);
	// the selection node is rendered asynchronously, and it can only be dragged once it is visible
	await waitForMapIsIdle(page);
	await page.keyboard.down('Alt');
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x - 50, y - 50, { steps: 5 });
	await page.mouse.up();
	await page.keyboard.up('Alt');
	await expect.poll(async () => (await pointsInUrl()).length).toBe(4);
	const points = pointsInUrl();
	expect(points[0]).toStrictEqual(center);
	expect(points[3]![0]).toBeLessThan(center[0]);
	expect(points[3]![1]).toBeGreaterThan(center[1]);
});

test('deleting nodes and elements with the keyboard', async ({ page }) => {
	const points: [number, number][] = [
		[13.35, 52.5],
		[13.4, 52.52],
		[13.45, 52.5]
	];
	await page.goto(
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [{ type: 'line', points }] })
	);
	await waitForMapIsReady(page);
	const linePoints = () => stateInUrl(page).elements.map((e) => ('points' in e ? e.points.length : 0));

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

test('color picker', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Polygon' }).click();
	// the codec returns colors in upper case
	const fill = () => (stateInUrl(page).elements[0] as { style?: { color?: string } })?.style?.color?.toLowerCase();
	const stroke = () =>
		(stateInUrl(page).elements[0] as { strokeStyle?: { color?: string } })?.strokeStyle?.color?.toLowerCase();
	const [fillColor, strokeColor] = await page.getByLabel('Color').all();

	// a hex value sets the fill color
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff00');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(() => fill()).toBe('#00ff00');
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
	await expect.poll(() => stroke()).toBe('#00ff00');

	// dragging in the saturation/brightness field creates a single undo step
	await fillColor.click();
	const field = page.getByRole('slider', { name: 'Saturation and brightness' });
	const box = (await field.boundingBox())!;
	await page.mouse.move(box.x + box.width - 1, box.y + 1);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
	await page.mouse.up();
	// the center is half saturation and half brightness of the hue green
	await expect.poll(() => fill()).toBe('#408040');
	await expect(page.getByLabel('Green')).toHaveValue('128');
	await page.screenshot({ path: 'test-results/color-picker.png' });
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => fill()).toBe('#00ff00');
});

test('editing a popup', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const viewport = page.viewportSize()!;
	// select the marker by clicking its flag icon, which is drawn above and right of its point
	await page.mouse.click((viewport.width - 250) / 2 + 6, viewport.height / 2 - 8);

	const popup = page.getByRole('textbox', { name: 'Popup' });
	await popup.fill('Hello **world**\nhttps://versatiles.org');
	// Backspace in the text field must not delete the element
	await popup.press('Backspace');
	await popup.blur();
	await expect
		.poll(() => stateInUrl(page).elements[0]?.popup)
		.toStrictEqual({ text: 'Hello **world**\nhttps://versatiles.or' });
});

test('selecting multiple elements', async ({ page }) => {
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
	const elements = () => stateInUrl(page).elements;
	const fillColors = () =>
		elements().map((e) => (e.type === 'polygon' ? (e.style?.color ?? '#ff0000').toLowerCase() : e.type));
	const styleTitle = page.getByRole('button', { name: /^Style/ });

	// Shift+click adds the second polygon; the fill colors differ
	const a = await project(page, [13.34, 52.475]);
	const b = await project(page, [13.41, 52.475]);
	await page.mouse.click(...a);
	await expect(styleTitle).toHaveText('Style');
	await page.keyboard.down('Shift');
	await page.mouse.click(...b);
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Style of 2 elements');
	const fillColor = page.getByRole('button', { name: /^Color/ }).first();
	await expect(page.getByText('(mixed)').first()).toBeVisible();

	// the style changes for both polygons
	await fillColor.click();
	await page.getByLabel('Hex').fill('#00ff00');
	await page.getByLabel('Hex').press('Enter');
	await expect.poll(fillColors).toStrictEqual(['#00ff00', '#00ff00', 'marker']);
	await page.keyboard.press('Escape');

	// dragging one of them moves both polygons south, but not the marker
	const firstLatitudes = () => elements().map((e) => ('points' in e ? e.points[0][1] : e.point[1]));
	const before = firstLatitudes();
	await page.mouse.move(...a);
	await page.mouse.down();
	await page.mouse.move(a[0], a[1] + 40, { steps: 5 });
	await page.mouse.up();
	await expect.poll(() => firstLatitudes()[0]).toBeLessThan(before[0]);
	const after = firstLatitudes();
	expect(after[1] - before[1]).toBeCloseTo(after[0] - before[0], 4);
	expect(after[2]).toBe(before[2]);
	await expect(styleTitle).toHaveText('Style of 2 elements');

	// duplicate and delete act on all selected elements
	await page.keyboard.press('ControlOrMeta+d');
	await expect.poll(() => elements().length).toBe(5);
	await expect(styleTitle).toHaveText('Style of 2 elements');
	await page.keyboard.press('Delete');
	await expect.poll(() => elements().length).toBe(3);

	// a marker and polygons have no style properties in common
	const moved = await project(page, [13.34, 52.465]);
	await page.mouse.click(...moved);
	await expect(styleTitle).toHaveText('Style');
	await page.keyboard.down('Shift');
	await page.mouse.click(...((await project(page, [13.37, 52.52])).map((v, i) => v + [6, -8][i]) as [number, number]));
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Style of 2 elements');
	await expect(page.getByText('These elements have no style properties in common.')).toBeVisible();

	// Shift+click on a selected element removes it from the selection
	await page.keyboard.down('Shift');
	await page.mouse.click(...moved);
	await page.keyboard.up('Shift');
	await expect(styleTitle).toHaveText('Style');
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
	const styles = () =>
		stateInUrl(page).elements.map((e) => {
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
	await expect(page.getByRole('button', { name: 'Style of 2 elements' })).toBeVisible();
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
	await expect
		.poll(() =>
			styles()
				.slice(1)
				.map((s) => JSON.stringify(s))
		)
		.toStrictEqual(['{}', '{}']);
});

test('Delete and Backspace keep the elements in sliders and dialogs', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' + encodeState({ map: { center, radius: 10000 }, elements: [{ type: 'marker', point: center }] })
	);
	await waitForMapIsReady(page);
	const viewport = page.viewportSize()!;
	// select the marker by clicking its flag icon, which is drawn above and right of its point
	const selectMarker = () => page.mouse.click((viewport.width - 250) / 2 + 6, viewport.height / 2 - 8);
	await selectMarker();
	const markers = () => stateInUrl(page).elements.length;

	// in the saturation/brightness field of the color picker
	await page.getByRole('button', { name: /^Color/ }).click();
	await page.getByRole('slider', { name: 'Saturation and brightness' }).focus();
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Delete');
	await page.keyboard.press('Escape');

	// in the symbol picker dialog
	await page.getByRole('button', { name: /^Symbol/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await page.keyboard.press('Delete');
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toBeHidden();
	expect(markers()).toBe(1);

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
