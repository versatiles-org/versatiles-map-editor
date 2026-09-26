import type { GeometryManager } from '../geometry_manager.js';
import type { GeoPath } from '../../utils/types.js';
import { MapLayerLine } from '../map_layer/line.js';
import { AbstractPathElement } from './abstract_path.js';
import type { StateElementLine } from '@versatiles/map-state';
import type { Measurement, StyleLayers } from './types.js';
import { pathLength } from '../../utils/geometry.js';
import { formatLength } from '../../utils/format.js';

export class LineElement extends AbstractPathElement {
	public readonly layer: MapLayerLine;

	constructor(manager: GeometryManager, line?: GeoPath) {
		super(manager, true);
		this.path = line ?? this.randomPositions(2);

		this.layer = new MapLayerLine(() => this.updateSource());

		this.updateSource();
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
		return [{ label: 'Length', value: formatLength(pathLength(this.path)) }];
	}

	getState(): StateElementLine {
		return {
			type: 'line',
			points: this.path,
			style: this.layer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(manager: GeometryManager, state: StateElementLine) {
		const element = new LineElement(manager, state.points);
		if (state.style) element.layer.setState(state.style);
		return element;
	}
}
