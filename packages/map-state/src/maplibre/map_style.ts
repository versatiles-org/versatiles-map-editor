/**
 * The whole map as a MapLibre style: the background map and the layers of the elements with their
 * features, the images that the style uses beyond the sprites, and where the map looks. What a
 * renderer needs to draw the map as the viewer shows it, without a browser, e.g. for a preview
 * image of a shared map.
 */
import type { LayerSpecification, SourceSpecification } from '@maplibre/maplibre-gl-style-spec';
import { inlineSources, type StyleSpecification } from '@versatiles/style';
import type { MapState } from '../types.js';
import { arrowImageOf } from './arrow_heads.js';
import { backgroundSettings, backgroundStyle, type BackgroundStyleOptions } from './background.js';
import { mapCamera, type MapCamera } from './camera.js';
import {
	ELEMENT_LAYERS,
	ELEMENT_ROLES,
	elementLayer,
	labelFont,
	labelLayout,
	labelSortKey,
	labelsLayer,
	planLayers,
	symbolAlignment,
	type Drawn,
	type LabelOptions
} from './element_layers.js';
import { elementFeatures, type ElementFeature, type ElementRole } from './features.js';
import { patternImageOf } from './fill_patterns.js';
import { fetchSymbolCatalog, spriteSheets, symbolLookup, type FetchJSON, type SymbolCatalog } from './symbols.js';
import type { StyleImage } from './types.js';

/** An image that the style uses and the sprites do not have, with its id: the arguments of MapLibre's `map.addImage`. */
export interface MapStyleImage extends StyleImage {
	id: string;
}

/** A map as MapLibre draws it, see `mapStyle`. */
export interface MapStyle {
	/** The background map with the layers of the elements over it, and their features in GeoJSON sources. */
	style: StyleSpecification;
	/** The images of arrowheads (SDF) and fill patterns that the style uses, which the sprites do not have. */
	images: MapStyleImage[];
	/** Where the viewer looks when it opens the map in a window of this size, see `mapCamera`. */
	camera(size: { width: number; height: number }): MapCamera;
}

/** What `mapStyle` needs: the tile server and the language of the labels (see `backgroundStyle`), and how to load. */
export interface MapStyleOptions extends BackgroundStyleOptions {
	/** The fetch function for the sprite sheets and the TileJSON of the tile server; by default the global one. */
	fetch?: FetchJSON;
	/** The symbols of the tile server, if they are loaded already (see `fetchSymbolCatalog`), e.g. for many maps. */
	symbols?: SymbolCatalog;
}

/** The source of the landcover of low zoom levels, which the vector map loads from tiles of its own. */
const LANDCOVER_SOURCE = 'versatiles-landcover';

type Layout = Record<string, unknown>;

/** The layer with more layout properties, which replace those it has. */
function withLayout(layer: LayerSpecification, layout: Layout): LayerSpecification {
	return { ...layer, layout: { ...(layer as { layout?: Layout }).layout, ...layout } } as LayerSpecification;
}

/** The style without a source and the layers that draw it. */
function withoutSource(style: StyleSpecification, id: string): StyleSpecification {
	const sources = { ...style.sources };
	delete sources[id];
	const layers = style.layers.filter((layer) => !('source' in layer) || layer.source !== id);
	return { ...style, sources, layers };
}

/**
 * The map as a MapLibre style, from the symbols of the tile server that are loaded already: the
 * background map (`backgroundStyle`) with the sprite sheets of the symbols, and the layers of the
 * elements over it as the viewer draws them (`planLayers`), with the labels of markers as the map
 * says and their features in GeoJSON sources. The background's sources keep their TileJSON URLs,
 * see `mapStyle`.
 */
export function buildMapStyle(state: MapState, symbols: SymbolCatalog, options: BackgroundStyleOptions): MapStyle {
	const background = state.meta?.background;
	const style = backgroundStyle(background, options);
	style.sprite = spriteSheets(symbols, options.tileServer);
	const symbol = symbolLookup(symbols);
	const font = backgroundSettings(background).font;
	const labels: LabelOptions = {
		overlap: state.meta?.labels?.overlap === 'hide' ? 'hide' : 'show',
		minZoom: state.meta?.labels?.minZoom ?? 0
	};
	// the labels of the background map between the areas and lines and the markers
	const mapLabelsOnTop = background?.labelsOnTop === true;

	// what each element draws in each role
	const features = state.elements.map(
		(element) =>
			Object.fromEntries(ELEMENT_ROLES.map((role) => [role, elementFeatures(element, role, symbol)])) as Record<
				ElementRole,
				ElementFeature[]
			>
	);
	const drawn = features.map((byRole): Drawn => {
		const marker = byRole.symbol[0]?.properties as { label?: unknown; flat?: boolean } | undefined;
		return {
			roles: ELEMENT_ROLES.filter((role) => byRole[role].length > 0),
			label: typeof marker?.label === 'string' && marker.label.trim() !== '',
			...(marker?.flat ? { flat: true } : {})
		};
	});

	// the layers of the plan: the first one of each role with the id of the role, the others numbered
	const plan = planLayers(drawn, mapLabelsOnTop);
	const layerOf = state.elements.map((): Partial<Record<ElementRole, string>> => ({}));
	const count: Partial<Record<ElementRole, number>> = {};
	const planned = plan.layers.map(({ role, elements, flat }) => {
		const n = (count[role] = (count[role] ?? -1) + 1);
		const id = n === 0 ? ELEMENT_LAYERS[role] : `${ELEMENT_LAYERS[role]}_${n}`;
		for (const i of elements) layerOf[i][role] = id;
		return { role, id, flat: flat === true };
	});

	// the labels of markers: each marker's font, else the one of the background map
	const fonts = new Set<string>();
	for (const byRole of features) {
		const own = (byRole.symbol[0]?.properties as { font?: unknown } | undefined)?.font;
		if (typeof own === 'string') fonts.add(own);
	}
	const text = { ...labelLayout(labels), 'text-font': labelFont([...fonts].sort(), font) };
	const layers = planned.map(({ role, id, flat }) => {
		const layer = elementLayer(role, id, font, symbols.symbols);
		if (role !== 'symbol') return layer;
		// with a layer of labels of their own, the layers of the markers draw none; flat markers lie
		// on the map, the others have MapLibre's default alignment
		return withLayout(layer, {
			...text,
			...(plan.sharedLabels ? { 'text-field': '' } : {}),
			...(flat ? symbolAlignment(true) : {})
		});
	});
	const labelLayers = [
		...(plan.sharedLabels ? [labelsLayer(font, false, symbols.symbols)] : []),
		...(plan.flatLabels ? [labelsLayer(font, true, symbols.symbols)] : [])
	].map((layer) => withLayout(layer, { ...text, 'symbol-sort-key': labelSortKey(labels.overlap) }));

	// the areas and lines under the labels of the background map, if they are on top
	const isArea = (layer: LayerSpecification) => plan.markersOnTop && !layer.id.startsWith(ELEMENT_LAYERS.symbol);
	const areas = layers.filter(isArea);
	const others = [...layers.filter((layer) => !isArea(layer)), ...labelLayers];
	if (mapLabelsOnTop) {
		const first = style.layers.findIndex((layer) => layer.type === 'symbol');
		style.layers.splice(first < 0 ? style.layers.length : first, 0, ...(areas as StyleSpecification['layers']));
	} else {
		style.layers.push(...(areas as StyleSpecification['layers']));
	}
	style.layers.push(...(others as StyleSpecification['layers']));

	// the features of each role, in the order of the elements, each with its layer
	for (const role of ELEMENT_ROLES) {
		const data: GeoJSON.FeatureCollection = {
			type: 'FeatureCollection',
			features: features.flatMap((byRole, i) =>
				byRole[role].map(({ geometry, properties, end }): GeoJSON.Feature => ({
					type: 'Feature',
					// as the editor numbers them: two arrowheads per element
					id: role === 'arrow' ? i * 2 + (end ? 1 : 0) : i,
					geometry,
					properties: { ...properties, order: i, layer: layerOf[i][role] }
				}))
			)
		};
		const source: SourceSpecification = { type: 'geojson', data };
		style.sources[ELEMENT_LAYERS[role]] = source as StyleSpecification['sources'][string];
	}

	// the images of the arrowheads and fill patterns
	const names = new Set<string>();
	for (const byRole of features) {
		for (const { properties } of byRole.fill) names.add((properties as { pattern: string }).pattern);
		for (const { properties } of byRole.arrow) names.add((properties as { icon: string }).icon);
	}
	const images = [...names].flatMap((id): MapStyleImage[] => {
		const image = arrowImageOf(id) ?? patternImageOf(id);
		return image ? [{ id, ...image }] : [];
	});

	return { style, images, camera: (size) => mapCamera(state, size) };
}

/**
 * The map as a MapLibre style (see `buildMapStyle`), with what it loads from the tile server: its
 * symbols, unless they are given, and the TileJSON of the background's sources, which is put into
 * the style (`inlineSources` of `@versatiles/style`), since the tile server's TileJSON has relative
 * tile URLs. A tile server without landcover tiles gives the map without them, with a warning, like
 * the viewer. Rejects if the tile server does not answer.
 */
export async function mapStyle(state: MapState, options: MapStyleOptions): Promise<MapStyle> {
	const { fetch, symbols, ...rest } = options;
	const catalog = symbols ?? (await fetchSymbolCatalog({ tileServer: rest.tileServer, ...(fetch ? { fetch } : {}) }));
	const built = buildMapStyle(state, catalog, rest);
	const inline = (style: StyleSpecification) =>
		inlineSources(
			style,
			fetch ? { fetch: fetch as unknown as NonNullable<Parameters<typeof inlineSources>[1]>['fetch'] } : {}
		);
	try {
		return { ...built, style: await inline(built.style) };
	} catch (error) {
		if (!(LANDCOVER_SOURCE in built.style.sources)) throw error;
		const style = await inline(withoutSource(built.style, LANDCOVER_SOURCE));
		rest.onWarning?.(`The tile server has no landcover tiles, so the map shows none: ${(error as Error).message}`);
		return { ...built, style };
	}
}
