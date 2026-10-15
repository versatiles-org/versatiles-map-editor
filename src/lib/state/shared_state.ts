import type { MapState } from '@versatiles/map-state';

/** What a link for viewing holds of a map, as its author chooses it in the share dialog. */
export interface SharedOptions {
	/** Whether the elements keep their popups; without them the link is shorter. Default: true. */
	popups?: boolean;
}

/**
 * A map as a link for viewing holds it: without what only its author needs, which would make the
 * link longer for nothing. The title, which the viewer would only show in the tab of the browser;
 * the color scheme of the color picker; and a legend that shared maps do not show (with where it
 * is not shown). Without its popups, if its author leaves them out. A map is passed on for editing
 * as a file, which has all of it.
 */
export function sharedState(state: MapState, { popups = true }: SharedOptions = {}): MapState {
	const elements = popups
		? state.elements
		: state.elements.map((element) => {
				if (!element.popup) return element;
				const { popup: _popup, ...rest } = element;
				return rest;
			});
	const { meta: _meta, ...rest } = { ...state, elements };
	if (!state.meta) return rest;
	const { title: _title, colorScheme: _colorScheme, ...meta } = state.meta;
	if (meta.viewer?.legend === 'none') {
		delete meta.legend;
		const { legend: _legend, ...viewer } = meta.viewer;
		if (Object.keys(viewer).length > 0) meta.viewer = viewer;
		else delete meta.viewer;
	}
	return Object.keys(meta).length > 0 ? { ...rest, meta } : rest;
}

/** Whether any element of the map has a popup, which its link can leave out. */
export function hasPopups(state: MapState): boolean {
	return state.elements.some((element) => element.popup !== undefined);
}
