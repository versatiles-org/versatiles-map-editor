import type * as maplibregl from 'maplibre-gl';
import type { Measurement, SelectionNode, SelectionNodeUpdater } from './types.js';
import { get, writable, type Writable } from 'svelte/store';
import type { GeoPoint } from '../utils/types.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateElement, StatePopup } from '$lib/codec/types.js';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';

export abstract class AbstractElement {
	protected readonly canvas: HTMLElement;
	protected readonly map: maplibregl.Map;
	protected readonly source: maplibregl.GeoJSONSource;
	protected readonly slug = '_' + Math.random().toString(36).slice(2);
	protected isSelected = false;

	public readonly manager: GeometryManager | GeometryManagerInteractive;
	public readonly sourceId = 'source' + this.slug;
	public readonly measurements: Writable<Measurement[]> = writable([]);
	/** Text of the popup that opens on click in the viewer. Empty for no popup. */
	public readonly popup: Writable<string> = writable('');

	constructor(manager: GeometryManager | GeometryManagerInteractive) {
		this.manager = manager;
		this.map = manager.map;
		this.canvas = this.map.getCanvasContainer();

		this.map.addSource(this.sourceId, {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});
		this.source = this.map.getSource(this.sourceId)!;
	}

	public select(value: boolean) {
		this.isSelected = value;
	}

	protected randomPositions(length: number): GeoPoint[] {
		const points: GeoPoint[] = [];
		const bounds = this.map.getBounds();

		for (let i = 0; i < length; i++) {
			const xr = Math.random() * 0.5 + 0.25;
			const yr = Math.random() * 0.5 + 0.25;
			points.push([
				(1 - xr) * bounds.getWest() + xr * bounds.getEast(),
				(1 - yr) * bounds.getSouth() + yr * bounds.getNorth()
			]);
		}

		return points;
	}

	protected randomRadius(): number {
		const bounds = this.map.getBounds();
		const width = bounds.getEast() - bounds.getWest();
		const height = bounds.getNorth() - bounds.getSouth();
		return Math.sqrt(width * height) * 10000;
	}

	protected updateSource() {
		this.source.setData(this.getFeature());
		this.measurements.set(this.getMeasurements());
	}

	protected getMeasurements(): Measurement[] {
		return [];
	}

	/** The popup as part of the element state: `{ popup }`, or nothing if there is no popup. */
	protected getPopupState(): { popup?: StatePopup } {
		const text = get(this.popup);
		return text.trim() ? { popup: { text } } : {};
	}

	/** Whether dragging this selection node moves the whole element (instead of reshaping it). */
	public isMoveNode(properties?: Record<string, unknown>): boolean {
		void properties;
		return false;
	}

	/** Whether the node can be deleted on its own, i.e. it is a vertex and the shape keeps enough vertices. */
	public canDeleteNode(index: number): boolean {
		void index;
		return false;
	}

	/** Delete a single node. Returns false if it cannot be deleted. */
	public deleteNode(index: number): boolean {
		void index;
		return false;
	}

	public delete() {
		this.manager.removeElement(this);
		this.destroy();
	}

	/** The colors of the element, e.g. for the palette of used colors. */
	abstract getColors(): string[];
	/** The ids of the map layers that draw the element. */
	abstract getLayerIds(): string[];
	abstract destroy(): void;
	abstract getFeature(): GeoJSON.Feature;
	abstract getSelectionNodes(): SelectionNode[];
	abstract getSelectionNodeUpdater(properties?: Record<string, unknown>): SelectionNodeUpdater | undefined;
	abstract getState(): StateElement;
}
