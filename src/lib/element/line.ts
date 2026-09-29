import { type GeoPath, pathLength } from '../geometry.js';
import { MapLayerLine } from '../map_layer/index.js';
import { AbstractPathElement } from './abstract_path.js';
import type { StateElementLine } from '@versatiles/map-state';
import type { ElementOwner, Measurement, StyleLayers } from './types.js';

export class LineElement extends AbstractPathElement {
	public readonly layer: MapLayerLine;

	constructor(doc: ElementOwner, line: GeoPath) {
		super(doc, true);
		this.path = line;

		this.layer = new MapLayerLine(() => this.changed(), { canHide: false });

		this.changed();
	}

	getStyleLayers(): StyleLayers {
		return { stroke: this.layer };
	}

	getFeature(): GeoJSON.Feature<GeoJSON.LineString> {
		return {
			type: 'Feature',
			properties: {},
			geometry: { type: 'LineString', coordinates: this.path }
		};
	}

	protected getMeasurements(): Measurement[] {
		return [{ kind: 'length', value: pathLength(this.path) }];
	}

	getState(): StateElementLine {
		return {
			type: 'line',
			points: this.path,
			style: this.layer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(doc: ElementOwner, state: StateElementLine) {
		const element = new LineElement(doc, state.points);
		if (state.style) element.layer.setState(state.style);
		return element;
	}
}
