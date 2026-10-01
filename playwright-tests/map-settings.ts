import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	drawElement,
	drawnElements,
	project,
	storedState,
	waitForMapIsIdle,
	waitForMapIsReady,
	type MapWindow
} from './lib/utils.js';

test('styling the background map', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.38, 52.47],
					[13.38, 52.5]
				],
				// a pattern is an image, which a new style must not lose
				style: { pattern: 1 }
			},
			{ type: 'marker', point: [13.42, 52.5] }
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	await waitForMapIsIdle(page);

	// what the map shows: the elements, the images of their fill patterns, the selection nodes
	const mapContent = async () => {
		const content = await page.evaluate(() => {
			const map = (window as unknown as MapWindow).map;
			// undefined while a new style loads
			const style = map.getStyle();
			if (!style) return undefined;
			const nodes = map.getSource<import('maplibre-gl').GeoJSONSource>('selection_nodes')!.serialize().data as {
				features: unknown[];
			};
			return {
				patterns: map.listImages().filter((id) => id.startsWith('fill-pattern:')).length,
				selectionNodes: nodes.features.length,
				satellite: 'satellite' in style.sources
			};
		});
		if (!content) return undefined;
		const drawn = await drawnElements(page);
		return { ...content, drawn: [drawn.fill.length, drawn.stroke.length, drawn.symbol.length] };
	};
	const background = async () => (await storedState(page)).meta?.background;
	const [x, y] = await project(page, [13.36, 52.48]);
	await page.mouse.click(x, y);
	const before = await mapContent();
	// a polygon (fill and outline) and a marker
	expect(before).toStrictEqual({ drawn: [1, 1, 1], patterns: 1, selectionNodes: 6, satellite: false });
	// the settings of the background are shown when nothing is selected
	await page.keyboard.press('Escape');
	const deselected = { ...before, selectionNodes: 0 };
	await expect.poll(mapContent).toStrictEqual(deselected);

	await page.getByRole('combobox', { name: 'Theme' }).selectOption('Gray');
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'osm', options: { theme: 'gray', text: { language: 'user' } } });
	// the elements and their patterns survive the new style
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual(deselected);

	await page.getByRole('combobox', { name: 'Language' }).selectOption('German');
	await page.getByRole('radiogroup', { name: 'Labels' }).getByRole('radio', { name: 'Fewer' }).check();
	await page.getByRole('radiogroup', { name: 'Base map' }).getByRole('radio', { name: 'Satellite' }).check();
	// the colors of the vector map do not apply to the satellite map, the labels are kept
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'satellite', options: { osmOverlay: { text: { language: 'de', spacing: 2 } } } });
	await expect(page.getByRole('combobox', { name: 'Theme' })).toBeHidden();
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual({ ...deselected, satellite: true });

	// undoable: back to the gray map with fewer German labels
	const undone = { builder: 'osm', options: { theme: 'gray', text: { language: 'de', spacing: 2 } } };
	await page.getByRole('button', { name: 'Undo' }).click();
	// the URL is written throttled, so wait for the final state before reloading
	await expect.poll(background).toStrictEqual(undone);
	await expect(page.getByRole('radio', { name: 'OpenStreetMap' })).toBeChecked();

	// kept in the URL, and shown in the read-only viewer
	await page.setViewportSize({ width: 500, height: 500 });
	await page.reload();
	await waitForMapIsReady(page);
	await expect(page.getByText('Open this page on a larger screen')).toBeVisible();
	expect(await background()).toStrictEqual(undone);
	const labelsInGerman = () =>
		page.evaluate(() => JSON.stringify((window as unknown as MapWindow).map.getStyle()?.layers).includes('name_de'));
	await expect.poll(labelsInGerman).toBe(true);
});

test('the satellite imagery without streets and labels', async ({ page }) => {
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [{ type: 'marker', point: [13.4, 52.5], style: { label: 'Cafe' } }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const background = async () => (await storedState(page)).meta?.background;
	const sources = () =>
		page.evaluate(() => Object.keys((window as unknown as MapWindow).map.getStyle()?.sources ?? {}));

	await page.getByRole('radio', { name: 'Satellite' }).check();
	const streets = page.getByRole('checkbox', { name: 'Streets' });
	const labels = page.getByRole('radiogroup', { name: 'Labels' });
	const layerIds = () =>
		page.evaluate(() => (window as unknown as MapWindow).map.getStyle()?.layers.map((l) => l.id) ?? []);
	await expect(streets).toBeChecked();

	// the labels without the streets
	await streets.uncheck();
	await expect
		.poll(async () => (await background())?.options.osmOverlay)
		.toMatchObject({ layers: { roads: false, transit: false, markings: false } });
	await expect.poll(async () => (await layerIds()).some((id) => id.startsWith('street-'))).toBe(false);
	expect((await layerIds()).some((id) => id.startsWith('label-place'))).toBe(true);

	// neither: only the imagery and the elements, which are still drawn
	await labels.getByRole('radio', { name: 'None' }).check();
	await expect.poll(background).toStrictEqual({ builder: 'satellite', options: { osmOverlay: false } });
	await expect.poll(sources).not.toContain('versatiles-shortbread');
	expect(await sources()).toContain('satellite');
	await waitForMapIsIdle(page);
	await expect.poll(async () => (await drawnElements(page)).symbol).toStrictEqual([1]);
	// without labels, there is no font or language to set
	await expect(page.getByRole('combobox', { name: 'Language' })).toBeHidden();

	// the streets without the labels
	await streets.check();
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'satellite', options: { osmOverlay: { layers: { labels: false } } } });
	await expect.poll(sources).toContain('versatiles-shortbread');
	await expect.poll(async () => (await layerIds()).some((id) => id.startsWith('street-'))).toBe(true);
	expect((await layerIds()).some((id) => id.startsWith('label-place'))).toBe(false);

	// and both again
	await labels.getByRole('radio', { name: 'Normal' }).check();
	await expect.poll(background).toStrictEqual({ builder: 'satellite', options: {} });
	await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
});

test('the size and the halo of the labels of both maps', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [] }));
	await waitForMapIsReady(page);
	const layerIds = () => page.evaluate(() => (window as unknown as MapWindow).map.getStyle().layers.map((l) => l.id));
	const cityLabel = () =>
		page.evaluate(() => {
			const layer = (window as unknown as MapWindow).map.getStyle().layers.find((l) => l.id === 'label-place-city');
			return layer?.type === 'symbol'
				? { size: layer.layout?.['text-size'], halo: layer.paint?.['text-halo-width'] }
				: {};
		});
	const setValue = async (name: string, value: string) => {
		await page.getByRole('spinbutton', { name }).fill(value);
		await page.getByRole('spinbutton', { name }).press('Enter');
	};
	expect(await layerIds()).toContain('label-place-city');
	const before = await cityLabel();
	expect(before.halo).toBe(2);
	await expect(page.getByRole('spinbutton', { name: 'Halo width' })).toHaveValue('2');

	// larger labels with a wider halo
	await setValue('Label size', '150');
	await setValue('Halo width', '3');
	await expect.poll(async () => (await cityLabel()).halo).toBe(3);
	expect((await cityLabel()).size).not.toStrictEqual(before.size);
	await expect
		.poll(async () => (await storedState(page)).meta?.background?.options.text)
		.toMatchObject({ scale: 1.5, places: { haloWidth: 3 } });

	// the satellite map keeps them
	await page.getByRole('radio', { name: 'Satellite' }).check();
	await expect.poll(async () => (await cityLabel()).halo).toBe(3);
	await expect(page.getByRole('spinbutton', { name: 'Label size' })).toHaveValue('150');

	// without labels, there is nothing to set
	await page.getByRole('radiogroup', { name: 'Labels' }).getByRole('radio', { name: 'None' }).check();
	await expect(page.getByRole('slider', { name: 'Label size' })).toBeHidden();
	await expect(page.getByRole('slider', { name: 'Halo width' })).toBeHidden();
});

test('changing the colors of the vector map and of the satellite imagery', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [] }));
	await waitForMapIsReady(page);
	const background = async () => (await storedState(page)).meta?.background;
	const paint = (layer: string, property: string) =>
		page.evaluate(
			([layer, property]) => (window as unknown as MapWindow).map.getPaintProperty(layer, property as 'fill-color'),
			[layer, property]
		);
	const water = () => paint('water-ocean', 'fill-color');
	const colored = await water();

	// the vector map in gray
	await page.getByRole('slider', { name: 'Saturation' }).fill('-1');
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'osm', options: { recolor: { saturate: -1 }, text: { language: 'user' } } });
	await expect.poll(water).not.toStrictEqual(colored);
	await expect(page.getByRole('spinbutton', { name: 'Saturation' })).toHaveValue('-100');

	// the satellite imagery keeps the change, as a property of its raster layer
	await page.getByRole('radio', { name: 'Satellite' }).check();
	await expect.poll(async () => (await background())?.options.raster).toStrictEqual({ saturation: -1 });
	await expect.poll(() => paint('satellite', 'raster-saturation')).toBe(-1);
	// darker: white becomes gray
	await page.getByRole('slider', { name: 'White becomes' }).fill('0.8');
	await expect.poll(() => paint('satellite', 'raster-brightness-max')).toBeCloseTo(0.8);
	// black is never lighter than white: it pushes white along
	await page.getByRole('spinbutton', { name: 'Black becomes' }).fill('90');
	await page.getByRole('spinbutton', { name: 'Black becomes' }).press('Enter');
	await expect(page.getByRole('spinbutton', { name: 'White becomes' })).toHaveValue('90');
	await expect
		.poll(async () => (await background())?.options.raster)
		.toStrictEqual({
			saturation: -1,
			brightnessMin: 0.9,
			brightnessMax: 0.9
		});
	// the streets and labels over the imagery get the same colors
	expect((await background())?.options.osmOverlay).toMatchObject({
		recolor: { saturate: -1, brightness: 0.4, contrast: 0 }
	});

	// all back
	await page.getByRole('button', { name: 'Reset colors' }).click();
	await expect.poll(async () => (await background())?.options.raster).toBeUndefined();
	await expect(page.getByRole('button', { name: 'Reset colors' })).toBeDisabled();
});

/** The darkest and the lightest channel of all pixels of the map, e.g. of a faded map. */
async function channelRange(page: Page): Promise<[number, number]> {
	// the map without the controls on it
	const png = await page.screenshot({ clip: { x: 100, y: 120, width: 800, height: 500 } });
	return page.evaluate(async (base64) => {
		const image = new Image();
		image.src = 'data:image/png;base64,' + base64;
		await image.decode();
		const canvas = new OffscreenCanvas(image.width, image.height);
		const context = canvas.getContext('2d')!;
		context.drawImage(image, 0, 0);
		const { data } = context.getImageData(0, 0, image.width, image.height);
		let min = 255;
		let max = 0;
		for (let i = 0; i < data.length; i++) {
			if (i % 4 === 3) continue;
			min = Math.min(min, data[i]);
			max = Math.max(max, data[i]);
		}
		return [min, max] as [number, number];
	}, png.toString('base64'));
}

test('black and white become exactly what is set, on both maps', { tag: '@cross-browser' }, async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.39, 52.51], radius: 2500 }, elements: [] }));
	await waitForMapIsReady(page);
	const setLevel = async (name: string, percent: string) => {
		await page.getByRole('spinbutton', { name }).fill(percent);
		await page.getByRole('spinbutton', { name }).press('Enter');
		await waitForMapIsIdle(page);
	};
	// e.g. 50 % of 255, give or take the rounding and smoothing of the edges
	const near = (value: number) => [value - 2, value + 2];
	// the darkest pixels of the vector map: of small labels, which never cover a pixel completely
	const [darkest] = await channelRange(page);

	// the vector map, faded with white: its darkest lines and labels become mid-gray
	await setLevel('Black becomes', '50');
	await expect.poll(async () => (await channelRange(page))[0]).toBeGreaterThanOrEqual(near(127.5)[0]);
	expect((await channelRange(page))[1]).toBe(255);

	// the satellite map with the same levels, also for its streets and labels
	await page.getByRole('radio', { name: 'Satellite' }).check();
	await expect(page.getByRole('checkbox', { name: 'Streets' })).toBeChecked();
	await waitForMapIsIdle(page);
	await expect.poll(async () => (await channelRange(page))[0]).toBeGreaterThanOrEqual(near(127.5)[0]);

	// faded with black instead: nothing is lighter than white becomes, not even the white labels
	await setLevel('Black becomes', '0');
	await setLevel('White becomes', '40');
	await expect.poll(async () => (await channelRange(page))[1]).toBeLessThanOrEqual(near(102)[1]);

	// beyond black and white: more contrast, which the imagery gets from its raster contrast
	await setLevel('White becomes', '200');
	await setLevel('Black becomes', '-100');
	await expect(page.getByRole('spinbutton', { name: 'Black becomes' })).toHaveValue('-100');
	await expect(page.getByRole('spinbutton', { name: 'White becomes' })).toHaveValue('200');
	await expect.poll(async () => (await channelRange(page))[0]).toBeLessThanOrEqual(near(0)[1]);
	expect((await channelRange(page))[1]).toBeGreaterThanOrEqual(near(255)[0]);

	// the same on the vector map: its labels become black, but their edges stay mixed with their halo
	await page.getByRole('radio', { name: 'OpenStreetMap' }).check();
	await waitForMapIsIdle(page);
	await expect(page.getByRole('spinbutton', { name: 'Black becomes' })).toHaveValue('-100');
	await expect.poll(async () => (await channelRange(page))[0]).toBeLessThan(darkest / 2);
	expect((await channelRange(page))[1]).toBe(255);
});

test('one font for the labels of all markers, which need not be the one of the background map', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				map: { center, radius: 10000 },
				elements: [
					{ type: 'marker', point: center, style: { label: 'A' } },
					{ type: 'marker', point: [13.45, 52.5], style: { label: 'B' } }
				]
			})
	);
	await waitForMapIsReady(page);
	const symbolFont = () =>
		page.evaluate(() => (window as unknown as MapWindow).map.getLayoutProperty('elements_symbol', 'text-font'));
	const labels = page.getByRole('region', { name: 'Labels of markers' });
	const background = page.getByRole('region', { name: 'Background map' });

	// like the background map, at first
	await expect(labels.getByRole('combobox', { name: 'Font' })).toHaveValue('');
	await expect(labels.getByRole('combobox', { name: 'Style' })).toHaveCount(0);
	await expect.poll(symbolFont).toStrictEqual(['literal', ['noto_sans_regular']]);

	// a font of their own, in all labels
	await labels.getByRole('combobox', { name: 'Font' }).selectOption('Lato');
	await labels.getByRole('combobox', { name: 'Style' }).selectOption('Bold');
	await expect.poll(symbolFont).toStrictEqual(['literal', ['lato_bold']]);
	await expect.poll(async () => (await storedState(page)).meta?.labelFont).toBe('lato_bold');

	// which the font of the background map does not change
	await background.getByRole('combobox', { name: 'Font' }).selectOption('Open Sans');
	await expect
		.poll(async () => (await storedState(page)).meta?.background?.options)
		.toMatchObject({ text: { font: 'open_sans_regular' } });
	await expect.poll(symbolFont).toStrictEqual(['literal', ['lato_bold']]);

	// kept in the map, e.g. when it is opened again
	await page.reload();
	await waitForMapIsReady(page);
	await expect.poll(symbolFont).toStrictEqual(['literal', ['lato_bold']]);

	// like the background map again
	await labels.getByRole('combobox', { name: 'Font' }).selectOption('Like the background map');
	await expect.poll(symbolFont).toStrictEqual(['literal', ['open_sans_regular']]);
	await expect.poll(async () => (await storedState(page)).meta?.labelFont).toBeUndefined();
});

test('the labels of the background map over areas and lines, those of markers always on top', async ({ page }) => {
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 10000 }, elements: [] }));
	await waitForMapIsReady(page);
	// the position of the layers of the elements, relative to the first label of the background map
	const order = () =>
		page.evaluate(() => {
			const map = (window as unknown as MapWindow).map;
			const ids = map.getLayersOrder();
			const label = ids.findIndex((id) => map.getLayer(id)?.type === 'symbol');
			const offset = (id: string) => Math.sign(ids.indexOf(id) - label);
			return { fill: offset('elements_fill'), stroke: offset('elements_stroke'), symbol: offset('elements_symbol') };
		});
	const checkbox = page.getByRole('checkbox', { name: 'Over areas and lines' });

	// under the areas and lines, at first
	await expect(checkbox).not.toBeChecked();
	expect(await order()).toStrictEqual({ fill: 1, stroke: 1, symbol: 1 });

	// over them, but still under the markers
	await checkbox.check();
	await expect.poll(order).toStrictEqual({ fill: -1, stroke: -1, symbol: 1 });
	await expect.poll(async () => (await storedState(page)).meta?.mapLabelsOnTop).toBe(true);

	// kept in the map, and by a new background map
	await page.reload();
	await waitForMapIsReady(page);
	await expect(checkbox).toBeChecked();
	await expect.poll(order).toStrictEqual({ fill: -1, stroke: -1, symbol: 1 });
	await page.getByRole('radio', { name: 'Satellite' }).check();
	await expect.poll(async () => (await storedState(page)).meta?.background?.builder).toBe('satellite');
	await waitForMapIsIdle(page);
	await expect.poll(order).toStrictEqual({ fill: -1, stroke: -1, symbol: 1 });

	// under them again
	await checkbox.uncheck();
	await expect.poll(order).toStrictEqual({ fill: 1, stroke: 1, symbol: 1 });
	await expect.poll(async () => (await storedState(page)).meta?.mapLabelsOnTop).toBeUndefined();
});

test('editing the legend', async ({ page }) => {
	// e.g. a symbol drawn before the map has a style, when a map with a legend is opened
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	const state: MapState = {
		map: { center: [13.4, 52.5], radius: 10000 },
		elements: [
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.38, 52.47],
					[13.38, 52.5]
				],
				style: { color: '#00aa00' },
				strokeStyle: { visible: false }
			}
		]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const legendInUrl = async () => {
		const legend = (await storedState(page)).meta?.legend;
		return legend && { ...legend, entries: legend.entries.map((e) => ({ ...e, color: e.color.toLowerCase() })) };
	};
	const overlay = page.getByRole('list', { name: 'Legend' });

	// a new legend starts with a color of the map, and is selected to edit it
	await page.getByRole('button', { name: 'Add a legend' }).click();
	await expect(page.locator('.sidebar').getByRole('heading', { level: 2 })).toHaveText('Legend');
	await page.getByRole('textbox', { name: 'Text' }).fill('Park');
	await page.getByRole('textbox', { name: 'Text' }).press('Enter');
	await expect(overlay.getByRole('listitem')).toHaveText(['Park']);

	// a second entry with a blue symbol
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	const entry = page.getByRole('group', { name: 'Entry 2' });
	await entry.getByRole('textbox', { name: 'Text' }).fill('Cafe');
	await entry.getByRole('textbox', { name: 'Text' }).press('Enter');
	await entry.getByRole('button', { name: /^Color/ }).click();
	await entry.getByLabel('Hex').fill('#0000ff');
	await entry.getByLabel('Hex').press('Enter');
	await entry.getByRole('button', { name: /^Symbol/ }).click();
	await page.getByRole('button', { name: 'Café', exact: true }).click();

	await page.getByRole('radiogroup', { name: 'Layout' }).getByRole('radio', { name: 'Horizontal' }).check();
	// the position is a setting of the viewer, in the share dialog
	await page.getByRole('button', { name: /^Share/ }).click();
	const share = page.getByRole('dialog', { name: 'Share or embed the map' });
	await share
		.getByRole('radiogroup', { name: 'Place of the legend' })
		.getByRole('radio', { name: 'Top right' })
		.check();
	await page.keyboard.press('Escape');
	await expect(share).toBeHidden();
	await expect.poll(async () => (await storedState(page)).meta?.viewer).toStrictEqual({ legend: 'top-right' });
	await expect.poll(legendInUrl).toMatchObject({
		layout: 'horizontal',
		entries: [
			{ color: '#00aa00', label: 'Park' },
			{ color: '#0000ff', label: 'Cafe', symbol: 'base:icon-cafe' }
		]
	});
	await expect(overlay.getByRole('listitem')).toHaveText(['Park', 'Cafe']);
	await expect(overlay.locator('canvas')).toHaveCount(1);
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
	const inspectorTitle = page.locator('.sidebar').getByRole('heading', { level: 2 });
	await overlay.click();
	await expect(inspectorTitle).toHaveText('Legend');
	await page.keyboard.press('Escape');
	await expect(inspectorTitle).toHaveText('Map');

	// without entries, there is no legend
	await page.getByRole('button', { name: 'Edit legend' }).click();
	await page.getByRole('button', { name: 'Remove entry 2' }).click();
	await page.getByRole('button', { name: 'Remove entry 1' }).click();
	await expect(overlay).toBeHidden();
	await expect(inspectorTitle).toHaveText('Map');
	await expect.poll(legendInUrl).toBeUndefined();
	expect(pageErrors).toStrictEqual([]);
});

test('choosing a color scheme', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await drawElement(page, 'Polygon');
	const [fillColor, strokeColor] = await page.getByLabel('Color').all();
	const swatches = (name: string) =>
		page
			.getByRole('group', { name })
			.getByRole('button')
			.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
	const polygon = async () => (await storedState(page)).elements[0] as { style?: { color?: string } };

	// the default scheme is offered, and not stored
	await fillColor.click();
	const scheme = page.getByRole('combobox', { name: 'Color scheme' });
	await expect(scheme).toHaveValue('bright');
	expect((await swatches('Bright (colorblind-safe)')).length).toBe(7);

	// another scheme, and one of its colors
	await scheme.selectOption('Okabe-Ito (colorblind-safe)');
	await expect.poll(async () => (await storedState(page)).meta?.colorScheme).toBe('okabe-ito');
	await page
		.getByRole('group', { name: 'Okabe-Ito (colorblind-safe)' })
		.getByRole('button', { name: '#0072b2' })
		.click();
	await expect.poll(async () => (await polygon()).style?.color?.toLowerCase()).toBe('#0072b2');
	await page.keyboard.press('Escape');

	// the scheme belongs to the map, so every color picker offers it
	await strokeColor.click();
	await expect(page.getByRole('combobox', { name: 'Color scheme' })).toHaveValue('okabe-ito');
	await page.keyboard.press('Escape');

	// undo reverts the color, then the scheme
	await page.getByRole('button', { name: 'Undo' }).click();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(async () => (await storedState(page)).meta?.colorScheme).toBeUndefined();
});

test('color schemes and fonts of an organisation', async ({ page }) => {
	await page.route('**/map-editor.config.json', (route) =>
		route.fulfill({
			json: {
				colorSchemes: [{ id: 'ci', name: 'Corporate', colors: ['#003366', '#e30613', '#f5a800'] }],
				replaceDefaultSchemes: true,
				fonts: ['lato_bold']
			}
		})
	);
	await page.goto('/');
	await waitForMapIsReady(page);
	const symbolFont = () =>
		page.evaluate(() => (window as unknown as MapWindow).map.getLayoutProperty('elements_symbol', 'text-font'));

	// only the corporate color scheme is offered, as the default
	await drawElement(page, 'Marker');
	await page.getByLabel('Color').first().click();
	const scheme = page.getByRole('combobox', { name: 'Color scheme' });
	await expect(scheme.getByRole('option')).toHaveText(['Corporate']);
	await expect(page.getByRole('group', { name: 'Corporate' }).getByRole('button')).toHaveCount(3);
	await page.keyboard.press('Escape');

	// the configured face comes first, in its family, with the names from the tile server. The map
	// settings are shown after a click on the empty map.
	await page.mouse.click(150, 600);
	const settings = page.getByRole('region', { name: 'Background map' });
	const family = settings.getByRole('combobox', { name: 'Font' });
	const face = settings.getByRole('combobox', { name: 'Style' });
	await expect(family.getByRole('option').first()).toHaveText('Lato');
	await expect(face).toHaveValue('noto_sans_regular');
	await expect(face.getByRole('option')).toHaveText(['Regular', 'Italic', 'Bold', 'Bold Italic']);

	// marker labels use the font of the map; another family keeps the regular face
	await expect.poll(symbolFont).toStrictEqual(['literal', ['noto_sans_regular']]);
	await family.selectOption('Lato');
	await expect(face.getByRole('option').first()).toHaveText('Bold');
	await expect(face).toHaveValue('lato_regular');
	await face.selectOption('Bold');
	await expect.poll(symbolFont).toStrictEqual(['literal', ['lato_bold']]);
	await expect
		.poll(async () => (await storedState(page)).meta?.background?.options)
		.toMatchObject({ text: { font: 'lato_bold' } });

	// and another family keeps the bold face
	await family.selectOption('Open Sans');
	await expect(face).toHaveValue('open_sans_bold');
	await expect.poll(symbolFont).toStrictEqual(['literal', ['open_sans_bold']]);

	// the legend has a generic font of its own
	await page.getByRole('button', { name: 'Add a legend' }).click();
	await page.getByRole('radiogroup', { name: 'Font' }).getByRole('radio', { name: 'Serif' }).check();
	await expect(page.getByRole('list', { name: 'Legend' })).toHaveCSS('font-family', 'serif');
	await expect.poll(async () => (await storedState(page)).meta?.legend?.font).toBe('serif');

	// and bold or italic texts
	const legend = page.getByRole('list', { name: 'Legend' });
	await page.getByRole('checkbox', { name: 'Bold' }).check();
	await expect(legend).toHaveCSS('font-weight', '700');
	await expect.poll(async () => (await storedState(page)).meta?.legend?.bold).toBe(true);
	await page.getByRole('checkbox', { name: 'Italic' }).check();
	await expect(legend).toHaveCSS('font-style', 'italic');
	await page.getByRole('checkbox', { name: 'Bold' }).uncheck();
	await expect(legend).toHaveCSS('font-weight', '400');
	await expect.poll(async () => (await storedState(page)).meta?.legend).toMatchObject({ font: 'serif', italic: true });
	expect((await storedState(page)).meta?.legend?.bold).toBeUndefined();
});
