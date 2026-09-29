import type { MapDocument } from '../map_document.svelte.js';
import type { Measurement, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import { type GeoPoint, circle, circleArea, distance, movePoint } from '../geometry.js';
import { MapLayerFill, MapLayerLine } from '../map_layer/index.js';
import type { StateElement, StateElementCircle } from '@versatiles/map-state';
import { AbstractElement } from './abstract.svelte.js';

export class CircleElement extends AbstractElement {
	public readonly fillLayer: MapLayerFill;
	public readonly strokeLayer: MapLayerLine;
	public point: GeoPoint;
	public radius: number;

	constructor(doc: MapDocument, point: GeoPoint, radius: number) {
		super(doc);
		this.point = point;
		this.radius = radius;

		this.fillLayer = new MapLayerFill(() => this.updateSource());

		this.strokeLayer = new MapLayerLine(() => this.updateSource());

		this.updateSource();
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
					this.point[0] = lng;
					this.point[1] = lat;
					this.updateSource();
				}
			};
		} else {
			return {
				update: (lng: number, lat: number) => {
					this.radius = distance([lng, lat], this.point);
					this.updateSource();
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
		this.point = [...point];
		this.radius = radius;
	}

	moveBy(dx: number, dy: number) {
		this.point = movePoint(this.point, dx, dy);
		this.updateSource();
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

	static fromState(doc: MapDocument, state: StateElementCircle) {
		const element = new CircleElement(doc, state.point, state.radius);
		if (state.style) element.fillLayer.setState(state.style);
		if (state.strokeStyle) element.strokeLayer.setState(state.strokeStyle);
		return element;
	}
}
