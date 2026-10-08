import { expect, test } from './lib/test.js';
import type { Page } from '@playwright/test';
import type { GeoJSONSource } from 'maplibre-gl';
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
		elements: [
			{
				type: 'polygon',
				points: [
					[13.33, 52.47],
					[13.38, 52.47],
					[13.38, 52.5]
				],
				// a pattern is an image, which a new style must not lose
				style: { pattern: 'diagonal-up' }
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
	await expect.poll(background).toStrictEqual({ theme: 'gray' });
	// the elements and their patterns survive the new style
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual(deselected);

	// the dark theme of the same color preset: a dark background, and light again
	const theme = page.getByRole('combobox', { name: 'Theme' });
	// the mean of the channels of the background color, e.g. "rgb(39,39,39)", from 0 to 255
	const lightness = () =>
		page.evaluate(() => {
			const map = (window as unknown as MapWindow).map;
			const layer = map.getStyle()?.layers.find((l) => l.type === 'background');
			const color = layer && String(map.getPaintProperty(layer.id, 'background-color'));
			const channels = color?.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
			return channels.reduce((sum, value) => sum + value, 0) / channels.length;
		});
	await theme.selectOption('Gray Dark');
	await expect.poll(background).toStrictEqual({ theme: 'gray-dark' });
	await expect.poll(lightness).toBeLessThan(80);
	await theme.selectOption('Gray');
	await expect.poll(background).toStrictEqual({ theme: 'gray' });
	await expect.poll(lightness).toBeGreaterThan(180);
	await waitForMapIsIdle(page);

	await page.getByRole('combobox', { name: 'Language' }).selectOption('German');
	await page.getByRole('radiogroup', { name: 'Labels' }).getByRole('radio', { name: 'Fewer' }).check();
	await page.getByRole('radiogroup', { name: 'Base map' }).getByRole('radio', { name: 'Satellite' }).check();
	// the theme of the vector map does not apply to the satellite map, the labels are kept
	await expect.poll(background).toStrictEqual({ base: 'satellite', labels: 'fewer', language: 'de' });
	await expect(page.getByRole('combobox', { name: 'Theme' })).toBeHidden();
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual({ ...deselected, satellite: true });

	// undoable: back to the gray map with fewer German labels
	const undone = { theme: 'gray', labels: 'fewer', language: 'de' };
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

test('the relief of the background map: shaded, and raised as terrain, on both maps', async ({ page }) => {
	// the Alps around the Zugspitze
	await page.goto('/#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	const features = async () => {
		const { hillshade, terrain } = (await storedState(page)).meta?.background ?? {};
		return { hillshade, terrain };
	};
	/** What the map draws of the relief. */
	const relief = () =>
		page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			return {
				hillshade: map.getStyle().layers.some((layer) => layer.type === 'hillshade'),
				terrain: !!map.getTerrain()
			};
		});
	const hillshade = page.getByRole('checkbox', { name: 'Hillshade' });
	const terrain = page.getByRole('checkbox', { name: 'Terrain' });

	await expect(hillshade).not.toBeChecked();
	await expect(terrain).not.toBeChecked();
	expect(await relief()).toStrictEqual({ hillshade: false, terrain: false });

	await hillshade.check();
	await expect.poll(features).toStrictEqual({ hillshade: true, terrain: undefined });
	await expect.poll(relief).toStrictEqual({ hillshade: true, terrain: false });
	await terrain.check();
	await expect.poll(features).toStrictEqual({ hillshade: true, terrain: true });
	await expect.poll(relief).toStrictEqual({ hillshade: true, terrain: true });

	// the satellite map keeps it
	await page.getByRole('radio', { name: 'Satellite' }).click();
	await expect.poll(async () => (await storedState(page)).meta?.background?.base).toBe('satellite');
	await expect.poll(features).toStrictEqual({ hillshade: true, terrain: true });
	await expect.poll(relief).toStrictEqual({ hillshade: true, terrain: true });
	await expect(hillshade).toBeChecked();

	// each is an undo step
	await terrain.uncheck();
	await expect.poll(relief).toStrictEqual({ hillshade: true, terrain: false });
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(relief).toStrictEqual({ hillshade: true, terrain: true });
	await waitForMapIsIdle(page);
});

test('the buildings of the vector map are raised to their heights', async ({ page }) => {
	await page.goto('/#' + encodeState({ elements: [] }));
	await waitForMapIsReady(page);
	const stored = async () => (await storedState(page)).meta?.background;
	/** The kinds of the layers that draw the buildings. */
	const buildingLayers = () =>
		page.evaluate(() => {
			const { map } = window as unknown as MapWindow;
			const layers = map.getStyle().layers.filter((layer) => layer.id.startsWith('building'));
			return [...new Set(layers.map((layer) => layer.type))].sort();
		});
	const buildings = page.getByRole('checkbox', { name: '3D buildings' });

	await expect(buildings).not.toBeChecked();
	expect(await buildingLayers()).toStrictEqual(['fill']);
	await buildings.check();
	await expect.poll(stored).toStrictEqual({ buildings: 'extruded' });
	await expect.poll(buildingLayers).toStrictEqual(['fill-extrusion']);

	// the satellite map has none
	await page.getByRole('radio', { name: 'Satellite' }).click();
	await expect(buildings).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(buildingLayers).toStrictEqual(['fill-extrusion']);
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(buildingLayers).toStrictEqual(['fill']);
	await waitForMapIsIdle(page);
});

test('the satellite imagery without streets, borders and labels', async ({ page }) => {
	const state: MapState = {
		elements: [{ type: 'marker', point: [13.4, 52.5], label: 'Cafe' }]
	};
	await page.goto('/#' + encodeState(state));
	await waitForMapIsReady(page);
	const background = async () => (await storedState(page)).meta?.background;
	const sources = () =>
		page.evaluate(() => Object.keys((window as unknown as MapWindow).map.getStyle()?.sources ?? {}));

	await page.getByRole('radio', { name: 'Satellite' }).check();
	const streets = page.getByRole('checkbox', { name: 'Streets' });
	const borders = page.getByRole('checkbox', { name: 'Borders' });
	const labels = page.getByRole('radiogroup', { name: 'Labels' });
	const layerIds = () =>
		page.evaluate(() => (window as unknown as MapWindow).map.getStyle()?.layers.map((l) => l.id) ?? []);
	await expect(streets).toBeChecked();
	await expect(borders).toBeChecked();
	const has = async (prefix: string) => (await layerIds()).some((id) => id.startsWith(prefix));

	// the labels and borders without the streets and their points of interest
	await streets.uncheck();
	await expect.poll(background).toStrictEqual({ base: 'satellite', streets: false });
	await expect.poll(() => has('street-')).toBe(false);
	expect(await has('poi-')).toBe(false);
	expect(await has('boundary-')).toBe(true);
	expect(await has('label-place')).toBe(true);

	// without the borders
	await borders.uncheck();
	await expect.poll(() => has('boundary-')).toBe(false);
	expect(await has('label-place')).toBe(true);

	// none of them: only the imagery and the elements, which are still drawn
	await labels.getByRole('radio', { name: 'None' }).check();
	await expect.poll(background).toStrictEqual({ base: 'satellite', streets: false, borders: false, labels: 'none' });
	await expect.poll(sources).not.toContain('versatiles-shortbread');
	expect(await sources()).toContain('satellite');
	await waitForMapIsIdle(page);
	await expect.poll(async () => (await drawnElements(page)).symbol).toStrictEqual([1]);
	// without labels, there is no font or language to set
	await expect(page.getByRole('combobox', { name: 'Language' })).toBeHidden();

	// the streets without the borders and labels
	await streets.check();
	await expect.poll(background).toStrictEqual({ base: 'satellite', borders: false, labels: 'none' });
	await expect.poll(sources).toContain('versatiles-shortbread');
	await expect.poll(async () => (await layerIds()).some((id) => id.startsWith('street-'))).toBe(true);
	expect((await layerIds()).some((id) => id.startsWith('label-place'))).toBe(false);

	// and all again
	await borders.check();
	await labels.getByRole('radio', { name: 'Normal' }).check();
	await expect.poll(background).toStrictEqual({ base: 'satellite' });
	await expect(page.getByRole('combobox', { name: 'Language' })).toBeVisible();
});

test('the size and the halo of the labels of both maps', async ({ page }) => {
	await page.goto('/#' + encodeState({ elements: [] }));
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
		.poll(async () => (await storedState(page)).meta?.background)
		.toStrictEqual({ labelSize: 1.5, haloWidth: 3 });

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
	await page.goto('/#' + encodeState({ elements: [] }));
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
	await expect.poll(background).toStrictEqual({ colors: { saturation: -1 } });
	await expect.poll(water).not.toStrictEqual(colored);
	await expect(page.getByRole('spinbutton', { name: 'Saturation' })).toHaveValue('-100');

	// the satellite imagery keeps the change, as a property of its raster layer
	await page.getByRole('radio', { name: 'Satellite' }).check();
	await expect.poll(background).toStrictEqual({ base: 'satellite', colors: { saturation: -1 } });
	await expect.poll(() => paint('satellite', 'raster-saturation')).toBe(-1);
	// darker: white becomes gray
	await page.getByRole('slider', { name: 'White becomes' }).fill('0.8');
	await expect.poll(() => paint('satellite', 'raster-brightness-max')).toBeCloseTo(0.8);
	// black is never lighter than white: it pushes white along
	await page.getByRole('spinbutton', { name: 'Black becomes' }).fill('90');
	await page.getByRole('spinbutton', { name: 'Black becomes' }).press('Enter');
	await expect(page.getByRole('spinbutton', { name: 'White becomes' })).toHaveValue('90');
	await expect.poll(async () => (await background())?.colors).toStrictEqual({ saturation: -1, black: 0.9, white: 0.9 });
	await expect.poll(() => paint('satellite', 'raster-brightness-min')).toBeCloseTo(0.9);

	// all back
	await page.getByRole('button', { name: 'Reset colors' }).click();
	await expect.poll(async () => (await background())?.colors).toBeUndefined();
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
	await page.goto('/#' + encodeState({ elements: [] }));
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

	// the imagery keeps its mid-gray from 0 to 100 %: black 50 % pushes white down to 150 %
	const hint = page.getByText('black and white move together');
	await expect(hint).toBeVisible();
	await setLevel('Black becomes', '50');
	await expect(page.getByRole('spinbutton', { name: 'White becomes' })).toHaveValue('150');
	await setLevel('Black becomes', '-100');
	await setLevel('White becomes', '200');

	// the same on the vector map: its labels become black, but their edges stay mixed with their halo
	await page.getByRole('radio', { name: 'OpenStreetMap' }).check();
	await waitForMapIsIdle(page);
	await expect(page.getByRole('spinbutton', { name: 'Black becomes' })).toHaveValue('-100');
	await expect.poll(async () => (await channelRange(page))[0]).toBeLessThan(darkest / 2);
	expect((await channelRange(page))[1]).toBe(255);
});

test('the labels of the background map over areas and lines, those of markers always on top', async ({ page }) => {
	await page.goto('/#' + encodeState({ elements: [] }));
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
	await expect.poll(async () => (await storedState(page)).meta?.background?.labelsOnTop).toBe(true);

	// kept in the map, and by a new background map
	await page.reload();
	await waitForMapIsReady(page);
	await expect(checkbox).toBeChecked();
	await expect.poll(order).toStrictEqual({ fill: -1, stroke: -1, symbol: 1 });
	await page.getByRole('radio', { name: 'Satellite' }).check();
	await expect.poll(async () => (await storedState(page)).meta?.background?.base).toBe('satellite');
	await waitForMapIsIdle(page);
	await expect.poll(order).toStrictEqual({ fill: -1, stroke: -1, symbol: 1 });

	// under them again
	await checkbox.uncheck();
	await expect.poll(order).toStrictEqual({ fill: 1, stroke: 1, symbol: 1 });
	await expect.poll(async () => (await storedState(page)).meta?.background?.labelsOnTop).toBeUndefined();
});

/**
 * What the layers of the elements draw, from the bottom up, e.g. "3 fill", "4 symbol", "4 label":
 * the parts of the elements by their index, read from the layers of the map and their features.
 * The layers of markers draw all their symbols before all their labels.
 */
function drawnParts(page: Page): Promise<string[]> {
	return page.evaluate(async () => {
		const map = (window as unknown as MapWindow).map;
		const features = async (source: string) =>
			((await map.getSource<GeoJSONSource>(source)!.getData()) as GeoJSON.FeatureCollection).features;
		const sources = {
			fill: await features('elements_fill'),
			stroke: await features('elements_stroke'),
			symbol: await features('elements_symbol')
		};
		const parts: string[] = [];
		for (const id of map.getLayersOrder()) {
			const role = /^elements_(fill|stroke|symbol)(_\d+)?$/.exec(id)?.[1] as keyof typeof sources | undefined;
			const drawn = (
				role ? sources[role].filter((f) => f.properties?.layer === id) : id === 'elements_labels' ? sources.symbol : []
			)
				.map((f) => f.properties!)
				.sort((a, b) => a.order - b.order);
			if (role && role !== 'symbol') parts.push(...drawn.map((p) => `${p.order} ${role}`));
			if (role === 'symbol') parts.push(...drawn.map((p) => `${p.order} symbol`));
			// the labels, unless the layer draws none
			if (map.getLayer(id)?.type === 'symbol' && map.getLayoutProperty(id, 'text-field') !== '') {
				parts.push(...drawn.filter((p) => p.label).map((p) => `${p.order} label`));
			}
		}
		return parts;
	});
}

// The layers of the elements draw exactly what one layer per element would, in the same order
test('the layers of the elements draw them in their order', async ({ page }) => {
	// a random map of all kinds of elements, overlapping, the same each run
	let seed = 7;
	const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
	const at = (): [number, number] => [13.39 + random() * 0.02, 52.495 + random() * 0.01];
	const kinds: (() => MapState['elements'][number])[] = [
		() => ({ type: 'marker', point: at() }),
		() => ({ type: 'marker', point: at(), label: 'Label' }),
		() => ({ type: 'polygon', points: [at(), at(), at()] }),
		() => ({ type: 'polygon', points: [at(), at(), at()], outlineStyle: { visible: false } }),
		() => ({ type: 'circle', point: at(), radius: 200 }),
		() => ({ type: 'line', points: [at(), at()] })
	];
	const elements = Array.from({ length: 40 }, () => kinds[Math.floor(random() * kinds.length)]());
	/** What one layer per element draws: each one's area, outline or line, symbol, label. */
	const reference = (markersOnTop: boolean) => {
		const parts = (e: MapState['elements'][number], i: number) =>
			e.type === 'marker'
				? [`${i} symbol`, ...(e.type === 'marker' && e.label ? [`${i} label`] : [])]
				: [
						...(e.type === 'line' ? [] : [`${i} fill`]),
						...('outlineStyle' in e && e.outlineStyle?.visible === false ? [] : [`${i} stroke`])
					];
		if (!markersOnTop) return elements.flatMap(parts);
		return [
			...elements.flatMap((e, i) => (e.type === 'marker' ? [] : parts(e, i))),
			...elements.flatMap((e, i) => (e.type === 'marker' ? parts(e, i) : []))
		];
	};
	await page.goto('/#' + encodeState({ elements }));
	await waitForMapIsReady(page);
	expect(await drawnParts(page)).toStrictEqual(reference(false));

	// with the labels of the background map over areas and lines: the markers over all of them
	const checkbox = page.getByRole('checkbox', { name: 'Over areas and lines' });
	await checkbox.check();
	await expect.poll(() => drawnParts(page)).toStrictEqual(reference(true));
	await checkbox.uncheck();
	await expect.poll(() => drawnParts(page)).toStrictEqual(reference(false));
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
	// with the opacity that the fill had: the translucent default of an area
	await expect.poll(async () => (await polygon()).style?.color?.toLowerCase()).toBe('#0072b240');
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
	// JSON with comments, like the default file
	await page.route('**/map-editor.config.jsonc', (route) =>
		route.fulfill({
			body: `{
				// the corporate identity
				"colorSchemes": [{ "id": "ci", "name": "Corporate", "colors": ["#003366", "#e30613", "#f5a800"] }],
				"replaceDefaultSchemes": true, /* only them */
				"fonts": ["lato_bold"],
			}`
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
	const settings = page.getByRole('region', { name: 'Background labels' });
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
	await expect.poll(async () => (await storedState(page)).meta?.background).toMatchObject({ font: 'lato_bold' });

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
