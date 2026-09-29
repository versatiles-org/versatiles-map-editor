import { Popup, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import type { AbstractElement } from '../element/abstract.svelte.js';
import type { MapDocument } from '../map_document.svelte.js';
import { indexElements, type ElementIndex } from '../rendering/index.js';
import { renderPopupText } from '../popup_text.js';

// Tolerance in pixels around the pointer, so thin lines are easier to hit, especially with a finger
const TOLERANCE = 4;

/**
 * Popups of the elements in the viewer: a click or tap on an element opens its popup,
 * a click elsewhere closes it. Elements with a popup are highlighted under the mouse.
 * There are no hover tooltips, since they would not work on touch devices.
 */
export class PopupHandler {
	private readonly doc: MapDocument;
	private popup: Popup | undefined;
	private hovered: AbstractElement | undefined;
	// The elements with a popup, prepared once per change instead of on every mouse move
	readonly #candidates: ElementIndex;
	// The last mouse position, handled once per frame
	private pointer: { x: number; y: number } | undefined;
	private frame: number | undefined;

	constructor(doc: MapDocument) {
		this.doc = doc;
		this.#candidates = $derived(indexElements(doc.elements.filter((element) => element.popup.trim())));
		const map = doc.view.map;
		map.on('click', (e) => this.open(e));
		map.on('mousemove', (e) => this.scheduleHover(e.point));
		map.on('mouseout', () => {
			this.pointer = undefined;
			this.hover(undefined);
		});
	}

	/** The topmost element with a popup at the point. */
	private elementAt(point: { x: number; y: number }): AbstractElement | undefined {
		return this.doc.elementAt(point, TOLERANCE, this.#candidates);
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
		content.append(renderPopupText(element.popup));
		this.popup = new Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(this.doc.view.map);
	}

	private hover(element: AbstractElement | undefined) {
		if (element === this.hovered) return;
		this.hovered = element;
		const map = this.doc.view.map;
		map.getCanvasContainer().style.cursor = element ? 'pointer' : '';
		map.getSource<GeoJSONSource>('highlight')?.setData({
			type: 'FeatureCollection',
			features: element ? [element.getFeature()] : []
		});
	}
}
