import type * as maplibregl from 'maplibre-gl';
import type { LayerFill, LayerLine, LayerSymbol } from './types.js';
import { Color } from '@versatiles/style';
import type { GeometryManager } from '../geometry_manager.js';
import type { StateStyle } from '$lib/codec/types.js';
import type { GeometryManagerInteractive } from '../geometry_manager_interactive.js';
import { isClaimed, isMultiTouch, type MapPointerEvent } from '../utils/drag.js';

type LayerSpec = LayerFill | LayerLine | LayerSymbol;
// 'pointerdown' is a mousedown or the touchstart of a finger or pencil
type Events = 'click' | 'pointerdown' | 'mousemove' | 'mouseup';
type PointerEventHandler = (event: MapPointerEvent) => void;
type MapLayerEvent = Exclude<Events, 'pointerdown'> | 'mousedown' | 'touchstart' | 'mouseenter' | 'mouseleave';
type MapLayerEventHandler = (event: maplibregl.MapLayerMouseEvent | maplibregl.MapLayerTouchEvent) => void;
type PaintKey = keyof maplibregl.AllPaintProperties;
type LayoutKey = keyof maplibregl.AllLayoutProperties;

export abstract class MapLayer<T extends LayerSpec> {
	private layout = {} as T['layout'];
	private paint = {} as T['paint'];

	protected readonly id: string;
	public readonly manager: GeometryManager | GeometryManagerInteractive;
	protected readonly map: maplibregl.Map;

	public eventHandlers = new Map<Events, PointerEventHandler[]>();
	// Listeners registered on the map, so they can be removed in destroy()
	private mapListeners: [MapLayerEvent, MapLayerEventHandler][] = [];
	public isSelected = false;

	constructor(manager: GeometryManager, id: string) {
		this.manager = manager;
		this.map = manager.map;
		this.id = id;
	}

	addLayer(source: string, type: 'symbol' | 'line' | 'fill', layout: T['layout'], paint: T['paint']) {
		layout = cloneClean(layout);
		paint = cloneClean(paint);

		this.layout = layout;
		this.paint = paint;

		this.map.addLayer({ id: this.id, source, type, layout, paint } as maplibregl.LayerSpecification, 'selection_nodes');

		this.addEvents();

		function cloneClean<T>(obj: T): Partial<T> {
			const clone = { ...obj };
			for (const key in clone) {
				if (clone[key] == null) delete clone[key];
			}
			return clone;
		}
	}

	on(event: Events, handler: PointerEventHandler) {
		if (!this.eventHandlers.has(event)) this.eventHandlers.set(event, []);
		this.eventHandlers.get(event)!.push(handler);
	}

	off(event: Events, handler: PointerEventHandler) {
		if (!this.eventHandlers.has(event)) return;
		const handlers = this.eventHandlers.get(event)!;
		this.eventHandlers.set(
			event,
			handlers.filter((h) => h !== handler)
		);
	}

	private dispatchEvent(event: Events, e: MapPointerEvent) {
		const handlers = this.eventHandlers.get(event);
		if (handlers) handlers.forEach((handler) => handler(e));
	}

	private listen(event: MapLayerEvent, handler: MapLayerEventHandler) {
		this.map.on(event, this.id, handler);
		this.mapListeners.push([event, handler]);
	}

	private addEvents() {
		const manager = this.manager;
		if (manager.isInteractive()) {
			this.listen('mouseenter', () => {
				if (this.isSelected) manager.cursor.toggleGrab(this.id);
				manager.cursor.toggleHover(this.id);
			});
			this.listen('mouseleave', () => {
				if (this.isSelected) manager.cursor.toggleGrab(this.id, false);
				manager.cursor.toggleHover(this.id, false);
			});
			this.listen('click', (e) => {
				this.dispatchEvent('click', e);
				if (this.isSelected) manager.cursor.toggleGrab(this.id);
				manager.cursor.toggleHover(this.id);
				e.preventDefault();
			});
			const onDown = (e: MapPointerEvent) => {
				// e.g. a selection node above the element was hit, or a pinch-zoom starts
				if (isClaimed(e) || isMultiTouch(e)) return;
				this.dispatchEvent('pointerdown', e);
			};
			this.listen('mousedown', (e) => {
				if (manager.cursor.isPrecise()) return;
				onDown(e);
			});
			this.listen('touchstart', onDown);
		}
		this.listen('mouseup', (e) => this.dispatchEvent('mouseup', e));
		this.listen('mousemove', (e) => this.dispatchEvent('mousemove', e));
	}

	setPaint(paint: T['paint']) {
		if (paint === undefined) return;
		const keys = new Set(Object.keys(paint).concat(Object.keys(this.paint)) as (keyof T['paint'])[]);
		for (const key of keys.values()) this.updatePaint(key, (paint as T['paint'])[key]);
	}

	updatePaint<K extends keyof T['paint'], V extends T['paint'][K]>(key: K, value: V) {
		if (value instanceof Color) value = value.asString() as V;

		if (this.paint[key] == value) return;
		this.map.setPaintProperty(this.id, key as PaintKey, value as maplibregl.AllPaintProperties[PaintKey]);
		this.paint[key] = value;
	}

	updateLayout(obj: T['layout']): void;
	updateLayout<K extends keyof T['layout'], V extends T['layout'][K]>(key: K, value: V): void;
	updateLayout<K extends keyof T['layout'], V extends T['layout'][K]>(arg1: K | T['layout'], arg2?: V) {
		if (typeof arg1 === 'string') {
			if (this.layout[arg1] == arg2) return;
			this.map.setLayoutProperty(this.id, arg1 as LayoutKey, arg2 as maplibregl.AllLayoutProperties[LayoutKey]);
			if (arg2 == null) {
				delete this.layout[arg1];
			} else {
				this.layout[arg1 as K] = arg2;
			}
		} else if (typeof arg1 === 'object') {
			for (const [key, value] of Object.entries(arg1)) {
				this.updateLayout(key as K, value as V);
			}
		}
	}

	destroy(): void {
		for (const [event, handler] of this.mapListeners) this.map.off(event, this.id, handler);
		this.mapListeners = [];
		this.eventHandlers.clear();

		// The layer may be destroyed while hovered (e.g. on undo), which would leave the cursor stuck
		const manager = this.manager;
		if (manager.isInteractive()) {
			manager.cursor.toggleHover(this.id, false);
			manager.cursor.toggleGrab(this.id, false);
		}

		this.map.removeLayer(this.id);
	}

	abstract getState(): StateStyle | undefined;
}
