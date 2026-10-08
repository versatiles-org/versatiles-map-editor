import * as maplibre from 'maplibre-gl';
import type { Action } from 'svelte/action';
import type { LEGEND_POSITIONS } from '@versatiles/map-state';

export type LegendPosition = (typeof LEGEND_POSITIONS)[number];
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type AttributionCorner = 'bottom-left' | 'bottom-right';

export const CORNERS: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

export function isCorner(position: string | undefined): position is Corner {
	return (CORNERS as (string | undefined)[]).includes(position);
}

/**
 * The order of the controls in a corner, from its edge inwards: at the top the search, the
 * buttons for zooming, the editor's button that shows all elements, and the legend; at the bottom
 * the attribution, the buttons and the legend.
 */
export const CONTROL_ORDER = { search: 0, attribution: 0, navigation: 1, fit: 2, legend: 3 };

/** The size of the controls in a corner, with their margins. */
export interface StackSize {
	width: number;
	height: number;
}

/** The measured sizes of the overlays, in pixels. */
export interface OverlaySizes {
	/** The width of the map between the bars, without the margins at the sides. */
	freeWidth: number;
	legendWidth: number;
	/** The controls in each corner. */
	stacks: Record<Corner, StackSize>;
}

/** Where the overlays are: the legend, the buttons for zooming and the search, if they are shown. */
export interface OverlayPlaces {
	legend?: LegendPosition;
	navigation?: Corner;
	search?: Corner;
}

export interface OverlayLayout {
	/** The bottom corner of the attribution: one that nothing else takes, the left one if both are free. */
	attributionCorner: AttributionCorner;
	/**
	 * How far a legend at the center of the top or the bottom moves inwards, past the controls of
	 * the corners beside it, if they do not fit side by side. 0 for other legends.
	 */
	legendOffset: number;
}

/**
 * Where the attribution goes, and how far a legend at the top or bottom center moves out of the
 * way of the controls in the corners. The controls in a corner are stacked, see `CONTROL_ORDER`.
 */
export function layoutOverlays(places: OverlayPlaces, sizes: OverlaySizes): OverlayLayout {
	const taken = new Set([places.legend, places.navigation]);
	const attributionCorner: AttributionCorner =
		taken.has('bottom-left') && !taken.has('bottom-right') ? 'bottom-right' : 'bottom-left';

	let legendOffset = 0;
	if (places.legend === 'top' || places.legend === 'bottom') {
		const [left, right] = [sizes.stacks[`${places.legend}-left`], sizes.stacks[`${places.legend}-right`]];
		// a legend at the center reaches half of its width to each side
		const collide = sizes.legendWidth / 2 + Math.max(left.width, right.width) > sizes.freeWidth / 2;
		if (collide) legendOffset = Math.max(left.height, right.height);
	}
	return { attributionCorner, legendOffset };
}

/** A control of MapLibre at its place in the order of the controls of its corner. */
function ordered(control: maplibre.IControl, order: number): maplibre.IControl {
	return {
		onAdd(map) {
			const element = control.onAdd(map);
			element.style.order = String(order);
			return element;
		},
		onRemove(map) {
			control.onRemove(map);
		}
	};
}

/** Add a control of MapLibre to a corner. Returns a function that removes it again. */
function addOrdered(map: maplibre.Map, control: maplibre.IControl, corner: Corner, order: number): () => void {
	const placed = ordered(control, order);
	map.addControl(placed, corner);
	return () => {
		if (map.hasControl(placed)) map.removeControl(placed);
	};
}

/** The label of the compass, which turns the map back. */
export const COMPASS_LABEL = 'Reset rotation and tilt';

/**
 * Add the buttons for zooming in and out in a corner. With `reset` also a compass, for a map that
 * can be turned or is turned: it shows the rotation and the tilt, and a click calls `reset`, e.g.
 * to turn the map back to where it started. `fade`: the compass is faded while the map is not
 * turned (the class `compass-idle`), for a compass that is always there. Returns a function that
 * removes them again.
 */
export function addNavigation(
	map: maplibre.Map,
	corner: Corner,
	reset?: () => void,
	{ fade = false }: { fade?: boolean } = {}
): () => void {
	const control = new maplibre.NavigationControl({ showCompass: !!reset, visualizePitch: true });
	if (!reset) return addOrdered(map, control, corner, CONTROL_ORDER.navigation);
	let compass: HTMLButtonElement | null = null;
	const update = () => compass?.classList.toggle('compass-idle', !map.getBearing() && !map.getPitch());
	const withReset: maplibre.IControl = {
		onAdd(map) {
			const element = control.onAdd(map);
			compass = element.querySelector<HTMLButtonElement>('.maplibregl-ctrl-compass');
			if (compass && fade) {
				update();
				map.on('rotate', update);
				map.on('pitch', update);
			}
			if (compass) {
				compass.title = COMPASS_LABEL;
				compass.setAttribute('aria-label', COMPASS_LABEL);
				// before the button's own click, which would turn the map to the north
				compass.addEventListener(
					'click',
					(event) => {
						event.stopPropagation();
						reset();
					},
					{ capture: true }
				);
			}
			return element;
		},
		onRemove() {
			map.off('rotate', update);
			map.off('pitch', update);
			control.onRemove();
		}
	};
	return addOrdered(map, withReset, corner, CONTROL_ORDER.navigation);
}

/**
 * Add the attribution of the map in a bottom corner. Returns a function that removes it again.
 *
 * MapLibre shows its text at first, and only its button once the map is moved. On a narrow map the
 * text can reach from its corner to what is in the other one: so it starts as the button alone
 * whenever its text would cover the element that `beside` returns, e.g. the legend. A click on the
 * button still shows the text, which then stays as its reader left it.
 */
export function addAttribution(
	map: maplibre.Map,
	corner: AttributionCorner,
	beside?: () => Element | null | undefined
): () => void {
	const control = new maplibre.AttributionControl({ compact: true });
	if (!beside) return addOrdered(map, control, corner, CONTROL_ORDER.attribution);

	let element: HTMLElement | undefined;
	// whether the reader opened or closed the text, which is then left alone
	let chosen = false;
	const choose = () => (chosen = true);
	const check = () => {
		const other = beside();
		if (chosen || !element || !other || !element.classList.contains('maplibregl-compact-show')) return;
		const [a, b] = [element.getBoundingClientRect(), other.getBoundingClientRect()];
		const covers = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
		if (!covers) return;
		// as MapLibre does when the map is moved
		element.classList.remove('maplibregl-compact-show');
		element.removeAttribute('open');
	};
	const remove = addOrdered(
		map,
		{
			onAdd(map) {
				element = control.onAdd(map);
				element.addEventListener('click', choose);
				return element;
			},
			onRemove() {
				element?.removeEventListener('click', choose);
				control.onRemove();
			}
		},
		corner,
		CONTROL_ORDER.attribution
	);
	// the text comes with the sources of the map, and the map can get narrower
	map.on('idle', check);
	map.on('resize', check);
	return () => {
		map.off('idle', check);
		map.off('resize', check);
		remove();
	};
}

/**
 * Show the element as a control in a corner of the map, stacked with the others there, e.g. the
 * search or a legend. The element must not be at the top of a block of Svelte, which would
 * remove the siblings it has in the corner: it is wrapped in an element of its own.
 */
export const cornerControl: Action<HTMLElement, { map: maplibre.Map; corner: Corner; order: number }> = (
	node,
	params
) => {
	let remove = add(params);
	function add({ map, corner, order }: typeof params) {
		const control: maplibre.IControl = { onAdd: () => node, onRemove: () => node.remove() };
		node.classList.add('maplibregl-ctrl');
		return addOrdered(map, control, corner, order);
	}
	return {
		update(next) {
			remove();
			remove = add(next);
		},
		destroy() {
			remove();
		}
	};
};
