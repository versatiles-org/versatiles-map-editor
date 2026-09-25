import { get } from 'svelte/store';
import type { GeometryManager } from '../geometry_manager.js';
import type { Measurement, SelectionNode, SelectionNodeUpdater } from './types.js';
import type { GeoPoint } from '../utils/types.js';
import { MapLayerFill } from '../map_layer/fill.js';
import { MapLayerLine } from '../map_layer/line.js';
import type { StateElementCircle } from '$lib/codec/types.js';
import { AbstractElement } from './abstract.js';
import { circle, circleArea, distance } from '../utils/geometry.js';
import { formatArea, formatLength } from '../utils/format.js';

export class CircleElement extends AbstractElement {
	public readonly fillLayer: MapLayerFill;
	public readonly strokeLayer: MapLayerLine;
	public point: GeoPoint;
	public radius: number;

	constructor(manager: GeometryManager, point?: GeoPoint, radius?: number) {
		super(manager);
		this.point = point ?? this.randomPositions(1)[0];
		this.radius = radius ?? this.randomRadius();

		this.fillLayer = new MapLayerFill(manager, 'fill' + this.slug, this.sourceId);
		this.fillLayer.on('click', () => this.manager.selection?.selectElement(this));

		this.strokeLayer = new MapLayerLine(manager, 'line' + this.slug, this.sourceId);
		this.strokeLayer.on('click', () => this.manager.selection?.selectElement(this));

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

	public select(value: boolean) {
		super.select(value);
		this.fillLayer.isSelected = value;
		this.strokeLayer.isSelected = value;
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
			{ label: 'Radius', value: formatLength(this.radius) },
			{ label: 'Area', value: formatArea(circleArea(this.radius)) }
		];
	}

	getLayerIds(): string[] {
		return [this.fillLayer.id, this.strokeLayer.id];
	}

	getColors(): string[] {
		const colors = [get(this.fillLayer.color)];
		if (get(this.strokeLayer.visible)) colors.push(get(this.strokeLayer.color));
		return colors;
	}

	destroy(): void {
		this.fillLayer.destroy();
		this.strokeLayer.destroy();
		this.map.removeSource(this.sourceId);
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

	static fromState(manager: GeometryManager, state: StateElementCircle) {
		const element = new CircleElement(manager, state.point, state.radius);
		if (state.style) element.fillLayer.setState(state.style);
		if (state.strokeStyle) element.strokeLayer.setState(state.strokeStyle);
		return element;
	}
}
