import type { ElementOwner, Measurement, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import { type GeoPoint, circle, circleArea, distance, movePoint, snapPoint } from '../geometry.js';
import { FillStyle, LineStyle } from '../style/index.js';
import type { StateElement, StateElementCircle } from '@versatiles/map-state';
import { AbstractElement } from './abstract.svelte.js';

export class CircleElement extends AbstractElement {
	public readonly fillLayer: FillStyle;
	public readonly strokeLayer: LineStyle;
	public point: GeoPoint;
	public radius: number;

	constructor(doc: ElementOwner, point: GeoPoint, radius: number) {
		super(doc);
		this.point = snapPoint(point);
		this.radius = radius;

		this.fillLayer = new FillStyle(() => this.changed());

		this.strokeLayer = new LineStyle(() => this.changed());

		this.changed();
	}

	/** Set the radius in meters, e.g. typed in the inspector. */
	public setRadius(radius: number) {
		if (radius === this.radius) return;
		this.radius = radius;
		this.changed();
	}

	getSelectionNodes(): SelectionNode[] {
		return [
			{ index: 0, coordinates: this.point },
			...circle(this.point, this.radius, 4).map((coordinates) => ({
				index: 1,
				transparent: true,
				coordinates
			}))
		];
	}

	public isMoveNode(properties?: Record<string, unknown>): boolean {
		return properties?.index == 0;
	}

	getSelectionNodeUpdater(properties?: Record<string, unknown>): SelectionNodeUpdater | undefined {
		if (properties == undefined) return;
		if (properties.index == 0) {
			return {
				update: (lng: number, lat: number) => {
					this.point = snapPoint([lng, lat]);
					this.changed();
				}
			};
		} else {
			return {
				update: (lng: number, lat: number) => {
					this.radius = distance([lng, lat], this.point);
					this.changed();
				}
			};
		}
	}

	getStyleLayers(): StyleLayers {
		return { fill: this.fillLayer, stroke: this.strokeLayer };
	}

	getFeature(): GeoJSON.Feature<GeoJSON.Polygon> {
		const coordinates = circle(this.point, this.radius, 72);
		coordinates.push(coordinates[0]); // Close the circle

		return {
			type: 'Feature',
			properties: {},
			geometry: { type: 'Polygon', coordinates: [coordinates] }
		};
	}

	protected getMeasurements(): Measurement[] {
		return [
			{ kind: 'radius', value: this.radius },
			{ kind: 'area', value: circleArea(this.radius) }
		];
	}

	protected setGeometry(state: StateElement) {
		const { point, radius } = state as StateElementCircle;
		this.point = snapPoint(point);
		this.radius = radius;
	}

	snap() {
		this.point = snapPoint(this.point);
		this.changed();
	}

	moveBy(dx: number, dy: number) {
		this.point = movePoint(this.point, dx, dy);
		this.changed();
	}

	getState(): StateElementCircle {
		return {
			type: 'circle',
			point: this.point,
			radius: this.radius,
			style: this.fillLayer.getState(),
			strokeStyle: this.strokeLayer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(doc: ElementOwner, state: StateElementCircle) {
		const element = new CircleElement(doc, state.point, state.radius);
		element.fillLayer.setState(state.style);
		element.strokeLayer.setState(state.strokeStyle);
		return element;
	}
}
