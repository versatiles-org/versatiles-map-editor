import { Popup, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import { get } from 'svelte/store';
import type { AbstractElement } from './element/abstract.js';
import type { GeometryManager } from './geometry_manager.js';
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

	constructor(manager: GeometryManager) {
		this.manager = manager;
		const map = manager.map;
		map.on('click', (e) => this.open(e));
		map.on('mousemove', (e) => this.hover(this.elementAt(e.point)));
		map.on('mouseout', () => this.hover(undefined));
	}

	/** The topmost element with a popup at the point. */
	private elementAt({ x, y }: { x: number; y: number }): AbstractElement | undefined {
		const elements = get(this.manager.elements).filter((element) => get(element.popup).trim());
		if (elements.length === 0) return undefined;

		const features = this.manager.map.queryRenderedFeatures(
			[
				[x - TOLERANCE, y - TOLERANCE],
				[x + TOLERANCE, y + TOLERANCE]
			],
			{ layers: elements.flatMap((element) => element.getLayerIds()) }
		);
		for (const feature of features) {
			const element = elements.find((e) => e.sourceId === feature.source);
			if (element) return element;
		}
		return undefined;
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
