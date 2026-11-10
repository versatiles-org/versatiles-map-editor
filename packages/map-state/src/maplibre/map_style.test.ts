import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { validateStyleMin, type StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { stateFromMapJSON } from '../mapjson.js';
import type { MapState, StateElement } from '../types.js';
import { mapCamera } from './camera.js';
import { ELEMENT_LAYERS, LABELS_LAYER, MAX_LAYERS } from './element_layers.js';
import { buildMapStyle, mapStyle } from './map_style.js';
import type { FetchJSON, SymbolCatalog } from './symbols.js';

// the real inlineSources, not the one of the setup, which keeps the style: the tests pass a fetch of their own
vi.mock('@versatiles/style', async (importOriginal) => importOriginal());

const TILES = 'https://tiles.versatiles.org';
/** The sprite sheets of the tile server, without the sizes of their symbols, which then have 32 × 32 pixels. */
const catalog: SymbolCatalog = { sheets: ['base', 'extras', 'icons'], symbols: [] };
const options = { tileServer: TILES, language: 'en' };

/** The maps to draw: the examples of the editor, and the frozen samples of .mapjson files, one with every style field. */
function maps(): [string, MapState][] {
	// the tests run in the root of the repository
	const samples = 'packages/map-state/src/__fixtures__/frozen/files-1';
	const all = readdirSync(samples).map((file): [string, MapState] => [
		file,
		JSON.parse(readFileSync(`${samples}/${file}`, 'utf8')).state
	]);
	if (existsSync('examples')) {
		for (const file of readdirSync('examples').filter((name) => name.endsWith('.mapjson'))) {
			all.push([file, stateFromMapJSON(JSON.parse(readFileSync(`examples/${file}`, 'utf8')))]);
		}
	}
	return all;
}

type Features = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

/** The features of the elements in the source of a role. */
function featuresOf(style: StyleSpecification, source: string): Features['features'] {
	return ((style.sources[source] as { data: Features }).data as Features).features;
}

/** The ids of the layers of the elements, in drawing order. */
function elementLayers(style: StyleSpecification): string[] {
	return style.layers.map((layer) => layer.id).filter((id) => id.startsWith('elements_'));
}

describe('buildMapStyle', () => {
	it('gives a valid style for every example and sample, with every image that it uses', () => {
		const all = maps();
		expect(all.length).toBeGreaterThan(10);
		for (const [name, state] of all) {
			const { style, images } = buildMapStyle(state, catalog, options);
			expect(validateStyleMin(style as StyleSpecification), name).toStrictEqual([]);
			const ids = new Set(images.map((image) => image.id));
			for (const { properties } of featuresOf(style as StyleSpecification, ELEMENT_LAYERS.fill))
				expect(ids, name).toContain(properties.pattern);
			for (const { properties } of featuresOf(style as StyleSpecification, ELEMENT_LAYERS.arrow))
				expect(ids, name).toContain(properties.icon);
			// the symbols of markers are in the sprite sheets
			const sheets = (style.sprite as { id: string }[]).map((sprite) => sprite.id);
			for (const { properties } of featuresOf(style as StyleSpecification, ELEMENT_LAYERS.symbol)) {
				if (properties.icon) expect(sheets, name).toContain(String(properties.icon).split(':')[0]);
			}
			// every feature is drawn by a layer of the style
			const layers = new Set(style.layers.map((layer) => layer.id));
			for (const source of Object.values(ELEMENT_LAYERS)) {
				for (const { properties } of featuresOf(style as StyleSpecification, source))
					expect(layers, name).toContain(properties.layer);
			}
			// each image once, with its pixels
			expect(ids.size).toBe(images.length);
			for (const image of images) expect(image.data.length).toBe(image.width * image.height * 4);
		}
	});

	it('draws the elements over the background map, in their order, with the sprite sheets of the tile server', () => {
		const state: MapState = {
			elements: [
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					]
				},
				{ type: 'marker', point: [0.5, 0.5], label: 'A' },
				{
					type: 'line',
					points: [
						[0, 0],
						[1, 1]
					],
					style: { arrowEnd: 'triangle' }
				}
			]
		};
		const { style, images } = buildMapStyle(state, catalog, options);
		expect(style.sprite).toStrictEqual([
			{ id: 'base', url: `${TILES}/assets/sprites/base` },
			{ id: 'extras', url: `${TILES}/assets/sprites/extras` },
			{ id: 'icons', url: `${TILES}/assets/sprites/icons` }
		]);
		expect(elementLayers(style as StyleSpecification)).toStrictEqual([
			'elements_fill',
			'elements_stroke',
			'elements_symbol',
			'elements_stroke_1',
			'elements_arrows'
		]);
		// the background map is under them
		const ids = style.layers.map((layer) => layer.id);
		expect(ids.indexOf('elements_fill')).toBeGreaterThan(ids.length - 6);
		expect(images.map((image) => image.id)).toStrictEqual([
			'fill-pattern:solid:1:1:#ff0000',
			expect.stringMatching(/^arrow-triangle/)
		]);
		const [fill] = featuresOf(style as StyleSpecification, ELEMENT_LAYERS.fill);
		expect(fill.properties).toMatchObject({ order: 0, layer: 'elements_fill' });
		const [arrow] = featuresOf(style as StyleSpecification, ELEMENT_LAYERS.arrow);
		expect(arrow).toMatchObject({ id: 5, properties: { order: 2, layer: 'elements_arrows' } });
	});

	it('draws the labels of markers as the map says: in their fonts, from a zoom level, hidden where they overlap', () => {
		const state: MapState = {
			meta: { labels: { overlap: 'hide', minZoom: 10 }, background: { font: 'lato_regular' } },
			elements: [
				{ type: 'marker', point: [0, 0], label: 'A' },
				{ type: 'marker', point: [1, 1], label: 'B', style: { labelFont: 'noto_sans_bold' } }
			]
		};
		const layer = buildMapStyle(state, catalog, options).style.layers.find((l) => l.id === ELEMENT_LAYERS.symbol);
		expect((layer as { layout: Record<string, unknown> }).layout).toMatchObject({
			'text-field': ['step', ['zoom'], '', 10, ['get', 'label']],
			'text-overlap': 'never',
			'text-optional': true,
			'text-font': [
				'match',
				['get', 'font'],
				'noto_sans_bold',
				['literal', ['noto_sans_bold']],
				['literal', ['lato_regular']]
			]
		});
	});

	it('draws the areas and lines under the labels of the background map if they are on top', () => {
		const state: MapState = {
			meta: { background: { labelsOnTop: true } },
			elements: [
				{ type: 'marker', point: [0.5, 0.5] },
				{
					type: 'polygon',
					points: [
						[0, 0],
						[1, 0],
						[1, 1]
					]
				}
			]
		};
		const { style } = buildMapStyle(state, catalog, options);
		const ids = style.layers.map((layer) => layer.id);
		const firstLabel = style.layers.findIndex((layer) => layer.type === 'symbol' && !layer.id.startsWith('elements_'));
		expect(ids.indexOf('elements_fill')).toBeLessThan(firstLabel);
		expect(ids.indexOf('elements_stroke')).toBeLessThan(firstLabel);
		// the markers over everything
		expect(ids.at(-1)).toBe('elements_symbol');
	});

	it('draws the labels of many markers in one layer over them, as the viewer does', () => {
		// a line and a labeled marker in turn: more layers than MAX_LAYERS
		const elements: StateElement[] = Array.from({ length: MAX_LAYERS }, (_, i): StateElement[] => [
			{
				type: 'line',
				points: [
					[i, 0],
					[i, 1]
				]
			},
			{ type: 'marker', point: [i, 0], label: `${i}` }
		]).flat();
		const { style } = buildMapStyle({ elements }, catalog, options);
		expect(validateStyleMin(style as StyleSpecification)).toStrictEqual([]);
		const layers = style.layers.filter((layer) => layer.id.startsWith('elements_'));
		expect(layers.length).toBeLessThanOrEqual(MAX_LAYERS);
		expect(layers.at(-1)?.id).toBe(LABELS_LAYER);
		const markers = layers.find((layer) => layer.id === ELEMENT_LAYERS.symbol) as { layout: Record<string, unknown> };
		expect(markers.layout['text-field']).toBe('');
	});

	it('knows where the viewer looks', () => {
		const state: MapState = { frame: { bounds: [13.3, 52.45, 13.5, 52.55], pitch: 30 }, elements: [] };
		const size = { width: 1200, height: 630 };
		expect(buildMapStyle(state, catalog, options).camera(size)).toStrictEqual(mapCamera(state, size));
	});
});

describe('mapStyle', () => {
	/** A tile server: its sprite sheets, and the TileJSON of its tiles, without the landcover ones if `landcover` is false. */
	function tileServer(landcover = true) {
		const json = (body: unknown, ok = true) =>
			Promise.resolve({ ok, status: ok ? 200 : 404, json: () => Promise.resolve(body) });
		return vi.fn((url: string) => {
			const path = url.replace(TILES, '');
			if (path === '/assets/sprites/index.json') return json(['base', 'icons']);
			if (path === '/assets/sprites/icons.json')
				return json({ pin: { sdf: true, width: 64, height: 76, pixelRatio: 2, center: [0.5, 1] } });
			if (path === '/assets/sprites/base.json') return json({});
			const tileset = path.match(/^\/tiles\/([\w-]+)\/tiles\.json$/)?.[1];
			if (!tileset || (!landcover && tileset === 'landcover-vector')) return json({}, false);
			const vector = tileset.endsWith('-vector');
			return json({
				tilejson: '3.0.0',
				tiles: [`/tiles/${tileset}/{z}/{x}/{y}`],
				...(vector ? { vector_layers: [{ id: 'water', fields: {} }] } : {})
			});
		});
	}

	it('loads the symbols and the TileJSON of the tile server', async () => {
		const fetch = tileServer();
		const state: MapState = { elements: [{ type: 'marker', point: [0, 0], style: { symbol: 'icons:pin' } }] };
		const { style } = await mapStyle(state, { ...options, fetch: fetch as unknown as FetchJSON });
		expect(fetch).toHaveBeenCalledWith(`${TILES}/assets/sprites/index.json`);
		const source = style.sources['versatiles-shortbread'] as { url?: string; tiles?: string[] };
		expect(source.url).toBeUndefined();
		expect(source.tiles?.[0]).toMatch(/osm-vector/);
		// the size and anchor of the symbol: a pin with its label beside its head
		const [marker] = featuresOf(style as StyleSpecification, ELEMENT_LAYERS.symbol);
		expect(marker.properties).toMatchObject({ icon: 'icons:pin', anchor: 'bottom' });
	});

	it('takes symbols that are loaded already, and leaves out the landcover of a server without it', async () => {
		const fetch = tileServer(false);
		const onWarning = vi.fn();
		const { style } = await mapStyle(
			{ elements: [] },
			{ ...options, fetch: fetch as unknown as FetchJSON, symbols: catalog, onWarning }
		);
		expect(fetch).not.toHaveBeenCalledWith(`${TILES}/assets/sprites/index.json`);
		expect(style.sources).not.toHaveProperty('versatiles-landcover');
		expect(onWarning).toHaveBeenCalledWith(expect.stringContaining('landcover'));
	});
});
