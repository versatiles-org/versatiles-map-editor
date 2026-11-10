import type * as maplibregl from 'maplibre-gl';
import {
	arrowHeads,
	AREAS_TOP,
	ELEMENT_LAYERS,
	ELEMENT_ROLES as ROLES,
	elementLayer,
	ELEMENTS_TOP,
	FLAT_LABELS_LAYER,
	DEFAULT_LABEL_OPTIONS,
	LABEL_LAYOUT_KEYS,
	labelFont,
	labelLayout,
	LABELS_LAYER,
	LABELS_LAYERS,
	labelSortKey,
	labelsLayer,
	planLayers,
	symbolAlignment,
	type Drawn,
	type ElementRole as Role,
	type LabelOptions
} from '@versatiles/map-state/maplibre';
import type { AbstractElement } from '../element/index.js';
import { allSymbols } from '../background/index.js';

export type { LabelOptions, Role };

/** The roles that an element draws: those of its style, and the arrowheads of a line that has them. */
export function rolesOf(element: AbstractElement): Role[] {
	const layers = element.getStyleLayers();
	return ROLES.filter((role) => (role === 'arrow' ? layers.stroke?.getArrowProperties() : layers[role]));
}

/** The ids of the layers that draw the element: one per role of its style, shared with the other elements. */
export function layerIdsOf(element: AbstractElement): string[] {
	return rolesOf(element).map((role) => ELEMENT_LAYERS[role]);
}

/**
 * Draws all elements with one source per role and few layers (see `planLayers`), instead of a
 * source and layers per element, so maps with many elements (e.g. a table import) stay fast. The
 * elements are features with their element id; their styles are feature properties that the
 * layers read, and the id of the layer that draws them.
 *
 * Changes are collected and written once per microtask: a change of the element list replaces
 * all features, a change of single elements only their features.
 */
export class ElementRenderer {
	private readonly map: maplibregl.Map;
	private elements: AbstractElement[] = [];
	private order = new Map<AbstractElement, number>();
	private changed = new Set<AbstractElement>();
	private all = false;
	/** Whether the layers must be planned again before the next flush, e.g. after labels were added. */
	private replan = false;
	private scheduled = false;
	/** The layer of each element and role, see `planLayers`, and what each draws, to notice a change. */
	private layerOf = new Map<AbstractElement, Partial<Record<Role, string>>>();
	private drawn = new Map<AbstractElement, string>();
	/** Whether the markers must be drawn over all areas and lines, see `planLayers`. */
	private markersOnTop = false;
	/** The layers of the areas and lines that have a place of their own (with the markers on top), and the others, in drawing order. */
	private planned: { areas: string[]; others: string[] } = { areas: [], others: [...Object.values(ELEMENT_LAYERS)] };
	/** The layers of the plan that draw flat markers, or their labels. */
	private flatLayers = new Set<string>();
	/** The layers of the elements that the map style has. */
	private present = new Set<string>(Object.values(ELEMENT_LAYERS));
	/** How the labels of markers are shown, see `LabelOptions`. */
	private labels: LabelOptions = DEFAULT_LABEL_OPTIONS;
	/** The glyph font of the labels of markers without one of their own: the one of the background map. */
	private font = 'noto_sans_regular';
	/** The fonts of their own that markers have, sorted, which `text-font` lists. */
	private fonts: string[] = [];

	constructor(map: maplibregl.Map) {
		this.map = map;
	}

	/** The elements to draw, in drawing order. The map document calls it on every change of the list. */
	public setElements(elements: AbstractElement[]) {
		this.elements = elements;
		this.order = new Map(elements.map((element, i) => [element, i]));
		this.plan();
		this.redraw();
	}

	/** What the element draws, for the layers. */
	private static drawnOf(element: AbstractElement): Drawn {
		const symbol = element.getStyleLayers().symbol;
		const label = symbol?.getProperties().label;
		return {
			roles: rolesOf(element),
			label: typeof label === 'string' && label.trim() !== '',
			...(symbol?.flat ? { flat: true } : {})
		};
	}

	private static key({ roles, label, flat }: Drawn): string {
		return `${roles.join()}${label ? ' label' : ''}${flat ? ' flat' : ''}`;
	}

	/**
	 * The layers of the elements, see `planLayers`: the first one of each role has the id of the
	 * role (e.g. `elements_fill`), the others a number (e.g. `elements_fill_1`).
	 */
	private plan() {
		const drawn = this.elements.map((element) => ElementRenderer.drawnOf(element));
		const plan = planLayers(drawn, this.markersOnTop);
		const count: Partial<Record<Role, number>> = {};
		this.layerOf = new Map(this.elements.map((element) => [element, {}]));
		this.flatLayers = new Set(plan.flatLabels ? [FLAT_LABELS_LAYER] : []);
		const ids = plan.layers.map(({ role, elements, flat }) => {
			const n = (count[role] = (count[role] ?? -1) + 1);
			const id = n === 0 ? ELEMENT_LAYERS[role] : `${ELEMENT_LAYERS[role]}_${n}`;
			for (const i of elements) this.layerOf.get(this.elements[i])![role] = id;
			if (flat) this.flatLayers.add(id);
			return id;
		});
		// every map style has the first layer of each role, also if it draws nothing
		const all = [...ROLES.filter((role) => count[role] === undefined).map((role) => ELEMENT_LAYERS[role]), ...ids];
		const isArea = (id: string) => plan.markersOnTop && !id.startsWith(ELEMENT_LAYERS.symbol);
		this.planned = {
			areas: all.filter(isArea),
			others: [
				...all.filter((id) => !isArea(id)),
				...(plan.sharedLabels ? [LABELS_LAYER] : []),
				...(plan.flatLabels ? [FLAT_LABELS_LAYER] : [])
			]
		};
		this.drawn = new Map(this.elements.map((element, i) => [element, ElementRenderer.key(drawn[i])]));
	}

	/**
	 * Draw the markers over all areas and lines, e.g. while the labels of the background map are
	 * between them; else each element at its place in the order.
	 */
	public setMarkersOnTop(onTop: boolean) {
		if (onTop === this.markersOnTop) return;
		this.markersOnTop = onTop;
		this.plan();
		this.redraw();
	}

	/** The ids of the layers of a role, e.g. to find an element under the mouse. */
	public layerIds(role: Role): string[] {
		const ids = [...this.planned.areas, ...this.planned.others];
		const own = ids.filter((id) => id === ELEMENT_LAYERS[role] || id.startsWith(`${ELEMENT_LAYERS[role]}_`));
		// the labels of the markers, if they have layers of their own
		return role === 'symbol' ? [...own, ...LABELS_LAYERS.filter((id) => ids.includes(id))] : own;
	}

	/** Show the labels of the markers all, or without those that overlap, and from a zoom level. */
	public setLabelOptions(options: LabelOptions) {
		this.labels = options;
		this.applyLabels();
	}

	/**
	 * The options of the labels on the layers of the markers. If the labels have a layer of their
	 * own, the layers of the markers draw no labels, and the labels are placed from the front when
	 * overlapping ones are hidden.
	 */
	private applyLabels() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const layout = labelLayout(this.labels);
		const own = this.present.has(LABELS_LAYER);
		for (const id of this.layerIds('symbol')) {
			for (const [key, value] of Object.entries(layout)) {
				const label = LABELS_LAYERS.includes(id) || !own;
				map.setLayoutProperty(id, key as keyof typeof layout, key === 'text-field' && !label ? '' : value);
			}
		}
		if (own) {
			for (const id of LABELS_LAYERS) {
				if (this.present.has(id)) map.setLayoutProperty(id, 'symbol-sort-key', labelSortKey(this.labels.overlap));
			}
		}
	}

	/** The glyph font of the labels of markers without a font of their own, e.g. of the background map. */
	public setFont(font: string) {
		this.font = font;
		this.applyFonts();
	}

	/**
	 * The fonts of the labels on the layers of the markers: each marker's own (the feature property
	 * `font`), else the font of the background map. `text-font` needs a list of fonts, which a
	 * feature property cannot be, so it lists the fonts that the markers have.
	 */
	private applyFonts() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const font = labelFont(this.fonts, this.font);
		for (const id of this.layerIds('symbol')) {
			if (map.getLayer(id)) map.setLayoutProperty(id, 'text-font', font);
		}
	}

	/** Update the fonts of the labels if the markers have other fonts of their own; `force`, e.g. for new layers. */
	private updateFonts(force: boolean) {
		const fonts = new Set<string>();
		for (const element of this.elements) {
			const font = element.getStyleLayers().symbol?.labelFont;
			if (font) fonts.add(font);
		}
		const sorted = [...fonts].sort();
		if (!force && sorted.join() === this.fonts.join()) return;
		this.fonts = sorted;
		this.applyFonts();
	}

	/** A new map style has only the first layer of each role: the others are added again. */
	public onStyleLoad() {
		this.present = new Set(Object.values(ELEMENT_LAYERS));
		this.redraw();
	}

	/**
	 * Make the layers of the map style those of the plan, in its order: remove the others, add the
	 * missing ones, and move them into place, under `AREAS_TOP` (the areas and lines with the
	 * markers on top) and under `ELEMENTS_TOP` (all others). New layers of markers get the label
	 * font of the first one.
	 */
	private syncLayers() {
		const map = this.map;
		if (!map.style || !map.getLayer(ELEMENT_LAYERS.symbol)) return;
		const { areas, others } = this.planned;
		const wanted = new Set([...areas, ...others]);
		for (const id of this.present) {
			if (!wanted.has(id)) map.removeLayer(id);
		}
		for (const id of wanted) {
			if (this.present.has(id)) continue;
			const role = ROLES.find((role) => id.startsWith(ELEMENT_LAYERS[role]))!;
			map.addLayer(
				LABELS_LAYERS.includes(id)
					? labelsLayer('noto_sans_regular', id === FLAT_LABELS_LAYER, allSymbols())
					: elementLayer(role, id, 'noto_sans_regular', allSymbols()),
				ELEMENTS_TOP
			);
			// the font like that of the first layer of markers
			if (!LABELS_LAYERS.includes(id) && role !== 'symbol') continue;
			for (const key of LABEL_LAYOUT_KEYS) {
				const value = map.getLayoutProperty(ELEMENT_LAYERS.symbol, key);
				if (value !== undefined) map.setLayoutProperty(id, key, value);
			}
		}
		this.present = wanted;
		// the layers of the markers draw other markers than before: flat ones, or upright ones
		for (const id of this.layerIds('symbol')) {
			const alignment = symbolAlignment(this.flatLayers.has(id));
			for (const key of Object.keys(alignment) as (keyof typeof alignment)[]) {
				const value = alignment[key];
				if ((map.getLayoutProperty(id, key) ?? 'auto') !== value) map.setLayoutProperty(id, key, value);
			}
		}
		// from the top down, each right under the one above it
		for (const [ids, top] of [
			[areas, AREAS_TOP],
			[others, ELEMENTS_TOP]
		] as const) {
			let above: string = top;
			for (const id of [...ids].reverse()) {
				const order = map.getLayersOrder();
				if (order[order.indexOf(above) - 1] !== id) map.moveLayer(id, above);
				above = id;
			}
		}
		this.applyLabels();
	}

	/** Draw the element again, e.g. after a change of its geometry or style. */
	public update(element: AbstractElement) {
		// an element that is not (yet) on the map is drawn when it is added
		if (!this.order.has(element)) return;
		// e.g. a label or an outline added or removed can change the layers: planned once for all
		// changed elements, e.g. when undo takes the labels of many markers
		if (ElementRenderer.key(ElementRenderer.drawnOf(element)) !== this.drawn.get(element)) {
			this.replan = true;
			return this.redraw();
		}
		this.changed.add(element);
		this.schedule();
	}

	/** Draw all elements again, e.g. after a new map style. */
	public redraw() {
		this.all = true;
		this.schedule();
	}

	private schedule() {
		if (this.scheduled) return;
		this.scheduled = true;
		queueMicrotask(() => this.flush());
	}

	/** Write the pending changes to the map now. */
	public flush() {
		this.scheduled = false;
		if (this.replan) {
			this.replan = false;
			this.plan();
		}
		if (this.all) {
			this.syncLayers();
			this.updateFonts(true);
			for (const role of ROLES) {
				const features = this.elements.flatMap((element) => this.featuresOf(element, role));
				this.source(role)?.setData({ type: 'FeatureCollection', features });
			}
		} else if (this.changed.size > 0) {
			const changed = [...this.changed].filter((element) => this.order.has(element));
			for (const role of ROLES) {
				// an element that gets or loses a role is planned again, see `update`
				const elements = changed.filter((element) => this.layerOf.get(element)?.[role]);
				if (elements.length === 0) continue;
				this.source(role)?.updateData({
					// replaced, or removed if it is not drawn any more (e.g. a hidden outline)
					remove: elements.flatMap((element) => featureIds(element, role)),
					add: elements.flatMap((element) => this.featuresOf(element, role))
				});
			}
			this.updateFonts(false);
		}
		this.all = false;
		this.changed.clear();
	}

	private source(role: Role) {
		// looked up each time, since a new map style replaces the source object
		return this.map.style ? this.map.getSource<maplibregl.GeoJSONSource>(ELEMENT_LAYERS[role]) : undefined;
	}

	/** The features of the element in the source of the role: one, or one per arrowhead. */
	private featuresOf(element: AbstractElement, role: Role): GeoJSON.Feature[] {
		const common = { order: this.order.get(element), layer: this.layerOf.get(element)?.[role] };
		const { geometry } = element.getFeature();
		if (role === 'arrow') {
			const arrows = element.getStyleLayers().stroke?.getArrowProperties();
			if (!arrows || geometry.type !== 'LineString') return [];
			return arrowHeads(geometry.coordinates as [number, number][], arrows).map(({ point, end, properties }) => ({
				type: 'Feature',
				id: arrowFeatureId(element.id, end),
				geometry: { type: 'Point', coordinates: point },
				properties: { ...properties, ...common }
			}));
		}
		const properties = element.getStyleLayers()[role]?.getProperties();
		if (!properties) return [];
		return [{ type: 'Feature', id: element.id, geometry, properties: { ...properties, ...common } }];
	}
}

/**
 * The id of the feature of an arrowhead: two per element, since a source needs a different id for
 * each feature. `elementIdOf` returns the element id.
 */
function arrowFeatureId(id: number, end: boolean): number {
	return id * 2 + (end ? 1 : 0);
}

/** The ids of the features that an element can have in the source of a role. */
function featureIds(element: AbstractElement, role: Role): number[] {
	return role === 'arrow' ? [arrowFeatureId(element.id, false), arrowFeatureId(element.id, true)] : [element.id];
}

/** The id of the element of a feature in the source of a role, e.g. of a feature under the mouse. */
export function elementIdOf(featureId: number, role: Role | undefined): number {
	return role === 'arrow' ? Math.floor(featureId / 2) : featureId;
}
