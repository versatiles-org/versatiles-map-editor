import * as maplibre from 'maplibre-gl';
import type { StateLegend } from '@versatiles/map-state';

export type LegendPosition = NonNullable<StateLegend['position']>;
export type AttributionCorner = 'bottom-left' | 'bottom-right';

/** The measured sizes of the overlays, in pixels. */
export interface OverlaySizes {
	/** The width of the map between the bars, without the margins at the sides and between two controls. */
	freeWidth: number;
	legendWidth: number;
	searchWidth: number;
	/** The width of the attribution, which changes when it is expanded or collapsed. */
	attributionWidth: number;
	/** The height of the search and the hint at the top; 0 if neither is shown. */
	topOverlaysHeight: number;
	/** Whether the hint of the viewer is shown, at the center and nearly as wide as the map. */
	hint: boolean;
}

export interface OverlayLayout {
	/** Whether the search is at the right, instead of the left. */
	searchRight: boolean;
	attributionCorner: AttributionCorner;
	/** Whether the legend goes below the search and the hint, since it would cover them. */
	legendBelowOverlays: boolean;
	/** Whether the legend goes above the attribution, e.g. while that is expanded. */
	legendAboveAttribution: boolean;
}

/**
 * Where the overlays of the map go. The legend keeps its corner: the search and the attribution
 * go to the other side. Only if they do not fit side by side, the legend moves out of their way.
 * Without a legend (`position` undefined), everything is at its default place.
 */
export function layoutOverlays(position: LegendPosition | undefined, sizes: OverlaySizes): OverlayLayout {
	const { freeWidth, legendWidth } = sizes;
	/** Whether the legend and a control at the side of the legend's position do not fit side by side. */
	function collide(width: number): boolean {
		// a legend at the center reaches half of its width to each side
		const centered = position === 'top' || position === 'bottom';
		return centered ? legendWidth / 2 + width > freeWidth / 2 : legendWidth + width > freeWidth;
	}
	const top = position?.startsWith('top') === true;
	const bottom = position?.startsWith('bottom') === true;
	return {
		searchRight: position === 'top-left',
		attributionCorner: position === 'bottom-left' ? 'bottom-right' : 'bottom-left',
		legendBelowOverlays: sizes.topOverlaysHeight > 0 && top && (sizes.hint || collide(sizes.searchWidth)),
		legendAboveAttribution: bottom && collide(sizes.attributionWidth)
	};
}

/** The width of the attribution, and the height from the bottom of the map to its top. */
export interface AttributionSize {
	width: number;
	top: number;
}

/**
 * Add the attribution of the map in a corner, and report its size whenever it changes: when it
 * is expanded or collapsed, or gets other sources. Returns a function that removes it again.
 */
export function addAttribution(
	map: maplibre.Map,
	corner: AttributionCorner,
	onResize: (size: AttributionSize) => void
): () => void {
	const attribution = new maplibre.AttributionControl({ compact: true });
	map.addControl(attribution, corner);
	const remove = () => {
		if (map.hasControl(attribution)) map.removeControl(attribution);
	};
	const element = map.getContainer().querySelector<HTMLElement>('.maplibregl-ctrl-attrib');
	if (!element) return remove;
	const observer = new ResizeObserver(() => {
		const container = map.getContainer().getBoundingClientRect();
		const box = element.getBoundingClientRect();
		onResize({ width: box.width, top: container.bottom - box.top });
	});
	observer.observe(element);
	return () => {
		observer.disconnect();
		remove();
	};
}
