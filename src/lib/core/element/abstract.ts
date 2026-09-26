import type * as maplibregl from 'maplibre-gl';
import type { Measurement, SelectionNode, SelectionNodeUpdater, StyleLayers } from './types.js';
import { get, writable, type Writable } from 'svelte/store';
import type { GeoPoint } from '../../utils/types.js';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateElement, StatePopup } from '@versatiles/map-state';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';

export abstract class AbstractElement {
	protected readonly canvas: HTMLElement;
	protected readonly map: maplibregl.Map;
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
	}

	/** The map layers that draw the element, by their role in its style. */
	abstract getStyleLayers(): StyleLayers;

	public select(value: boolean) {
		this.isSelected = value;
		for (const layer of this.layers()) layer.setSelected(value);
	}

	/** The ids of the map layers that draw the element. */
	public getLayerIds(): string[] {
		return this.layers().map((layer) => layer.id);
	}

	/** The colors of the element, e.g. for the palette of used colors. A hidden outline has none. */
	public getColors(): string[] {
		const { symbol, fill, stroke } = this.getStyleLayers();
		const colors: string[] = [];
		if (symbol) colors.push(get(symbol.color));
		if (fill) colors.push(get(fill.color));
		// a line is always drawn, the outline of an area only if it is visible
		if (stroke && (!fill || get(stroke.visible))) colors.push(get(stroke.color));
		return colors;
	}

	public destroy(): void {
		for (const layer of this.layers()) layer.destroy();
		this.map.removeSource(this.sourceId);
	}

	private layers() {
		const { symbol, fill, stroke } = this.getStyleLayers();
		return [symbol, fill, stroke].filter((layer) => layer !== undefined);
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
		// looked up each time, since a new background map replaces the source object
		this.map.getSource<maplibregl.GeoJSONSource>(this.sourceId)?.setData(this.getFeature());
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

	/** Move the element by `dx` degrees of longitude and `dy` in mercator units (see `movePoint`). */
	abstract moveBy(dx: number, dy: number): void;
	abstract getFeature(): GeoJSON.Feature;
	abstract getSelectionNodes(): SelectionNode[];
	abstract getSelectionNodeUpdater(properties?: Record<string, unknown>): SelectionNodeUpdater | undefined;
	abstract getState(): StateElement;
}
