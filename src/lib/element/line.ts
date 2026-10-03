import { type GeoPath, pathLength } from '../geometry.js';
import { LineStyle } from '../style/index.js';
import { AbstractPathElement } from './abstract_path.js';
import type { StateElementLine } from '@versatiles/map-state';
import type { ElementOwner, Measurement, StyleLayers } from './types.js';

export class LineElement extends AbstractPathElement {
	public readonly layer: LineStyle;

	constructor(doc: ElementOwner, line: GeoPath) {
		super(doc, true);
		this.path = line;

		this.layer = new LineStyle(() => this.changed(), { canHide: false, arrows: true });

		this.changed();
	}

	/** Reverse the order of the points, so the line runs the other way, e.g. its arrowheads. */
	reverse() {
		// a new array: the path can be shared, e.g. with the state the line was made of
		this.path = [...this.path].reverse();
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
		element.layer.setState(state.style);
		return element;
	}
}
