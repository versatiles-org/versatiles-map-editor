import { Popup, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import { get } from 'svelte/store';
import type { AbstractElement } from './element/abstract.js';
import { indexElements, type ElementIndex, type GeometryManager } from './geometry_manager.js';
import { renderPopupText } from '$lib/utils/popup_text.js';

// Tolerance in pixels around the pointer, so thin lines are easier to hit, especially with a finger
const TOLERANCE = 4;

/**
 * Popups of the elements in the viewer: a click or tap on an element opens its popup,
 * a click elsewhere closes it. Elements with a popup are highlighted under the mouse.
 * There are no hover tooltips, since they would not work on touch devices.
 */
export class PopupHandler {
	private readonly manager: GeometryManager;
	private popup: Popup | undefined;
	private hovered: AbstractElement | undefined;
	// The elements with a popup, prepared once instead of on every mouse move
	private candidates: ElementIndex | undefined;
	private readonly withPopup = new Set<AbstractElement>();
	private unsubscribePopups: (() => void)[] = [];
	// The last mouse position, handled once per frame
	private pointer: { x: number; y: number } | undefined;
	private frame: number | undefined;

	constructor(manager: GeometryManager) {
		this.manager = manager;
		const map = manager.map;
		manager.elements.subscribe((elements) => this.watchPopups(elements));
		map.on('click', (e) => this.open(e));
		map.on('mousemove', (e) => this.scheduleHover(e.point));
		map.on('mouseout', () => {
			this.pointer = undefined;
			this.hover(undefined);
		});
	}

	/** Keep track of the elements with a popup text. */
	private watchPopups(elements: AbstractElement[]) {
		this.unsubscribePopups.forEach((unsubscribe) => unsubscribe());
		this.withPopup.clear();
		this.unsubscribePopups = elements.map((element) =>
			element.popup.subscribe((text) => {
				if (text.trim()) this.withPopup.add(element);
				else this.withPopup.delete(element);
				this.candidates = undefined;
			})
		);
		this.candidates = undefined;
	}

	/** The topmost element with a popup at the point. */
	private elementAt(point: { x: number; y: number }): AbstractElement | undefined {
		this.candidates ??= indexElements([...this.withPopup]);
		return this.manager.elementAt(point, TOLERANCE, this.candidates);
	}

	private scheduleHover(point: { x: number; y: number }) {
		this.pointer = point;
		this.frame ??= requestAnimationFrame(() => {
			this.frame = undefined;
			if (this.pointer) this.hover(this.elementAt(this.pointer));
		});
	}

	private open(e: MapMouseEvent) {
		// A click elsewhere is closed by maplibre (closeOnClick)
		const element = this.elementAt(e.point);
		if (!element) return;

		this.popup?.remove();
		const content = document.createElement('div');
		content.className = 'element-popup';
		content.append(renderPopupText(get(element.popup)));
		this.popup = new Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(this.manager.map);
	}

	private hover(element: AbstractElement | undefined) {
		if (element === this.hovered) return;
		this.hovered = element;
		const map = this.manager.map;
		map.getCanvasContainer().style.cursor = element ? 'pointer' : '';
		map.getSource<GeoJSONSource>('highlight')?.setData({
			type: 'FeatureCollection',
			features: element ? [element.getFeature()] : []
		});
	}
}
