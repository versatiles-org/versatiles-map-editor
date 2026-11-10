import { readdirSync, readFileSync } from 'fs';
import type { Page } from '@playwright/test';
import { expect, test } from './lib/test.js';
import {
	decodeState,
	encodeState,
	stateFromMapJSON,
	type MapState,
	type StateElement
} from '../packages/map-state/src/index.js';
import { buildMapStyle, fetchSymbolCatalog, type FetchJSON } from '../packages/map-state/src/maplibre/index.js';
import { waitForMapIsReady, type MapWindow } from './lib/utils.js';

// The style that a server builds of a map without a browser, `buildMapStyle`, against the style
// that the viewer draws: the same layers of the elements, in the same order between the same
// layers of the background map, with the same features.

const TILES = 'https://tiles.versatiles.org';

/** A fetch through the page, so it uses the cache of the tests' requests. */
function fetchInPage(page: Page): FetchJSON {
	return async (url) => {
		const { ok, status, body } = await page.evaluate(async (url) => {
			const response = await fetch(url);
			return { ok: response.ok, status: response.status, body: response.ok ? await response.json() : null };
		}, url);
		return { ok, status, json: async () => body };
	};
}

/**
 * The maps to compare: the examples, and what they do not have: more layers than `MAX_LAYERS`
 * (one layer of labels over all markers), and flat markers with labels hidden where they overlap.
 */
function maps(): [string, MapState][] {
	const examples = readdirSync('examples')
		.filter((name) => name.endsWith('.mapjson'))
		.map((file): [string, MapState] => [file, stateFromMapJSON(JSON.parse(readFileSync(`examples/${file}`, 'utf8')))]);
	const many: StateElement[] = Array.from({ length: 200 }, (_, i): StateElement[] => [
		{
			type: 'line',
			points: [
				[13 + i / 100, 52],
				[13 + i / 100, 52.5]
			]
		},
		{ type: 'marker', point: [13 + i / 100, 52.5], label: `${i}`, style: i % 3 === 0 ? { flat: true } : {} }
	]).flat();
	const flat: MapState = {
		meta: { labels: { overlap: 'hide', minZoom: 8 } },
		elements: [
			{ type: 'marker', point: [13.4, 52.5], label: 'Flat', style: { flat: true, labelFont: 'noto_sans_bold' } },
			{ type: 'marker', point: [13.41, 52.5], label: 'Upright' }
		]
	};
	return [...examples, ['more layers than MAX_LAYERS', { elements: many }], ['flat markers', flat]];
}

type Layer = { id: string; source?: string } & Record<string, unknown>;
type Feature = { id?: unknown; geometry: unknown; properties: Record<string, unknown> };

test('a server builds the style of a map as the viewer draws it', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/view/');
	await waitForMapIsReady(page);
	const symbols = await fetchSymbolCatalog({ tileServer: TILES, fetch: fetchInPage(page) });
	for (const [file, map] of maps()) {
		await test.step(file, async () => {
			// the map as the link has it, which rounds e.g. coordinates
			const link = encodeState(map);
			const state = decodeState(link);
			await page.goto('about:blank');
			await page.goto('/view/#' + link);
			await waitForMapIsReady(page);
			const shown = await page.evaluate(() => {
				const style = (window as unknown as MapWindow).map.getStyle();
				const sources = Object.fromEntries(
					Object.entries(style.sources)
						.filter(([id]) => id.startsWith('elements_'))
						.map(([id, source]) => [
							id,
							((source as { data: { features: unknown[] } }).data ?? { features: [] }).features
						])
				);
				return { layers: style.layers as unknown as Layer[], sources };
			});
			// the language of the browser, as the viewer has it
			const { style } = buildMapStyle(state, symbols, { tileServer: TILES, language: 'user' });
			const built = style.layers as unknown as Layer[];
			const ids = new Set(built.map((layer) => layer.id));
			// the map with too many layers draws the labels in layers of their own
			if (!file.endsWith('.mapjson') && state.elements.length > 100)
				expect([...ids]).toEqual(expect.arrayContaining(['elements_labels', 'elements_labels_flat']));
			// the layers of both in the same order, without the viewer's own (e.g. the highlight) and
			// the first layers of roles that draw nothing, which every style of the viewer has
			expect(shown.layers.map((layer) => layer.id).filter((id) => ids.has(id))).toStrictEqual(
				built.map((layer) => layer.id)
			);
			const byId = new Map(shown.layers.map((layer) => [layer.id, layer]));
			for (const layer of built.filter(({ id }) => id.startsWith('elements_'))) {
				expect(byId.get(layer.id), `${file}: ${layer.id}`).toStrictEqual(layer);
			}
			// the same features, whose ids are the editor's own
			for (const [id, source] of Object.entries(style.sources).filter(([id]) => id.startsWith('elements_'))) {
				// numbers to 1e-6: the browser's Math.tan and the like may differ from Node's in the last digit,
				// which e.g. the turn of an arrowhead on a nearly straight line makes larger
				const round = (value: unknown): unknown =>
					Array.isArray(value)
						? value.map(round)
						: typeof value === 'number'
							? Math.round(value * 1e6) / 1e6
							: value !== null && typeof value === 'object'
								? Object.fromEntries(Object.entries(value).map(([key, v]) => [key, round(v)]))
								: value;
				const strip = (features: Feature[]) =>
					features.map(({ geometry, properties }) => round({ geometry, properties }));
				const own = (source as { data: { features: Feature[] } }).data.features;
				expect(strip(shown.sources[id] as Feature[]), `${file}: ${id}`).toStrictEqual(strip(own));
			}
		});
	}
});
