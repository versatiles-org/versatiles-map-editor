import type { MapState } from '@versatiles/map-state';

/**
 * A map as a link for viewing holds it: without what only its author needs, which would make the
 * link longer for nothing. The title, which the viewer would only show in the tab of the browser;
 * the color scheme of the color picker; and a legend that shared maps do not show (with where it
 * is not shown). A map is passed on for editing as a file, which has all of it.
 */
export function sharedState(state: MapState): MapState {
	if (!state.meta) return state;
	const { title: _title, colorScheme: _colorScheme, ...meta } = state.meta;
	if (meta.viewer?.legend === 'none') {
		delete meta.legend;
		const { legend: _legend, ...viewer } = meta.viewer;
		if (Object.keys(viewer).length > 0) meta.viewer = viewer;
		else delete meta.viewer;
	}
	const { meta: _meta, ...rest } = state;
	return Object.keys(meta).length > 0 ? { ...rest, meta } : rest;
}
