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

	// the dark theme of the same color preset: a dark background, and light again
	const mode = page.getByRole('radiogroup', { name: 'Mode' });
	// the mean of the channels of the background color, e.g. "rgb(39,39,39)", from 0 to 255
	const lightness = () =>
		page.evaluate(() => {
			const map = (window as unknown as MapWindow).map;
			const layer = map.getStyle()?.layers.find((l) => l.type === 'background');
			const color = layer && String(map.getPaintProperty(layer.id, 'background-color'));
			const channels = color?.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
			return channels.reduce((sum, value) => sum + value, 0) / channels.length;
		});
	await mode.getByRole('radio', { name: 'Dark' }).check();
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'osm', options: { theme: 'gray-dark', text: { language: 'user' } } });
	await expect.poll(lightness).toBeLessThan(80);
	await mode.getByRole('radio', { name: 'Light' }).check();
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'osm', options: { theme: 'gray', text: { language: 'user' } } });
	await expect.poll(lightness).toBeGreaterThan(180);
	await waitForMapIsIdle(page);

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

test('a font for the label of each marker, else the one of the background map', async ({ page }) => {
	const a: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				map: { center: a, radius: 10000 },
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
		() => ({ type: 'marker', point: at(), style: { label: 'Label' } }),
		() => ({ type: 'polygon', points: [at(), at(), at()] }),
		() => ({ type: 'polygon', points: [at(), at(), at()], strokeStyle: { visible: false } }),
		() => ({ type: 'circle', point: at(), radius: 200 }),
		() => ({ type: 'line', points: [at(), at()] })
	];
	const elements = Array.from({ length: 40 }, () => kinds[Math.floor(random() * kinds.length)]());
	/** What one layer per element draws: each one's area, outline or line, symbol, label. */
	const reference = (markersOnTop: boolean) => {
		const parts = (e: MapState['elements'][number], i: number) =>
			e.type === 'marker'
				? [`${i} symbol`, ...(e.style?.label ? [`${i} label`] : [])]
				: [
						...(e.type === 'line' ? [] : [`${i} fill`]),
						...('strokeStyle' in e && e.strokeStyle?.visible === false ? [] : [`${i} stroke`])
					];
		if (!markersOnTop) return elements.flatMap(parts);
		return [
			...elements.flatMap((e, i) => (e.type === 'marker' ? [] : parts(e, i))),
			...elements.flatMap((e, i) => (e.type === 'marker' ? parts(e, i) : []))
		];
	};
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 2000 }, elements }));
	await waitForMapIsReady(page);
	expect(await drawnParts(page)).toStrictEqual(reference(false));

	// with the labels of the background map over areas and lines: the markers over all of them
	const checkbox = page.getByRole('checkbox', { name: 'Over areas and lines' });
	await checkbox.check();
	await expect.poll(() => drawnParts(page)).toStrictEqual(reference(true));
	await checkbox.uncheck();
	await expect.poll(() => drawnParts(page)).toStrictEqual(reference(false));
});

test('rearranging the entries of the legend', { tag: '@cross-browser' }, async ({ page }) => {
	// tall enough for all entries in the sidebar, for the mouse to reach them
	await page.setViewportSize({ width: 1280, height: 1600 });
	const entries = ['A', 'B', 'C'].map((label) => ({ type: 'polygon' as const, style: { color: '#ff0000' }, label }));
	await page.goto(
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, meta: { legend: { entries } }, elements: [] })
	);
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

test('the entries of the legend are closed, and open to edit them', async ({ page }) => {
	const entries = ['A', 'B'].map((label) => ({ type: 'polygon' as const, style: { color: '#ff0000' }, label }));
	await page.goto(
		'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, meta: { legend: { entries } }, elements: [] })
	);
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
	await expect(page.locator('.sidebar').getByRole('heading', { level: 2 })).toHaveText('Legend');
	await expect(details(2)).toBeVisible();
	await expect(details(1)).toBeHidden();
});

test(
	'legend entries show a marker, a line or an area, styled like elements',
	{ tag: '@cross-browser' },
	async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 1100 });
		const entries = [{ type: 'marker' as const, style: { color: '#0000ff' }, label: 'A' }];
		await page.goto(
			'/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, meta: { legend: { entries } }, elements: [] })
		);
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
		await entry.getByRole('radio', { name: 'dotted' }).check();
		await expect.poll(stored).toStrictEqual({ type: 'line', style: { color: '#0000ff', pattern: 2 }, label: 'A' });
		// dots, with gaps between them
		await expect.poll(inked).toBeLessThan(solid * 0.8);
		await entry.getByRole('spinbutton', { name: 'Width' }).fill('3');
		await entry.getByRole('spinbutton', { name: 'Width' }).press('Enter');
		await expect.poll(async () => (await stored())?.style?.width).toBe(3);

		// an area without an outline, then with one in the color of the fill
		await entry.getByRole('radio', { name: 'Area' }).check();
		await expect
			.poll(stored)
			.toStrictEqual({ type: 'polygon', style: { color: '#0000ff' }, strokeStyle: { visible: false }, label: 'A' });
		await entry.getByRole('radio', { name: 'diagonal', exact: true }).check();
		await entry.getByRole('checkbox', { name: 'Outline' }).check();
		await expect.poll(stored).toStrictEqual({
			type: 'polygon',
			style: { color: '#0000ff', pattern: 1 },
			strokeStyle: { color: '#0000ff' },
			label: 'A'
		});
		await expect(entry.getByRole('button', { name: /^Outline color/ })).toBeVisible();

		// each change is one undo step: the outline is gone again
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(async () => (await stored())?.strokeStyle).toStrictEqual({ visible: false });
	}
);

test('adding the look of an element to the legend', async ({ page }) => {
	const route = {
		type: 'line' as const,
		points: [
			[13.39, 52.5],
			[13.41, 52.5]
		] as [number, number][]
	};
	const elements = [{ ...route, style: { color: '#d55e00', pattern: 1, width: 4 } }];
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, elements }));
	await waitForMapIsReady(page);
	await page.keyboard.press('e');
	await page.getByRole('listbox', { name: 'Elements' }).getByRole('option').first().click();
	const panel = page.locator('.sidebar');
	await panel.getByRole('textbox', { name: 'Popup' }).fill('Bus 100');
	await panel.getByRole('textbox', { name: 'Popup' }).blur();

	await panel.getByRole('button', { name: 'Add to legend' }).click();
	await expect(panel.getByRole('region', { name: 'Legend' }).getByRole('status')).toHaveText(
		'Added an entry to the legend.'
	);
	await expect
		.poll(async () => (await storedState(page)).meta?.legend?.entries)
		.toStrictEqual([{ type: 'line', style: { color: '#d55e00', pattern: 1, width: 4 }, label: 'Bus 100' }]);
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
	const elements = [{ type: 'line' as const, points, style: { color: '#d55e00', pattern: 1, width: 4 } }];
	await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, meta: { legend }, elements }));
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
		.toStrictEqual([{ type: 'line', style: { color: '#d55e00', pattern: 1, width: 4 }, label: 'Route' }]);
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
		const elements = [
			{ type: 'polygon' as const, points, style: { color: '#00ff004d', pattern: 1 }, strokeStyle: { color: '#00aa00' } }
		];
		await page.goto('/#' + encodeState({ map: { center: [13.4, 52.5], radius: 3000 }, meta: { legend }, elements }));
		await waitForMapIsReady(page);
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
			type: 'polygon',
			style: { color: '#00ff004d', pattern: 1 },
			strokeStyle: { color: '#00aa00' },
			label: 'Park'
		});
		await expect(take).toHaveAttribute('aria-pressed', 'false');
		await expect.poll(highlighted).toBe(0);
		await expect(page.locator('.sidebar').getByRole('heading', { level: 2 })).toHaveText('Legend');

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
	await expect(page.locator('.sidebar').getByRole('heading', { level: 2 })).toHaveText('Legend');
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
			// a new entry is an area without an outline, one with a symbol a marker
			{ type: 'polygon', style: { color: '#00aa00' }, strokeStyle: { visible: false }, label: 'Park' },
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
	const inspectorTitle = page.locator('.sidebar').getByRole('heading', { level: 2 });
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

test('labels of markers: overlapping ones hidden, and shown from a zoom level', async ({ page }) => {
	const center: [number, number] = [13.4, 52.5];
	await page.goto(
		'/#' +
			encodeState({
				map: { center, radius: 10000 },
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
