import { expect, test } from './lib/test.js';
import { encodeState, type MapState } from '../packages/map-state/src/index.js';
import {
	drawnElements,
	project,
	stateInUrl,
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
	const background = () => stateInUrl(page).meta?.background;
	const [x, y] = await project(page, [13.36, 52.48]);
	await page.mouse.click(x, y);
	const before = await mapContent();
	// a polygon (fill and outline) and a marker
	expect(before).toStrictEqual({ drawn: [1, 1, 1], patterns: 1, selectionNodes: 6, satellite: false });

	await page.getByRole('button', { name: 'Background map' }).click();
	await page.getByRole('combobox', { name: 'Theme' }).selectOption('Gray');
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'osm', options: { theme: 'gray', text: { language: 'user' } } });
	// the elements, their patterns and the selection survive the new style
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual(before);

	await page.getByRole('combobox', { name: 'Language' }).selectOption('German');
	await page.getByRole('combobox', { name: 'Labels' }).selectOption('Fewer');
	await page.getByRole('combobox', { name: 'Base map' }).selectOption('Satellite');
	// the colors of the vector map do not apply to the satellite map, the labels are kept
	await expect
		.poll(background)
		.toStrictEqual({ builder: 'satellite', options: { osmOverlay: { text: { language: 'de', spacing: 2 } } } });
	await expect(page.getByRole('combobox', { name: 'Theme' })).toBeHidden();
	await waitForMapIsIdle(page);
	await expect.poll(mapContent).toStrictEqual({ ...before, satellite: true });

	// undoable: back to the gray map with fewer German labels
	const undone = { builder: 'osm', options: { theme: 'gray', text: { language: 'de', spacing: 2 } } };
	await page.getByRole('button', { name: 'Undo' }).click();
	// the URL is written throttled, so wait for the final state before reloading
	await expect.poll(background).toStrictEqual(undone);
	await expect(page.getByRole('combobox', { name: 'Base map' })).toHaveValue('vector');

	// kept in the URL, and shown in the read-only viewer
	await page.setViewportSize({ width: 500, height: 500 });
	await page.reload();
	await waitForMapIsReady(page);
	await expect(page.getByText('Open this page on a larger screen')).toBeVisible();
	expect(background()).toStrictEqual(undone);
	const labelsInGerman = () =>
		page.evaluate(() => JSON.stringify((window as unknown as MapWindow).map.getStyle()?.layers).includes('name_de'));
	await expect.poll(labelsInGerman).toBe(true);
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
	const legendInUrl = () => {
		const legend = stateInUrl(page).meta?.legend;
		return legend && { ...legend, entries: legend.entries.map((e) => ({ ...e, color: e.color.toLowerCase() })) };
	};
	const overlay = page.getByRole('list', { name: 'Legend' });

	// a new entry starts with a color of the map
	await page.getByRole('button', { name: 'Legend', exact: true }).click();
	await page.getByRole('button', { name: 'Add legend entry' }).click();
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
	await page.getByRole('button', { name: 'cafe', exact: true }).click();

	await page.getByRole('combobox', { name: 'Position' }).selectOption('Top right');
	await page.getByRole('combobox', { name: 'Layout' }).selectOption('Horizontal');
	await expect.poll(legendInUrl).toMatchObject({
		position: 'top-right',
		layout: 'horizontal',
		entries: [
			{ color: '#00aa00', label: 'Park' },
			{ color: '#0000ff', label: 'Cafe', symbol: expect.any(Number) }
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

	// without entries, there is no legend
	await page.getByRole('button', { name: 'Legend', exact: true }).click();
	await page.getByRole('button', { name: 'Remove entry 2' }).click();
	await page.getByRole('button', { name: 'Remove entry 1' }).click();
	await expect(overlay).toBeHidden();
	await expect.poll(legendInUrl).toBeUndefined();
	expect(pageErrors).toStrictEqual([]);
});

test('choosing a color scheme', async ({ page }) => {
	await page.goto('/');
	await waitForMapIsReady(page);
	await page.getByRole('button', { name: 'Polygon' }).click();
	const [fillColor, strokeColor] = await page.getByLabel('Color').all();
	const swatches = (name: string) =>
		page
			.getByRole('group', { name })
			.getByRole('button')
			.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label')));
	const polygon = () => stateInUrl(page).elements[0] as { style?: { color?: string } };

	// the default scheme is offered, and not stored
	await fillColor.click();
	const scheme = page.getByRole('combobox', { name: 'Color scheme' });
	await expect(scheme).toHaveValue('bright');
	expect((await swatches('Bright (colorblind-safe)')).length).toBe(7);

	// another scheme, and one of its colors
	await scheme.selectOption('Okabe-Ito (colorblind-safe)');
	await expect.poll(() => stateInUrl(page).meta?.colorScheme).toBe('okabe-ito');
	await page
		.getByRole('group', { name: 'Okabe-Ito (colorblind-safe)' })
		.getByRole('button', { name: '#0072b2' })
		.click();
	await expect.poll(() => polygon().style?.color?.toLowerCase()).toBe('#0072b2');
	await page.keyboard.press('Escape');

	// the scheme belongs to the map, so every color picker offers it
	await strokeColor.click();
	await expect(page.getByRole('combobox', { name: 'Color scheme' })).toHaveValue('okabe-ito');
	await page.keyboard.press('Escape');

	// undo reverts the color, then the scheme
	await page.getByRole('button', { name: 'Undo' }).click();
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => stateInUrl(page).meta?.colorScheme).toBeUndefined();
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
	await page.getByRole('button', { name: 'Marker' }).click();
	await page.getByLabel('Color').first().click();
	const scheme = page.getByRole('combobox', { name: 'Color scheme' });
	await expect(scheme.getByRole('option')).toHaveText(['Corporate']);
	await expect(page.getByRole('group', { name: 'Corporate' }).getByRole('button')).toHaveCount(3);
	await page.keyboard.press('Escape');

	// the configured font comes first, with its name from the tile server
	await page.getByRole('button', { name: 'Background map' }).click();
	const font = page.getByRole('combobox', { name: 'Font' });
	await expect(font.getByRole('option').first()).toHaveText('Lato Bold');

	// marker labels use the font of the map
	await expect.poll(symbolFont).toStrictEqual(['literal', ['noto_sans_regular']]);
	await font.selectOption('Lato Bold');
	await expect.poll(symbolFont).toStrictEqual(['literal', ['lato_bold']]);
	await expect.poll(() => stateInUrl(page).meta?.background?.options).toMatchObject({ text: { font: 'lato_bold' } });

	// the legend has a generic font of its own
	await page.getByRole('button', { name: 'Legend', exact: true }).click();
	await page.getByRole('button', { name: 'Add legend entry' }).click();
	await page.getByRole('combobox', { name: 'Font' }).last().selectOption('Serif');
	await expect(page.getByRole('list', { name: 'Legend' })).toHaveCSS('font-family', 'serif');
	await expect.poll(() => stateInUrl(page).meta?.legend?.font).toBe('serif');
});
