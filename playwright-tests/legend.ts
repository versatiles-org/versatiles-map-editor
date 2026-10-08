import { expect, test } from './lib/test.js';
import type { GeoJSONSource } from 'maplibre-gl';
import { encodeState, type MapState, type StateElement } from '../packages/map-state/src/index.js';
import {
	type MapWindow,
	project,
	showView,
	waitForMapIsReady,
	storedState,
	sidebar,
	strokeStyleOf,
	styleOf
} from './lib/utils.js';

// The legend: its entries, their looks and their order, and how it is shown.

test('rearranging the entries of the legend', { tag: '@cross-browser' }, async ({ page }) => {
	// tall enough for all entries in the sidebar, for the mouse to reach them
	await page.setViewportSize({ width: 1280, height: 1600 });
	const entries = ['A', 'B', 'C'].map((label) => ({ type: 'area' as const, style: { color: '#ff0000' }, label }));
	await page.goto('/#' + encodeState({ meta: { legend: { entries } }, elements: [] }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Edit legend' }).click();
	const order = async () => (await storedState(page)).meta?.legend?.entries.map((e) => e.label);
	const overlay = page.getByRole('list', { name: 'Legend' }).getByRole('listitem');
	for (const n of [1, 2, 3]) await page.getByRole('button', { name: `Open entry ${n}` }).click();

	// with the buttons: the focus stays on the button of the moved entry, which stays open
	await page.getByRole('button', { name: 'Move entry 1 down' }).click();
	await expect.poll(order).toStrictEqual(['B', 'A', 'C']);
	await expect(page.getByRole('button', { name: 'Move entry 2 down' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect.poll(order).toStrictEqual(['B', 'C', 'A']);
	await expect(overlay).toHaveText(['B', 'C', 'A']);
	// at the end it cannot move further down, so the focus is on its other button
	await expect(page.getByRole('button', { name: 'Move entry 3 down' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Move entry 3 up' })).toBeFocused();
	await expect(page.getByRole('button', { name: 'Move entry 1 up' })).toBeDisabled();

	// each move is one undo step
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(order).toStrictEqual(['B', 'A', 'C']);

	// with the mouse, by the handle: the last one to the top
	await page.getByRole('button', { name: 'Edit legend' }).click();
	const grip = (n: number) => page.getByRole('group', { name: `Entry ${n}` }).locator('.grip');
	const first = (await page.getByRole('group', { name: 'Entry 1' }).boundingBox())!;
	const handle = (await grip(3).boundingBox())!;
	await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
	await page.mouse.down();
	await page.mouse.move(handle.x + handle.width / 2, first.y + 5, { steps: 8 });
	await page.mouse.up();
	await expect.poll(order).toStrictEqual(['C', 'B', 'A']);
	await expect(overlay).toHaveText(['C', 'B', 'A']);

	// dropped where it is: no change
	const box = (await grip(2).boundingBox())!;
	await page.mouse.move(box.x + 5, box.y + 5);
	await page.mouse.down();
	await page.mouse.move(box.x + 5, box.y + 15, { steps: 3 });
	await page.mouse.up();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(order).toStrictEqual(['B', 'A', 'C']);
});

test('the theme of the legend: light, dark or a glass over the map', { tag: '@cross-browser' }, async ({ page }) => {
	const entries = [
		{ type: 'area' as const, style: { color: '#0072b2' }, outlineStyle: { visible: false }, label: 'A' }
	];
	await page.goto('/#' + encodeState({ meta: { legend: { entries } }, elements: [] }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Edit legend' }).click();
	const themes = page.getByRole('radiogroup', { name: 'Theme' });
	const overlay = page.getByRole('list', { name: 'Legend' });
	const theme = async () => (await storedState(page)).meta?.legend?.theme;
	const look = () =>
		overlay.evaluate((legend) => {
			const style = getComputedStyle(legend);
			const text = getComputedStyle(legend.querySelector('.text')!);
			return { background: style.backgroundColor, blur: style.backdropFilter, text: text.color };
		});

	await expect(themes.getByRole('radio', { name: 'Light' })).toBeChecked();
	const light = await look();
	expect(light.background).toMatch(/^(rgba?\(255, 255, 255|color\(srgb 1 1 1)/);
	expect(light.text).toBe('rgb(0, 114, 178)');

	// dark, with the text lighter
	await themes.getByRole('radio', { name: 'Dark' }).check();
	await expect.poll(theme).toBe('dark');
	await expect.poll(async () => (await look()).background).toBe('rgba(0, 0, 0, 0.75)');
	expect((await look()).text).not.toBe(light.text);

	// a glass, which blurs the map under it
	await themes.getByRole('radio', { name: 'Glass' }).check();
	await expect.poll(theme).toBe('glass');
	await expect.poll(async () => (await look()).blur).toContain('blur');
	expect((await look()).text).toBe(light.text);

	// light again: not stored, as the default
	await themes.getByRole('radio', { name: 'Light' }).check();
	await expect.poll(theme).toBeUndefined();
});

test('the entries of the legend are closed, and open to edit them', async ({ page }) => {
	const entries = ['A', 'B'].map((label) => ({ type: 'area' as const, style: { color: '#ff0000' }, label }));
	await page.goto('/#' + encodeState({ meta: { legend: { entries } }, elements: [] }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Edit legend' }).click();
	const entry = (n: number) => page.getByRole('group', { name: `Entry ${n}` });
	const details = (n: number) => entry(n).getByRole('radiogroup', { name: 'Shows' });

	// closed: the look and the text, which can be edited
	await expect(details(1)).toBeHidden();
	await expect(details(2)).toBeHidden();
	await expect(entry(1).locator('.mark canvas')).toBeVisible();
	await entry(1).getByRole('textbox', { name: 'Text' }).fill('Parks');
	await entry(1).getByRole('textbox', { name: 'Text' }).press('Enter');
	await expect.poll(async () => (await storedState(page)).meta?.legend?.entries[0].label).toBe('Parks');

	// opened and closed again
	const toggle = entry(2).getByRole('button', { name: 'Open entry 2' });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.click();
	await expect(details(2)).toBeVisible();
	await expect(entry(2).getByRole('button', { name: 'Close entry 2' })).toHaveAttribute('aria-expanded', 'true');
	await entry(2).getByRole('button', { name: 'Close entry 2' }).click();
	await expect(details(2)).toBeHidden();

	// a new entry is open
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	await expect(details(3)).toBeVisible();
	await expect(details(1)).toBeHidden();

	// a click on an entry of the legend on the map opens it
	await page.keyboard.press('Escape');
	await page.getByRole('list', { name: 'Legend' }).getByRole('listitem').nth(1).click();
	await expect(sidebar(page).getByRole('heading', { level: 2 })).toHaveText('Legend');
	await expect(details(2)).toBeVisible();
	await expect(details(1)).toBeHidden();
});

test(
	'legend entries show a marker, a line or an area, styled like elements',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 1100 });
		const entries = [{ type: 'marker' as const, style: { color: '#0000ff' }, label: 'A' }];
		await page.goto('/#' + encodeState({ meta: { legend: { entries } }, elements: [] }));
		await waitForMapIsReady(page);
		await page.getByRole('button', { name: 'Edit legend' }).click();
		await page.getByRole('button', { name: 'Open entry 1' }).click();
		const entry = page.getByRole('group', { name: 'Entry 1' });
		const stored = async () => (await storedState(page)).meta?.legend?.entries[0];
		const mark = page.getByRole('list', { name: 'Legend' }).getByRole('listitem').locator('.mark canvas');
		/** How many pixels of the mark are drawn, at the resolution of the canvas. */
		const inked = () =>
			mark.evaluate((canvas: HTMLCanvasElement) => {
				const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
				let count = 0;
				for (let i = 3; i < data.length; i += 4) if (data[i] > 128) count++;
				return count;
			});

		// a line in the color of the marker, dotted, thicker
		await entry.getByRole('radio', { name: 'Line' }).check();
		await expect.poll(stored).toStrictEqual({ type: 'line', style: { color: '#0000ff' }, label: 'A' });
		await expect.poll(inked).toBeGreaterThan(0);
		const solid = await inked();
		await entry.getByRole('radio', { name: 'Dotted', exact: true }).check();
		await expect.poll(stored).toStrictEqual({ type: 'line', style: { color: '#0000ff', dash: 'dotted' }, label: 'A' });
		// dots, with gaps between them
		await expect.poll(inked).toBeLessThan(solid * 0.8);
		await entry.getByRole('spinbutton', { name: 'Width' }).fill('3');
		await entry.getByRole('spinbutton', { name: 'Width' }).press('Enter');
		await expect.poll(async () => styleOf(await stored())?.width).toBe(3);

		// an area without an outline, then with one in the color of the fill
		await entry.getByRole('radio', { name: 'Area' }).check();
		await expect
			.poll(stored)
			.toStrictEqual({ type: 'area', style: { color: '#0000ff' }, outlineStyle: { visible: false }, label: 'A' });
		await entry.getByRole('combobox', { name: 'Pattern' }).click();
		await page.getByRole('option', { name: 'Diagonal up', exact: true }).click();
		await entry.getByRole('checkbox', { name: 'Outline' }).check();
		await expect.poll(stored).toStrictEqual({
			type: 'area',
			style: { color: '#0000ff', pattern: 'diagonal-up' },
			outlineStyle: { color: '#0000ff' },
			label: 'A'
		});
		await expect(entry.getByRole('button', { name: /^Outline color/ })).toBeVisible();

		// each change is one undo step: the outline is gone again
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => strokeStyleOf(await stored())).toStrictEqual({ visible: false });
	}
);

test('a legend entry follows the style of its elements', async ({ page }) => {
	const area = (west: number): MapState['elements'][number] => ({
		type: 'polygon',
		points: [
			[west, 52.49],
			[west + 0.01, 52.49],
			[west + 0.005, 52.5]
		],
		style: { color: '#00aa00' },
		outlineStyle: { visible: false },
		popup: { text: 'Parks' }
	});
	// "Lakes" shows a color that no area has
	const entries = [
		{ type: 'area' as const, style: { color: '#00aa00' }, outlineStyle: { visible: false }, label: 'Parks' },
		{ type: 'area' as const, style: { color: '#00ffff' }, outlineStyle: { visible: false }, label: 'Lakes' }
	];
	await page.goto(
		'/#' +
			encodeState({
				meta: { legend: { entries } },
				elements: [area(13.38), area(13.41)]
			})
	);
	await waitForMapIsReady(page);
	await showView(page, { center: [13.4, 52.5], radius: 3000 });
	const entry = async () => (await storedState(page)).meta?.legend?.entries[0].style;
	const colors = async () => (await storedState(page)).elements.map((e) => e.style?.color);
	const setColor = async (hex: string) => {
		await page.getByRole('button', { name: /^Color/ }).click();
		await page.getByLabel('Hex').fill(hex);
		await page.getByLabel('Hex').press('Enter');
		await page.locator('body').press('Escape');
	};
	const [x1, y1] = await project(page, [13.385, 52.493]);
	const [x2, y2] = await project(page, [13.415, 52.493]);

	await test.step('both areas get a new color: the entry follows, in the same undo step', async () => {
		await page.mouse.click(x1, y1);
		await page.keyboard.down('ControlOrMeta');
		await page.mouse.click(x2, y2);
		await page.keyboard.up('ControlOrMeta');
		await setColor('#008800');
		await expect.poll(colors).toStrictEqual(['#008800', '#008800']);
		await expect.poll(entry).toStrictEqual({ color: '#008800' });
		await expect(page.getByText('The legend entry “Parks” has the new style too.')).toBeVisible();
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(colors).toStrictEqual(['#00aa00', '#00aa00']);
		await expect.poll(entry).toStrictEqual({ color: '#00aa00' });
	});

	await test.step('one area gets a new color: the entry stays, and the inspector tells', async () => {
		await page.locator('body').press('Escape');
		await page.mouse.click(x1, y1);
		await setColor('#0000ff');
		await expect.poll(colors).toStrictEqual(['#0000ff', '#00aa00']);
		await expect.poll(entry).toStrictEqual({ color: '#00aa00' });
		await expect(page.getByText('The legend shows “Parks” with a different style.')).toBeVisible();
	});

	await test.step('the last area with the old color gets a new one: the entry follows', async () => {
		await page.locator('body').press('Escape');
		await page.mouse.click(x2, y2);
		await setColor('#ff00ff');
		await expect.poll(entry).toStrictEqual({ color: '#ff00ff' });
	});

	await test.step('an entry whose style no element has is marked in the legend', async () => {
		// nothing selected: a click beside the areas
		await page.mouse.click(...(await project(page, [13.4, 52.51])));
		await page.getByRole('button', { name: 'Edit legend' }).click();
		await expect(page.getByRole('group', { name: 'Entry 1' })).not.toContainText('No element has this style.');
		await expect(page.getByRole('group', { name: 'Entry 2' })).toContainText('No element has this style.');
	});
});

test('adding the look of an element to the legend', async ({ page }) => {
	const route = {
		type: 'line' as const,
		points: [
			[13.39, 52.5],
			[13.41, 52.5]
		] as [number, number][]
	};
	const elements: StateElement[] = [{ ...route, style: { color: '#d55e00', dash: 'dashed', width: 4 } }];
	await page.goto('/#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	await page.keyboard.press('e');
	await page.getByRole('listbox', { name: 'Elements' }).getByRole('option').first().click();
	const panel = sidebar(page);
	await panel.getByRole('textbox', { name: 'Popup' }).fill('Bus 100');
	await panel.getByRole('textbox', { name: 'Popup' }).blur();

	await panel.getByRole('button', { name: 'Add to legend' }).click();
	await expect(panel.getByRole('region', { name: 'Legend' }).getByRole('status')).toHaveText(
		'Added an entry to the legend.'
	);
	await expect
		.poll(async () => (await storedState(page)).meta?.legend?.entries)
		.toStrictEqual([{ type: 'line', style: { color: '#d55e00', dash: 'dashed', width: 4 }, label: 'Bus 100' }]);
	await expect(page.getByRole('list', { name: 'Legend' }).getByRole('listitem')).toHaveText(['Bus 100']);

	// once
	await panel.getByRole('button', { name: 'Add to legend' }).click();
	await expect(panel.getByRole('region', { name: 'Legend' }).getByRole('status')).toHaveText(
		'The legend shows this style already.'
	);
	await expect.poll(async () => (await storedState(page)).meta?.legend?.entries).toHaveLength(1);
});

test('pasting the style of an element onto a legend entry', async ({ page }) => {
	const points: [number, number][] = [
		[13.39, 52.5],
		[13.41, 52.5]
	];
	const legend = { entries: [{ type: 'marker' as const, style: { color: '#0000ff' }, label: 'Route' }] };
	const elements: StateElement[] = [{ type: 'line', points, style: { color: '#d55e00', dash: 'dashed', width: 4 } }];
	await page.goto('/#' + encodeState({ meta: { legend }, elements }));
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Edit legend' }).click();
	await page.getByRole('button', { name: 'Open entry 1' }).click();
	const paste = page.getByRole('group', { name: 'Entry 1' }).getByRole('button', { name: 'Paste style' });
	// nothing copied yet
	await expect(paste).toBeDisabled();

	await page.keyboard.press('e');
	await page.getByRole('listbox', { name: 'Elements' }).getByRole('option').first().click();
	await page.getByRole('button', { name: 'Copy style' }).click();
	// back to the map, and to the legend
	await page.locator('body').press('Escape');
	await page.getByRole('button', { name: 'Edit legend' }).click();
	await page.getByRole('button', { name: 'Open entry 1' }).click();
	await paste.click();
	await expect
		.poll(async () => (await storedState(page)).meta?.legend?.entries)
		.toStrictEqual([{ type: 'line', style: { color: '#d55e00', dash: 'dashed', width: 4 }, label: 'Route' }]);
	// the controls of a line
	await expect(page.getByRole('group', { name: 'Entry 1' }).getByRole('radio', { name: 'Line' })).toBeChecked();
});

test(
	'taking the style of an element for a legend entry with the pipette',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		const points: [number, number][] = [
			[13.39, 52.495],
			[13.41, 52.495],
			[13.41, 52.505],
			[13.39, 52.505]
		];
		const legend = { entries: [{ type: 'marker' as const, style: { color: '#0000ff' }, label: 'Park' }] };
		const elements: StateElement[] = [
			{
				type: 'polygon',
				points,
				style: { color: '#00ff004d', pattern: 'diagonal-up' },
				outlineStyle: { color: '#00aa00' }
			}
		];
		await page.goto('/#' + encodeState({ meta: { legend }, elements }));
		await waitForMapIsReady(page);
		await showView(page, { center: [13.4, 52.5], radius: 3000 });
		await page.getByRole('button', { name: 'Edit legend' }).click();
		await page.getByRole('button', { name: 'Open entry 1' }).click();
		const take = page.getByRole('group', { name: 'Entry 1' }).getByRole('button', { name: /Take style from/ });
		const entry = async () => (await storedState(page)).meta?.legend?.entries[0];
		const cursor = () => page.locator('.maplibregl-canvas-container').evaluate((e: HTMLElement) => e.style.cursor);
		const highlighted = () =>
			page.evaluate(async () => {
				const source = (window as unknown as MapWindow).map.getSource<GeoJSONSource>('highlight')!;
				return ((await source.getData()) as GeoJSON.FeatureCollection).features.length;
			});
		const [x, y] = await project(page, [13.4, 52.5]);

		// Escape cancels
		await take.click();
		await expect(take).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.statusbar')).toContainText('Click an element on the map to take its style');
		expect(await cursor()).toContain('url(');
		await page.keyboard.press('Escape');
		await expect(take).toHaveAttribute('aria-pressed', 'false');
		expect(await cursor()).not.toContain('url(');

		// the element under the pipette is highlighted; a click beside it picks nothing
		await take.click();
		await page.mouse.move(x, y);
		await expect.poll(highlighted).toBe(1);
		await page.mouse.click(x + 300, y);
		await expect(take).toHaveAttribute('aria-pressed', 'true');

		// a click on it takes its style; the legend stays selected
		await page.mouse.click(x, y);
		await expect.poll(entry).toStrictEqual({
			type: 'area',
			style: { color: '#00ff004d', pattern: 'diagonal-up' },
			outlineStyle: { color: '#00aa00' },
			label: 'Park'
		});
		await expect(take).toHaveAttribute('aria-pressed', 'false');
		await expect.poll(highlighted).toBe(0);
		await expect(sidebar(page).getByRole('heading', { level: 2 })).toHaveText('Legend');

		// one undo step
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(entry).toStrictEqual(legend.entries[0]);
	}
);

test('editing the legend', async ({ page }) => {
	// e.g. a symbol drawn before the map has a style, when a map with a legend is opened
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	const state: MapState = {
		elements: [
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.38, 52.47],
					[13.38, 52.5]
				],
				style: { color: '#00aa00' },
				outlineStyle: { visible: false }
			}
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const legendInUrl = async () => {
		const legend = (await storedState(page)).meta?.legend;
		return (
			legend && {
				...legend,
				entries: legend.entries.map((e) => ({ ...e, style: { ...e.style, color: e.style?.color?.toLowerCase() } }))
			}
		);
	};
	const overlay = page.getByRole('list', { name: 'Legend' });

	// a new legend starts with a color of the map, and is selected to edit it
	await page.getByRole('button', { name: 'Add a legend' }).click();
	await expect(sidebar(page).getByRole('heading', { level: 2 })).toHaveText('Legend');
	await page.getByRole('textbox', { name: 'Text' }).fill('Park');
	await page.getByRole('textbox', { name: 'Text' }).press('Enter');
	await expect(overlay.getByRole('listitem')).toHaveText(['Park']);

	// a second entry, a marker with a blue symbol: a new entry is an area, which keeps its color
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	const entry = page.getByRole('group', { name: 'Entry 2' });
	await entry.getByRole('textbox', { name: 'Text' }).fill('Cafe');
	await entry.getByRole('textbox', { name: 'Text' }).press('Enter');
	await entry.getByRole('button', { name: /^Fill color/ }).click();
	await entry.getByLabel('Hex').fill('#0000ff');
	await entry.getByLabel('Hex').press('Enter');
	await entry.getByRole('radio', { name: 'Marker' }).check();
	await entry.getByRole('button', { name: /^Symbol/ }).click();
	await page.getByRole('button', { name: 'Café', exact: true }).click();

	await page.getByRole('radiogroup', { name: 'Layout' }).getByRole('radio', { name: 'Horizontal' }).check();
	// the position is a setting of the viewer, also in the panel of the shared map
	await sidebar(page).getByRole('button', { name: 'Edit shared map…' }).click();
	const place = sidebar(page).getByRole('radiogroup', { name: 'Place of the legend' });
	await place.getByRole('radio', { name: 'Top right' }).check();
	await page.keyboard.press('Escape');
	await expect(place).toBeHidden();
	await expect.poll(async () => (await storedState(page)).meta?.viewer).toStrictEqual({ legend: 'top-right' });
	await expect.poll(legendInUrl).toMatchObject({
		layout: 'horizontal',
		entries: [
			// a new entry is an area without an outline, one with a symbol a marker
			{ type: 'area', style: { color: '#00aa00' }, outlineStyle: { visible: false }, label: 'Park' },
			{ type: 'marker', style: { color: '#0000ff', symbol: 'base:icon-cafe' }, label: 'Cafe' }
		]
	});
	await expect(overlay.getByRole('listitem')).toHaveText(['Park', 'Cafe']);
	// the symbol of the marker, the area drawn
	await expect(overlay.locator('canvas.symbol')).toHaveCount(1);
	await page.screenshot({ path: 'test-results/legend.png' });

	// shown in the read-only viewer
	await page.setViewportSize({ width: 500, height: 500 });
	await page.reload();
	await waitForMapIsReady(page);
	await expect(overlay.getByRole('listitem')).toHaveText(['Park', 'Cafe']);
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.reload();
	await waitForMapIsReady(page);

	// a click on the legend selects it, and Escape goes back to the map
	const inspectorTitle = sidebar(page).getByRole('heading', { level: 2 });
	await overlay.click();
	await expect(inspectorTitle).toHaveText('Legend');
	await page.keyboard.press('Escape');
	await expect(inspectorTitle).toHaveText('Map');

	// without entries, there is no legend
	await page.getByRole('button', { name: 'Edit legend' }).click();
	await page.getByRole('button', { name: 'Open entry 2' }).click();
	await page.getByRole('button', { name: 'Remove entry 2' }).click();
	await page.getByRole('button', { name: 'Open entry 1' }).click();
	await page.getByRole('button', { name: 'Remove entry 1' }).click();
	await expect(overlay).toBeHidden();
	await expect(inspectorTitle).toHaveText('Map');
	await expect.poll(legendInUrl).toBeUndefined();
	expect(pageErrors).toStrictEqual([]);
});
