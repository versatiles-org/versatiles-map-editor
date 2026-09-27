import type { GeometryManager } from '../geometry_manager.svelte.js';
import type { GeoPath } from '../../utils/types.js';
import { MapLayerFill } from '../map_layer/fill.svelte.js';
import { MapLayerLine } from '../map_layer/line.svelte.js';
import { AbstractPathElement } from './abstract_path.js';
import type { StateElementPolygon } from '@versatiles/map-state';
import type { Measurement, StyleLayers } from './types.js';
import { polygonArea } from '../../utils/geometry.js';
import { formatArea } from '../../utils/format.js';

export class PolygonElement extends AbstractPathElement {
	public readonly fillLayer: MapLayerFill;
	public readonly strokeLayer: MapLayerLine;

	constructor(manager: GeometryManager, polygon: GeoPath) {
		super(manager, false);
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
		return [{ label: 'Area', value: formatArea(polygonArea(this.path)) }];
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

	static fromState(manager: GeometryManager, state: StateElementPolygon) {
		const element = new PolygonElement(manager, state.points);
		if (state.style) element.fillLayer.setState(state.style);
		if (state.strokeStyle) element.strokeLayer.setState(state.strokeStyle);
		return element;
	}
}
