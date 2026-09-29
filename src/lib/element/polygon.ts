import type { MapDocument } from '../map_document.svelte.js';
import { type GeoPath, polygonArea } from '../geometry.js';
import { MapLayerFill, MapLayerLine } from '../map_layer/index.js';
import { AbstractPathElement } from './abstract_path.js';
import type { StateElementPolygon } from '@versatiles/map-state';
import type { Measurement, StyleLayers } from './types.js';

export class PolygonElement extends AbstractPathElement {
	public readonly fillLayer: MapLayerFill;
	public readonly strokeLayer: MapLayerLine;

	constructor(doc: MapDocument, polygon: GeoPath) {
		super(doc, false);
		this.path = polygon;

		this.fillLayer = new MapLayerFill(() => this.updateSource());

		this.strokeLayer = new MapLayerLine(() => this.updateSource());

		this.updateSource();
	}

	getStyleLayers(): StyleLayers {
		return { fill: this.fillLayer, stroke: this.strokeLayer };
	}

	getFeature(): GeoJSON.Feature<GeoJSON.Polygon> {
		return {
			type: 'Feature',
			properties: {},
			geometry: { type: 'Polygon', coordinates: [[...this.path, this.path[0]]] }
		};
	}

	protected getMeasurements(): Measurement[] {
		return [{ kind: 'area', value: polygonArea(this.path) }];
	}

	getState(): StateElementPolygon {
		return {
			type: 'polygon',
			points: this.path,
			style: this.fillLayer.getState(),
			strokeStyle: this.strokeLayer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(doc: MapDocument, state: StateElementPolygon) {
		const element = new PolygonElement(doc, state.points);
		if (state.style) element.fillLayer.setState(state.style);
		if (state.strokeStyle) element.strokeLayer.setState(state.strokeStyle);
		return element;
	}
}
