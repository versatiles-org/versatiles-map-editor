import { type GeoPath, polygonArea, snapPoint } from '../geometry.js';
import { FillStyle, LineStyle } from '../style/index.js';
import { AbstractPathElement } from './abstract_path.svelte.js';
import type { StateElementPolygon } from '@versatiles/map-state';
import type { ElementOwner, Measurement, StyleLayers } from './types.js';

export class PolygonElement extends AbstractPathElement {
	public readonly fillLayer: FillStyle;
	public readonly strokeLayer: LineStyle;

	constructor(doc: ElementOwner, polygon: GeoPath) {
		super(doc, false);
		this.path = polygon.map(snapPoint);

		this.fillLayer = new FillStyle(() => this.changed());

		this.strokeLayer = new LineStyle(() => this.changed());

		this.changed();
	}

	getStyleLayers(): StyleLayers {
		return { fill: this.fillLayer, stroke: this.strokeLayer };
	}

	getFeature(): GeoJSON.Feature<GeoJSON.Polygon> {
		const ring = this.drawnPath;
		return {
			type: 'Feature',
			properties: {},
			geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] }
		};
	}

	protected getMeasurements(): Measurement[] {
		return [{ kind: 'area', value: polygonArea(this.drawnPath) }];
	}

	getState(): StateElementPolygon {
		return {
			type: 'polygon',
			points: this.path,
			...this.getSmoothState(),
			style: this.fillLayer.getState(),
			outlineStyle: this.strokeLayer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(doc: ElementOwner, state: StateElementPolygon) {
		const element = new PolygonElement(doc, state.points);
		element.smooth = state.smooth === true;
		element.fillLayer.setState(state.style);
		element.strokeLayer.setState(state.outlineStyle);
		return element;
	}
}
