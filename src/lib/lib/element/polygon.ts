import { get } from 'svelte/store';
import type { GeometryManager } from '../geometry_manager.js';
import type { GeoPath } from '../utils/types.js';
import { MapLayerFill } from '../map_layer/fill.js';
import { MapLayerLine } from '../map_layer/line.js';
import { AbstractPathElement } from './abstract_path.js';
import type { StateElementPolygon } from '$lib/codec/types.js';
import type { Measurement } from './types.js';
import { polygonArea } from '../utils/geometry.js';
import { formatArea } from '../utils/format.js';

export class PolygonElement extends AbstractPathElement {
	public readonly fillLayer: MapLayerFill;
	public readonly strokeLayer: MapLayerLine;

	constructor(manager: GeometryManager, polygon?: GeoPath) {
		super(manager, false);
		this.path = polygon ?? this.randomPositions(3);

		this.fillLayer = new MapLayerFill(manager, 'fill' + this.slug, this.sourceId);
		this.fillLayer.on('click', () => this.manager.selection?.selectElement(this));
		this.fillLayer.on('pointerdown', (e) => {
			if (this.isSelected) this.handleDrag(e);
		});

		this.strokeLayer = new MapLayerLine(manager, 'line' + this.slug, this.sourceId);
		this.strokeLayer.on('click', () => this.manager.selection?.selectElement(this));

		this.updateSource();
	}

	public select(value: boolean) {
		super.select(value);
		this.fillLayer.isSelected = value;
		this.strokeLayer.isSelected = value;
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
