import { get } from 'svelte/store';
import { AbstractElement } from './abstract.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { SelectionNode, SelectionNodeUpdater } from './types.js';
import { MapLayerSymbol } from '../map_layer/symbol.js';
import type { StateElementMarker } from '@versatiles/map-state';
import type { GeoPoint } from '../utils/types.js';
import { movePoint } from '../utils/geometry.js';

export class MarkerElement extends AbstractElement {
	public readonly layer: MapLayerSymbol;

	public point: GeoPoint;

	constructor(manager: GeometryManager, point?: GeoPoint) {
		super(manager);
		this.point = point ?? this.randomPositions(1)[0];

		this.layer = new MapLayerSymbol(manager, 'symbol' + this.slug, this.sourceId);
		this.updateSource();
	}

	public select(value: boolean) {
		super.select(value);
		this.layer.setSelected(value);
	}

	getFeature(): GeoJSON.Feature<GeoJSON.Point> {
		return {
			type: 'Feature',
			properties: {},
			geometry: {
				type: 'Point',
				coordinates: this.point
			}
		};
	}

	getSelectionNodes(): SelectionNode[] {
		return [{ index: 0, coordinates: this.point }];
	}

	public isMoveNode(): boolean {
		return true;
	}

	getSelectionNodeUpdater(): SelectionNodeUpdater | undefined {
		return {
			update: (lng, lat) => {
				this.point[0] = lng;
				this.point[1] = lat;
				this.updateSource();
			}
		};
	}

	moveBy(dx: number, dy: number) {
		this.point = movePoint(this.point, dx, dy);
		this.updateSource();
	}

	getLayerIds(): string[] {
		return [this.layer.id];
	}

	getColors(): string[] {
		return [get(this.layer.color)];
	}

	destroy(): void {
		this.layer.destroy();
		this.map.removeSource(this.sourceId);
	}

	getState(): StateElementMarker {
		return {
			type: 'marker',
			point: this.point,
			style: this.layer.getState(),
			...this.getPopupState()
		};
	}

	static fromState(manager: GeometryManager, state: StateElementMarker) {
		const element = new MarkerElement(manager, state.point);
		if (state.style) element.layer.setState(state.style);
		return element;
	}
}
